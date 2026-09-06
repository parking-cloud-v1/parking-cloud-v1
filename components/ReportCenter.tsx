'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

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
  const now = new Date()

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`
}

function previousMonthText() {
  const now = new Date()

  const date = new Date(
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
  ] = month
    .split('-')
    .map(Number)

  const date = new Date(
    year,
    monthNumber,
    1
  )

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, '0')}-01`
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

  return value || ''
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

  return value || ''
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
    value === 'expired'
  ) {
    return '已到期'
  }

  if (
    value === 'inactive'
  ) {
    return '停用'
  }

  return value || ''
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
  const now = new Date()

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

/*
 * 報表中心最新月租名單規則：
 *
 * 1. 已退租 cancelled：永遠不匯出。
 * 2. 到期超過 4 個月：不匯出。
 * 3. 最近 4 個月內到期：仍保留。
 * 4. 沒有到期日：保留，避免誤刪資料。
 *
 * 使用「今天往前推 4 個月」作為門檻。
 */
function fourMonthsAgoDateText() {
  const now = new Date()

  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth() - 4,
    now.getDate()
  )

  return `${cutoff.getFullYear()}-${String(
    cutoff.getMonth() + 1
  ).padStart(
    2,
    '0'
  )}-${String(
    cutoff.getDate()
  ).padStart(
    2,
    '0'
  )}`
}

