'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'

type ParkingLot = {
  id: string
  name: string
}

type Rental = {
  id: string
  parking_lot_id: string
  customer_name: string
  phone: string | null
  vehicle_plate: string
  vehicle_type: string
  rental_type: string | null
  start_date: string
  end_date: string
  monthly_fee: number
  payment_status: string
  rental_status: string
}

type DueFilter =
  | 'all'
  | 'expired'
  | '20'

function vehicleTypeText(
  value: string
) {
  if (
    value ===
    'motorcycle'
  ) {
    return '機車'
  }

  if (
    value ===
    'heavy_motorcycle'
  ) {
    return '重機'
  }

  return '汽車'
}

function normalizePhone(
  value: string
) {
  return String(value || '')
    .replace(/\s/g, '')
    .replace(/-/g, '')
}

function todayText() {
  const now =
    new Date()

  const year =
    now.getFullYear()

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, '0')

  const day =
    String(
      now.getDate()
    ).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function daysBetween(
  fromDate: string,
  toDate: string
) {
  const from =
    new Date(
      `${fromDate}T00:00:00`
    )

  const to =
    new Date(
      `${toDate}T00:00:00`
    )

  const diff =
    to.getTime() -
    from.getTime()

  return Math.floor(
    diff /
      (24 * 60 * 60 * 1000)
  )
}

function dueText(
  endDate: string
) {
  const today =
    todayText()

  const days =
    daysBetween(
      today,
      endDate
    )

  if (
    days < 0
  ) {
    return `已到期 ${Math.abs(days)} 天`
  }

  if (
    days === 0
  ) {
    return '今天到期'
  }

  if (
    days <= 20
  ) {
    return `${days} 天後到期`
  }

  return '超過 20 天'
}

function escapeCsv(
  value: unknown
) {
  const text =
    String(
      value ?? ''
    )

  if (
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n')
  ) {
    return `"${text.replace(
      /"/g,
      '""'
    )}"`
  }

  return text
}

