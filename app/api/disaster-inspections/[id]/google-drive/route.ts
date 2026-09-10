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

export async function GET() {
  const auth = await supervisorOnly()
  if (!auth.allowed) {
    return NextResponse.json(
      { error: '只有主管可以把防災檢查直接上傳 Google Drive。' },
      { status: 403 }
    )
  }

  return NextResponse.json({
    credentialsConfigured: configuredDriveCredentials(),
    serviceAccountEmail: configuredDriveServiceAccountEmail(),
    directFolderMode: true,
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await supervisorOnly()
    if (!auth.allowed || !auth.user) {
      return NextResponse.json(
        { error: '只有主管可以把防災檢查直接上傳 Google Drive。' },
        { status: 403 }
      )
    }

    if (!configuredDriveCredentials()) {
      return NextResponse.json(
        { error: 'Vercel 尚未設定 Google Drive 服務帳號 email / private key。' },
        { status: 400 }
      )
    }

    const { id } = await context.params
    const body = await request.json().catch(() => ({}))
    const folderUrl = String(body?.folderUrl || '').trim()
    const folderId = extractDriveFolderId(folderUrl)

    if (!folderId) {
      return NextResponse.json(
        { error: '請貼上正確的 Google Drive 資料夾網址。' },
        { status: 400 }
      )
    }

    await verifyDriveFolderAccess(folderId)

    const db = admin()
    const { data: inspection, error } = await db
      .from('disaster_inspections')
      .select(`
        id,
        parking_lot_id,
        inspection_date,
        pdf_path,
        pdf_file_name,
        parking_lots (name)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error || !inspection) {
      return NextResponse.json(
        { error: error?.message || '找不到防災檢查資料。' },
        { status: 404 }
      )
    }

    const pdfPath = String((inspection as any).pdf_path || '')
    if (!pdfPath) {
      return NextResponse.json(
        {
          error:
            '這筆尚未產生正式 PDF。請在檢查表頁先開啟預覽，再按「直接上傳 Google Drive」，系統會產生 PDF 並直接上傳，不需要先下載。',
        },
        { status: 409 }
      )
    }

    const { data: blob, error: downloadError } = await db.storage
      .from('disaster-inspection-pdfs')
      .download(pdfPath)

    if (downloadError || !blob) {
      return NextResponse.json(
        { error: `防災正式 PDF 讀取失敗：${downloadError?.message || '找不到檔案'}` },
        { status: 500 }
      )
    }

    const parkingLots = (inspection as any).parking_lots
    const lotName = Array.isArray(parkingLots)
      ? String(parkingLots[0]?.name || '停車場')
      : String(parkingLots?.name || '停車場')
    const fileName =
      String((inspection as any).pdf_file_name || '').trim() ||
      `${lotName}_${String((inspection as any).inspection_date || '')}_防災自主檢查表.pdf`

    const driveFile = await uploadToGoogleDrive({
      folderId,
      fileName,
      mimeType: 'application/pdf',
      bytes: await blob.arrayBuffer(),
    })

    try {
      await db.from('system_logs').insert({
        user_id: auth.user.id,
        parking_lot_id: (inspection as any).parking_lot_id,
        action: 'DISASTER_REPORT_DIRECT_GOOGLE_DRIVE_UPLOAD',
        entity_type: 'disaster_inspection',
        entity_id: id,
        detail: {
          inspection_date: (inspection as any).inspection_date,
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
      fileUrl: driveFile.webViewLink || '',
      message: '防災正式 PDF 已直接上傳 Google Drive。',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '防災檢查 Google Drive 上傳失敗。' },
      { status: 500 }
    )
  }
}
