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
