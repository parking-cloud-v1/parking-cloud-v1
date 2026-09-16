export type MonthlyTypeRule = {
  parking_lot_id?: unknown
  type_name?: unknown
  vehicle_type?: unknown
  match_amounts?: unknown
  base_monthly_fee?: unknown
  priority?: unknown
  is_active?: unknown
}

export const DEFAULT_ALLOWED_PAYMENT_MONTHS = [1, 2] as const

function safeText(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function normalizeVehicleType(value: unknown) {
  const normalized = safeText(value, 50).toLowerCase()

  if (['car', '汽車'].includes(normalized)) return 'car'
  if (['motorcycle', '機車'].includes(normalized)) return 'motorcycle'
  if (['heavy_motorcycle', '重機'].includes(normalized)) return 'heavy_motorcycle'

  return normalized
}

function ruleAmounts(value: unknown) {
  return safeText(value, 500)
    .split(/[,，;；\s]+/)
    .map((item) => Number(item.replace(/[^0-9.]/g, '')))
    .filter((amount) => Number.isFinite(amount) && amount > 0)
}

function positiveNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function ruleMonthlyFee(rule: MonthlyTypeRule) {
  const amounts = ruleAmounts(rule.match_amounts)
  if (amounts.length) return Math.min(...amounts)

  return positiveNumber(rule.base_monthly_fee)
}

function normalizeAllowedMonths(values: readonly number[]) {
  const normalized = [...new Set(
    values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  )].sort((a, b) => a - b)

  return normalized.length
    ? normalized
    : [...DEFAULT_ALLOWED_PAYMENT_MONTHS]
}

export function resolveStandardMonthlyFee(
  rental: {
    parkingLotId?: unknown
    rentalType?: unknown
    vehicleType?: unknown
  },
  rules: MonthlyTypeRule[],
) {
  const parkingLotId = safeText(rental.parkingLotId, 80)
  const rentalType = safeText(rental.rentalType, 100).toLowerCase()
  const vehicleType = normalizeVehicleType(rental.vehicleType)

  const candidates = rules
    .filter((rule) => rule?.is_active !== false)
    .filter(
      (rule) =>
        safeText(rule.parking_lot_id, 80) === parkingLotId &&
        safeText(rule.type_name, 100).toLowerCase() === rentalType &&
        normalizeVehicleType(rule.vehicle_type) === vehicleType,
    )
    .sort(
      (a, b) =>
        Number(a.priority ?? 100) - Number(b.priority ?? 100),
    )

  const selected = candidates[0]
  return selected ? ruleMonthlyFee(selected) : 0
}

export function paymentAmountNeedsReview(
  amountPaid: unknown,
  standardMonthlyFee: unknown,
  allowedMonths: readonly number[] = DEFAULT_ALLOWED_PAYMENT_MONTHS,
) {
  const amount = Number(amountPaid ?? 0)
  const monthlyFee = Number(standardMonthlyFee ?? 0)

  if (!Number.isFinite(amount) || amount <= 0) return true
  if (!Number.isFinite(monthlyFee) || monthlyFee <= 0) return true

  const months = amount / monthlyFee
  if (!Number.isInteger(months) || months <= 0) return true

  return !normalizeAllowedMonths(allowedMonths).includes(months)
}

export type PaymentRuleResolution =
  | {
      kind: 'matched'
      method: 'amount_unique'
      matchedType: string
      standardMonthlyFee: number
      months: number
      candidateCount: number
    }
  | {
      kind: 'ambiguous'
      method: 'amount_ambiguous'
      matchedType: ''
      standardMonthlyFee: 0
      months: 0
      candidateCount: number
    }
  | {
      kind: 'no_match'
      method: 'none'
      matchedType: ''
      standardMonthlyFee: 0
      months: 0
      candidateCount: 0
    }
  | {
      kind: 'zero_amount'
      method: 'none'
      matchedType: ''
      standardMonthlyFee: 0
      months: 0
      candidateCount: 0
    }

type LogicalCandidate = {
  normalizedType: string
  typeName: string
  fee: number
  months: number
  priority: number
}

export function resolvePaymentRuleByAmount(
  rental: {
    parkingLotId?: unknown
    // 保留欄位是為了相容既有呼叫端；正式自動辨識不使用舊類型文字當條件。
    rentalType?: unknown
    vehicleType?: unknown
  },
  amountPaid: unknown,
  rules: MonthlyTypeRule[],
  allowedMonths: readonly number[] = DEFAULT_ALLOWED_PAYMENT_MONTHS,
): PaymentRuleResolution {
  const amount = Number(amountPaid ?? 0)
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      kind: 'zero_amount',
      method: 'none',
      matchedType: '',
      standardMonthlyFee: 0,
      months: 0,
      candidateCount: 0,
    }
  }

  const parkingLotId = safeText(rental.parkingLotId, 80)
  const vehicleType = normalizeVehicleType(rental.vehicleType)
  const allowed = new Set(normalizeAllowedMonths(allowedMonths))
  const logicalCandidates = new Map<string, LogicalCandidate>()

  for (const rule of rules) {
    if (rule?.is_active === false) continue
    if (safeText(rule.parking_lot_id, 80) !== parkingLotId) continue
    if (normalizeVehicleType(rule.vehicle_type) !== vehicleType) continue

    const typeName = safeText(rule.type_name, 100)
    const normalizedType = typeName.toLowerCase()
    if (!normalizedType) continue

    const fee = ruleMonthlyFee(rule)
    if (fee <= 0) continue

    const rawMonths = amount / fee
    if (!Number.isInteger(rawMonths) || rawMonths <= 0) continue

    const months = Math.round(rawMonths)
    if (!allowed.has(months)) continue

    const priority = Number(rule.priority ?? 100)
    const key = `${normalizedType}|${fee}|${months}`
    const next: LogicalCandidate = {
      normalizedType,
      typeName,
      fee,
      months,
      priority: Number.isFinite(priority) ? priority : 100,
    }

    const current = logicalCandidates.get(key)
    if (!current || next.priority < current.priority) {
      logicalCandidates.set(key, next)
    }
  }

  const candidates = [...logicalCandidates.values()].sort(
    (a, b) =>
      a.priority - b.priority ||
      a.typeName.localeCompare(b.typeName) ||
      a.months - b.months ||
      a.fee - b.fee,
  )

  if (candidates.length === 0) {
    return {
      kind: 'no_match',
      method: 'none',
      matchedType: '',
      standardMonthlyFee: 0,
      months: 0,
      candidateCount: 0,
    }
  }

  if (candidates.length === 1) {
    const selected = candidates[0]
    return {
      kind: 'matched',
      method: 'amount_unique',
      matchedType: selected.typeName,
      standardMonthlyFee: selected.fee,
      months: selected.months,
      candidateCount: 1,
    }
  }

  // 金額是正式主條件。舊 rental_type、現場備註、匯入文字僅供顯示參考，
  // 不拿來排除多候選，避免舊文字資料反過來影響正式付款身分判斷。
  return {
    kind: 'ambiguous',
    method: 'amount_ambiguous',
    matchedType: '',
    standardMonthlyFee: 0,
    months: 0,
    candidateCount: candidates.length,
  }
}
