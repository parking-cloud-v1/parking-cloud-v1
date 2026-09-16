export type AppliedPaymentAmountRow = {
  monthly_rental_id?: unknown
  amount?: unknown
  cycle_application_status?: unknown
}

export function buildAppliedPaymentAmountMap(
  rows: AppliedPaymentAmountRow[]
) {
  const totals = new Map<string, number>()

  for (const row of rows || []) {
    if (String(row?.cycle_application_status || '') !== 'applied') continue

    const rentalId = String(row?.monthly_rental_id || '').trim()
    if (!rentalId) continue

    const amount = Number(row?.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) continue

    totals.set(rentalId, (totals.get(rentalId) || 0) + amount)
  }

  return totals
}
