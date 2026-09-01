'use client'

import {
  useEffect,
  useState,
} from 'react'

export const WORK_LOT_STORAGE_KEY =
  'current-work-parking-lot-id'

export const WORK_LOT_COOKIE_KEY =
  'current_work_parking_lot_id'

export function getSavedWorkParkingLotId() {
  if (
    typeof window ===
    'undefined'
  ) {
    return ''
  }

  return (
    window.localStorage.getItem(
      WORK_LOT_STORAGE_KEY
    ) || ''
  )
}

export function useWorkParkingLotId() {
  const [
    parkingLotId,
    setParkingLotId,
  ] = useState('')

  useEffect(() => {
    setParkingLotId(
      getSavedWorkParkingLotId()
    )
  }, [])

  return parkingLotId
}