'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  createClient,
} from '@/lib/supabase/client'

type ParkingLot = {
  id: string
  name: string
}

type WaitingRow = {
  id: string

  parking_lot_id: string

  wait_no: number

  customer_name: string

  phone: string | null

  vehicle_type:
    | 'car'
    | 'motorcycle'
    | 'heavy_motorcycle'

  vehicle_plate:
    | string
    | null

  notes:
    | string
    | null

  status:
    | 'waiting'
    | 'converted'
    | 'cancelled'

  registered_date: string

  converted_at:
    | string
    | null

  created_at: string

  parking_lots?: {
    name: string
  } | null
}

type FormData = {
  customer_name: string
  phone: string
  vehicle_type:
    | 'car'
    | 'motorcycle'
    | 'heavy_motorcycle'
  vehicle_plate: string
  notes: string
}

const emptyForm: FormData = {
  customer_name: '',
  phone: '',
  vehicle_type: 'car',
  vehicle_plate: '',
  notes: '',
}

function vehicleTypeText(
  type: string
) {
  if (
    type ===
    'motorcycle'
  ) {
    return '機車'
  }

  if (
    type ===
    'heavy_motorcycle'
  ) {
    return '重機'
  }

  return '汽車'
}

function normalizePhone(
  value: string
) {
  return value
    .replace(/\s/g, '')
    .replace(/-/g, '')
}

function normalizePlate(
  value: string
) {
  return value
    .replace(/\s/g, '')
    .toUpperCase()
}

