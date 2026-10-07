import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendMonthlyWaitlistLineAlert } from '@/lib/line/monthly-waitlist-alert'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const parkingLotId = String(body?.parkingLotId || '').trim()
    if (!parkingLotId) return NextResponse.json({ error: '缺少停車場。' }, { status: 400 })

    const { data: profile } = await supabase.from('profiles').select('role,is_active').eq('id', user.id).maybeSingle()
    if (!profile?.is_active || !['supervisor', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: '沒有月租候補操作權限。' }, { status: 403 })
    }

    if (profile.role === 'manager') {
      const { data: assignment } = await supabase.from('user_parking_lots').select('parking_lot_id')
        .eq('user_id', user.id).eq('parking_lot_id', parkingLotId).maybeSingle()
      if (!assignment) return NextResponse.json({ error: '沒有此停車場權限。' }, { status: 403 })
    }

    const result = await sendMonthlyWaitlistLineAlert(parkingLotId)
    return NextResponse.json({ ok: true, line: result })
  } catch (error: any) {
    return NextResponse.json({ ok: true, line: { configured: false, sent: false, error: String(error?.message || 'LINE 通知失敗') } })
  }
}
