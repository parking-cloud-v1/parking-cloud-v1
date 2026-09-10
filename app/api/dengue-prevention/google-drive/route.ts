import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import JSZip from 'jszip'

import { createClient } from '@/lib/supabase/server'
import {
  configuredDriveCredentials,
  configuredDriveFolder,
  configuredDriveServiceAccountEmail,
  driveFolderUrl,
  resolveReportFolder,
  uploadToGoogleDrive,
} from '@/lib/google-drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DRIVE_SETTING_KEY = 'google_drive_root_folder_id'

type DengueRow = {
  id: string
  parking_lot_id: string
  work_date: string
  work_type: string
  file_kind: 'photo' | 'report' | null
  storage_path: string
  file_name: string
  mime_type: string | null
  uploaded_at: string
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('伺服器環境變數未設定完整')
  }

  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function safeName(value: unknown) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
}

function fileFolder(row: DengueRow) {
  const workType = row.work_type === '委外消毒' ? '委外消毒' : '自主檢查'
  const kind = row.file_kind === 'report' ? '報表' : '照片'
  return `${workType}/${kind}`
}

function normalizedArrayBuffer(value: Uint8Array) {
  const buffer = new ArrayBuffer(value.byteLength)
  new Uint8Array(buffer).set(value)
  return buffer
}

function sha256(bytes: ArrayBuffer) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
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

async function canAccessParkingLot(
  db: ReturnType<typeof admin>,
  userId: string,
  role: string,
  parkingLotId: string
) {
  if (role === 'supervisor') return true
  if (role !== 'manager') return false

  const { data, error } = await db
    .from('user_parking_lots')
    .select('parking_lot_id')
    .eq('user_id', userId)
    .eq('parking_lot_id', parkingLotId)
    .maybeSingle()

  if (error) throw new Error(`停車場權限讀取失敗：${error.message}`)
  return Boolean(data)
}

async function savedDriveRoot(db: ReturnType<typeof admin>) {
  const { data, error } = await db
    .from('report_center_settings')
    .select('value')
    .eq('key', DRIVE_SETTING_KEY)
    .maybeSingle()

  // 舊站若尚未建立設定表，仍可退回 Vercel 的 GOOGLE_DRIVE_* Folder ID。
  if (error) return ''
  return String((data as any)?.value || '').trim()
}

async function buildDailyZip(
  db: ReturnType<typeof admin>,
  rows: DengueRow[],
  date: string,
  lotName: string
) {
  const rootFolder = `${date}_${safeName(lotName)}_登革熱消毒`
  const zip = new JSZip()
  let added = 0
  const failures: string[] = []

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    if (!row.storage_path) continue

    try {
      const { data: blob, error } = await db.storage
        .from('dengue-prevention')
        .download(row.storage_path)

      if (error || !blob) {
        throw new Error(error?.message || '找不到 Storage 檔案')
      }

      const originalName = safeName(row.file_name || `file_${index + 1}`)
      const numberedName = `${String(index + 1).padStart(2, '0')}_${originalName}`

      zip.file(
        `${rootFolder}/${fileFolder(row)}/${numberedName}`,
        await blob.arrayBuffer()
      )
      added++
    } catch (error: any) {
      failures.push(`${row.file_name || row.id}：${error?.message || '下載失敗'}`)
    }
  }

  if (!added) {
    throw new Error(
      failures.length
        ? `當日檔案都無法讀取：${failures.slice(0, 3).join('；')}`
        : '這一天沒有可上傳的檔案。'
    )
  }

  if (failures.length) {
    zip.file(
      `${rootFolder}/未能加入ZIP的檔案.txt`,
      `以下檔案未能加入這次 Google Drive ZIP：\r\n${failures.join('\r\n')}`
    )
  }

  const generated = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return {
    bytes: normalizedArrayBuffer(generated),
    fileCount: added,
    failedCount: failures.length,
  }
}

