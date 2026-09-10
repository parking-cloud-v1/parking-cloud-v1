import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  configuredDriveCredentials,
  configuredDriveFolder,
  configuredDriveRoot,
  configuredDriveServiceAccountEmail,
  driveFolderUrl,
  resolveReportFolder,
  uploadToGoogleDrive,
  verifyDriveFolderAccess,
  type DriveCategory,
} from '@/lib/google-drive'
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_META,
  collectReportItems,
  itemBytes,
  type LotRow,
  type ReportCategory,
} from '@/lib/report-center-export'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SETTING_KEY = 'google_drive_root_folder_id'

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

function parseDriveFolderId(input: unknown) {
  const value = String(input || '').trim()
  if (!value) return ''

  const match = value.match(/\/folders\/([A-Za-z0-9_-]+)/i)
  if (match?.[1]) return match[1]

  if (/^[A-Za-z0-9_-]{10,}$/.test(value)) return value
  throw new Error('Google Drive 資料夾格式不正確，請貼上資料夾網址或 Folder ID。')
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
  let query = db.from('parking_lots').select('id,name').eq('status', 'active').order('name')

  if (role === 'manager') {
    const { data: assignments, error } = await db
      .from('user_parking_lots')
      .select('parking_lot_id')
      .eq('user_id', userId)

    if (error) throw new Error(`停車場權限讀取失敗：${error.message}`)

    const ids = Array.from(
      new Set(
        (assignments || [])
          .map((row: any) => String(row.parking_lot_id || ''))
          .filter(Boolean)
      )
    )

    if (!ids.length) return [] as LotRow[]
    query = query.in('id', ids)
  }

  const { data, error } = await query
  if (error) throw new Error(`停車場讀取失敗：${error.message}`)
  return (data || []) as LotRow[]
}

