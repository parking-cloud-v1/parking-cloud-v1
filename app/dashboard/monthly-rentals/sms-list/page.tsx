'use client'

// PHASE40_MONTHLY_CYCLE_EVENTS
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

type CycleEvent = {
  id: string
  parking_lot_id: string
  monthly_rental_id: string | null
  customer_name: string
  phone: string | null
  vehicle_plate: string
  vehicle_type: string | null
  rental_type: string | null
  previous_end_date: string | null
  current_end_date: string | null
  cycle_month: string
  sms_required: boolean
  sms_status: 'pending' | 'exported' | 'completed'
  sms_exported_at: string | null
  trigger_reason: string | null
  created_at: string
}

function normalizePhone(value: string) {
  return String(value || '')
    .replace(/\s/g, '')
    .replace(/-/g, '')
}

function vehicleTypeText(value?: string | null) {
  if (value === 'motorcycle') return '機車'
  if (value === 'heavy_motorcycle') return '重機'
  return '汽車'
}

function monthText(value?: string | null) {
  if (!value) return '-'
  const match = String(value).match(/^(\d{4})-(\d{2})/)
  return match ? `${match[1]}/${match[2]}` : value
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function statusText(value: CycleEvent['sms_status']) {
  if (value === 'exported') return '已匯出'
  if (value === 'completed') return '已完成'
  return '待發送'
}

export default function SmsListPage() {
  const supabase = useMemo(
    () => createClient(),
    []
  )

  const [parkingLots, setParkingLots] =
    useState<ParkingLot[]>([])
  const [rows, setRows] =
    useState<CycleEvent[]>([])
  const [selectedLotId, setSelectedLotId] =
    useState('all')
  const [selectedMonth, setSelectedMonth] =
    useState(currentMonthValue())
  const [statusFilter, setStatusFilter] =
    useState<'all' | 'pending' | 'exported' | 'completed'>('all')
  const [search, setSearch] =
    useState('')
  const [loading, setLoading] =
    useState(true)
  const [message, setMessage] =
    useState('')

  async function loadData() {
    setLoading(true)
    setMessage('')

    try {
      const {
        data: lotData,
        error: lotError,
      } =
        await supabase
          .from('parking_lots')
          .select('id,name')
          .eq('status', 'active')
          .order('name')

      if (lotError) throw lotError

      const start = `${selectedMonth}-01`
      const [year, month] =
        selectedMonth.split('-').map(Number)
      const next = new Date(year, month, 1)
      const nextText =
        `${next.getFullYear()}-${String(
          next.getMonth() + 1
        ).padStart(2, '0')}-01`

      let query =
        supabase
          .from('monthly_cycle_events')
          .select(`
            id,
            parking_lot_id,
            monthly_rental_id,
            customer_name,
            phone,
            vehicle_plate,
            vehicle_type,
            rental_type,
            previous_end_date,
            current_end_date,
            cycle_month,
            sms_required,
            sms_status,
            sms_exported_at,
            trigger_reason,
            created_at
          `)
          .eq('sms_required', true)
          .gte('cycle_month', start)
          .lt('cycle_month', nextText)
          .order('customer_name', {
            ascending: true,
          })

      if (selectedLotId !== 'all') {
        query =
          query.eq(
            'parking_lot_id',
            selectedLotId
          )
      }

      if (statusFilter !== 'all') {
        query =
          query.eq(
            'sms_status',
            statusFilter
          )
      }

      const { data, error } =
        await query

      if (error) throw error

      setParkingLots(
        (lotData || []) as ParkingLot[]
      )
      setRows(
        (data || []) as CycleEvent[]
      )
    } catch (error: any) {
      setMessage(
        error?.message ||
          '簡訊名單讀取失敗'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [
    selectedLotId,
    selectedMonth,
    statusFilter,
  ])

  const lotMap =
    useMemo(
      () =>
        new Map(
          parkingLots.map(
            (lot) => [lot.id, lot.name]
          )
        ),
      [parkingLots]
    )

  const filteredRows =
    useMemo(() => {
      const keyword =
        search.trim().toLowerCase()

      if (!keyword) return rows

      return rows.filter(
        (row) =>
          [
            row.customer_name,
            row.phone || '',
            row.vehicle_plate,
            row.rental_type || '',
            lotMap.get(row.parking_lot_id) || '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(keyword)
      )
    }, [rows, search, lotMap])

  const pendingCount =
    rows.filter(
      (row) => row.sms_status === 'pending'
    ).length

  const exportedCount =
    rows.filter(
      (row) => row.sms_status === 'exported'
    ).length

  const completedCount =
    rows.filter(
      (row) => row.sms_status === 'completed'
    ).length

  const missingPhoneCount =
    filteredRows.filter(
      (row) =>
        !normalizePhone(row.phone || '')
    ).length

  async function exportCsv() {
    if (!filteredRows.length) {
      alert('目前沒有可匯出的簡訊名單')
      return
    }

    const exportable =
      filteredRows.filter(
        (row) =>
          Boolean(
            normalizePhone(row.phone || '')
          )
      )

    if (!exportable.length) {
      alert('目前名單全部缺少電話，無法匯出')
      return
    }

    const headers = [
      '停車場',
      '簡訊月份',
      '姓名',
      '電話',
      '車牌',
      '車種',
      '月租類型',
      '上次到期日',
      '本次到期日',
      '判定原因',
    ]

    const lines = [
      headers.map(escapeCsv).join(','),
      ...exportable.map(
        (row) =>
          [
            lotMap.get(
              row.parking_lot_id
            ) || '',
            monthText(
              row.cycle_month
            ),
            row.customer_name,
            normalizePhone(
              row.phone || ''
            ),
            row.vehicle_plate,
            vehicleTypeText(
              row.vehicle_type
            ),
            row.rental_type || '',
            row.previous_end_date || '',
            row.current_end_date || '',
            row.trigger_reason || '',
          ]
            .map(escapeCsv)
            .join(',')
      ),
    ]

    const blob =
      new Blob(
        [
          '\uFEFF' +
            lines.join('\r\n'),
        ],
        {
          type:
            'text/csv;charset=utf-8;',
        }
      )

    const url =
      URL.createObjectURL(blob)

    const a =
      document.createElement('a')

    const lotName =
      selectedLotId === 'all'
        ? '全部停車場'
        : (
            lotMap.get(
              selectedLotId
            ) ||
            '停車場'
          )

    a.href = url
    a.download =
      `${lotName}_每月簡訊名單_${selectedMonth}.csv`

    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    const ids =
      exportable
        .filter(
          (row) =>
            row.sms_status === 'pending'
        )
        .map((row) => row.id)

    if (ids.length) {
      const { error } =
        await supabase
          .from(
            'monthly_cycle_events'
          )
          .update({
            sms_status:
              'exported',
            sms_exported_at:
              new Date()
                .toISOString(),
          })
          .in('id', ids)

      if (error) {
        setMessage(
          `CSV 已下載，但更新「已匯出」狀態失敗：${error.message}`
        )
      } else {
        setMessage(
          `已匯出 ${exportable.length} 筆；其中 ${ids.length} 筆已標記為「已匯出」。`
        )
        await loadData()
      }
    }
  }

  async function markCompleted(id: string) {
    const { error } =
      await supabase
        .from(
          'monthly_cycle_events'
        )
        .update({
          sms_status:
            'completed',
          sms_completed_at:
            new Date()
              .toISOString(),
        })
        .eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    await loadData()
  }

  return (
    <div
      style={{
        paddingBottom: 40,
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
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              marginTop: 0,
              marginBottom: 6,
            }}
          >
            每月簡訊名單
          </h1>

          <div className="muted">
            名單由舊系統匯入時建立的「月份事件」固定保存；後續付款或月租資料變動，不會讓已產生的名單突然消失。
          </div>
        </div>

        <button
          type="button"
          className="btn"
          onClick={() =>
            void exportCsv()
          }
        >
          匯出目前名單 CSV
        </button>
      </div>

      <div
        className="card"
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns:
            'minmax(220px,1fr) 180px 170px minmax(220px,1fr)',
          gap: 12,
        }}
      >
        <div className="field">
          <label>停車場</label>
          <select
            value={selectedLotId}
            onChange={(event) =>
              setSelectedLotId(
                event.target.value
              )
            }
          >
            <option value="all">
              全部停車場
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
        </div>

        <div className="field">
          <label>簡訊月份</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) =>
              setSelectedMonth(
                event.target.value
              )
            }
          />
        </div>

        <div className="field">
          <label>發送狀態</label>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as
                  | 'all'
                  | 'pending'
                  | 'exported'
                  | 'completed'
              )
            }
          >
            <option value="all">
              全部
            </option>
            <option value="pending">
              待發送
            </option>
            <option value="exported">
              已匯出
            </option>
            <option value="completed">
              已完成
            </option>
          </select>
        </div>

        <div className="field">
          <label>搜尋</label>
          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="姓名、電話、車牌、月租類型"
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(4,minmax(140px,1fr))',
          gap: 12,
          marginTop: 16,
        }}
      >
        <div className="card">
          <div className="muted">
            本月名單
          </div>
          <h2>{rows.length} 筆</h2>
        </div>
        <div className="card">
          <div className="muted">
            待發送
          </div>
          <h2>{pendingCount} 筆</h2>
        </div>
        <div className="card">
          <div className="muted">
            已匯出
          </div>
          <h2>{exportedCount} 筆</h2>
        </div>
        <div className="card">
          <div className="muted">
            已完成
          </div>
          <h2>{completedCount} 筆</h2>
        </div>
      </div>

      {missingPhoneCount > 0 && (
        <div
          className="card"
          style={{
            marginTop: 16,
            color: '#b45309',
          }}
        >
          目前篩選結果有 {missingPhoneCount} 筆缺少電話；匯出 CSV 時會自動略過，避免送簡訊失敗。
        </div>
      )}

      {message && (
        <div
          className="card"
          style={{
            marginTop: 16,
          }}
        >
          {message}
        </div>
      )}

      <div
        className="card"
        style={{
          marginTop: 16,
          overflowX: 'auto',
        }}
      >
        {loading ? (
          <div style={{ padding: 20 }}>
            讀取中…
          </div>
        ) : filteredRows.length ===
          0 ? (
          <div style={{ padding: 20 }}>
            目前這個月份沒有簡訊事件。
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse:
                'collapse',
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: 'left',
                  borderBottom:
                    '1px solid #e5e7eb',
                }}
              >
                <th style={{ padding: 10 }}>
                  停車場
                </th>
                <th style={{ padding: 10 }}>
                  姓名
                </th>
                <th style={{ padding: 10 }}>
                  電話
                </th>
                <th style={{ padding: 10 }}>
                  車牌
                </th>
                <th style={{ padding: 10 }}>
                  類型
                </th>
                <th style={{ padding: 10 }}>
                  上次到期日
                </th>
                <th style={{ padding: 10 }}>
                  本次到期日
                </th>
                <th style={{ padding: 10 }}>
                  月份
                </th>
                <th style={{ padding: 10 }}>
                  簡訊狀態
                </th>
                <th style={{ padding: 10 }}>
                  操作
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map(
                (row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom:
                        '1px solid #f1f5f9',
                    }}
                  >
                    <td style={{ padding: 10 }}>
                      {lotMap.get(
                        row.parking_lot_id
                      ) || '-'}
                    </td>
                    <td style={{ padding: 10 }}>
                      {row.customer_name}
                    </td>
                    <td style={{ padding: 10 }}>
                      {normalizePhone(
                        row.phone || ''
                      ) || (
                        <span
                          style={{
                            color:
                              '#b45309',
                          }}
                        >
                          缺少電話
                        </span>
                      )}
                    </td>
                    <td style={{ padding: 10 }}>
                      {row.vehicle_plate}
                    </td>
                    <td style={{ padding: 10 }}>
                      {row.rental_type || '-'}
                    </td>
                    <td style={{ padding: 10 }}>
                      {row.previous_end_date || '-'}
                    </td>
                    <td style={{ padding: 10 }}>
                      {row.current_end_date || '-'}
                    </td>
                    <td
                      style={{
                        padding: 10,
                        fontWeight: 700,
                      }}
                    >
                      {monthText(
                        row.cycle_month
                      )}
                    </td>
                    <td style={{ padding: 10 }}>
                      {statusText(
                        row.sms_status
                      )}
                    </td>
                    <td style={{ padding: 10 }}>
                      {row.sms_status !==
                        'completed' && (
                        <button
                          type="button"
                          onClick={() =>
                            void markCompleted(
                              row.id
                            )
                          }
                        >
                          標記完成
                        </button>
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