async function baseContext(request: Request, requireDate = false) {
  const { user, profile } = await authorize()
  if (
    !user ||
    !profile?.is_active ||
    !['supervisor', 'manager'].includes(String(profile.role || ''))
  ) {
    return {
      error: NextResponse.json({ error: '沒有登革熱 Google Drive 操作權限。' }, { status: 403 }),
    }
  }

  let parkingLotId = ''
  let date = ''

  if (request.method === 'GET') {
    const url = new URL(request.url)
    parkingLotId = String(url.searchParams.get('parkingLotId') || '').trim()
  } else {
    const body = await request.json().catch(() => ({}))
    parkingLotId = String(body?.parkingLotId || '').trim()
    date = String(body?.date || '').trim()
  }

  if (!parkingLotId) {
    return {
      error: NextResponse.json({ error: '缺少停車場。' }, { status: 400 }),
    }
  }

  if (requireDate && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      error: NextResponse.json({ error: '日期格式錯誤。' }, { status: 400 }),
    }
  }

  const db = admin()
  const allowed = await canAccessParkingLot(
    db,
    user.id,
    String(profile.role),
    parkingLotId
  )

  if (!allowed) {
    return {
      error: NextResponse.json({ error: '沒有這個停車場的操作權限。' }, { status: 403 }),
    }
  }

  const { data: lot, error: lotError } = await db
    .from('parking_lots')
    .select('id,name')
    .eq('id', parkingLotId)
    .maybeSingle()

  if (lotError || !lot) {
    return {
      error: NextResponse.json(
        { error: lotError?.message || '找不到停車場。' },
        { status: 404 }
      ),
    }
  }

  return {
    db,
    user,
    profile,
    parkingLotId,
    date,
    lot,
  }
}

