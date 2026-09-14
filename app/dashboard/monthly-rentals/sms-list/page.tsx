'use client'

// PHASE45_SMS_FIXED_WORK_LOT
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

type ScheduleRow = {
  id: string
  monthly_rental_id: string
  parking_lot_id: string
  customer_name: string
  phone: string | null
  vehicle_plate: string
  vehicle_type: string | null
  rental_type: string | null
  billing_cycle_months: number | null
  cycle_source: 'auto' | 'manual' | 'unknown'
  needs_review: boolean
  cycle_anchor_month: string
  next_sms_month: string
  last_exported_month: string | null
  active: boolean
  source_amount: number | null
  standard_monthly_fee: number | null
}

function normalizePhone(value: string) {
  return String(value || '')
    .replace(/\s/g, '')
    .replace(/-/g, '')
}

function monthText(value?: string | null) {
  if (!value) return '-'

  const match =
    String(value).match(
      /^(\d{4})-(\d{2})/
    )

  return match
    ? `${match[1]}/${match[2]}`
    : value
}

function currentMonthValue() {
  const now = new Date()

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? '')
    .replace(/"/g, '""')}"`
}

function getSavedWorkParkingLotId() {
  if (
    typeof window ===
    'undefined'
  ) {
    return ''
  }

  return (
    window.localStorage.getItem(
      'current-work-parking-lot-id'
    ) || ''
  )
}

export default function SmsListPage() {
  const supabase =
    useMemo(
      () => createClient(),
      []
    )

  const [
    parkingLots,
    setParkingLots,
  ] =
    useState<ParkingLot[]>(
      []
    )

  const [
    currentLotId,
    setCurrentLotId,
  ] =
    useState('')

  const [
    rows,
    setRows,
  ] =
    useState<ScheduleRow[]>(
      []
    )

  const [
    selectedMonth,
    setSelectedMonth,
  ] =
    useState(
      currentMonthValue()
    )

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
    message,
    setMessage,
  ] =
    useState('')

  const [
    manualMonths,
    setManualMonths,
  ] =
    useState<Record<string,string>>(
      {}
    )

  const currentLot =
    useMemo(
      () =>
        parkingLots.find(
          (lot) =>
            lot.id ===
            currentLotId
        ),
      [
        parkingLots,
        currentLotId,
      ]
    )

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
            'id,name'
          )
          .eq(
            'status',
            'active'
          )
          .order('name')

      if (lotError) {
        throw lotError
      }

      const lots =
        (lotData ||
          []) as ParkingLot[]

      setParkingLots(
        lots
      )

      const workLotId =
        getSavedWorkParkingLotId()

      if (
        !workLotId ||
        !lots.some(
          (lot) =>
            lot.id ===
            workLotId
        )
      ) {
        setCurrentLotId('')
        setRows([])
        setMessage(
          '請先在左側「目前工作停車場」選擇停車場。簡訊名單不再跨停車場混合顯示。'
        )
        return
      }

      setCurrentLotId(
        workLotId
      )

      const selectedMonthDate =
        `${selectedMonth}-01`

      const {
        data,
        error,
      } =
        await supabase
          .from(
            'monthly_sms_schedules'
          )
          .select(`
            id,
            monthly_rental_id,
            parking_lot_id,
            customer_name,
            phone,
            vehicle_plate,
            vehicle_type,
            rental_type,
            billing_cycle_months,
            cycle_source,
            needs_review,
            cycle_anchor_month,
            next_sms_month,
            last_exported_month,
            active,
            source_amount,
            standard_monthly_fee
          `)
          .eq(
            'active',
            true
          )
          .eq(
            'parking_lot_id',
            workLotId
          )
          .lte(
            'next_sms_month',
            selectedMonthDate
          )
          .order(
            'next_sms_month',
            {
              ascending: true,
            }
          )
          .order(
            'customer_name',
            {
              ascending: true,
            }
          )

      if (error) {
        throw error
      }

      setRows(
        (data ||
          []) as ScheduleRow[]
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '簡訊排程讀取失敗'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [
    selectedMonth,
  ])

  const filteredRows =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase()

      if (!keyword) {
        return rows
      }

      return rows.filter(
        (row) =>
          [
            row.customer_name,
            row.phone || '',
            row.vehicle_plate,
            row.rental_type || '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(
              keyword
            )
      )
    }, [
      rows,
      search,
    ])

  const reviewRows =
    filteredRows.filter(
      (row) =>
        row.needs_review
    )

  const readyRows =
    filteredRows.filter(
      (row) =>
        !row.needs_review &&
        Boolean(
          row.billing_cycle_months
        )
    )

  const missingPhoneCount =
    readyRows.filter(
      (row) =>
        !normalizePhone(
          row.phone || ''
        )
    ).length

  async function confirmCycle(
    row: ScheduleRow
  ) {
    const months =
      Number(
        manualMonths[
          row.id
        ] || '1'
      )

    if (
      !Number.isInteger(
        months
      ) ||
      months < 1 ||
      months > 12
    ) {
      alert(
        '請選擇 1～12 個月'
      )
      return
    }

    const {
      error,
    } =
      await supabase
        .rpc(
          'set_monthly_sms_cycle',
          {
            p_schedule_id:
              row.id,
            p_cycle_months:
              months,
          }
        )

    if (error) {
      alert(
        `設定失敗：${error.message}`
      )
      return
    }

    setMessage(
      `${row.customer_name} 已設定為 ${months} 個月週期。`
    )

    await loadData()
  }

  async function exportCsv() {
    if (!currentLotId) {
      alert(
        '請先在左側選擇目前工作停車場'
      )
      return
    }

    const exportable =
      readyRows.filter(
        (row) =>
          Boolean(
            normalizePhone(
              row.phone || ''
            )
          )
      )

    if (
      exportable.length ===
      0
    ) {
      alert(
        '目前沒有可匯出的簡訊名單。若有「需確認月數」，請先完成確認。'
      )
      return
    }

    const headers = [
      '停車場',
      '本次簡訊月份',
      '原應提醒月份',
      '姓名',
      '電話',
      '車牌',
      '月租類型',
      '繳費週期(月)',
      '本次辨識金額',
      '標準單月金額',
    ]

    const lines = [
      headers
        .map(escapeCsv)
        .join(','),
      ...exportable.map(
        (row) =>
          [
            currentLot?.name ||
              '',
            selectedMonth,
            monthText(
              row.next_sms_month
            ),
            row.customer_name,
            normalizePhone(
              row.phone || ''
            ),
            row.vehicle_plate,
            row.rental_type || '',
            row.billing_cycle_months ||
              '',
            row.source_amount ??
              '',
            row.standard_monthly_fee ??
              '',
          ]
            .map(escapeCsv)
            .join(',')
      ),
    ]

    const blob =
      new Blob(
        [
          '\uFEFF' +
            lines.join(
              '\r\n'
            ),
        ],
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

    a.href = url
    a.download =
      `${currentLot?.name || '停車場'}_每月簡訊名單_${selectedMonth}.csv`

    document.body.appendChild(
      a
    )
    a.click()
    a.remove()

    URL.revokeObjectURL(
      url
    )

    const {
      error,
    } =
      await supabase
        .rpc(
          'export_monthly_sms_schedules',
          {
            p_schedule_ids:
              exportable.map(
                (row) =>
                  row.id
              ),
            p_export_month:
              `${selectedMonth}-01`,
          }
        )

    if (error) {
      setMessage(
        `CSV 已下載，但簡訊排程未能往後更新：${error.message}`
      )
      return
    }

    setMessage(
      `已匯出 ${exportable.length} 筆。系統已依目前月租類型與繳費週期安排下一次簡訊月份。`
    )

    await loadData()
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
            簡訊名單固定依左側「目前工作停車場」顯示，不會混入其他停車場。
          </div>
        </div>

        <button
          type="button"
          className="btn"
          disabled={
            !currentLotId
          }
          onClick={() =>
            void exportCsv()
          }
        >
          匯出本月簡訊 CSV
        </button>
      </div>

      <div
        className="card"
        style={{
          marginTop:
            20,
          padding:
            16,
          background:
            '#f8fafc',
        }}
      >
        <div
          style={{
            fontSize:
              13,
            color:
              '#64748b',
            marginBottom:
              4,
          }}
        >
          目前工作停車場
        </div>

        <strong
          style={{
            fontSize:
              19,
          }}
        >
          {currentLot?.name ||
            '尚未選擇'}
        </strong>
      </div>

      <div
        className="card"
        style={{
          marginTop:
            16,
          display:
            'grid',
          gridTemplateColumns:
            '180px minmax(260px,1fr)',
          gap: 12,
        }}
      >
        <div
          className="field"
        >
          <label>
            名單月份
          </label>

          <input
            type="month"
            value={
              selectedMonth
            }
            onChange={(
              event
            ) =>
              setSelectedMonth(
                event.target
                  .value
              )
            }
          />
        </div>

        <div
          className="field"
        >
          <label>
            搜尋
          </label>

          <input
            value={search}
            onChange={(
              event
            ) =>
              setSearch(
                event.target
                  .value
              )
            }
            placeholder="姓名、電話、車牌、月租類型"
          />
        </div>
      </div>

      <div
        style={{
          display:
            'grid',
          gridTemplateColumns:
            'repeat(3,minmax(150px,1fr))',
          gap: 12,
          marginTop:
            16,
        }}
      >
        <div className="card">
          <div className="muted">
            本月應列入
          </div>
          <h2>
            {
              filteredRows.length
            } 筆
          </h2>
        </div>

        <div className="card">
          <div className="muted">
            可直接匯出
          </div>
          <h2>
            {
              readyRows.length
            } 筆
          </h2>
        </div>

        <div className="card">
          <div className="muted">
            特殊金額需確認
          </div>
          <h2>
            {
              reviewRows.length
            } 筆
          </h2>
        </div>
      </div>

      {missingPhoneCount >
        0 && (
        <div
          className="card"
          style={{
            marginTop:
              16,
            color:
              '#b45309',
          }}
        >
          可匯出名單中有 {missingPhoneCount} 筆缺少電話，CSV 會自動略過。
        </div>
      )}

      {message && (
        <div
          className="card"
          style={{
            marginTop:
              16,
          }}
        >
          {message}
        </div>
      )}

      {reviewRows.length >
        0 && (
        <div
          className="card"
          style={{
            marginTop:
              16,
            border:
              '1px solid #f59e0b',
          }}
        >
          <h2
            style={{
              marginTop:
                0,
            }}
          >
            特殊金額／新增月租：確認本次涵蓋月數
          </h2>

          <div
            className="muted"
            style={{
              marginBottom:
                12,
            }}
          >
            只有系統無法用目前設定的標準單月金額整除時，才需要人工確認。
          </div>

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
                borderCollapse:
                  'collapse',
              }}
            >
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>車牌</th>
                  <th>類型</th>
                  <th>金額</th>
                  <th>標準單月</th>
                  <th>本次涵蓋</th>
                  <th>操作</th>
                </tr>
              </thead>

              <tbody>
                {reviewRows.map(
                  (row) => (
                    <tr
                      key={
                        row.id
                      }
                    >
                      <td>
                        {
                          row.customer_name
                        }
                      </td>
                      <td>
                        {
                          row.vehicle_plate
                        }
                      </td>
                      <td>
                        {
                          row.rental_type ||
                          '-'
                        }
                      </td>
                      <td>
                        $
                        {Number(
                          row.source_amount ||
                            0
                        ).toLocaleString()}
                      </td>
                      <td>
                        {row.standard_monthly_fee
                          ? `$${Number(
                              row.standard_monthly_fee
                            ).toLocaleString()}`
                          : '尚未設定'}
                      </td>
                      <td>
                        <select
                          value={
                            manualMonths[
                              row.id
                            ] ||
                            '1'
                          }
                          onChange={(
                            e
                          ) =>
                            setManualMonths({
                              ...manualMonths,
                              [row.id]:
                                e.target
                                  .value,
                            })
                          }
                        >
                          {[
                            1,2,3,4,5,6,
                            7,8,9,10,11,12,
                          ].map(
                            (
                              months
                            ) => (
                              <option
                                key={
                                  months
                                }
                                value={
                                  months
                                }
                              >
                                {months} 個月
                              </option>
                            )
                          )}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            void confirmCycle(
                              row
                            )
                          }
                        >
                          確認
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div
        className="card"
        style={{
          marginTop:
            16,
          overflowX:
            'auto',
        }}
      >
        {loading ? (
          <div
            style={{
              padding:
                20,
            }}
          >
            讀取中…
          </div>
        ) : readyRows.length ===
          0 ? (
          <div
            style={{
              padding:
                20,
            }}
          >
            這個月份目前沒有可直接匯出的簡訊名單。
          </div>
        ) : (
          <table
            style={{
              width:
                '100%',
              borderCollapse:
                'collapse',
            }}
          >
            <thead>
              <tr>
                <th>姓名</th>
                <th>電話</th>
                <th>車牌</th>
                <th>類型</th>
                <th>繳費週期</th>
                <th>應提醒月份</th>
                <th>辨識金額</th>
              </tr>
            </thead>

            <tbody>
              {readyRows.map(
                (row) => (
                  <tr
                    key={
                      row.id
                    }
                  >
                    <td>
                      {
                        row.customer_name
                      }
                    </td>
                    <td>
                      {normalizePhone(
                        row.phone ||
                          ''
                      ) ||
                        '缺少電話'}
                    </td>
                    <td>
                      {
                        row.vehicle_plate
                      }
                    </td>
                    <td>
                      {
                        row.rental_type ||
                        '-'
                      }
                    </td>
                    <td>
                      {
                        row.billing_cycle_months
                      } 個月
                    </td>
                    <td>
                      {monthText(
                        row.next_sms_month
                      )}
                    </td>
                    <td>
                      $
                      {Number(
                        row.source_amount ||
                          0
                      ).toLocaleString()}
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
