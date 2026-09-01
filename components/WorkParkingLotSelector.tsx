'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  getSavedWorkParkingLotId,
  saveWorkParkingLotId,
} from '@/components/useWorkParkingLot'

type ParkingLotOption = {
  id: string
  name: string
}

export default function WorkParkingLotSelector({
  parkingLots,
}: {
  parkingLots: ParkingLotOption[]
}) {
  const [
    selectedId,
    setSelectedId,
  ] =
    useState('')

  const selectedLot =
    useMemo(
      () =>
        parkingLots.find(
          (
            lot
          ) =>
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
      setSelectedId(
        ''
      )

      saveWorkParkingLotId(
        ''
      )

      return
    }

    /*
     * 只有一個場站：
     * 自動固定。
     */
    if (
      parkingLots.length ===
      1
    ) {
      const onlyId =
        parkingLots[0].id

      setSelectedId(
        onlyId
      )

      saveWorkParkingLotId(
        onlyId
      )

      return
    }

    /*
     * 讀取之前已經選過的工作停車場。
     */
    const savedId =
      getSavedWorkParkingLotId()

    const valid =
      savedId &&
      parkingLots.some(
        (
          lot
        ) =>
          lot.id ===
          savedId
      )

    if (
      valid &&
      savedId
    ) {
      setSelectedId(
        savedId
      )

      /*
       * 重新同步一次
       * localStorage + cookie。
       */
      saveWorkParkingLotId(
        savedId
      )

      return
    }

    /*
     * 多場管理第一次登入時，
     * 不自動亂選。
     */
    setSelectedId(
      ''
    )
  }, [
    parkingLots,
  ])

  function changeLot(
    parkingLotId: string
  ) {
    setSelectedId(
      parkingLotId
    )

    saveWorkParkingLotId(
      parkingLotId
    )

    /*
     * 很重要：
     * reload 後 Server Component
     * 才會立即讀到最新 cookie。
     */
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
                event
                  .target
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
              (
                lot
              ) => (
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
              現場作業將固定使用此停車場
            </div>
          )}
        </>
      )}
    </div>
  )
}