export async function GET(request: Request) {
  try {
    const context = await baseContext(request)
    if ('error' in context) return context.error

    const { db, parkingLotId } = context
    const savedRoot = await savedDriveRoot(db)
    const effectiveRoot = savedRoot || configuredDriveFolder('dengue')

    const { data: archiveRows, error: archiveError } = await db
      .from('report_center_drive_archives')
      .select('source_key,file_name,google_file_id,google_folder_id,google_web_view_link,archived_at')
      .eq('category', 'dengue')
      .eq('parking_lot_id', parkingLotId)
      .order('archived_at', { ascending: false })
      .limit(300)

    const archives: Record<
      string,
      {
        fileName: string
        archivedAt: string
        fileUrl: string
        folderUrl: string
      }
    > = {}

    if (!archiveError) {
      for (const row of archiveRows || []) {
        const sourceKey = String((row as any).source_key || '')
        const date = sourceKey.split(':').pop() || ''
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || archives[date]) continue

        archives[date] = {
          fileName: String((row as any).file_name || ''),
          archivedAt: String((row as any).archived_at || ''),
          fileUrl: String((row as any).google_web_view_link || ''),
          folderUrl: driveFolderUrl(String((row as any).google_folder_id || '')),
        }
      }
    }

    return NextResponse.json({
      configured: Boolean(effectiveRoot && configuredDriveCredentials()),
      credentialsConfigured: configuredDriveCredentials(),
      rootConfigured: Boolean(effectiveRoot),
      rootFolderUrl: driveFolderUrl(effectiveRoot),
      serviceAccountEmail: configuredDriveServiceAccountEmail(),
      archives,
      archiveWarning: archiveError?.message || '',
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
    const context = await baseContext(request, true)
    if ('error' in context) return context.error

    const { db, user, parkingLotId, date, lot } = context

    if (!configuredDriveCredentials()) {
      return NextResponse.json(
        { error: 'Vercel 尚未設定 Google Drive 服務帳號 email / private key。' },
        { status: 400 }
      )
    }

    const savedRoot = await savedDriveRoot(db)
    const effectiveRoot = savedRoot || configuredDriveFolder('dengue')
    if (!effectiveRoot) {
      return NextResponse.json(
        { error: '尚未設定公司 Google Drive 總資料夾，請主管先到報表中心完成 Drive 總資料夾設定。' },
        { status: 400 }
      )
    }

    const { data, error } = await db
      .from('dengue_prevention_photos')
      .select(
        'id,parking_lot_id,work_date,work_type,file_kind,storage_path,file_name,mime_type,uploaded_at'
      )
      .eq('parking_lot_id', parkingLotId)
      .eq('work_date', date)
      .order('work_type')
      .order('file_kind')
      .order('uploaded_at')

    if (error) throw new Error(error.message)

    const rows = (data || []) as DengueRow[]
    if (!rows.length) {
      return NextResponse.json(
        { error: '這一天沒有可上傳的登革熱作業資料。' },
        { status: 404 }
      )
    }

    const lotName = String((lot as any).name || '停車場')
    const { bytes, fileCount, failedCount } = await buildDailyZip(
      db,
      rows,
      date,
      lotName
    )

    const checksum = sha256(bytes)
    const month = date.slice(0, 7)
    const reportMonth = `${month}-01`
    const sourceKey = `dengue-daily:${parkingLotId}:${date}`
    const fileName = `${date}_${safeName(lotName)}_登革熱消毒.zip`

    const { data: exists, error: existsError } = await db
      .from('report_center_drive_archives')
      .select('id,google_file_id,google_folder_id,google_web_view_link,archived_at')
      .eq('category', 'dengue')
      .eq('report_month', reportMonth)
      .eq('source_key', sourceKey)
      .eq('content_sha256', checksum)
      .maybeSingle()

    if (existsError) throw new Error(`歸檔紀錄檢查失敗：${existsError.message}`)

    if (exists) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        uploaded: 0,
        fileName,
        fileCount,
        failedCount,
        archivedAt: (exists as any).archived_at,
        fileUrl: String((exists as any).google_web_view_link || ''),
        folderUrl: driveFolderUrl(String((exists as any).google_folder_id || '')),
        message: '這一天目前的內容已經上傳過，這次沒有重複建立檔案。',
      })
    }

    const folderId = await resolveReportFolder({
      category: 'dengue',
      month,
      parkingLotName: lotName,
      rootFolderIdOverride: savedRoot || undefined,
    })

    const driveFile = await uploadToGoogleDrive({
      folderId,
      fileName,
      mimeType: 'application/zip',
      bytes,
    })

    const { error: insertError } = await db
      .from('report_center_drive_archives')
      .insert({
        category: 'dengue',
        report_month: reportMonth,
        parking_lot_id: parkingLotId,
        source_key: sourceKey,
        content_sha256: checksum,
        file_name: fileName,
        google_file_id: driveFile.id,
        google_folder_id: folderId,
        google_web_view_link: driveFile.webViewLink || null,
        archived_by: user.id,
        metadata: {
          work_date: date,
          file_count: fileCount,
          failed_count: failedCount,
          source_row_ids: rows.map((row) => row.id),
          upload_mode: 'parking_lot_manual',
        },
      })

    if (insertError) throw new Error(`Google Drive 歸檔紀錄寫入失敗：${insertError.message}`)

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: parkingLotId,
        action: 'DENGUE_DAILY_GOOGLE_DRIVE_ARCHIVE',
        entity_type: 'dengue_prevention',
        entity_id: null,
        detail: {
          work_date: date,
          file_name: fileName,
          file_count: fileCount,
          failed_count: failedCount,
          google_file_id: driveFile.id,
        },
      })
    } catch {
      // 稽核寫入失敗不阻止主要上傳。
    }

    return NextResponse.json({
      ok: true,
      skipped: false,
      uploaded: 1,
      fileName,
      fileCount,
      failedCount,
      archivedAt: new Date().toISOString(),
      fileUrl: driveFile.webViewLink || '',
      folderUrl: driveFolderUrl(folderId),
      message: '當日資料夾已上傳 Google Drive。',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '登革熱 Google Drive 上傳失敗。' },
      { status: 500 }
    )
  }
}
