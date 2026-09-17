import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  classifyPaymentAmount,
  getInitialPaymentBaselineDate,
  getNextCoverageStartDate,
  isRentalTermExhausted,
  nextPaidThroughDate,
} from '@/lib/monthly-rental-cycle'
import {
  resolvePaymentRuleByAmount,
  type MonthlyTypeRule,
} from '@/lib/monthly-payment-preview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PaymentRow = {
  rentalId: string
  parkingLotId?: string | null
  customerCode?: string | null
  customerName?: string | null
  phone?: string | null
  vehiclePlate?: string | null
  paymentDate?: string | null
  amountPaid?: number | null
  paymentMethod?: string | null
  invoiceNumber?: string | null
  sourceReference?: string | null
  notes?: string | null
  reportMonth?: string | null
  sourceKind?: 'payment_csv' | '408_excel'
}

type PaymentHistoryReconciliationResult = {
  hadHistory: boolean
  ok: boolean
  error?: string
  appliedCount?: number
}

type ReviewReason =
  | 'zero_amount'
  | 'non_multiple'
  | 'invalid_monthly_fee'
  | 'missing_system_term'
  | 'term_overflow'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整。')
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

function validDate(value: unknown) {
  const text = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function safeText(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max)
}

function normalizeVehicleType(value: unknown) {
  const normalized = safeText(value, 50).toLowerCase()
  if (['car', '汽車'].includes(normalized)) return 'car'
  if (['motorcycle', '機車'].includes(normalized)) return 'motorcycle'
  if (['heavy_motorcycle', '重機'].includes(normalized)) return 'heavy_motorcycle'
  return normalized
}


