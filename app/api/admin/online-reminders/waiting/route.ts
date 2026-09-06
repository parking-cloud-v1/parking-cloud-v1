import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendSms } from '@/lib/sms/sendSms'

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

    const body = await request.json()
    const applicationId = String(body?.application_id || '').trim()

    if (!applicationId) {
      return NextResponse.json({ error: '缺少申請資料。' }, { status: 400 })
    }

    const { data: application, error: appError } = await supabase
      .from('rental_applications')
      .select(`
        id, parking_lot_id, phone, status, waiting_list_id,
        parking_lots(name)
      `)
      .eq('id', applicationId)
      .maybeSingle()

    if (appError || !application) {
      return NextResponse.json(
        { error: '找不到申請資料或沒有此場站權限。' },
        { status: 404 }
      )
    }

    if (application.status !== 'waiting') {
      return NextResponse.json(
        { error: '只有候補中的線上案件可以發送候補進度提醒。' },
        { status: 400 }
      )
    }

    let waitNo: number | null = null
    if (application.waiting_list_id) {
      const { data: waiting } = await supabase
        .from('monthly_waiting_list')
        .select('wait_no,status')
        .eq('id', application.waiting_list_id)
        .maybeSingle()

      if (waiting?.status === 'waiting') {
        waitNo = Number(waiting.wait_no || 0) || null
      }
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

    const statusUrl = `${siteUrl()}/status?application_id=${encodeURIComponent(
      application.id
    )}`
    const lotName = relationName(application.parking_lots) || '停車場'
    const positionText = waitNo ? `目前候補順位第 ${waitNo} 位。` : ''
    const message =
      `智驛科技月租候補進度通知：${lotName}。${positionText}` +
      `可使用原申請手機 OTP 查詢最新進度：${statusUrl}`

    const sms = await sendSms(application.phone, message)
    const status = deliveryStatus(sms)

    await admin.from('online_reminder_logs').insert({
      parking_lot_id: application.parking_lot_id,
      application_id: application.id,
      reminder_type: 'waiting_status',
      delivery_status: status,
      provider: sms.provider,
      error: sms.error || null,
      actor_user_id: actorUserId,
      metadata: {
        wait_no: waitNo,
      },
    })

    await admin.from('online_audit_logs').insert({
      actor_user_id: actorUserId,
      parking_lot_id: application.parking_lot_id,
      application_id: application.id,
      action: 'WAITING_STATUS_REMINDER_SENT',
      detail: {
        wait_no: waitNo,
        sms_status: status,
        sms_provider: sms.provider,
        sms_error: sms.error || null,
      },
    })

    return NextResponse.json({
      ok: true,
      wait_no: waitNo,
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
