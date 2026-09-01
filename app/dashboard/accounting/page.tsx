'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import { createClient } from '@/lib/supabase/client'

type UserRole =
  | 'supervisor'
  | 'accountant'

type ParkingLot = {
  id: string
  name: string
}

type AttendanceRow = {
  id: string
  parking_lot_id: string
  attendance_month: string
  storage_path: string
  file_name: string
  uploaded_at: string
}

type RentalRow = {
  id: string
  parking_lot_id: string
  customer_code: string | null
  customer_name: string | null
  phone: string | null
  vehicle_plate: string | null
  vehicle_type: string | null
  rental_type: string | null
  start_date: string | null
  end_date: string | null
  monthly_fee: number | null
  payment_status: string | null
  payment_date: string | null
  invoice_number: string | null
  rental_status: string | null
  notes: string | null
  updated_at: string | null
}

type ChangeRow = {
  id: string
  parking_lot_id: string
  monthly_rental_id: string | null
  customer_code: string | null
  customer_name: string | null
  phone: string | null
  vehicle_plate: string | null
  vehicle_type: string | null
  rental_type: string | null
  change_type: string
  effective_date: string | null
  reason: string | null
  change_detail: string | null
  source: string | null
  created_at: string
}

type TaxiRecord = {
  id: string
  parking_lot_id: string
  vehicle_plate: string
  entry_time: string
  exit_time: string
  discount_amount: number
  used_free_discount: boolean
  discount_date: string | null
  is_holiday: boolean
}

type TaxiOfficialRow = {
  dailyIndex: number
  date: string
  plate: string
  entry: string
  exit: string
  discount: number
  holiday: string
}

const TAXI_SELECTED_STORAGE =
  'accounting-taxi-report-selected-lots'

function currentMonthText() {
  const now =
    new Date()

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`
}

function previousMonthText() {
  const now =
    new Date()

  const date =
    new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    )

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, '0')}`
}

function monthStart(
  month: string
) {
  return `${month}-01`
}

function nextMonthStart(
  month: string
) {
  const [
    year,
    monthNumber,
  ] =
    month
      .split('-')
      .map(Number)

  const date =
    new Date(
      year,
      monthNumber,
      1
    )

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(
    2,
    '0'
  )}-01`
}

function safeFileName(
  value: string
) {
  return String(
    value ||
      ''
  )
    .replace(
      /[\\/:*?"<>|]/g,
      '_'
    )
    .replace(
      /\s+/g,
      '_'
    )
    .trim()
}

function vehicleTypeText(
  value?: string | null
) {
  if (
    value === 'car' ||
    value === '汽車'
  ) {
    return '汽車'
  }

  if (
    value === 'motorcycle' ||
    value === '機車'
  ) {
    return '機車'
  }

  if (
    value === 'heavy_motorcycle' ||
    value === '重機'
  ) {
    return '重機'
  }

  return (
    value ||
    ''
  )
}

function paymentStatusText(
  value?: string | null
) {
  if (
    value === 'paid'
  ) {
    return '已繳'
  }

  if (
    value === 'unpaid'
  ) {
    return '未繳'
  }

  return (
    value ||
    ''
  )
}

function rentalStatusText(
  value?: string | null
) {
  if (
    value === 'active'
  ) {
    return '有效'
  }

  if (
    value === 'cancelled'
  ) {
    return '已退租'
  }

  if (
    value === 'inactive'
  ) {
    return '停用'
  }

  return (
    value ||
    ''
  )
}

function changeTypeText(
  value: string
) {
  if (
    value === 'joined'
  ) {
    return '新增'
  }

  if (
    value === 'cancelled'
  ) {
    return '退租'
  }

  return value
}

function saveBlob(
  blob: Blob,
  fileName: string
) {
  const url =
    URL.createObjectURL(
      blob
    )

  const link =
    document.createElement(
      'a'
    )

  link.href =
    url

  link.download =
    fileName

  document.body.appendChild(
    link
  )

  link.click()

  document.body.removeChild(
    link
  )

  setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      )
    },
    1500
  )
}

function localDateText() {
  const now =
    new Date()

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(
    2,
    '0'
  )}-${String(
    now.getDate()
  ).padStart(
    2,
    '0'
  )}`
}

function taipeiParts(
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

        hour:
          '2-digit',

        minute:
          '2-digit',

        hour12:
          false,
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

  return {
    date:
      `${map.year}/${map.month}/${map.day}`,

    dateKey:
      `${map.year}-${map.month}-${map.day}`,

    time:
      `${map.hour}:${map.minute}`,
  }
}

