import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function requireSupervisor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: '未登入' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_active || profile.role !== 'supervisor') {
    return { error: NextResponse.json({ error: '僅主管可使用' }, { status: 403 }) }
  }
  return { supabase, user }
}

export async function GET() {
  const auth = await requireSupervisor()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const [{ data: items, error: itemError }, { data: managers }, { data: lots }] = await Promise.all([
    supabase
      .from('staff_leave_notifications')
      .select('*')
      .order('leave_date', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id,display_name,role,is_active')
      .eq('role', 'manager')
      .eq('is_active', true)
      .order('display_name'),
    supabase
      .from('parking_lots')
      .select('id,name,status')
      .eq('status', 'active')
      .order('name'),
  ])

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })
  return NextResponse.json({ items: items || [], managers: managers || [], parkingLots: lots || [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireSupervisor()
  if ('error' in auth) return auth.error
  const { supabase, user } = auth
  const body = await request.json().catch(() => ({}))

  const staffUserId = String(body.staff_user_id || '').trim()
  const parkingLotId = String(body.parking_lot_id || '').trim()
  const leaveDate = String(body.leave_date || '').trim()
  const leaveType = String(body.leave_type || '排休').trim() || '排休'
  const substituteName = String(body.substitute_name || '').trim()
  const substituteShift = String(body.substitute_shift || '').trim()
  const notes = String(body.notes || '').trim()

  if (!staffUserId || !parkingLotId || !/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) {
    return NextResponse.json({ error: '請選擇休假人員、場站與日期' }, { status: 400 })
  }

  const [{ data: staff }, { data: lot }] = await Promise.all([
    supabase.from('profiles').select('id,display_name,role,is_active').eq('id', staffUserId).maybeSingle(),
    supabase.from('parking_lots').select('id,name,status').eq('id', parkingLotId).maybeSingle(),
  ])

  if (!staff?.is_active || staff.role !== 'manager') {
    return NextResponse.json({ error: '休假人員必須是有效的場站管理員' }, { status: 400 })
  }
  if (!lot || lot.status !== 'active') {
    return NextResponse.json({ error: '停車場資料無效' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('staff_leave_notifications')
    .insert({
      staff_user_id: staff.id,
      staff_name: staff.display_name || '未命名管理員',
      parking_lot_id: lot.id,
      parking_lot_name: lot.name,
      leave_date: leaveDate,
      leave_type: leaveType,
      substitute_name: substituteName || null,
      substitute_shift: substituteShift || null,
      notes: notes || null,
      created_by: user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSupervisor()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: '缺少資料 ID' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ['leave_date','leave_type','substitute_name','substitute_shift','notes']) {
    if (key in body) updates[key] = body[key] || null
  }

  // 已經發過的提醒若修改內容，不自動重發；維持「只提醒一次」。
  const { data, error } = await supabase
    .from('staff_leave_notifications')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSupervisor()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: '缺少資料 ID' }, { status: 400 })

  const { error } = await supabase.from('staff_leave_notifications').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
