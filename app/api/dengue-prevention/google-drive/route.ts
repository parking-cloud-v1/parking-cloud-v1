import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import JSZip from 'jszip'

import { createClient } from '@/lib/supabase/server'
import {
  configuredDriveCredentials,
  configuredDriveServiceAccountEmail,
  extractDriveFolderId,
  uploadToGoogleDrive,
  verifyDriveFolderAccess,
} from '@/lib/google-drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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

async function supervisorOnly() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null, allowed: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  return {
    user,
    allowed: Boolean(profile?.is_active && profile.role === 'supervisor'),
  }
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
        ? `當日檔案都無法整理：${failures.slice(0, 3).join('；')}`
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

export async function GET() {
  const auth = await supervisorOnly()
  if (!auth.allowed) {
    return NextResponse.json(
      { error: '只有主管可以把登革熱資料直接上傳 Google Drive。' },
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
        { error: '只有主管可以把登革熱資料直接上傳 Google Drive。' },
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
    const date = String(body?.date || '').trim()
    const folderUrl = String(body?.folderUrl || '').trim()
    const folderId = extractDriveFolderId(folderUrl)

    if (!parkingLotId) {
      return NextResponse.json({ error: '缺少停車場。' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '日期格式錯誤。' }, { status: 400 })
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
    const fileName = `${date}_${safeName(lotName)}_登革熱消毒.zip`

    const driveFile = await uploadToGoogleDrive({
      folderId,
      fileName,
      mimeType: 'application/zip',
      bytes,
    })

    try {
      await db.from('system_logs').insert({
        user_id: auth.user.id,
        parking_lot_id: parkingLotId,
        action: 'DENGUE_DIRECT_GOOGLE_DRIVE_UPLOAD',
        entity_type: 'dengue_prevention',
        entity_id: null,
        detail: {
          work_date: date,
          file_name: fileName,
          file_count: fileCount,
          failed_count: failedCount,
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
      fileCount,
      failedCount,
      fileUrl: driveFile.webViewLink || '',
      message: '登革熱當日資料已直接上傳 Google Drive。',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '登革熱 Google Drive 上傳失敗。' },
      { status: 500 }
    )
  }
}
