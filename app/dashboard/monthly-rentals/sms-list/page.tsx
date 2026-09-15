'use client'

// SMS_UNPAID_LIST_AND_ORIGINAL_CSV_SHARE
import {
  useEffect,
  useMemo,
  useRef,
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
  customer_name: string
  phone: string | null
  vehicle_plate: string
  vehicle_type: string | null
  rental_type: string | null
  monthly_fee: number | null
  start_date: string | null
  end_date: string | null
  payment_status: string
}

function normalizePhone(
  value: string
) {
  return String(value || '')
    .replace(/\s/g, '')
    .replace(/-/g, '')
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

function escapeCsv(
  value: unknown
) {
  return `"${String(value ?? '')
    .replace(/"/g, '""')}"`
}

function fourMonthsAgoDateText() {
  const now = new Date()
  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth() - 4,
    now.getDate()
  )

  const year = cutoff.getFullYear()
  const month = String(cutoff.getMonth() + 1).padStart(2, '0')
  const day = String(cutoff.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export default function SmsListPage() {
  const supabase =
    useMemo(
      () => createClient(),
      []
    )

  const lineFileRef =
    useRef<HTMLInputElement>(
      null
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

      const fourMonthsAgo =
        fourMonthsAgoDateText()

      const {
        data,
        error,
      } =
        await supabase
          .from('monthly_rentals')
          .select(`
            customer_name,
            phone,
            vehicle_plate,
            vehicle_type,
            rental_type,
            monthly_fee,
            start_date,
            end_date,
            payment_status
          `)
          .eq(
            'parking_lot_id',
            workLotId
          )
          .neq(
            'rental_status',
            'cancelled'
          )
          .eq(
            'payment_status',
            'unpaid'
          )
          .or(
            `end_date.is.null,end_date.gte.${fourMonthsAgo}`
          )
          .order(
            'customer_name',
            { ascending: true }
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
  }, [])

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
    const headers = [
      '停車場',
      '姓名',
      '電話',
      '車牌',
      '月租類型',
      '月租金額',
      '租期開始',
      '租期到期',
      '繳費狀態',
    ]

    const lines = [
      headers
        .map(escapeCsv)
        .join(','),

      ...filteredRows.map(
        (row) =>
          [
            currentLot?.name ||
              '',
            row.customer_name,
            normalizePhone(
              row.phone || ''
            ),
            row.vehicle_plate,
            row.rental_type || '',
            row.monthly_fee ??
              '',
            row.start_date || '',
            row.end_date || '',
            '未繳',
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
      `${currentLot?.name || '停車場'}_月租未繳簡訊名單.csv`

    document.body.appendChild(
      a
    )

    a.click()
    a.remove()

    URL.revokeObjectURL(
      url
    )
  }

  async function chooseCsvForLine(
    event:
      React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target
        .files?.[0]

    if (!file) {
      return
    }

    try {
      if (
        typeof navigator.share !== 'function' ||
        (typeof navigator.canShare === 'function' &&
          !navigator.canShare({ files: [file] }))
      ) {
        alert(
          '目前瀏覽器不支援直接分享 CSV 檔案。請改用支援檔案分享的瀏覽器或裝置。'
        )
        return
      }

      await navigator.share({
        files: [file],
        title: file.name,
      })
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        alert(
          'CSV 檔案分享失敗：' +
            (error?.message || '請稍後再試')
        )
      }
    } finally {
      event.target.value = ''
    }
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
          gap: 12,
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
            系統直接抓取目前工作停車場的月租未繳資料；已退租與到期超過 4 個月的舊資料不列入。
          </div>
        </div>

        <div
          style={{
            display:
              'flex',
            gap: 8,
            flexWrap:
              'wrap',
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={
              exportCsv
            }
            disabled={
              !currentLotId
            }
          >
            匯出 CSV
          </button>

          <button
            type="button"
            className="btn"
            onClick={() =>
              lineFileRef.current?.click()
            }
          >
            CSV 轉 LINE
          </button>

          <input
            ref={
              lineFileRef
            }
            type="file"
            accept=".csv,text/csv"
            style={{
              display:
                'none',
            }}
            onChange={
              chooseCsvForLine
            }
          />
        </div>
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
          className="muted"
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
            'flex',
          justifyContent:
            'space-between',
          alignItems:
            'end',
          gap: 12,
          flexWrap:
            'wrap',
        }}
      >
        <div>
          <div
            className="muted"
          >
            名單條件
          </div>

          <strong
            style={{
              fontSize:
                22,
            }}
          >
            月租未繳
          </strong>
        </div>

        <div
          style={{
            minWidth:
              260,
          }}
        >
          <label
            style={{
              display:
                'block',
              marginBottom:
                6,
              fontWeight:
                600,
            }}
          >
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
            placeholder="姓名、電話、車牌、類型"
            style={{
              width:
                '100%',
            }}
          />
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop:
            16,
        }}
      >
        <div
          className="muted"
        >
          目前需提醒
        </div>

        <h2
          style={{
            marginBottom:
              0,
          }}
        >
          {
            filteredRows.length
          } 筆
        </h2>

        {missingPhoneCount >
          0 && (
          <div
            style={{
              marginTop:
                8,
              color:
                '#b45309',
            }}
          >
            其中 {missingPhoneCount} 筆缺少電話。
          </div>
        )}
      </div>

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
            目前沒有月租未繳資料。
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
                <th>租期開始</th>
                <th>租期到期</th>
                <th>繳費狀態</th>
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
                      {row.start_date || '-'}
                    </td>

                    <td
                      style={{
                        fontWeight:
                          700,
                      }}
                    >
                      {row.end_date || '-'}
                    </td>

                    <td
                      style={{
                        color: '#dc2626',
                        fontWeight: 700,
                      }}
                    >
                      未繳
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
