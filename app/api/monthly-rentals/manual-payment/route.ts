import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  getInitialPaymentBaselineDate,
  getNextCoverageStartDate,
  isRentalTermExhausted,
  nextPaidThroughDate,
} from '@/lib/monthly-rental-cycle'
import {
  prepareManualPayment,
  type ManualPaymentRule,
} from '@/lib/monthly-manual-payment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整。')
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

function safeText(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function validDate(value: unknown) {
  const text = safeText(value, 20)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

async function bindNextRentalTermIfNeeded(admin: any, rental: any, paymentDate: string) {
  if (!isRentalTermExhausted({
    paidThroughDate: rental?.paid_through_date,
    termEndDate: rental?.system_cycle_end_date,
  })) {
    return rental
  }

  const currentEnd = validDate(rental?.system_cycle_end_date)
  const lotId = safeText(rental?.parking_lot_id, 80)
  if (!currentEnd || !lotId) return rental

  const { data: nextTerm, error } = await admin
    .from('parking_lot_rental_terms')
    .select('id,start_date,end_date')
    .eq('parking_lot_id', lotId)
    .gt('start_date', currentEnd)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !nextTerm?.id || !nextTerm.start_date || !nextTerm.end_date) {
    return rental
  }

  if (paymentDate < nextTerm.start_date) return rental

  const { error: bindError } = await admin
    .from('monthly_rentals')
    .update({
      system_term_id: nextTerm.id,
      system_cycle_start_date: nextTerm.start_date,
      system_cycle_end_date: nextTerm.end_date,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rental.id)

  if (bindError) return rental

  rental.system_term_id = nextTerm.id
  rental.system_cycle_start_date = nextTerm.start_date
  rental.system_cycle_end_date = nextTerm.end_date
  return rental
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '登入狀態已失效，請重新登入。' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const rentalId = safeText(body?.rentalId, 80)
    const paymentDate = validDate(body?.paymentDate)
    const invoiceNumber = safeText(body?.invoiceNumber, 100) || null
    const months = Number(body?.months || 0)
    const requestId = safeText(body?.requestId, 120)

    if (!rentalId || !paymentDate || !Number.isInteger(months) || months < 1 || !requestId) {
      return NextResponse.json({ error: '手動收款資料不完整。' }, { status: 400 })
    }

    // 先用登入者自己的 RLS 確認有權讀這位月租戶。
    const { data: allowedRental, error: accessError } = await supabase
      .from('monthly_rentals')
      .select(`
        id,parking_lot_id,customer_code,customer_name,phone,vehicle_plate,
        rental_type,vehicle_type,monthly_fee,rental_status,
        system_term_id,system_cycle_start_date,system_cycle_end_date,
        paid_through_date,payment_review_status
      `)
      .eq('id', rentalId)
      .maybeSingle()

    if (accessError || !allowedRental?.id) {
      return NextResponse.json({ error: '找不到月租資料或沒有操作權限。' }, { status: 403 })
    }

    if (allowedRental.rental_status === 'cancelled') {
      return NextResponse.json({ error: '已退租資料不能新增收款。' }, { status: 400 })
    }

    const admin = serviceClient()
    const rental: any = { ...allowedRental }

    await bindNextRentalTermIfNeeded(admin, rental, paymentDate)

    if (!rental.system_term_id || !rental.system_cycle_start_date || !rental.system_cycle_end_date) {
      return NextResponse.json({ error: '此月租戶尚未綁定正式租期，請先確認租期設定。' }, { status: 400 })
    }

    const { data: rulesData, error: rulesError } = await admin
      .from('monthly_rental_type_rules')
      .select('parking_lot_id,type_name,vehicle_type,match_amounts,base_monthly_fee,allowed_payment_months,priority,is_active')
      .eq('parking_lot_id', rental.parking_lot_id)
      .eq('is_active', true)

    if (rulesError) {
      return NextResponse.json({ error: '無法讀取月租類型設定。' }, { status: 500 })
    }

    const prepared = prepareManualPayment(
      {
        parkingLotId: rental.parking_lot_id,
        rentalType: rental.rental_type,
        vehicleType: rental.vehicle_type,
      },
      (rulesData || []) as ManualPaymentRule[],
      months,
    )

    if (!prepared.ok) {
      return NextResponse.json({ error: prepared.error, allowedMonths: prepared.allowedMonths }, { status: 400 })
    }

    const initialBaseline = rental.paid_through_date
      ? rental.paid_through_date
      : getInitialPaymentBaselineDate({
          paymentDate,
          termStartDate: rental.system_cycle_start_date,
          termEndDate: rental.system_cycle_end_date,
          reminderDays: 15,
        })

    const appliedFromDate = getNextCoverageStartDate({
      currentPaidThroughDate: initialBaseline,
      termStartDate: rental.system_cycle_start_date,
    })

    const newPaidThroughDate = nextPaidThroughDate({
      currentPaidThroughDate: initialBaseline,
      termStartDate: rental.system_cycle_start_date,
      termEndDate: rental.system_cycle_end_date,
      months: prepared.months,
    })

    if (!appliedFromDate || !newPaidThroughDate) {
      return NextResponse.json({
        error: '這次收款會超過目前正式租期；請先建立下一期正式租約後再收款。',
      }, { status: 400 })
    }

    const sourceReference = `manual_payment|${rentalId}|${requestId}`

    const { data: existing, error: existingError } = await admin
      .from('monthly_payments')
      .select('id,monthly_rental_id,cycle_application_status,applied_to_date')
      .eq('source_reference', sourceReference)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: '手動收款防重檢查失敗。' }, { status: 500 })
    }

    if (existing?.id) {
      if (safeText(existing.monthly_rental_id, 80) !== rentalId) {
        return NextResponse.json({ error: '這筆手動收款識別碼已被其他月租戶使用。' }, { status: 409 })
      }

      if (existing.cycle_application_status === 'applied') {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          paidThroughDate: existing.applied_to_date || rental.paid_through_date || null,
        })
      }

      return NextResponse.json({ error: '這筆手動收款先前未完整完成，請重新整理後再試。' }, { status: 409 })
    }

    const { data: payment, error: insertError } = await admin
      .from('monthly_payments')
      .insert({
        parking_lot_id: rental.parking_lot_id || null,
        monthly_rental_id: rentalId,
        customer_code: rental.customer_code || null,
        customer_name: rental.customer_name || null,
        phone: rental.phone || null,
        vehicle_plate: rental.vehicle_plate || null,
        payment_date: paymentDate,
        amount: prepared.amountPaid,
        payment_method: 'manual',
        invoice_number: invoiceNumber,
        rental_start_date: rental.system_cycle_start_date,
        rental_end_date: rental.system_cycle_end_date,
        source: 'manual',
        source_reference: sourceReference,
        notes: `後台手動收款：${prepared.months} 個月`,
        created_by: user.id,
        cycle_application_status: 'processing',
      })
      .select('id')
      .single()

    if (insertError || !payment?.id) {
      return NextResponse.json({ error: '手動收款紀錄建立失敗。' }, { status: 500 })
    }

    const { data: appliedRows, error: applyError } = await admin
      .rpc('apply_monthly_payment_cycle', {
        p_rental_id: rentalId,
        p_payment_id: payment.id,
        p_expected_paid_through_date: rental.paid_through_date || null,
        p_new_paid_through_date: newPaidThroughDate,
        p_payment_date: paymentDate,
        p_invoice_number: invoiceNumber,
        p_payment_source: 'manual',
        p_applied_months: prepared.months,
        p_applied_from_date: appliedFromDate,
      })

    const appliedResult = Array.isArray(appliedRows) ? appliedRows[0] : appliedRows
    if (applyError || !appliedResult?.applied) {
      await admin
        .from('monthly_payments')
        .update({ cycle_application_status: 'failed' })
        .eq('id', payment.id)
        .eq('cycle_application_status', 'processing')

      return NextResponse.json({ error: '手動收款已留存，但租期套用失敗；請勿重複收款，將畫面傳給管理員處理。' }, { status: 500 })
    }

    const { count: pendingReviews } = await admin
      .from('monthly_payment_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('monthly_rental_id', rentalId)
      .eq('status', 'pending')

    await admin
      .from('monthly_rentals')
      .update({
        payment_review_status: pendingReviews ? 'pending' : 'clear',
        updated_at: new Date().toISOString(),
      })
      .eq('id', rentalId)

    return NextResponse.json({
      ok: true,
      paidThroughDate: appliedResult.resulting_paid_through_date || newPaidThroughDate,
      months: prepared.months,
      amountPaid: prepared.amountPaid,
    })
  } catch (error: any) {
    console.error('[monthly-manual-payment] unexpected error', error)
    return NextResponse.json({ error: '手動收款失敗，請稍後再試。' }, { status: 500 })
  }
}