export default function SmsListPage() {
  const supabase =
    createClient()

  const [
    parkingLots,
    setParkingLots,
  ] =
    useState<
      ParkingLot[]
    >([])

  const [
    rentals,
    setRentals,
  ] =
    useState<
      Rental[]
    >([])

  const [
    selectedLotId,
    setSelectedLotId,
  ] =
    useState(
      'all'
    )

  const [
    search,
    setSearch,
  ] =
    useState('')

  const [
    dueFilter,
    setDueFilter,
  ] =
    useState<DueFilter>(
      '20'
    )

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    message,
    setMessage,
  ] =
    useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setMessage('')

    try {
      const {
        data:
          lotData,
        error:
          lotError,
      } =
        await supabase
          .from(
            'parking_lots'
          )
          .select(
            'id, name'
          )
          .eq(
            'status',
            'active'
          )
          .order(
            'name'
          )

      if (
        lotError
      ) {
        setMessage(
          '停車場讀取失敗：' +
            lotError.message
        )

        return
      }

      const {
        data:
          rentalData,
        error:
          rentalError,
      } =
        await supabase
          .from(
            'monthly_rentals'
          )
          .select(`
            id,
            parking_lot_id,
            customer_name,
            phone,
            vehicle_plate,
            vehicle_type,
            rental_type,
            start_date,
            end_date,
            monthly_fee,
            payment_status,
            rental_status
          `)
          .eq(
            'rental_status',
            'active'
          )
          .eq(
            'payment_status',
            'unpaid'
          )
          .order(
            'end_date',
            {
              ascending:
                true,
            }
          )

      if (
        rentalError
      ) {
        setMessage(
          '月租資料讀取失敗：' +
            rentalError.message
        )

        return
      }

      setParkingLots(
        lotData || []
      )

      setRentals(
        (rentalData ||
          []) as Rental[]
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '資料讀取失敗'
      )
    } finally {
      setLoading(false)
    }
  }

  const lotMap =
    useMemo(() => {
      return new Map(
        parkingLots.map(
          (lot) => [
            lot.id,
            lot.name,
          ]
        )
      )
    }, [
      parkingLots,
    ])

  const filteredRows =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase()

      const today =
        todayText()

      return rentals.filter(
        (row) => {
          if (
            selectedLotId !==
              'all' &&
            row.parking_lot_id !==
              selectedLotId
          ) {
            return false
          }

          if (
            keyword
          ) {
            const text = [
              row.customer_name,
              row.phone || '',
              row.vehicle_plate,
              row.rental_type || '',
              lotMap.get(
                row.parking_lot_id
              ) || '',
            ]
              .join(' ')
              .toLowerCase()

            if (
              !text.includes(
                keyword
              )
            ) {
              return false
            }
          }

          if (
            dueFilter ===
            'all'
          ) {
            return true
          }

          const days =
            daysBetween(
              today,
              row.end_date
            )

          if (
            dueFilter ===
            'expired'
          ) {
            return days < 0
          }

          const maxDays =
            Number(
              dueFilter
            )

          return (
            days >= 0 &&
            days <= maxDays
          )
        }
      )
    }, [
      rentals,
      selectedLotId,
      search,
      dueFilter,
      lotMap,
    ])

  const missingPhoneCount =
    useMemo(() => {
      return filteredRows.filter(
        (row) =>
          !normalizePhone(
            row.phone || ''
          )
      ).length
    }, [
      filteredRows,
    ])

  function exportCsv() {
    if (
      filteredRows.length ===
      0
    ) {
      alert(
        '目前沒有可匯出的簡訊名單'
      )

      return
    }

    const headers = [
      '停車場',
      '姓名',
      '電話',
      '車牌',
      '車種',
      '月租類型',
      '到期日',
      '月租金額',
      '到期狀態',
    ]

    const lines = [
      headers
        .map(
          escapeCsv
        )
        .join(','),
      ...filteredRows.map(
        (row) =>
          [
            lotMap.get(
              row.parking_lot_id
            ) || '',
            row.customer_name,
            normalizePhone(
              row.phone || ''
            ),
            row.vehicle_plate,
            vehicleTypeText(
              row.vehicle_type
            ),
            row.rental_type ||
              '',
            row.end_date,
            row.monthly_fee,
            dueText(
              row.end_date
            ),
          ]
            .map(
              escapeCsv
            )
            .join(',')
      ),
    ]

    const csvText =
      '\uFEFF' +
      lines.join(
        '\r\n'
      )

    const blob =
      new Blob(
        [csvText],
        {
          type:
            'text/csv;charset=utf-8;',
        }
      )

    const url =
      URL.createObjectURL(
        blob
      )

    const a =
      document.createElement(
        'a'
      )

    const selectedLotName =
      selectedLotId ===
      'all'
        ? '全部停車場'
        : lotMap.get(
            selectedLotId
          ) ||
          '停車場'

    a.href = url
    a.download =
      `${selectedLotName}_簡訊名單_${todayText()}.csv`

    document.body.appendChild(
      a
    )

    a.click()

    document.body.removeChild(
      a
    )

    URL.revokeObjectURL(
      url
    )
  }

  return (
    <div
      style={{
        paddingBottom:
          40,
      }}
    >
      <div
        style={{
          display:
            'flex',
          justifyContent:
            'space-between',
          alignItems:
            'flex-start',
          gap: 16,
          flexWrap:
            'wrap',
        }}
      >
        <div>
          <h1
            style={{
              marginTop:
                0,
              marginBottom:
                6,
            }}
          >
            每月簡訊名單
          </h1>

          <div
            className="muted"
          >
            顯示目前「未繳費＋在租中」的月租戶，預設以到期前 20 天內為提醒範圍。
          </div>
        </div>

        <button
          type="button"
          className="btn"
          onClick={
            exportCsv
          }
        >
          匯出目前名單 CSV
        </button>
      </div>

      <div
        className="card"
        style={{
          marginTop:
            20,
        }}
      >
        <div
          style={{
            display:
              'grid',
            gridTemplateColumns:
              'minmax(220px,1fr) minmax(220px,1fr) 190px',
            gap: 12,
          }}
        >
          <div
            className="field"
          >
            <label>
              停車場
            </label>

            <select
              value={
                selectedLotId
              }
              onChange={(
                event
              ) =>
                setSelectedLotId(
                  event
                    .target
                    .value
                )
              }
            >
              <option value="all">
                全部停車場
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
          </div>

          <div
            className="field"
          >
            <label>
              搜尋
            </label>

            <input
              value={
                search
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event
                    .target
                    .value
                )
              }
              placeholder="姓名、電話、車牌、月租類型"
            />
          </div>

          <div
            className="field"
          >
            <label>
              到期範圍
            </label>

            <select
              value={
                dueFilter
              }
              onChange={(
                event
              ) =>
                setDueFilter(
                  event
                    .target
                    .value as DueFilter
                )
              }
            >
              <option value="20">
                20 天內到期
              </option>

              <option value="expired">
                已到期
              </option>

              <option value="all">
                全部未繳
              </option>
            </select>
          </div>
        </div>

        {message && (
          <div
            style={{
              marginTop:
                14,
              padding:
                12,
              borderRadius:
                8,
              background:
                '#fee2e2',
              color:
                '#b91c1c',
            }}
          >
            {
              message
            }
          </div>
        )}
      </div>

      <div
        style={{
          display:
            'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginTop:
            20,
        }}
      >
        <div
          className="card"
        >
          <div
            className="muted"
          >
            目前名單
          </div>

          <div
            style={{
              fontSize:
                28,
              fontWeight:
                800,
              marginTop:
                6,
            }}
          >
            {
              filteredRows.length
            }
          </div>
        </div>

        <div
          className="card"
        >
          <div
            className="muted"
          >
            缺少電話
          </div>

          <div
            style={{
              fontSize:
                28,
              fontWeight:
                800,
              marginTop:
                6,
              color:
                missingPhoneCount >
                0
                  ? '#b91c1c'
                  : '#15803d',
            }}
          >
            {
              missingPhoneCount
            }
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop:
            20,
        }}
      >
        <div
          style={{
            overflowX:
              'auto',
          }}
        >
          <table
            style={{
              width:
                '100%',
              minWidth:
                1150,
              borderCollapse:
                'collapse',
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign:
                    'left',
                }}
              >
                <th>
                  停車場
                </th>

                <th>
                  姓名
                </th>

                <th>
                  電話
                </th>

                <th>
                  車牌
                </th>

                <th>
                  車種
                </th>

                <th>
                  月租類型
                </th>

                <th>
                  到期日
                </th>

                <th>
                  月租金額
                </th>

                <th>
                  到期狀態
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      9
                    }
                    style={{
                      padding:
                        20,
                    }}
                  >
                    讀取中…
                  </td>
                </tr>
              ) : filteredRows.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={
                      9
                    }
                    style={{
                      padding:
                        20,
                      color:
                        '#64748b',
                    }}
                  >
                    目前沒有符合條件的簡訊名單
                  </td>
                </tr>
              ) : (
                filteredRows.map(
                  (
                    row
                  ) => {
                    const phoneText =
                      normalizePhone(
                        row.phone ||
                          ''
                      )

                    const expired =
                      daysBetween(
                        todayText(),
                        row.end_date
                      ) <
                      0

                    return (
                      <tr
                        key={
                          row.id
                        }
                        style={{
                          borderTop:
                            '1px solid #e5e7eb',
                        }}
                      >
                        <td
                          style={{
                            padding:
                              10,
                            minWidth:
                              190,
                          }}
                        >
                          {lotMap.get(
                            row.parking_lot_id
                          ) ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding:
                              10,
                            fontWeight:
                              700,
                          }}
                        >
                          {
                            row.customer_name
                          }
                        </td>

                        <td
                          style={{
                            padding:
                              10,
                            color:
                              phoneText
                                ? undefined
                                : '#b91c1c',
                            fontWeight:
                              phoneText
                                ? 500
                                : 700,
                          }}
                        >
                          {phoneText ||
                            '缺少電話'}
                        </td>

                        <td
                          style={{
                            padding:
                              10,
                            fontWeight:
                              700,
                          }}
                        >
                          {
                            row.vehicle_plate
                          }
                        </td>

                        <td
                          style={{
                            padding:
                              10,
                          }}
                        >
                          {vehicleTypeText(
                            row.vehicle_type
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              10,
                          }}
                        >
                          {row.rental_type ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding:
                              10,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {
                            row.end_date
                          }
                        </td>

                        <td
                          style={{
                            padding:
                              10,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          NT${' '}
                          {Number(
                            row.monthly_fee ||
                              0
                          ).toLocaleString(
                            'zh-TW'
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              10,
                            whiteSpace:
                              'nowrap',
                            color:
                              expired
                                ? '#b91c1c'
                                : '#d97706',
                            fontWeight:
                              700,
                          }}
                        >
                          {dueText(
                            row.end_date
                          )}
                        </td>
                      </tr>
                    )
                  }
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
