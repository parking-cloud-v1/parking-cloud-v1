import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  getInitialPaymentBaselineDate,
  getNextCoverageStartDate,
  isRentalTermExhausted,
  nextPaidThroughDate,
} from '@/lib/monthly-rental-cycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整。')
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

function validDate(value: unknown) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}


async function bindNextRentalTermIfNeeded(admin: any, rental: any, paymentDate: string) {
  if (!isRentalTermExhausted({
    paidThroughDate: rental?.paid_through_date,
    termEndDate: rental?.system_cycle_end_date,
  })) {
    return rental
  }

  const currentEnd = validDate(rental?.system_cycle_end_date)
  const lotId = String(rental?.parking_lot_id || '').trim()
  if (!currentEnd || !lotId) return rental

  const { data: nextTerm, error: nextTermError } = await admin
    .from('parking_lot_rental_terms')
    .select('id,start_date,end_date,term_name')
    .eq('parking_lot_id', lotId)
    .gt('start_date', currentEnd)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (nextTermError || !nextTerm?.id || !nextTerm.start_date || !nextTerm.end_date) {
    return rental
  }

  // 正式租約到期後才切換下一期；即使下一期已預先建立，也不在開始日前提早切約。
  if (!validDate(paymentDate) || paymentDate < nextTerm.start_date) {
    return rental
  }

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
    if (!user) return NextResponse.json({ error: '請重新登入。' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role,is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.is_active || !['manager', 'supervisor'].includes(String(profile.role || ''))) {
      return NextResponse.json({ error: '沒有付款確認權限。' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const reviewId = String(body?.reviewId || '').trim()
    const action = String(body?.action || '').trim()
    const approvedMonths = Number(body?.approvedMonths || 0)
    const notes = String(body?.notes || '').trim().slice(0, 1000)

    if (!reviewId || !['approve', 'refund_repay'].includes(action)) {
      return NextResponse.json({ error: '確認資料不完整。' }, { status: 400 })
    }

    const { data: review, error: reviewError } = await supabase
      .from('monthly_payment_reviews')
      .select('id,monthly_rental_id,monthly_payment_id,status')
      .eq('id', reviewId)
      .maybeSingle()

    if (reviewError || !review) {
      return NextResponse.json({ error: '找不到待確認付款。' }, { status: 404 })
    }

    if (review.status !== 'pending') {
      return NextResponse.json({ error: '這筆付款已經處理過。' }, { status: 409 })
    }

    const { data: rental, error: rentalError } = await supabase
      .from('monthly_rentals')
      .select('id,parking_lot_id,system_term_id,system_cycle_start_date,system_cycle_end_date,paid_through_date')
      .eq('id', review.monthly_rental_id)
      .maybeSingle()

    if (rentalError || !rental) {
      return NextResponse.json({ error: '找不到對應月租戶。' }, { status: 404 })
    }

    const admin = serviceClient()
    let reviewPaymentDate: string | null = null

    if (action === 'approve') {
      if (!review.monthly_payment_id) {
        return NextResponse.json({ error: '這筆待確認付款缺少正式付款紀錄，無法判斷應從哪個共同週期起算。' }, { status: 400 })
      }

      const { data: payment, error: paymentError } = await admin
        .from('monthly_payments')
        .select('payment_date')
        .eq('id', review.monthly_payment_id)
        .maybeSingle()

      reviewPaymentDate = validDate(payment?.payment_date)

      if (paymentError || !reviewPaymentDate) {
        return NextResponse.json({ error: '找不到這筆正式付款的付款日期，無法判斷起算週期。' }, { status: 400 })
      }
    }

    if (action === 'approve') {
      await bindNextRentalTermIfNeeded(admin, rental, reviewPaymentDate!)

      if (review.monthly_payment_id && rental.system_cycle_start_date && rental.system_cycle_end_date) {
        await admin
          .from('monthly_payments')
          .update({
            rental_start_date: rental.system_cycle_start_date,
            rental_end_date: rental.system_cycle_end_date,
          })
          .eq('id', review.monthly_payment_id)
      }
    }

    let appliedFromDate: string | null = null
    let paidThroughDate: string | null = null

    if (action === 'approve') {
      if (!Number.isInteger(approvedMonths) || approvedMonths <= 0 || approvedMonths > 24) {
        return NextResponse.json({ error: '請輸入 1～24 個月的確認月數。' }, { status: 400 })
      }

      if (!rental.system_cycle_start_date || !rental.system_cycle_end_date) {
        return NextResponse.json({ error: '這位月租戶尚未綁定本系統正式租期，請先設定租期。' }, { status: 400 })
      }

      const initialBaseline = rental.paid_through_date
        ? rental.paid_through_date
        : getInitialPaymentBaselineDate({
            paymentDate: reviewPaymentDate!,
            termStartDate: rental.system_cycle_start_date,
            termEndDate: rental.system_cycle_end_date,
            reminderDays: 15,
          })

      appliedFromDate = getNextCoverageStartDate({
        currentPaidThroughDate: initialBaseline,
        termStartDate: rental.system_cycle_start_date,
      }) || null

      paidThroughDate = nextPaidThroughDate({
        currentPaidThroughDate: initialBaseline,
        termStartDate: rental.system_cycle_start_date,
        termEndDate: rental.system_cycle_end_date,
        months: approvedMonths,
      }) || null

      if (!paidThroughDate || !appliedFromDate) {
        return NextResponse.json({
          error: '指定月數會超出目前正式租期，請先建立／切換下一個正式租期，或改成不超出租期的月數。',
        }, { status: 400 })
      }
    }

    const { data: resolved, error: resolveError } = await admin.rpc(
      'resolve_monthly_payment_review',
      {
        p_review_id: reviewId,
        p_action: action,
        p_approved_months: action === 'approve' ? approvedMonths : null,
        p_applied_from_date: appliedFromDate,
        p_paid_through_date: paidThroughDate,
        p_expected_paid_through_date: rental.paid_through_date || null,
        p_resolution_notes: notes || null,
        p_resolved_by: user.id,
      }
    )

    if (resolveError) {
      const message = String(resolveError.message || '')
      if (message.includes('already resolved')) {
        return NextResponse.json({ error: '這筆付款已經處理過。' }, { status: 409 })
      }
      if (message.includes('paid-through date changed')) {
        return NextResponse.json({ error: '這位月租戶的已繳期限剛被其他付款更新，請重新整理後再確認。' }, { status: 409 })
      }
      return NextResponse.json({ error: `付款確認失敗：${message || '資料庫交易失敗'}` }, { status: 500 })
    }

    const result = Array.isArray(resolved) ? resolved[0] : resolved
    return NextResponse.json({
      ok: true,
      action,
      approvedMonths: action === 'approve' ? approvedMonths : 0,
      paidThroughDate: result?.resulting_paid_through_date || paidThroughDate || rental.paid_through_date || null,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '付款確認失敗。' }, { status: 500 })
  }
}
