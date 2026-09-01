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
  ).padStart(
    2,
    '0'
  )}`
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
  ).padStart(
    2,
    '0'
  )}`
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
    monthValue,
  ] =
    month
      .split('-')
      .map(Number)

  const date =
    new Date(
      year,
      monthValue,
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
    value || ''
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

function safeSheetName(
  value: string,
  fallback: string
) {
  return (
    String(
      value ||
        fallback
    )
      .replace(
        /[\\/*?:[\]]/g,
        '_'
      )
      .slice(
        0,
        31
      ) ||
    fallback
  )
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

      const nextIndex =
        (
          dailyCounters.get(
            entry.dateKey
          ) ||
          0
        ) + 1

      dailyCounters.set(
        entry.dateKey,
        nextIndex
      )

      return {
        dailyIndex:
          nextIndex,

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

  const makeCell = (
    text: string,
    tag:
      | 'th'
      | 'td' =
      'td'
  ) => {
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

  ;[
    '每日項次',
    '日期',
    '車牌',
    '進場時間',
    '離場時間',
    '銷單金額',
    '是否假日',
  ].forEach(
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

      ;[
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
      ].forEach(
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
   * 正式表預留空白列。
   */
  const minimumRows =
    32

  for (
    let i =
      rows.length;
    i <
    minimumRows;
    i++
  ) {
    const tr =
      document.createElement(
        'tr'
      )

    for (
      let c = 0;
      c < 7;
      c++
    ) {
      tr.appendChild(
        makeCell(
          c === 0
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
    document.body.removeChild(
      element
    )
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
      loadInitial()
    },
    []
  )

  useEffect(
    () => {
      if (
        !loading &&
        !accessDenied
      ) {
        loadMonthData()
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
            parsed
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

      setParkingLots(
        (
          lots ||
          []
        ) as ParkingLot[]
      )

      await loadMonthData()
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

  async function loadMonthData() {
    const start =
      monthStart(
        month
      )

    const next =
      nextMonthStart(
        month
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
      attendanceData ||
        []
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

    if (
      changeError
    ) {
      setMessage(
        `異動資料讀取失敗：${changeError.message}`
      )

      return
    }

    setChanges(
      changeData ||
        []
    )
  }

  const lotNameMap =
    useMemo(
      () =>
        new Map(
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
    new Set(
      attendanceRows.map(
        (
          row
        ) =>
          row.parking_lot_id
      )
    ).size

  const joinedCount =
    changes.filter(
      (
        row
      ) =>
        row.change_type ===
        'joined'
    ).length

  const cancelledCount =
    changes.filter(
      (
        row
      ) =>
        row.change_type ===
        'cancelled'
    ).length

  async function downloadAttendanceZip() {
    if (
      !attendanceRows.length ||
      attendanceDownloading
    ) {
      return
    }

    setAttendanceDownloading(
      true
    )

    setMessage(
      '正在建立簽到表 ZIP…'
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

      for (
        const row of
        attendanceRows
      ) {
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
            `${row.file_name} 下載失敗`
          )
        }

        const lotName =
          safeFileName(
            lotNameMap.get(
              row.parking_lot_id
            ) ||
              '未知停車場'
          )

        zip.file(
          `${lotName}/${safeFileName(
            row.file_name
          )}`,
          blob
        )
      }

      const blob =
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
        blob,
        `${month}_所有停車場_簽到表.zip`
      )

      setMessage(
        '簽到表 ZIP 已完成。'
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '簽到表下載失敗'
      )
    } finally {
      setAttendanceDownloading(
        false
      )
    }
  }

  async function downloadLatestMonthlyRentals() {
    if (
      rentalDownloading
    ) {
      return
    }

    setRentalDownloading(
      true
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

      if (
        error
      ) {
        throw error
      }

      const rows =
        (
          data ||
          []
        ).filter(
          (
            row: RentalRow
          ) =>
            row.rental_status !==
            'cancelled'
        )

      const XLSX =
        await import(
          'xlsx'
        )

      const wb =
        XLSX.utils.book_new()

      const mapRow = (
        row: RentalRow
      ) => ({
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
      })

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          rows.map(
            mapRow
          )
        ),
        '全部月租'
      )

      const used =
        new Set<string>([
          '全部月租',
        ])

      for (
        const lot of
        parkingLots
      ) {
        const lotRows =
          rows
            .filter(
              (
                row: RentalRow
              ) =>
                row.parking_lot_id ===
                lot.id
            )
            .map(
              mapRow
            )

        if (
          !lotRows.length
        ) {
          continue
        }

        let name =
          safeSheetName(
            lot.name,
            '停車場'
          )

        let n =
          2

        while (
          used.has(
            name
          )
        ) {
          name =
            `${safeSheetName(
              lot.name,
              '停車場'
            ).slice(
              0,
              28
            )}_${n}`

          n++
        }

        used.add(
          name
        )

        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            lotRows
          ),
          name
        )
      }

      const today =
        new Date()
          .toISOString()
          .slice(
            0,
            10
          )

      XLSX.writeFile(
        wb,
        `${today}_所有停車場_最新月租名單.xlsx`
      )

      setMessage(
        `最新月租名單已完成，共 ${rows.length} 筆。`
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
      !changes.length ||
      changeDownloading
    ) {
      return
    }

    setChangeDownloading(
      true
    )

    try {
      const XLSX =
        await import(
          'xlsx'
        )

      const wb =
        XLSX.utils.book_new()

      const mapRow = (
        row: ChangeRow
      ) => ({
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

        說明:
          row.change_detail ||
          '',
      })

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          changes.map(
            mapRow
          )
        ),
        '全部異動'
      )

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          changes
            .filter(
              (
                row
              ) =>
                row.change_type ===
                'joined'
            )
            .map(
              mapRow
            )
        ),
        '新增'
      )

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          changes
            .filter(
              (
                row
              ) =>
                row.change_type ===
                'cancelled'
            )
            .map(
              mapRow
            )
        ),
        '退租'
      )

      XLSX.writeFile(
        wb,
        `${month}_所有停車場_簽約異動.xlsx`
      )

      setMessage(
        '簽約異動 Excel 已完成。'
      )
    } catch (
      error: any
    ) {
      setMessage(
        `異動報表失敗：${error?.message || '未知錯誤'}`
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
    } else {
      saveTaxiSelection([
        ...taxiSelectedLots,
        lotId,
      ])
    }
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

    const next =
      new Date(
        Date.UTC(
          year,
          monthNumber,
          1
        )
      )

    const nextText =
      `${next.getUTCFullYear()}-${String(
        next.getUTCMonth() +
          1
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
          nextText
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
      !taxiSelectedLots.length
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
          lotId
        )

      const officialRows =
        buildTaxiOfficialRows(
          records
        )

      /*
       * 即使該月 0 筆，
       * 仍可以輸出一張空白正式月報。
       */
      const blob =
        await generateTaxiPdfBlob(
          lot.name,
          taxiMonth,
          officialRows
        )

      files.push({
        lotId,
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
        `已完成 ${files.length} 個停車場計程車月報 ZIP。`
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

        files.forEach(
          (
            item
          ) => {
            zip.file(
              item.fileName,
              item.blob
            )
          }
        )

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

      const nav =
        navigator as Navigator & {
          canShare?: (
            data: ShareData
          ) => boolean
        }

      if (
        !navigator.share
      ) {
        saveBlob(
          shareFile,
          shareFile.name
        )

        setMessage(
          '此瀏覽器不支援直接分享檔案，已改為下載；下載後可由 LINE 選擇檔案傳送。'
        )

        return
      }

      if (
        nav.canShare &&
        !nav.canShare({
          files: [
            shareFile,
          ],
        })
      ) {
        saveBlob(
          shareFile,
          shareFile.name
        )

        setMessage(
          '目前手機瀏覽器不支援分享此檔案格式，已改為下載。'
        )

        return
      }

      await navigator.share({
        title:
          `${taxiMonth} 計程車優惠月報`,

        text:
          `${taxiMonth} 計程車優惠月報`,

        files: [
          shareFile,
        ],
      })

      setMessage(
        '已開啟手機分享功能，可選擇 LINE 聊天室傳送。'
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
        統一處理會計及主管每月需要的報表。
      </p>

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
          <h2>
            每月簽到表
          </h2>

          <div
            style={{
              fontSize:
                28,
              fontWeight:
                800,
            }}
          >
            {
              attendanceRows.length
            }{' '}
            份
          </div>

          <div className="muted">
            {
              attendanceLotCount
            }{' '}
            個停車場
          </div>

          <button
            className="btn"
            type="button"
            style={{
              marginTop:
                14,
            }}
            disabled={
              attendanceDownloading ||
              !attendanceRows.length
            }
            onClick={
              downloadAttendanceZip
            }
          >
            {attendanceDownloading
              ? 'ZIP 建立中…'
              : '下載簽到表 ZIP'}
          </button>
        </div>

        <div className="card">
          <h2>
            最新月租名單
          </h2>

          <div className="muted">
            下載當下最新資料，不使用快照。
          </div>

          <button
            className="btn"
            type="button"
            style={{
              marginTop:
                14,
            }}
            disabled={
              rentalDownloading
            }
            onClick={
              downloadLatestMonthlyRentals
            }
          >
            {rentalDownloading
              ? 'Excel 製作中…'
              : '下載最新月租 Excel'}
          </button>
        </div>

        <div className="card">
          <h2>
            簽約異動
          </h2>

          <div>
            新增：
            <strong>
              {
                joinedCount
              }
            </strong>
            　退租：
            <strong>
              {
                cancelledCount
              }
            </strong>
          </div>

          <button
            className="btn"
            type="button"
            style={{
              marginTop:
                14,
            }}
            disabled={
              changeDownloading ||
              !changes.length
            }
            onClick={
              downloadContractChanges
            }
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
                主管專用。預設上個月，可自行勾選需要計程車報表的停車場。
              </div>
            </div>

            <div
              className="field"
              style={{
                minWidth:
                  200,
              }}
            >
              <label>
                報表月份
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
                16,
              padding:
                12,
              background:
                '#f0f9ff',
              color:
                '#075985',
              borderRadius:
                10,
            }}
          >
            平面停車場不需要計程車報表時不要勾選。系統會記住本機上次選擇，下個月不用重新一間一間選。
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

            <span
              className="muted"
              style={{
                alignSelf:
                  'center',
              }}
            >
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
                        : '#fff',
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
                !taxiSelectedLots.length
              }
              onClick={
                downloadTaxiReports
              }
            >
              {taxiDownloading
                ? 'PDF 製作中…'
                : taxiSelectedLots.length ===
                    1
                  ? '下載選取停車場 PDF'
                  : '下載選取場站 ZIP'}
            </button>

            <button
              type="button"
              disabled={
                taxiSharing ||
                !taxiSelectedLots.length
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
            選 1 場會產生單一 PDF；選多場會產生 ZIP。手機按「分享」後會開啟系統分享選單，可再選 LINE 與聊天對象。
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

              {!attendanceRows.length && (
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
                    本月份尚未上傳簽到表
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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