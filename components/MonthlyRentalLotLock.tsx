'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type ParkingLotOption = {
  id: string
  name: string
}

export default function MonthlyRentalLotLock({
  parkingLots,
  currentLotId,
}: {
  parkingLots: ParkingLotOption[]
  currentLotId: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedLotId, setSelectedLotId] =
    useState(currentLotId)

  const [editing, setEditing] =
    useState(!currentLotId)

  useEffect(() => {
    const saved =
      window.localStorage.getItem(
        'monthly-rentals-current-lot'
      )

    if (
      !currentLotId &&
      saved &&
      parkingLots.some(
        (lot) => lot.id === saved
      )
    ) {
      const params =
        new URLSearchParams(
          searchParams.toString()
        )

      params.set('lot', saved)

      router.replace(
        `/dashboard/monthly-rentals?${params.toString()}`
      )
    }
  }, [
    currentLotId,
    parkingLots,
    router,
    searchParams,
  ])

  function applyLot() {
    if (!selectedLotId) {
      alert('請選擇停車場')
      return
    }

    window.localStorage.setItem(
      'monthly-rentals-current-lot',
      selectedLotId
    )

    const params =
      new URLSearchParams(
        searchParams.toString()
      )

    params.set(
      'lot',
      selectedLotId
    )

    router.push(
      `/dashboard/monthly-rentals?${params.toString()}`
    )

    setEditing(false)
  }

  function changeLot() {
    setEditing(true)
  }

  function clearLot() {
    window.localStorage.removeItem(
      'monthly-rentals-current-lot'
    )

    const params =
      new URLSearchParams(
        searchParams.toString()
      )

    params.delete('lot')

    router.push(
      `/dashboard/monthly-rentals?${params.toString()}`
    )

    setSelectedLotId('')
    setEditing(true)
  }

  const currentLot =
    parkingLots.find(
      (lot) =>
        lot.id ===
        currentLotId
    )

  if (
    currentLotId &&
    !editing
  ) {
    return (
      <div
        className="card"
        style={{
          marginTop: 20,
          padding: 16,
          display: 'flex',
          justifyContent:
            'space-between',
          gap: 12,
          alignItems:
            'center',
          flexWrap: 'wrap',
          background:
            '#f8fafc',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              color:
                '#64748b',
              marginBottom: 4,
            }}
          >
            目前處理停車場
          </div>

          <strong
            style={{
              fontSize: 18,
            }}
          >
            {currentLot?.name ||
              '已選擇停車場'}
          </strong>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={changeLot}
            style={{
              padding:
                '9px 14px',
              border:
                '1px solid #cbd5e1',
              borderRadius: 8,
              background:
                '#ffffff',
              cursor:
                'pointer',
            }}
          >
            更換停車場
          </button>

          <button
            type="button"
            onClick={clearLot}
            style={{
              padding:
                '9px 14px',
              border:
                '1px solid #cbd5e1',
              borderRadius: 8,
              background:
                '#ffffff',
              color:
                '#64748b',
              cursor:
                'pointer',
            }}
          >
            查看全部
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="card"
      style={{
        marginTop: 20,
        padding: 16,
        background:
          '#fff',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        選擇目前處理停車場
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems:
            'center',
        }}
      >
        <select
          value={selectedLotId}
          onChange={(event) =>
            setSelectedLotId(
              event.target.value
            )
          }
          style={{
            minWidth: 280,
            padding:
              '9px 10px',
            border:
              '1px solid #cbd5e1',
            borderRadius: 8,
          }}
        >
          <option value="">
            請選擇停車場
          </option>

          {parkingLots.map(
            (lot) => (
              <option
                key={lot.id}
                value={lot.id}
              >
                {lot.name}
              </option>
            )
          )}
        </select>

        <button
          type="button"
          className="btn"
          onClick={applyLot}
        >
          固定這個停車場
        </button>

        {currentLotId && (
          <button
            type="button"
            onClick={() =>
              setEditing(false)
            }
            style={{
              padding:
                '9px 14px',
              border:
                '1px solid #cbd5e1',
              borderRadius: 8,
              background:
                '#ffffff',
              cursor:
                'pointer',
            }}
          >
            取消
          </button>
        )}
      </div>

      <div
        style={{
          marginTop: 8,
          color:
            '#64748b',
          fontSize: 13,
        }}
      >
        固定後，重新整理頁面也會保留目前處理的停車場。
      </div>
    </div>
  )
}
