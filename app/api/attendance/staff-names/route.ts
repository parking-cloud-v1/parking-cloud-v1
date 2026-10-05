import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('伺服器環境變數未設定完整')
  }

  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function authProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_active || !['supervisor', 'manager'].includes(profile.role)) {
    return {
      error: NextResponse.json(
        { error: '此帳號沒有簽到表名單權限。' },
        { status: 403 }
      ),
    }
  }

  return { supabase, user, profile }
}

export async function GET(request: Request) {
  try {
    const auth = await authProfile()
    if ('error' in auth) return auth.error

    const { supabase, user, profile } = auth
    const url = new URL(request.url)
    const lotId = String(url.searchParams.get('lot') || '').trim()

    if (!lotId) {
      return NextResponse.json({ rows: [] })
    }

    if (profile.role === 'manager') {
      const { data: assignment } = await supabase
        .from('user_parking_lots')
        .select('parking_lot_id')
        .eq('user_id', user.id)
        .eq('parking_lot_id', lotId)
        .maybeSingle()

      if (!assignment) {
        return NextResponse.json(
          { error: '沒有此停車場的操作權限。' },
          { status: 403 }
        )
      }
    }

    const db = admin()
    const { data, error } = await db
      .from('attendance_staff_names')
      .select('id,parking_lot_id,name,is_active')
      .eq('parking_lot_id', lotId)
      .eq('is_active', true)
      .order('name')

    if (error) {
      return NextResponse.json(
        { error: `管理員姓名讀取失敗：${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ rows: data || [] })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '管理員姓名讀取失敗。' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authProfile()
    if ('error' in auth) return auth.error

    const { user, profile } = auth

    if (profile.role !== 'supervisor') {
      return NextResponse.json(
        { error: '只有主管可以設定管理員姓名。' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const parkingLotId = String(body?.parkingLotId || '').trim()
    const name = String(body?.name || '').trim()

    if (!parkingLotId || !name) {
      return NextResponse.json(
        { error: '請選擇停車場並輸入管理員姓名。' },
        { status: 400 }
      )
    }

    if (name.length > 50) {
      return NextResponse.json(
        { error: '管理員姓名不可超過 50 個字。' },
        { status: 400 }
      )
    }

    const db = admin()

    const { data: existing } = await db
      .from('attendance_staff_names')
      .select('id,is_active')
      .eq('parking_lot_id', parkingLotId)
      .eq('name', name)
      .maybeSingle()

    if (existing) {
      const { data, error } = await db
        .from('attendance_staff_names')
        .update({
          is_active: true,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id,parking_lot_id,name,is_active')
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, row: data })
    }

    const { data, error } = await db
      .from('attendance_staff_names')
      .insert({
        parking_lot_id: parkingLotId,
        name,
        is_active: true,
        created_by: user.id,
        updated_by: user.id,
      })
      .select('id,parking_lot_id,name,is_active')
      .single()

    if (error) {
      return NextResponse.json(
        { error: `新增管理員姓名失敗：${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, row: data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '新增管理員姓名失敗。' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authProfile()
    if ('error' in auth) return auth.error

    const { user, profile } = auth

    if (profile.role !== 'supervisor') {
      return NextResponse.json(
        { error: '只有主管可以設定管理員姓名。' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const id = String(body?.id || '').trim()

    if (!id) {
      return NextResponse.json(
        { error: '缺少管理員姓名 ID。' },
        { status: 400 }
      )
    }

    const db = admin()
    const { error } = await db
      .from('attendance_staff_names')
      .update({
        is_active: false,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      return NextResponse.json(
        { error: `停用管理員姓名失敗：${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '停用管理員姓名失敗。' },
      { status: 500 }
    )
  }
}
