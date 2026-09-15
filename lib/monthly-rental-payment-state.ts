/**
 * Legacy compatibility only.
 *
 * New architecture rule:
 * - legacy roster dates never open a payment cycle;
 * - legacy roster import never changes paid/unpaid state for an existing renter;
 * - confirmed payment report + system paid_through_date are the only renewal sources.
 *
 * Keep these exports temporarily so an older component copied into the project
 * cannot accidentally re-enable date-difference payment behavior.
 */
export function hasOpenedNewPaymentCycle(
  _previousEndDate?: string | null,
  _currentEndDate?: string | null
) {
  return false
}

export function nextPaymentStatusAfterRosterImport({
  currentStatus,
  isNewRental,
}: {
  currentStatus?: string | null
  cycleOpened?: boolean
  isNewRental: boolean
}): 'paid' | 'unpaid' {
  if (isNewRental) return 'unpaid'
  return currentStatus === 'paid' ? 'paid' : 'unpaid'
}
