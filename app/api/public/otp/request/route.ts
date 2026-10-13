import { randomInt, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getLotApplicationAvailability } from '@/lib/online-contracts/applicationAvailability'
import { consumePublicRateLimit, hashOtpCode, publicFailure, rateLimitResponse } from '@/lib/security/publicSecurity'

const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\s+/g, '').trim()
}

function generateCaptchaCode(length = 6) {
  let value = ''
  for (let i = 0; i < length; i += 1) {
    value += CAPTCHA_CHARS[randomInt(0, CAPTCHA_CHARS.length)]
  }
  return value
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[char] || char))
}

function captchaSvgDataUri(code: string) {
  const glyphs = code.split('').map((char, index) => {
    const x = 28 + index * 34
    const y = 48 + randomInt(-5, 6)
    const rotate = randomInt(-14, 15)
    return `<text x="${x}" y="${y}" transform="rotate(${rotate} ${x} ${y})" font-size="30" font-family="Arial, sans-serif" font-weight="700" fill="#0f172a">${escapeXml(char)}</text>`
  }).join('')

  const noise = Array.from({ length: 7 }, () => {
    const x1 = randomInt(0, 230)
    const y1 = randomInt(4, 62)
    const x2 = randomInt(0, 230)
    const y2 = randomInt(4, 62)
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="1" opacity="0.55"/>`
  }).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="230" height="68" viewBox="0 0 230 68"><rect width="230" height="68" rx="10" fill="#f8fafc"/><g>${noise}</g>${glyphs}</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const phone = normalizePhone(body?.phone)
    const parkingLotId = String(body?.parking_lot_id || '').trim()

    // 手機現在只做聯絡資料，不代表門號本人驗證；仍先檢查格式，避免送出錯誤聯絡電話。
    if (!/^09\d{8}$/.test(phone)) {
      return NextResponse.json(
        { error: '請輸入正確的 10 碼手機號碼，例如 0912345678。' },
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

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    const ipLimit = await consumePublicRateLimit(admin, request, {
      scope: 'web_captcha_request_ip', subject: parkingLotId, limit: 30, windowSeconds: 600,
    })
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit)

    const phoneLimit = await consumePublicRateLimit(admin, request, {
      scope: 'web_captcha_request_phone', includeIp: false, subject: `${parkingLotId}|${phone}`, limit: 15, windowSeconds: 600,
    })
    if (!phoneLimit.allowed) return rateLimitResponse(phoneLimit)

    const availability = await getLotApplicationAvailability(admin, parkingLotId)
    if (!availability.open) {
      return NextResponse.json(
        { error: availability.reason || '此停車場目前未開放線上月租申請。' },
        { status: 403 }
      )
    }

    const challengeId = randomUUID()
    const code = generateCaptchaCode(6)
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
      console.error('[web-captcha-request] challenge insert failed', insertError)
      return NextResponse.json({ error: '驗證服務暫時無法使用，請稍後再試。' }, { status: 503 })
    }

    return NextResponse.json({
      ok: true,
      challenge_id: challengeId,
      expires_at: expiresAt,
      captcha_image: captchaSvgDataUri(code),
    })
  } catch (error: any) {
    return publicFailure('web-captcha-request', error, '驗證服務暫時無法使用，請稍後再試。', 503)
  }
}
