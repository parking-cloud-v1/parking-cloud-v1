import { randomUUID } from 'node:crypto'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 伺服器環境變數未設定完整')
  return createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function pushText(to: string, text: string) {
  const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()
  if (!token) return { configured: false, sent: false, error: 'LINE_CHANNEL_ACCESS_TOKEN 未設定' }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Line-Retry-Key': randomUUID(),
    },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 5000) }] }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return { configured: true, sent: false, error: `LINE ${response.status}${body ? `：${body.slice(0, 300)}` : ''}` }
  }
  return { configured: true, sent: true, error: '' }
}

export async function sendMonthlyWaitlistLineAlert(parkingLotId: string) {
  const db = admin()
  const [{ data: lot }, { data: binding }] = await Promise.all([
    db.from('parking_lots').select('id,name').eq('id', parkingLotId).maybeSingle(),
    db.from('monthly_waitlist_line_groups').select('line_group_id,is_active').eq('parking_lot_id', parkingLotId).eq('is_active', true).maybeSingle(),
  ])

  if (!lot) return { configured: false, sent: false, error: '找不到停車場' }
  if (!binding?.line_group_id) return { configured: false, sent: false, error: '此停車場尚未綁定月租候補 LINE 群組' }

  const now = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())

  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  const text = [
    '🔔 月租候補通知', '',
    `停車場：${lot.name}`,
    '新增候補：1 筆',
    `登記時間：${now}`,
    '', '請登入管理系統查看詳細資料。',
    ...(appUrl ? [`${appUrl}/dashboard/monthly-rentals/waiting-list`] : []),
  ].join('\n')

  return pushText(binding.line_group_id, text)
}

export async function sendLineReply(replyToken: string, text: string) {
  const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()
  if (!token || !replyToken) return
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text.slice(0, 5000) }] }),
    cache: 'no-store',
  })
}
