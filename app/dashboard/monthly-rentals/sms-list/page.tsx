'use client'

// PHASE49_PERSISTENT_IMPORT_BASED_SMS_ROSTER
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

type SmsRow = {
  id: string
  customer_name: string
  phone: string | null
  vehicle_plate: string
  vehicle_type: string | null
  rental_type: string | null
  monthly_fee: number | null
  due_date: string
  sms_month: string
  is_active: boolean
  updated_at: string
}

type ChangeRow = {
  id: string
  import_batch_id: string
  sms_month: string | null
  vehicle_plate: string | null
  customer_name: string | null
  change_type: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

function currentMonthValue() {
  const now = new Date()

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`
}

function normalizePhone(value: string) {
  return String(value || '')
    .replace(/\s/g, '')
    .replace(/-/g, '')
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

function changeText(
  type: string
) {
  switch (type) {
    case 'added':
      return '新增名單'
    case 'removed':
      return '移出名單'
    case 'phone_changed':
      return '電話變更'
    case 'name_changed':
      return '姓名變更'
    case 'type_changed':
      return '類型變更'
    case 'amount_changed':
      return '金額變更'
    case 'due_date_changed':
      return '到期日變更'
    case 'due_month_changed':
      return '進入新簡訊月份'
    default:
      return type
  }
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
    selectedMonth,
    setSelectedMonth,
  ] =
    useState(
      currentMonthValue()
    )

  const [
    rows,
    setRows,
  ] =
    useState<SmsRow[]>(
      []
    )

  const [
    changes,
    setChanges,
  ] =
    useState<ChangeRow[]>(
      []
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
        setChanges([])
        setMessage(
          '請先在左側「目前工作停車場」選擇停車場。'
        )
        return
      }

      setCurrentLotId(
        workLotId
      )

      const monthDate =
        `${selectedMonth}-01`

      const [
        rosterResult,
        batchResult,
      ] =
        await Promise.all([
          supabase
            .from(
              'monthly_sms_roster_items'
            )
            .select(`
              id,
              customer_name,
              phone,
              vehicle_plate,
              vehicle_type,
              rental_type,
              monthly_fee,
              due_date,
              sms_month,
              is_active,
              updated_at
            `)
            .eq(
              'parking_lot_id',
              workLotId
            )
            .eq(
              'sms_month',
              monthDate
            )
            .eq(
              'is_active',
              true
            )
            .order(
              'customer_name',
              {
                ascending:
                  true,
              }
            ),

          supabase
            .from(
              'monthly_import_batches'
            )
            .select(
              'id,imported_at'
            )
            .eq(
              'parking_lot_id',
              workLotId
            )
            .eq(
              'import_type',
              'legacy_roster'
            )
            .eq(
              'status',
              'completed'
            )
            .order(
              'imported_at',
              {
                ascending:
                  false,
              }
            )
            .limit(1)
            .maybeSingle(),
        ])

      if (
        rosterResult.error
      ) {
        throw rosterResult.error
      }

      setRows(
        (rosterResult.data ||
          []) as SmsRow[]
      )

      const latestBatchId =
        batchResult.data?.id

      if (
        batchResult.error
      ) {
        throw batchResult.error
      }

      if (
        latestBatchId
      ) {
        const {
          data:
            changeData,
          error:
            changeError,
        } =
          await supabase
            .from(
              'monthly_sms_roster_changes'
            )
            .select(`
              id,
              import_batch_id,
              sms_month,
              vehicle_plate,
              customer_name,
              change_type,
              old_value,
              new_value,
              created_at
            `)
            .eq(
              'parking_lot_id',
              workLotId
            )
            .eq(
              'import_batch_id',
              latestBatchId
            )
            .order(
              'created_at',
              {
                ascending:
                  false,
              }
            )

        if (changeError) {
          throw changeError
        }

        setChanges(
          (changeData ||
            []) as ChangeRow[]
        )
      } else {
        setChanges([])
      }
    } catch (
      error: any
    ) {
      setRows([])
      setChanges([])
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

  const monthChanges =
    useMemo(
      () =>
        changes.filter(
          (item) =>
            !item.sms_month ||
            item.sms_month.slice(
              0,
              7
            ) ===
              selectedMonth
        ),
      [
        changes,
        selectedMonth,
      ]
    )

  const missingPhoneCount =
    filteredRows.filter(
      (row) =>
        !normalizePhone(
          row.phone || ''
        )
    ).length

  function exportCsv() {
    const exportable =
      filteredRows.filter(
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
        '目前沒有可匯出的簡訊名單。'
      )
      return
    }

    const headers = [
      '停車場',
      '簡訊月份',
      '姓名',
      '電話',
      '車牌',
      '月租類型',
      '月租金額',
      '到期日',
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
            row.customer_name,
            normalizePhone(
              row.phone || ''
            ),
            row.vehicle_plate,
            row.rental_type || '',
            row.monthly_fee ??
              '',
            row.due_date,
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
            名單由現場匯入舊系統總表建立並永久保存。再次匯入只更新電話、姓名、名單增減與新的到期月份，不會把舊月份名單洗掉。
          </div>
        </div>

        <button
          type="button"
          className="btn"
          disabled={
            !currentLotId
          }
          onClick={
            exportCsv
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
            簡訊月份
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
                event.target.value
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
                event.target.value
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
            'repeat(2,minmax(180px,1fr))',
          gap: 12,
          marginTop:
            16,
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

          <h2>
            {
              filteredRows.length
            } 筆
          </h2>
        </div>

        <div
          className="card"
        >
          <div
            className="muted"
          >
            最近一次匯入異動
          </div>

          <h2>
            {
              monthChanges.length
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
          目前名單有 {missingPhoneCount} 筆缺少電話，CSV 會自動略過。
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

      <div
        className="card"
        style={{
          marginTop:
            16,
          overflowX:
            'auto',
        }}
      >
        <h2
          style={{
            marginTop:
              0,
          }}
        >
          {selectedMonth.replace(
            '-',
            '/'
          )}{' '}
          簡訊名單
        </h2>

        {loading ? (
          <div
            style={{
              padding:
                20,
            }}
          >
            讀取中…
          </div>
        ) : filteredRows.length ===
          0 ? (
          <div
            style={{
              padding:
                20,
            }}
          >
            目前沒有這個月份的簡訊名單。
          </div>
        ) : (
          <table
            style={{
              width:
                '100%',
              minWidth:
                900,
              borderCollapse:
                'collapse',
              fontSize:
                17,
            }}
          >
            <thead>
              <tr>
                <th>姓名</th>
                <th>電話</th>
                <th>車牌</th>
                <th>類型</th>
                <th>金額</th>
                <th>舊系統到期日</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map(
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

                    <td
                      style={{
                        fontWeight:
                          700,
                      }}
                    >
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
                        row.monthly_fee ||
                          0
                      ).toLocaleString()}
                    </td>

                    <td
                      style={{
                        fontWeight:
                          700,
                      }}
                    >
                      {
                        row.due_date
                      }
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>

      <div
        className="card"
        style={{
          marginTop:
            16,
          overflowX:
            'auto',
        }}
      >
        <h2
          style={{
            marginTop:
              0,
          }}
        >
          最近一次舊系統匯入異動
        </h2>

        <div
          className="muted"
          style={{
            marginBottom:
              12,
          }}
        >
          這裡只顯示最新一次匯入相較上一份總表有哪些變動，不會改掉之前月份的歷史名單。
        </div>

        {monthChanges.length ===
          0 ? (
          <div>
            本月份最近一次匯入沒有名單異動。
          </div>
        ) : (
          <table
            style={{
              width:
                '100%',
              minWidth:
                850,
              borderCollapse:
                'collapse',
            }}
          >
            <thead>
              <tr>
                <th>姓名</th>
                <th>車牌</th>
                <th>異動</th>
                <th>原資料</th>
                <th>新資料</th>
              </tr>
            </thead>

            <tbody>
              {monthChanges.map(
                (item) => (
                  <tr
                    key={
                      item.id
                    }
                  >
                    <td>
                      {item.customer_name ||
                        '-'}
                    </td>

                    <td>
                      {item.vehicle_plate ||
                        '-'}
                    </td>

                    <td
                      style={{
                        fontWeight:
                          700,
                      }}
                    >
                      {changeText(
                        item.change_type
                      )}
                    </td>

                    <td>
                      {item.old_value ||
                        '-'}
                    </td>

                    <td>
                      {item.new_value ||
                        '-'}
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
