import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { qualificationTypeForRentalType } from '@/lib/online-contracts/qualification'
import { consumePublicRateLimit, publicFailure, rateLimitResponse } from '@/lib/security/publicSecurity'

function parseDate(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(value: string, days: number) {
  const date = parseDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return dateString(date)
}

function addMonthsMinusOneDay(start: string, months: number) {
  const date = parseDate(start)
  date.setUTCMonth(date.getUTCMonth() + months)
  date.setUTCDate(date.getUTCDate() - 1)
  return dateString(date)
}

function todayTaipei() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const challengeId = String(body?.challenge_id || '').trim()
    const requestedMonths = Number(body?.requested_months)

    if (!challengeId) {
      return NextResponse.json(
        { error: '請先完成手機 OTP 驗證。' },
        { status: 400 }
      )
    }

    if (!Number.isInteger(requestedMonths) || requestedMonths < 1 || requestedMonths > 12) {
      return NextResponse.json(
        { error: '續租月數請選擇 1～12 個月。' },
        { status: 400 }
      )
    }

    if (!body?.privacy_agreed) {
      return NextResponse.json(
        { error: '尚未同意個資告知與續租申請資料使用。' },
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

    const submitLimit = await consumePublicRateLimit(admin, request, {
      scope: 'renewal_submit_ip',
      subject: challengeId,
      limit: 20,
      windowSeconds: 3600,
    })
    if (!submitLimit.allowed) return rateLimitResponse(submitLimit)

    const { data: challenge } = await admin
      .from('public_otp_challenges')
      .select(`
        id,parking_lot_id,monthly_rental_id,phone,purpose,
        verified_at,consumed_at,expires_at
      `)
      .eq('id', challengeId)
      .maybeSingle()

    if (
      !challenge ||
      challenge.purpose !== 'renewal_application' ||
      !challenge.monthly_rental_id ||
      !challenge.verified_at ||
      challenge.consumed_at
    ) {
      return NextResponse.json(
        { error: '續租手機驗證狀態無效，請重新驗證。' },
        { status: 400 }
      )
    }

    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: '驗證碼已過期，請重新取得。' },
        { status: 410 }
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

    const { data: rental, error: rentalError } = await admin
      .from('monthly_rentals')
      .select(`
        id,parking_lot_id,customer_code,customer_name,phone,vehicle_plate,
        vehicle_type,rental_type,start_date,end_date,monthly_fee,rental_status
      `)
      .eq('id', challenge.monthly_rental_id)
      .eq('parking_lot_id', challenge.parking_lot_id)
      .neq('rental_status', 'cancelled')
      .maybeSingle()

    if (rentalError || !rental) {
      return NextResponse.json(
        { error: '原月租資料已不存在或目前不可續租。' },
        { status: 404 }
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
        { error: '此月租已有續租案件正在處理，請勿重複送件。' },
        { status: 409 }
      )
    }

    const today = todayTaipei()
    const currentEnd = String(rental.end_date || '').trim()
    const suggestedStart =
      currentEnd && currentEnd >= today ? addDays(currentEnd, 1) : today
    const suggestedEnd = addMonthsMinusOneDay(
      suggestedStart,
      requestedMonths
    )

    const rentalType = String(rental.rental_type || '一般').trim() || '一般'
    const qualificationType = qualificationTypeForRentalType(rentalType)
    const qualificationStatus =
      qualificationType === 'none' ? 'not_required' : 'pending'
    const now = new Date().toISOString()

    const { data: application, error: applicationError } = await admin
      .from('rental_applications')
      .insert({
        application_kind: 'renewal',
        existing_monthly_rental_id: rental.id,
        renewal_requested_months: requestedMonths,
        renewal_current_end_date: rental.end_date || null,
        renewal_suggested_start_date: suggestedStart,
        renewal_suggested_end_date: suggestedEnd,
        parking_lot_id: rental.parking_lot_id,
        customer_code: String(rental.customer_code || '').trim(),
        applicant_name: String(rental.customer_name || '').trim(),
        phone: String(rental.phone || challenge.phone || '').trim(),
        vehicle_plate: String(rental.vehicle_plate || '').trim().toUpperCase(),
        vehicle_type: rental.vehicle_type,
        rental_type: rentalType,
        qualification_type: qualificationType,
        qualification_status: qualificationStatus,
        otp_challenge_id: challenge.id,
        otp_verified: true,
        otp_verified_at: challenge.verified_at,
        privacy_agreed: true,
        privacy_agreed_at: now,
        status: 'pending',
        review_note: `既有月租線上續租申請：希望續租 ${requestedMonths} 個月`,
      })
      .select('id,status,customer_code,qualification_type,qualification_status')
      .single()

    if (applicationError || !application) {
      const duplicate = String(applicationError?.message || '').toLowerCase().includes('unique')
      return NextResponse.json(
        {
          error: duplicate
            ? '此月租已有續租案件正在處理，請勿重複送件。'
            : '續租申請暫時無法建立，請稍後再試。',
        },
        { status: duplicate ? 409 : 500 }
      )
    }

    await admin
      .from('public_otp_challenges')
      .update({ consumed_at: now })
      .eq('id', challenge.id)
      .is('consumed_at', null)

    // 有效中的原月租會被 phase17 capacity RPC 判定為 existing_rental，
    // 不增加車位占用也不會因「剩餘 0」被轉候補。
    // 若已過期且目前真的額滿，仍依場站規則公平進入候補。
    const { data: capacityResult, error: capacityError } = await admin.rpc(
      'auto_waitlist_online_application_if_full',
      { p_application_id: application.id }
    )

    await admin.from('online_application_reviews').insert({
      application_id: application.id,
      parking_lot_id: rental.parking_lot_id,
      actor_user_id: null,
      actor_label: 'public-renewal',
      action: 'RENEWAL_REQUESTED',
      previous_status: null,
      new_status: capacityResult?.waitlisted ? 'waiting' : 'pending',
      qualification_status: qualificationStatus,
      note: `既有月租戶完成 OTP，提出續租 ${requestedMonths} 個月`,
      metadata: {
        existing_monthly_rental_id: rental.id,
        customer_code: rental.customer_code,
        previous_end_date: rental.end_date,
        suggested_start_date: suggestedStart,
        suggested_end_date: suggestedEnd,
        capacity: capacityResult || null,
      },
    })

    await admin.from('online_audit_logs').insert({
      actor_user_id: null,
      parking_lot_id: rental.parking_lot_id,
      application_id: application.id,
      action: 'RENEWAL_APPLICATION_SUBMITTED',
      detail: {
        existing_monthly_rental_id: rental.id,
        requested_months: requestedMonths,
        previous_end_date: rental.end_date,
        suggested_start_date: suggestedStart,
        suggested_end_date: suggestedEnd,
        capacity_status: capacityResult || null,
        capacity_error: capacityError?.message || null,
      },
    })

    const autoWaitlisted = Boolean(capacityResult?.waitlisted)

    return NextResponse.json({
      ok: true,
      application_id: application.id,
      status: autoWaitlisted ? 'waiting' : 'pending',
      customer_code: application.customer_code,
      current_end_date: rental.end_date,
      suggested_start_date: suggestedStart,
      suggested_end_date: suggestedEnd,
      requested_months: requestedMonths,
      auto_waitlisted: autoWaitlisted,
      waiting_no: capacityResult?.wait_no || null,
      capacity_warning: capacityError ? '名額判斷稍後由管理人員確認。' : null,
    })
  } catch (error: any) {
    return publicFailure(
      'renewal-submit',
      error,
      '續租申請暫時無法處理，請稍後再試。',
      503
    )
  }
}