export default function WaitingListPage() {
  const supabase =
    createClient()

  const [
    parkingLots,
    setParkingLots,
  ] = useState<
    ParkingLot[]
  >([])

  const [
    rows,
    setRows,
  ] = useState<
    WaitingRow[]
  >([])

  const [
    selectedLotId,
    setSelectedLotId,
  ] = useState('')

  const [
    search,
    setSearch,
  ] = useState('')

  const [
    vehicleFilter,
    setVehicleFilter,
  ] = useState('all')

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    message,
    setMessage,
  ] = useState('')

  const [
    showForm,
    setShowForm,
  ] = useState(false)

  const [
    form,
    setForm,
  ] =
    useState<FormData>(
      emptyForm
    )

  useEffect(() => {
    loadInitial()
  }, [])

  useEffect(() => {
    if (
      selectedLotId
    ) {
      loadWaitingList(
        selectedLotId
      )
    }
  }, [
    selectedLotId,
  ])

  async function loadInitial() {
    setLoading(true)

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
        data || []

      setParkingLots(
        lots
      )

      if (
        lots.length > 0
      ) {
        setSelectedLotId(
          lots[0].id
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
        (data || []).map((item: any) => ({
          ...item,
          parking_lots:
            Array.isArray(item.parking_lots)
              ? item.parking_lots[0] || null
              : item.parking_lots || null,
        }))

      setRows(normalizedRows)
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
        '請先選擇停車場'
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
              new Date()
                .toISOString()
                .slice(
                  0,
                  10
                ),

            created_by:
              user.id,
          })

      if (error) {
        setMessage(
          `新增失敗：${error.message}`
        )

        return
      }

      setForm(
        emptyForm
      )

      setShowForm(
        false
      )

      setMessage(
        '候補資料新增完成'
      )

      await loadWaitingList(
        selectedLotId
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '新增失敗'
      )
    } finally {
      setSaving(false)
    }
  }

  async function cancelWaiting(
    row: WaitingRow
  ) {
    const confirmed =
      window.confirm(
        `確定取消候補？\n\n` +
          `順位：${row.wait_no}\n` +
          `姓名：${row.customer_name}`
      )

    if (
      !confirmed
    ) {
      return
    }

    const {
      error,
    } =
      await supabase
        .from(
          'monthly_waiting_list'
        )
        .update({
          status:
            'cancelled',
        })
        .eq(
          'id',
          row.id
        )

    if (error) {
      alert(
        `取消失敗：${error.message}`
      )

      return
    }

    setMessage(
      `${row.customer_name} 已取消候補`
    )

    await loadWaitingList(
      selectedLotId
    )
  }

  async function moveUp(
    index: number
  ) {
    if (
      index <= 0
    ) {
      return
    }

    const current =
      filteredRows[index]

    const previous =
      filteredRows[
        index - 1
      ]

    if (
      !current ||
      !previous
    ) {
      return
    }

    const currentNo =
      current.wait_no

    const previousNo =
      previous.wait_no

    const {
      error:
        firstError,
    } =
      await supabase
        .from(
          'monthly_waiting_list'
        )
        .update({
          wait_no:
            -999999,
        })
        .eq(
          'id',
          current.id
        )

    if (
      firstError
    ) {
      alert(
        firstError.message
      )

      return
    }

    const {
      error:
        secondError,
    } =
      await supabase
        .from(
          'monthly_waiting_list'
        )
        .update({
          wait_no:
            currentNo,
        })
        .eq(
          'id',
          previous.id
        )

    if (
      secondError
    ) {
      alert(
        secondError.message
      )

      return
    }

    const {
      error:
        thirdError,
    } =
      await supabase
        .from(
          'monthly_waiting_list'
        )
        .update({
          wait_no:
            previousNo,
        })
        .eq(
          'id',
          current.id
        )

    if (
      thirdError
    ) {
      alert(
        thirdError.message
      )

      return
    }

    await loadWaitingList(
      selectedLotId
    )
  }

  async function moveDown(
    index: number
  ) {
    if (
      index >=
      filteredRows.length -
        1
    ) {
      return
    }

    const current =
      filteredRows[index]

    const next =
      filteredRows[
        index + 1
      ]

    if (
      !current ||
      !next
    ) {
      return
    }

    const currentNo =
      current.wait_no

    const nextNo =
      next.wait_no

    const {
      error:
        firstError,
    } =
      await supabase
        .from(
          'monthly_waiting_list'
        )
        .update({
          wait_no:
            -999999,
        })
        .eq(
          'id',
          current.id
        )

    if (
      firstError
    ) {
      alert(
        firstError.message
      )

      return
    }

    const {
      error:
        secondError,
    } =
      await supabase
        .from(
          'monthly_waiting_list'
        )
        .update({
          wait_no:
            currentNo,
        })
        .eq(
          'id',
          next.id
        )

    if (
      secondError
    ) {
      alert(
        secondError.message
      )

      return
    }

    const {
      error:
        thirdError,
    } =
      await supabase
        .from(
          'monthly_waiting_list'
        )
        .update({
          wait_no:
            nextNo,
        })
        .eq(
          'id',
          current.id
        )

    if (
      thirdError
    ) {
      alert(
        thirdError.message
      )

      return
    }

    await loadWaitingList(
      selectedLotId
    )
  }

  function convertToRental(
    row: WaitingRow
  ) {
    const params =
      new URLSearchParams()

    params.set(
      'waiting_id',
      row.id
    )

    params.set(
      'parking_lot_id',
      row.parking_lot_id
    )

    params.set(
      'customer_name',
      row.customer_name
    )

    if (
      row.phone
    ) {
      params.set(
        'phone',
        row.phone
      )
    }

    if (
      row.vehicle_plate
    ) {
      params.set(
        'vehicle_plate',
        row.vehicle_plate
      )
    }

    params.set(
      'vehicle_type',
      row.vehicle_type
    )

    if (
      row.notes
    ) {
      params.set(
        'notes',
        row.notes
      )
    }

    window.location.href =
      `/dashboard/monthly-rentals/new?${params.toString()}`
  }

  const filteredRows =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase()

      return rows.filter(
        (row) => {
          if (
            vehicleFilter !==
              'all' &&
            row.vehicle_type !==
              vehicleFilter
          ) {
            return false
          }

          if (
            !keyword
          ) {
            return true
          }

          const values = [
            row.customer_name,
            row.phone || '',
            row.vehicle_plate ||
              '',
            row.notes || '',
          ]
            .join(' ')
            .toLowerCase()

          return values.includes(
            keyword
          )
        }
      )
    }, [
      rows,
      search,
      vehicleFilter,
    ])

  const selectedLot =
    parkingLots.find(
      (lot) =>
        lot.id ===
        selectedLotId
    )

  return (
    <div
      style={{
        paddingBottom:
          40,
      }}
    >
      <div
        style={{
          display: 'flex',
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
              marginTop: 0,
              marginBottom:
                6,
            }}
          >
            月租候補名單
          </h1>

          <div
            style={{
              color:
                '#64748b',
            }}
          >
            管理各停車場月租候補順位與轉正式月租。
          </div>
        </div>

        <button
          type="button"
          className="btn"
          onClick={() =>
            setShowForm(
              true
            )
          }
        >
          ＋ 新增候補
        </button>
      </div>

      <div
        className="card"
        style={{
          marginTop: 20,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(220px,1fr) minmax(220px,1fr) 180px',
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
              ) => {
                setSelectedLotId(
                  event.target
                    .value
                )

                setMessage('')
              }}
            >
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
                  event.target
                    .value
                )
              }
              placeholder="姓名、電話、車牌、備註"
            />
          </div>

          <div
            className="field"
          >
            <label>
              車種
            </label>

            <select
              value={
                vehicleFilter
              }
              onChange={(
                event
              ) =>
                setVehicleFilter(
                  event.target
                    .value
                )
              }
            >
              <option value="all">
                全部
              </option>

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
        </div>

        {message && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 8,
              background:
                '#f8fafc',
            }}
          >
            {message}
          </div>
        )}
      </div>

      <div
        className="card"
        style={{
          marginTop: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems:
              'center',
            gap: 12,
          }}
        >
          <h2
            style={{
              margin: 0,
            }}
          >
            {selectedLot?.name ||
              '候補名單'}
          </h2>

          <strong>
            共{' '}
            {
              filteredRows.length
            }{' '}
            人
          </strong>
        </div>

        <div
          style={{
            overflowX:
              'auto',
            marginTop: 16,
          }}
        >
          <table
            style={{
              width: '100%',
              minWidth:
                1100,
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
                  順位
                </th>

                <th>
                  姓名
                </th>

                <th>
                  電話
                </th>

                <th>
                  車種
                </th>

                <th>
                  車牌
                </th>

                <th>
                  登記日期
                </th>

                <th>
                  備註
                </th>

                <th>
                  順位調整
                </th>

                <th>
                  操作
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
                    目前沒有候補資料
                  </td>
                </tr>
              ) : (
                filteredRows.map(
                  (
                    row,
                    index
                  ) => (
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
                          fontSize:
                            18,
                          fontWeight:
                            800,
                        }}
                      >
                        {
                          row.wait_no
                        }
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
                        }}
                      >
                        {row.phone ||
                          '-'}
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
                          fontWeight:
                            700,
                        }}
                      >
                        {row.vehicle_plate ||
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
                          row.registered_date
                        }
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          maxWidth:
                            240,
                        }}
                      >
                        {row.notes ||
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
                        <button
                          type="button"
                          disabled={
                            index ===
                            0
                          }
                          onClick={() =>
                            moveUp(
                              index
                            )
                          }
                          style={{
                            marginRight:
                              6,
                          }}
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          disabled={
                            index ===
                            filteredRows.length -
                              1
                          }
                          onClick={() =>
                            moveDown(
                              index
                            )
                          }
                        >
                          ↓
                        </button>
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            convertToRental(
                              row
                            )
                          }
                          style={{
                            marginRight:
                              8,
                          }}
                        >
                          轉正式月租
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            cancelWaiting(
                              row
                            )
                          }
                        >
                          取消候補
                        </button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            zIndex:
              9999,
            background:
              'rgba(15,23,42,.55)',
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding:
              20,
          }}
        >
          <div
            style={{
              width:
                'min(620px,95vw)',
              maxHeight:
                '90vh',
              overflow:
                'auto',
              background:
                '#fff',
              borderRadius:
                14,
              padding:
                22,
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
              }}
            >
              <h2
                style={{
                  margin:
                    0,
                }}
              >
                新增候補
              </h2>

              <button
                type="button"
                onClick={() =>
                  setShowForm(
                    false
                  )
                }
                style={{
                  border: 0,
                  background:
                    'transparent',
                  fontSize:
                    26,
                  cursor:
                    'pointer',
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                marginTop:
                  18,
                display:
                  'grid',
                gap: 14,
              }}
            >
              <div
                className="field"
              >
                <label>
                  停車場
                </label>

                <input
                  value={
                    selectedLot?.name ||
                    ''
                  }
                  disabled
                />
              </div>

              <div
                className="field"
              >
                <label>
                  姓名 *
                </label>

                <input
                  value={
                    form.customer_name
                  }
                  onChange={(
                    event
                  ) =>
                    setForm({
                      ...form,
                      customer_name:
                        event
                          .target
                          .value,
                    })
                  }
                />
              </div>

              <div
                className="field"
              >
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
                    setForm({
                      ...form,
                      phone:
                        event
                          .target
                          .value,
                    })
                  }
                  placeholder="例如 0912345678"
                />
              </div>

              <div
                className="field"
              >
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
                    setForm({
                      ...form,
                      vehicle_type:
                        event
                          .target
                          .value as FormData['vehicle_type'],
                    })
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

              <div
                className="field"
              >
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
                    setForm({
                      ...form,
                      vehicle_plate:
                        event
                          .target
                          .value,
                    })
                  }
                  placeholder="可先不填"
                />
              </div>

              <div
                className="field"
              >
                <label>
                  備註
                </label>

                <textarea
                  value={
                    form.notes
                  }
                  onChange={(
                    event
                  ) =>
                    setForm({
                      ...form,
                      notes:
                        event
                          .target
                          .value,
                    })
                  }
                  rows={
                    4
                  }
                />
              </div>

              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'flex-end',
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  disabled={
                    saving
                  }
                  onClick={() =>
                    setShowForm(
                      false
                    )
                  }
                >
                  取消
                </button>

                <button
                  type="button"
                  className="btn"
                  disabled={
                    saving
                  }
                  onClick={
                    addWaiting
                  }
                >
                  {saving
                    ? '儲存中…'
                    : '新增候補'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}