function shouldIncludeRental(
  row: RentalRow
) {
  if (
    row.rental_status ===
    'cancelled'
  ) {
    return false
  }

  if (
    !row.end_date
  ) {
    return true
  }

  const cutoff =
    fourMonthsAgoDateText()

  /*
   * Supabase date 欄位為 YYYY-MM-DD，
   * 因此可直接做字串日期比較。
   *
   * 等於門檻日仍保留；
   * 只有早於門檻日才算「超過 4 個月」。
   */
  return (
    row.end_date >=
    cutoff
  )
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


type ContractArchiveRow = {
  id: string
  contract_id: string
  parking_lot_id: string
  contract_no: string
  customer_code: string | null
  customer_name: string
  vehicle_plate: string
  signed_at: string
  archived_at: string
}

type DengueRow = {
  id: string
  parking_lot_id: string
  work_date: string
  work_type: string
  file_kind?: 'photo' | 'report' | null
  storage_path: string
  file_name: string
  note: string | null
  uploaded_at: string
}

type DengueReportType =
  | '自主檢查'
  | '委外消毒'

function monthEndExclusive(month: string) {
  return nextMonthStart(month)
}

function timeStart(month: string) {
  return `${month}-01T00:00:00+08:00`
}

function timeNext(month: string) {
  return `${monthEndExclusive(month)}T00:00:00+08:00`
}

export default function ReportCenter() {
  const supabase = createClient()
  const db = supabase as any

  const [role, setRole] = useState<UserRole | null>(null)

  // 各報表月份分開控制，互不影響。
  const [contractMonth, setContractMonth] = useState(currentMonthText())
  const [taxiMonth, setTaxiMonth] = useState(currentMonthText())
  const [attendanceMonth, setAttendanceMonth] = useState(currentMonthText())
  const [rentalsMonth, setRentalsMonth] = useState(currentMonthText())
  const [dengueMonth, setDengueMonth] = useState(currentMonthText())
  const [dengueReportType, setDengueReportType] =
    useState<DengueReportType>('自主檢查')

  const [lotFilter, setLotFilter] = useState('all')
  const [parkingLots, setParkingLots] = useState<ParkingLot[]>([])
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([])
  const [contractRows, setContractRows] = useState<ContractArchiveRow[]>([])
  const [dengueRows, setDengueRows] = useState<DengueRow[]>([])
  const [disasterDate, setDisasterDate] = useState(localDateText())
  const [disasterCount, setDisasterCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    void loadInitial()
  }, [])

  useEffect(() => {
    if (!loading && !accessDenied) {
      void loadAttendanceData(attendanceMonth).catch((error: any) => {
        setMessage('簽到表月份讀取失敗：' + (error?.message || '未知錯誤'))
      })
    }
  }, [attendanceMonth, loading, accessDenied])

  useEffect(() => {
    if (!loading && !accessDenied) {
      void loadContractData(contractMonth).catch((error: any) => {
        setMessage('線上合約月份讀取失敗：' + (error?.message || '未知錯誤'))
      })
    }
  }, [contractMonth, loading, accessDenied])

  useEffect(() => {
    if (!loading && !accessDenied) {
      void loadDengueData(dengueMonth).catch((error: any) => {
        setMessage('登革熱消毒月份讀取失敗：' + (error?.message || '未知錯誤'))
      })
    }
  }, [dengueMonth, loading, accessDenied])

  useEffect(() => {
    if (!loading && !accessDenied && disasterDate) {
      void loadDisasterCount(disasterDate)
    }
  }, [disasterDate, loading, accessDenied])

  const lotNameMap = useMemo(
    () => new Map(parkingLots.map((lot) => [lot.id, lot.name])),
    [parkingLots]
  )

  const filteredAttendance = useMemo(
    () => attendanceRows.filter((x) => lotFilter === 'all' || x.parking_lot_id === lotFilter),
    [attendanceRows, lotFilter]
  )

  const filteredContracts = useMemo(
    () => contractRows.filter((x) => lotFilter === 'all' || x.parking_lot_id === lotFilter),
    [contractRows, lotFilter]
  )

  const filteredDengueReports = useMemo(
    () =>
      dengueRows.filter(
        (row) =>
          row.file_kind === 'report' &&
          row.work_type === dengueReportType &&
          (
            lotFilter === 'all' ||
            row.parking_lot_id === lotFilter
          )
      ),
    [
      dengueRows,
      dengueReportType,
      lotFilter,
    ]
  )

  async function loadInitial() {
    setLoading(true)
    setMessage('')

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setAccessDenied(true)
        setMessage('登入狀態失效，請重新登入。')
        return
      }

      const { data: profile, error: profileError } = await db
        .from('profiles')
        .select('role,is_active')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) throw profileError

      if (!profile?.is_active || !['supervisor', 'accountant'].includes(profile.role)) {
        setAccessDenied(true)
        setMessage('此帳號沒有報表中心權限。')
        return
      }

      setRole(profile.role)

      const { data: lots, error } = await db
        .from('parking_lots')
        .select('id,name')
        .eq('status', 'active')
        .order('name')

      if (error) throw error

      setParkingLots((lots || []) as ParkingLot[])

      await Promise.all([
        loadAttendanceData(attendanceMonth),
        loadContractData(contractMonth),
        loadDengueData(dengueMonth),
        loadDisasterCount(disasterDate),
      ])
    } catch (error: any) {
      setMessage('報表中心載入失敗：' + (error?.message || '未知錯誤'))
    } finally {
      setLoading(false)
    }
  }

  async function loadAttendanceData(targetMonth: string) {
    const start = monthStart(targetMonth)

    const { data, error } = await db
      .from('monthly_attendance_sheets')
      .select('id,parking_lot_id,attendance_month,storage_path,file_name,uploaded_at')
      .eq('attendance_month', start)
      .order('uploaded_at', { ascending: false })

    if (error) {
      throw new Error('簽到表讀取失敗：' + error.message)
    }

    setAttendanceRows((data || []) as AttendanceRow[])
  }

  async function loadContractData(targetMonth: string) {
    const { data, error } = await db
      .from('signed_contract_archives')
      .select('id,contract_id,parking_lot_id,contract_no,customer_code,customer_name,vehicle_plate,signed_at,archived_at')
      .gte('signed_at', timeStart(targetMonth))
      .lt('signed_at', timeNext(targetMonth))
      .order('signed_at', { ascending: false })

    if (error) {
      throw new Error('線上合約讀取失敗：' + error.message)
    }

    setContractRows((data || []) as ContractArchiveRow[])
  }

  async function loadDengueData(targetMonth: string) {
    const start = monthStart(targetMonth)
    const next = nextMonthStart(targetMonth)

    const { data, error } = await db
      .from('dengue_prevention_photos')
      .select('id,parking_lot_id,work_date,work_type,file_kind,storage_path,file_name,note,uploaded_at')
      .gte('work_date', start)
      .lt('work_date', next)
      .order('work_date', { ascending: false })
      .order('uploaded_at', { ascending: false })

    if (error) {
      throw new Error('登革熱消毒資料讀取失敗：' + error.message)
    }

    setDengueRows((data || []) as DengueRow[])
  }

  async function loadDisasterCount(date: string) {
    const { count, error } = await db
      .from('disaster_inspections')
      .select('id', { count: 'exact', head: true })
      .eq('inspection_date', date)

    if (error) {
      setDisasterCount(0)
      return
    }

    setDisasterCount(count || 0)
  }

  function save(blob: Blob, filename: string) {
    saveBlob(blob, filename)
  }

  async function downloadAttendanceZip() {
    if (!filteredAttendance.length) {
      return setMessage(`${attendanceMonth} 沒有符合條件的簽到表。`)
    }

    setBusy('attendance')
    setMessage(`正在整理 ${attendanceMonth} 月份簽到表…`)

    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      for (const row of filteredAttendance) {
        const { data, error } = await supabase.storage
          .from('monthly-attendance')
          .download(row.storage_path)

        if (error || !data) {
          throw new Error(`${row.file_name} 下載失敗：${error?.message || '未知錯誤'}`)
        }

        const lot = safeFileName(lotNameMap.get(row.parking_lot_id) || '未知停車場')
        const uploadedStamp = new Date(row.uploaded_at)
          .toISOString()
          .replace(/[-:]/g, '')
          .replace(/\.\d{3}Z$/, 'Z')

        zip.file(`${lot}/${uploadedStamp}_${safeFileName(row.file_name)}`, data)
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      })

      save(
        blob,
        `${attendanceMonth}_${lotFilter === 'all' ? '所有停車場' : safeFileName(lotNameMap.get(lotFilter) || '停車場')}_月份簽到表.zip`
      )

      setMessage(`${attendanceMonth} 簽到表下載完成，共 ${filteredAttendance.length} 份。`)
    } catch (error: any) {
      setMessage('簽到表下載失敗：' + (error?.message || '未知錯誤'))
    } finally {
      setBusy('')
    }
  }

  async function downloadMonthlyRentals() {
    setBusy('rentals')
    setMessage(`正在製作 ${rentalsMonth} 月份月租總表…`)

    try {
      const start = monthStart(rentalsMonth)
      const next = nextMonthStart(rentalsMonth)

      let query = db
        .from('monthly_rentals')
        .select('id,parking_lot_id,customer_code,customer_name,phone,vehicle_plate,vehicle_type,rental_type,start_date,end_date,monthly_fee,payment_status,payment_date,invoice_number,rental_status,notes,updated_at')
        .lt('start_date', next)
        .gte('end_date', start)
        .neq('rental_status', 'cancelled')
        .order('parking_lot_id')
        .order('customer_name')

      if (lotFilter !== 'all') {
        query = query.eq('parking_lot_id', lotFilter)
      }

      const { data, error } = await query
      if (error) throw error

      const rows = (data || []) as RentalRow[]

      if (!rows.length) {
        setMessage(`${rentalsMonth} 沒有符合條件的月租資料。`)
        return
      }

      const XLSX = await import('xlsx')
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      let lotCount = 0

      for (const lot of parkingLots.filter((x) => lotFilter === 'all' || x.id === lotFilter)) {
        const lotRows = rows.filter((x) => x.parking_lot_id === lot.id)
        if (!lotRows.length) continue

        const excelRows = lotRows.map((row) => ({
          停車場: lot.name,
          客戶編號: row.customer_code || '',
          姓名: row.customer_name || '',
          電話: row.phone || '',
          車牌: row.vehicle_plate || '',
          車種: vehicleTypeText(row.vehicle_type),
          月租類型: row.rental_type || '',
          起租日: row.start_date || '',
          到期日: row.end_date || '',
          月租金額: Number(row.monthly_fee || 0),
          付款狀態: paymentStatusText(row.payment_status),
          付款日期: row.payment_date || '',
          發票號碼: row.invoice_number || '',
          租用狀態: rentalStatusText(row.rental_status),
          備註: row.notes || '',
        }))

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.json_to_sheet(excelRows)
        ws['!cols'] = [
          { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
          { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
          { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 28 },
        ]

        XLSX.utils.book_append_sheet(wb, ws, '月租總表')

        const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

        zip.file(
          `${safeFileName(lot.name)}_${rentalsMonth}_月租總表.xlsx`,
          new Blob([arr], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
        )

        lotCount++
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      })

      save(blob, `${rentalsMonth}_月份月租總表_${lotCount}場.zip`)
      setMessage(`${rentalsMonth} 月份月租總表完成，共 ${rows.length} 筆、${lotCount} 個停車場。`)
    } catch (error: any) {
      setMessage('月租總表下載失敗：' + (error?.message || '未知錯誤'))
    } finally {
      setBusy('')
    }
  }

  async function loadTaxiRecords(lotId: string, targetMonth: string) {
    const { data, error } = await db
      .from('taxi_discount_records')
      .select('id,parking_lot_id,vehicle_plate,entry_time,exit_time,discount_amount,used_free_discount,discount_date,is_holiday')
      .eq('parking_lot_id', lotId)
      .gte('entry_time', timeStart(targetMonth))
      .lt('entry_time', timeNext(targetMonth))
      .order('entry_time', { ascending: true })

    if (error) throw error
    return (data || []) as TaxiRecord[]
  }

  async function downloadTaxiReports() {
    setBusy('taxi')
    setMessage(`正在製作 ${taxiMonth} 計程車折扣月報…`)

    try {
      const targetLots = parkingLots.filter((x) => lotFilter === 'all' || x.id === lotFilter)
      const files: { name: string; blob: Blob }[] = []

      for (const lot of targetLots) {
        const records = await loadTaxiRecords(lot.id, taxiMonth)
        if (!records.length) continue

        const official = buildTaxiOfficialRows(records)
        const blob = await generateTaxiPdfBlob(lot.name, taxiMonth, official)

        files.push({
          name: `${safeFileName(lot.name)}_${taxiMonth}_計程車折扣報表.pdf`,
          blob,
        })
      }

      if (!files.length) {
        setMessage(`${taxiMonth} 沒有符合條件的計程車折扣資料。`)
        return
      }

      if (files.length === 1) {
        save(files[0].blob, files[0].name)
        setMessage(`${taxiMonth} 計程車折扣報表下載完成。`)
        return
      }

      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      files.forEach((file) => zip.file(file.name, file.blob))

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      })

      save(blob, `${taxiMonth}_計程車折扣月報_${files.length}場.zip`)
      setMessage(`${taxiMonth} 計程車折扣月報完成，共 ${files.length} 個停車場。`)
    } catch (error: any) {
      setMessage('計程車折扣報表失敗：' + (error?.message || '未知錯誤'))
    } finally {
      setBusy('')
    }
  }

  async function downloadDengueReportsZip() {
    if (!filteredDengueReports.length) {
      return setMessage(
        `${dengueMonth} 沒有符合條件的「${dengueReportType}」報表。`
      )
    }

    setBusy('dengue')
    setMessage(
      `正在整理 ${dengueMonth}「${dengueReportType}」報表…`
    )

    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      for (
        const row of
        filteredDengueReports
      ) {
        const { data, error } =
          await supabase.storage
            .from('dengue-prevention')
            .download(row.storage_path)

        if (error || !data) {
          throw new Error(
            `${row.file_name} 下載失敗：${
              error?.message ||
              '未知錯誤'
            }`
          )
        }

        const lot =
          safeFileName(
            lotNameMap.get(
              row.parking_lot_id
            ) ||
              '未知停車場'
          )

        zip.file(
          `${lot}/${row.work_date}_${safeFileName(
            row.work_type
          )}/${safeFileName(
            row.file_name
          )}`,
          data
        )
      }

      const blob =
        await zip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: {
            level: 6,
          },
        })

      save(
        blob,
        `${dengueMonth}_${safeFileName(
          dengueReportType
        )}_登革熱消毒報表_${filteredDengueReports.length}份.zip`
      )

      setMessage(
        `${dengueMonth}「${dengueReportType}」報表下載完成，共 ${filteredDengueReports.length} 份。`
      )
    } catch (error: any) {
      setMessage(
        '登革熱消毒報表下載失敗：' +
          (
            error?.message ||
            '未知錯誤'
          )
      )
    } finally {
      setBusy('')
    }
  }

  async function downloadContractArchivesZip() {
    if (!filteredContracts.length) {
      return setMessage(`${contractMonth} 沒有符合條件的已簽線上合約。`)
    }

    setBusy('contracts')
    setMessage(`正在整理 ${contractMonth} 線上合約正式留存檔…`)

    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      for (const row of filteredContracts) {
        const response = await fetch(
          `/api/admin/online-contracts/archive/${row.contract_id}`,
          { cache: 'no-store' }
        )

        if (!response.ok) {
          throw new Error(`${row.contract_no} 下載失敗`)
        }

        const blob = await response.blob()
        const lot = safeFileName(lotNameMap.get(row.parking_lot_id) || '未知停車場')
        zip.file(`${lot}/${safeFileName(row.contract_no)}_正式留存.html`, blob)
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      })

      save(blob, `${contractMonth}_線上合約正式留存_${filteredContracts.length}份.zip`)
      setMessage(`${contractMonth} 線上合約下載完成，共 ${filteredContracts.length} 份。`)
    } catch (error: any) {
      setMessage('線上合約批次下載失敗：' + (error?.message || '未知錯誤'))
    } finally {
      setBusy('')
    }
  }

  function downloadDisaster() {
    if (!disasterDate) {
      return setMessage('請選擇防災檢查日期。')
    }

    if (!disasterCount) {
      return setMessage(`${disasterDate} 沒有防災檢查資料。`)
    }

    window.location.href = `/dashboard/reports/disaster-batch?date=${encodeURIComponent(disasterDate)}&download=1`
  }

  if (loading) {
    return <div className="card">報表中心載入中…</div>
  }

  if (accessDenied) {
    return (
      <div className="card" style={{ color: '#b91c1c' }}>
        {message || '無報表中心權限。'}
      </div>
    )
  }

  const Card = ({
    icon,
    title,
    desc,
    count,
    children,
  }: {
    icon: string
    title: string
    desc: string
    count?: string | number
    children: any
  }) => (
    <section
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        background: '#fff',
        padding: 20,
        boxShadow: '0 8px 24px rgba(15,23,42,.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#eff6ff',
              color: '#1d4ed8',
              fontWeight: 900,
            }}
          >
            {icon}
          </div>

          <div>
            <h2 style={{ margin: '0 0 5px', fontSize: 19 }}>{title}</h2>
            <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>{desc}</div>
          </div>
        </div>

        {count !== undefined && (
          <div style={{ fontWeight: 900, fontSize: 20 }}>{count}</div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  )

  const MonthPicker = ({
    label,
    value,
    onChange,
  }: {
    label: string
    value: string
    onChange: (value: string) => void
  }) => (
    <div className="field" style={{ flex: '1 1 170px', margin: 0 }}>
      <label>{label}</label>
      <input
        type="month"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )

  return (
    <div style={{ paddingBottom: 40 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: '#2563eb', fontWeight: 900 }}>
            智驛科技有限公司
          </div>
          <h1 style={{ margin: '5px 0 6px', fontSize: 32 }}>報表中心</h1>
          <p className="muted" style={{ margin: 0 }}>
            公司報表集中下載。每一種月報可各自指定下載月份。
            {role === 'accountant'
              ? '會計帳號只會看到此介面，不會進入現場作業。'
              : '主管可跨場彙整與下載。'}
          </p>
        </div>

        <div
          style={{
            padding: '8px 12px',
            borderRadius: 999,
            background: '#f1f5f9',
            fontWeight: 800,
          }}
        >
          {role === 'accountant' ? '會計唯讀' : '主管'}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20, padding: 18 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))',
            gap: 12,
          }}
        >
          <div className="field">
            <label>停車場</label>
            <select value={lotFilter} onChange={(event) => setLotFilter(event.target.value)}>
              <option value="all">全部停車場</option>
              {parkingLots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>線上合約月份</label>
            <input
              type="month"
              value={contractMonth}
              onChange={(event) => setContractMonth(event.target.value)}
            />
          </div>
        </div>
      </div>

      {message && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background: message.includes('失敗') ? '#fef2f2' : '#f0fdf4',
            color: message.includes('失敗') ? '#b91c1c' : '#166534',
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))',
          gap: 16,
          marginTop: 18,
        }}
      >
        <Card
          icon="防"
          title="防災檢查｜當日一鍵下載"
          desc="選擇日期後，將當日所有停車場的正式防災檢查合併為一個 PDF。"
          count={`${disasterCount} 份`}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 180px' }}>
              <label>檢查日期</label>
              <input
                type="date"
                value={disasterDate}
                onChange={(event) => setDisasterDate(event.target.value)}
              />
            </div>
            <button
              className="btn"
              type="button"
              onClick={downloadDisaster}
              disabled={!disasterCount}
            >
              下載當日全部 PDF
            </button>
          </div>
        </Card>

        <Card
          icon="計"
          title="計程車折扣｜一鍵下載"
          desc="指定月份後輸出正式計程車折扣月報；全部停車場時自動整理成 ZIP。"
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <MonthPicker label="下載月份" value={taxiMonth} onChange={setTaxiMonth} />
            <button className="btn" type="button" disabled={!!busy} onClick={downloadTaxiReports}>
              {busy === 'taxi' ? '製作中…' : `下載 ${taxiMonth} 月報`}
            </button>
          </div>
        </Card>

        <Card
          icon="簽"
          title="月份簽到表｜一鍵下載"
          desc="指定月份後下載現場所有人上傳的簽到表，同場同月可保留多份。"
          count={`${filteredAttendance.length} 份`}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <MonthPicker
              label="下載月份"
              value={attendanceMonth}
              onChange={setAttendanceMonth}
            />
            <button
              className="btn"
              type="button"
              disabled={!!busy || !filteredAttendance.length}
              onClick={downloadAttendanceZip}
            >
              {busy === 'attendance' ? '整理中…' : `下載 ${attendanceMonth} 簽到表`}
            </button>
          </div>
        </Card>

        <Card
          icon="月"
          title="月份月租總表｜一鍵下載"
          desc="指定月份後，抓出該月租期有重疊且非退租的月租戶，各場產生 Excel 後合併 ZIP。"
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <MonthPicker label="下載月份" value={rentalsMonth} onChange={setRentalsMonth} />
            <button
              className="btn"
              type="button"
              disabled={!!busy}
              onClick={downloadMonthlyRentals}
            >
              {busy === 'rentals' ? '製作中…' : `下載 ${rentalsMonth} 月租總表`}
            </button>
          </div>
        </Card>

        <Card
          icon="約"
          title="線上合約書｜查看與下載"
          desc="查看上方所選月份已完成簽署的電子契約，也可一次下載正式封存留存檔。"
          count={`${filteredContracts.length} 份`}
        >
          <button
            className="btn"
            type="button"
            disabled={!!busy || !filteredContracts.length}
            onClick={downloadContractArchivesZip}
          >
            {busy === 'contracts' ? '整理中…' : `下載 ${contractMonth} 全部合約 ZIP`}
          </button>
        </Card>

        {role === 'supervisor' && (
          <Card
          icon="登"
          title="登革熱消毒報表｜一鍵下載"
          desc="主管可依月份與類型下載現場上傳的正式報表；類型只保留自主檢查與委外消毒。"
          count={`${filteredDengueReports.length} 份`}
        >
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'end',
              flexWrap: 'wrap',
            }}
          >
            <MonthPicker
              label="下載月份"
              value={dengueMonth}
              onChange={setDengueMonth}
            />

            <div
              className="field"
              style={{
                flex: '1 1 170px',
                margin: 0,
              }}
            >
              <label>報表類型</label>
              <select
                value={dengueReportType}
                onChange={(event) =>
                  setDengueReportType(
                    event.target
                      .value as DengueReportType
                  )
                }
              >
                <option value="自主檢查">
                  自主檢查
                </option>
                <option value="委外消毒">
                  委外消毒
                </option>
              </select>
            </div>

            <button
              className="btn"
              type="button"
              disabled={
                !!busy ||
                !filteredDengueReports.length
              }
              onClick={
                downloadDengueReportsZip
              }
            >
              {busy === 'dengue'
                ? '整理中…'
                : `下載 ${dengueReportType}`}
            </button>
          </div>
          </Card>
        )}
      </div>

      <div className="card" style={{ marginTop: 20, padding: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ margin: '0 0 5px' }}>已簽線上合約</h2>
            <div className="muted">
              {contractMonth}｜可直接查看唯讀內容或下載正式留存檔
            </div>
          </div>
          <span style={{ fontWeight: 900 }}>{filteredContracts.length} 份</span>
        </div>

        {!filteredContracts.length ? (
          <div style={{ padding: '20px 0', color: '#64748b' }}>
            本月目前沒有已簽署線上合約。
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>停車場</th>
                  <th>契約編號</th>
                  <th>客戶編號</th>
                  <th>姓名</th>
                  <th>車牌</th>
                  <th>簽署時間</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ padding: 9 }}>{lotNameMap.get(row.parking_lot_id) || '-'}</td>
                    <td style={{ padding: 9, fontWeight: 800 }}>{row.contract_no}</td>
                    <td style={{ padding: 9 }}>{row.customer_code || '-'}</td>
                    <td style={{ padding: 9 }}>{row.customer_name}</td>
                    <td style={{ padding: 9 }}>{row.vehicle_plate}</td>
                    <td style={{ padding: 9 }}>
                      {new Date(row.signed_at).toLocaleString('zh-TW')}
                    </td>
                    <td style={{ padding: 9, whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/dashboard/reports/contracts/${row.contract_id}`}
                        style={{ marginRight: 12 }}
                      >
                        查看
                      </Link>
                      <a href={`/api/admin/online-contracts/archive/${row.contract_id}`}>
                        下載
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
