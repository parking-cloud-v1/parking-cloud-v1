'use client'

import {
  useEffect,
  useState,
} from 'react'

export const WORK_LOT_STORAGE_KEY =
  'current-work-parking-lot-id'

export const OLD_MONTHLY_LOT_STORAGE_KEY =
  'monthly-rentals-current-lot'

export const WORK_LOT_COOKIE_KEY =
  'current_work_parking_lot_id'

export function getSavedWorkParkingLotId() {
  if (
    typeof window ===
    'undefined'
  ) {
    return ''
  }

  const current =
    window.localStorage.getItem(
      WORK_LOT_STORAGE_KEY
    )

  if (current) {
    return current
  }

  /*
   * 相容之前月租管理使用的舊 key。
   */
  const old =
    window.localStorage.getItem(
      OLD_MONTHLY_LOT_STORAGE_KEY
    )

  if (old) {
    /*
     * 找到舊設定時，
     * 自動搬到新的全系統 key。
     */
    window.localStorage.setItem(
      WORK_LOT_STORAGE_KEY,
      old
    )

    return old
  }

  return ''
}

export function saveWorkParkingLotId(
  parkingLotId: string
) {
  if (
    typeof window ===
    'undefined'
  ) {
    return
  }

  if (!parkingLotId) {
    window.localStorage.removeItem(
      WORK_LOT_STORAGE_KEY
    )

    window.localStorage.removeItem(
      OLD_MONTHLY_LOT_STORAGE_KEY
    )

    document.cookie =
      `${WORK_LOT_COOKIE_KEY}=; path=/; max-age=0; samesite=lax`

    return
  }

  /*
   * 新舊 key 都一起存，
   * 避免舊頁面讀不到。
   */
  window.localStorage.setItem(
    WORK_LOT_STORAGE_KEY,
    parkingLotId
  )

  window.localStorage.setItem(
    OLD_MONTHLY_LOT_STORAGE_KEY,
    parkingLotId
  )

  /*
   * Server Component
   * 防災、結班等頁面靠 cookie 讀取。
   */
  document.cookie =
    `${WORK_LOT_COOKIE_KEY}=${encodeURIComponent(
      parkingLotId
    )}; path=/; max-age=31536000; samesite=lax`
}

export function useWorkParkingLotId() {
  const [
    parkingLotId,
    setParkingLotId,
  ] =
    useState('')

  useEffect(() => {
    setParkingLotId(
      getSavedWorkParkingLotId()
    )

    function handleStorage(
      event: StorageEvent
    ) {
      if (
        event.key ===
          WORK_LOT_STORAGE_KEY ||
        event.key ===
          OLD_MONTHLY_LOT_STORAGE_KEY
      ) {
        setParkingLotId(
          getSavedWorkParkingLotId()
        )
      }
    }

    window.addEventListener(
      'storage',
      handleStorage
    )

    return () => {
      window.removeEventListener(
        'storage',
        handleStorage
      )
    }
  }, [])

  return parkingLotId
}