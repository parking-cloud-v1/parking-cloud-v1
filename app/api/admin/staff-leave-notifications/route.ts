import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createStaffLeaveCalendarEvent, updateStaffLeaveCalendarEvent, deleteStaffLeaveCalendarEvent } from '@/lib/google-calendar/staff-leave-calendar'

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

  const { data: items, error: itemError } = await supabase
    .from('staff_leave_notifications')
    .select('*')
    .order('leave_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })
  return NextResponse.json({ items: items || [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireSupervisor()
  if ('error' in auth) return auth.error
  const { supabase, user } = auth
  const body = await request.json().catch(() => ({}))

  const staffName = String(body.staff_name || '').trim()
  const parkingLotName = String(body.parking_lot_name || '').trim()
  const leaveDate = String(body.leave_date || '').trim()
  const leaveShift = String(body.leave_shift || '').trim()
  const leaveType = String(body.leave_type || '排休').trim() || '排休'
  const notes = String(body.notes || '').trim()

  if (!staffName || !parkingLotName || !leaveShift || !/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) {
    return NextResponse.json({ error: '請輸入管理員姓名、停車場、休假日期與休假時段' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('staff_leave_notifications')
    .insert({
      staff_user_id: null,
      staff_name: staffName,
      parking_lot_id: null,
      parking_lot_name: parkingLotName,
      leave_date: leaveDate,
      leave_shift: leaveShift,
      leave_type: leaveType,
      notes: notes || null,
      created_by: user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    const event = await createStaffLeaveCalendarEvent({
      staffName,
      parkingLotName,
      leaveDate,
      leaveShift,
      leaveType,
      notes,
    })

    const { data: synced, error: syncError } = await supabase
      .from('staff_leave_notifications')
      .update({
        google_event_id: event.id,
        google_calendar_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .select('*')
      .single()

    if (syncError) {
      await deleteStaffLeaveCalendarEvent(event.id).catch(() => undefined)
      await supabase.from('staff_leave_notifications').delete().eq('id', data.id)
      return NextResponse.json({ error: `Google 行事曆同步後資料庫更新失敗：${syncError.message}` }, { status: 500 })
    }

    return NextResponse.json({ item: synced })
  } catch (calendarError) {
    await supabase.from('staff_leave_notifications').delete().eq('id', data.id)
    return NextResponse.json({
      error: `Google 行事曆同步失敗：${String(calendarError instanceof Error ? calendarError.message : calendarError)}`,
    }, { status: 502 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSupervisor()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: '缺少資料 ID' }, { status: 400 })

  const { data: current, error: currentError } = await supabase
    .from('staff_leave_notifications')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: '找不到這筆休假資料' }, { status: 404 })

  const merged = {
    staff_name: 'staff_name' in body ? String(body.staff_name || '').trim() : current.staff_name,
    parking_lot_name: 'parking_lot_name' in body ? String(body.parking_lot_name || '').trim() : current.parking_lot_name,
    leave_date: 'leave_date' in body ? String(body.leave_date || '').trim() : current.leave_date,
    leave_shift: 'leave_shift' in body ? String(body.leave_shift || '').trim() : current.leave_shift,
    leave_type: 'leave_type' in body ? String(body.leave_type || '排休').trim() : current.leave_type,
    notes: 'notes' in body ? String(body.notes || '').trim() : (current.notes || ''),
  }

  if (!merged.staff_name || !merged.parking_lot_name || !merged.leave_shift || !/^\d{4}-\d{2}-\d{2}$/.test(merged.leave_date)) {
    return NextResponse.json({ error: '請輸入管理員姓名、停車場、休假日期與休假時段' }, { status: 400 })
  }

  try {
    let googleEventId = current.google_event_id as string | null

    if (googleEventId) {
      await updateStaffLeaveCalendarEvent(googleEventId, {
        staffName: merged.staff_name,
        parkingLotName: merged.parking_lot_name,
        leaveDate: merged.leave_date,
        leaveShift: merged.leave_shift,
        leaveType: merged.leave_type,
        notes: merged.notes,
      })
    } else {
      const event = await createStaffLeaveCalendarEvent({
        staffName: merged.staff_name,
        parkingLotName: merged.parking_lot_name,
        leaveDate: merged.leave_date,
        leaveShift: merged.leave_shift,
        leaveType: merged.leave_type,
        notes: merged.notes,
      })
      googleEventId = event.id
    }

    const { data, error } = await supabase
      .from('staff_leave_notifications')
      .update({
        ...merged,
        notes: merged.notes || null,
        google_event_id: googleEventId,
        google_calendar_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  } catch (calendarError) {
    return NextResponse.json({
      error: `Google 行事曆同步失敗：${String(calendarError instanceof Error ? calendarError.message : calendarError)}`,
    }, { status: 502 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSupervisor()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: '缺少資料 ID' }, { status: 400 })

  const { data: current, error: currentError } = await supabase
    .from('staff_leave_notifications')
    .select('id,google_event_id')
    .eq('id', id)
    .maybeSingle()

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })
  if (!current) return NextResponse.json({ ok: true })

  if (current.google_event_id) {
    try {
      await deleteStaffLeaveCalendarEvent(current.google_event_id)
    } catch (calendarError) {
      return NextResponse.json({
        error: `Google 行事曆刪除失敗：${String(calendarError instanceof Error ? calendarError.message : calendarError)}`,
      }, { status: 502 })
    }
  }

  const { error } = await supabase.from('staff_leave_notifications').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
