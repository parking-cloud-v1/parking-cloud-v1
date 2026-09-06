import { randomInt, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/sms/sendSms'
import { getLotApplicationAvailability } from '@/lib/online-contracts/applicationAvailability'
import { consumePublicRateLimit, hashOtpCode, publicFailure, rateLimitResponse } from '@/lib/security/publicSecurity'

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\s+/g, '').trim()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const phone = normalizePhone(body?.phone)
    const parkingLotId = String(body?.parking_lot_id || '').trim()

    if (!/^09\d{8}$/.test(phone)) {
      return NextResponse.json(
        { error: '請輸入正確的台灣手機號碼，例如 0912345678。' },
        { status: 400 }
      )
    }

    if (!parkingLotId) {
      return NextResponse.json({ error: '缺少停車場資料。' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: '服務暫時無法使用，請稍後再試。' }, { status: 500 })
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    })

    const ipLimit = await consumePublicRateLimit(admin, request, {
      scope: 'otp_application_ip', subject: parkingLotId, limit: 20, windowSeconds: 600,
    })
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit)

    const phoneLimit = await consumePublicRateLimit(admin, request, {
      scope: 'otp_application_phone', includeIp: false, subject: `${parkingLotId}|${phone}`, limit: 5, windowSeconds: 600,
    })
    if (!phoneLimit.allowed) return rateLimitResponse(phoneLimit)

    const availability = await getLotApplicationAvailability(admin, parkingLotId)

    if (!availability.open) {
      return NextResponse.json(
        { error: availability.reason || '此停車場目前未開放線上月租申請。' },
        { status: 403 }
      )
    }

    // 60 秒內不可重複發送；10 分鐘最多 5 次
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString()

    const { data: recentOne } = await admin
      .from('public_otp_challenges')
      .select('id')
      .eq('phone', phone)
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
        parking_lot_id: parkingLotId,
        phone,
        code_hash: hashOtpCode(challengeId, code),
        expires_at: expiresAt,
      })

    if (insertError) {
      console.error('[otp-request] challenge insert failed', insertError)
      return NextResponse.json({ error: '驗證服務暫時無法使用，請稍後再試。' }, { status: 503 })
    }

    const sms = await sendSms(
      phone,
      `智驛月租停車驗證碼：${code}，5分鐘內有效。請勿提供給他人。`,
      code
    )

    if (!sms.ok) {
      await admin.from('public_otp_challenges').delete().eq('id', challengeId)
      return NextResponse.json(
        { error: '驗證碼發送失敗，請稍後再試。' },
        { status: 503 }
      )
    }

    const responseBody: any = {
      ok: true,
      challenge_id: challengeId,
      expires_at: expiresAt,
    }

    // 僅開發模式回傳；正式環境 OTP_DEV_MODE 不可設 true
    if (sms.debugCode) {
      responseBody.debug_code = sms.debugCode
    }

    return NextResponse.json(responseBody)
  } catch (error: any) {
    return publicFailure('otp-request', error, '驗證服務暫時無法使用，請稍後再試。', 503)
  }
}
