import JSZip from 'jszip'
import * as XLSX from 'xlsx'

export type ReportCategory =
  | 'attendance'
  | 'rentals'
  | 'changes'
  | 'taxi'
  | 'shift'
  | 'disaster'
  | 'dengue'

export type LotRow = { id: string; name: string }

export type ExportItem = {
  category: ReportCategory
  parkingLotId: string
  parkingLotName: string
  sourceKey: string
  fileName: string
  mimeType: string
  bucket?: string
  path?: string
  content?: string
  bytes?: ArrayBuffer
}

export const REPORT_CATEGORIES: ReportCategory[] = [
  'attendance',
  'rentals',
  'changes',
  'taxi',
  'shift',
  'disaster',
  'dengue',
]

export const REPORT_CATEGORY_META: Record<
  ReportCategory,
  { label: string; note: string; sourceHref: string; backupButton: string }
> = {
  attendance: {
    label: '每月簽到表',
    note: '直接使用現場上傳的原始簽到檔，不重新產生另一種格式。',
    sourceHref: '/dashboard/monthly-attendance',
    backupButton: '下載 ZIP',
  },
  rentals: {
    label: '月租總表',
    note: '欄位與月租管理的「Excel 匯出」一致；以各場目前正式租期與最近繳費月份整理。',
    sourceHref: '/dashboard/monthly-rentals',
    backupButton: '下載 Excel ZIP',
  },
  changes: {
    label: '月租簽約異動',
    note: '欄位、異動類型與來源文字跟現場「匯出會計異動 Excel」一致。',
    sourceHref: '/dashboard/monthly-rentals/changes',
    backupButton: '下載 Excel ZIP',
  },
  taxi: {
    label: '計程車優惠報表',
    note: '沿用現場「新北市政府交通局計程車免費停車統計表」格式；每場各一份。',
    sourceHref: '/dashboard/taxi-discounts',
    backupButton: '下載 Excel ZIP',
  },
  shift: {
    label: '當日結班報表',
    note: 'Drive 依月份彙整各場結班資料；單筆明細與匯款週期仍以現場結班頁為準。',
    sourceHref: '/dashboard/shift-closing',
    backupButton: '下載 Excel ZIP',
  },
  disaster: {
    label: '防災檢查',
    note: '直接使用現場已產生的正式 PDF，不重新排版。',
    sourceHref: '/dashboard/disaster-inspections',
    backupButton: '下載 PDF ZIP',
  },
  dengue: {
    label: '登革熱消毒作業',
    note: '跟現場一致：同一停車場、同一天整理成一個 ZIP，內含自主檢查／委外消毒照片與報表。',
    sourceHref: '/dashboard/dengue-photos',
    backupButton: '下載每日資料夾 ZIP',
  },
}

export function safeName(value: unknown) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
}

function monthStart(month: string) {
  return `${month}-01`
}

