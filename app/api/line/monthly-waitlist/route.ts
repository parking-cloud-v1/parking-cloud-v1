import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendLineReply } from '@/lib/line/monthly-waitlist-alert'

export const runtime = 'nodejs'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 伺服器環境變數未設定完整')
  return createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function validSignature(raw: string, signature: string) {
  const secret = String(process.env.LINE_CHANNEL_SECRET || '').trim()
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(raw).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('x-line-signature') || ''
  if (!validSignature(raw, signature)) return new NextResponse('Invalid signature', { status: 401 })

  const payload = JSON.parse(raw || '{}')
  const db = admin()
  const bindKey = String(process.env.LINE_MONTHLY_WAITLIST_BIND_KEY || '').trim()

  for (const event of payload?.events || []) {
    if (event?.type !== 'message' || event?.message?.type !== 'text' || event?.source?.type !== 'group') continue
    const text = String(event.message.text || '').trim()
    if (!text.startsWith('月租候補綁定')) continue

    const parts = text.split(/\s+/)
    const suppliedKey = parts[1] || ''
    const lotName = parts.slice(2).join(' ').trim()

    if (!bindKey || suppliedKey !== bindKey) {
      await sendLineReply(event.replyToken, '月租候補群組綁定失敗：綁定碼不正確。')
      continue
    }
    if (!lotName) {
      await sendLineReply(event.replyToken, '格式：月租候補綁定 綁定碼 停車場名稱')
      continue
    }

    const { data: lots } = await db.from('parking_lots').select('id,name').ilike('name', lotName).limit(2)
    if (!lots || lots.length !== 1) {
      await sendLineReply(event.replyToken, lots?.length ? '找到多個相似停車場，請輸入完整停車場名稱。' : `找不到停車場：${lotName}`)
      continue
    }

    const lot = lots[0]
    const groupId = String(event.source.groupId || '')
    if (!groupId) continue

    await db.from('monthly_waitlist_line_groups').update({ is_active: false, updated_at: new Date().toISOString() }).eq('line_group_id', groupId)
    const { error } = await db.from('monthly_waitlist_line_groups').upsert({
      parking_lot_id: lot.id,
      line_group_id: groupId,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'parking_lot_id' })

    await sendLineReply(event.replyToken, error
      ? `綁定失敗：${error.message}`
      : `✅ 月租候補通知已綁定\n停車場：${lot.name}\n之後新增此場候補，只會通知這個 LINE 群組。`)
  }

  return NextResponse.json({ ok: true })
}
