import { createHash, randomInt, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/sms/sendSms'
import { consumePublicRateLimit, hashOtpCode, publicFailure, rateLimitResponse } from '@/lib/security/publicSecurity'

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function maskPhone(phone: string) {
  if (!/^09\d{8}$/.test(phone)) return '已驗證手機'
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = String(body?.token || '').trim()

    if (!token) {
      return NextResponse.json(
        { error: '缺少簽約 token。' },
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
      scope: 'otp_contract_sign_ip', subject: tokenHash(token), limit: 20, windowSeconds: 600,
    })
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit)

    const { data: contract } = await admin
      .from('contracts')
      .select(
        'id,parking_lot_id,phone,status,sign_token_expires_at,sign_token_used_at'
      )
      .eq('sign_token_hash', tokenHash(token))
      .maybeSingle()

    if (!contract) {
      return NextResponse.json(
        { error: '簽約連結不存在。' },
        { status: 404 }
      )
    }

    if (contract.status === 'signed' || contract.sign_token_used_at) {
      return NextResponse.json(
        { error: '此契約已完成簽署。' },
        { status: 409 }
      )
    }

    if (
      !contract.sign_token_expires_at ||
      new Date(contract.sign_token_expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: '簽約連結已過期。' },
        { status: 410 }
      )
    }

    const phone = String(contract.phone || '').replace(/\s+/g, '')

    if (!/^09\d{8}$/.test(phone)) {
      return NextResponse.json(
        { error: '契約手機號碼格式不正確，請聯絡管理人員。' },
        { status: 400 }
      )
    }

    const phoneLimit = await consumePublicRateLimit(admin, request, {
      scope: 'otp_contract_sign_phone', includeIp: false, subject: phone, limit: 5, windowSeconds: 600,
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
      .eq('purpose', 'contract_sign')
      .eq('contract_id', contract.id)
      .gte('created_at', oneMinuteAgo)
      .limit(1)

    if (recentOne?.length) {
      return NextResponse.json(
        { error: '簽署驗證碼剛剛已發送，請稍後再試。' },
        { status: 429 }
      )
    }

    const { count } = await admin
      .from('public_otp_challenges')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phone)
      .eq('purpose', 'contract_sign')
      .gte('created_at', tenMinutesAgo)

    if ((count || 0) >= 5) {
      return NextResponse.json(
        { error: '簽署驗證碼發送次數過多，請稍後再試。' },
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
        parking_lot_id: contract.parking_lot_id,
        phone,
        code_hash: hashOtpCode(challengeId, code),
        expires_at: expiresAt,
        purpose: 'contract_sign',
        contract_id: contract.id,
      })

    if (insertError) {
      console.error('[contract-sign-request-otp] challenge insert failed', insertError)
      return NextResponse.json(
        { error: '驗證服務暫時無法使用，請稍後再試。' },
        { status: 503 }
      )
    }

    const sms = await sendSms(
      phone,
      `智驛月租電子簽約驗證碼：${code}，5分鐘內有效。請勿提供給他人。`,
      code
    )

    if (!sms.ok) {
      await admin
        .from('public_otp_challenges')
        .delete()
        .eq('id', challengeId)

      return NextResponse.json(
        { error: '簽署驗證碼發送失敗，請稍後再試。' },
        { status: 503 }
      )
    }

    const responseBody: any = {
      ok: true,
      challenge_id: challengeId,
      expires_at: expiresAt,
      masked_phone: maskPhone(phone),
    }

    if (sms.debugCode) {
      responseBody.debug_code = sms.debugCode
    }

    return NextResponse.json(responseBody)
  } catch (error: any) {
    return publicFailure('contract-sign-request-otp', error, '簽署驗證服務暫時無法使用，請稍後再試。', 503)
  }
}
