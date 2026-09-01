'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import Link from 'next/link'

import { createClient } from '@/lib/supabase/client'
import { getSavedWorkParkingLotId } from '@/components/useWorkParkingLot'

type ParkingLot = {
  id: string
  name: string
}

type WaitingRow = {
  id: string
  parking_lot_id: string

  wait_no:
    number | null

  customer_name:
    string

  phone:
    string | null

  vehicle_type:
    string

  vehicle_plate:
    string | null

  notes:
    string | null

  status:
    string

  registered_date:
    string | null

  converted_at:
    string | null

  created_at:
    string

  parking_lots?: {
    name: string
  } | null
}

type WaitingForm = {
  customer_name:
    string

  phone:
    string

  vehicle_type:
    string

  vehicle_plate:
    string

  notes:
    string
}

function normalizePhone(
  value: string
) {
  return String(
    value || ''
  )
    .replace(
      /\s+/g,
      ''
    )
    .replace(
      /-/g,
      ''
    )
    .trim()
}

function normalizePlate(
  value: string
) {
  return String(
    value || ''
  )
    .toUpperCase()
    .replace(
      /\s+/g,
      ''
    )
    .trim()
}

function vehicleTypeText(
  value?: string | null
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

function todayText() {
  const now =
    new Date()

  const year =
    now.getFullYear()

  const month =
    String(
      now.getMonth() +
        1
    ).padStart(
      2,
      '0'
    )

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      '0'
    )

  return `${year}-${month}-${day}`
}

