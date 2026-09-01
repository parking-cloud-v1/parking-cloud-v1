'use client'

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { createClient } from '@/lib/supabase/client'
import { getSavedWorkParkingLotId } from '@/components/useWorkParkingLot'

type ParkingLot = {
  id: string
  name: string
}

type BillingMode =
  | 'hour'
  | 'half_hour'
  | 'actual'

type TaxiRecord = {
  id: string
  parking_lot_id: string
  vehicle_plate: string
  entry_time: string
  exit_time: string
  hourly_rate: number
  billing_mode: BillingMode
  cap_hours: number
  cap_amount: number
  original_amount: number
  discount_amount: number
  final_amount: number
  used_free_discount: boolean
  discount_date: string | null
  is_holiday: boolean
  notes: string | null
  created_at: string
}

type Result = {
  originalAmount: number
  discountAmount: number
  finalAmount: number
  usedFreeDiscount: boolean
  discountDate: string | null
  reason: string
}

function pad(
  value: number
) {
  return String(
    value
  ).padStart(
    2,
    '0'
  )
}

function localInput(
  date: Date
) {
  return (
    `${date.getFullYear()}-` +
    `${pad(
      date.getMonth() +
        1
    )}-` +
    `${pad(
      date.getDate()
    )}T` +
    `${pad(
      date.getHours()
    )}:` +
    `${pad(
      date.getMinutes()
    )}`
  )
}

function dateKey(
  date: Date
) {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'Asia/Taipei',
        year:
          'numeric',
        month:
          '2-digit',
        day:
          '2-digit',
      }
    ).formatToParts(
      date
    )

  const map =
    Object.fromEntries(
      parts.map(
        (
          item
        ) => [
          item.type,
          item.value,
        ]
      )
    )

  return `${map.year}-${map.month}-${map.day}`
}

function taipeiAt(
  key: string,
  hour: number
) {
  return new Date(
    `${key}T${pad(
      hour
    )}:00:00+08:00`
  )
}

function normalizePlate(
  value: string
) {
  return value
    .trim()
    .replace(
      /\s/g,
      ''
    )
    .toUpperCase()
}

function money(
  value: number
) {
  return Number(
    value ||
      0
  ).toLocaleString(
    'zh-TW',
    {
      maximumFractionDigits:
        0,
    }
  )
}

function chargeMinutes(
  minutes: number,
  hourlyRate: number,
  billingMode: BillingMode
) {
  if (
    minutes <=
    0
  ) {
    return 0
  }

  if (
    billingMode ===
    'actual'
  ) {
    return (
      hourlyRate *
      minutes /
      60
    )
  }

  if (
    billingMode ===
    'hour'
  ) {
    return (
      Math.ceil(
        minutes /
          60
      ) *
      hourlyRate
    )
  }

  return (
    Math.ceil(
      minutes /
        30
    ) *
    hourlyRate /
    2
  )
}

function calculateWithCap(
  entry: Date,
  exit: Date,
  rate: number,
  mode: BillingMode,
  capHours: number,
  capAmount: number
) {
  const totalMinutes =
    Math.max(
      0,
      Math.ceil(
        (
          exit.getTime() -
          entry.getTime()
        ) /
          60000
      )
    )

  if (
    totalMinutes ===
    0
  ) {
    return 0
  }

  const blockMinutes =
    Math.max(
      1,
      capHours *
        60
    )

  let remaining =
    totalMinutes

  let total =
    0

  while (
    remaining >
    0
  ) {
    const minutes =
      Math.min(
        remaining,
        blockMinutes
      )

    const raw =
      chargeMinutes(
        minutes,
        rate,
        mode
      )

    total +=
      capAmount >
      0
        ? Math.min(
            raw,
            capAmount
          )
        : raw

    remaining -=
      minutes
  }

  return Math.round(
    total
  )
}

function overlapMinutes(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
) {
  const start =
    Math.max(
      startA.getTime(),
      startB.getTime()
    )

  const end =
    Math.min(
      endA.getTime(),
      endB.getTime()
    )

  if (
    end <=
    start
  ) {
    return 0
  }

  return Math.ceil(
    (
      end -
      start
    ) /
      60000
  )
}

function sessionDates(
  entry: Date,
  exit: Date
) {
  const start =
    taipeiAt(
      dateKey(
        entry
      ),
      0
    )

  const end =
    taipeiAt(
      dateKey(
        exit
      ),
      0
    )

  const result:
    string[] =
    []

  let current =
    start

  while (
    current.getTime() <=
    end.getTime()
  ) {
    result.push(
      dateKey(
        current
      )
    )

    current =
      new Date(
        current.getTime() +
          86400000
      )
  }

  return result
}

function displayDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    'zh-TW',
    {
      timeZone:
        'Asia/Taipei',
      year:
        'numeric',
      month:
        '2-digit',
      day:
        '2-digit',
    }
  ).format(
    new Date(
      value
    )
  )
}

function displayTime(
  value: string
) {
  return new Intl.DateTimeFormat(
    'zh-TW',
    {
      timeZone:
        'Asia/Taipei',
      hour:
        '2-digit',
      minute:
        '2-digit',
      hour12:
        false,
    }
  ).format(
    new Date(
      value
    )
  )
}

export default function TaxiDiscountPage() {
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
    vehiclePlate,
    setVehiclePlate,
  ] =
    useState('')

  const [
    entryTime,
    setEntryTime,
  ] =
    useState(
      localInput(
        new Date()
      )
    )

  const [
    exitTime,
    setExitTime,
  ] =
    useState(
      localInput(
        new Date(
          Date.now() +
            3600000
        )
      )
    )

  const [
    hourlyRate,
    setHourlyRate,
  ] =
    useState(
      '30'
    )

  const [
    billingMode,
    setBillingMode,
  ] =
    useState<BillingMode>(
      'half_hour'
    )

  const [
    capHours,
    setCapHours,
  ] =
    useState(
      '4'
    )

  const [
    capAmount,
    setCapAmount,
  ] =
    useState(
      '100'
    )

  const [
    isHoliday,
    setIsHoliday,
  ] =
    useState(
      false
    )

  const [
    notes,
    setNotes,
  ] =
    useState('')

  const [
    result,
    setResult,
  ] =
    useState<
      Result | null
    >(null)

  const [
    records,
    setRecords,
  ] =
    useState<
      TaxiRecord[]
    >([])

  const [
    message,
    setMessage,
  ] =
    useState('')

  const [
    saving,
    setSaving,
  ] =
    useState(false)

  const [
    filterMonth,
    setFilterMonth,
  ] =
    useState(
      new Date()
        .toISOString()
        .slice(
          0,
          7
        )
    )

  useEffect(() => {
    loadParkingLots()
  }, [])

  useEffect(() => {
    if (
      selectedLotId
    ) {
      loadRecords()
    } else {
      setRecords([])
    }
  }, [
    selectedLotId,
    filterMonth,
  ])

  async function loadParkingLots() {
    setMessage('')

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

    if (
      error
    ) {
      setMessage(
        '停車場讀取失敗：' +
          error.message
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
        (
          lot
        ) =>
          lot.id ===
          workLotId
      )
    ) {
      setSelectedLotId(
        workLotId
      )
    } else {
      setMessage(
        '請先在左側「目前工作停車場」選擇停車場。'
      )
    }
  }

  async function loadRecords() {
    const start =
      `${filterMonth}-01T00:00:00+08:00`

    const next =
      new Date(
        `${filterMonth}-01T00:00:00+08:00`
      )

    next.setMonth(
      next.getMonth() +
        1
    )

    const {
      data,
      error,
    } =
      await supabase
        .from(
          'taxi_discount_records'
        )
        .select(
          '*'
        )
        .eq(
          'parking_lot_id',
          selectedLotId
        )
        .gte(
          'entry_time',
          start
        )
        .lt(
          'entry_time',
          next.toISOString()
        )
        .order(
          'entry_time',
          {
            ascending:
              false,
          }
        )

    if (
      error
    ) {
      setMessage(
        '報表讀取失敗：' +
          error.message
      )

      return
    }

    setRecords(
      (
        data ||
        []
      ) as TaxiRecord[]
    )
  }

  async function calculate() {
    setMessage('')
    setResult(null)

    if (
      !selectedLotId
    ) {
      setMessage(
        '請先選擇目前工作停車場'
      )
      return
    }

    const plate =
      normalizePlate(
        vehiclePlate
      )

    if (
      !plate
    ) {
      setMessage(
        '請輸入車牌'
      )
      return
    }

    const entry =
      new Date(
        entryTime
      )

    const exit =
      new Date(
        exitTime
      )

    if (
      Number.isNaN(
        entry.getTime()
      ) ||
      Number.isNaN(
        exit.getTime()
      ) ||
      exit <= entry
    ) {
      setMessage(
        '進出場時間不正確'
      )
      return
    }

    const rate =
      Number(
        hourlyRate
      )

    const capH =
      Number(
        capHours
      )

    const cap =
      Number(
        capAmount
      )

    const original =
      calculateWithCap(
        entry,
        exit,
        rate,
        billingMode,
        capH,
        cap
      )

    let eligibleDate:
      string | null =
      null

    let freeMinutes =
      0

    for (
      const key of
      sessionDates(
        entry,
        exit
      )
    ) {
      const freeStart =
        taipeiAt(
          key,
          11
        )

      const freeEnd =
        taipeiAt(
          key,
          13
        )

      const minutes =
        overlapMinutes(
          entry,
          exit,
          freeStart,
          freeEnd
        )

      if (
        minutes <=
        0
      ) {
        continue
      }

      const {
        data:
          usedRecords,
        error,
      } =
        await supabase
          .from(
            'taxi_discount_records'
          )
          .select(
            'id'
          )
          .eq(
            'parking_lot_id',
            selectedLotId
          )
          .eq(
            'vehicle_plate',
            plate
          )
          .eq(
            'discount_date',
            key
          )
          .eq(
            'used_free_discount',
            true
          )
          .limit(
            1
          )

      if (
        error
      ) {
        setMessage(
          error.message
        )
        return
      }

      if (
        !usedRecords ||
        usedRecords.length ===
          0
      ) {
        eligibleDate =
          key

        freeMinutes =
          minutes

        break
      }
    }

    let discount =
      0

    let reason =
      '本次無 11:00–13:00 免費優惠'

    if (
      eligibleDate
    ) {
      discount =
        Math.min(
          original,
          chargeMinutes(
            freeMinutes,
            rate,
            billingMode
          )
        )

      reason =
        `${eligibleDate} 可享 11:00–13:00 一次免費優惠`
    } else {
      const hasWindow =
        sessionDates(
          entry,
          exit
        ).some(
          (
            key
          ) =>
            overlapMinutes(
              entry,
              exit,
              taipeiAt(
                key,
                11
              ),
              taipeiAt(
                key,
                13
              )
            ) >
            0
        )

      if (
        hasWindow
      ) {
        reason =
          '該車牌當日優惠已使用，本次依正常費率及最高上限計算'
      }
    }

    const final =
      Math.max(
        0,
        Math.round(
          original -
            discount
        )
      )

    setResult({
      originalAmount:
        Math.round(
          original
        ),
      discountAmount:
        Math.round(
          discount
        ),
      finalAmount:
        final,
      usedFreeDiscount:
        Boolean(
          eligibleDate
        ),
      discountDate:
        eligibleDate,
      reason,
    })
  }

  async function saveRecord(
    event:
      FormEvent
  ) {
    event.preventDefault()

    if (
      !result ||
      !selectedLotId
    ) {
      return
    }

    setSaving(true)
    setMessage('')

    try {
      const plate =
        normalizePlate(
          vehiclePlate
        )

      const {
        data: {
          user,
        },
      } =
        await supabase
          .auth
          .getUser()

      const {
        error,
      } =
        await supabase
          .from(
            'taxi_discount_records'
          )
          .insert({
            parking_lot_id:
              selectedLotId,

            vehicle_plate:
              plate,

            entry_time:
              new Date(
                entryTime
              ).toISOString(),

            exit_time:
              new Date(
                exitTime
              ).toISOString(),

            hourly_rate:
              Number(
                hourlyRate
              ),

            billing_mode:
              billingMode,

            cap_hours:
              Number(
                capHours
              ),

            cap_amount:
              Number(
                capAmount
              ),

            original_amount:
              result.originalAmount,

            discount_amount:
              result.discountAmount,

            final_amount:
              result.finalAmount,

            used_free_discount:
              result.usedFreeDiscount,

            discount_date:
              result.discountDate,

            is_holiday:
              isHoliday,

            notes:
              notes.trim() ||
              null,

            created_by:
              user?.id ||
              null,
          })

      if (
        error
      ) {
        setMessage(
          '儲存失敗：' +
            error.message
        )
        return
      }

      setMessage(
        '已加入計程車優惠報表'
      )

      setResult(
        null
      )

      setVehiclePlate(
        ''
      )

      await loadRecords()
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecord(
    item: TaxiRecord
  ) {
    if (
      !window.confirm(
        `確定刪除 ${item.vehicle_plate} 這筆紀錄？`
      )
    ) {
      return
    }

    const {
      error,
    } =
      await supabase
        .from(
          'taxi_discount_records'
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

    if (
      error
    ) {
      setMessage(
        '刪除失敗：' +
          error.message
      )
      return
    }

    await loadRecords()
  }

  const selectedLot =
    useMemo(
      () =>
        parkingLots.find(
          (
            lot
          ) =>
            lot.id ===
            selectedLotId
        ),
      [
        parkingLots,
        selectedLotId,
      ]
    )

  const officialRows =
    useMemo(
      () => {
        const sorted =
          [
            ...records,
          ].sort(
            (
              a,
              b
            ) =>
              new Date(
                a.entry_time
              ).getTime() -
              new Date(
                b.entry_time
              ).getTime()
          )

        const counter:
          Record<
            string,
            number
          > =
          {}

        return sorted.map(
          (
            row
          ) => {
            const date =
              displayDate(
                row.entry_time
              )

            counter[
              date
            ] =
              (
                counter[
                  date
                ] ||
                0
              ) +
              1

            return {
              id:
                row.id,
              dailyIndex:
                counter[
                  date
                ],
              date,
              plate:
                row.vehicle_plate,
              entry:
                displayTime(
                  row.entry_time
                ),
              exit:
                displayTime(
                  row.exit_time
                ),
              discount:
                Number(
                  row.discount_amount ||
                    0
                ),
              holiday:
                row.is_holiday
                  ? '是'
                  : '否',
            }
          }
        )
      },
      [
        records,
      ]
    )

  function exportCsv() {
    const lines =
      [
        [
          '每日項次',
          '日期',
          '車牌',
          '進場時間',
          '離場時間',
          '銷單金額',
          '是否假日',
        ].join(
          ','
        ),

        ...officialRows.map(
          (
            row
          ) =>
            [
              row.dailyIndex,
              row.date,
              row.plate,
              row.entry,
              row.exit,
              row.discount,
              row.holiday,
            ].join(
              ','
            )
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

    a.href =
      url

    a.download =
      `${selectedLot?.name || '停車場'}_計程車優惠_${filterMonth}.csv`

    a.click()

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
      <div>
        <h1>
          計程車折扣
        </h1>

        <div
          className="muted"
        >
          目前工作停車場：
          {selectedLot?.name ||
            '尚未選擇'}
        </div>
      </div>

      {!selectedLotId && (
        <div
          className="card"
          style={{
            marginTop:
              20,
            color:
              '#b45309',
            fontWeight:
              700,
          }}
        >
          請先在左側選擇目前工作停車場。
        </div>
      )}

      <form
        onSubmit={
          saveRecord
        }
      >
        <div
          className="card"
          style={{
            marginTop:
              20,
          }}
        >
          <h2>
            優惠計算
          </h2>

          <div
            style={{
              display:
                'grid',
              gridTemplateColumns:
                'repeat(auto-fit,minmax(220px,1fr))',
              gap:
                14,
            }}
          >
            <div className="field">
              <label>
                停車場
              </label>

              <select
                value={
                  selectedLotId
                }
                disabled
              >
                {!selectedLotId && (
                  <option value="">
                    尚未選擇
                  </option>
                )}

                {parkingLots.map(
                  (
                    lot
                  ) => (
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

            <div className="field">
              <label>
                車牌
              </label>

              <input
                value={
                  vehiclePlate
                }
                onChange={(
                  event
                ) =>
                  setVehiclePlate(
                    event
                      .target
                      .value
                  )
                }
              />
            </div>

            <div className="field">
              <label>
                進場時間
              </label>

              <input
                type="datetime-local"
                value={
                  entryTime
                }
                onChange={(
                  event
                ) =>
                  setEntryTime(
                    event
                      .target
                      .value
                  )
                }
              />
            </div>

            <div className="field">
              <label>
                出場時間
              </label>

              <input
                type="datetime-local"
                value={
                  exitTime
                }
                onChange={(
                  event
                ) =>
                  setExitTime(
                    event
                      .target
                      .value
                  )
                }
              />
            </div>

            <div className="field">
              <label>
                每小時費率
              </label>

              <input
                type="number"
                min="0"
                value={
                  hourlyRate
                }
                onChange={(
                  event
                ) =>
                  setHourlyRate(
                    event
                      .target
                      .value
                  )
                }
              />
            </div>

            <div className="field">
              <label>
                計費方式
              </label>

              <select
                value={
                  billingMode
                }
                onChange={(
                  event
                ) =>
                  setBillingMode(
                    event
                      .target
                      .value as BillingMode
                  )
                }
              >
                <option value="hour">
                  每小時進位
                </option>

                <option value="half_hour">
                  每半小時進位
                </option>

                <option value="actual">
                  實際分鐘
                </option>
              </select>
            </div>

            <div className="field">
              <label>
                最高上限區間
              </label>

              <select
                value={
                  capHours
                }
                onChange={(
                  event
                ) =>
                  setCapHours(
                    event
                      .target
                      .value
                  )
                }
              >
                <option value="4">
                  每 4 小時
                </option>

                <option value="8">
                  每 8 小時
                </option>

                <option value="12">
                  每 12 小時
                </option>
              </select>
            </div>

            <div className="field">
              <label>
                最高金額
              </label>

              <input
                type="number"
                min="0"
                value={
                  capAmount
                }
                onChange={(
                  event
                ) =>
                  setCapAmount(
                    event
                      .target
                      .value
                  )
                }
              />
            </div>

            <div className="field">
              <label>
                是否假日
              </label>

              <select
                value={
                  isHoliday
                    ? 'yes'
                    : 'no'
                }
                onChange={(
                  event
                ) =>
                  setIsHoliday(
                    event
                      .target
                      .value ===
                      'yes'
                  )
                }
              >
                <option value="no">
                  否
                </option>

                <option value="yes">
                  是
                </option>
              </select>
            </div>
          </div>

          <div
            className="field"
            style={{
              marginTop:
                14,
            }}
          >
            <label>
              備註
            </label>

            <input
              value={
                notes
              }
              onChange={(
                event
              ) =>
                setNotes(
                  event
                    .target
                    .value
                )
              }
            />
          </div>

          <button
            type="button"
            className="btn"
            disabled={
              !selectedLotId
            }
            onClick={
              calculate
            }
          >
            計算優惠
          </button>

          {result && (
            <div
              style={{
                marginTop:
                  16,
                padding:
                  16,
                background:
                  '#f8fafc',
                borderRadius:
                  10,
              }}
            >
              <div>
                原始金額：
                NT${' '}
                {money(
                  result.originalAmount
                )}
              </div>

              <div>
                優惠：
                NT${' '}
                {money(
                  result.discountAmount
                )}
              </div>

              <h3>
                銷單後金額：
                NT${' '}
                {money(
                  result.finalAmount
                )}
              </h3>

              <div
                className="muted"
              >
                {
                  result.reason
                }
              </div>

              <button
                type="submit"
                className="btn"
                disabled={
                  saving
                }
                style={{
                  marginTop:
                    12,
                }}
              >
                {saving
                  ? '儲存中…'
                  : '確認並加入報表'}
              </button>
            </div>
          )}

          {message && (
            <div
              style={{
                marginTop:
                  14,
              }}
            >
              {message}
            </div>
          )}
        </div>
      </form>

      <div
        className="card"
        style={{
          marginTop:
            20,
        }}
      >
        <div
          className="row"
        >
          <div>
            <h2>
              計程車優惠報表
            </h2>

            <div
              className="muted"
            >
              {
                selectedLot?.name
              }
            </div>
          </div>

          <input
            type="month"
            value={
              filterMonth
            }
            onChange={(
              event
            ) =>
              setFilterMonth(
                event
                  .target
                  .value
              )
            }
          />

          <button
            type="button"
            onClick={
              exportCsv
            }
          >
            匯出 CSV
          </button>
        </div>

        <div
          style={{
            overflowX:
              'auto',
            marginTop:
              14,
          }}
        >
          <table
            className="table"
            style={{
              minWidth:
                850,
            }}
          >
            <thead>
              <tr>
                <th>
                  每日項次
                </th>

                <th>
                  日期
                </th>

                <th>
                  車牌
                </th>

                <th>
                  進場
                </th>

                <th>
                  離場
                </th>

                <th>
                  銷單金額
                </th>

                <th>
                  是否假日
                </th>

                <th>
                  操作
                </th>
              </tr>
            </thead>

            <tbody>
              {officialRows.map(
                (
                  row
                ) => (
                  <tr
                    key={
                      row.id
                    }
                  >
                    <td>
                      {
                        row.dailyIndex
                      }
                    </td>

                    <td>
                      {
                        row.date
                      }
                    </td>

                    <td>
                      {
                        row.plate
                      }
                    </td>

                    <td>
                      {
                        row.entry
                      }
                    </td>

                    <td>
                      {
                        row.exit
                      }
                    </td>

                    <td>
                      {
                        row.discount
                      }
                    </td>

                    <td>
                      {
                        row.holiday
                      }
                    </td>

                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          const item =
                            records.find(
                              (
                                record
                              ) =>
                                record.id ===
                                row.id
                            )

                          if (
                            item
                          ) {
                            deleteRecord(
                              item
                            )
                          }
                        }}
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                )
              )}

              {officialRows.length ===
                0 && (
                <tr>
                  <td
                    colSpan={
                      8
                    }
                    style={{
                      textAlign:
                        'center',
                    }}
                  >
                    目前沒有資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}