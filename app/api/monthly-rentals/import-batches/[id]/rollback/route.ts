// PHASE35_FULL_REWRITE_V6
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

function createAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('伺服器環境變數未設定完整')
  }

  return createAdminClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: '登入狀態已失效。' },
        { status: 401 }
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role,is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json(
        { error: `權限讀取失敗：${profileError.message}` },
        { status: 500 }
      )
    }

    if (!profile?.is_active || profile.role !== 'supervisor') {
      return NextResponse.json(
        { error: '只有主管可以執行資料回復。' },
        { status: 403 }
      )
    }

    const { id: batchId } = await context.params

    if (!batchId) {
      return NextResponse.json(
        { error: '缺少匯入批次 ID。' },
        { status: 400 }
      )
    }

    const db = createAdmin()

    const { data: batch, error: batchError } = await db
      .from('monthly_import_batches')
      .select(
        'id,parking_lot_id,file_name,status,inserted_rows,updated_rows,cancelled_rows'
      )
      .eq('id', batchId)
      .maybeSingle()

    if (batchError) {
      return NextResponse.json(
        { error: `匯入批次讀取失敗：${batchError.message}` },
        { status: 500 }
      )
    }

    if (!batch) {
      return NextResponse.json(
        { error: '找不到這筆匯入批次資料。' },
        { status: 404 }
      )
    }

    if (batch.status !== 'completed') {
      return NextResponse.json(
        { error: '這一筆匯入目前不能回復，可能已撤銷或尚未完成。' },
        { status: 400 }
      )
    }

    const { data: snapshots, error: snapshotError } = await db
      .from('monthly_import_snapshots')
      .select(`
        id,
        batch_id,
        parking_lot_id,
        monthly_rental_id,
        action_type,
        customer_code,
        customer_name,
        phone,
        vehicle_plate,
        vehicle_type,
        rental_type,
        start_date,
        end_date,
        monthly_fee,
        payment_status,
        rental_status,
        payment_date,
        invoice_number,
        notes,
        created_at
      `)
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false })

    if (snapshotError) {
      return NextResponse.json(
        { error: `資料回復快照讀取失敗：${snapshotError.message}` },
        { status: 500 }
      )
    }

    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json(
        {
          error:
            '這筆匯入批次沒有可回復快照。舊版若匯入時未建立 monthly_import_snapshots，就無法安全自動還原。',
        },
        { status: 400 }
      )
    }

    let restoredCount = 0

    for (const snapshot of snapshots) {
      if (
        snapshot.action_type === 'insert' ||
        !snapshot.monthly_rental_id
      ) {
        continue
      }

      const { error: restoreError } = await db
        .from('monthly_rentals')
        .update({
          customer_code: snapshot.customer_code,
          customer_name: snapshot.customer_name,
          phone: snapshot.phone,
          vehicle_plate: snapshot.vehicle_plate,
          vehicle_type: snapshot.vehicle_type,
          rental_type: snapshot.rental_type,
          start_date: snapshot.start_date,
          end_date: snapshot.end_date,
          monthly_fee: snapshot.monthly_fee,
          payment_status: snapshot.payment_status,
          rental_status: snapshot.rental_status,
          payment_date: snapshot.payment_date,
          invoice_number: snapshot.invoice_number,
          notes: snapshot.notes,
          last_import_batch_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', snapshot.monthly_rental_id)

      if (restoreError) {
        return NextResponse.json(
          { error: `恢復月租資料失敗：${restoreError.message}` },
          { status: 500 }
        )
      }

      restoredCount++
    }

    const insertedIds = snapshots
      .filter(
        (snapshot) =>
          snapshot.action_type === 'insert' &&
          Boolean(snapshot.monthly_rental_id)
      )
      .map((snapshot) => snapshot.monthly_rental_id as string)

    if (insertedIds.length > 0) {
      const { error: deleteInsertedError } = await db
        .from('monthly_rentals')
        .delete()
        .in('id', insertedIds)

      if (deleteInsertedError) {
        return NextResponse.json(
          { error: `刪除本次新增資料失敗：${deleteInsertedError.message}` },
          { status: 500 }
        )
      }
    }

    const { error: deleteChangesError } = await db
      .from('monthly_rental_changes')
      .delete()
      .eq('import_batch_id', batchId)

    if (deleteChangesError) {
      return NextResponse.json(
        { error: `移除本次簽約異動失敗：${deleteChangesError.message}` },
        { status: 500 }
      )
    }

    const { error: batchUpdateError } = await db
      .from('monthly_import_batches')
      .update({
        status: 'rolled_back',
        rolled_back_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    if (batchUpdateError) {
      return NextResponse.json(
        { error: `更新匯入批次狀態失敗：${batchUpdateError.message}` },
        { status: 500 }
      )
    }

    // 稽核紀錄不是主要流程。Supabase query builder 為 PromiseLike，
    // 不使用 `.then(...).catch(...)`，避免 Next.js / TypeScript Build 錯誤。
    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: batch.parking_lot_id || null,
        action: 'MONTHLY_IMPORT_ROLLBACK',
        entity_type: 'monthly_import_batch',
        entity_id: batchId,
        detail: {
          file_name: batch.file_name,
          snapshots: snapshots.length,
          restored: restoredCount,
          inserted_deleted: insertedIds.length,
        },
      })
    } catch {
      // 稽核寫入失敗不阻止資料回復完成。
    }

    return NextResponse.json({
      ok: true,
      restored: restoredCount,
      deleted: insertedIds.length,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '資料回復失敗。' },
      { status: 500 }
    )
  }
}
