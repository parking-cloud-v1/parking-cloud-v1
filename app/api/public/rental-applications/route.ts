import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { qualificationTypeForRentalType } from '@/lib/online-contracts/qualification'
import { getLotApplicationAvailability } from '@/lib/online-contracts/applicationAvailability'
import { normalizeOnlineVehicleType } from '@/lib/online-contracts/capacity'
import { consumePublicRateLimit, publicFailure, rateLimitResponse } from '@/lib/security/publicSecurity'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const required = [
      'parking_lot_id',
      'applicant_name',
      'phone',
      'vehicle_plate',
      'otp_challenge_id',
    ]

    for (const key of required) {
      if (!String(body?.[key] || '').trim()) {
        return NextResponse.json(
          { error: `缺少欄位：${key}` },
          { status: 400 }
        )
      }
    }

    const inputLimits: Array<[string, number, string]> = [
      ['applicant_name', 100, '姓名'],
      ['email', 254, 'Email'],
      ['vehicle_plate', 20, '車牌'],
      ['rental_type', 80, '月租類型'],
      ['address', 500, '地址'],
      ['emergency_contact_name', 100, '緊急聯絡人'],
      ['emergency_contact_phone', 30, '緊急聯絡電話'],
    ]

    for (const [key, maxLength, label] of inputLimits) {
      if (String(body?.[key] || '').length > maxLength) {
        return NextResponse.json(
          { error: `${label}內容過長，請確認後再送出。` },
          { status: 400 }
        )
      }
    }

    if (!body.privacy_agreed) {
      return NextResponse.json(
        { error: '尚未同意個資告知事項。' },
        { status: 400 }
      )
    }

    const rentalType = String(body.rental_type || '一般').trim() || '一般'
    const qualificationType = qualificationTypeForRentalType(rentalType)
    const vehicleType = normalizeOnlineVehicleType(body.vehicle_type)

    if (
      qualificationType === 'resident' &&
      !String(body.address || '').trim()
    ) {
      return NextResponse.json(
        { error: '里民／住戶月租申請請填寫聯絡地址。' },
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

    const availability = await getLotApplicationAvailability(
      admin,
      String(body.parking_lot_id)
    )

    if (!availability.open) {
      return NextResponse.json(
        { error: availability.reason || '此停車場目前未開放線上月租申請。' },
        { status: 403 }
      )
    }

    const allowedRentalTypes =
      availability.setting?.allowed_rental_types || ['一般']

    if (!allowedRentalTypes.includes(rentalType)) {
      return NextResponse.json(
        { error: '此月租類型目前未開放線上申請。' },
        { status: 400 }
      )
    }

    const phone = String(body.phone).replace(/\s+/g, '').trim()
    const plate = String(body.vehicle_plate)
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')

    if (!/^09\d{8}$/.test(phone)) {
      return NextResponse.json(
        { error: '手機號碼格式不正確。' },
        { status: 400 }
      )
    }

    if (!plate) {
      return NextResponse.json(
        { error: '車牌格式不正確。' },
        { status: 400 }
      )
    }

    const ipLimit = await consumePublicRateLimit(admin, request, {
      scope: 'application_submit_ip',
      subject: String(body.parking_lot_id),
      limit: 20,
      windowSeconds: 3600,
    })
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit)

    const identityLimit = await consumePublicRateLimit(admin, request, {
      scope: 'application_submit_identity',
      includeIp: false,
      subject: `${body.parking_lot_id}|${phone}|${plate}`,
      limit: 5,
      windowSeconds: 3600,
    })
    if (!identityLimit.allowed) return rateLimitResponse(identityLimit)

    const { data: challenge } = await admin
      .from('public_otp_challenges')
      .select(
        'id,parking_lot_id,phone,verified_at,consumed_at,expires_at,purpose,contract_id'
      )
      .eq('id', body.otp_challenge_id)
      .maybeSingle()

    if (
      !challenge ||
      !challenge.verified_at ||
      challenge.consumed_at ||
      challenge.phone !== phone ||
      challenge.parking_lot_id !== body.parking_lot_id ||
      (challenge.purpose && challenge.purpose !== 'application') ||
      challenge.contract_id
    ) {
      return NextResponse.json(
        { error: '手機驗證狀態無效，請重新驗證。' },
        { status: 400 }
      )
    }

    if (
      new Date(challenge.verified_at).getTime() <
      Date.now() - 15 * 60_000
    ) {
      return NextResponse.json(
        { error: '手機驗證已逾時，請重新驗證。' },
        { status: 410 }
      )
    }

    const { data: existing } = await admin
      .from('rental_applications')
      .select('id,status')
      .eq('parking_lot_id', body.parking_lot_id)
      .ilike('vehicle_plate', plate)
      .in('status', [
        'pending',
        'needs_revision',
        'waiting',
        'approved',
        'contract_sent',
      ])
      .limit(1)

    if (existing?.length) {
      return NextResponse.json(
        { error: '此車牌目前已有申請案件，請勿重複送件。' },
        { status: 409 }
      )
    }

    const qualificationStatus =
      qualificationType !== 'none' ? 'pending' : 'not_required'

    const now = new Date().toISOString()

    const { data, error } = await admin
      .from('rental_applications')
      .insert({
        parking_lot_id: body.parking_lot_id,
        applicant_name: String(body.applicant_name).trim(),
        phone,
        email: body.email ? String(body.email).trim() : null,
        vehicle_plate: plate,
        vehicle_type: vehicleType,
        rental_type: rentalType,
        address: body.address ? String(body.address).trim() : null,
        emergency_contact_name: body.emergency_contact_name
          ? String(body.emergency_contact_name).trim()
          : null,
        emergency_contact_phone: body.emergency_contact_phone
          ? String(body.emergency_contact_phone).trim()
          : null,
        qualification_type: qualificationType,
        qualification_status: qualificationStatus,
        otp_challenge_id: challenge.id,
        otp_verified: true,
        otp_verified_at: challenge.verified_at,
        privacy_agreed: true,
        privacy_agreed_at: now,
        status: 'pending',
      })
      .select('id,qualification_type,qualification_status,status')
      .single()

    if (error || !data) {
      console.error('[rental-applications] insert failed', error)
      return NextResponse.json(
        { error: '申請暫時無法建立，請稍後再試。' },
        { status: 503 }
      )
    }

    await admin
      .from('public_otp_challenges')
      .update({ consumed_at: now })
      .eq('id', challenge.id)

    // 第十七階段：若此車種已滿且後台有開啟「額滿自動候補」，
    // 在 DB transaction 內直接轉入既有 monthly_waiting_list。
    const { data: capacityResult, error: capacityError } = await admin.rpc(
      'auto_waitlist_online_application_if_full',
      { p_application_id: data.id }
    )

    if (capacityError) {
      // 申請本身已成功建立，不因「自動候補判斷」異常讓民眾重複送件。
      await admin.from('online_audit_logs').insert({
        actor_user_id: null,
        parking_lot_id: body.parking_lot_id,
        application_id: data.id,
        action: 'CAPACITY_AUTO_WAITLIST_CHECK_FAILED',
        detail: { error: capacityError.message },
      })
    }

    const autoWaitlisted = Boolean(capacityResult?.waitlisted)

    return NextResponse.json({
      ok: true,
      id: data.id,
      status: autoWaitlisted ? 'waiting' : 'pending',
      qualification_type: data.qualification_type,
      qualification_status: data.qualification_status,
      auto_waitlisted: autoWaitlisted,
      waiting_no: capacityResult?.wait_no || null,
      capacity_full: Boolean(capacityResult?.full),
      capacity_check_warning: capacityError ? '名額判斷稍後由管理人員確認。' : null,
    })
  } catch (error: any) {
    return publicFailure(
      'rental-applications',
      error,
      '線上申請暫時無法處理，請稍後再試。',
      503
    )
  }
}
