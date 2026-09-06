export type OnlineApplicationSetting = {
  parking_lot_id: string
  enabled: boolean
  starts_at: string | null
  ends_at: string | null
  allowed_rental_types: string[] | null
  public_note: string | null
  monthly_capacity_car: number | null
  monthly_capacity_motorcycle: number | null
  monthly_capacity_heavy_motorcycle: number | null
  auto_waitlist_when_full: boolean
}

export const DEFAULT_ONLINE_RENTAL_TYPES = ['一般']

export function normalizeRentalTypes(value: unknown): string[] {
  const source = Array.isArray(value) ? value : []
  const result: string[] = []

  for (const item of source) {
    const text = String(item || '').trim()
    if (!text || result.includes(text)) continue
    result.push(text)
  }

  return result.length ? result : [...DEFAULT_ONLINE_RENTAL_TYPES]
}

export function isApplicationSettingOpen(
  setting?: Partial<OnlineApplicationSetting> | null,
  now = new Date()
) {
  if (!setting?.enabled) return false

  const nowMs = now.getTime()

  if (setting.starts_at) {
    const startMs = new Date(setting.starts_at).getTime()
    if (Number.isFinite(startMs) && nowMs < startMs) return false
  }

  if (setting.ends_at) {
    const endMs = new Date(setting.ends_at).getTime()
    if (Number.isFinite(endMs) && nowMs >= endMs) return false
  }

  return true
}

export function applicationClosedReason(
  setting?: Partial<OnlineApplicationSetting> | null,
  now = new Date()
) {
  if (!setting) return '此停車場尚未設定線上月租申請。'
  if (!setting.enabled) return '此停車場目前未開放線上月租申請。'

  const nowMs = now.getTime()

  if (setting.starts_at) {
    const startMs = new Date(setting.starts_at).getTime()
    if (Number.isFinite(startMs) && nowMs < startMs) {
      return '此停車場的線上月租申請尚未開始。'
    }
  }

  if (setting.ends_at) {
    const endMs = new Date(setting.ends_at).getTime()
    if (Number.isFinite(endMs) && nowMs >= endMs) {
      return '此停車場本期線上月租申請已截止。'
    }
  }

  return '此停車場目前未開放線上月租申請。'
}

export async function getLotApplicationAvailability(
  admin: any,
  parkingLotId: string
) {
  const { data: lot, error: lotError } = await admin
    .from('parking_lots')
    .select('id,name,status')
    .eq('id', parkingLotId)
    .eq('status', 'active')
    .maybeSingle()

  if (lotError) throw lotError

  if (!lot) {
    return {
      open: false,
      reason: '此停車場目前未營運或不存在。',
      lot: null,
      setting: null,
    }
  }

  const { data: setting, error: settingError } = await admin
    .from('online_application_settings')
    .select(
      'parking_lot_id,enabled,starts_at,ends_at,allowed_rental_types,public_note,monthly_capacity_car,monthly_capacity_motorcycle,monthly_capacity_heavy_motorcycle,auto_waitlist_when_full'
    )
    .eq('parking_lot_id', parkingLotId)
    .maybeSingle()

  if (settingError) throw settingError

  const open = isApplicationSettingOpen(setting)

  return {
    open,
    reason: open ? '' : applicationClosedReason(setting),
    lot,
    setting: setting
      ? {
          ...setting,
          allowed_rental_types: normalizeRentalTypes(
            setting.allowed_rental_types
          ),
        }
      : null,
  }
}

export async function listOpenApplicationLots(admin: any) {
  const { data: settings, error: settingError } = await admin
    .from('online_application_settings')
    .select(
      'parking_lot_id,enabled,starts_at,ends_at,allowed_rental_types,public_note,monthly_capacity_car,monthly_capacity_motorcycle,monthly_capacity_heavy_motorcycle,auto_waitlist_when_full'
    )
    .eq('enabled', true)

  if (settingError) throw settingError

  const openSettings = (settings || []).filter((row: any) =>
    isApplicationSettingOpen(row)
  )

  const ids = openSettings.map((row: any) => row.parking_lot_id)
  if (!ids.length) return []

  const { data: lots, error: lotError } = await admin
    .from('parking_lots')
    .select('id,name,status')
    .in('id', ids)
    .eq('status', 'active')
    .order('name')

  if (lotError) throw lotError

  const settingMap = new Map(
    openSettings.map((row: any) => [row.parking_lot_id, row])
  )

  return (lots || []).map((lot: any) => {
    const setting: any = settingMap.get(lot.id)
    return {
      ...lot,
      allowed_rental_types: normalizeRentalTypes(
        setting?.allowed_rental_types
      ),
      public_note: setting?.public_note || null,
      starts_at: setting?.starts_at || null,
      ends_at: setting?.ends_at || null,
      monthly_capacity_car: setting?.monthly_capacity_car ?? null,
      monthly_capacity_motorcycle: setting?.monthly_capacity_motorcycle ?? null,
      monthly_capacity_heavy_motorcycle:
        setting?.monthly_capacity_heavy_motorcycle ?? null,
      auto_waitlist_when_full: setting?.auto_waitlist_when_full !== false,
    }
  })
}
