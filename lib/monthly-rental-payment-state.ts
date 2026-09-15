export type MonthlyPaymentStatus = 'paid' | 'unpaid'

function normalizeIsoDate(value?: string | null) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

/**
 * 舊系統名單只負責「開放下一期繳費」。
 * 只有匯入到期日真的往後延長，才視為新繳費週期。
 */
export function hasOpenedNewPaymentCycle(
  previousEndDate?: string | null,
  currentEndDate?: string | null
) {
  const previous = normalizeIsoDate(previousEndDate)
  const current = normalizeIsoDate(currentEndDate)

  return Boolean(previous && current && current > previous)
}

/**
 * 名單匯入不得把任何人直接判成已繳。
 * - 新月租：未繳
 * - 到期日往後（開新繳費週期）：未繳
 * - 同一週期只是重匯／更新基本資料：保留目前狀態
 *
 * 「paid」只能由真正的繳費流程在寫入繳費紀錄後設定。
 */
export function nextPaymentStatusAfterRosterImport({
  currentStatus,
  cycleOpened,
  isNewRental,
}: {
  currentStatus?: string | null
  cycleOpened: boolean
  isNewRental: boolean
}): MonthlyPaymentStatus {
  if (isNewRental || cycleOpened) return 'unpaid'
  return currentStatus === 'paid' ? 'paid' : 'unpaid'
}
