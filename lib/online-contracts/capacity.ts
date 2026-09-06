export type OnlineVehicleType = 'car' | 'motorcycle' | 'heavy_motorcycle'

export type CapacityItem = {
  vehicle_type: OnlineVehicleType
  limit: number | null
  active: number
  contract_reserved: number
  held: number
  used: number
  remaining: number | null
  full: boolean
  waiting: number
  pending: number
}

export type CapacitySnapshot = {
  parking_lot_id: string
  auto_waitlist_when_full: boolean
  car: CapacityItem
  motorcycle: CapacityItem
  heavy_motorcycle: CapacityItem
}

const VEHICLE_TYPES: OnlineVehicleType[] = [
  'car',
  'motorcycle',
  'heavy_motorcycle',
]

export function normalizeOnlineVehicleType(value: unknown): OnlineVehicleType {
  const text = String(value || '').trim()
  if (text === 'motorcycle' || text === 'heavy_motorcycle') return text
  return 'car'
}

export function vehicleTypeText(value: string) {
  if (value === 'motorcycle') return '機車'
  if (value === 'heavy_motorcycle') return '重機'
  return '汽車'
}

function toLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

export function capacityLimitForVehicle(
  setting: any,
  vehicleType: OnlineVehicleType
): number | null {
  if (vehicleType === 'motorcycle') {
    return toLimit(setting?.monthly_capacity_motorcycle)
  }
  if (vehicleType === 'heavy_motorcycle') {
    return toLimit(setting?.monthly_capacity_heavy_motorcycle)
  }
  return toLimit(setting?.monthly_capacity_car)
}

function blankTypeCounter() {
  return {
    car: 0,
    motorcycle: 0,
    heavy_motorcycle: 0,
  } as Record<OnlineVehicleType, number>
}

function ensureLotCounter(
  map: Map<string, Record<OnlineVehicleType, number>>,
  lotId: string
) {
  let value = map.get(lotId)
  if (!value) {
    value = blankTypeCounter()
    map.set(lotId, value)
  }
  return value
}

function addRowsByLot(
  target: Map<string, Record<OnlineVehicleType, number>>,
  rows: any[] | null | undefined,
  filter?: (row: any) => boolean
) {
  for (const row of rows || []) {
    if (filter && !filter(row)) continue
    const lotId = String(row?.parking_lot_id || '')
    if (!lotId) continue
    const type = normalizeOnlineVehicleType(row?.vehicle_type)
    ensureLotCounter(target, lotId)[type] += 1
  }
}