function sortPaymentRowsChronologically(rows: PaymentRow[]) {
  return [...rows].sort((a, b) => {
    const aDate = validDate(a.paymentDate) || '9999-12-31'
    const bDate = validDate(b.paymentDate) || '9999-12-31'
    if (aDate !== bDate) return aDate.localeCompare(bDate)

    const aMonth = safeText(a.reportMonth, 20)
    const bMonth = safeText(b.reportMonth, 20)
    if (aMonth !== bMonth) return aMonth.localeCompare(bMonth)

    return safeText(a.sourceReference, 300).localeCompare(
      safeText(b.sourceReference, 300),
    )
  })
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

async function reconcileRentalPaymentHistory(
  admin: any,
  rental: any,
  typeRules: MonthlyTypeRule[],
): Promise<PaymentHistoryReconciliationResult> {
  const rentalId = safeText(rental?.id, 80)
  if (!rentalId) return { hadHistory: false, ok: true }

  const { data: historyRows, error: historyError } = await admin
    .from('monthly_payments')
    .select(`
      id,source,payment_date,amount,invoice_number,cycle_application_status,
      applied_months,applied_from_date,applied_to_date,
      rental_start_date,rental_end_date,created_at
    `)
    .eq('monthly_rental_id', rentalId)
    .in('source', ['payment_csv', '408_excel', 'manual_payment'])
    .order('payment_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (historyError) {
    return { hadHistory: false, ok: false, error: historyError.message }
  }

  const history = historyRows || []
  if (!history.length) return { hadHistory: false, ok: true }

  let authoritativePaidThrough = ''
  let latestAppliedPaymentDate = ''
  let latestAppliedInvoice: string | null = null
  let appliedCount = 0

  for (const payment of history) {
    if (payment.cycle_application_status !== 'applied') continue

    const paymentDate = validDate(payment.payment_date)
    const termStart = validDate(payment.rental_start_date) || validDate(rental.system_cycle_start_date)
    const termEnd = validDate(payment.rental_end_date) || validDate(rental.system_cycle_end_date)
    if (!paymentDate || !termStart || !termEnd) {
      return { hadHistory: true, ok: false, error: '既有繳費歷史缺少付款日期或正式租期' }
    }

    let months = Number(payment.applied_months || 0)
    if (!Number.isInteger(months) || months <= 0) {
      const resolution = resolvePaymentRuleByAmount(
        {
          parkingLotId: rental.parking_lot_id,
          vehicleType: rental.vehicle_type,
        },
        Number(payment.amount || 0),
        typeRules,
      )
      months = resolution.kind === 'matched' ? resolution.months : 0
    }

    if (!Number.isInteger(months) || months <= 0) {
      return { hadHistory: true, ok: false, error: '既有已套用付款無法確認繳費月數' }
    }

    if (!authoritativePaidThrough) {
      authoritativePaidThrough = getInitialPaymentBaselineDate({
        paymentDate,
        termStartDate: termStart,
        termEndDate: termEnd,
        reminderDays: 15,
      })
    }

    if (!authoritativePaidThrough) {
      return { hadHistory: true, ok: false, error: '無法建立第一次中途導入基準' }
    }

    const appliedFromDate = getNextCoverageStartDate({
      currentPaidThroughDate: authoritativePaidThrough,
      termStartDate: termStart,
    })
    const appliedToDate = nextPaidThroughDate({
      currentPaidThroughDate: authoritativePaidThrough,
      termStartDate: termStart,
      termEndDate: termEnd,
      months,
    })

    if (!appliedFromDate || !appliedToDate) {
      return { hadHistory: true, ok: false, error: '既有付款重建時超出該筆正式租期' }
    }

    const { error: paymentUpdateError } = await admin
      .from('monthly_payments')
      .update({
        applied_months: months,
        applied_from_date: appliedFromDate,
        applied_to_date: appliedToDate,
      })
      .eq('id', payment.id)

    if (paymentUpdateError) {
      return { hadHistory: true, ok: false, error: paymentUpdateError.message }
    }

    authoritativePaidThrough = appliedToDate
    appliedCount++
    if (!latestAppliedPaymentDate || paymentDate >= latestAppliedPaymentDate) {
      latestAppliedPaymentDate = paymentDate
      latestAppliedInvoice = safeText(payment.invoice_number, 100) || null
    }
  }

  const { count: pendingReviews } = await admin
    .from('monthly_payment_reviews')
    .select('id', { count: 'exact', head: true })
    .eq('monthly_rental_id', rentalId)
    .eq('status', 'pending')

  const updateData: Record<string, unknown> = {
    payment_review_status: pendingReviews ? 'pending' : 'clear',
    updated_at: new Date().toISOString(),
  }

  if (authoritativePaidThrough) {
    updateData.paid_through_date = authoritativePaidThrough
    updateData.payment_status = 'paid'
    updateData.last_payment_source = 'payment_csv'
    if (latestAppliedPaymentDate) updateData.payment_date = latestAppliedPaymentDate
    if (latestAppliedInvoice) updateData.invoice_number = latestAppliedInvoice
  }

  const { error: rentalUpdateError } = await admin
    .from('monthly_rentals')
    .update(updateData)
    .eq('id', rentalId)

  if (rentalUpdateError) {
    return { hadHistory: true, ok: false, error: rentalUpdateError.message }
  }

  if (authoritativePaidThrough) {
    rental.paid_through_date = authoritativePaidThrough
    rental.payment_status = 'paid'
    rental.payment_date = latestAppliedPaymentDate || rental.payment_date
    if (latestAppliedInvoice) rental.invoice_number = latestAppliedInvoice
  }
  rental.payment_review_status = pendingReviews ? 'pending' : 'clear'

  return { hadHistory: true, ok: true, appliedCount }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '登入狀態已失效，請重新登入。' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const rows: PaymentRow[] = Array.isArray(body?.rows) ? body.rows : []
    if (!rows.length || rows.length > 1000) {
      return NextResponse.json({ error: '沒有可更新的繳費資料。' }, { status: 400 })
    }

    const orderedRows = sortPaymentRowsChronologically(rows)
    const ids = [...new Set(orderedRows.map((r) => safeText(r.rentalId, 80)).filter(Boolean))]

    const { data: allowedRows, error: accessError } = await supabase
      .from('monthly_rentals')
      .select(`
        id,parking_lot_id,customer_code,customer_name,phone,vehicle_plate,
        rental_type,vehicle_type,monthly_fee,payment_status,payment_date,invoice_number,
        system_term_id,system_cycle_start_date,system_cycle_end_date,
        paid_through_date,payment_review_status
      `)
      .in('id', ids)

    if (accessError) {
      console.error('[monthly-payment-sync] access check failed', accessError.message)
      return NextResponse.json({ error: '無法確認月租資料存取權限。' }, { status: 403 })
    }

    const allowed = new Map((allowedRows || []).map((r: any) => [String(r.id), r]))
    const admin = serviceClient()

    const lotIds = [...new Set((allowedRows || [])
      .map((r: any) => safeText(r.parking_lot_id, 80))
      .filter(Boolean))]

    let typeRules: MonthlyTypeRule[] = []
    if (lotIds.length) {
      // 不再把欄位清單寫死在 PostgREST select。
      // 正式資料庫曾有 match_amounts / base_monthly_fee 過渡版本；
      // select('*') 可避免因單一欄位版本差異讓整批 14 筆交易直接中止。
      const { data: rulesData, error: rulesError } = await admin
        .from('monthly_rental_type_rules')
        .select('*')
        .in('parking_lot_id', lotIds)

      if (rulesError) {
        const code = safeText((rulesError as any)?.code, 50)
        const message = safeText(rulesError.message, 300)
        console.error('[monthly-payment-sync] type rules read failed', {
          code,
          message,
          lotIds,
        })

        // 只回傳 Supabase 錯誤碼/訊息，不回傳任何 key 或環境變數；
        // 若仍失敗，正式站畫面可直接看到真正原因，不再只剩模糊訊息。
        const diagnostic = [code, message].filter(Boolean).join('：')
        return NextResponse.json({
          error: `無法讀取本系統月租類型設定，已停止套用付款月份${diagnostic ? `（${diagnostic}）` : ''}。`,
        }, { status: 500 })
      }

      typeRules = ((rulesData || []) as MonthlyTypeRule[])
        .filter((rule) => rule?.is_active !== false)
        .sort((a, b) => Number(a.priority ?? 100) - Number(b.priority ?? 100))
    }

    // 每次同步前先把這批租戶既有正式付款歷史依「第一次中途導入」規則重建一次。
    // 這是冪等修復：只改既有 applied_from/to 與月租主檔摘要，不新增付款、不增加月數。
    const reconciliationErrors = new Map<string, string>()
    for (const rentalId of ids) {
      const rental: any = allowed.get(rentalId)
      if (!rental) continue
      const reconciled = await reconcileRentalPaymentHistory(admin, rental, typeRules)
      if (!reconciled.ok) {
        const message = safeText(reconciled.error, 300) || '既有付款歷史重建失敗'
        reconciliationErrors.set(rentalId, message)
        console.error('[monthly-payment-sync] payment history reconciliation failed', {
          rentalId,
          error: message,
        })
      }
    }

    let success = 0
    let failed = 0
    let historySuccess = 0
    let historyDuplicate = 0
    let historyFailed = 0
    let pendingReview = 0
    const errors: string[] = []

    for (const input of orderedRows) {
      const rentalId = safeText(input.rentalId, 80)
      const rental: any = allowed.get(rentalId)
      if (!rental) {
        failed++
        errors.push(`${safeText(input.vehiclePlate, 30) || rentalId}：無存取權限或找不到月租資料`)
        continue
      }

      const reconciliationError = reconciliationErrors.get(rentalId)
      if (reconciliationError) {
        failed++
        errors.push(`${safeText(input.vehiclePlate, 30) || rental.vehicle_plate || rentalId}：${reconciliationError}`)
        continue
      }

      const paymentDate = validDate(input.paymentDate) || new Date().toISOString().slice(0, 10)
      await bindNextRentalTermIfNeeded(admin, rental, paymentDate)
      const invoiceNumber = safeText(input.invoiceNumber, 100) || null
      const amountPaid = Number(input.amountPaid || 0)
      const suppliedSourceReference = safeText(input.sourceReference, 300)
      if (!suppliedSourceReference) {
        failed++
        errors.push(`${safeText(input.vehiclePlate, 30) || rental.vehicle_plate || rentalId}：只能由正式繳費報表匯入付款；手動收款不會延長租期`)
        continue
      }

      const paymentSource = input.sourceKind === '408_excel' ? '408_excel' : 'payment_csv'
      const sourceReference = suppliedSourceReference

      // 金額主判斷：在同停車場所有啟用規則中比對，不再先相信舊 vehicle_type。
      // 每個月租類型依主管設定的 allowed_payment_months 決定可接受的繳費月份；未設定的舊規則相容預設 1、2 個月。
      // 舊 rental_type、舊車種、現場備註與匯入文字都只供參考；只有金額＋主管規則唯一命中才自動校正。
      const resolution = resolvePaymentRuleByAmount(
        {
          parkingLotId: rental.parking_lot_id,
          vehicleType: rental.vehicle_type,
        },
        amountPaid,
        typeRules,
      )
      const standardMonthlyFee =
        resolution.kind === 'matched'
          ? resolution.standardMonthlyFee
          : 0
      const amountDecision = classifyPaymentAmount(amountPaid, standardMonthlyFee)

      // 金額＋主管允許月份唯一辨識時，同步修正主檔車種、身分類型與標準單月費。
      // 歧義時完全不猜；ambiguous/no_match 仍進待確認。
      if (resolution.kind === 'matched') {
        const resolvedType = safeText(resolution.matchedType, 100)
        const resolvedVehicleType = safeText(resolution.matchedVehicleType, 50)
        const resolvedMonthlyFee = Number(resolution.standardMonthlyFee || 0)
        const needsNormalize =
          (resolvedType && safeText(rental.rental_type, 100).toLowerCase() !== resolvedType.toLowerCase()) ||
          (resolvedVehicleType && normalizeVehicleType(rental.vehicle_type) !== normalizeVehicleType(resolvedVehicleType)) ||
          (resolvedMonthlyFee > 0 && Number(rental.monthly_fee || 0) !== resolvedMonthlyFee)

        if (needsNormalize) {
          const { error: typeUpdateError } = await admin
            .from('monthly_rentals')
            .update({
              rental_type: resolvedType || rental.rental_type || null,
              vehicle_type: resolvedVehicleType || rental.vehicle_type || null,
              monthly_fee: resolvedMonthlyFee > 0 ? resolvedMonthlyFee : rental.monthly_fee,
              updated_at: new Date().toISOString(),
            })
            .eq('id', rentalId)

          if (typeUpdateError) {
            console.error('[monthly-payment-sync] rental identity normalize failed', {
              rentalId,
              resolutionMethod: resolution.method,
              message: typeUpdateError.message,
            })
          } else {
            rental.rental_type = resolvedType || rental.rental_type
            rental.vehicle_type = resolvedVehicleType || rental.vehicle_type
            if (resolvedMonthlyFee > 0) rental.monthly_fee = resolvedMonthlyFee
          }
        }
      }
      const missingSystemTerm = !rental.system_term_id || !rental.system_cycle_start_date || !rental.system_cycle_end_date

      let reviewReason: ReviewReason | null = missingSystemTerm
        ? 'missing_system_term'
        : amountDecision.kind === 'manual_review'
          ? amountDecision.reason
          : null

      let newPaidThroughDate = ''
      let appliedFromDate = ''

      if (!reviewReason && amountDecision.kind === 'auto_apply') {
        const initialBaseline = rental.paid_through_date
          ? rental.paid_through_date
          : getInitialPaymentBaselineDate({
              paymentDate,
              termStartDate: rental.system_cycle_start_date,
              termEndDate: rental.system_cycle_end_date,
              reminderDays: 15,
            })

        appliedFromDate = getNextCoverageStartDate({
          currentPaidThroughDate: initialBaseline,
          termStartDate: rental.system_cycle_start_date,
        })

        newPaidThroughDate = nextPaidThroughDate({
          currentPaidThroughDate: initialBaseline,
          termStartDate: rental.system_cycle_start_date,
          termEndDate: rental.system_cycle_end_date,
          months: amountDecision.months,
        })

        if (!newPaidThroughDate || !appliedFromDate) {
          reviewReason = 'term_overflow'
        }
      }

      let paymentHistoryId = ''
      let retryExistingFailedApplication = false

      if (suppliedSourceReference) {
        const { data: existing, error: duplicateCheckError } = await admin
          .from('monthly_payments')
          .select('id,monthly_rental_id,cycle_application_status')
          .eq('source_reference', suppliedSourceReference)
          .limit(1)
          .maybeSingle()

        if (duplicateCheckError) {
          failed++
          historyFailed++
          errors.push(`${safeText(input.vehiclePlate, 30) || rental.vehicle_plate || rentalId}：繳費紀錄重複檢查失敗`)
          continue
        }

        if (existing?.id) {
          if (safeText(existing.monthly_rental_id, 80) !== rentalId) {
            failed++
            errors.push(`${safeText(input.vehiclePlate, 30) || rental.vehicle_plate || rentalId}：既有繳費紀錄連結到不同月租戶，已停止自動處理`)
            continue
          }

          paymentHistoryId = String(existing.id)
          historyDuplicate++

          // 已成功套用、待確認、退款重繳或舊歷史資料，一律不重複延長月份。
          // 只有本版明確標記 failed 的新流程資料才允許重試套用。
          if (existing.cycle_application_status !== 'failed') {
            success++
            continue
          }

          retryExistingFailedApplication = true
        }
      }

      if (!paymentHistoryId) {
        const { data: insertedHistory, error: historyError } = await admin
          .from('monthly_payments')
          .insert({
            parking_lot_id: input.parkingLotId || rental.parking_lot_id || null,
            monthly_rental_id: rentalId,
            customer_code: input.customerCode || rental.customer_code || null,
            customer_name: input.customerName || rental.customer_name || null,
            phone: input.phone || rental.phone || null,
            vehicle_plate: input.vehiclePlate || rental.vehicle_plate || null,
            payment_date: paymentDate,
            amount: amountPaid,
            payment_method: safeText(input.paymentMethod, 100) || null,
            invoice_number: invoiceNumber,
            // 只保存本系統正式週期；完全不信任繳費 CSV 或舊月票總表的租期日期。
            rental_start_date: rental.system_cycle_start_date || null,
            rental_end_date: rental.system_cycle_end_date || null,
            source: paymentSource,
            source_reference: sourceReference,
            notes: safeText(input.notes, 1000) || null,
            created_by: user.id,
            cycle_application_status: reviewReason ? 'pending_review' : 'processing',
          })
          .select('id')
          .single()

        if (historyError || !insertedHistory?.id) {
          failed++
          historyFailed++
          errors.push(`${safeText(input.vehiclePlate, 30) || rental.vehicle_plate || rentalId}：繳費紀錄建立失敗`)
          continue
        }

        paymentHistoryId = String(insertedHistory.id)
        historySuccess++
      } else if (retryExistingFailedApplication) {
        const { data: retriedPayment, error: retryStateError } = await admin
          .from('monthly_payments')
          .update({
            cycle_application_status: reviewReason ? 'pending_review' : 'processing',
          })
          .eq('id', paymentHistoryId)
          .eq('cycle_application_status', 'failed')
          .select('id')
          .maybeSingle()

        if (retryStateError || !retriedPayment?.id) {
          failed++
          historyFailed++
          errors.push(`${safeText(input.vehiclePlate, 30) || rental.vehicle_plate || rentalId}：此筆付款正在由其他同步作業處理，請稍後重新整理`)
          continue
        }
      }

      if (reviewReason) {
        const { data: existingReview, error: existingReviewError } = await admin
          .from('monthly_payment_reviews')
          .select('id,status')
          .eq('source_reference', sourceReference)
          .maybeSingle()

        if (existingReviewError) {
          await admin
            .from('monthly_payments')
            .update({ cycle_application_status: 'failed' })
            .eq('id', paymentHistoryId)
          failed++
          errors.push(`${safeText(input.vehiclePlate, 30) || rental.vehicle_plate || rentalId}：付款已留存，但讀取待確認資料失敗`)
          continue
        }

        if (!existingReview?.id) {
          const { error: reviewError } = await admin
            .from('monthly_payment_reviews')
            .insert({
              parking_lot_id: rental.parking_lot_id || null,
              monthly_rental_id: rentalId,
              monthly_payment_id: paymentHistoryId || null,
              source_reference: sourceReference,
              amount: amountPaid,
              monthly_fee: standardMonthlyFee,
              reason: reviewReason,
              status: 'pending',
              created_by: user.id,
            })

          if (reviewError) {
            await admin
              .from('monthly_payments')
              .update({ cycle_application_status: 'failed' })
              .eq('id', paymentHistoryId)
            failed++
            errors.push(`${safeText(input.vehiclePlate, 30) || rental.vehicle_plate || rentalId}：付款已留存，但建立待確認資料失敗`)
            continue
          }
        }

        await admin
          .from('monthly_payments')
          .update({ cycle_application_status: 'pending_review' })
          .eq('id', paymentHistoryId)

        await admin
          .from('monthly_rentals')
          .update({
            payment_review_status: 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', rentalId)

        pendingReview++
        success++
        continue
      }

      if (amountDecision.kind !== 'auto_apply' || !newPaidThroughDate) {
        await admin
          .from('monthly_payments')
          .update({ cycle_application_status: 'failed' })
          .eq('id', paymentHistoryId)
        failed++
        errors.push(`${safeText(input.vehiclePlate, 30) || rental.vehicle_plate || rentalId}：無法計算本系統到期日`)
        continue
      }

      // 月租戶與付款歷史必須在同一個資料庫交易內完成；函式會鎖定月租戶資料列，
      // 並比對本次計算前的 paid_through_date，避免同時匯入時只更新其中一張表。
      const { data: appliedRows, error: applyError } = await admin
        .rpc('apply_monthly_payment_cycle', {
          p_rental_id: rentalId,
          p_payment_id: paymentHistoryId,
          p_expected_paid_through_date: rental.paid_through_date || null,
          p_new_paid_through_date: newPaidThroughDate,
          p_payment_date: paymentDate,
          p_invoice_number: invoiceNumber,
          p_payment_source: paymentSource,
          p_applied_months: amountDecision.months,
          p_applied_from_date: appliedFromDate,
        })

      const appliedResult = Array.isArray(appliedRows) ? appliedRows[0] : appliedRows
      let applicationConfirmed = !applyError && Boolean(appliedResult?.applied)

      // RPC 回應可能在交易提交後因網路中斷而遺失；先回讀付款狀態，
      // 確認實際沒有套用後才能標成 failed。
      if (!applicationConfirmed) {
        const { data: latestPayment } = await admin
          .from('monthly_payments')
          .select('cycle_application_status,applied_to_date')
          .eq('id', paymentHistoryId)
          .maybeSingle()

        if (latestPayment?.cycle_application_status === 'applied') {
          newPaidThroughDate = validDate(latestPayment.applied_to_date) || newPaidThroughDate
          applicationConfirmed = true
        }
      }

      if (!applicationConfirmed) {
        await admin
          .from('monthly_payments')
          .update({ cycle_application_status: 'failed' })
          .eq('id', paymentHistoryId)
          .eq('cycle_application_status', 'processing')
        failed++
        errors.push(`${safeText(input.vehiclePlate, 30) || rental.vehicle_plate || rentalId}：繳費紀錄已保存，但本系統租期延長失敗，可重新同步此筆`)
        continue
      }

      newPaidThroughDate = validDate(appliedResult?.resulting_paid_through_date) || newPaidThroughDate

      // 同一份繳費報表可能同一租戶有多筆正式交易；本批下一筆必須
      // 從剛套用完成的已繳至日期繼續算，不能回到匯入前的舊日期。
      rental.paid_through_date = newPaidThroughDate

      // 自動核准付款不能清除其他尚未處理的異常付款。
      const { count: remainingPendingReviews } = await admin
        .from('monthly_payment_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('monthly_rental_id', rentalId)
        .eq('status', 'pending')

      await admin
        .from('monthly_rentals')
        .update({
          payment_review_status: remainingPendingReviews ? 'pending' : 'clear',
        })
        .eq('id', rentalId)

      success++
    }

    return NextResponse.json({
      ok: failed === 0,
      success,
      failed,
      historySuccess,
      historyDuplicate,
      historyFailed,
      pendingReview,
      errors: errors.slice(0, 10),
    })
  } catch (error: any) {
    console.error('[monthly-payment-sync] unexpected error', error)
    return NextResponse.json({ error: '繳費更新失敗，請稍後再試。' }, { status: 500 })
  }
}
