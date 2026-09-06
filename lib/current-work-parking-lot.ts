import { cookies } from 'next/headers'

export async function getCurrentWorkParkingLotId() {
  const cookieStore = await cookies()
  return cookieStore.get('current_work_parking_lot_id')?.value || ''
}
