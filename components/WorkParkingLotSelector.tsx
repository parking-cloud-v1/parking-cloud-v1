'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

type ParkingLotOption = {
  id: string
  name: string
}

const STORAGE_KEY =
  'current-work-parking-lot-id'

const COOKIE_KEY =
  'current_work_parking_lot_id'

function setWorkLotCookie(
  parkingLotId: string
) {
  document.cookie =
    `${COOKIE_KEY}=${encodeURIComponent(
      parkingLotId
    )}; path=/; max-age=31536000; samesite=lax`
}

export default function WorkParkingLotSelector({
  parkingLots,
}: {
  parkingLots: ParkingLotOption[]
}) {
  const [
    selectedId,
    setSelectedId,
  ] = useState('')

  const selectedLot =
    useMemo(
      () =>
        parkingLots.find(
          (lot) =>
            lot.id ===
            selectedId
        ),
      [
        parkingLots,
        selectedId,
      ]
    )

  useEffect(() => {
    if (
      parkingLots.length ===
      0
    ) {
      return
    }

    if (
      parkingLots.length ===
      1
    ) {
      const onlyId =
        parkingLots[0].id

      window.localStorage.setItem(
        STORAGE_KEY,
        onlyId
      )

      window.localStorage.setItem(
        'monthly-rentals-current-lot',
        onlyId
      )

      setWorkLotCookie(
        onlyId
      )

      setSelectedId(
        onlyId
      )

      return
    }

    const savedId =
      window.localStorage.getItem(
        STORAGE_KEY
      ) ||
      window.localStorage.getItem(
        'monthly-rentals-current-lot'
      )

    const validSaved =
      savedId &&
      parkingLots.some(
        (lot) =>
          lot.id ===
          savedId
      )

    if (
      validSaved &&
      savedId
    ) {
      setSelectedId(
        savedId
      )

      setWorkLotCookie(
        savedId
      )

      return
    }

    setSelectedId('')
  }, [parkingLots])

  function changeLot(
    parkingLotId: string
  ) {
    setSelectedId(
      parkingLotId
    )

    if (!parkingLotId) {
      window.localStorage.removeItem(
        STORAGE_KEY
      )

      window.localStorage.removeItem(
        'monthly-rentals-current-lot'
      )

      document.cookie =
        `${COOKIE_KEY}=; path=/; max-age=0; samesite=lax`

      return
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      parkingLotId
    )

    window.localStorage.setItem(
      'monthly-rentals-current-lot',
      parkingLotId
    )

    setWorkLotCookie(
      parkingLotId
    )

    window.location.reload()
  }

  return (
    <div
      style={{
        padding:
          '12px 14px',
        marginBottom:
          10,
        border:
          '1px solid #e5e7eb',
        borderRadius:
          12,
        background:
          '#f8fafc',
      }}
    >
      <div
        style={{
          fontSize:
            12,
          color:
            '#64748b',
          marginBottom:
            6,
          fontWeight:
            700,
        }}
      >
        目前工作停車場
      </div>

      {parkingLots.length ===
      0 ? (
        <div
          style={{
            color:
              '#dc2626',
            fontSize:
              13,
          }}
        >
          目前沒有可使用的停車場
        </div>
      ) : parkingLots.length ===
        1 ? (
        <div
          style={{
            fontWeight:
              800,
            lineHeight:
              1.4,
          }}
        >
          {
            parkingLots[0]
              .name
          }
        </div>
      ) : (
        <>
          <select
            value={
              selectedId
            }
            onChange={(
              event
            ) =>
              changeLot(
                event.target
                  .value
              )
            }
            style={{
              width:
                '100%',
              minWidth:
                0,
              padding:
                '9px 10px',
              border:
                '1px solid #cbd5e1',
              borderRadius:
                8,
              background:
                '#fff',
            }}
          >
            <option value="">
              請選擇工作停車場
            </option>

            {parkingLots.map(
              (lot) => (
                <option
                  key={
                    lot.id
                  }
                  value={
                    lot.id
                  }
                >
                  {
                    lot.name
                  }
                </option>
              )
            )}
          </select>

          {selectedLot && (
            <div
              style={{
                marginTop:
                  6,
                color:
                  '#475569',
                fontSize:
                  12,
              }}
            >
              現場作業將以此場站為準
            </div>
          )}
        </>
      )}
    </div>
  )
}