import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import {
  configuredDriveCredentials,
  configuredDriveServiceAccountEmail,
  extractDriveFolderId,
  uploadToGoogleDrive,
  verifyDriveFolderAccess,
} from '@/lib/google-drive'

export const dynamic = 'force-dynamic'

type TaxiRecord = {
  id: string
  vehicle_plate: string
  entry_time: string
  exit_time: string
  discount_amount: number | null
  is_holiday: boolean | null
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整')
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function supervisorOnly() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null, allowed: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  return {
    user,
    allowed: Boolean(profile?.is_active && profile.role === 'supervisor'),
  }
}

function safeName(value: unknown) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    } as Record<string, string>)[char]
  )
}

function officialDateText(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${map.year}/${map.month}/${map.day}`
}

function officialTimeText(value: string) {
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value))
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${map.hour}:${map.minute}`
}

function buildExcelHtml(lotName: string, records: TaxiRecord[]) {
  const sorted = [...records].sort(
    (a, b) => new Date(a.entry_time).getTime() - new Date(b.entry_time).getTime()
  )
  const dailyCounter: Record<string, number> = {}

  const rows = sorted
    .map((row) => {
      const date = officialDateText(row.entry_time)
      dailyCounter[date] = (dailyCounter[date] || 0) + 1
      return (
        '<tr>' +
        `<td>${dailyCounter[date]}</td>` +
        `<td>${escapeHtml(date)}</td>` +
        `<td>${escapeHtml(row.vehicle_plate)}</td>` +
        `<td>${escapeHtml(officialTimeText(row.entry_time))}</td>` +
        `<td>${escapeHtml(officialTimeText(row.exit_time))}</td>` +
        `<td>${Number(row.discount_amount || 0)}</td>` +
        `<td>${row.is_holiday ? '是' : '否'}</td>` +
        '</tr>'
      )
    })
    .join('')

  let blankRows = ''
  for (let index = sorted.length; index < 32; index++) {
    blankRows +=
      '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'
  }

  return (
    '\uFEFF' +
    '<html><meta charset="UTF-8">' +
    '<style>table{border-collapse:collapse;width:100%;}th,td{border:2px solid #000;text-align:center;height:34px;}.title{font-size:25px;height:58px;}</style>' +
    '<table>' +
    `<tr><th class="title" colspan="7">新北市政府交通局計程車免費停車統計表（${escapeHtml(
      lotName
    )}）</th></tr>` +
    '<tr><th>每日項次</th><th>日期</th><th>車牌</th><th>進場時間</th><th>離場時間</th><th>銷單金額</th><th>是否假日</th></tr>' +
    rows +
    blankRows +
    '</table></html>'
  )
}

function toArrayBuffer(buffer: Buffer) {
  const result = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(result).set(buffer)
  return result
}

export async function GET() {
  const auth = await supervisorOnly()
  if (!auth.allowed) {
    return NextResponse.json(
      { error: '只有主管可以把計程車優惠報表直接上傳 Google Drive。' },
      { status: 403 }
    )
  }

  return NextResponse.json({
    credentialsConfigured: configuredDriveCredentials(),
    serviceAccountEmail: configuredDriveServiceAccountEmail(),
    directFolderMode: true,
  })
}

export async function POST(request: Request) {
  try {
    const auth = await supervisorOnly()
    if (!auth.allowed || !auth.user) {
      return NextResponse.json(
        { error: '只有主管可以把計程車優惠報表直接上傳 Google Drive。' },
        { status: 403 }
      )
    }

    if (!configuredDriveCredentials()) {
      return NextResponse.json(
        { error: 'Vercel 尚未設定 Google Drive 服務帳號 email / private key。' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const parkingLotId = String(body?.parkingLotId || '').trim()
    const month = String(body?.month || '').trim()
    const folderUrl = String(body?.folderUrl || '').trim()
    const folderId = extractDriveFolderId(folderUrl)

    if (!parkingLotId) {
      return NextResponse.json({ error: '缺少停車場。' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: '月份格式錯誤。' }, { status: 400 })
    }
    if (!folderId) {
      return NextResponse.json(
        { error: '請貼上正確的 Google Drive 資料夾網址。' },
        { status: 400 }
      )
    }

    await verifyDriveFolderAccess(folderId)

    const db = admin()
    const { data: lot, error: lotError } = await db
      .from('parking_lots')
      .select('id,name')
      .eq('id', parkingLotId)
      .maybeSingle()

    if (lotError || !lot) {
      return NextResponse.json(
        { error: lotError?.message || '找不到停車場。' },
        { status: 404 }
      )
    }

    const start = `${month}-01T00:00:00+08:00`
    const [year, monthNumber] = month.split('-').map(Number)
    const nextMonth = `${monthNumber === 12 ? year + 1 : year}-${String(
      monthNumber === 12 ? 1 : monthNumber + 1
    ).padStart(2, '0')}-01T00:00:00+08:00`

    const { data, error } = await db
      .from('taxi_discount_records')
      .select('id,vehicle_plate,entry_time,exit_time,discount_amount,is_holiday')
      .eq('parking_lot_id', parkingLotId)
      .gte('entry_time', start)
      .lt('entry_time', nextMonth)
      .order('entry_time', { ascending: true })

    if (error) throw new Error(error.message)

    const lotName = String((lot as any).name || '停車場')
    const records = (data || []) as TaxiRecord[]
    const html = buildExcelHtml(lotName, records)
    const fileName = `${month}_${safeName(lotName)}_計程車免費停車統計表.xls`
    const bytes = toArrayBuffer(Buffer.from(html, 'utf8'))

    const driveFile = await uploadToGoogleDrive({
      folderId,
      fileName,
      mimeType: 'application/vnd.ms-excel;charset=utf-8',
      bytes,
    })

    try {
      await db.from('system_logs').insert({
        user_id: auth.user.id,
        parking_lot_id: parkingLotId,
        action: 'TAXI_REPORT_DIRECT_GOOGLE_DRIVE_UPLOAD',
        entity_type: 'taxi_discount_report',
        entity_id: null,
        detail: {
          report_month: month,
          record_count: records.length,
          file_name: fileName,
          google_file_id: driveFile.id,
          google_folder_id: folderId,
          upload_mode: 'supervisor_manual_direct',
        },
      })
    } catch {
      // 稽核失敗不阻止主要上傳。
    }

    return NextResponse.json({
      ok: true,
      fileName,
      recordCount: records.length,
      fileUrl: driveFile.webViewLink || '',
      message: '計程車優惠報表已直接上傳 Google Drive。',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '計程車優惠報表 Google Drive 上傳失敗。' },
      { status: 500 }
    )
  }
}
