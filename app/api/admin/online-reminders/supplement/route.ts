import { createHash, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendSms } from '@/lib/sms/sendSms'

function hashToken(token: string) {
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

function deliveryStatus(result: { ok: boolean; provider: string }) {
  if (result.ok && result.provider === 'development') return 'development'
  return result.ok ? 'sent' : 'failed'
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
    const actorLabel = user.email || actorUserId

    const body = await request.json()
    const applicationId = String(body?.application_id || '').trim()

    if (!applicationId) {
      return NextResponse.json({ error: '缺少申請資料。' }, { status: 400 })
    }

    // 使用登入者 session + RLS 先確認場站權限。
    const { data: application, error: appError } = await supabase
      .from('rental_applications')
      .select(`
        id, parking_lot_id, applicant_name, phone, status,
        supplement_note, parking_lots(name)
      `)
      .eq('id', applicationId)
      .maybeSingle()

    if (appError || !application) {
      return NextResponse.json(
        { error: '找不到申請資料或沒有此場站權限。' },
        { status: 404 }
      )
    }

    if (application.status !== 'needs_revision') {
      return NextResponse.json(
        { error: '只有「待補件」案件可以重新發送補件連結。' },
        { status: 400 }
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
    const expiresAt = new Date(Date.now() + 72 * 60 * 60_000).toISOString()
    const now = new Date().toISOString()
    const supplementUrl = `${siteUrl()}/supplement/${token}`
    const lotName = relationName(application.parking_lots) || '停車場'

    const { error: updateError } = await admin
      .from('rental_applications')
      .update({
        supplement_token_hash: hashToken(token),
        supplement_expires_at: expiresAt,
        supplement_requested_at: now,
        supplement_completed_at: null,
        updated_at: now,
      })
      .eq('id', application.id)
      .eq('status', 'needs_revision')

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const message =
      `智驛科技月租申請補件提醒：${lotName}。` +
      `請於 72 小時內完成補件：${supplementUrl}`

    const sms = await sendSms(application.phone, message)
    const status = deliveryStatus(sms)

    await admin.from('online_reminder_logs').insert({
      parking_lot_id: application.parking_lot_id,
      application_id: application.id,
      reminder_type: 'supplement_link_regenerated',
      delivery_status: status,
      provider: sms.provider,
      error: sms.error || null,
      actor_user_id: actorUserId,
      metadata: {
        expires_at: expiresAt,
      },
    })

    await admin.from('online_application_reviews').insert({
      application_id: application.id,
      parking_lot_id: application.parking_lot_id,
      actor_user_id: actorUserId,
      actor_label: actorLabel,
      action: 'SUPPLEMENT_REMINDER_SENT',
      previous_status: 'needs_revision',
      new_status: 'needs_revision',
      note: application.supplement_note || '重新發送補件連結',
      metadata: {
        expires_at: expiresAt,
        sms_status: status,
        sms_provider: sms.provider,
        sms_error: sms.error || null,
      },
    })

    await admin.from('online_audit_logs').insert({
      actor_user_id: actorUserId,
      parking_lot_id: application.parking_lot_id,
      application_id: application.id,
      action: 'APPLICATION_SUPPLEMENT_LINK_REGENERATED',
      detail: {
        expires_at: expiresAt,
        sms_status: status,
        sms_provider: sms.provider,
        sms_error: sms.error || null,
      },
    })

    return NextResponse.json({
      ok: true,
      supplement_url: supplementUrl,
      expires_at: expiresAt,
      sms_status: status,
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
