import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整')
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('id,role,is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.is_active || profile.role !== 'supervisor') {
      return NextResponse.json({ error: '只有主管可以查看違規即時通知。' }, { status: 403 })
    }

    const db = admin()
    const { data, error } = await db
      .from('violation_parking_cases')
      .select(`
        id,
        parking_lot_id,
        case_type,
        reserved_type,
        vehicle_plate,
        location_text,
        start_date,
        notes,
        status,
        supervisor_status,
        supervisor_seen_at,
        handled_at,
        created_at,
        parking_lots (name),
        violation_parking_photos (
          id,
          photo_type,
          photo_date,
          storage_path,
          file_name,
          uploaded_at
        )
      `)
      .in('supervisor_status', ['pending', 'seen', 'reported'])
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      return NextResponse.json(
        { error: `違規通知讀取失敗：${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '違規通知讀取失敗。' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,role,is_active')
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
        { error: '只有主管可以永久刪除違規案件。' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const id = String(body?.id || '').trim()

    if (!id) {
      return NextResponse.json({ error: '缺少違規案件 ID。' }, { status: 400 })
    }

    const db = admin()

    const { data: caseRow, error: caseError } = await db
      .from('violation_parking_cases')
      .select(`
        id,
        parking_lot_id,
        case_type,
        reserved_type,
        vehicle_plate,
        location_text,
        start_date,
        notes,
        supervisor_status,
        created_by,
        created_at
      `)
      .eq('id', id)
      .maybeSingle()

    if (caseError) {
      return NextResponse.json(
        { error: `案件讀取失敗：${caseError.message}` },
        { status: 500 }
      )
    }

    if (!caseRow) {
      return NextResponse.json({ error: '找不到違規案件，可能已被刪除。' }, { status: 404 })
    }

    const { data: photos, error: photoReadError } = await db
      .from('violation_parking_photos')
      .select('id,storage_path,file_name,photo_type,photo_date')
      .eq('case_id', id)

    if (photoReadError) {
      return NextResponse.json(
        { error: `照片資料讀取失敗：${photoReadError.message}` },
        { status: 500 }
      )
    }

    const photoRows = photos || []
    const storagePaths = Array.from(
      new Set(
        photoRows
          .map((photo: any) => String(photo.storage_path || '').trim())
          .filter(Boolean)
      )
    )

    // 先清 Storage；若 Storage 刪除失敗，保留資料庫案件讓主管可以重試，
    // 避免資料庫已刪除但 Storage 留下孤兒檔案。
    if (storagePaths.length > 0) {
      const { error: storageError } = await db.storage
        .from('violation-parking')
        .remove(storagePaths)

      if (storageError) {
        return NextResponse.json(
          {
            error: `照片 Storage 刪除失敗，案件尚未刪除，可稍後重試：${storageError.message}`,
          },
          { status: 500 }
        )
      }
    }

    const { error: photoDeleteError } = await db
      .from('violation_parking_photos')
      .delete()
      .eq('case_id', id)

    if (photoDeleteError) {
      return NextResponse.json(
        {
          error: `照片資料庫紀錄刪除失敗：${photoDeleteError.message}`,
        },
        { status: 500 }
      )
    }

    const { error: caseDeleteError } = await db
      .from('violation_parking_cases')
      .delete()
      .eq('id', id)

    if (caseDeleteError) {
      return NextResponse.json(
        {
          error: `違規案件資料庫紀錄刪除失敗：${caseDeleteError.message}`,
        },
        { status: 500 }
      )
    }

    // 案件本體刪除後，稽核紀錄仍保留案件摘要，方便日後追查誰刪除了重複資料。
    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: caseRow.parking_lot_id || null,
        action: 'VIOLATION_CASE_PERMANENTLY_DELETED',
        entity_type: 'violation_parking_case',
        entity_id: id,
        detail: {
          reason: 'supervisor_manual_cleanup',
          case_type: caseRow.case_type,
          reserved_type: caseRow.reserved_type,
          vehicle_plate: caseRow.vehicle_plate,
          location_text: caseRow.location_text,
          start_date: caseRow.start_date,
          supervisor_status: caseRow.supervisor_status,
          created_by: caseRow.created_by,
          created_at: caseRow.created_at,
          deleted_photo_count: photoRows.length,
          deleted_storage_count: storagePaths.length,
        },
      })
    } catch {
      // 稽核紀錄失敗不回復已完成的主要刪除。
    }

    return NextResponse.json({
      ok: true,
      deletedCaseId: id,
      deletedPhotos: photoRows.length,
      deletedStorageObjects: storagePaths.length,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '違規案件刪除失敗。' },
      { status: 500 }
    )
  }
}
