import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { consumePublicRateLimit, hashOtpCode, publicFailure, rateLimitResponse } from '@/lib/security/publicSecurity'

function safeEqualHex(a: string, b: string) {
  try {
    const aa = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    return aa.length === bb.length && timingSafeEqual(aa, bb)
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const challengeId = String(body?.challenge_id || '').trim()
    const code = String(body?.code || '').trim()

    if (!challengeId || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: '驗證資料不完整。' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: '服務暫時無法使用，請稍後再試。' }, { status: 500 })
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    })

    const verifyLimit = await consumePublicRateLimit(admin, request, {
      scope: 'otp_verify_ip', subject: challengeId, limit: 30, windowSeconds: 600,
    })
    if (!verifyLimit.allowed) return rateLimitResponse(verifyLimit)

    const { data: challenge } = await admin
      .from('public_otp_challenges')
      .select('id,code_hash,expires_at,verified_at,consumed_at,attempts')
      .eq('id', challengeId)
      .maybeSingle()

    if (!challenge) {
      return NextResponse.json({ error: '驗證碼不存在或已失效。' }, { status: 404 })
    }

    if (challenge.consumed_at) {
      return NextResponse.json({ error: '此驗證碼已使用。' }, { status: 409 })
    }

    if (challenge.verified_at) {
      return NextResponse.json({ ok: true })
    }

    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: '驗證碼已過期，請重新發送。' }, { status: 410 })
    }

    if ((challenge.attempts || 0) >= 5) {
      return NextResponse.json({ error: '驗證錯誤次數過多，請重新發送。' }, { status: 429 })
    }

    const expected = hashOtpCode(challengeId, code)
    if (!safeEqualHex(expected, challenge.code_hash)) {
      await admin
        .from('public_otp_challenges')
        .update({ attempts: Number(challenge.attempts || 0) + 1 })
        .eq('id', challengeId)

      return NextResponse.json({ error: '驗證碼錯誤。' }, { status: 400 })
    }

    const verifiedAt = new Date().toISOString()
    const { error } = await admin
      .from('public_otp_challenges')
      .update({ verified_at: verifiedAt })
      .eq('id', challengeId)

    if (error) {
      console.error('[otp-verify] update failed', error)
      return NextResponse.json({ error: '驗證服務暫時無法使用，請稍後再試。' }, { status: 503 })
    }

    return NextResponse.json({ ok: true, verified_at: verifiedAt })
  } catch (error: any) {
    return publicFailure('otp-verify', error, '驗證服務暫時無法使用，請稍後再試。', 503)
  }
}
