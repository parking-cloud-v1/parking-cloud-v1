export type MonthlyTypeRule = {
  parking_lot_id?: unknown
  type_name?: unknown
  vehicle_type?: unknown
  match_amounts?: unknown
  base_monthly_fee?: unknown
  priority?: unknown
  is_active?: unknown
}

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
) {
  const amount = Number(amountPaid ?? 0)
  const monthlyFee = Number(standardMonthlyFee ?? 0)

  if (!Number.isFinite(amount) || amount <= 0) return true
  if (!Number.isFinite(monthlyFee) || monthlyFee <= 0) return true

  const months = amount / monthlyFee
  return Math.abs(months - Math.round(months)) > 1e-9
}

export type PaymentRuleResolution =
  | {
      kind: 'matched'
      method: 'amount_unique' | 'amount_type_hint'
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

function isPositiveInteger(value: number) {
  return Number.isFinite(value) && value > 0 && Math.abs(value - Math.round(value)) <= 1e-9
}

export function resolvePaymentRuleByAmount(
  rental: {
    parkingLotId?: unknown
    rentalType?: unknown
    vehicleType?: unknown
  },
  amountPaid: unknown,
  rules: MonthlyTypeRule[],
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
  const rentalType = safeText(rental.rentalType, 100).toLowerCase()

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

    const months = amount / fee
    if (!isPositiveInteger(months)) continue

    const priority = Number(rule.priority ?? 100)
    const key = `${normalizedType}|${fee}`
    const next: LogicalCandidate = {
      normalizedType,
      typeName,
      fee,
      months: Math.round(months),
      priority: Number.isFinite(priority) ? priority : 100,
    }

    const current = logicalCandidates.get(key)
    if (!current || next.priority < current.priority) {
      logicalCandidates.set(key, next)
    }
  }

  const candidates = [...logicalCandidates.values()].sort(
    (a, b) => a.priority - b.priority || a.typeName.localeCompare(b.typeName) || a.fee - b.fee,
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

  if (rentalType) {
    const hinted = candidates.filter((candidate) => candidate.normalizedType === rentalType)
    if (hinted.length === 1) {
      const selected = hinted[0]
      return {
        kind: 'matched',
        method: 'amount_type_hint',
        matchedType: selected.typeName,
        standardMonthlyFee: selected.fee,
        months: selected.months,
        candidateCount: candidates.length,
      }
    }
  }

  return {
    kind: 'ambiguous',
    method: 'amount_ambiguous',
    matchedType: '',
    standardMonthlyFee: 0,
    months: 0,
    candidateCount: candidates.length,
  }
}
