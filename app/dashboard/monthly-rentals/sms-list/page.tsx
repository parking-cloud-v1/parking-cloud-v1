'use client'

// PHASE51_SMS_20_DAYS_AND_LINE
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
  due_date: string
  days_remaining: number
  cycle_months: number | null
  cycle_source: string
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

function parseCsvLine(
  line: string
) {
  const result: string[] = []
  let current = ''
  let quoted = false

  for (
    let i = 0;
    i < line.length;
    i++
  ) {
    const char =
      line[i]

    if (char === '"') {
      if (
        quoted &&
        line[i + 1] ===
          '"'
      ) {
        current += '"'
        i++
      } else {
        quoted =
          !quoted
      }

      continue
    }

    if (
      char === ',' &&
      !quoted
    ) {
      result.push(
        current
      )
      current = ''
      continue
    }

    current += char
  }

  result.push(current)

  return result.map(
    (item) =>
      item.trim()
  )
}

function csvToLineText(
  csvText: string
) {
  const cleanText =
    csvText.replace(
      /^\uFEFF/,
      ''
    )

  const lines =
    cleanText
      .split(
        /\r?\n/
      )
      .filter(
        (line) =>
          line.trim()
      )

  if (
    lines.length <
    2
  ) {
    return ''
  }

  const headers =
    parseCsvLine(
      lines[0]
    )

  const findIndex = (
    names: string[]
  ) =>
    headers.findIndex(
      (header) =>
        names.includes(
          header.trim()
        )
    )

  const nameIndex =
    findIndex([
      '姓名',
      '客戶姓名',
    ])

  const phoneIndex =
    findIndex([
      '電話',
      '手機',
      '手機號碼',
    ])

  const plateIndex =
    findIndex([
      '車牌',
      '車牌號碼',
    ])

  const dueIndex =
    findIndex([
      '到期日',
      '舊系統到期日',
    ])

  const result =
    lines
      .slice(1)
      .map((line) => {
        const cols =
          parseCsvLine(
            line
          )

        const name =
          nameIndex >= 0
            ? cols[
                nameIndex
              ] || ''
            : ''

        const phone =
          phoneIndex >= 0
            ? cols[
                phoneIndex
              ] || ''
            : ''

        const plate =
          plateIndex >= 0
            ? cols[
                plateIndex
              ] || ''
            : ''

        const due =
          dueIndex >= 0
            ? cols[
                dueIndex
              ] || ''
            : ''

        return [
          name,
          phone,
          plate,
          due,
        ]
          .filter(Boolean)
          .join('｜')
      })
      .filter(Boolean)

  return result.join(
    '\n'
  )
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

  const [
    lineText,
    setLineText,
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
            'get_sms_due_within_days',
            {
              p_parking_lot_id:
                workLotId,
              p_days:
                20,
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
      '到期日',
      '剩餘天數',
      '繳費週期月數',
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
            row.due_date,
            row.days_remaining,
            row.cycle_months ??
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
      `${currentLot?.name || '停車場'}_20天內到期簡訊名單.csv`

    document.body.appendChild(
      a
    )

    a.click()
    a.remove()

    URL.revokeObjectURL(
      url
    )
  }

  function currentRowsToLine() {
    const text =
      filteredRows
        .map(
          (row) =>
            [
              row.customer_name,
              normalizePhone(
                row.phone ||
                  ''
              ),
              row.vehicle_plate,
              `到期 ${row.due_date}`,
            ]
              .filter(Boolean)
              .join('｜')
        )
        .join('\n')

    setLineText(
      text
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
      const text =
        await file.text()

      const converted =
        csvToLineText(
          text
        )

      if (!converted) {
        alert(
          'CSV 內找不到可轉換的名單。'
        )
        return
      }

      setLineText(
        converted
      )
    } finally {
      event.target.value =
        ''
    }
  }

  async function copyLineText() {
    if (!lineText.trim()) {
      return
    }

    await navigator.clipboard.writeText(
      lineText
    )

    alert(
      '已複製 LINE 文字。'
    )
  }

  function openLineShare() {
    if (!lineText.trim()) {
      return
    }

    const shareText =
      lineText.length >
      1800
        ? lineText.slice(
            0,
            1800
          ) +
          '\n\n（名單較長，完整內容請用「複製 LINE 文字」貼上）'
        : lineText

    window.open(
      `https://line.me/R/msg/text/?${encodeURIComponent(
        shareText
      )}`,
      '_blank',
      'noopener,noreferrer'
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
            系統直接依最新舊系統匯入資料的到期日，列出未來 20 天內即將到期名單；不需要再選月份。
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
            onClick={
              currentRowsToLine
            }
            disabled={
              filteredRows.length ===
              0
            }
          >
            目前名單轉 LINE
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
            自動提醒範圍
          </div>

          <strong
            style={{
              fontSize:
                22,
            }}
          >
            今天起 20 天內到期
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
            目前沒有未來 20 天內到期的月租戶。
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
                <th>到期日</th>
                <th>剩餘</th>
                <th>繳費週期</th>
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

                    <td>
                      {row.days_remaining ===
                      0
                        ? '今天'
                        : `${row.days_remaining} 天`}
                    </td>

                    <td>
                      {row.cycle_months
                        ? `${row.cycle_months} 個月`
                        : '尚待辨識'}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>

      {lineText && (
        <div
          className="card"
          style={{
            marginTop:
              16,
          }}
        >
          <h2
            style={{
              marginTop:
                0,
            }}
          >
            LINE 傳送內容
          </h2>

          <div
            className="muted"
            style={{
              marginBottom:
                10,
            }}
          >
            可以由目前到期名單產生，也可以上傳 CSV 轉成 LINE 文字。
          </div>

          <textarea
            value={
              lineText
            }
            onChange={(
              event
            ) =>
              setLineText(
                event.target.value
              )
            }
            rows={12}
            style={{
              width:
                '100%',
              resize:
                'vertical',
            }}
          />

          <div
            style={{
              display:
                'flex',
              gap: 8,
              flexWrap:
                'wrap',
              marginTop:
                10,
            }}
          >
            <button
              type="button"
              className="btn"
              onClick={
                copyLineText
              }
            >
              複製 LINE 文字
            </button>

            <button
              type="button"
              className="btn"
              onClick={
                openLineShare
              }
            >
              開啟 LINE 分享
            </button>

            <button
              type="button"
              onClick={() =>
                setLineText(
                  ''
                )
              }
            >
              清除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