export async function getCapacitySnapshots(
  admin: any,
  parkingLotIds: string[]
): Promise<Record<string, CapacitySnapshot>> {
  const ids = Array.from(
    new Set(parkingLotIds.map((value) => String(value || '').trim()).filter(Boolean))
  )

  if (!ids.length) return {}

  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()

  const [
    settingResult,
    activeResult,
    contractResult,
    heldResult,
    waitingResult,
    pendingResult,
  ] = await Promise.all([
    admin
      .from('online_application_settings')
      .select(
        'parking_lot_id,monthly_capacity_car,monthly_capacity_motorcycle,monthly_capacity_heavy_motorcycle,auto_waitlist_when_full'
      )
      .in('parking_lot_id', ids),
    admin
      .from('monthly_rentals')
      .select('id,parking_lot_id,vehicle_type,end_date,rental_status')
      .in('parking_lot_id', ids)
      .neq('rental_status', 'cancelled')
      .or(`end_date.is.null,end_date.gte.${today}`),
    admin
      .from('contracts')
      .select(
        'id,application_id,parking_lot_id,vehicle_type,status,monthly_rental_id,capacity_consumes_slot'
      )
      .in('parking_lot_id', ids)
      .in('status', ['sent', 'signed']),
    admin
      .from('online_capacity_reservations')
      .select('id,application_id,parking_lot_id,vehicle_type,status,expires_at')
      .in('parking_lot_id', ids)
      .eq('status', 'held')
      .gt('expires_at', now),
    admin
      .from('monthly_waiting_list')
      .select('id,parking_lot_id,vehicle_type,status')
      .in('parking_lot_id', ids)
      .eq('status', 'waiting'),
    admin
      .from('rental_applications')
      .select('id,parking_lot_id,vehicle_type,status')
      .in('parking_lot_id', ids)
      .in('status', ['pending', 'needs_revision']),
  ])

  const errors = [
    settingResult.error,
    activeResult.error,
    contractResult.error,
    heldResult.error,
    waitingResult.error,
    pendingResult.error,
  ].filter(Boolean)

  if (errors.length) {
    throw new Error(errors[0]?.message || '月租名額資料讀取失敗。')
  }

  const settings = new Map<string, any>()
  for (const row of settingResult.data || []) {
    settings.set(String(row.parking_lot_id), row)
  }

  const active = new Map<string, Record<OnlineVehicleType, number>>()
  const contractReserved = new Map<string, Record<OnlineVehicleType, number>>()
  const held = new Map<string, Record<OnlineVehicleType, number>>()
  const waiting = new Map<string, Record<OnlineVehicleType, number>>()
  const pending = new Map<string, Record<OnlineVehicleType, number>>()

  addRowsByLot(active, activeResult.data)
  const contractApplicationIds = new Set(
    (contractResult.data || [])
      .filter((row: any) => {
        if (row.capacity_consumes_slot === false) return false
        return (
          row.status === 'sent' ||
          (row.status === 'signed' && !row.monthly_rental_id)
        )
      })
      .map((row: any) => String(row.application_id || ''))
      .filter(Boolean)
  )

  addRowsByLot(contractReserved, contractResult.data, (row) => {
    if (row.capacity_consumes_slot === false) return false
    return row.status === 'sent' || (row.status === 'signed' && !row.monthly_rental_id)
  })
  addRowsByLot(held, heldResult.data, (row) => {
    return !contractApplicationIds.has(String(row.application_id || ''))
  })
  addRowsByLot(waiting, waitingResult.data)
  addRowsByLot(pending, pendingResult.data)

  const result: Record<string, CapacitySnapshot> = {}

  for (const parkingLotId of ids) {
    const setting = settings.get(parkingLotId) || {}
    const activeCounts = active.get(parkingLotId) || blankTypeCounter()
    const contractCounts =
      contractReserved.get(parkingLotId) || blankTypeCounter()
    const heldCounts = held.get(parkingLotId) || blankTypeCounter()
    const waitingCounts = waiting.get(parkingLotId) || blankTypeCounter()
    const pendingCounts = pending.get(parkingLotId) || blankTypeCounter()

    const build = (vehicleType: OnlineVehicleType): CapacityItem => {
      const limit = capacityLimitForVehicle(setting, vehicleType)
      const used =
        activeCounts[vehicleType] +
        contractCounts[vehicleType] +
        heldCounts[vehicleType]

      return {
        vehicle_type: vehicleType,
        limit,
        active: activeCounts[vehicleType],
        contract_reserved: contractCounts[vehicleType],
        held: heldCounts[vehicleType],
        used,
        remaining: limit === null ? null : Math.max(limit - used, 0),
        full: limit !== null && used >= limit,
        waiting: waitingCounts[vehicleType],
        pending: pendingCounts[vehicleType],
      }
    }

    result[parkingLotId] = {
      parking_lot_id: parkingLotId,
      auto_waitlist_when_full: setting.auto_waitlist_when_full !== false,
      car: build('car'),
      motorcycle: build('motorcycle'),
      heavy_motorcycle: build('heavy_motorcycle'),
    }
  }

  return result
}

export async function getCapacitySnapshot(
  admin: any,
  parkingLotId: string
): Promise<CapacitySnapshot> {
  const result = await getCapacitySnapshots(admin, [parkingLotId])
  return result[parkingLotId]
}

export function capacityItemForVehicle(
  snapshot: CapacitySnapshot | null | undefined,
  vehicleType: unknown
) {
  const type = normalizeOnlineVehicleType(vehicleType)
  return snapshot?.[type] || null
}

export { VEHICLE_TYPES }
