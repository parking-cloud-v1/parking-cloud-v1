import { cookies } from 'next/headers'

export const WORK_LOT_COOKIE_KEY =
  'current_work_parking_lot_id'

export async function getCurrentWorkParkingLotId() {
  const cookieStore =
    await cookies()

  return (
    cookieStore.get(
      WORK_LOT_COOKIE_KEY
    )?.value || ''
  )
}