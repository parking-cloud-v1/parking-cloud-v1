import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  configuredDriveFolder,
  driveFolderUrl,
  DRIVE_CATEGORY_LABELS,
  resolveReportFolder,
  uploadToGoogleDrive,
  type DriveCategory,
} from '@/lib/google-drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CATEGORIES: DriveCategory[] = [
  'attendance',
  'rentals',
  'changes',
  'taxi',
  'shift',
  'disaster',
  'dengue',
  'violation',
]

type LotRow = { id: string; name: string }

type ExportItem = {
  category: DriveCategory
  parkingLotId: string
  parkingLotName: string
  sourceKey: string
  fileName: string
  mimeType: string
  bucket?: string
  path?: string
  content?: string
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整')
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function monthStart(month: string) {
  return `${month}-01`
}

function nextMonthStart(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

function safeName(value: unknown) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
}

function csvEscape(value: unknown) {
  const source = String(value ?? '')
  if (/[",\n\r]/.test(source)) return `"${source.replace(/"/g, '""')}"`
  return source
}

function rowsToCsv(headers: string[], rows: Record<string, unknown>[]) {
  return (
    '\uFEFF' +
    [
      headers.map(csvEscape).join(','),
      ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(',')),
    ].join('\r\n')
  )
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

async function authorize() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null, profile: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  return { user, profile }
}

async function allowedLots(db: ReturnType<typeof admin>, userId: string, role: string) {
  let query = db.from('parking_lots').select('id,name').order('name')

  if (role === 'manager') {
    const { data: assignments, error } = await db
      .from('user_parking_lots')
      .select('parking_lot_id')
      .eq('user_id', userId)

    if (error) throw new Error(`停車場權限讀取失敗：${error.message}`)

    const ids = Array.from(
      new Set((assignments || []).map((row: any) => String(row.parking_lot_id || '')).filter(Boolean))
    )

    if (!ids.length) return [] as LotRow[]
    query = query.in('id', ids)
  }

  const { data, error } = await query
  if (error) throw new Error(`停車場讀取失敗：${error.message}`)
  return (data || []) as LotRow[]
}

function photoText(type: string) {
  const labels: Record<string, string> = {
    overview: '車格和牌面全景',
    center_window: '置中全窗',
    right_window: '右側全窗',
    left_window: '左側全窗',
    daily: '每日追蹤',
    general: '現場照片',
  }
  return labels[type] || type
}

function caseText(row: any) {
  if (row?.case_type === 'reserved_violation') {
    return row?.reserved_type === 'disabled' ? '身障違規' : '婦幼違規'
  }
  if (row?.case_type === 'long_stay') return '久停車'
  return '無牌車'
}

async function collectItems(
  db: ReturnType<typeof admin>,
  category: DriveCategory,
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
      const lotId = String((row as any).parking_lot_id || '')
      if (!allowed.has(lotId) || !(row as any).storage_path) continue
      const lotName = lotMap.get(lotId) || '未知停車場'
      items.push({
        category,
        parkingLotId: lotId,
        parkingLotName: lotName,
        sourceKey: `attendance:${(row as any).id}`,
        fileName: `${month}_${safeName(lotName)}_簽到表_${safeName((row as any).file_name)}`,
        mimeType: (row as any).mime_type || 'application/octet-stream',
        bucket: 'monthly-attendance',
        path: (row as any).storage_path,
      })
    }
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
      const lotId = String((row as any).parking_lot_id || '')
      if (!allowed.has(lotId) || !(row as any).pdf_path) continue
      const lotName = lotMap.get(lotId) || '未知停車場'
      items.push({
        category,
        parkingLotId: lotId,
        parkingLotName: lotName,
        sourceKey: `disaster:${(row as any).id}:pdf`,
        fileName: safeName(
          (row as any).pdf_file_name || `${lotName}_${(row as any).inspection_date}_防災自主檢查表.pdf`
        ),
        mimeType: 'application/pdf',
        bucket: 'disaster-inspection-pdfs',
        path: (row as any).pdf_path,
      })
    }
  }

  if (category === 'dengue') {
    const { data, error } = await db
      .from('dengue_prevention_photos')
      .select('id,parking_lot_id,work_date,storage_path,file_name,mime_type')
      .eq('work_type', '自主檢查')
      .eq('file_kind', 'report')
      .gte('work_date', start)
      .lt('work_date', next)
      .order('work_date')
    if (error) throw new Error(error.message)

    for (const row of data || []) {
      const lotId = String((row as any).parking_lot_id || '')
      if (!allowed.has(lotId) || !(row as any).storage_path) continue
      const lotName = lotMap.get(lotId) || '未知停車場'
      items.push({
        category,
        parkingLotId: lotId,
        parkingLotName: lotName,
        sourceKey: `dengue:${(row as any).id}`,
        fileName: `${(row as any).work_date}_${safeName(lotName)}_登革熱自主檢查_${safeName((row as any).file_name)}`,
        mimeType: (row as any).mime_type || 'application/octet-stream',
        bucket: 'dengue-prevention',
        path: (row as any).storage_path,
      })
    }
  }

  if (category === 'violation') {
    const { data: photos, error } = await db
      .from('violation_parking_photos')
      .select('id,case_id,parking_lot_id,photo_type,photo_date,storage_path,file_name,mime_type')
      .gte('photo_date', start)
      .lt('photo_date', next)
      .order('photo_date')
    if (error) throw new Error(error.message)

    const scoped = (photos || []).filter((row: any) => allowed.has(String(row.parking_lot_id || '')))
    const ids = Array.from(new Set(scoped.map((row: any) => String(row.case_id || '')).filter(Boolean)))
    let cases = new Map<string, any>()

    if (ids.length) {
      const { data: caseRows, error: caseError } = await db
        .from('violation_parking_cases')
        .select('id,case_type,reserved_type,vehicle_plate,start_date')
        .in('id', ids)
      if (caseError) throw new Error(caseError.message)
      cases = new Map((caseRows || []).map((row: any) => [String(row.id), row]))
    }

    for (const row of scoped as any[]) {
      if (!row.storage_path) continue
      const lotId = String(row.parking_lot_id || '')
      const lotName = lotMap.get(lotId) || '未知停車場'
      const c = cases.get(String(row.case_id || ''))
      const plate = safeName(c?.vehicle_plate || '無牌')
      items.push({
        category,
        parkingLotId: lotId,
        parkingLotName: lotName,
        sourceKey: `violation:${row.id}`,
        fileName: `${row.photo_date}_${caseText(c)}_${plate}_${photoText(row.photo_type)}_${safeName(row.file_name)}`,
        mimeType: row.mime_type || 'image/jpeg',
        bucket: 'violation-parking',
        path: row.storage_path,
      })
    }
  }

  if (category === 'rentals') {
    const { data, error } = await db
      .from('monthly_rentals')
      .select(`
        parking_lot_id,customer_code,customer_name,phone,vehicle_plate,vehicle_type,
        rental_type,start_date,end_date,monthly_fee,payment_status,payment_date,
        invoice_number,rental_status,notes,updated_at
      `)
      .order('parking_lot_id')
      .order('customer_name')
    if (error) throw new Error(error.message)

    const grouped = groupByLot((data || []).filter((row: any) => allowed.has(String(row.parking_lot_id || ''))))

    for (const lot of lots) {
      const rows = (grouped.get(String(lot.id)) || []).map((row: any) => ({
        客戶編號: row.customer_code || '',
        姓名: row.customer_name || '',
        電話: row.phone || '',
        車牌: row.vehicle_plate || '',
        車種: row.vehicle_type || '',
        類型: row.rental_type || '',
        租期開始: row.start_date || '',
        租期結束: row.end_date || '',
        月租金額: row.monthly_fee ?? '',
        繳費狀態: row.payment_status || '',
        繳費日期: row.payment_date || '',
        發票號碼: row.invoice_number || '',
        月租狀態: row.rental_status || '',
        備註: row.notes || '',
        更新時間: row.updated_at || '',
      }))

      items.push({
        category,
        parkingLotId: String(lot.id),
        parkingLotName: lot.name,
        sourceKey: `rentals:${lot.id}`,
        fileName: `${month}_${safeName(lot.name)}_月租總表.csv`,
        mimeType: 'text/csv;charset=utf-8',
        content: rowsToCsv(
          ['客戶編號','姓名','電話','車牌','車種','類型','租期開始','租期結束','月租金額','繳費狀態','繳費日期','發票號碼','月租狀態','備註','更新時間'],
          rows
        ),
      })
    }
  }

  if (category === 'changes') {
    const { data, error } = await db
      .from('monthly_rental_changes')
      .select(`
        parking_lot_id,customer_code,customer_name,phone,vehicle_plate,vehicle_type,
        rental_type,change_type,effective_date,reason,source,created_at
      `)
      .gte('effective_date', start)
      .lt('effective_date', next)
      .order('effective_date')
    if (error) throw new Error(error.message)

    const grouped = groupByLot((data || []).filter((row: any) => allowed.has(String(row.parking_lot_id || ''))))
    for (const lot of lots) {
      const sourceRows = grouped.get(String(lot.id)) || []
      if (!sourceRows.length) continue
      const rows = sourceRows.map((row: any) => ({
        客戶編號: row.customer_code || '',
        姓名: row.customer_name || '',
        電話: row.phone || '',
        車牌: row.vehicle_plate || '',
        車種: row.vehicle_type || '',
        類型: row.rental_type || '',
        異動類型: row.change_type || '',
        生效日期: row.effective_date || '',
        原因: row.reason || '',
        來源: row.source || '',
        建立時間: row.created_at || '',
      }))
      items.push({
        category,
        parkingLotId: String(lot.id),
        parkingLotName: lot.name,
        sourceKey: `changes:${lot.id}`,
        fileName: `${month}_${safeName(lot.name)}_月租異動.csv`,
        mimeType: 'text/csv;charset=utf-8',
        content: rowsToCsv(
          ['客戶編號','姓名','電話','車牌','車種','類型','異動類型','生效日期','原因','來源','建立時間'],
          rows
        ),
      })
    }
  }

  if (category === 'shift') {
    const { data, error } = await db
      .from('shift_closing_reports')
      .select(`
        parking_lot_id,closing_date,operator_name,closing_status,invoice_start_no,
        invoice_end_no,amount_due,amount_paid,aps_monthly_count,aps_monthly_amount,
        electronic_payment_total,mobile_payment_total,cash_actual,remittance_total,
        remittance_status,created_at
      `)
      .gte('closing_date', start)
      .lt('closing_date', next)
      .order('closing_date')
    if (error) throw new Error(error.message)

    const grouped = groupByLot((data || []).filter((row: any) => allowed.has(String(row.parking_lot_id || ''))))
    for (const lot of lots) {
      const sourceRows = grouped.get(String(lot.id)) || []
      if (!sourceRows.length) continue
      const rows = sourceRows.map((row: any) => ({
        結班日期: row.closing_date || '',
        結班人員: row.operator_name || '',
        狀態: row.closing_status || '',
        發票起號: row.invoice_start_no || '',
        發票迄號: row.invoice_end_no || '',
        應收: row.amount_due ?? '',
        實收: row.amount_paid ?? '',
        APS月租筆數: row.aps_monthly_count ?? '',
        APS月租金額: row.aps_monthly_amount ?? '',
        電子支付: row.electronic_payment_total ?? '',
        手機支付: row.mobile_payment_total ?? '',
        現金實收: row.cash_actual ?? '',
        匯款金額: row.remittance_total ?? '',
        匯款狀態: row.remittance_status || '',
        建立時間: row.created_at || '',
      }))
      items.push({
        category,
        parkingLotId: String(lot.id),
        parkingLotName: lot.name,
        sourceKey: `shift:${lot.id}`,
        fileName: `${month}_${safeName(lot.name)}_結班報表.csv`,
        mimeType: 'text/csv;charset=utf-8',
        content: rowsToCsv(
          ['結班日期','結班人員','狀態','發票起號','發票迄號','應收','實收','APS月租筆數','APS月租金額','電子支付','手機支付','現金實收','匯款金額','匯款狀態','建立時間'],
          rows
        ),
      })
    }
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

    const grouped = groupByLot((data || []).filter((row: any) => allowed.has(String(row.parking_lot_id || ''))))

    // 延續既有規則：即使當月沒有計程車紀錄，各場仍建立空白月報。
    for (const lot of lots) {
      const sourceRows = grouped.get(String(lot.id)) || []
      const dailyCounter: Record<string, number> = {}
      const bodyRows = sourceRows
        .map((row: any) => {
          const entry = row.entry_time ? new Date(row.entry_time) : null
          const exit = row.exit_time ? new Date(row.exit_time) : null
          const date = entry
            ? new Intl.DateTimeFormat('zh-TW', {
                timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
              }).format(entry)
            : ''
          dailyCounter[date] = (dailyCounter[date] || 0) + 1
          const timeText = (value: Date | null) =>
            value
              ? new Intl.DateTimeFormat('zh-TW', {
                  timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false,
                }).format(value)
              : ''
          return `<tr><td>${dailyCounter[date]}</td><td>${date}</td><td>${String(row.vehicle_plate || '')}</td><td>${timeText(entry)}</td><td>${timeText(exit)}</td><td>${Number(row.discount_amount || 0)}</td><td>${row.is_holiday ? '是' : '否'}</td></tr>`
        })
        .join('')

      const content = `<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;width:100%;font-family:Arial,"Microsoft JhengHei",sans-serif}th,td{border:1px solid #000;text-align:center;padding:6px}.title{font-size:20px;font-weight:700}</style></head><body><table><tr><th class="title" colspan="7">新北市政府交通局計程車免費停車統計表（${lot.name}）</th></tr><tr><th>每日項次</th><th>日期</th><th>車牌</th><th>進場時間</th><th>離場時間</th><th>銷單金額</th><th>是否假日</th></tr>${bodyRows}</table></body></html>`

      items.push({
        category,
        parkingLotId: String(lot.id),
        parkingLotName: lot.name,
        sourceKey: `taxi:${lot.id}`,
        fileName: `${safeName(lot.name)}_計程車免費停車統計表.xls`,
        mimeType: 'application/vnd.ms-excel',
        content: '\uFEFF' + content,
      })
    }
  }

  return items
}

async function itemBytes(db: ReturnType<typeof admin>, item: ExportItem) {
  if (typeof item.content === 'string') {
    const encoded = new TextEncoder().encode(item.content)
    const buffer = new ArrayBuffer(encoded.byteLength)
    new Uint8Array(buffer).set(encoded)
    return buffer
  }

  if (!item.bucket || !item.path) throw new Error('缺少 Storage 檔案位置')
  const { data: blob, error } = await db.storage.from(item.bucket).download(item.path)
  if (error || !blob) throw new Error(error?.message || 'Storage 下載失敗')
  return blob.arrayBuffer()
}

function sha256(bytes: ArrayBuffer) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

async function archiveCount(
  db: ReturnType<typeof admin>,
  category: DriveCategory,
  month: string,
  lots: LotRow[]
) {
  if (!lots.length) return 0
  let query = db
    .from('report_center_drive_archives')
    .select('id', { count: 'exact', head: true })
    .eq('category', category)
    .eq('report_month', monthStart(month))

  query = query.in('parking_lot_id', lots.map((lot) => lot.id))
  const { count, error } = await query
  if (error) throw new Error(`歸檔紀錄讀取失敗：${error.message}`)
  return count || 0
}

export async function GET(request: Request) {
  try {
    const { user, profile } = await authorize()
    if (!user || !profile?.is_active || !['supervisor', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: '沒有報表中心權限。' }, { status: 403 })
    }

    const month = String(new URL(request.url).searchParams.get('month') || '').trim()
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: '月份格式錯誤。' }, { status: 400 })
    }

    const db = admin()
    const lots = await allowedLots(db, user.id, profile.role)
    if (!lots.length) {
      return NextResponse.json({ error: '目前沒有指派可查看的停車場。' }, { status: 403 })
    }

    const configured = {} as Record<DriveCategory, boolean>
    const folderUrls = {} as Record<DriveCategory, string>
    const counts = {} as Record<DriveCategory, number>
    const archiveCounts = {} as Record<DriveCategory, number>
    const categoryErrors = {} as Partial<Record<DriveCategory, string>>

    // 每一個報表類別分開讀取。
    // 某一張資料表權限或欄位異常時，不再讓整個報表中心一起失敗。
    for (const category of CATEGORIES) {
      const root = configuredDriveFolder(category)
      configured[category] = Boolean(root)
      folderUrls[category] = driveFolderUrl(root)
      counts[category] = 0
      archiveCounts[category] = 0

      try {
        const items = await collectItems(db, category, month, lots)
        counts[category] = items.length
        archiveCounts[category] = await archiveCount(db, category, month, lots)
      } catch (categoryError: any) {
        categoryErrors[category] =
          categoryError?.message || `${DRIVE_CATEGORY_LABELS[category]}資料讀取失敗`
      }
    }

    return NextResponse.json({
      configured,
      folderUrls,
      counts,
      archiveCounts,
      categoryErrors,
      role: profile.role,
      lotCount: lots.length,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Google Drive 狀態讀取失敗。' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const { user, profile } = await authorize()
    if (!user || !profile?.is_active || !['supervisor', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: '沒有報表中心權限。' }, { status: 403 })
    }

    const body = await request.json()
    const category = String(body?.category || '') as DriveCategory
    const month = String(body?.month || '').trim()

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: '上傳類型錯誤。' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: '月份格式錯誤。' }, { status: 400 })
    }
    if (!configuredDriveFolder(category)) {
      return NextResponse.json(
        { error: `尚未設定「${DRIVE_CATEGORY_LABELS[category]}」Google Drive 資料夾。` },
        { status: 400 }
      )
    }

    const db = admin()
    const lots = await allowedLots(db, user.id, profile.role)
    if (!lots.length) {
      return NextResponse.json({ error: '目前沒有指派可歸檔的停車場。' }, { status: 403 })
    }

    const items = await collectItems(db, category, month, lots)
    if (!items.length) {
      return NextResponse.json({ error: '這個月份沒有可歸檔的資料。' }, { status: 400 })
    }

    let uploaded = 0
    let skipped = 0
    const failures: string[] = []

    for (const item of items) {
      try {
        const bytes = await itemBytes(db, item)
        const checksum = sha256(bytes)

        const { data: exists, error: existsError } = await db
          .from('report_center_drive_archives')
          .select('id,google_file_id')
          .eq('category', category)
          .eq('report_month', monthStart(month))
          .eq('source_key', item.sourceKey)
          .eq('content_sha256', checksum)
          .maybeSingle()

        if (existsError) throw new Error(`歸檔紀錄檢查失敗：${existsError.message}`)
        if (exists) {
          skipped++
          continue
        }

        const folderId = await resolveReportFolder({
          category,
          month,
          parkingLotName: item.parkingLotName,
        })

        const driveFile = await uploadToGoogleDrive({
          folderId,
          fileName: item.fileName,
          mimeType: item.mimeType,
          bytes,
        })

        const { error: insertError } = await db.from('report_center_drive_archives').insert({
          category,
          report_month: monthStart(month),
          parking_lot_id: item.parkingLotId || null,
          source_key: item.sourceKey,
          content_sha256: checksum,
          file_name: item.fileName,
          google_file_id: driveFile.id,
          google_folder_id: folderId,
          google_web_view_link: driveFile.webViewLink || null,
          archived_by: user.id,
          metadata: {
            mime_type: item.mimeType,
            source_bucket: item.bucket || null,
            source_path: item.path || null,
          },
        })

        if (insertError) throw new Error(`歸檔紀錄寫入失敗：${insertError.message}`)
        uploaded++
      } catch (error: any) {
        failures.push(`${item.parkingLotName}／${item.fileName}：${error?.message || '未知錯誤'}`)
      }
    }

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: profile.role === 'manager' && lots.length === 1 ? lots[0].id : null,
        action: 'REPORT_CENTER_GOOGLE_DRIVE_ARCHIVE',
        entity_type: 'report_center',
        entity_id: null,
        detail: {
          category,
          month,
          uploaded,
          skipped,
          failed: failures.length,
          role: profile.role,
        },
      })
    } catch {
      // 稽核紀錄失敗不阻止歸檔結果回傳。
    }

    return NextResponse.json({
      ok: failures.length === 0,
      uploaded,
      skipped,
      failed: failures.length,
      failures: failures.slice(0, 20),
      folderUrl: driveFolderUrl(configuredDriveFolder(category)),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Google Drive 歸檔失敗。' },
      { status: 500 }
    )
  }
}
