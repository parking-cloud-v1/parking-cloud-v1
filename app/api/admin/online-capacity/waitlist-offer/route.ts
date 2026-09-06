import { createHash, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
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

function vehicleTypeText(value: string) {
  if (value === 'motorcycle') return '機車'
  if (value === 'heavy_motorcycle') return '重機'
  return '汽車'
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
    const parkingLotId = String(body?.parking_lot_id || '').trim()
    const vehicleType = String(body?.vehicle_type || '').trim()

    if (
      !parkingLotId ||
      !['car', 'motorcycle', 'heavy_motorcycle'].includes(vehicleType)
    ) {
      return NextResponse.json(
        { error: '候補遞補參數不完整。' },
        { status: 400 }
      )
    }

    // 先用登入者 session + RLS 驗證場站權限。
    const { data: lot, error: lotError } = await supabase
      .from('parking_lots')
      .select('id,name,status')
      .eq('id', parkingLotId)
      .maybeSingle()

    if (lotError || !lot) {
      return NextResponse.json(
        { error: '找不到停車場或沒有此場站權限。' },
        { status: 403 }
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

    await admin.rpc('expire_online_waitlist_offers', {
      p_parking_lot_id: parkingLotId,
    })

    // 只抓同車種真正第一順位，不跳過手動候補。
    const { data: waiting, error: waitingError } = await admin
      .from('monthly_waiting_list')
      .select(`
        id,
        parking_lot_id,
        wait_no,
        customer_name,
        phone,
        vehicle_type,
        vehicle_plate,
        status,
        source_application_id,
        offer_status,
        offer_expires_at,
        offer_count
      `)
      .eq('parking_lot_id', parkingLotId)
      .eq('vehicle_type', vehicleType)
      .eq('status', 'waiting')
      .order('wait_no', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (waitingError) {
      return NextResponse.json(
        { error: waitingError.message },
        { status: 500 }
      )
    }

    if (!waiting) {
      return NextResponse.json(
        { error: `目前沒有${vehicleTypeText(vehicleType)}候補資料。` },
        { status: 404 }
      )
    }

    if (!waiting.source_application_id) {
      return NextResponse.json(
        {
          error:
            `目前第 ${waiting.wait_no} 順位是現場手動候補「${waiting.customer_name}」，` +
            '系統不會跳過此人。請先到月租候補名單人工處理。',
          code: 'MANUAL_WAITING_FIRST',
          waiting_id: waiting.id,
          wait_no: waiting.wait_no,
        },
        { status: 409 }
      )
    }

    if (!waiting.phone || !/^09\d{8}$/.test(String(waiting.phone))) {
      return NextResponse.json(
        { error: '候補第一順位沒有可用的台灣手機號碼，請先人工確認資料。' },
        { status: 409 }
      )
    }

    const token = randomBytes(32).toString('base64url')
    const hash = tokenHash(token)
    const expiresAt = new Date(
      Date.now() + 72 * 60 * 60_000
    ).toISOString()

    const { data: offer, error: offerError } = await admin.rpc(
      'create_online_waitlist_offer',
      {
        p_waiting_id: waiting.id,
        p_actor_user_id: actorUserId,
        p_token_hash: hash,
        p_expires_at: expiresAt,
      }
    )

    if (offerError) {
      return NextResponse.json(
        {
          error:
            '建立候補遞補通知失敗：' +
            (offerError.message || '資料庫處理失敗'),
        },
        { status: 500 }
      )
    }

    if (offer?.ok === false) {
      const code = String(offer?.code || '')
      const error =
        code === 'CAPACITY_FULL'
          ? '目前名額仍然已滿，尚不能通知候補遞補。'
          : code === 'NOT_FIRST_IN_QUEUE'
            ? '候補順位已變動，請重新整理後再試。'
            : code === 'MANUAL_WAITING_FIRST'
              ? '候補第一順位為手動候補，請先人工處理。'
              : '目前無法建立候補遞補通知。'

      return NextResponse.json(
        { error, code, detail: offer },
        { status: 409 }
      )
    }

    const offerUrl = `${siteUrl()}/waitlist-offer/${token}`
    const message =
      `智驛科技月租候補通知：${lot.name} ${vehicleTypeText(vehicleType)}目前已有名額。` +
      `您目前為候補第 ${waiting.wait_no} 位，請於 72 小時內確認是否接受遞補：${offerUrl}`

    const sms = await sendSms(String(waiting.phone), message)

    if (!sms.ok) {
      // 簡訊失敗就立即釋放名額，不讓一封沒送出的通知卡住 72 小時。
      await admin
        .from('monthly_waiting_list')
        .update({
          offer_status: 'none',
          offer_token_hash: null,
          offer_expires_at: null,
          offer_last_error: sms.error || '候補簡訊發送失敗',
          updated_at: new Date().toISOString(),
        })
        .eq('id', waiting.id)
        .eq('offer_token_hash', hash)

      await admin.rpc('release_online_capacity_reservation', {
        p_application_id: waiting.source_application_id,
        p_reason: '候補遞補簡訊發送失敗',
      })

      await admin.from('online_audit_logs').insert({
        actor_user_id: actorUserId,
        parking_lot_id: parkingLotId,
        application_id: waiting.source_application_id,
        action: 'WAITLIST_OFFER_SMS_FAILED',
        detail: {
          waiting_list_id: waiting.id,
          wait_no: waiting.wait_no,
          vehicle_type: vehicleType,
          sms_provider: sms.provider,
          sms_error: sms.error || null,
        },
      })

      return NextResponse.json(
        { error: sms.error || '候補通知簡訊發送失敗。' },
        { status: 503 }
      )
    }

    await admin.from('online_application_reviews').insert({
      application_id: waiting.source_application_id,
      parking_lot_id: parkingLotId,
      actor_user_id: actorUserId,
      actor_label: actorLabel,
      action: 'WAITLIST_OFFER_SENT',
      previous_status: 'waiting',
      new_status: 'waiting',
      note: `候補第 ${waiting.wait_no} 位已發送名額釋出通知`,
      metadata: {
        waiting_list_id: waiting.id,
        wait_no: waiting.wait_no,
        vehicle_type: vehicleType,
        expires_at: expiresAt,
        offer_count: Number(waiting.offer_count || 0) + 1,
        sms_provider: sms.provider,
      },
    })

    await admin.from('online_audit_logs').insert({
      actor_user_id: actorUserId,
      parking_lot_id: parkingLotId,
      application_id: waiting.source_application_id,
      action: 'WAITLIST_CAPACITY_OFFER_SENT',
      detail: {
        waiting_list_id: waiting.id,
        wait_no: waiting.wait_no,
        vehicle_type: vehicleType,
        expires_at: expiresAt,
        sms_status: 'sent',
        sms_provider: sms.provider,
      },
    })

    return NextResponse.json({
      ok: true,
      waiting_id: waiting.id,
      wait_no: waiting.wait_no,
      application_id: waiting.source_application_id,
      expires_at: expiresAt,
      offer_url: offerUrl,
      sms_status: 'sent',
      sms_provider: sms.provider,
      dev_mode: process.env.OTP_DEV_MODE === 'true',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '候補遞補通知失敗。' },
      { status: 500 }
    )
  }
}
