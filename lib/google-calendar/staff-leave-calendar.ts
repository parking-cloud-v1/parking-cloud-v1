import { createSign } from 'node:crypto'

type CalendarLeaveItem = {
  staffName: string
  parkingLotName: string
  leaveDate: string
  leaveShift?: string | null
  leaveType?: string | null
  substituteName?: string | null
  substituteShift?: string | null
  notes?: string | null
}

type GoogleEvent = {
  id: string
  htmlLink?: string
}

function requiredEnv(name: string) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`${name} 尚未設定`)
  return value
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function privateKey() {
  return requiredEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n')
}

async function getAccessToken() {
  const clientEmail = requiredEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const now = Math.floor(Date.now() / 1000)

  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const unsigned = `${header}.${payload}`

  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const signature = signer.sign(privateKey())
  const assertion = `${unsigned}.${base64Url(signature)}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || '無法取得 Google Calendar access token')
  }
  return String(data.access_token)
}

function nextDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() + 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function eventBody(item: CalendarLeaveItem) {
  const description = [
    `停車場：${item.parkingLotName}`,
    `休假人員：${item.staffName}`,
    `休假日期：${item.leaveDate}`,
    `休假時段：${item.leaveShift || '-'}`,
    `休假類型：${item.leaveType || '排休'}`,
    `代班人員：${item.substituteName || '尚未安排'}`,
    `代班時段：${item.substituteShift || '-'}`,
    item.notes ? `備註：${item.notes}` : '',
    '',
    '由智驛停車營運平台自動同步',
  ].filter(Boolean).join('\n')

  return {
    summary: `【${item.parkingLotName}】${item.staffName}休假`,
    description,
    start: { date: item.leaveDate },
    end: { date: nextDate(item.leaveDate) },
  }
}

async function requestCalendar(path: string, init: RequestInit) {
  const token = await getAccessToken()
  const calendarId = encodeURIComponent(requiredEnv('GOOGLE_CALENDAR_ID'))
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      cache: 'no-store',
    }
  )

  if (response.status === 204) return null

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Google Calendar API ${response.status}`
    )
  }
  return data
}

export async function createStaffLeaveCalendarEvent(item: CalendarLeaveItem): Promise<GoogleEvent> {
  const data = await requestCalendar('/events', {
    method: 'POST',
    body: JSON.stringify(eventBody(item)),
  })
  return { id: String(data.id), htmlLink: data.htmlLink ? String(data.htmlLink) : undefined }
}

export async function updateStaffLeaveCalendarEvent(eventId: string, item: CalendarLeaveItem): Promise<GoogleEvent> {
  const data = await requestCalendar(`/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(eventBody(item)),
  })
  return { id: String(data.id), htmlLink: data.htmlLink ? String(data.htmlLink) : undefined }
}

export async function deleteStaffLeaveCalendarEvent(eventId: string) {
  try {
    await requestCalendar(`/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    })
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error)
    // 若 Google 端已刪除，不阻擋系統刪除。
    if (/404|not found/i.test(message)) return
    throw error
  }
}
