import { randomUUID } from 'node:crypto'

type LeaveItem = {
  staffName: string
  parkingLotName: string
  leaveDate: string
  leaveType: string
  substituteName?: string | null
  substituteShift?: string | null
  notes?: string | null
}

type SendResult = {
  configured: boolean
  attempted: number
  sent: number
  failed: number
  errors: string[]
}

function targetIds() {
  const dedicated = String(process.env.LINE_STAFF_LEAVE_TARGET_IDS || '').trim()
  const fallback = String(process.env.LINE_VIOLATION_TARGET_IDS || '').trim()
  return (dedicated || fallback)
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function buildMessage(items: LeaveItem[]) {
  const lines = ['📅 明日休假／代班提醒', '']

  items.forEach((item, index) => {
    if (index > 0) lines.push('──────────')
    lines.push(`場站：${item.parkingLotName || '-'}`)
    lines.push(`休假：${item.staffName}｜${item.leaveType || '排休'}`)
    lines.push(`日期：${item.leaveDate}`)
    if (item.substituteName) {
      lines.push(`代班：${item.substituteName}`)
      if (item.substituteShift) lines.push(`時段：${item.substituteShift}`)
    } else {
      lines.push('⚠ 代班：尚未安排')
    }
    if (item.notes) lines.push(`備註：${item.notes}`)
  })

  lines.push('', `共 ${items.length} 筆休假安排`)
  return lines.join('\n').slice(0, 5000)
}

async function pushOne(token: string, to: string, text: string) {
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Line-Retry-Key': randomUUID(),
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text }],
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`LINE ${response.status}${body ? `：${body.slice(0, 300)}` : ''}`)
  }
}

export async function sendStaffLeaveLineAlert(items: LeaveItem[]): Promise<SendResult> {
  const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()
  const targets = targetIds()

  if (!token || targets.length === 0 || items.length === 0) {
    return { configured: false, attempted: 0, sent: 0, failed: 0, errors: [] }
  }

  const text = buildMessage(items)
  const results = await Promise.allSettled(targets.map((to) => pushOne(token, to, text)))
  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => String(result.reason?.message || result.reason || 'LINE 發送失敗'))

  return {
    configured: true,
    attempted: targets.length,
    sent: results.length - errors.length,
    failed: errors.length,
    errors,
  }
}
