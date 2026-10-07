import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('缺少 Supabase Server 環境變數')
  return createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function canUseLot(supabase: any, userId: string, lotId: string) {
  const { data: profile } = await supabase.from('profiles').select('role,is_active').eq('id', userId).maybeSingle()
  if (!profile?.is_active) return false
  if (profile.role === 'supervisor') return true
  if (profile.role !== 'manager') return false
  const { data } = await supabase.from('user_parking_lots').select('parking_lot_id').eq('user_id', userId).eq('parking_lot_id', lotId).maybeSingle()
  return Boolean(data)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

    const body = await request.json()
    const lotId = String(body?.parking_lot_id || '')
    const subscription = body?.subscription
    const endpoint = String(subscription?.endpoint || '')
    const p256dh = String(subscription?.keys?.p256dh || '')
    const auth = String(subscription?.keys?.auth || '')
    if (!lotId || !endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: '通知訂閱資料不完整' }, { status: 400 })
    }
    if (!(await canUseLot(supabase, user.id, lotId))) {
      return NextResponse.json({ error: '沒有此停車場權限' }, { status: 403 })
    }

    const admin = adminClient()
    const { error } = await admin.from('monthly_waitlist_push_subscriptions').upsert({
      user_id: user.id,
      parking_lot_id: lotId,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get('user-agent') || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,parking_lot_id,endpoint' })
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[monthly-waitlist-push-subscribe]', error)
    return NextResponse.json({ error: error?.message || '通知設定失敗' }, { status: 500 })
  }
}
