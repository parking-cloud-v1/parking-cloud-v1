export type AppliedPaymentForCorrection = {
  id: string
  applied_from_date?: string | null
  applied_to_date?: string | null
  applied_months?: number | null
  created_at?: string | null
}

export type PaymentCorrectionUpdate =
  | {
      id: string
      action: 'trim'
      applied_from_date: string
      applied_to_date: string
      applied_months: number
    }
  | {
      id: string
      action: 'exclude'
    }

export type PaidThroughCorrectionPlan =
  | {
      ok: true
      targetDate: string
      paymentUpdates: PaymentCorrectionUpdate[]
    }
  | {
      ok: false
      error: string
    }

function parseDateOnly(value?: string | null) {
  const text = String(value || '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return { text, year, month, day }
}

export function isDateOnly(value?: string | null) {
  return Boolean(parseDateOnly(value))
}

function inclusiveCalendarMonths(fromDate: string, toDate: string) {
  const from = parseDateOnly(fromDate)
  const to = parseDateOnly(toDate)
  if (!from || !to || to.text < from.text) return 0

  return (
    (to.year - from.year) * 12 +
    (to.month - from.month) +
    1
  )
}

export function planPaidThroughCorrection({
  targetDate,
  termStartDate,
  termEndDate,
  payments,
}: {
  targetDate: string
  termStartDate?: string | null
  termEndDate?: string | null
  payments: AppliedPaymentForCorrection[]
}): PaidThroughCorrectionPlan {
  const target = parseDateOnly(targetDate)
  const termStart = parseDateOnly(termStartDate)
  const termEnd = parseDateOnly(termEndDate)

  if (!target) {
    return { ok: false, error: '請輸入正確的已繳至日期。' }
  }

  if (!termStart || !termEnd) {
    return { ok: false, error: '此月租戶尚未綁定正式租期，無法校正日期。' }
  }

  if (target.text < termStart.text || target.text > termEnd.text) {
    return { ok: false, error: '校正日期必須落在目前正式租期內。' }
  }

  const validPayments = payments
    .map((payment) => {
      const from = parseDateOnly(payment.applied_from_date)
      const to = parseDateOnly(payment.applied_to_date)
      if (!payment.id || !from || !to || to.text < from.text) return null
      return {
        ...payment,
        applied_from_date: from.text,
        applied_to_date: to.text,
      }
    })
    .filter(Boolean) as Array<Required<Pick<AppliedPaymentForCorrection, 'id'>> & AppliedPaymentForCorrection & {
      applied_from_date: string
      applied_to_date: string
    }>

  if (!validPayments.length) {
    return {
      ok: false,
      error: '找不到可同步的正式付款紀錄；請先使用收款功能建立正式付款。',
    }
  }

  validPayments.sort((a, b) => {
    const byTo = b.applied_to_date.localeCompare(a.applied_to_date)
    if (byTo !== 0) return byTo
    return String(b.created_at || '').localeCompare(String(a.created_at || ''))
  })

  const currentMax = validPayments[0].applied_to_date
  const updates: PaymentCorrectionUpdate[] = []

  if (target.text > currentMax) {
    const latest = validPayments[0]
    const months = inclusiveCalendarMonths(latest.applied_from_date, target.text)
    if (months < 1) {
      return { ok: false, error: '無法從現有付款週期計算新的已繳至日期。' }
    }

    updates.push({
      id: latest.id,
      action: 'trim',
      applied_from_date: latest.applied_from_date,
      applied_to_date: target.text,
      applied_months: months,
    })

    return { ok: true, targetDate: target.text, paymentUpdates: updates }
  }

  const coversTarget = validPayments.some(
    (payment) =>
      payment.applied_from_date <= target.text &&
      payment.applied_to_date >= target.text,
  )

  if (!coversTarget) {
    return {
      ok: false,
      error: '找不到涵蓋這個日期的已套用付款，為避免改錯付款紀錄已停止。',
    }
  }

  for (const payment of validPayments) {
    if (payment.applied_to_date <= target.text) continue

    if (payment.applied_from_date > target.text) {
      updates.push({ id: payment.id, action: 'exclude' })
      continue
    }

    const months = inclusiveCalendarMonths(payment.applied_from_date, target.text)
    if (months < 1) {
      return { ok: false, error: '無法重新計算付款月份。' }
    }

    updates.push({
      id: payment.id,
      action: 'trim',
      applied_from_date: payment.applied_from_date,
      applied_to_date: target.text,
      applied_months: months,
    })
  }

  return { ok: true, targetDate: target.text, paymentUpdates: updates }
}
