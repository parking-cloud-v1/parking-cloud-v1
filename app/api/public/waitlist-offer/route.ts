import { createHash, randomInt, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/sms/sendSms'
import { consumePublicRateLimit, hashOtpCode, publicFailure, rateLimitResponse } from '@/lib/security/publicSecurity'

export const dynamic = 'force-dynamic'

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function vehicleTypeText(value: string) {
  if (value === 'motorcycle') return '機車'
  if (value === 'heavy_motorcycle') return '重機'
  return '汽車'
}

function maskPhone(value: string) {
  if (!/^09\d{8}$/.test(value)) return '申請手機'
  return `${value.slice(0, 4)}***${value.slice(-3)}`
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('SERVER_ENV_NOT_READY')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

async function loadOffer(admin: any, hash: string) {
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
      rental_type,
      source_application_id,
      status,
      offer_status,
      offer_expires_at,
      offer_notified_at,
      offer_count
    `)
    .eq('offer_token_hash', hash)
    .maybeSingle()

  if (waitingError) throw waitingError
  if (!waiting) return null

  const [{ data: lot }, { data: application }] = await Promise.all([
    admin
      .from('parking_lots')
      .select('id,name')
      .eq('id', waiting.parking_lot_id)
      .maybeSingle(),
    waiting.source_application_id
      ? admin
          .from('rental_applications')
          .select('id,applicant_name,phone,status')
          .eq('id', waiting.source_application_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    waiting,
    lot,
    application,
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = String(request.nextUrl.searchParams.get('token') || '').trim()

    if (!token) {
      return NextResponse.json(
        { error: '候補通知連結不完整。' },
        { status: 400 }
      )
    }

    const admin = adminClient()
    const hash = tokenHash(token)
    const viewLimit = await consumePublicRateLimit(admin, request, {
      scope: 'waitlist_offer_view_ip',
      subject: hash,
      limit: 120,
      windowSeconds: 600,
    })
    if (!viewLimit.allowed) return rateLimitResponse(viewLimit)

    const offer = await loadOffer(admin, hash)

    if (!offer) {
      return NextResponse.json(
        { error: '候補通知不存在、已使用或已失效。' },
        { status: 404 }
      )
    }

    const { waiting, lot, application } = offer

    if (
      waiting.status !== 'waiting' ||
      waiting.offer_status !== 'offered'
    ) {
      return NextResponse.json(
        { error: '此候補通知已完成或已失效。' },
        { status: 410 }
      )
    }

    if (
      !waiting.offer_expires_at ||
      new Date(waiting.offer_expires_at).getTime() <= Date.now()
    ) {
      await admin.rpc('expire_online_waitlist_offers', {
        p_parking_lot_id: waiting.parking_lot_id,
      })

      return NextResponse.json(
        { error: '此候補通知已逾期，候補資格仍保留，請等待下一次通知。' },
        { status: 410 }
      )
    }

    if (!application || application.id !== waiting.source_application_id) {
      return NextResponse.json(
        { error: '原申請資料不存在，請聯絡停車場管理人員。' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ok: true,
      offer: {
        waiting_id: waiting.id,
        application_id: application.id,
        parking_lot_name: lot?.name || '停車場',
        applicant_name: application.applicant_name || waiting.customer_name,
        phone_masked: maskPhone(String(application.phone || waiting.phone || '')),
        vehicle_type: waiting.vehicle_type,
        vehicle_type_label: vehicleTypeText(waiting.vehicle_type),
        vehicle_plate: waiting.vehicle_plate || '—',
        rental_type: waiting.rental_type || '一般',
        wait_no: waiting.wait_no,
        expires_at: waiting.offer_expires_at,
        notified_at: waiting.offer_notified_at,
      },
    })
  } catch (error: any) {
    return publicFailure('waitlist-offer-get', error, '候補通知暫時無法讀取，請稍後再試。', 503)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = String(body?.action || '').trim()
    const token = String(body?.token || '').trim()

    if (!token || !['request_otp', 'respond'].includes(action)) {
      return NextResponse.json(
        { error: '候補回覆資料不完整。' },
        { status: 400 }
      )
    }

    const admin = adminClient()
    const hash = tokenHash(token)
    const postLimit = await consumePublicRateLimit(admin, request, {
      scope: 'waitlist_offer_post_ip',
      subject: hash,
      limit: 30,
      windowSeconds: 600,
    })
    if (!postLimit.allowed) return rateLimitResponse(postLimit)

    const offer = await loadOffer(admin, hash)

    if (!offer) {
      return NextResponse.json(
        { error: '候補通知不存在、已使用或已失效。' },
        { status: 404 }
      )
    }

    const { waiting, lot, application } = offer

    if (
      waiting.status !== 'waiting' ||
      waiting.offer_status !== 'offered' ||
      !waiting.offer_expires_at ||
      new Date(waiting.offer_expires_at).getTime() <= Date.now()
    ) {
      await admin.rpc('expire_online_waitlist_offers', {
        p_parking_lot_id: waiting.parking_lot_id,
      })

      return NextResponse.json(
        { error: '候補通知已失效，請等待下一次通知。' },
        { status: 410 }
      )
    }

    if (!application) {
      return NextResponse.json(
        { error: '原申請資料不存在。' },
        { status: 404 }
      )
    }

    const phone = String(application.phone || waiting.phone || '').trim()

    if (!/^09\d{8}$/.test(phone)) {
      return NextResponse.json(
        { error: '原申請手機資料不正確，請聯絡停車場管理人員。' },
        { status: 409 }
      )
    }

    if (action === 'request_otp') {
      const phoneLimit = await consumePublicRateLimit(admin, request, {
        scope: 'otp_waitlist_phone', includeIp: false, subject: phone, limit: 5, windowSeconds: 600,
      })
      if (!phoneLimit.allowed) return rateLimitResponse(phoneLimit)

      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
      const tenMinutesAgo = new Date(
        Date.now() - 10 * 60_000
      ).toISOString()

      const { data: recentOne } = await admin
        .from('public_otp_challenges')
        .select('id')
        .eq('phone', phone)
        .eq('purpose', 'waitlist_offer')
        .eq('application_id', application.id)
        .gte('created_at', oneMinuteAgo)
        .limit(1)

      if (recentOne?.length) {
        return NextResponse.json(
          { error: '驗證碼剛剛已發送，請稍後再試。' },
          { status: 429 }
        )
      }

      const { count } = await admin
        .from('public_otp_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('phone', phone)
        .eq('purpose', 'waitlist_offer')
        .gte('created_at', tenMinutesAgo)

      if ((count || 0) >= 5) {
        return NextResponse.json(
          { error: '驗證碼發送次數過多，請稍後再試。' },
          { status: 429 }
        )
      }

      const challengeId = randomUUID()
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()

      const { error: insertError } = await admin
        .from('public_otp_challenges')
        .insert({
          id: challengeId,
          parking_lot_id: waiting.parking_lot_id,
          application_id: application.id,
          phone,
          purpose: 'waitlist_offer',
          code_hash: hashOtpCode(challengeId, code),
          expires_at: expiresAt,
        })

      if (insertError) {
        console.error('[waitlist-offer] otp challenge insert failed', insertError)
        return NextResponse.json(
          { error: '驗證服務暫時無法使用，請稍後再試。' },
          { status: 503 }
        )
      }

      const sms = await sendSms(
        phone,
        `智驛月租候補遞補確認碼：${code}，5分鐘內有效。請勿提供給他人。`,
        code
      )

      if (!sms.ok) {
        await admin
          .from('public_otp_challenges')
          .delete()
          .eq('id', challengeId)

        return NextResponse.json(
          { error: '驗證碼發送失敗，請稍後再試。' },
          { status: 503 }
        )
      }

      return NextResponse.json({
        ok: true,
        challenge_id: challengeId,
        expires_at: expiresAt,
        ...(sms.debugCode ? { debug_code: sms.debugCode } : {}),
      })
    }

    const challengeId = String(body?.challenge_id || '').trim()
    const code = String(body?.code || '').trim()
    const decision = String(body?.decision || '').trim()

    if (
      !challengeId ||
      !/^\d{6}$/.test(code) ||
      !['accept', 'defer'].includes(decision)
    ) {
      return NextResponse.json(
        { error: '驗證碼或候補回覆資料不完整。' },
        { status: 400 }
      )
    }

    const { data: challenge, error: challengeError } = await admin
      .from('public_otp_challenges')
      .select(
        'id,application_id,phone,code_hash,expires_at,consumed_at,attempts,purpose'
      )
      .eq('id', challengeId)
      .maybeSingle()

    if (challengeError || !challenge) {
      return NextResponse.json(
        { error: '驗證碼不存在或已失效。' },
        { status: 400 }
      )
    }

    if (
      challenge.purpose !== 'waitlist_offer' ||
      challenge.application_id !== application.id ||
      challenge.phone !== phone ||
      challenge.consumed_at
    ) {
      return NextResponse.json(
        { error: '驗證狀態無效，請重新取得驗證碼。' },
        { status: 400 }
      )
    }

    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: '驗證碼已過期，請重新取得。' },
        { status: 410 }
      )
    }

    if (Number(challenge.attempts || 0) >= 5) {
      return NextResponse.json(
        { error: '驗證錯誤次數過多，請重新取得驗證碼。' },
        { status: 429 }
      )
    }

    if (hashOtpCode(challenge.id, code) !== challenge.code_hash) {
      const nextAttempts = Number(challenge.attempts || 0) + 1

      await admin
        .from('public_otp_challenges')
        .update({
          attempts: nextAttempts,
          ...(nextAttempts >= 5
            ? { consumed_at: new Date().toISOString() }
            : {}),
        })
        .eq('id', challenge.id)

      return NextResponse.json(
        {
          error:
            nextAttempts >= 5
              ? '驗證錯誤次數過多，請重新取得驗證碼。'
              : `驗證碼錯誤，尚可嘗試 ${5 - nextAttempts} 次。`,
        },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const { data: consumed, error: consumeError } = await admin
      .from('public_otp_challenges')
      .update({ consumed_at: now, verified_at: now })
      .eq('id', challenge.id)
      .is('consumed_at', null)
      .select('id')
      .maybeSingle()

    if (consumeError || !consumed) {
      return NextResponse.json(
        { error: '驗證碼已使用，請重新取得。' },
        { status: 409 }
      )
    }

    const { data: result, error: responseError } = await admin.rpc(
      'respond_online_waitlist_offer',
      {
        p_token_hash: hash,
        p_decision: decision,
      }
    )

    if (responseError || !result?.ok) {
      console.error('[waitlist-offer] response rpc failed', responseError)
      return NextResponse.json(
        { error: '候補回覆無法完成，通知可能已失效，請重新整理後再試。' },
        { status: 409 }
      )
    }

    const accepted = decision === 'accept'

    await admin.from('online_application_reviews').insert({
      application_id: application.id,
      parking_lot_id: waiting.parking_lot_id,
      actor_user_id: null,
      actor_label: '申請人 OTP 驗證',
      action: accepted
        ? 'WAITLIST_OFFER_ACCEPTED'
        : 'WAITLIST_OFFER_DEFERRED',
      previous_status: 'waiting',
      new_status: accepted ? 'pending' : 'waiting',
      note: accepted
        ? '申請人已確認接受本次候補遞補名額'
        : '申請人本次暫不遞補，保留候補資格並移至隊尾',
      metadata: {
        waiting_list_id: waiting.id,
        wait_no: waiting.wait_no,
        vehicle_type: waiting.vehicle_type,
        otp_challenge_id: challenge.id,
        hold_expires_at: result.hold_expires_at || null,
        new_wait_no: result.new_wait_no || null,
      },
    })

    await admin.from('online_audit_logs').insert({
      actor_user_id: null,
      parking_lot_id: waiting.parking_lot_id,
      application_id: application.id,
      action: accepted
        ? 'WAITLIST_CAPACITY_OFFER_ACCEPTED'
        : 'WAITLIST_CAPACITY_OFFER_DEFERRED',
      detail: {
        waiting_list_id: waiting.id,
        otp_challenge_id: challenge.id,
        hold_expires_at: result.hold_expires_at || null,
        new_wait_no: result.new_wait_no || null,
      },
    })

    await sendSms(
      phone,
      accepted
        ? `智驛科技月租候補：已收到您接受 ${lot?.name || '停車場'} ${vehicleTypeText(waiting.vehicle_type)}遞補名額的確認，管理人員將進行最終審核。`
        : `智驛科技月租候補：已收到您本次暫不遞補的確認，候補資格仍保留，將依新順位等待後續名額。`
    )

    return NextResponse.json({
      ok: true,
      decision,
      hold_expires_at: result.hold_expires_at || null,
      new_wait_no: result.new_wait_no || null,
    })
  } catch (error: any) {
    return publicFailure('waitlist-offer-post', error, '候補回覆暫時無法處理，請稍後再試。', 503)
  }
}
