'use client'

// PHASE48_IMPORT_BASED_SMS_LIST
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
  monthly_rental_id: string | null
  customer_name: string
  phone: string | null
  vehicle_plate: string
  vehicle_type: string | null
  rental_type: string | null
  monthly_fee: number | null
  previous_end_date: string | null
  current_end_date: string | null
  sms_month: string
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
    useState<SmsRow[]>(
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
          '請先在左側「目前工作停車場」選擇停車場。'
        )
        return
      }

      setCurrentLotId(
        workLotId
      )

      const {
        data,
        error,
      } =
        await supabase
          .rpc(
            'get_import_based_sms_list',
            {
              p_parking_lot_id:
                workLotId,

              p_sms_month:
                `${selectedMonth}-01`,
            }
          )

      if (error) {
        throw error
      }

      setRows(
        (data ||
          []) as SmsRow[]
      )
    } catch (
      error: any
    ) {
      setRows([])
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
      '上次到期日',
      '本次到期日',
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
            monthText(
              row.sms_month
            ),
            row.customer_name,
            normalizePhone(
              row.phone || ''
            ),
            row.vehicle_plate,
            row.rental_type || '',
            row.monthly_fee ??
              '',
            row.previous_end_date ||
              '',
            row.current_end_date ||
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
            以目前工作停車場「現場匯入的舊系統總表」為準，比較最近兩次總表；只有到期月份往下一期變更、且本次月租金額大於 0 的月租戶才會列入。
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
        className="card"
        style={{
          marginTop:
            16,
          padding:
            16,
        }}
      >
        <strong>
          本月簡訊名單：
          {' '}
          {filteredRows.length}
          {' '}
          筆
        </strong>

        <div
          className="muted"
          style={{
            marginTop:
              6,
          }}
        >
          0 元、公務車、退租或本次未進入下一個到期月份的資料，不會列入。
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
            目前這個月份沒有符合條件的簡訊名單。若現場尚未匯入新的舊系統總表，名單不會提前產生。
          </div>
        ) : (
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
              <tr>
                <th>姓名</th>
                <th>電話</th>
                <th>車牌</th>
                <th>類型</th>
                <th>金額</th>
                <th>上次到期日</th>
                <th>本次到期日</th>
                <th>簡訊月份</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map(
                (
                  row,
                  index
                ) => (
                  <tr
                    key={`${row.vehicle_plate}-${index}`}
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

                    <td>
                      {
                        row.previous_end_date ||
                        '-'
                      }
                    </td>

                    <td>
                      {
                        row.current_end_date ||
                        '-'
                      }
                    </td>

                    <td
                      style={{
                        fontWeight:
                          700,
                      }}
                    >
                      {monthText(
                        row.sms_month
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