function nextMonthStart(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

function fourMonthsAgoDate() {
  const date = new Date()
  date.setMonth(date.getMonth() - 4)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

function cleanRentalType(value?: string | null) {
  if (!value) return '-'
  const source = String(value).trim().replace(/,+/g, '').replace(/\s+/g, ' ').trim()
  if (source.includes('老師汽車單月')) return '老師汽車單月'
  if (source.includes('老師') && source.includes('機車')) return '老師機車'
  if (source.includes('重機')) return '重機'
  if (source.includes('身障')) return '身障'
  if (source.includes('里民')) return '里民'
  if (source.includes('一般')) return '一般'
  if (source.includes('機車')) return '機車'
  return source || '-'
}

function vehicleTypeText(value: string) {
  if (value === 'car') return '汽車'
  if (value === 'motorcycle') return '機車'
  if (value === 'heavy_motorcycle') return '重機'
  return value || ''
}

function changeTypeText(value: string) {
  if (value === 'joined') return '新增'
  if (value === 'cancelled') return '退租'
  if (value === 'updated') return '資料異動'
  return value || ''
}

function sourceText(value: string) {
  if (value === 'legacy_import') return '總表匯入'
  if (value === 'monthly_rentals') return '月租管理'
  if (value === 'annual_roster') return '年度抽籤'
  return value || ''
}

function latestPaymentMonth(months: string[]) {
  const values = Array.from(
    new Set(months.map((value) => String(value || '').slice(0, 7)).filter(Boolean))
  ).sort()
  return values.length ? values[values.length - 1] : '-'
}

function groupByLot(rows: any[]) {
  const map = new Map<string, any[]>()
  for (const row of rows || []) {
    const id = String(row?.parking_lot_id || '')
    if (!id) continue
    if (!map.has(id)) map.set(id, [])
    map.get(id)!.push(row)
  }
  return map
}

function normalizedArrayBuffer(value: ArrayBuffer | Uint8Array) {
  if (value instanceof ArrayBuffer) return value
  const buffer = new ArrayBuffer(value.byteLength)
  new Uint8Array(buffer).set(value)
  return buffer
}

function workbookBytes(
  rows: Record<string, unknown>[],
  sheetName: string,
  widths?: number[]
) {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  if (widths?.length) {
    worksheet['!cols'] = widths.map((wch) => ({ wch }))
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  const result = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | Uint8Array
  return normalizedArrayBuffer(result)
}

function dengueFolder(row: any) {
  const workType = row.work_type === '委外消毒' ? '委外消毒' : '自主檢查'
  const kind = row.file_kind === 'report' ? '報表' : '照片'
  return `${workType}/${kind}`
}

export async function itemBytes(db: any, item: ExportItem) {
  if (item.bytes) return item.bytes

  if (typeof item.content === 'string') {
    const encoded = new TextEncoder().encode(item.content)
    return normalizedArrayBuffer(encoded)
  }

  if (!item.bucket || !item.path) throw new Error('缺少 Storage 檔案位置')
  const { data: blob, error } = await db.storage.from(item.bucket).download(item.path)
  if (error || !blob) throw new Error(error?.message || 'Storage 下載失敗')
  return blob.arrayBuffer()
}

export async function collectReportItems(
  db: any,
  category: ReportCategory,
  month: string,
  lots: LotRow[]
): Promise<ExportItem[]> {
  const start = monthStart(month)
  const next = nextMonthStart(month)
  const lotMap = new Map(lots.map((lot) => [String(lot.id), lot.name]))
  const allowed = new Set(lots.map((lot) => String(lot.id)))
  const items: ExportItem[] = []

  if (category === 'attendance') {
    const { data, error } = await db
      .from('monthly_attendance_sheets')
      .select('id,parking_lot_id,attendance_month,storage_path,file_name,mime_type,uploaded_at')
      .eq('attendance_month', start)
      .order('uploaded_at')
    if (error) throw new Error(error.message)

    for (const row of data || []) {
      const lotId = String(row.parking_lot_id || '')
      if (!allowed.has(lotId) || !row.storage_path) continue
      const lotName = lotMap.get(lotId) || '未知停車場'
      items.push({
        category,
        parkingLotId: lotId,
        parkingLotName: lotName,
        sourceKey: `attendance:${row.id}`,
        fileName: `${month}_${safeName(lotName)}_簽到表_${safeName(row.file_name)}`,
        mimeType: row.mime_type || 'application/octet-stream',
        bucket: 'monthly-attendance',
        path: row.storage_path,
      })
    }
    return items
  }

  if (category === 'disaster') {
    const { data, error } = await db
      .from('disaster_inspections')
      .select('id,parking_lot_id,inspection_date,pdf_path,pdf_file_name,pdf_generated_at')
      .not('pdf_path', 'is', null)
      .gte('inspection_date', start)
      .lt('inspection_date', next)
      .order('inspection_date')
    if (error) throw new Error(error.message)

    for (const row of data || []) {
      const lotId = String(row.parking_lot_id || '')
      if (!allowed.has(lotId) || !row.pdf_path) continue
      const lotName = lotMap.get(lotId) || '未知停車場'
      items.push({
        category,
        parkingLotId: lotId,
        parkingLotName: lotName,
        sourceKey: `disaster:${row.id}:pdf`,
        fileName: safeName(
          row.pdf_file_name || `${lotName}_${row.inspection_date}_防災自主檢查表.pdf`
        ),
        mimeType: 'application/pdf',
        bucket: 'disaster-inspection-pdfs',
        path: row.pdf_path,
      })
    }
    return items
  }

  if (category === 'dengue') {
    const { data, error } = await db
      .from('dengue_prevention_photos')
      .select(
        'id,parking_lot_id,work_date,work_type,file_kind,storage_path,file_name,mime_type,uploaded_at'
      )
      .gte('work_date', start)
      .lt('work_date', next)
      .order('parking_lot_id')
      .order('work_date')
      .order('uploaded_at')
    if (error) throw new Error(error.message)

    const grouped = new Map<string, any[]>()
    for (const row of data || []) {
      const lotId = String(row.parking_lot_id || '')
      if (!allowed.has(lotId) || !row.storage_path) continue
      const key = `${lotId}::${row.work_date}`
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(row)
    }

    for (const [key, rows] of grouped.entries()) {
      const [lotId, date] = key.split('::')
      const lotName = lotMap.get(lotId) || '未知停車場'
      const rootFolder = `${date}_${safeName(lotName)}_登革熱消毒`
      const zip = new JSZip()
      let added = 0
      const failures: string[] = []

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index]
        try {
          const { data: blob, error: downloadError } = await db.storage
            .from('dengue-prevention')
            .download(row.storage_path)
          if (downloadError || !blob) {
            throw new Error(downloadError?.message || 'Storage 下載失敗')
          }
          const originalName = safeName(row.file_name || `file_${index + 1}`)
          zip.file(
            `${rootFolder}/${dengueFolder(row)}/${String(index + 1).padStart(2, '0')}_${originalName}`,
            await blob.arrayBuffer()
          )
          added++
        } catch (error: any) {
          failures.push(`${row.file_name || row.id}：${error?.message || '下載失敗'}`)
        }
      }

      if (!added) continue
      if (failures.length) {
        zip.file(`${rootFolder}/下載失敗清單.txt`, failures.join('\r\n'))
      }

      const generated = await zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      })

      items.push({
        category,
        parkingLotId: lotId,
        parkingLotName: lotName,
        sourceKey: `dengue-daily:${lotId}:${date}`,
        fileName: `${date}_${safeName(lotName)}_登革熱消毒.zip`,
        mimeType: 'application/zip',
        bytes: normalizedArrayBuffer(generated),
      })
    }
    return items
  }

  if (category === 'rentals') {
    const { data, error } = await db
      .from('monthly_rentals')
      .select(`
        id,parking_lot_id,customer_code,customer_name,phone,vehicle_plate,vehicle_type,
        rental_type,start_date,end_date,data_source,monthly_fee,payment_status,payment_date,
        invoice_number,rental_status,notes,updated_at
      `)
      .neq('rental_status', 'cancelled')
      .or(`end_date.is.null,end_date.gte.${fourMonthsAgoDate()}`)
      .order('parking_lot_id')
      .order('customer_code', { ascending: true, nullsFirst: false })
      .order('customer_name')
    if (error) throw new Error(error.message)

    const scopedRows = (data || []).filter((row: any) =>
      allowed.has(String(row.parking_lot_id || ''))
    )
    const rentalIds = scopedRows.map((row: any) => row.id).filter(Boolean)

    let paymentRows: any[] = []
    if (rentalIds.length) {
      const { data: paid, error: paymentError } = await db
        .from('monthly_rental_payment_months')
        .select('monthly_rental_id,coverage_month')
        .in('monthly_rental_id', rentalIds)
        .order('coverage_month', { ascending: true })
      if (paymentError) throw new Error(paymentError.message)
      paymentRows = paid || []
    }

    const paymentMap = new Map<string, string[]>()
    for (const row of paymentRows) {
      const key = String(row.monthly_rental_id || '')
      const values = paymentMap.get(key) || []
      values.push(String(row.coverage_month || ''))
      paymentMap.set(key, values)
    }

    const { data: termRows, error: termError } = await db
      .from('parking_lot_rental_terms')
      .select('parking_lot_id,term_name,start_date,end_date')
      .eq('is_active', true)
      .in('parking_lot_id', lots.map((lot) => lot.id))
    if (termError) throw new Error(termError.message)
    const termMap = new Map((termRows || []).map((row: any) => [String(row.parking_lot_id), row]))

    const grouped = groupByLot(scopedRows)
    for (const lot of lots) {
      const term = termMap.get(String(lot.id))
      const rows = (grouped.get(String(lot.id)) || []).map((row: any) => ({
        客戶編號: row.customer_code || '',
        姓名: row.customer_name || '',
        電話: row.phone || '',
        車牌: row.vehicle_plate || '',
        車種: row.vehicle_type || '',
        月租類型: cleanRentalType(row.rental_type),
        租期開始: term?.start_date || '',
        租期結束: term?.end_date || '',
        繳費月份: latestPaymentMonth(paymentMap.get(String(row.id)) || []),
        月租金額: Number(row.monthly_fee || 0),
        最近收款日期: row.payment_date || '',
        發票號碼: row.invoice_number || '',
        月租狀態: row.rental_status || '',
        資料來源: row.data_source || '',
        備註: row.notes || '',
      }))

      // 現場按鈕沒有資料時不匯出；報表中心也遵守同一規則，不建立假空表。
      if (!rows.length) continue

      items.push({
        category,
        parkingLotId: String(lot.id),
        parkingLotName: lot.name,
        sourceKey: `rentals:${lot.id}`,
        fileName: `${safeName(lot.name)}_月租總表.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        bytes: workbookBytes(rows, '月租總表'),
      })
    }
    return items
  }

  if (category === 'changes') {
    const { data, error } = await db
      .from('monthly_rental_changes')
      .select(`
        parking_lot_id,customer_code,customer_name,phone,vehicle_plate,vehicle_type,
        rental_type,change_type,effective_date,reason,change_detail,source,created_at
      `)
      .gte('effective_date', start)
      .lt('effective_date', next)
      .order('effective_date')
    if (error) throw new Error(error.message)

    const grouped = groupByLot(
      (data || []).filter((row: any) => allowed.has(String(row.parking_lot_id || '')))
    )

    for (const lot of lots) {
      const sourceRows = grouped.get(String(lot.id)) || []
      if (!sourceRows.length) continue

      const rows = sourceRows.map((row: any) => ({
        異動日期: row.effective_date || '',
        異動類型: changeTypeText(row.change_type),
        停車場: lot.name,
        客戶編號: row.customer_code || '',
        姓名: row.customer_name || '',
        電話: row.phone || '',
        車牌: row.vehicle_plate || '',
        車種: vehicleTypeText(row.vehicle_type),
        月租類型: row.rental_type || '',
        異動內容: row.change_detail || '',
        原因: row.reason || '',
        來源: sourceText(row.source),
      }))

      items.push({
        category,
        parkingLotId: String(lot.id),
        parkingLotName: lot.name,
        sourceKey: `changes:${lot.id}:${month}`,
        fileName: `${safeName(lot.name)}_月租簽約異動_${month}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        bytes: workbookBytes(
          rows,
          '月租簽約異動',
          [13, 12, 28, 14, 14, 15, 14, 10, 18, 35, 25, 15]
        ),
      })
    }
    return items
  }

  if (category === 'taxi') {
    const { data, error } = await db
      .from('taxi_discount_records')
      .select('parking_lot_id,vehicle_plate,entry_time,exit_time,discount_amount,is_holiday,created_at')
      .gte('entry_time', `${start}T00:00:00+08:00`)
      .lt('entry_time', `${next}T00:00:00+08:00`)
      .order('parking_lot_id')
      .order('entry_time')
    if (error) throw new Error(error.message)

    const grouped = groupByLot(
      (data || []).filter((row: any) => allowed.has(String(row.parking_lot_id || '')))
    )

    for (const lot of lots) {
      const sourceRows = grouped.get(String(lot.id)) || []
      const dailyCounter: Record<string, number> = {}
      const bodyRows = sourceRows
        .map((row: any) => {
          const entry = row.entry_time ? new Date(row.entry_time) : null
          const exit = row.exit_time ? new Date(row.exit_time) : null
          const date = entry
            ? new Intl.DateTimeFormat('zh-TW', {
                timeZone: 'Asia/Taipei',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              }).format(entry)
            : ''
          dailyCounter[date] = (dailyCounter[date] || 0) + 1
          const timeText = (value: Date | null) =>
            value
              ? new Intl.DateTimeFormat('zh-TW', {
                  timeZone: 'Asia/Taipei',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }).format(value)
              : ''

          return `<tr><td>${dailyCounter[date]}</td><td>${date}</td><td>${String(
            row.vehicle_plate || ''
          )}</td><td>${timeText(entry)}</td><td>${timeText(exit)}</td><td>${Number(
            row.discount_amount || 0
          )}</td><td>${row.is_holiday ? '是' : '否'}</td></tr>`
        })
        .join('')

      const html = `<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;width:100%;font-family:Arial,"Microsoft JhengHei",sans-serif}th,td{border:1px solid #000;text-align:center;padding:6px}.title{font-size:20px;font-weight:700}</style></head><body><table><tr><th class="title" colspan="7">新北市政府交通局計程車免費停車統計表（${lot.name}）</th></tr><tr><th>每日項次</th><th>日期</th><th>車牌</th><th>進場時間</th><th>離場時間</th><th>銷單金額</th><th>是否假日</th></tr>${bodyRows}</table></body></html>`

      items.push({
        category,
        parkingLotId: String(lot.id),
        parkingLotName: lot.name,
        sourceKey: `taxi:${lot.id}:${month}`,
        fileName: `${safeName(lot.name)}_計程車免費停車統計表.xls`,
        mimeType: 'application/vnd.ms-excel',
        content: '\uFEFF' + html,
      })
    }
    return items
  }

  if (category === 'shift') {
    const { data, error } = await db
      .from('shift_closing_reports')
      .select(`
        parking_lot_id,closing_date,shift_start_at,shift_end_at,operator_name,closing_status,
        invoice_start_no,invoice_end_no,amount_due,amount_paid,aps_monthly_count,aps_monthly_amount,
        electronic_payment_total,mobile_payment_total,cash_actual,remittance_total,remittance_status,
        remittance_batch_total,remittance_batch_report_count,remitted_at,created_at
      `)
      .gte('closing_date', start)
      .lt('closing_date', next)
      .order('closing_date')
    if (error) throw new Error(error.message)

    const grouped = groupByLot(
      (data || []).filter((row: any) => allowed.has(String(row.parking_lot_id || '')))
    )

    for (const lot of lots) {
      const sourceRows = grouped.get(String(lot.id)) || []
      if (!sourceRows.length) continue
      const rows = sourceRows.map((row: any) => ({
        結班日期: row.closing_date || '',
        開班時間: row.shift_start_at || '',
        結班時間: row.shift_end_at || '',
        值班人員: row.operator_name || '',
        結班狀態: row.closing_status === 'abnormal' ? '異常' : '正常',
        發票起號: row.invoice_start_no || '',
        發票迄號: row.invoice_end_no || '',
        應收: Number(row.amount_due || 0),
        實收: Number(row.amount_paid || 0),
        APS月租筆數: Number(row.aps_monthly_count || 0),
        APS月租金額: Number(row.aps_monthly_amount || 0),
        電子支付: Number(row.electronic_payment_total || 0),
        手機支付: Number(row.mobile_payment_total || 0),
        現金實收: Number(row.cash_actual || 0),
        本班匯款: Number(row.remittance_total || 0),
        匯款狀態: row.remittance_status === 'remitted' ? '已匯款' : '累積中',
        匯款批次總額: Number(row.remittance_batch_total || 0),
        匯款批次班數: Number(row.remittance_batch_report_count || 0),
        匯款時間: row.remitted_at || '',
      }))

      items.push({
        category,
        parkingLotId: String(lot.id),
        parkingLotName: lot.name,
        sourceKey: `shift:${lot.id}:${month}`,
        fileName: `${safeName(lot.name)}_${month}_結班月彙整.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        bytes: workbookBytes(rows, '結班月彙整'),
      })
    }
    return items
  }

  return items
}
