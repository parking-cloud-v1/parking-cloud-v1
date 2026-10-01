import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendStaffLeaveLineAlert } from '@/lib/line/staff-leave-alert'

export const dynamic = 'force-dynamic'

function taipeiTomorrow() {
  const now = new Date()
  const taipeiMs = now.getTime() + 8 * 60 * 60 * 1000
  const taipei = new Date(taipeiMs)
  taipei.setUTCDate(taipei.getUTCDate() + 1)
  return `${taipei.getUTCFullYear()}-${String(taipei.getUTCMonth() + 1).padStart(2, '0')}-${String(taipei.getUTCDate()).padStart(2, '0')}`
}

export async function GET(request: NextRequest) {
  const cronSecret = String(process.env.CRON_SECRET || '').trim()
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Supabase service role 未設定' }, { status: 500 })
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const tomorrow = taipeiTomorrow()
  const { data: rows, error } = await supabase
    .from('staff_leave_notifications')
    .select('id,staff_name,parking_lot_name,leave_date,leave_type,substitute_name,substitute_shift,notes')
    .eq('leave_date', tomorrow)
    .is('reminder_sent_at', null)
    .order('parking_lot_name')
    .order('staff_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows?.length) return NextResponse.json({ ok: true, date: tomorrow, sent: 0, message: '明日無待通知休假' })

  const result = await sendStaffLeaveLineAlert(rows.map((row) => ({
    staffName: row.staff_name,
    parkingLotName: row.parking_lot_name,
    leaveDate: row.leave_date,
    leaveType: row.leave_type,
    substituteName: row.substitute_name,
    substituteShift: row.substitute_shift,
    notes: row.notes,
  })))

  if (!result.configured) {
    return NextResponse.json({ error: 'LINE 尚未設定', result }, { status: 503 })
  }
  if (result.failed > 0 || result.sent === 0) {
    return NextResponse.json({ error: 'LINE 發送未完全成功，本次不標記已通知', result }, { status: 502 })
  }

  const ids = rows.map((row) => row.id)
  const { error: updateError } = await supabase
    .from('staff_leave_notifications')
    .update({ reminder_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in('id', ids)

  if (updateError) return NextResponse.json({ error: updateError.message, result }, { status: 500 })
  return NextResponse.json({ ok: true, date: tomorrow, leave_count: rows.length, result })
}