function buildTaxiOfficialRows(
  rows: TaxiRecord[]
) {
  const sorted =
    [...rows].sort(
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

  const dailyCounters =
    new Map<
      string,
      number
    >()

  return sorted.map(
    (
      row
    ): TaxiOfficialRow => {
      const entry =
        taipeiParts(
          row.entry_time
        )

      const exit =
        taipeiParts(
          row.exit_time
        )

      const dailyIndex =
        (
          dailyCounters.get(
            entry.dateKey
          ) ||
          0
        ) + 1

      dailyCounters.set(
        entry.dateKey,
        dailyIndex
      )

      return {
        dailyIndex,

        date:
          entry.date,

        plate:
          row.vehicle_plate ||
          '',

        entry:
          entry.time,

        exit:
          exit.time,

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
}

function createTaxiReportElement(
  lotName: string,
  month: string,
  rows: TaxiOfficialRow[]
) {
  const wrapper =
    document.createElement(
      'div'
    )

  wrapper.style.position =
    'fixed'

  wrapper.style.left =
    '-99999px'

  wrapper.style.top =
    '0'

  wrapper.style.width =
    '1120px'

  wrapper.style.padding =
    '20px'

  wrapper.style.background =
    '#ffffff'

  wrapper.style.color =
    '#000000'

  wrapper.style.fontFamily =
    '"Microsoft JhengHei", Arial, sans-serif'

  const table =
    document.createElement(
      'table'
    )

  table.style.width =
    '100%'

  table.style.borderCollapse =
    'collapse'

  table.style.tableLayout =
    'fixed'

  function makeCell(
    text: string,
    tag:
      | 'th'
      | 'td' =
      'td'
  ) {
    const cell =
      document.createElement(
        tag
      )

    cell.textContent =
      text

    cell.style.border =
      '2px solid #000'

    cell.style.padding =
      '6px'

    cell.style.height =
      '32px'

    cell.style.textAlign =
      'center'

    cell.style.fontSize =
      '14px'

    return cell
  }

  const titleRow =
    document.createElement(
      'tr'
    )

  const titleCell =
    makeCell(
      `新北市政府交通局計程車免費停車統計表（${lotName}）`,
      'th'
    )

  titleCell.colSpan =
    7

  titleCell.style.height =
    '58px'

  titleCell.style.fontSize =
    '24px'

  titleCell.style.fontWeight =
    '700'

  titleRow.appendChild(
    titleCell
  )

  table.appendChild(
    titleRow
  )

  const monthRow =
    document.createElement(
      'tr'
    )

  const monthCell =
    makeCell(
      `統計月份：${month}`,
      'th'
    )

  monthCell.colSpan =
    7

  monthCell.style.textAlign =
    'left'

  monthCell.style.paddingLeft =
    '12px'

  monthRow.appendChild(
    monthCell
  )

  table.appendChild(
    monthRow
  )

  const header =
    document.createElement(
      'tr'
    )

  const headers = [
    '每日項次',
    '日期',
    '車牌',
    '進場時間',
    '離場時間',
    '銷單金額',
    '是否假日',
  ]

  headers.forEach(
    (
      label
    ) => {
      const cell =
        makeCell(
          label,
          'th'
        )

      cell.style.fontWeight =
        '700'

      header.appendChild(
        cell
      )
    }
  )

  table.appendChild(
    header
  )

  rows.forEach(
    (
      row
    ) => {
      const tr =
        document.createElement(
          'tr'
        )

      const values = [
        String(
          row.dailyIndex
        ),
        row.date,
        row.plate,
        row.entry,
        row.exit,
        String(
          row.discount
        ),
        row.holiday,
      ]

      values.forEach(
        (
          value
        ) => {
          tr.appendChild(
            makeCell(
              value
            )
          )
        }
      )

      table.appendChild(
        tr
      )
    }
  )

  /*
   * 正式報表保留至少 32 列。
   */
  for (
    let index =
      rows.length;
    index <
    32;
    index++
  ) {
    const tr =
      document.createElement(
        'tr'
      )

    for (
      let column = 0;
      column <
      7;
      column++
    ) {
      tr.appendChild(
        makeCell(
          column ===
          0
            ? '\u00a0'
            : ''
        )
      )
    }

    table.appendChild(
      tr
    )
  }

  wrapper.appendChild(
    table
  )

  document.body.appendChild(
    wrapper
  )

  return wrapper
}

async function generateTaxiPdfBlob(
  lotName: string,
  month: string,
  rows: TaxiOfficialRow[]
) {
  const html2canvas =
    (
      await import(
        'html2canvas'
      )
    ).default

  const {
    jsPDF,
  } =
    await import(
      'jspdf'
    )

  const element =
    createTaxiReportElement(
      lotName,
      month,
      rows
    )

  try {
    const canvas =
      await html2canvas(
        element,
        {
          scale:
            2,

          backgroundColor:
            '#ffffff',

          useCORS:
            true,
        }
      )

    const pdf =
      new jsPDF({
        orientation:
          'landscape',

        unit:
          'mm',

        format:
          'a4',
      })

    const image =
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
        281 /
          canvas.width,

        194 /
          canvas.height
      )

    const width =
      canvas.width *
      ratio

    const height =
      canvas.height *
      ratio

    pdf.addImage(
      image,
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

    return pdf.output(
      'blob'
    )
  } finally {
    if (
      document.body.contains(
        element
      )
    ) {
      document.body.removeChild(
        element
      )
    }
  }
}

export default function AccountingReportCenterPage() {
  const supabase =
    createClient()

  const db =
    supabase as any

  const [
    role,
    setRole,
  ] =
    useState<
      UserRole | null
    >(null)

  const [
    month,
    setMonth,
  ] =
    useState(
      currentMonthText()
    )

  const [
    taxiMonth,
    setTaxiMonth,
  ] =
    useState(
      previousMonthText()
    )

  const [
    parkingLots,
    setParkingLots,
  ] =
    useState<
      ParkingLot[]
    >([])

  const [
    attendanceRows,
    setAttendanceRows,
  ] =
    useState<
      AttendanceRow[]
    >([])

  const [
    changes,
    setChanges,
  ] =
    useState<
      ChangeRow[]
    >([])

  const [
    taxiSelectedLots,
    setTaxiSelectedLots,
  ] =
    useState<
      string[]
    >([])

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    )

  const [
    accessDenied,
    setAccessDenied,
  ] =
    useState(
      false
    )

  const [
    attendanceDownloading,
    setAttendanceDownloading,
  ] =
    useState(
      false
    )

  const [
    rentalDownloading,
    setRentalDownloading,
  ] =
    useState(
      false
    )

  const [
    changeDownloading,
    setChangeDownloading,
  ] =
    useState(
      false
    )

  const [
    taxiDownloading,
    setTaxiDownloading,
  ] =
    useState(
      false
    )

  const [
    taxiSharing,
    setTaxiSharing,
  ] =
    useState(
      false
    )

  const [
    message,
    setMessage,
  ] =
    useState('')

  useEffect(
    () => {
      void loadInitial()
    },
    []
  )

  useEffect(
    () => {
      if (
        !loading &&
        !accessDenied
      ) {
        void loadMonthData(
          month
        )
      }
    },
    [
      month,
    ]
  )

  useEffect(
    () => {
      if (
        typeof window ===
        'undefined'
      ) {
        return
      }

      const saved =
        window.localStorage.getItem(
          TAXI_SELECTED_STORAGE
        )

      if (
        !saved
      ) {
        return
      }

      try {
        const parsed =
          JSON.parse(
            saved
          )

        if (
          Array.isArray(
            parsed
          )
        ) {
          setTaxiSelectedLots(
            parsed.filter(
              (
                value
              ) =>
                typeof value ===
                'string'
            )
          )
        }
      } catch {
        //
      }
    },
    []
  )

  function saveTaxiSelection(
    ids: string[]
  ) {
    setTaxiSelectedLots(
      ids
    )

    if (
      typeof window !==
      'undefined'
    ) {
      window.localStorage.setItem(
        TAXI_SELECTED_STORAGE,
        JSON.stringify(
          ids
        )
      )
    }
  }

  async function loadInitial() {
    setLoading(
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
        setAccessDenied(
          true
        )

        setMessage(
          '登入狀態失效，請重新登入。'
        )

        return
      }

      const {
        data:
          profile,
        error:
          profileError,
      } =
        await db
          .from(
            'profiles'
          )
          .select(
            'role, is_active'
          )
          .eq(
            'id',
            user.id
          )
          .maybeSingle()

      if (
        profileError
      ) {
        setAccessDenied(
          true
        )

        setMessage(
          `權限讀取失敗：${profileError.message}`
        )

        return
      }

      if (
        !profile ||
        !profile.is_active ||
        (
          profile.role !==
            'supervisor' &&
          profile.role !==
            'accountant'
        )
      ) {
        setAccessDenied(
          true
        )

        setMessage(
          '此帳號沒有報表中心權限。'
        )

        return
      }

      setRole(
        profile.role
      )

      const {
        data:
          lots,
        error:
          lotsError,
      } =
        await db
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
        lotsError
      ) {
        setMessage(
          `停車場讀取失敗：${lotsError.message}`
        )

        return
      }

      const loadedLots =
        (
          lots ||
          []
        ) as ParkingLot[]

      setParkingLots(
        loadedLots
      )

      await loadMonthData(
        month
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '報表中心載入失敗'
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  async function loadMonthData(
    targetMonth:
      string
  ) {
    const start =
      monthStart(
        targetMonth
      )

    const next =
      nextMonthStart(
        targetMonth
      )

    const {
      data:
        attendanceData,
      error:
        attendanceError,
    } =
      await db
        .from(
          'monthly_attendance_sheets'
        )
        .select(`
          id,
          parking_lot_id,
          attendance_month,
          storage_path,
          file_name,
          uploaded_at
        `)
        .eq(
          'attendance_month',
          start
        )
        .order(
          'uploaded_at',
          {
            ascending:
              false,
          }
        )

    if (
      attendanceError
    ) {
      setMessage(
        `簽到表讀取失敗：${attendanceError.message}`
      )

      return
    }

    setAttendanceRows(
      (
        attendanceData ||
        []
      ) as AttendanceRow[]
    )

    const {
      data:
        changeData,
      error:
        changeError,
    } =
      await db
        .from(
          'monthly_rental_changes'
        )
        .select(`
          id,
          parking_lot_id,
          monthly_rental_id,
          customer_code,
          customer_name,
          phone,
          vehicle_plate,
          vehicle_type,
          rental_type,
          change_type,
          effective_date,
          reason,
          change_detail,
          source,
          created_at
        `)
        .in(
          'change_type',
          [
            'joined',
            'cancelled',
          ]
        )
        .gte(
          'effective_date',
          start
        )
        .lt(
          'effective_date',
          next
        )
        .order(
          'effective_date',
          {
            ascending:
              false,
          }
        )

    if (
      changeError
    ) {
      setMessage(
        `異動資料讀取失敗：${changeError.message}`
      )

      return
    }

    setChanges(
      (
        changeData ||
        []
      ) as ChangeRow[]
    )
  }

  const lotNameMap =
    useMemo(
      () =>
        new Map<
          string,
          string
        >(
          parkingLots.map(
            (
              lot
            ) => [
              lot.id,
              lot.name,
            ]
          )
        ),
      [
        parkingLots,
      ]
    )

  const attendanceLotCount =
    useMemo(
      () =>
        new Set(
          attendanceRows.map(
            (
              row
            ) =>
              row.parking_lot_id
          )
        ).size,
      [
        attendanceRows,
      ]
    )

  const joinedCount =
    useMemo(
      () =>
        changes.filter(
          (
            row
          ) =>
            row.change_type ===
            'joined'
        ).length,
      [
        changes,
      ]
    )

  const cancelledCount =
    useMemo(
      () =>
        changes.filter(
          (
            row
          ) =>
            row.change_type ===
            'cancelled'
        ).length,
      [
        changes,
      ]
    )

  async function downloadAttendanceZip() {
    if (
      attendanceDownloading
    ) {
      return
    }

    if (
      attendanceRows.length ===
      0
    ) {
      setMessage(
        `${month} 沒有任何已上傳的簽到表。`
      )

      return
    }

    setAttendanceDownloading(
      true
    )

    setMessage(
      '正在下載簽到表並建立 ZIP…'
    )

    try {
      const JSZip =
        (
          await import(
            'jszip'
          )
        ).default

      const zip =
        new JSZip()

      const usedPaths =
        new Set<string>()

      for (
        let index =
          0;
        index <
        attendanceRows.length;
        index++
      ) {
        const row =
          attendanceRows[
            index
          ]

        const {
          data:
            blob,
          error,
        } =
          await supabase
            .storage
            .from(
              'monthly-attendance'
            )
            .download(
              row.storage_path
            )

        if (
          error ||
          !blob
        ) {
          throw new Error(
            `${row.file_name} 下載失敗：${error?.message || '未知錯誤'}`
          )
        }

        const lotName =
          safeFileName(
            lotNameMap.get(
              row.parking_lot_id
            ) ||
              '未知停車場'
          )

        let fileName =
          safeFileName(
            row.file_name
          )

        let path =
          `${lotName}/${fileName}`

        if (
          usedPaths.has(
            path
          )
        ) {
          fileName =
            `${String(
              index + 1
            ).padStart(
              2,
              '0'
            )}_${fileName}`

          path =
            `${lotName}/${fileName}`
        }

        usedPaths.add(
          path
        )

        zip.file(
          path,
          blob
        )
      }

      const zipBlob =
        await zip.generateAsync({
          type:
            'blob',

          compression:
            'DEFLATE',

          compressionOptions: {
            level:
              6,
          },
        })

      saveBlob(
        zipBlob,
        `${month}_所有停車場_簽到表.zip`
      )

      setMessage(
        `${month} 簽到表下載完成，共 ${attendanceRows.length} 份。`
      )
    } catch (
      error: any
    ) {
      setMessage(
        `簽到表下載失敗：${error?.message || '未知錯誤'}`
      )
    } finally {
      setAttendanceDownloading(
        false
      )
    }
  }

  /*
   * =====================================================
   * 最新月租名單
   *
   * 每個停車場各產生一個 Excel，
   * 再全部壓縮成 ZIP。
   * =====================================================
   */
  async function downloadLatestMonthlyRentals() {
    if (
      rentalDownloading
    ) {
      return
    }

    setRentalDownloading(
      true
    )

    setMessage(
      '正在讀取所有停車場最新月租資料並建立 ZIP…'
    )

    try {
      const {
        data,
        error,
      } =
        await db
          .from(
            'monthly_rentals'
          )
          .select(`
            id,
            parking_lot_id,
            customer_code,
            customer_name,
            phone,
            vehicle_plate,
            vehicle_type,
            rental_type,
            start_date,
            end_date,
            monthly_fee,
            payment_status,
            payment_date,
            invoice_number,
            rental_status,
            notes,
            updated_at
          `)
          .order(
            'parking_lot_id'
          )
          .order(
            'customer_name'
          )

      if (
        error
      ) {
        throw new Error(
          error.message
        )
      }

      const rentals =
        (
          data ||
          []
        ).filter(
          (
            row: RentalRow
          ) =>
            row.rental_status !==
            'cancelled'
        ) as RentalRow[]

      if (
        rentals.length ===
        0
      ) {
        setMessage(
          '目前沒有可匯出的月租資料。'
        )

        return
      }

      const XLSX =
        await import(
          'xlsx'
        )

      const JSZip =
        (
          await import(
            'jszip'
          )
        ).default

      const zip =
        new JSZip()

      const dateText =
        localDateText()

      let exportedLotCount =
        0

      let exportedRowCount =
        0

      function mapRental(
        row: RentalRow,
        lotName: string
      ) {
        return {
          停車場:
            lotName,

          客戶編號:
            row.customer_code ||
            '',

          姓名:
            row.customer_name ||
            '',

          電話:
            row.phone ||
            '',

          車牌:
            row.vehicle_plate ||
            '',

          車種:
            vehicleTypeText(
              row.vehicle_type
            ),

          月租類型:
            row.rental_type ||
            '',

          起租日:
            row.start_date ||
            '',

          到期日:
            row.end_date ||
            '',

          月租金額:
            Number(
              row.monthly_fee ||
              0
            ),

          付款狀態:
            paymentStatusText(
              row.payment_status
            ),

          付款日期:
            row.payment_date ||
            '',

          發票號碼:
            row.invoice_number ||
            '',

          租用狀態:
            rentalStatusText(
              row.rental_status
            ),

          備註:
            row.notes ||
            '',

          資料更新時間:
            row.updated_at
              ? new Date(
                  row.updated_at
                ).toLocaleString(
                  'zh-TW'
                )
              : '',
        }
      }

      for (
        const lot of
        parkingLots
      ) {
        const lotRentals =
          rentals.filter(
            (
              row
            ) =>
              row.parking_lot_id ===
              lot.id
          )

        /*
         * 沒有月租資料的場站不建立空白檔案。
         */
        if (
          lotRentals.length ===
          0
        ) {
          continue
        }

        const excelRows =
          lotRentals.map(
            (
              row
            ) =>
              mapRental(
                row,
                lot.name
              )
          )

        const workbook =
          XLSX.utils.book_new()

        const worksheet =
          XLSX.utils.json_to_sheet(
            excelRows
          )

        worksheet[
          '!cols'
        ] = [
          {
            wch:
              30,
          },
          {
            wch:
              14,
          },
          {
            wch:
              14,
          },
          {
            wch:
              16,
          },
          {
            wch:
              14,
          },
          {
            wch:
              10,
          },
          {
            wch:
              18,
          },
          {
            wch:
              12,
          },
          {
            wch:
              12,
          },
          {
            wch:
              12,
          },
          {
            wch:
              12,
          },
          {
            wch:
              12,
          },
          {
            wch:
              16,
          },
          {
            wch:
              12,
          },
          {
            wch:
              30,
          },
          {
            wch:
              20,
          },
        ]

        XLSX.utils.book_append_sheet(
          workbook,
          worksheet,
          '月租名單'
        )

        const excelData =
          XLSX.write(
            workbook,
            {
              bookType:
                'xlsx',

              type:
                'array',
            }
          )

        const excelBlob =
          new Blob(
            [
              excelData,
            ],
            {
              type:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }
          )

        const fileName =
          `${safeFileName(
            lot.name
          )}_${dateText}_最新月租名單.xlsx`

        zip.file(
          fileName,
          excelBlob
        )

        exportedLotCount++

        exportedRowCount +=
          lotRentals.length
      }

      if (
        exportedLotCount ===
        0
      ) {
        setMessage(
          '目前沒有任何停車場有可匯出的月租資料。'
        )

        return
      }

      const zipBlob =
        await zip.generateAsync({
          type:
            'blob',

          compression:
            'DEFLATE',

          compressionOptions: {
            level:
              6,
          },
        })

      saveBlob(
        zipBlob,
        `${dateText}_所有停車場_最新月租名單.zip`
      )

      setMessage(
        `最新月租名單完成：${exportedLotCount} 個停車場，共 ${exportedRowCount} 筆月租資料。`
      )
    } catch (
      error: any
    ) {
      setMessage(
        `月租名單下載失敗：${error?.message || '未知錯誤'}`
      )
    } finally {
      setRentalDownloading(
        false
      )
    }
  }

  async function downloadContractChanges() {
    if (
      changeDownloading
    ) {
      return
    }

    if (
      changes.length ===
      0
    ) {
      setMessage(
        `${month} 沒有新增或退租異動。`
      )

      return
    }

    setChangeDownloading(
      true
    )

    setMessage(
      '正在製作簽約異動 Excel…'
    )

    try {
      const XLSX =
        await import(
          'xlsx'
        )

      const workbook =
        XLSX.utils.book_new()

      function mapChange(
        row: ChangeRow
      ) {
        return {
          異動類型:
            changeTypeText(
              row.change_type
            ),

          異動日期:
            row.effective_date ||
            row.created_at.slice(
              0,
              10
            ),

          停車場:
            lotNameMap.get(
              row.parking_lot_id
            ) ||
            '',

          客戶編號:
            row.customer_code ||
            '',

          姓名:
            row.customer_name ||
            '',

          電話:
            row.phone ||
            '',

          車牌:
            row.vehicle_plate ||
            '',

          車種:
            vehicleTypeText(
              row.vehicle_type
            ),

          月租類型:
            row.rental_type ||
            '',

          異動說明:
            row.change_detail ||
            '',

          原因:
            row.reason ||
            '',

          來源:
            row.source ||
            '',
        }
      }

      const allRows =
        changes.map(
          mapChange
        )

      const joinedRows =
        changes
          .filter(
            (
              row
            ) =>
              row.change_type ===
              'joined'
          )
          .map(
            mapChange
          )

      const cancelledRows =
        changes
          .filter(
            (
              row
            ) =>
              row.change_type ===
              'cancelled'
          )
          .map(
            mapChange
          )

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          allRows
        ),
        '全部異動'
      )

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          joinedRows
        ),
        '新增'
      )

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          cancelledRows
        ),
        '退租'
      )

      XLSX.writeFile(
        workbook,
        `${month}_所有停車場_簽約異動.xlsx`
      )

      setMessage(
        `${month} 簽約異動完成：新增 ${joinedCount} 筆、退租 ${cancelledCount} 筆。`
      )
    } catch (
      error: any
    ) {
      setMessage(
        `簽約異動下載失敗：${error?.message || '未知錯誤'}`
      )
    } finally {
      setChangeDownloading(
        false
      )
    }
  }

  function toggleTaxiLot(
    lotId: string
  ) {
    if (
      taxiSelectedLots.includes(
        lotId
      )
    ) {
      saveTaxiSelection(
        taxiSelectedLots.filter(
          (
            id
          ) =>
            id !==
            lotId
        )
      )

      return
    }

    saveTaxiSelection([
      ...taxiSelectedLots,
      lotId,
    ])
  }

  async function loadTaxiRecords(
    lotId: string
  ) {
    const start =
      `${taxiMonth}-01T00:00:00+08:00`

    const [
      year,
      monthNumber,
    ] =
      taxiMonth
        .split('-')
        .map(Number)

    const nextDate =
      new Date(
        year,
        monthNumber,
        1
      )

    const next =
      `${nextDate.getFullYear()}-${String(
        nextDate.getMonth() + 1
      ).padStart(
        2,
        '0'
      )}-01T00:00:00+08:00`

    const {
      data,
      error,
    } =
      await db
        .from(
          'taxi_discount_records'
        )
        .select(`
          id,
          parking_lot_id,
          vehicle_plate,
          entry_time,
          exit_time,
          discount_amount,
          used_free_discount,
          discount_date,
          is_holiday
        `)
        .eq(
          'parking_lot_id',
          lotId
        )
        .gte(
          'entry_time',
          start
        )
        .lt(
          'entry_time',
          next
        )
        .order(
          'entry_time',
          {
            ascending:
              true,
          }
        )

    if (
      error
    ) {
      throw new Error(
        error.message
      )
    }

    return (
      data ||
      []
    ) as TaxiRecord[]
  }

  async function createSelectedTaxiFiles() {
    if (
      taxiSelectedLots.length ===
      0
    ) {
      throw new Error(
        '請至少選擇一個需要輸出計程車報表的停車場。'
      )
    }

    const files: {
      lotId: string
      lotName: string
      fileName: string
      blob: Blob
      count: number
    }[] = []

    for (
      const lotId of
      taxiSelectedLots
    ) {
      const lot =
        parkingLots.find(
          (
            item
          ) =>
            item.id ===
            lotId
        )

      if (
        !lot
      ) {
        continue
      }

      const records =
        await loadTaxiRecords(
          lot.id
        )

      const officialRows =
        buildTaxiOfficialRows(
          records
        )

      const blob =
        await generateTaxiPdfBlob(
          lot.name,
          taxiMonth,
          officialRows
        )

      files.push({
        lotId:
          lot.id,

        lotName:
          lot.name,

        fileName:
          `${safeFileName(
            lot.name
          )}_${taxiMonth}_計程車優惠報表.pdf`,

        blob,

        count:
          officialRows.length,
      })
    }

    return files
  }

  async function downloadTaxiReports() {
    if (
      taxiDownloading
    ) {
      return
    }

    setTaxiDownloading(
      true
    )

    setMessage(
      '正在製作計程車正式月報…'
    )

    try {
      const files =
        await createSelectedTaxiFiles()

      if (
        files.length ===
        0
      ) {
        setMessage(
          '沒有可下載的計程車報表。'
        )

        return
      }

      if (
        files.length ===
        1
      ) {
        saveBlob(
          files[0].blob,
          files[0].fileName
        )

        setMessage(
          `${files[0].lotName} 計程車月報已完成。`
        )

        return
      }

      const JSZip =
        (
          await import(
            'jszip'
          )
        ).default

      const zip =
        new JSZip()

      for (
        const file of
        files
      ) {
        zip.file(
          file.fileName,
          file.blob
        )
      }

      const zipBlob =
        await zip.generateAsync({
          type:
            'blob',

          compression:
            'DEFLATE',

          compressionOptions: {
            level:
              6,
          },
        })

      saveBlob(
        zipBlob,
        `${taxiMonth}_計程車優惠月報_${files.length}場.zip`
      )

      setMessage(
        `已完成 ${files.length} 個停車場計程車月報。`
      )
    } catch (
      error: any
    ) {
      setMessage(
        `計程車報表失敗：${error?.message || '未知錯誤'}`
      )
    } finally {
      setTaxiDownloading(
        false
      )
    }
  }

  async function shareTaxiReports() {
    if (
      taxiSharing
    ) {
      return
    }

    setTaxiSharing(
      true
    )

    setMessage(
      '正在準備手機分享檔案…'
    )

    try {
      const files =
        await createSelectedTaxiFiles()

      if (
        files.length ===
        0
      ) {
        setMessage(
          '沒有可分享的計程車報表。'
        )

        return
      }

      let shareFile:
        File

      if (
        files.length ===
        1
      ) {
        shareFile =
          new File(
            [
              files[0].blob,
            ],
            files[0].fileName,
            {
              type:
                'application/pdf',
            }
          )
      } else {
        const JSZip =
          (
            await import(
              'jszip'
            )
          ).default

        const zip =
          new JSZip()

        for (
          const item of
          files
        ) {
          zip.file(
            item.fileName,
            item.blob
          )
        }

        const zipBlob =
          await zip.generateAsync({
            type:
              'blob',

            compression:
              'DEFLATE',

            compressionOptions: {
              level:
                6,
            },
          })

        shareFile =
          new File(
            [
              zipBlob,
            ],
            `${taxiMonth}_計程車優惠月報_${files.length}場.zip`,
            {
              type:
                'application/zip',
            }
          )
      }

      if (
        typeof navigator ===
        'undefined' ||
        typeof navigator.share !==
        'function'
      ) {
        saveBlob(
          shareFile,
          shareFile.name
        )

        setMessage(
          '此瀏覽器不支援直接分享檔案，已改為下載。下載後可從 LINE 選擇檔案傳送。'
        )

        return
      }

      const shareData:
        ShareData = {
        title:
          `${taxiMonth} 計程車優惠月報`,

        text:
          `${taxiMonth} 計程車優惠月報`,

        files: [
          shareFile,
        ],
      }

      const shareNavigator =
        navigator as Navigator & {
          canShare?: (
            data:
              ShareData
          ) => boolean
        }

      if (
        typeof shareNavigator.canShare ===
          'function' &&
        !shareNavigator.canShare(
          shareData
        )
      ) {
        saveBlob(
          shareFile,
          shareFile.name
        )

        setMessage(
          '目前手機不支援直接分享此檔案格式，已改為下載。'
        )

        return
      }

      await navigator.share(
        shareData
      )

      setMessage(
        '已開啟手機分享功能，可選擇 LINE 與聊天對象。'
      )
    } catch (
      error: any
    ) {
      if (
        error?.name ===
        'AbortError'
      ) {
        setMessage(
          '已取消分享。'
        )

        return
      }

      setMessage(
        `分享失敗：${error?.message || '未知錯誤'}`
      )
    } finally {
      setTaxiSharing(
        false
      )
    }
  }

  if (
    accessDenied
  ) {
    return (
      <div className="card">
        <h1>
          報表中心
        </h1>

        <div
          style={{
            color:
              '#b91c1c',

            fontWeight:
              700,
          }}
        >
          {
            message
          }
        </div>
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
      <div>
        <h1
          style={{
            marginTop:
              0,

            marginBottom:
              6,
          }}
        >
          報表中心
        </h1>

        <p
          className="muted"
          style={{
            marginTop:
              0,
          }}
        >
          統一處理每月簽到表、最新月租名單、簽約異動及主管計程車折扣月報。
        </p>
      </div>

      <div
        className="card"
        style={{
          marginTop:
            18,
        }}
      >
        <div
          className="field"
          style={{
            maxWidth:
              260,
          }}
        >
          <label>
            會計報表月份
          </label>

          <input
            type="month"
            value={
              month
            }
            onChange={(
              event
            ) =>
              setMonth(
                event
                  .target
                  .value
              )
            }
          />
        </div>
      </div>

      <div
        style={{
          display:
            'grid',

          gridTemplateColumns:
            'repeat(auto-fit,minmax(280px,1fr))',

          gap:
            16,

          marginTop:
            18,
        }}
      >
        <div className="card">
          <h2
            style={{
              marginTop:
                0,
            }}
          >
            每月簽到表
          </h2>

          <div
            style={{
              fontSize:
                30,

              fontWeight:
                800,

              margin:
                '8px 0',
            }}
          >
            {
              attendanceRows.length
            }{' '}
            份
          </div>

          <div className="muted">
            已上傳停車場：
            {
              attendanceLotCount
            }{' '}
            間
          </div>

          <div
            className="muted"
            style={{
              marginTop:
                5,
            }}
          >
            月份：
            {
              month
            }
          </div>

          <button
            type="button"
            className="btn"
            onClick={
              downloadAttendanceZip
            }
            disabled={
              attendanceDownloading ||
              attendanceRows.length ===
                0
            }
            style={{
              marginTop:
                16,
            }}
          >
            {attendanceDownloading
              ? 'ZIP 建立中…'
              : '下載本月簽到表 ZIP'}
          </button>
        </div>

        <div className="card">
          <h2
            style={{
              marginTop:
                0,
            }}
          >
            最新月租名單
          </h2>

          <div
            style={{
              lineHeight:
                1.7,
            }}
          >
            每個停車場各產生一份 Excel，再統一壓縮成 ZIP。
          </div>

          <div
            className="muted"
            style={{
              marginTop:
                8,
            }}
          >
            下載內容為按下按鈕當下的最新月租資料，不使用快照。
          </div>

          <button
            type="button"
            className="btn"
            onClick={
              downloadLatestMonthlyRentals
            }
            disabled={
              rentalDownloading
            }
            style={{
              marginTop:
                16,
            }}
          >
            {rentalDownloading
              ? 'ZIP 製作中…'
              : '下載各停車場月租 ZIP'}
          </button>
        </div>

        <div className="card">
          <h2
            style={{
              marginTop:
                0,
            }}
          >
            簽約異動
          </h2>

          <div
            style={{
              display:
                'flex',

              gap:
                20,

              marginTop:
                10,
            }}
          >
            <div>
              <div className="muted">
                新增
              </div>

              <div
                style={{
                  fontSize:
                    26,

                  fontWeight:
                    800,
                }}
              >
                {
                  joinedCount
                }
              </div>
            </div>

            <div>
              <div className="muted">
                退租
              </div>

              <div
                style={{
                  fontSize:
                    26,

                  fontWeight:
                    800,
                }}
              >
                {
                  cancelledCount
                }
              </div>
            </div>
          </div>

          <div
            className="muted"
            style={{
              marginTop:
                8,
            }}
          >
            僅包含新增與退租，不包含一般資料修改。
          </div>

          <button
            type="button"
            className="btn"
            onClick={
              downloadContractChanges
            }
            disabled={
              changeDownloading ||
              changes.length ===
                0
            }
            style={{
              marginTop:
                16,
            }}
          >
            {changeDownloading
              ? 'Excel 製作中…'
              : '下載簽約異動 Excel'}
          </button>
        </div>
      </div>

      {role ===
        'supervisor' && (
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
                'flex-start',

              gap:
                12,

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
                計程車折扣月報
              </h2>

              <div className="muted">
                主管專用。預設為上個月份，可自行指定需要輸出的停車場。
              </div>
            </div>

            <div
              className="field"
              style={{
                minWidth:
                  210,
              }}
            >
              <label>
                計程車報表月份
              </label>

              <input
                type="month"
                value={
                  taxiMonth
                }
                onChange={(
                  event
                ) =>
                  setTaxiMonth(
                    event
                      .target
                      .value
                  )
                }
              />
            </div>
          </div>

          <div
            style={{
              marginTop:
                14,

              padding:
                12,

              borderRadius:
                10,

              background:
                '#f0f9ff',

              color:
                '#075985',
            }}
          >
            平面停車場不需要計程車折扣時不要勾選。系統會在目前這台裝置記住你選過的停車場。
          </div>

          <div
            style={{
              display:
                'flex',

              gap:
                8,

              flexWrap:
                'wrap',

              marginTop:
                14,

              alignItems:
                'center',
            }}
          >
            <button
              type="button"
              onClick={() =>
                saveTaxiSelection(
                  parkingLots.map(
                    (
                      lot
                    ) =>
                      lot.id
                  )
                )
              }
            >
              全選
            </button>

            <button
              type="button"
              onClick={() =>
                saveTaxiSelection(
                  []
                )
              }
            >
              清除選取
            </button>

            <span className="muted">
              已選{' '}
              {
                taxiSelectedLots.length
              }{' '}
              場
            </span>
          </div>

          <div
            style={{
              display:
                'grid',

              gridTemplateColumns:
                'repeat(auto-fit,minmax(230px,1fr))',

              gap:
                8,

              marginTop:
                14,

              maxHeight:
                360,

              overflowY:
                'auto',
            }}
          >
            {parkingLots.map(
              (
                lot
              ) => (
                <label
                  key={
                    lot.id
                  }
                  style={{
                    display:
                      'flex',

                    gap:
                      8,

                    alignItems:
                      'center',

                    padding:
                      10,

                    border:
                      '1px solid #e5e7eb',

                    borderRadius:
                      8,

                    background:
                      taxiSelectedLots.includes(
                        lot.id
                      )
                        ? '#eff6ff'
                        : '#ffffff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      taxiSelectedLots.includes(
                        lot.id
                      )
                    }
                    onChange={() =>
                      toggleTaxiLot(
                        lot.id
                      )
                    }
                  />

                  <span>
                    {
                      lot.name
                    }
                  </span>
                </label>
              )
            )}
          </div>

          <div
            style={{
              display:
                'flex',

              gap:
                10,

              flexWrap:
                'wrap',

              marginTop:
                18,
            }}
          >
            <button
              type="button"
              className="btn"
              disabled={
                taxiDownloading ||
                taxiSelectedLots.length ===
                  0
              }
              onClick={
                downloadTaxiReports
              }
            >
              {taxiDownloading
                ? '報表製作中…'
                : taxiSelectedLots.length ===
                    1
                  ? '下載選取停車場 PDF'
                  : '下載選取場站 ZIP'}
            </button>

            <button
              type="button"
              disabled={
                taxiSharing ||
                taxiSelectedLots.length ===
                  0
              }
              onClick={
                shareTaxiReports
              }
              style={{
                padding:
                  '10px 16px',

                border:
                  '1px solid #16a34a',

                borderRadius:
                  8,

                background:
                  '#f0fdf4',

                color:
                  '#166534',

                fontWeight:
                  700,

                cursor:
                  'pointer',
              }}
            >
              {taxiSharing
                ? '準備分享中…'
                : '手機分享至 LINE'}
            </button>
          </div>

          <div
            className="muted"
            style={{
              marginTop:
                10,
            }}
          >
            選 1 場會產生單一 PDF；選多場會產生 ZIP。手機支援檔案分享時，可直接開啟系統分享選單後選擇 LINE。
          </div>
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
          {month} 簽到表上傳狀況
        </h2>

        <div
          style={{
            overflowX:
              'auto',
          }}
        >
          <table
            className="table"
            style={{
              minWidth:
                720,
            }}
          >
            <thead>
              <tr>
                <th>
                  停車場
                </th>

                <th>
                  檔名
                </th>

                <th>
                  上傳時間
                </th>
              </tr>
            </thead>

            <tbody>
              {attendanceRows.map(
                (
                  row
                ) => (
                  <tr
                    key={
                      row.id
                    }
                  >
                    <td>
                      {lotNameMap.get(
                        row.parking_lot_id
                      ) ||
                        '-'}
                    </td>

                    <td>
                      {
                        row.file_name
                      }
                    </td>

                    <td>
                      {new Date(
                        row.uploaded_at
                      ).toLocaleString(
                        'zh-TW'
                      )}
                    </td>
                  </tr>
                )
              )}

              {!loading &&
                attendanceRows.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={
                        3
                      }
                      style={{
                        textAlign:
                          'center',

                        padding:
                          24,
                      }}
                    >
                      本月份尚未上傳任何簽到表
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
          報表資料讀取中…
        </div>
      )}

      {message && (
        <div
          className="card"
          style={{
            marginTop:
              16,

            whiteSpace:
              'pre-wrap',
          }}
        >
          {
            message
          }
        </div>
      )}
    </div>
  )
}