export default function WaitingListPage() {
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
    selectedLotId,
    setSelectedLotId,
  ] =
    useState('')

  const [
    rows,
    setRows,
  ] =
    useState<
      WaitingRow[]
    >([])

  const [
    search,
    setSearch,
  ] =
    useState('')

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    saving,
    setSaving,
  ] =
    useState(false)

  const [
    message,
    setMessage,
  ] =
    useState('')

  const [
    form,
    setForm,
  ] =
    useState<WaitingForm>({
      customer_name:
        '',
      phone:
        '',
      vehicle_type:
        'car',
      vehicle_plate:
        '',
      notes:
        '',
    })

  useEffect(() => {
    loadParkingLots()
  }, [])

  useEffect(() => {
    if (
      selectedLotId
    ) {
      loadWaitingList(
        selectedLotId
      )
    } else {
      setRows([])
    }
  }, [
    selectedLotId,
  ])

  async function loadParkingLots() {
    setLoading(true)
    setMessage('')

    try {
      const {
        data,
        error,
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

      if (error) {
        setMessage(
          `停車場讀取失敗：${error.message}`
        )

        return
      }

      const lots =
        (
          data ||
          []
        ) as ParkingLot[]

      setParkingLots(
        lots
      )

      const workLotId =
        getSavedWorkParkingLotId()

      if (
        workLotId &&
        lots.some(
          (lot) =>
            lot.id ===
            workLotId
        )
      ) {
        setSelectedLotId(
          workLotId
        )
      } else {
        setSelectedLotId(
          ''
        )

        setMessage(
          '請先在左側「目前工作停車場」選擇停車場。'
        )
      }
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '讀取失敗'
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadWaitingList(
    lotId: string
  ) {
    setLoading(true)

    try {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            'monthly_waiting_list'
          )
          .select(`
            id,
            parking_lot_id,
            wait_no,
            customer_name,
            phone,
            vehicle_type,
            vehicle_plate,
            notes,
            status,
            registered_date,
            converted_at,
            created_at,
            parking_lots (
              name
            )
          `)
          .eq(
            'parking_lot_id',
            lotId
          )
          .eq(
            'status',
            'waiting'
          )
          .order(
            'wait_no',
            {
              ascending:
                true,
            }
          )
          .order(
            'created_at',
            {
              ascending:
                true,
            }
          )

      if (error) {
        setMessage(
          `候補名單讀取失敗：${error.message}`
        )

        return
      }

      const normalizedRows: WaitingRow[] =
        (
          data ||
          []
        ).map(
          (
            item: any
          ) => ({
            ...item,

            parking_lots:
              Array.isArray(
                item.parking_lots
              )
                ? item
                    .parking_lots[0] ||
                  null
                : item.parking_lots ||
                  null,
          })
        )

      setRows(
        normalizedRows
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '候補名單讀取失敗'
      )
    } finally {
      setLoading(false)
    }
  }

  async function addWaiting() {
    if (
      !selectedLotId
    ) {
      alert(
        '請先在左側選擇目前工作停車場'
      )

      return
    }

    if (
      !form.customer_name.trim()
    ) {
      alert(
        '請輸入姓名'
      )

      return
    }

    setSaving(true)
    setMessage('')

    try {
      const {
        data: {
          user,
        },
      } =
        await supabase
          .auth
          .getUser()

      if (!user) {
        setMessage(
          '登入狀態失效，請重新登入'
        )

        return
      }

      const {
        error,
      } =
        await supabase
          .from(
            'monthly_waiting_list'
          )
          .insert({
            parking_lot_id:
              selectedLotId,

            customer_name:
              form.customer_name.trim(),

            phone:
              normalizePhone(
                form.phone
              ) ||
              null,

            vehicle_type:
              form.vehicle_type,

            vehicle_plate:
              normalizePlate(
                form.vehicle_plate
              ) ||
              null,

            notes:
              form.notes.trim() ||
              null,

            status:
              'waiting',

            registered_date:
              todayText(),

            created_by:
              user.id,
          })

      if (error) {
        setMessage(
          `新增候補失敗：${error.message}`
        )

        return
      }

      setForm({
        customer_name:
          '',
        phone:
          '',
        vehicle_type:
          'car',
        vehicle_plate:
          '',
        notes:
          '',
      })

      await loadWaitingList(
        selectedLotId
      )

      setMessage(
        '候補名單新增成功'
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '新增候補失敗'
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteWaiting(
    item: WaitingRow
  ) {
    const confirmed =
      window.confirm(
        `確定刪除候補名單「${item.customer_name}」？`
      )

    if (
      !confirmed
    ) {
      return
    }

    if (
      item.parking_lot_id !==
      selectedLotId
    ) {
      alert(
        '這筆資料不屬於目前工作停車場'
      )

      return
    }

    const {
      error,
    } =
      await supabase
        .from(
          'monthly_waiting_list'
        )
        .delete()
        .eq(
          'id',
          item.id
        )
        .eq(
          'parking_lot_id',
          selectedLotId
        )

    if (error) {
      setMessage(
        `刪除失敗：${error.message}`
      )

      return
    }

    await loadWaitingList(
      selectedLotId
    )
  }

  const currentLot =
    useMemo(
      () =>
        parkingLots.find(
          (lot) =>
            lot.id ===
            selectedLotId
        ),
      [
        parkingLots,
        selectedLotId,
      ]
    )

  const filteredRows =
    useMemo(
      () => {
        const keyword =
          search
            .trim()
            .toLowerCase()

        if (!keyword) {
          return rows
        }

        return rows.filter(
          (row) => {
            const text = [
              row.customer_name,
              row.phone ||
                '',
              row.vehicle_plate ||
                '',
              vehicleTypeText(
                row.vehicle_type
              ),
              row.notes ||
                '',
            ]
              .join(
                ' '
              )
              .toLowerCase()

            return text.includes(
              keyword
            )
          }
        )
      },
      [
        rows,
        search,
      ]
    )

  if (
    loading &&
    parkingLots.length ===
      0
  ) {
    return (
      <div>
        讀取中…
      </div>
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
            月租候補名單
          </h1>

          <div
            className="muted"
          >
            {currentLot
              ? `目前工作停車場：${currentLot.name}`
              : '請先選擇目前工作停車場'}
          </div>
        </div>

        <Link
          href="/dashboard/monthly-rentals"
          style={{
            padding:
              '9px 14px',
            border:
              '1px solid #cbd5e1',
            borderRadius:
              8,
            background:
              '#fff',
            color:
              '#334155',
            textDecoration:
              'none',
            fontWeight:
              600,
          }}
        >
          返回月租管理
        </Link>
      </div>

      {!selectedLotId && (
        <div
          className="card"
          style={{
            marginTop:
              20,
            background:
              '#fffbeb',
            color:
              '#b45309',
            fontWeight:
              700,
          }}
        >
          請先在左側「目前工作停車場」選擇停車場。
          候補名單只會顯示目前工作停車場的資料。
        </div>
      )}

      {selectedLotId &&
        currentLot && (
          <div
            className="card"
            style={{
              marginTop:
                20,
              background:
                '#f8fafc',
            }}
          >
            <div
              className="muted"
              style={{
                fontSize:
                  13,
                marginBottom:
                  4,
              }}
            >
              目前工作停車場
            </div>

            <strong
              style={{
                fontSize:
                  18,
              }}
            >
              {
                currentLot.name
              }
            </strong>
          </div>
        )}

      <div
        className="card"
        style={{
          marginTop:
            20,
        }}
      >
        <h2
          style={{
            marginTop:
              0,
          }}
        >
          新增候補
        </h2>

        <div
          style={{
            display:
              'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(180px,1fr))',
            gap:
              12,
          }}
        >
          <div className="field">
            <label>
              姓名
            </label>

            <input
              value={
                form.customer_name
              }
              onChange={(
                event
              ) =>
                setForm(
                  (
                    current
                  ) => ({
                    ...current,
                    customer_name:
                      event
                        .target
                        .value,
                  })
                )
              }
            />
          </div>

          <div className="field">
            <label>
              電話
            </label>

            <input
              value={
                form.phone
              }
              onChange={(
                event
              ) =>
                setForm(
                  (
                    current
                  ) => ({
                    ...current,
                    phone:
                      event
                        .target
                        .value,
                  })
                )
              }
            />
          </div>

          <div className="field">
            <label>
              車種
            </label>

            <select
              value={
                form.vehicle_type
              }
              onChange={(
                event
              ) =>
                setForm(
                  (
                    current
                  ) => ({
                    ...current,
                    vehicle_type:
                      event
                        .target
                        .value,
                  })
                )
              }
            >
              <option value="car">
                汽車
              </option>

              <option value="motorcycle">
                機車
              </option>

              <option value="heavy_motorcycle">
                重機
              </option>
            </select>
          </div>

          <div className="field">
            <label>
              車牌
            </label>

            <input
              value={
                form.vehicle_plate
              }
              onChange={(
                event
              ) =>
                setForm(
                  (
                    current
                  ) => ({
                    ...current,
                    vehicle_plate:
                      event
                        .target
                        .value,
                  })
                )
              }
            />
          </div>

          <div className="field">
            <label>
              備註
            </label>

            <input
              value={
                form.notes
              }
              onChange={(
                event
              ) =>
                setForm(
                  (
                    current
                  ) => ({
                    ...current,
                    notes:
                      event
                        .target
                        .value,
                  })
                )
              }
            />
          </div>
        </div>

        <div
          style={{
            marginTop:
              14,
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={
              addWaiting
            }
            disabled={
              saving ||
              !selectedLotId
            }
          >
            {saving
              ? '新增中…'
              : '新增候補'}
          </button>
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
            display:
              'flex',
            justifyContent:
              'space-between',
            alignItems:
              'center',
            gap:
              12,
            flexWrap:
              'wrap',
          }}
        >
          <div>
            <h2
              style={{
                margin:
                  0,
              }}
            >
              候補名單
            </h2>

            {currentLot && (
              <div
                className="muted"
                style={{
                  marginTop:
                    4,
                }}
              >
                {
                  currentLot.name
                }
              </div>
            )}
          </div>

          <div
            style={{
              display:
                'flex',
              gap:
                10,
              alignItems:
                'center',
              flexWrap:
                'wrap',
            }}
          >
            <input
              value={
                search
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
              placeholder="搜尋姓名、電話、車牌、備註"
              style={{
                minWidth:
                  260,
              }}
            />

            <span className="muted">
              共{' '}
              {
                filteredRows.length
              }{' '}
              筆
            </span>
          </div>
        </div>

        {message && (
          <div
            style={{
              marginTop:
                14,
              padding:
                10,
              borderRadius:
                8,
              background:
                '#f8fafc',
              color:
                message.includes(
                  '失敗'
                ) ||
                message.includes(
                  '錯誤'
                )
                  ? '#b91c1c'
                  : '#334155',
            }}
          >
            {message}
          </div>
        )}

        {!selectedLotId ? (
          <div
            style={{
              padding:
                30,
              textAlign:
                'center',
              color:
                '#64748b',
            }}
          >
            請先選擇目前工作停車場。
          </div>
        ) : filteredRows.length ===
          0 ? (
          <div
            style={{
              padding:
                30,
              textAlign:
                'center',
              color:
                '#64748b',
            }}
          >
            目前沒有候補資料。
          </div>
        ) : (
          <div
            style={{
              overflowX:
                'auto',
              marginTop:
                16,
            }}
          >
            <table
              style={{
                width:
                  '100%',
                minWidth:
                  980,
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
                  <th
                    style={{
                      padding:
                        9,
                    }}
                  >
                    順位
                  </th>

                  <th
                    style={{
                      padding:
                        9,
                    }}
                  >
                    姓名
                  </th>

                  <th
                    style={{
                      padding:
                        9,
                    }}
                  >
                    電話
                  </th>

                  <th
                    style={{
                      padding:
                        9,
                    }}
                  >
                    車種
                  </th>

                  <th
                    style={{
                      padding:
                        9,
                    }}
                  >
                    車牌
                  </th>

                  <th
                    style={{
                      padding:
                        9,
                    }}
                  >
                    登記日期
                  </th>

                  <th
                    style={{
                      padding:
                        9,
                    }}
                  >
                    備註
                  </th>

                  <th
                    style={{
                      padding:
                        9,
                    }}
                  >
                    操作
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map(
                  (
                    item,
                    index
                  ) => (
                    <tr
                      key={
                        item.id
                      }
                      style={{
                        borderTop:
                          '1px solid #e5e7eb',
                      }}
                    >
                      <td
                        style={{
                          padding:
                            9,
                          fontWeight:
                            700,
                        }}
                      >
                        {item.wait_no ??
                          index +
                            1}
                      </td>

                      <td
                        style={{
                          padding:
                            9,
                          fontWeight:
                            700,
                        }}
                      >
                        {
                          item.customer_name
                        }
                      </td>

                      <td
                        style={{
                          padding:
                            9,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {item.phone ||
                          '-'}
                      </td>

                      <td
                        style={{
                          padding:
                            9,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {vehicleTypeText(
                          item.vehicle_type
                        )}
                      </td>

                      <td
                        style={{
                          padding:
                            9,
                          fontWeight:
                            700,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {item.vehicle_plate ||
                          '-'}
                      </td>

                      <td
                        style={{
                          padding:
                            9,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {item.registered_date ||
                          '-'}
                      </td>

                      <td
                        style={{
                          padding:
                            9,
                          minWidth:
                            180,
                        }}
                      >
                        {item.notes ||
                          '-'}
                      </td>

                      <td
                        style={{
                          padding:
                            9,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        <div
                          style={{
                            display:
                              'flex',
                            gap:
                              8,
                            flexWrap:
                              'wrap',
                          }}
                        >
                          <Link
                            href={`/dashboard/monthly-rentals/new?parking_lot_id=${encodeURIComponent(
                              selectedLotId
                            )}&waiting_id=${encodeURIComponent(
                              item.id
                            )}`}
                            style={{
                              color:
                                '#2563eb',
                              textDecoration:
                                'none',
                              fontWeight:
                                700,
                            }}
                          >
                            轉正式
                          </Link>

                          <button
                            type="button"
                            onClick={() =>
                              deleteWaiting(
                                item
                              )
                            }
                            style={{
                              border:
                                0,
                              background:
                                'transparent',
                              color:
                                '#dc2626',
                              cursor:
                                'pointer',
                              fontWeight:
                                700,
                              padding:
                                0,
                            }}
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}