async function savedDriveRoot(db: ReturnType<typeof admin>) {
  const { data, error } = await db
    .from('report_center_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle()

  // 尚未執行第 6 段第 10 修正 SQL 時，不讓整個報表中心掛掉；仍可退回 Vercel env。
  if (error) return ''
  return String((data as any)?.value || '').trim()
}

function effectiveFolder(savedRoot: string, category: ReportCategory) {
  return savedRoot || configuredDriveFolder(category as DriveCategory)
}

function sha256(bytes: ArrayBuffer) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

async function archiveCount(
  db: ReturnType<typeof admin>,
  category: ReportCategory,
  month: string,
  lots: LotRow[]
) {
  if (!lots.length) return 0

  let query = db
    .from('report_center_drive_archives')
    .select('id', { count: 'exact', head: true })
    .eq('category', category)
    .eq('report_month', monthStart(month))
    .in('parking_lot_id', lots.map((lot) => lot.id))

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

    const savedRoot = await savedDriveRoot(db)
    const configured = {} as Record<ReportCategory, boolean>
    const folderUrls = {} as Record<ReportCategory, string>
    const counts = {} as Record<ReportCategory, number>
    const archiveCounts = {} as Record<ReportCategory, number>
    const categoryErrors = {} as Partial<Record<ReportCategory, string>>

    // 每個類別獨立讀取，單一資料表異常不再拖垮整個報表中心。
    for (const category of REPORT_CATEGORIES) {
      const root = effectiveFolder(savedRoot, category)
      configured[category] = Boolean(root && configuredDriveCredentials())
      folderUrls[category] = driveFolderUrl(root)

      try {
        const items = await collectReportItems(db, category, month, lots)
        counts[category] = items.length
      } catch (error: any) {
        counts[category] = 0
        categoryErrors[category] = error?.message || '資料讀取失敗'
      }

      try {
        archiveCounts[category] = await archiveCount(db, category, month, lots)
      } catch (error: any) {
        archiveCounts[category] = 0
        categoryErrors[category] = categoryErrors[category]
          ? `${categoryErrors[category]}；歸檔紀錄：${error?.message || '讀取失敗'}`
          : `歸檔紀錄：${error?.message || '讀取失敗'}`
      }
    }

    const root = savedRoot || configuredDriveRoot()

    return NextResponse.json({
      configured,
      folderUrls,
      counts,
      archiveCounts,
      categoryErrors,
      role: profile.role,
      lotCount: lots.length,
      driveRootFolderId: root,
      driveRootFolderUrl: driveFolderUrl(root),
      driveRootSettingSource: savedRoot ? 'database' : configuredDriveRoot() ? 'environment' : 'legacy',
      driveCredentialsConfigured: configuredDriveCredentials(),
      serviceAccountEmail: configuredDriveServiceAccountEmail(),
      categories: REPORT_CATEGORIES.map((category) => ({
        key: category,
        ...REPORT_CATEGORY_META[category],
      })),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Google Drive 狀態讀取失敗。' },
      { status: 500 }
    )
  }
}

/**
 * 主管可直接在報表中心儲存公司 Google Drive「報表總資料夾」。
 * 只儲存 Folder ID；服務帳號 email/private key 仍只放 Vercel 環境變數。
 */
export async function PUT(request: Request) {
  try {
    const { user, profile } = await authorize()
    if (!user || !profile?.is_active || profile.role !== 'supervisor') {
      return NextResponse.json({ error: '只有主管可以設定 Google Drive 總資料夾。' }, { status: 403 })
    }

    if (!configuredDriveCredentials()) {
      return NextResponse.json(
        { error: 'Vercel 尚未設定 Google Drive 服務帳號 email / private key。' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const folderId = parseDriveFolderId(body?.folder)
    if (!folderId) {
      return NextResponse.json({ error: '請輸入 Google Drive 資料夾網址或 Folder ID。' }, { status: 400 })
    }

    // 先確認服務帳號真的看得到且可新增子資料夾，避免「設定成功但仍無法上傳」。
    const folder = await verifyDriveFolderAccess(folderId)
    const db = admin()

    const { error } = await db.from('report_center_settings').upsert(
      {
        key: SETTING_KEY,
        value: folderId,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )

    if (error) {
      throw new Error(
        error.code === '42P01'
          ? '尚未建立 report_center_settings，請先執行第 6 段第 10 修正 SQL。'
          : error.message
      )
    }

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: null,
        action: 'REPORT_CENTER_DRIVE_ROOT_UPDATED',
        entity_type: 'report_center_settings',
        entity_id: null,
        detail: { folder_id: folderId, folder_name: folder.name },
      })
    } catch {
      // 稽核紀錄失敗不阻止設定。
    }

    return NextResponse.json({
      ok: true,
      folderId,
      folderName: folder.name,
      folderUrl: driveFolderUrl(folderId),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Google Drive 資料夾設定失敗。' },
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
    const category = String(body?.category || '') as ReportCategory
    const month = String(body?.month || '').trim()

    if (!REPORT_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: '上傳類型錯誤。' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: '月份格式錯誤。' }, { status: 400 })
    }
    if (!configuredDriveCredentials()) {
      return NextResponse.json(
        { error: 'Vercel 尚未設定 Google Drive 服務帳號 email / private key。' },
        { status: 400 }
      )
    }

    const db = admin()
    const savedRoot = await savedDriveRoot(db)
    if (!effectiveFolder(savedRoot, category)) {
      return NextResponse.json(
        { error: '尚未設定公司 Google Drive 報表總資料夾，請主管先在報表中心完成設定。' },
        { status: 400 }
      )
    }

    const lots = await allowedLots(db, user.id, profile.role)
    if (!lots.length) {
      return NextResponse.json({ error: '目前沒有指派可歸檔的停車場。' }, { status: 403 })
    }

    const items = await collectReportItems(db, category, month, lots)
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
          category: category as DriveCategory,
          month,
          parkingLotName: item.parkingLotName,
          rootFolderIdOverride: savedRoot || undefined,
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

    const effectiveRoot = effectiveFolder(savedRoot, category)

    return NextResponse.json({
      ok: failures.length === 0,
      uploaded,
      skipped,
      failed: failures.length,
      failures: failures.slice(0, 20),
      folderUrl: driveFolderUrl(effectiveRoot),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Google Drive 歸檔失敗。' },
      { status: 500 }
    )
  }
}
