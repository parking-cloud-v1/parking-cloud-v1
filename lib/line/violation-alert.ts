import { randomUUID } from 'node:crypto'

type ViolationAlertInput = {
  caseId: string
  parkingLotName: string
  caseType: string
  reservedType?: string | null
  vehiclePlate?: string | null
  locationText?: string | null
  startDate: string
  notes?: string | null
}

type SendResult = {
  configured: boolean
  attempted: number
  sent: number
  failed: number
  errors: string[]
}

function caseTypeText(caseType: string, reservedType?: string | null) {
  if (caseType === 'reserved_violation') {
    if (reservedType === 'disabled') return '占用身障車位'
    if (reservedType === 'parent_child') return '占用婦幼車位'
    return '保留車位違規'
  }
  if (caseType === 'long_stay') return '久停車輛'
  if (caseType === 'unplated') return '無牌車輛'
  return caseType || '違規事件'
}

function targetIds() {
  return String(process.env.LINE_VIOLATION_TARGET_IDS || '')
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function appBaseUrl() {
  return String(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      ''
  ).replace(/\/$/, '')
}

function buildMessage(input: ViolationAlertInput) {
  const detailUrl = appBaseUrl()
    ? `${appBaseUrl()}/dashboard/violation-alerts`
    : ''

  const lines = [
    '⚠️ 違規即時通知',
    '',
    `停車場：${input.parkingLotName || '-'}`,
    `類型：${caseTypeText(input.caseType, input.reservedType)}`,
    `車牌：${input.vehiclePlate || '無牌車輛'}`,
    `日期：${input.startDate || '-'}`,
  ]

  if (input.locationText) {
    lines.push(`位置：${input.locationText}`)
  }

  if (input.notes) {
    lines.push(`備註：${input.notes}`)
  }

  lines.push('', '狀態：尚未處理')

  if (detailUrl) {
    lines.push('', `查看事件：${detailUrl}`)
  }

  return lines.join('\n').slice(0, 5000)
}

async function pushOne(
  token: string,
  to: string,
  text: string
) {
  const response = await fetch(
    'https://api.line.me/v2/bot/message/push',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Line-Retry-Key': randomUUID(),
      },
      body: JSON.stringify({
        to,
        messages: [
          {
            type: 'text',
            text,
          },
        ],
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `LINE ${response.status}${body ? `：${body.slice(0, 300)}` : ''}`
    )
  }
}

export async function sendViolationLineAlert(
  input: ViolationAlertInput
): Promise<SendResult> {
  const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()
  const targets = targetIds()

  if (!token || targets.length === 0) {
    return {
      configured: false,
      attempted: 0,
      sent: 0,
      failed: 0,
      errors: [],
    }
  }

  const text = buildMessage(input)
  const results = await Promise.allSettled(
    targets.map((to) => pushOne(token, to, text))
  )

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
