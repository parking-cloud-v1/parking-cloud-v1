export type OnlineOperationAccessRow = {
  is_enabled?: boolean | null
  open_from?: string | null
  open_until?: string | null
}

export function isOnlineOperationAccessOpen(
  row: OnlineOperationAccessRow | null | undefined,
  now = new Date()
) {
  if (!row?.is_enabled) return false

  const nowMs = now.getTime()
  const fromMs = row.open_from ? new Date(row.open_from).getTime() : null
  const untilMs = row.open_until ? new Date(row.open_until).getTime() : null

  if (fromMs !== null && Number.isFinite(fromMs) && nowMs < fromMs) return false
  if (untilMs !== null && Number.isFinite(untilMs) && nowMs > untilMs) return false

  return true
}
