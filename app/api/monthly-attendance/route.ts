import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('伺服器環境變數未設定完整')
  }

  return createAdminClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function currentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      supabase,
      user: null,
      profile: null,
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  return {
    supabase,
    user,
    profile,
  }
}

function canUseAttendance(role: string | null | undefined) {
  return ['supervisor', 'manager'].includes(String(role || ''))
}

async function canAccessLot(
  supabase: any,
  userId: string,
  role: string,
  lotId: string
) {
  if (role === 'supervisor') {
    return true
  }

  const { data, error } = await supabase
    .from('user_parking_lots')
    .select('parking_lot_id')
    .eq('user_id', userId)
    .eq('parking_lot_id', lotId)
    .limit(1)

  if (error) {
    throw new Error(`停車場權限確認失敗：${error.message}`)
  }

  return Boolean(data?.length)
}

export async function GET(request: Request) {
  try {
    const { supabase, user, profile } = await currentUser()

    if (!user) {
      return NextResponse.json(
        { error: '登入狀態已失效。' },
        { status: 401 }
      )
    }

    if (!profile?.is_active || !canUseAttendance(profile.role)) {
      return NextResponse.json(
        { error: '此帳號沒有簽到表讀取權限。' },
        { status: 403 }
      )
    }

    const url = new URL(request.url)
    const action = String(url.searchParams.get('action') || '').trim()
    const id = String(url.searchParams.get('id') || '').trim()
    const lotId = String(url.searchParams.get('lot') || '').trim()
    const db = admin()

    if (action === 'preview') {
      if (!id) {
        return NextResponse.json(
          { error: '缺少簽到表 ID。' },
          { status: 400 }
        )
      }

      const { data: row, error: rowError } = await db
        .from('monthly_attendance_sheets')
        .select('id, parking_lot_id, storage_path, file_name')
        .eq('id', id)
        .maybeSingle()

      if (rowError || !row) {
        return NextResponse.json(
          { error: rowError?.message || '找不到這份簽到表。' },
          { status: 404 }
        )
      }

      const allowed = await canAccessLot(
        supabase,
        user.id,
        String(profile.role),
        row.parking_lot_id
      )

      if (!allowed) {
        return NextResponse.json(
          { error: '沒有此停車場的操作權限。' },
          { status: 403 }
        )
      }

      const { data, error } = await db.storage
        .from('monthly-attendance')
        .createSignedUrl(row.storage_path, 60 * 10)

      if (error || !data?.signedUrl) {
        return NextResponse.json(
          { error: error?.message || '簽到表預覽網址建立失敗。' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        ok: true,
        fileName: row.file_name,
        signedUrl: data.signedUrl,
      })
    }

    if (!lotId) {
      return NextResponse.json({ rows: [] })
    }

    const allowed = await canAccessLot(
      supabase,
      user.id,
      String(profile.role),
      lotId
    )

    if (!allowed) {
      return NextResponse.json(
        { error: '沒有此停車場的操作權限。' },
        { status: 403 }
      )
    }

    const { data, error } = await db
      .from('monthly_attendance_sheets')
      .select(`
        id,
        parking_lot_id,
        attendance_month,
        file_name,
        mime_type,
        file_size,
        uploaded_by,
        uploaded_at,
        updated_at
      `)
      .eq('parking_lot_id', lotId)
      .order('attendance_month', { ascending: false })
      .order('uploaded_at', { ascending: false })
      .limit(200)

    if (error) {
      return NextResponse.json(
        { error: `簽到表讀取失敗：${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ rows: data || [] })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '簽到表讀取失敗。' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user, profile } = await currentUser()

    if (!user) {
      return NextResponse.json(
        { error: '登入狀態已失效。' },
        { status: 401 }
      )
    }

    if (!profile?.is_active || !canUseAttendance(profile.role)) {
      return NextResponse.json(
        { error: '此帳號沒有簽到表刪除權限。' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const id = String(body?.id || '').trim()

    if (!id) {
      return NextResponse.json(
        { error: '缺少簽到表 ID。' },
        { status: 400 }
      )
    }

    const db = admin()
    const { data: row, error: rowError } = await db
      .from('monthly_attendance_sheets')
      .select(`
        id,
        parking_lot_id,
        attendance_month,
        storage_path,
        file_name,
        file_size,
        uploaded_by,
        uploaded_at
      `)
      .eq('id', id)
      .maybeSingle()

    if (rowError || !row) {
      return NextResponse.json(
        { error: rowError?.message || '找不到這份簽到表。' },
        { status: 404 }
      )
    }

    const allowed = await canAccessLot(
      supabase,
      user.id,
      String(profile.role),
      row.parking_lot_id
    )

    if (!allowed) {
      return NextResponse.json(
        { error: '沒有此停車場的操作權限。' },
        { status: 403 }
      )
    }

    const { error: deleteError } = await db
      .from('monthly_attendance_sheets')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json(
        { error: `簽到表紀錄刪除失敗：${deleteError.message}` },
        { status: 500 }
      )
    }

    let storageWarning = ''

    if (row.storage_path) {
      const { error: storageError } = await db.storage
        .from('monthly-attendance')
        .remove([row.storage_path])

      if (storageError) {
        storageWarning = `資料庫紀錄已刪除，但 Storage 檔案清除失敗：${storageError.message}`
      }
    }

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: row.parking_lot_id,
        action: 'MONTHLY_ATTENDANCE_DELETE',
        entity_type: 'monthly_attendance_sheets',
        entity_id: row.id,
        detail: {
          attendance_month: row.attendance_month,
          file_name: row.file_name,
          file_size: row.file_size,
          storage_path: row.storage_path,
          storage_warning: storageWarning || null,
        },
      })
    } catch {
      // 刪除本身已完成；紀錄 log 失敗不回滾。
    }

    return NextResponse.json({
      ok: true,
      warning: storageWarning || null,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '簽到表刪除失敗。' },
      { status: 500 }
    )
  }
}
