export type PaymentAmountClassification =
  | { kind: 'auto_apply'; months: number }
  | { kind: 'manual_review'; reason: 'zero_amount' | 'non_multiple' | 'invalid_monthly_fee' }

export type MonthlyBillingStatus = 'paid' | 'unpaid' | 'pending'

function parseDateOnly(value?: string | null) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function addMonthsKeepingDay(date: Date, months: number) {
  const day = date.getUTCDate()
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(day, lastDay))
  return first
}

function calendarMonthDistance(from: Date, to: Date) {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  )
}

function sharedCycleStartForDate(termStart: Date, target: Date) {
  if (target.getTime() <= termStart.getTime()) return new Date(termStart)

  const monthDistance = Math.max(0, calendarMonthDistance(termStart, target))
  let cycleStart = addMonthsKeepingDay(termStart, monthDistance)
  if (cycleStart.getTime() > target.getTime()) {
    cycleStart = addMonthsKeepingDay(termStart, Math.max(0, monthDistance - 1))
  }

  return cycleStart
}

function sharedCycleStartOnOrAfter(termStart: Date, target: Date) {
  if (target.getTime() <= termStart.getTime()) return new Date(termStart)

  const monthDistance = Math.max(0, calendarMonthDistance(termStart, target))
  let cycleStart = addMonthsKeepingDay(termStart, monthDistance)
  if (cycleStart.getTime() < target.getTime()) {
    cycleStart = addMonthsKeepingDay(termStart, monthDistance + 1)
  }

  return cycleStart
}

export function classifyPaymentAmount(amount: number, monthlyFee: number): PaymentAmountClassification {
  const normalizedAmount = Number(amount)
  const normalizedFee = Number(monthlyFee)

  if (!Number.isFinite(normalizedFee) || normalizedFee <= 0) {
    return { kind: 'manual_review', reason: 'invalid_monthly_fee' }
  }

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return { kind: 'manual_review', reason: 'zero_amount' }
  }

  const rawMonths = normalizedAmount / normalizedFee
  const rounded = Math.round(rawMonths)
  if (Math.abs(rawMonths - rounded) > 1e-9 || rounded <= 0) {
    return { kind: 'manual_review', reason: 'non_multiple' }
  }

  return { kind: 'auto_apply', months: rounded }
}

export function getRenewalState({
  today,
  paidThroughDate,
  reminderDays = 15,
}: {
  today?: string | null
  paidThroughDate?: string | null
  reminderDays?: number
}) {
  const dueDate = parseDateOnly(paidThroughDate)
  const currentDate = parseDateOnly(today)

  if (!dueDate || !currentDate) {
    return {
      isDue: true,
      reminderStartDate: '',
      daysUntilDue: null as number | null,
      status: 'due' as const,
    }
  }

  const reminderStart = addDays(dueDate, -Math.max(0, reminderDays))
  const daysUntilDue = Math.floor((dueDate.getTime() - currentDate.getTime()) / 86400000)
  const isDue = currentDate.getTime() >= reminderStart.getTime()

  return {
    isDue,
    reminderStartDate: formatDateOnly(reminderStart),
    daysUntilDue,
    status: isDue ? ('due' as const) : ('covered' as const),
  }
}

export function getMonthlyBillingState({
  today,
  paidThroughDate,
  paymentReviewStatus,
  reminderDays = 15,
}: {
  today?: string | null
  paidThroughDate?: string | null
  paymentReviewStatus?: string | null
  reminderDays?: number
}) {
  const renewal = getRenewalState({ today, paidThroughDate, reminderDays })
  const status: MonthlyBillingStatus = paymentReviewStatus === 'pending'
    ? 'pending'
    : renewal.isDue
      ? 'unpaid'
      : 'paid'

  return {
    status,
    // 付款待確認期間先交由管理員判斷，不進簡訊催繳名單。
    shouldRemind: paymentReviewStatus === 'pending' ? false : renewal.isDue,
    reminderStartDate: renewal.reminderStartDate,
    daysUntilDue: renewal.daysUntilDue,
  }
}

export function isWithinOperationalWindow({
  today,
  paidThroughDate,
  months = 3,
}: {
  today?: string | null
  paidThroughDate?: string | null
  months?: number
}) {
  const currentDate = parseDateOnly(today)
  const paidThrough = parseDateOnly(paidThroughDate)
  if (!currentDate || !paidThrough) return true

  const cutoff = addMonthsKeepingDay(currentDate, -Math.max(0, Math.trunc(months)))
  return paidThrough.getTime() >= cutoff.getTime()
}


export function getNextCoverageStartDate({
  currentPaidThroughDate,
  termStartDate,
}: {
  currentPaidThroughDate?: string | null
  termStartDate: string
  paymentDate?: string | null
}) {
  const termStart = parseDateOnly(termStartDate)
  if (!termStart) return ''

  const currentPaidThrough = parseDateOnly(currentPaidThroughDate)

  // 付款日只記錄實際收款時間，不決定應套用哪一期。
  // 有既有已繳至日期時，永遠從下一個共同週期接續；
  // 尚無已繳基準時，才從正式租期第一個共同週期開始。
  const targetStart = currentPaidThrough && currentPaidThrough.getTime() >= termStart.getTime()
    ? addDays(currentPaidThrough, 1)
    : termStart

  return formatDateOnly(sharedCycleStartOnOrAfter(termStart, targetStart))
}

export function nextPaidThroughDate({
  currentPaidThroughDate,
  termStartDate,
  termEndDate,
  months,
}: {
  currentPaidThroughDate?: string | null
  termStartDate: string
  termEndDate?: string | null
  paymentDate?: string | null
  months: number
}) {
  const termStart = parseDateOnly(termStartDate)
  if (!termStart || !Number.isFinite(months) || months <= 0 || !Number.isInteger(months)) return ''

  const currentPaidThrough = parseDateOnly(currentPaidThroughDate)

  // 不用付款日跳月份：提前繳或遲繳都只從目前最早未繳期接續。
  const targetStart = currentPaidThrough && currentPaidThrough.getTime() >= termStart.getTime()
    ? addDays(currentPaidThrough, 1)
    : termStart
  const nextStart = sharedCycleStartOnOrAfter(termStart, targetStart)
  const startIndex = Math.max(0, calendarMonthDistance(termStart, nextStart))

  const nextBoundary = addMonthsKeepingDay(termStart, startIndex + months)
  const paidThrough = addDays(nextBoundary, -1)

  const termEnd = parseDateOnly(termEndDate)
  if (termEnd && paidThrough.getTime() > termEnd.getTime()) {
    return ''
  }

  return formatDateOnly(paidThrough)
}

export function getInitialPaidThroughDate({
  today,
  termStartDate,
  termEndDate,
}: {
  today: string
  termStartDate: string
  termEndDate?: string | null
}) {
  const current = parseDateOnly(today)
  const termStart = parseDateOnly(termStartDate)
  const termEnd = parseDateOnly(termEndDate)
  if (!current || !termStart) return ''

  let sharedCycleStart = sharedCycleStartForDate(termStart, current)
  if (termEnd && sharedCycleStart.getTime() > termEnd.getTime()) {
    sharedCycleStart = termEnd
  }

  return formatDateOnly(addDays(sharedCycleStart, -1))
}
