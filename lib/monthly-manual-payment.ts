export type ManualPaymentRule = {
  parking_lot_id?: unknown
  type_name?: unknown
  vehicle_type?: unknown
  match_amounts?: unknown
  base_monthly_fee?: unknown
  allowed_payment_months?: unknown
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

function parseAllowedMonths(value: unknown) {
  let values: unknown[] = []
  if (Array.isArray(value)) {
    values = value
  } else {
    const text = safeText(value, 300).replace(/^\{/, '').replace(/\}$/, '')
    if (text) values = text.split(/[,，;；\s]+/).filter(Boolean)
  }

  const result = [...new Set(
    values
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 1 && item <= 24),
  )].sort((a, b) => a - b)

  return result.length ? result : [1, 2]
}

function ruleMonthlyFee(rule: ManualPaymentRule) {
  const base = Number(rule.base_monthly_fee || 0)
  if (Number.isFinite(base) && base > 0) return base

  const amounts = safeText(rule.match_amounts, 500)
    .split(/[,，;；\s]+/)
    .map((item) => Number(item.replace(/[^0-9.]/g, '')))
    .filter((item) => Number.isFinite(item) && item > 0)

  return amounts.length ? Math.min(...amounts) : 0
}


export function getManualPaymentOptions(
  rental: {
    parkingLotId?: unknown
    rentalType?: unknown
    vehicleType?: unknown
  },
  rules: ManualPaymentRule[],
) {
  const parkingLotId = safeText(rental.parkingLotId, 80)
  const rentalType = safeText(rental.rentalType, 100).toLowerCase()
  const vehicleType = normalizeVehicleType(rental.vehicleType)

  const candidates = rules
    .filter((rule) => rule?.is_active !== false)
    .filter((rule) => safeText(rule.parking_lot_id, 80) === parkingLotId)
    .filter((rule) => safeText(rule.type_name, 100).toLowerCase() === rentalType)
    .filter((rule) => normalizeVehicleType(rule.vehicle_type) === vehicleType)
    .sort((a, b) => Number(a.priority ?? 100) - Number(b.priority ?? 100))

  const selected = candidates[0]
  if (!selected) {
    return { ok: false as const, error: '找不到此月租戶對應的月租類型設定。', allowedMonths: [] as number[] }
  }

  const monthlyFee = ruleMonthlyFee(selected)
  const allowedMonths = parseAllowedMonths(selected.allowed_payment_months)
  if (monthlyFee <= 0) {
    return { ok: false as const, error: '此月租類型尚未設定有效月租金。', allowedMonths }
  }

  return { ok: true as const, monthlyFee, allowedMonths }
}

export function prepareManualPayment(
  rental: {
    parkingLotId?: unknown
    rentalType?: unknown
    vehicleType?: unknown
  },
  rules: ManualPaymentRule[],
  requestedMonths: unknown,
) {
  const parkingLotId = safeText(rental.parkingLotId, 80)
  const rentalType = safeText(rental.rentalType, 100).toLowerCase()
  const vehicleType = normalizeVehicleType(rental.vehicleType)
  const months = Number(requestedMonths)

  if (!Number.isInteger(months) || months < 1 || months > 24) {
    return { ok: false as const, error: '繳費月數格式不正確。', allowedMonths: [] as number[] }
  }

  const candidates = rules
    .filter((rule) => rule?.is_active !== false)
    .filter((rule) => safeText(rule.parking_lot_id, 80) === parkingLotId)
    .filter((rule) => safeText(rule.type_name, 100).toLowerCase() === rentalType)
    .filter((rule) => normalizeVehicleType(rule.vehicle_type) === vehicleType)
    .sort((a, b) => Number(a.priority ?? 100) - Number(b.priority ?? 100))

  const selected = candidates[0]
  if (!selected) {
    return { ok: false as const, error: '找不到此月租戶對應的月租類型設定。', allowedMonths: [] as number[] }
  }

  const monthlyFee = ruleMonthlyFee(selected)
  const allowedMonths = parseAllowedMonths(selected.allowed_payment_months)

  if (monthlyFee <= 0) {
    return { ok: false as const, error: '此月租類型尚未設定有效月租金。', allowedMonths }
  }

  if (!allowedMonths.includes(months)) {
    return {
      ok: false as const,
      error: `此月租類型只允許繳 ${allowedMonths.join('、')} 個月。`,
      allowedMonths,
    }
  }

  return {
    ok: true as const,
    monthlyFee,
    months,
    amountPaid: monthlyFee * months,
    allowedMonths,
  }
}
