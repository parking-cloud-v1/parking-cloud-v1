import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  isDateOnly,
  planPaidThroughCorrection,
} from '@/lib/monthly-paid-through-correction'

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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '登入狀態已失效，請重新登入。' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role,is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile?.is_active || profile.role !== 'supervisor') {
      return NextResponse.json({ error: '只有主管可以校正已繳至日期。' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const rentalId = safeText(body?.rentalId, 80)
    const paidThroughDate = safeText(body?.paidThroughDate, 20)

    if (!rentalId || !isDateOnly(paidThroughDate)) {
      return NextResponse.json({ error: '校正資料不完整。' }, { status: 400 })
    }

    const admin = serviceClient()

    const { data: rental, error: rentalError } = await admin
      .from('monthly_rentals')
      .select(`
        id,parking_lot_id,customer_code,customer_name,vehicle_plate,
        rental_status,system_cycle_start_date,system_cycle_end_date,
        paid_through_date,payment_status
      `)
      .eq('id', rentalId)
      .maybeSingle()

    if (rentalError || !rental?.id) {
      return NextResponse.json({ error: '找不到這筆月租資料。' }, { status: 404 })
    }

    if (rental.rental_status === 'cancelled') {
      return NextResponse.json({ error: '已退租資料不能校正已繳至日期。' }, { status: 400 })
    }

    const { data: payments, error: paymentsError } = await admin
      .from('monthly_payments')
      .select(`
        id,applied_from_date,applied_to_date,applied_months,
        cycle_application_status,created_at,notes
      `)
      .eq('monthly_rental_id', rentalId)
      .eq('cycle_application_status', 'applied')
      .not('applied_to_date', 'is', null)
      .order('applied_to_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (paymentsError) {
      return NextResponse.json({ error: '正式付款紀錄讀取失敗。' }, { status: 500 })
    }

    const plan = planPaidThroughCorrection({
      targetDate: paidThroughDate,
      termStartDate: rental.system_cycle_start_date,
      termEndDate: rental.system_cycle_end_date,
      payments: payments || [],
    })

    if (!plan.ok) {
      return NextResponse.json({ error: plan.error }, { status: 400 })
    }

    const now = new Date().toISOString()
    const paymentById = new Map((payments || []).map((payment: any) => [String(payment.id), payment]))

    for (const update of plan.paymentUpdates) {
      const original: any = paymentById.get(update.id)
      const existingNotes = safeText(original?.notes, 1600)
      const correctionNote = `主管校正已繳至：${plan.targetDate}`
      const notes = existingNotes
        ? `${existingNotes}\n${correctionNote}`.slice(0, 2000)
        : correctionNote

      if (update.action === 'exclude') {
        const { error } = await admin
          .from('monthly_payments')
          .update({
            cycle_application_status: 'refund_repay',
            applied_months: null,
            applied_from_date: null,
            applied_to_date: null,
            notes,
          })
          .eq('id', update.id)
          .eq('monthly_rental_id', rentalId)
          .eq('cycle_application_status', 'applied')

        if (error) {
          return NextResponse.json({ error: '付款紀錄排除失敗，尚未完成校正。' }, { status: 500 })
        }
      } else {
        const { error } = await admin
          .from('monthly_payments')
          .update({
            applied_months: update.applied_months,
            applied_from_date: update.applied_from_date,
            applied_to_date: update.applied_to_date,
            notes,
          })
          .eq('id', update.id)
          .eq('monthly_rental_id', rentalId)
          .eq('cycle_application_status', 'applied')

        if (error) {
          return NextResponse.json({ error: '付款週期校正失敗，尚未完成校正。' }, { status: 500 })
        }
      }
    }

    const { error: rentalUpdateError } = await admin
      .from('monthly_rentals')
      .update({
        paid_through_date: plan.targetDate,
        payment_status: 'paid',
        updated_at: now,
      })
      .eq('id', rentalId)
      .neq('rental_status', 'cancelled')

    if (rentalUpdateError) {
      return NextResponse.json({
        error: '付款紀錄已校正，但月租主檔更新失敗；請重新整理後再按一次校正。',
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      paidThroughDate: plan.targetDate,
      correctedPayments: plan.paymentUpdates.length,
    })
  } catch (error) {
    console.error('[monthly-paid-through-correction] unexpected error', error)
    return NextResponse.json({ error: '校正已繳至日期失敗，請稍後再試。' }, { status: 500 })
  }
}
