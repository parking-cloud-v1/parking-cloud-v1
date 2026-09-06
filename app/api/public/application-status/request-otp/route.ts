import { randomInt, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/sms/sendSms'
import { consumePublicRateLimit, hashOtpCode, publicFailure, rateLimitResponse } from '@/lib/security/publicSecurity'

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\s+/g, '').trim()
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const applicationId = String(body?.application_id || '').trim()
    const phone = normalizePhone(body?.phone)

    if (!isUuid(applicationId)) {
      return NextResponse.json(
        { error: '申請編號格式不正確。' },
        { status: 400 }
      )
    }

    if (!/^09\d{8}$/.test(phone)) {
      return NextResponse.json(
        { error: '請輸入申請時使用的台灣手機號碼。' },
        { status: 400 }
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: '服務暫時無法使用，請稍後再試。' },
        { status: 500 }
      )
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    })

    const ipLimit = await consumePublicRateLimit(admin, request, {
      scope: 'otp_status_ip', subject: applicationId, limit: 20, windowSeconds: 600,
    })
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit)

    const phoneLimit = await consumePublicRateLimit(admin, request, {
      scope: 'otp_status_phone', includeIp: false, subject: phone, limit: 5, windowSeconds: 600,
    })
    if (!phoneLimit.allowed) return rateLimitResponse(phoneLimit)

    // 申請編號與原申請手機必須同時吻合，才允許寄出查詢 OTP。
    const { data: application, error: applicationError } = await admin
      .from('rental_applications')
      .select('id,parking_lot_id,phone')
      .eq('id', applicationId)
      .eq('phone', phone)
      .maybeSingle()

    if (applicationError) {
      return NextResponse.json(
        { error: '查詢服務暫時無法使用，請稍後再試。' },
        { status: 500 }
      )
    }

    if (!application) {
      return NextResponse.json(
        { error: '找不到符合申請編號與手機號碼的案件。' },
        { status: 404 }
      )
    }

    // 60 秒內不可重複發送；10 分鐘最多 5 次。
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
    const tenMinutesAgo = new Date(
      Date.now() - 10 * 60_000
    ).toISOString()

    const { data: recentOne } = await admin
      .from('public_otp_challenges')
      .select('id')
      .eq('phone', phone)
      .eq('purpose', 'application_status')
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
      .eq('purpose', 'application_status')
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
        parking_lot_id: application.parking_lot_id,
        application_id: application.id,
        phone,
        purpose: 'application_status',
        code_hash: hashOtpCode(challengeId, code),
        expires_at: expiresAt,
      })

    if (insertError) {
      console.error('[application-status-request-otp] challenge insert failed', insertError)
      return NextResponse.json(
        { error: '驗證服務暫時無法使用，請稍後再試。' },
        { status: 503 }
      )
    }

    const sms = await sendSms(
      phone,
      `智驛月租申請進度查詢驗證碼：${code}，5分鐘內有效。請勿提供給他人。`,
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

    const result: Record<string, any> = {
      ok: true,
      challenge_id: challengeId,
      expires_at: expiresAt,
    }

    if (sms.debugCode) {
      result.debug_code = sms.debugCode
    }

    return NextResponse.json(result)
  } catch (error: any) {
    return publicFailure('application-status-request-otp', error, '查詢驗證服務暫時無法使用，請稍後再試。', 503)
  }
}
