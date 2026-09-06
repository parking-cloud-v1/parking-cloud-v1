import { createHash, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/sms/sendSms'

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

function relationName(value: any) {
  if (Array.isArray(value)) return value[0]?.name || ''
  return value?.name || ''
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '未登入。' }, { status: 401 })
    }

    const actorUserId = user.id

    const body = await request.json()
    const contractId = String(body?.contract_id || '').trim()
    const source = String(body?.source || 'contract_detail').trim()

    if (!contractId) {
      return NextResponse.json({ error: '缺少契約編號。' }, { status: 400 })
    }

    // 使用登入中的 client 先查一次，讓 RLS 決定此帳號是否有該場權限。
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id,application_id,contract_no,customer_code,parking_lot_id,phone,status,parking_lots(name)')
      .eq('id', contractId)
      .maybeSingle()

    if (contractError || !contract) {
      return NextResponse.json(
        { error: '找不到契約或沒有此停車場權限。' },
        { status: 404 }
      )
    }

    if (contract.status === 'signed') {
      return NextResponse.json(
        { error: '此契約已完成簽署，不可重新產生簽約連結。' },
        { status: 409 }
      )
    }

    if (contract.status !== 'sent') {
      return NextResponse.json(
        { error: '只有待簽約狀態可以重新產生簽約連結。' },
        { status: 409 }
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: '伺服器環境變數未設定完整。' },
        { status: 500 }
      )
    }

    const admin = createAdminClient(url, serviceKey, {
      auth: { persistSession: false },
    })

    const token = randomBytes(32).toString('base64url')
    const hash = tokenHash(token)
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 72 * 60 * 60_000).toISOString()
    const signUrl = `${siteUrl()}/sign/${token}`
    const parkingLotName = relationName(contract.parking_lots) || '停車場'

    const { error: updateTokenError } = await admin
      .from('contracts')
      .update({
        sign_token_hash: hash,
        sign_token_expires_at: expiresAt,
        sign_token_used_at: null,
        sign_invitation_sent_at: null,
        sign_invitation_provider: null,
        sign_invitation_status: 'pending',
        sign_invitation_error: null,
        updated_at: now,
      })
      .eq('id', contract.id)

    if (updateTokenError) {
      return NextResponse.json(
        { error: updateTokenError.message },
        { status: 500 }
      )
    }

    const smsMessage =
      `智驛科技月租停車簽約通知：${parkingLotName}，` +
      `客戶編號 ${contract.customer_code || '-'}，契約編號 ${contract.contract_no}。` +
      `請於 72 小時內完成電子簽約：${signUrl}`

    const sms = await sendSms(contract.phone, smsMessage)

    await admin
      .from('contracts')
      .update({
        sign_invitation_sent_at: sms.ok ? now : null,
        sign_invitation_provider: sms.provider,
        sign_invitation_status: sms.ok ? 'sent' : 'failed',
        sign_invitation_error: sms.ok ? null : sms.error || '簡訊發送失敗',
        updated_at: now,
      })
      .eq('id', contract.id)

    await admin.from('online_audit_logs').insert({
      actor_user_id: actorUserId,
      parking_lot_id: contract.parking_lot_id,
      contract_id: contract.id,
      action: 'CONTRACT_SIGN_LINK_REGENERATED',
      detail: {
        customer_code: contract.customer_code || null,
        contract_no: contract.contract_no,
        expires_at: expiresAt,
        sms_status: sms.ok ? 'sent' : 'failed',
        sms_provider: sms.provider,
        sms_error: sms.error || null,
      },
    })



    if (source === 'reminder_center') {
      await admin.from('online_reminder_logs').insert({
        parking_lot_id: contract.parking_lot_id,
        application_id: contract.application_id || null,
        contract_id: contract.id,
        reminder_type: 'sign_link_regenerated',
        delivery_status:
          sms.ok && sms.provider === 'development'
            ? 'development'
            : sms.ok
              ? 'sent'
              : 'failed',
        provider: sms.provider,
        error: sms.error || null,
        actor_user_id: actorUserId,
        metadata: {
          contract_no: contract.contract_no,
          expires_at: expiresAt,
        },
      })
    }

    await admin.from('contract_lifecycle_events').insert({
      contract_id: contract.id,
      application_id: contract.application_id || null,
      parking_lot_id: contract.parking_lot_id,
      actor_user_id: actorUserId,
      event_type: 'SIGN_LINK_REGENERATED',
      previous_status: 'sent',
      new_status: 'sent',
      note: '重新產生 72 小時簽約連結',
      metadata: {
        contract_no: contract.contract_no,
        customer_code: contract.customer_code || null,
        expires_at: expiresAt,
        sms_status: sms.ok ? 'sent' : 'failed',
        sms_provider: sms.provider,
        sms_error: sms.error || null,
      },
    })

    return NextResponse.json({
      ok: true,
      sign_url: signUrl,
      expires_at: expiresAt,
      sms_status: sms.ok ? 'sent' : 'failed',
      sms_provider: sms.provider,
      sms_error: sms.error || null,
      dev_mode: process.env.OTP_DEV_MODE === 'true',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '系統錯誤。' },
      { status: 500 }
    )
  }
}
