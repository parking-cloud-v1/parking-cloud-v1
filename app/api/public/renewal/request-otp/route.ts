import { randomInt, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/sms/sendSms'
import { consumePublicRateLimit, hashOtpCode, publicFailure, rateLimitResponse } from '@/lib/security/publicSecurity'

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\s+/g, '').trim()
}

function normalizeCode(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

function plateKey(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function dateDaysAgo(days: number) {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parkingLotId = String(body?.parking_lot_id || '').trim()
    const customerCode = normalizeCode(body?.customer_code)
    const phone = normalizePhone(body?.phone)
    const requestedPlateKey = plateKey(body?.vehicle_plate)

    if (!parkingLotId || !customerCode || !requestedPlateKey) {
      return NextResponse.json(
        { error: '請完整輸入停車場、客戶編號與車牌。' },
        { status: 400 }
      )
    }

    if (!/^09\d{8}$/.test(phone)) {
      return NextResponse.json(
        { error: '請輸入原月租資料登記的手機號碼。' },
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
      scope: 'otp_renewal_ip', subject: parkingLotId, limit: 20, windowSeconds: 600,
    })
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit)

    const identityLimit = await consumePublicRateLimit(admin, request, {
      scope: 'otp_renewal_identity', includeIp: false, subject: `${parkingLotId}|${customerCode}|${phone}|${requestedPlateKey}`, limit: 5, windowSeconds: 600,
    })
    if (!identityLimit.allowed) return rateLimitResponse(identityLimit)

    const { data: renewalSetting } = await admin
      .from('online_application_settings')
      .select('parking_lot_id,renewal_enabled')
      .eq('parking_lot_id', parkingLotId)
      .maybeSingle()

    if (!renewalSetting?.renewal_enabled) {
      return NextResponse.json(
        { error: '此停車場目前未開放線上續租。' },
        { status: 403 }
      )
    }

    const { data: candidateRows, error: rentalError } = await admin
      .from('monthly_rentals')
      .select(`
        id,parking_lot_id,customer_code,customer_name,phone,vehicle_plate,
        vehicle_type,rental_type,start_date,end_date,monthly_fee,rental_status
      `)
      .eq('parking_lot_id', parkingLotId)
      .eq('customer_code', customerCode)
      .neq('rental_status', 'cancelled')
      .limit(20)

    if (rentalError) {
      return NextResponse.json(
        { error: '月租資料讀取失敗。' },
        { status: 500 }
      )
    }

    const matching = (candidateRows || [])
      .filter((row: any) => normalizePhone(row.phone) === phone)
      .filter((row: any) => plateKey(row.vehicle_plate) === requestedPlateKey)
      .sort((a: any, b: any) =>
        String(b.end_date || '').localeCompare(String(a.end_date || ''))
      )

    const rental = matching[0]

    // 不回傳是哪一個欄位不吻合，避免公開端被拿來枚舉個資。
    if (!rental) {
      return NextResponse.json(
        { error: '查無符合的月租資料，請確認停車場、客戶編號、車牌與手機號碼。' },
        { status: 404 }
      )
    }

    if (rental.end_date && String(rental.end_date) < dateDaysAgo(90)) {
      return NextResponse.json(
        { error: '此月租已逾線上續租期限，請直接聯絡停車場管理人員。' },
        { status: 409 }
      )
    }

    const { data: activeRenewal } = await admin
      .from('rental_applications')
      .select('id,status')
      .eq('application_kind', 'renewal')
      .eq('existing_monthly_rental_id', rental.id)
      .in('status', [
        'pending',
        'needs_revision',
        'waiting',
        'approved',
        'contract_sent',
      ])
      .limit(1)

    if (activeRenewal?.length) {
      return NextResponse.json(
        { error: '此月租目前已有續租申請正在處理，請使用「申請進度查詢」查看狀態。' },
        { status: 409 }
      )
    }

    // 60 秒不可重發；10 分鐘最多 5 次。
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

    const { error: challengeError } = await admin
      .from('public_otp_challenges')
      .insert({
        id: challengeId,
        parking_lot_id: parkingLotId,
        monthly_rental_id: rental.id,
        phone,
        code_hash: hashOtpCode(challengeId, code),
        expires_at: expiresAt,
        purpose: 'renewal_application',
      })

    if (challengeError) {
      return NextResponse.json(
        { error: '驗證服務暫時無法使用，請稍後再試。' },
        { status: 500 }
      )
    }

    const sms = await sendSms(
      phone,
      `智驛月租續租驗證碼：${code}，5分鐘內有效。請勿提供給他人。`,
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

    const result: any = {
      ok: true,
      challenge_id: challengeId,
      expires_at: expiresAt,
    }

    if (sms.debugCode) result.debug_code = sms.debugCode

    return NextResponse.json(result)
  } catch (error: any) {
    return publicFailure('renewal-request-otp', error, '續租驗證服務暫時無法使用，請稍後再試。', 503)
  }
}
