'use client'

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'

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

type CalculationResult = {
  originalAmount: number
  discountAmount: number
  finalAmount: number
  usedFreeDiscount: boolean
  discountDate: string | null
  discountReason: string
}

function toLocalInputValue(
  date: Date
) {
  const pad = (
    value: number
  ) =>
    String(value).padStart(
      2,
      '0'
    )

  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}T` +
    `${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}`
  )
}

function formatDateTime(
  value: string
) {
  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value
  }

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
      hour:
        '2-digit',
      minute:
        '2-digit',
      hour12:
        false,
    }
  ).format(date)
}

function localDateKey(
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
        (part) => [
          part.type,
          part.value,
        ]
      )
    )

  return `${map.year}-${map.month}-${map.day}`
}

function taipeiDateAt(
  dateKey: string,
  hour: number,
  minute = 0
) {
  return new Date(
    `${dateKey}T${String(
      hour
    ).padStart(
      2,
      '0'
    )}:${String(
      minute
    ).padStart(
      2,
      '0'
    )}:00+08:00`
  )
}

function money(
  value: number
) {
  return Number(
    value || 0
  ).toLocaleString(
    'zh-TW',
    {
      maximumFractionDigits:
        0,
    }
  )
}

function plateNormalize(
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

function chargeForMinutes(
  minutes: number,
  hourlyRate: number,
  billingMode:
    BillingMode
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
      (minutes / 60)
    )
  }

  if (
    billingMode ===
    'hour'
  ) {
    return (
      Math.ceil(
        minutes / 60
      ) *
      hourlyRate
    )
  }

  return (
    Math.ceil(
      minutes / 30
    ) *
    (hourlyRate / 2)
  )
}

function calculateWithCap(
  entry: Date,
  exit: Date,
  hourlyRate: number,
  billingMode:
    BillingMode,
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

  let total = 0

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
      chargeForMinutes(
        minutes,
        hourlyRate,
        billingMode
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

  return total
}

function getSessionDateKeys(
  entry: Date,
  exit: Date
) {
  const keys:
    string[] =
    []

  const startKey =
    localDateKey(
      entry
    )

  const endKey =
    localDateKey(
      exit
    )

  let cursor =
    taipeiDateAt(
      startKey,
      0
    )

  const endCursor =
    taipeiDateAt(
      endKey,
      0
    )

  while (
    cursor.getTime() <=
    endCursor.getTime()
  ) {
    keys.push(
      localDateKey(
        cursor
      )
    )

    cursor =
      new Date(
        cursor.getTime() +
          24 *
            60 *
            60 *
            1000
      )
  }

  return keys
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
    (end - start) /
      60000
  )
}


type OfficialReportRow = {
  dailyIndex: number
  date: string
  plate: string
  entry: string
  exit: string
  discount: number
  holiday: string
  recordId: string
}

function officialDateText(
  value: string
) {
  const date =
    new Date(value)

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
          part
        ) => [
          part.type,
          part.value,
        ]
      )
    )

  return `${map.year}/${map.month}/${map.day}`
}

function officialTimeText(
  value: string
) {
  const parts =
    new Intl.DateTimeFormat(
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
    ).formatToParts(
      new Date(
        value
      )
    )

  const map =
    Object.fromEntries(
      parts.map(
        (
          part
        ) => [
          part.type,
          part.value,
        ]
      )
    )

  return `${map.hour}:${map.minute}`
}

function buildOfficialRows(
  records:
    TaxiRecord[]
): OfficialReportRow[] {
  const sorted =
    [...records].sort(
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

  const dailyCounter:
    Record<string, number> =
    {}

  return sorted.map(
    (
      row
    ) => {
      const date =
        officialDateText(
          row.entry_time
        )

      dailyCounter[
        date
      ] =
        (
          dailyCounter[
            date
          ] ||
          0
        ) +
        1

      return {
        dailyIndex:
          dailyCounter[
            date
          ],
        date,
        plate:
          row.vehicle_plate,
        entry:
          officialTimeText(
            row.entry_time
          ),
        exit:
          officialTimeText(
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
        recordId:
          row.id,
      }
    }
  )
}

function escapeHtml(
  value: unknown
) {
  return String(
    value ??
      ''
  ).replace(
    /[&<>"']/g,
    (
      char
    ) =>
      ({
        '&':
          '&amp;',
        '<':
          '&lt;',
        '>':
          '&gt;',
        '"':
          '&quot;',
        "'":
          '&#039;',
      } as Record<
        string,
        string
      >)[
        char
      ]
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
      toLocalInputValue(
        new Date()
      )
    )

  const [
    exitTime,
    setExitTime,
  ] =
    useState(
      toLocalInputValue(
        new Date(
          Date.now() +
            60 *
              60 *
              1000
        )
      )
    )

  const [
    hourlyRate,
    setHourlyRate,
  ] =
    useState('30')

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
    useState('4')

  const [
    capAmount,
    setCapAmount,
  ] =
    useState('100')

  const [
    isHoliday,
    setIsHoliday,
  ] =
    useState(false)

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
      CalculationResult | null
    >(null)

  const [
    records,
    setRecords,
  ] =
    useState<
      TaxiRecord[]
    >([])

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
    exportingPdf,
    setExportingPdf,
  ] =
    useState(false)

  const [
    message,
    setMessage,
  ] =
    useState('')

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
    loadInitial()
  }, [])

  useEffect(() => {
    if (
      selectedLotId
    ) {
      loadRecords()
    }
  }, [
    selectedLotId,
    filterMonth,
  ])

  async function loadInitial() {
    setLoading(
      true
    )

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

      setLoading(
        false
      )

      return
    }

    const lots =
      data || []

    setParkingLots(
      lots
    )

    if (
      lots.length >
      0
    ) {
      setSelectedLotId(
        lots[0].id
      )
    }

    setLoading(
      false
    )
  }

  async function loadRecords() {
    if (
      !selectedLotId
    ) {
      return
    }

    const start =
      `${filterMonth}-01T00:00:00+08:00`

    const nextMonthDate =
      new Date(
        `${filterMonth}-01T00:00:00+08:00`
      )

    nextMonthDate.setMonth(
      nextMonthDate.getMonth() +
        1
    )

    const nextMonth =
      nextMonthDate
        .toISOString()

    const {
      data,
      error,
    } =
      await supabase
        .from(
          'taxi_discount_records'
        )
        .select('*')
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
          nextMonth
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
        '請選擇停車場'
      )
      return
    }

    const plate =
      plateNormalize(
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

    if (
      rate <
        0 ||
      cap <
        0
    ) {
      setMessage(
        '費率或上限金額不正確'
      )
      return
    }

    const original =
      calculateWithCap(
        entry,
        exit,
        rate,
        billingMode,
        capH,
        cap
      )

    const dateKeys =
      getSessionDateKeys(
        entry,
        exit
      )

    let eligibleDate:
      string | null =
      null

    let eligibleMinutes =
      0

    for (
      const dateKey of
      dateKeys
    ) {
      const windowStart =
        taipeiDateAt(
          dateKey,
          11
        )

      const windowEnd =
        taipeiDateAt(
          dateKey,
          13
        )

      const minutes =
        overlapMinutes(
          entry,
          exit,
          windowStart,
          windowEnd
        )

      if (
        minutes <=
        0
      ) {
        continue
      }

      const {
        data:
          existing,
        error:
          existingError,
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
            'discount_date',
            dateKey
          )
          .eq(
            'used_free_discount',
            true
          )
          .ilike(
            'vehicle_plate',
            plate
          )
          .limit(
            1
          )

      if (
        existingError
      ) {
        setMessage(
          '優惠紀錄檢查失敗：' +
            existingError.message
        )
        return
      }

      if (
        !existing ||
        existing.length ===
          0
      ) {
        eligibleDate =
          dateKey

        eligibleMinutes =
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
          chargeForMinutes(
            eligibleMinutes,
            rate,
            billingMode
          )
        )

      reason =
        `${eligibleDate} 可使用一次 11:00–13:00 免費優惠`
    } else {
      const overlapsWindow =
        dateKeys.some(
          (
            dateKey
          ) =>
            overlapMinutes(
              entry,
              exit,
              taipeiDateAt(
                dateKey,
                11
              ),
              taipeiDateAt(
                dateKey,
                13
              )
            ) >
            0
        )

      if (
        overlapsWindow
      ) {
        reason =
          '該車牌於可優惠日期已使用過一次免費優惠，本次僅套用最高上限'
      }
    }

    const finalAmount =
      Math.max(
        0,
        original -
          discount
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
        Math.round(
          finalAmount
        ),
      usedFreeDiscount:
        Boolean(
          eligibleDate
        ),
      discountDate:
        eligibleDate,
      discountReason:
        reason,
    })
  }

  async function saveRecord(
    e:
      FormEvent
  ) {
    e.preventDefault()

    if (
      !result ||
      saving
    ) {
      return
    }

    setSaving(
      true
    )
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

      if (
        !user
      ) {
        setMessage(
          '登入狀態失效'
        )
        return
      }

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
              plateNormalize(
                vehiclePlate
              ),

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
              user.id,
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
        '計程車優惠紀錄已儲存'
      )

      setResult(
        null
      )

      await loadRecords()
    } finally {
      setSaving(
        false
      )
    }
  }

  async function deleteRecord(
    record:
      TaxiRecord
  ) {
    if (
      !window.confirm(
        `確定刪除 ${record.vehicle_plate} 這筆紀錄？`
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
          record.id
        )

    if (
      error
    ) {
      alert(
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

  const totals =
    useMemo(
      () =>
        records.reduce(
          (
            acc,
            row
          ) => {
            acc.original +=
              Number(
                row.original_amount ||
                  0
              )

            acc.discount +=
              Number(
                row.discount_amount ||
                  0
              )

            acc.final +=
              Number(
                row.final_amount ||
                  0
              )

            return acc
          },
          {
            original: 0,
            discount: 0,
            final: 0,
          }
        ),
      [
        records,
      ]
    )

  const officialRows =
    useMemo(
      () =>
        buildOfficialRows(
          records
        ),
      [
        records,
      ]
    )

  async function exportExcel() {
    if (
      !officialRows.length
    ) {
      alert(
        '目前沒有可匯出的資料'
      )
      return
    }

    const rows =
      officialRows
        .map(
          (
            row
          ) =>
            `<tr>` +
            `<td>${row.dailyIndex}</td>` +
            `<td>${escapeHtml(row.date)}</td>` +
            `<td>${escapeHtml(row.plate)}</td>` +
            `<td>${escapeHtml(row.entry)}</td>` +
            `<td>${escapeHtml(row.exit)}</td>` +
            `<td>${row.discount}</td>` +
            `<td>${escapeHtml(row.holiday)}</td>` +
            `</tr>`
        )
        .join('')

    let blankRows =
      ''

    for (
      let index =
        officialRows.length;
      index <
        32;
      index++
    ) {
      blankRows +=
        '<tr>' +
        '<td>&nbsp;</td>' +
        '<td></td>' +
        '<td></td>' +
        '<td></td>' +
        '<td></td>' +
        '<td></td>' +
        '<td></td>' +
        '</tr>'
    }

    const lotName =
      selectedLot?.name ||
      '停車場'

    const html =
      `<html>` +
      `<meta charset="UTF-8">` +
      `<style>` +
      `table{border-collapse:collapse;width:100%;}` +
      `th,td{border:2px solid #000;text-align:center;height:34px;}` +
      `.title{font-size:25px;height:58px;}` +
      `</style>` +
      `<table>` +
      `<tr><th class="title" colspan="7">` +
      `新北市政府交通局計程車免費停車統計表（${escapeHtml(lotName)}）` +
      `</th></tr>` +
      `<tr>` +
      `<th>每日項次</th>` +
      `<th>日期</th>` +
      `<th>車牌</th>` +
      `<th>進場時間</th>` +
      `<th>離場時間</th>` +
      `<th>銷單金額</th>` +
      `<th>是否假日</th>` +
      `</tr>` +
      rows +
      blankRows +
      `</table>` +
      `</html>`

    const blob =
      new Blob(
        [
          html,
        ],
        {
          type:
            'application/vnd.ms-excel;charset=utf-8',
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
      `${lotName}_計程車免費停車統計表.xls`

    document.body
      .appendChild(
        a
      )

    a.click()

    document.body
      .removeChild(
        a
      )

    URL.revokeObjectURL(
      url
    )
  }

  async function exportPdf() {
    if (
      exportingPdf
    ) {
      return
    }

    const element =
      document.getElementById(
        'taxi-report-pdf'
      )

    if (
      !element
    ) {
      return
    }

    setExportingPdf(
      true
    )

    try {
      const [
        html2canvasModule,
        jspdfModule,
      ] =
        await Promise.all([
          import(
            'html2canvas'
          ),
          import(
            'jspdf'
          ),
        ])

      const html2canvas =
        html2canvasModule.default

      const {
        jsPDF,
      } =
        jspdfModule

      const canvas =
        await html2canvas(
          element,
          {
            scale: 2,
            useCORS:
              true,
            backgroundColor:
              '#ffffff',
          }
        )

      const pdf =
        new jsPDF({
          orientation:
            'landscape',
          unit: 'mm',
          format: 'a4',
        })

      const img =
        canvas.toDataURL(
          'image/jpeg',
          0.95
        )

      const pageWidth =
        297

      const pageHeight =
        210

      const ratio =
        Math.min(
          pageWidth /
            canvas.width,
          pageHeight /
            canvas.height
        )

      const width =
        canvas.width *
        ratio

      const height =
        canvas.height *
        ratio

      pdf.addImage(
        img,
        'JPEG',
        (
          pageWidth -
          width
        ) /
          2,
        8,
        width,
        height
      )

      pdf.save(
        `${selectedLot?.name || '停車場'}_${filterMonth}_計程車優惠報表.pdf`
      )
    } catch (
      error: any
    ) {
      alert(
        'PDF 匯出失敗：' +
          (
            error?.message ||
            '未知錯誤'
          )
      )
    } finally {
      setExportingPdf(
        false
      )
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
          gap: 12,
          alignItems:
            'flex-start',
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
            計程車折扣系統
          </h1>

          <div
            className="muted"
          >
            11:00–13:00 每車牌每日免費一次；同日再次進場不可重複使用，但最高上限仍有效。
          </div>
        </div>
      </div>

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
          <h2
            style={{
              marginTop:
                0,
            }}
          >
            優惠計算
          </h2>

          <div
            style={{
              display:
                'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(230px,1fr))',
              gap: 14,
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
                  e
                ) =>
                  setSelectedLotId(
                    e.target
                      .value
                  )
                }
              >
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

            <div
              className="field"
            >
              <label>
                車牌
              </label>

              <input
                value={
                  vehiclePlate
                }
                onChange={(
                  e
                ) =>
                  setVehiclePlate(
                    e.target
                      .value
                  )
                }
                placeholder="例如 ABC-1234"
              />
            </div>

            <div
              className="field"
            >
              <label>
                進場時間
              </label>

              <input
                type="datetime-local"
                value={
                  entryTime
                }
                onChange={(
                  e
                ) =>
                  setEntryTime(
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
              <label>
                出場時間
              </label>

              <input
                type="datetime-local"
                value={
                  exitTime
                }
                onChange={(
                  e
                ) =>
                  setExitTime(
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
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
                  e
                ) =>
                  setHourlyRate(
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
              <label>
                計費進位
              </label>

              <select
                value={
                  billingMode
                }
                onChange={(
                  e
                ) =>
                  setBillingMode(
                    e.target
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
                  依實際分鐘
                </option>
              </select>
            </div>

            <div
              className="field"
            >
              <label>
                每幾小時最高上限
              </label>

              <select
                value={
                  capHours
                }
                onChange={(
                  e
                ) =>
                  setCapHours(
                    e.target
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

            <div
              className="field"
            >
              <label>
                每區間最高金額
              </label>

              <input
                type="number"
                min="0"
                value={
                  capAmount
                }
                onChange={(
                  e
                ) =>
                  setCapAmount(
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
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
                  e
                ) =>
                  setIsHoliday(
                    e.target
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
                e
              ) =>
                setNotes(
                  e.target
                    .value
                )
              }
            />
          </div>

          <div
            style={{
              marginTop:
                16,
            }}
          >
            <button
              type="button"
              className="btn"
              onClick={
                calculate
              }
            >
              計算優惠
            </button>
          </div>

          {result && (
            <div
              style={{
                marginTop:
                  18,
                padding:
                  16,
                border:
                  '1px solid #cbd5e1',
                borderRadius:
                  10,
                background:
                  '#f8fafc',
              }}
            >
              <div>
                原始停車費：
                <strong>
                  NT$ {money(
                    result.originalAmount
                  )}
                </strong>
              </div>

              <div>
                11–13 點優惠：
                <strong>
                  - NT$ {money(
                    result.discountAmount
                  )}
                </strong>
              </div>

              <div
                style={{
                  marginTop:
                    8,
                  fontSize:
                    20,
                }}
              >
                銷單後金額：
                <strong>
                  NT$ {money(
                    result.finalAmount
                  )}
                </strong>
              </div>

              <div
                style={{
                  marginTop:
                    8,
                  color:
                    '#475569',
                }}
              >
                {
                  result.discountReason
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
                    14,
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
                padding:
                  10,
                background:
                  '#f8fafc',
              }}
            >
              {
                message
              }
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
          style={{
            display:
              'flex',
            justifyContent:
              'space-between',
            alignItems:
              'center',
            gap: 12,
            flexWrap:
              'wrap',
          }}
        >
          <div>
            <h2
              style={{
                marginTop:
                  0,
                marginBottom:
                  6,
              }}
            >
              計程車優惠報表
            </h2>

            <div
              className="muted"
            >
              {
                selectedLot?.name ||
                ''
              }
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
            <input
              type="month"
              value={
                filterMonth
              }
              onChange={(
                e
              ) =>
                setFilterMonth(
                  e.target
                    .value
                )
              }
            />

            <button
              type="button"
              onClick={
                exportExcel
              }
            >
              匯出 Excel
            </button>

            <button
              type="button"
              className="btn"
              onClick={
                exportPdf
              }
              disabled={
                exportingPdf
              }
            >
              {exportingPdf
                ? 'PDF 產生中…'
                : '匯出 PDF'}
            </button>
          </div>
        </div>

        <div
          id="taxi-report-pdf"
          style={{
            marginTop: 16,
            background: '#fff',
            padding: 12,
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              color: '#000',
              background: '#fff',
            }}
          >
            <thead>
              <tr>
                <th
                  colSpan={7}
                  style={{
                    border: '2px solid #000',
                    textAlign: 'center',
                    height: 58,
                    fontSize: 25,
                    fontWeight: 700,
                  }}
                >
                  新北市政府交通局計程車免費停車統計表（
                  {selectedLot?.name || ''}
                  ）
                </th>
              </tr>

              <tr>
                {[
                  '每日項次',
                  '日期',
                  '車牌',
                  '進場時間',
                  '離場時間',
                  '銷單金額',
                  '是否假日',
                ].map(
                  (
                    label
                  ) => (
                    <th
                      key={label}
                      style={{
                        border: '2px solid #000',
                        textAlign: 'center',
                        height: 34,
                        fontSize: 14,
                        fontWeight: 700,
                        padding: 4,
                      }}
                    >
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {officialRows.map(
                (
                  row
                ) => (
                  <tr
                    key={row.recordId}
                  >
                    <td
                      style={{
                        border: '2px solid #000',
                        textAlign: 'center',
                        height: 34,
                      }}
                    >
                      {row.dailyIndex}
                    </td>

                    <td
                      style={{
                        border: '2px solid #000',
                        textAlign: 'center',
                        height: 34,
                      }}
                    >
                      {row.date}
                    </td>

                    <td
                      style={{
                        border: '2px solid #000',
                        textAlign: 'center',
                        height: 34,
                      }}
                    >
                      {row.plate}
                    </td>

                    <td
                      style={{
                        border: '2px solid #000',
                        textAlign: 'center',
                        height: 34,
                      }}
                    >
                      {row.entry}
                    </td>

                    <td
                      style={{
                        border: '2px solid #000',
                        textAlign: 'center',
                        height: 34,
                      }}
                    >
                      {row.exit}
                    </td>

                    <td
                      style={{
                        border: '2px solid #000',
                        textAlign: 'center',
                        height: 34,
                      }}
                    >
                      {row.discount}
                    </td>

                    <td
                      style={{
                        border: '2px solid #000',
                        textAlign: 'center',
                        height: 34,
                      }}
                    >
                      {row.holiday}
                    </td>
                  </tr>
                )
              )}

              {Array.from({
                length:
                  Math.max(
                    0,
                    32 -
                      officialRows.length
                  ),
              }).map(
                (
                  _,
                  index
                ) => (
                  <tr
                    key={`blank-${index}`}
                  >
                    {Array.from({
                      length: 7,
                    }).map(
                      (
                        __,
                        cellIndex
                      ) => (
                        <td
                          key={
                            cellIndex
                          }
                          style={{
                            border:
                              '2px solid #000',
                            textAlign:
                              'center',
                            height:
                              34,
                          }}
                        >
                          {cellIndex ===
                          0
                            ? '\u00a0'
                            : ''}
                        </td>
                      )
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        <div
          style={{
            marginTop: 14,
            overflowX: 'auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: 760,
            }}
          >
            <thead>
              <tr>
                <th>日期</th>
                <th>車牌</th>
                <th>進場</th>
                <th>離場</th>
                <th>銷單金額</th>
                <th>操作</th>
              </tr>
            </thead>

            <tbody>
              {officialRows.map(
                (
                  row
                ) => (
                  <tr
                    key={`manage-${row.recordId}`}
                    style={{
                      borderTop:
                        '1px solid #e5e7eb',
                    }}
                  >
                    <td
                      style={{
                        padding: 8,
                      }}
                    >
                      {row.date}
                    </td>

                    <td
                      style={{
                        padding: 8,
                      }}
                    >
                      {row.plate}
                    </td>

                    <td
                      style={{
                        padding: 8,
                      }}
                    >
                      {row.entry}
                    </td>

                    <td
                      style={{
                        padding: 8,
                      }}
                    >
                      {row.exit}
                    </td>

                    <td
                      style={{
                        padding: 8,
                      }}
                    >
                      {row.discount}
                    </td>

                    <td
                      style={{
                        padding: 8,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const found =
                            records.find(
                              (
                                record
                              ) =>
                                record.id ===
                                row.recordId
                            )

                          if (
                            found
                          ) {
                            deleteRecord(
                              found
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

              {!officialRows.length && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: 18,
                      textAlign: 'center',
                      color: '#64748b',
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

      {loading && (
        <div
          className="muted"
          style={{
            marginTop:
              12,
          }}
        >
          讀取中…
        </div>
      )}
    </div>
  )
}
