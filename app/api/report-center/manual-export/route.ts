import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'


function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整')
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

type Category = 'attendance' | 'rentals' | 'changes' | 'taxi' | 'shift' | 'disaster' | 'dengue' | 'violation'

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
  if (/[",\n\r]/.test(source)) {
    return `"${source.replace(/"/g, '""')}"`
  }
  return source
}

function rowsToCsv(headers: string[], rows: Record<string, unknown>[]) {
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) =>
      headers.map((key) => csvEscape(row[key])).join(',')
    ),
  ]
  return '\uFEFF' + lines.join('\r\n')
}

async function authorize() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { supabase, user: null, profile: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  return { supabase, user, profile }
}

export async function GET(request: Request) {
  const { supabase, user, profile } = await authorize()

  if (
    !user ||
    !profile?.is_active ||
    (profile.role !== 'supervisor' && profile.role !== 'manager')
  ) {
    return NextResponse.json({ error: '沒有報表中心權限。' }, { status: 403 })
  }

  const url = new URL(request.url)
  const month = String(url.searchParams.get('month') || '').trim()
  const category = String(url.searchParams.get('category') || '') as Category

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: '月份格式錯誤。' }, { status: 400 })
  }

  if (!['attendance', 'rentals', 'changes', 'taxi', 'shift', 'disaster', 'dengue', 'violation'].includes(category)) {
    return NextResponse.json({ error: '下載類型錯誤。' }, { status: 400 })
  }

  const start = monthStart(month)
  const next = nextMonthStart(month)
  const db = admin()

  let lotQuery = db
    .from('parking_lots')
    .select('id, name')
    .order('name')

  if (profile.role === 'manager') {
    const { data: assignments, error: assignmentError } = await db
      .from('user_parking_lots')
      .select('parking_lot_id')
      .eq('user_id', user.id)

    if (assignmentError) {
      return NextResponse.json({ error: `停車場權限讀取失敗：${assignmentError.message}` }, { status: 500 })
    }

    const assignedIds = Array.from(
      new Set((assignments || []).map((row: any) => String(row.parking_lot_id || '')).filter(Boolean))
    )

    if (!assignedIds.length) {
      return NextResponse.json({ error: '目前沒有指派可匯出的停車場。' }, { status: 403 })
    }

    lotQuery = lotQuery.in('id', assignedIds)
  }

  const { data: lotRows, error: lotError } = await lotQuery

  if (lotError) {
    return NextResponse.json({ error: `停車場讀取失敗：${lotError.message}` }, { status: 500 })
  }

  const allowedLotIds = new Set((lotRows || []).map((lot: any) => String(lot.id)))
  const lotMap = new Map((lotRows || []).map((lot: any) => [lot.id, lot.name]))

  const items: {
    bucket: string
    path: string
    fileName: string
  }[] = []

  if (category === 'attendance') {
    const { data, error } = await db
      .from('monthly_attendance_sheets')
      .select('id, parking_lot_id, attendance_month, storage_path, file_name, uploaded_at')
      .eq('attendance_month', start)
      .order('uploaded_at')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    for (let i = 0; i < (data || []).length; i++) {
      const row: any = (data || [])[i]
      if (!allowedLotIds.has(String(row.parking_lot_id || ''))) continue
      const lot = safeName(lotMap.get(row.parking_lot_id) || '未知停車場')
      items.push({
        bucket: 'monthly-attendance',
        path: row.storage_path,
        fileName: `${lot}/${month}_${lot}_簽到表_${String(i + 1).padStart(2, '0')}_${safeName(row.file_name)}`,
      })
    }
  }

  if (category === 'disaster') {
    const { data, error } = await db
      .from('disaster_inspections')
      .select(`
        id,
        parking_lot_id,
        inspection_date,
        pdf_path,
        pdf_file_name,
        pdf_generated_at
      `)
      .not('pdf_path', 'is', null)
      .gte('inspection_date', start)
      .lt('inspection_date', next)
      .order('parking_lot_id')
      .order('inspection_date')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    for (const row of (data || []) as any[]) {
      if (!row.pdf_path) continue
      if (!allowedLotIds.has(String(row.parking_lot_id || ''))) continue

      const lot = safeName(lotMap.get(row.parking_lot_id) || '未知停車場')

      items.push({
        bucket: 'disaster-inspection-pdfs',
        path: row.pdf_path,
        fileName: `${lot}/${safeName(row.pdf_file_name || `${lot}_${row.inspection_date}_防災自主檢查表.pdf`)}`,
      })
    }
  }

  if (category === 'dengue') {
    const { data, error } = await db
      .from('dengue_prevention_photos')
      .select('id, parking_lot_id, work_date, storage_path, file_name')
      .eq('work_type', '自主檢查')
      .eq('file_kind', 'report')
      .gte('work_date', start)
      .lt('work_date', next)
      .order('work_date')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    for (let i = 0; i < (data || []).length; i++) {
      const row: any = (data || [])[i]
      if (!allowedLotIds.has(String(row.parking_lot_id || ''))) continue
      const lot = safeName(lotMap.get(row.parking_lot_id) || '未知停車場')
      items.push({
        bucket: 'dengue-prevention',
        path: row.storage_path,
        fileName: `${lot}/${row.work_date}_${lot}_登革熱自主檢查報表_${String(i + 1).padStart(2, '0')}_${safeName(row.file_name)}`,
      })
    }
  }

  if (category === 'violation') {
    const { data: photoRows, error: photoError } = await db
      .from('violation_parking_photos')
      .select('id, case_id, parking_lot_id, photo_type, photo_date, storage_path, file_name')
      .gte('photo_date', start)
      .lt('photo_date', next)
      .order('photo_date')

    if (photoError) {
      return NextResponse.json({ error: photoError.message }, { status: 400 })
    }

    const caseIds = Array.from(new Set((photoRows || []).map((row: any) => row.case_id)))
    let caseMap = new Map<string, any>()

    if (caseIds.length) {
      const { data: caseRows } = await db
        .from('violation_parking_cases')
        .select('id, case_type, reserved_type, vehicle_plate')
        .in('id', caseIds)

      caseMap = new Map((caseRows || []).map((row: any) => [row.id, row]))
    }

    const caseText = (c: any) => {
      if (c?.case_type === 'reserved_violation') {
        return c.reserved_type === 'disabled' ? '身障違規' : '婦幼違規'
      }
      if (c?.case_type === 'long_stay') return '久停車'
      return '無牌車'
    }

    const photoText: Record<string, string> = {
      overview: '車格和牌面全景',
      center_window: '置中全窗',
      right_window: '右側全窗',
      left_window: '左側全窗',
      daily: '每日追蹤',
      general: '現場照片',
    }

    for (let i = 0; i < (photoRows || []).length; i++) {
      const row: any = (photoRows || [])[i]
      if (!allowedLotIds.has(String(row.parking_lot_id || ''))) continue
      const c = caseMap.get(row.case_id)
      const lot = safeName(lotMap.get(row.parking_lot_id) || '未知停車場')
      const plate = safeName(c?.vehicle_plate || '無牌')
      const group = `${lot}/${caseText(c)}_${plate}`

      items.push({
        bucket: 'violation-parking',
        path: row.storage_path,
        fileName: `${group}/${row.photo_date}_${photoText[row.photo_type] || row.photo_type}_${String(i + 1).padStart(3, '0')}_${safeName(row.file_name)}`,
      })
    }
  }

  const generatedFiles: {
    fileName: string
    content: string
  }[] = []

  if (category === 'rentals') {
    const { data, error } = await db
      .from('monthly_rentals')
      .select(`
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
      .order('parking_lot_id')
      .order('customer_name')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const rows = (data || [])
      .filter((row: any) => allowedLotIds.has(String(row.parking_lot_id || '')))
      .map((row: any) => ({
      停車場: lotMap.get(row.parking_lot_id) || '',
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

    generatedFiles.push({
      fileName: `${month}_月租總表.csv`,
      content: rowsToCsv(
        ['停車場','客戶編號','姓名','電話','車牌','車種','類型','租期開始','租期結束','月租金額','繳費狀態','繳費日期','發票號碼','月租狀態','備註','更新時間'],
        rows
      ),
    })
  }

  if (category === 'changes') {
    const { data, error } = await db
      .from('monthly_rental_changes')
      .select(`
        parking_lot_id,
        customer_code,
        customer_name,
        phone,
        vehicle_plate,
        vehicle_type,
        rental_type,
        change_type,
        effective_date,
        reason,
        source,
        created_at
      `)
      .gte('effective_date', start)
      .lt('effective_date', next)
      .order('effective_date')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const rows = (data || [])
      .filter((row: any) => allowedLotIds.has(String(row.parking_lot_id || '')))
      .map((row: any) => ({
      停車場: lotMap.get(row.parking_lot_id) || '',
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

    generatedFiles.push({
      fileName: `${month}_月租異動.csv`,
      content: rowsToCsv(
        ['停車場','客戶編號','姓名','電話','車牌','車種','類型','異動類型','生效日期','原因','來源','建立時間'],
        rows
      ),
    })
  }

  if (category === 'taxi') {
    const { data, error } = await db
      .from('taxi_discount_records')
      .select(`
        parking_lot_id,
        vehicle_plate,
        entry_time,
        exit_time,
        discount_amount,
        is_holiday,
        created_at
      `)
      .gte('entry_time', `${start}T00:00:00+08:00`)
      .lt('entry_time', `${next}T00:00:00+08:00`)
      .order('parking_lot_id')
      .order('entry_time')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const grouped = new Map<string, any[]>()

    for (const row of (data || []) as any[]) {
      const key = String(row.parking_lot_id || '')
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(row)
    }

    // 計程車月報即使當月完全沒有資料，也必須能下載。
    // 以停車場主檔為基準，每個停車場都建立一份 Excel；
    // 沒有紀錄的場站就只有表頭、沒有明細。
    for (const lotRow of (lotRows || []) as any[]) {
      const lotId = String(lotRow.id || '')
      const rows = grouped.get(lotId) || []
      const lot = safeName(lotRow.name || lotMap.get(lotId) || '未知停車場')

      const dailyCounter: Record<string, number> = {}

      const bodyRows = rows.map((row: any) => {
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

        return `<tr>
<td>${dailyCounter[date]}</td>
<td>${date}</td>
<td>${String(row.vehicle_plate || '')}</td>
<td>${timeText(entry)}</td>
<td>${timeText(exit)}</td>
<td>${Number(row.discount_amount || 0)}</td>
<td>${row.is_holiday ? '是' : '否'}</td>
</tr>`
      }).join('')

      const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
table{border-collapse:collapse;width:100%;font-family:Arial,"Microsoft JhengHei",sans-serif}
th,td{border:1px solid #000;text-align:center;padding:6px}
.title{font-size:20px;font-weight:700}
</style>
</head>
<body>
<table>
<tr><th class="title" colspan="7">新北市政府交通局計程車免費停車統計表（${lot}）</th></tr>
<tr>
<th>每日項次</th><th>日期</th><th>車牌</th><th>進場時間</th><th>離場時間</th><th>銷單金額</th><th>是否假日</th>
</tr>
${bodyRows}
</table>
</body>
</html>`

      generatedFiles.push({
        fileName: `${lot}/${lot}_計程車免費停車統計表.xls`,
        content: '\uFEFF' + html,
      })
    }
  }

  if (category === 'shift') {
    const { data, error } = await db
      .from('shift_closing_reports')
      .select(`
        parking_lot_id,
        closing_date,
        operator_name,
        closing_status,
        invoice_start_no,
        invoice_end_no,
        amount_due,
        amount_paid,
        aps_monthly_count,
        aps_monthly_amount,
        electronic_payment_total,
        mobile_payment_total,
        cash_actual,
        created_at
      `)
      .gte('closing_date', start)
      .lt('closing_date', next)
      .order('closing_date')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const rows = (data || [])
      .filter((row: any) => allowedLotIds.has(String(row.parking_lot_id || '')))
      .map((row: any) => ({
      停車場: lotMap.get(row.parking_lot_id) || '',
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
      建立時間: row.created_at || '',
    }))

    generatedFiles.push({
      fileName: `${month}_結班報表.csv`,
      content: rowsToCsv(
        ['停車場','結班日期','結班人員','狀態','發票起號','發票迄號','應收','實收','APS月租筆數','APS月租金額','電子支付','手機支付','現金實收','建立時間'],
        rows
      ),
    })
  }

  if (!items.length && !generatedFiles.length) {
    return NextResponse.json({ error: '這個月份沒有可下載的資料。' }, { status: 400 })
  }

  const zip = new JSZip()

  for (const generated of generatedFiles) {
    zip.file(generated.fileName, generated.content)
  }

  for (const item of items) {
    const { data: blob, error } = await db.storage
      .from(item.bucket)
      .download(item.path)

    if (error || !blob) continue

    zip.file(item.fileName, await blob.arrayBuffer())
  }

  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const labels: Record<Category, string> = {
    attendance: '簽到表',
    rentals: '月租總表',
    changes: '月租異動',
    taxi: '計程車折扣',
    shift: '結班報表',
    disaster: '防災檢查PDF',
    dengue: '登革熱自主檢查報表',
    violation: '違規停車照片',
  }

  // NextResponse / BodyInit 在目前 Next.js + TypeScript 型別下
  // 不直接接受 JSZip 回傳的 Uint8Array<ArrayBufferLike>。
  // 複製成標準 ArrayBuffer，內容完全相同，只修正 build 型別。
  const responseBody = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(responseBody).set(bytes)

  return new NextResponse(responseBody, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${month}_${labels[category]}.zip`)}`,
      'Cache-Control': 'no-store',
    },
  })
}
