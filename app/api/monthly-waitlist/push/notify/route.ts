import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import webpush from 'web-push'

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

    const { parking_lot_id: lotIdRaw } = await request.json()
    const lotId = String(lotIdRaw || '')
    if (!lotId) return NextResponse.json({ error: '缺少停車場' }, { status: 400 })
    if (!(await canUseLot(supabase, user.id, lotId))) {
      return NextResponse.json({ error: '沒有此停車場權限' }, { status: 403 })
    }

    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || ''
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || ''
    const subject = process.env.WEB_PUSH_VAPID_SUBJECT || 'https://parking-cloud-v1.vercel.app'
    if (!publicKey || !privateKey) {
      console.warn('[monthly-waitlist-push-notify] VAPID 未設定，略過 Web Push')
      return NextResponse.json({ ok: true, skipped: true, reason: 'vapid_not_configured' })
    }
    webpush.setVapidDetails(subject, publicKey, privateKey)

    const admin = adminClient()
    const [{ data: lot }, { data: subscriptions }] = await Promise.all([
      admin.from('parking_lots').select('name').eq('id', lotId).maybeSingle(),
      admin.from('monthly_waitlist_push_subscriptions').select('id,endpoint,p256dh,auth').eq('parking_lot_id', lotId).eq('is_active', true),
    ])

    const payload = JSON.stringify({
      title: '月租候補通知',
      body: `${lot?.name || '停車場'}新增 1 筆月租候補，請至系統查看。`,
      url: '/dashboard/monthly-rentals/waiting-list',
      tag: `monthly-waitlist-${lotId}`,
    })

    let sent = 0
    for (const item of subscriptions || []) {
      try {
        await webpush.sendNotification({
          endpoint: item.endpoint,
          keys: { p256dh: item.p256dh, auth: item.auth },
        }, payload, { TTL: 60 * 60 * 12 })
        sent += 1
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || 0)
        console.error('[monthly-waitlist-push-send]', statusCode, error?.message || error)
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('monthly_waitlist_push_subscriptions').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', item.id)
        }
      }
    }

    return NextResponse.json({ ok: true, sent })
  } catch (error: any) {
    console.error('[monthly-waitlist-push-notify]', error)
    return NextResponse.json({ ok: false, error: error?.message || '通知發送失敗' }, { status: 200 })
  }
}
