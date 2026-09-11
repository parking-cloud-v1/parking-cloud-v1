import {
  configuredGoogleDriveOAuth,
  getGoogleDriveAccessToken,
} from '@/lib/google-drive-oauth'

export type DriveCategory =
  | 'attendance'
  | 'rentals'
  | 'changes'
  | 'taxi'
  | 'shift'
  | 'disaster'
  | 'dengue'
  | 'violation'

const CATEGORY_ENV: Record<DriveCategory, string> = {
  attendance: 'GOOGLE_DRIVE_ATTENDANCE_FOLDER_ID',
  rentals: 'GOOGLE_DRIVE_RENTALS_FOLDER_ID',
  changes: 'GOOGLE_DRIVE_CHANGES_FOLDER_ID',
  taxi: 'GOOGLE_DRIVE_TAXI_FOLDER_ID',
  shift: 'GOOGLE_DRIVE_SHIFT_FOLDER_ID',
  disaster: 'GOOGLE_DRIVE_DISASTER_FOLDER_ID',
  dengue: 'GOOGLE_DRIVE_DENGUE_FOLDER_ID',
  violation: 'GOOGLE_DRIVE_VIOLATION_FOLDER_ID',
}

export const DRIVE_CATEGORY_LABELS: Record<DriveCategory, string> = {
  attendance: '每月簽到表',
  rentals: '月租總表',
  changes: '月租簽約異動',
  taxi: '計程車優惠報表',
  shift: '當日結班報表',
  disaster: '防災檢查',
  dengue: '登革熱消毒作業',
  violation: '違規停車案件',
}

function env(name: string) {
  return String(process.env[name] || '').trim()
}

/**
 * 舊呼叫名稱保留，避免其他尚未清掉的模組 Build 失敗。
 * 現在代表「OAuth Client 三個環境變數是否完整」，不再代表服務帳號。
 */
export function configuredDriveCredentials() {
  return configuredGoogleDriveOAuth()
}

/** 已停用服務帳號模式，保留函式只為舊程式相容。 */
export function configuredDriveServiceAccountEmail() {
  return ''
}

export function extractDriveFolderId(value: string) {
  const input = String(value || '').trim()
  if (!input) return ''

  if (/^[A-Za-z0-9_-]{10,}$/.test(input)) {
    return input
  }

  try {
    const url = new URL(input)
    if (url.hostname !== 'drive.google.com') return ''

    const folderMatch = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/)
    if (folderMatch?.[1]) return folderMatch[1]

    const id = url.searchParams.get('id')
    if (id && /^[A-Za-z0-9_-]{10,}$/.test(id)) return id
  } catch {
    return ''
  }

  return ''
}

export async function verifyDriveFolderAccess(folderId: string) {
  const id = String(folderId || '').trim()
  if (!id) throw new Error('Google Drive 資料夾網址格式不正確')

  const token = await getGoogleDriveAccessToken()
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`
  )
  url.searchParams.set('fields', 'id,name,mimeType,capabilities(canAddChildren)')
  url.searchParams.set('supportsAllDrives', 'true')

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const json = await response.json()

  if (!response.ok) {
    throw new Error(
      json?.error?.message ||
        '目前連結的 Google 帳號無法存取這個資料夾，請確認網址與帳號權限。'
    )
  }
  if (json?.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('指定的 Google Drive 連結不是資料夾')
  }
  if (json?.capabilities?.canAddChildren === false) {
    throw new Error('目前連結的 Google 帳號沒有此資料夾的上傳／編輯權限')
  }

  return { id: String(json.id), name: String(json.name || '') }
}

export function configuredDriveRoot() {
  return env('GOOGLE_DRIVE_REPORTS_FOLDER_ID')
}

export function configuredCategoryFolder(category: DriveCategory) {
  return env(CATEGORY_ENV[category])
}

export function configuredDriveFolder(category: DriveCategory) {
  return configuredDriveRoot() || configuredCategoryFolder(category)
}

export function driveFolderUrl(folderId: string) {
  if (!folderId) return ''
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

const folderCache = new Map<string, string>()

async function findFolder(token: string, parentId: string, name: string) {
  const q = [
    `mimeType='application/vnd.google-apps.folder'`,
    `name='${escapeDriveQuery(name)}'`,
    `'${escapeDriveQuery(parentId)}' in parents`,
    'trashed=false',
  ].join(' and ')

  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', q)
  url.searchParams.set('fields', 'files(id,name)')
  url.searchParams.set('pageSize', '1')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('includeItemsFromAllDrives', 'true')

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const json = await response.json()

  if (!response.ok) {
    throw new Error(json?.error?.message || 'Google Drive 資料夾查詢失敗')
  }

  return String(json?.files?.[0]?.id || '')
}

async function createFolder(token: string, parentId: string, name: string) {
  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
      cache: 'no-store',
    }
  )

  const json = await response.json()
  if (!response.ok || !json?.id) {
    throw new Error(json?.error?.message || 'Google Drive 資料夾建立失敗')
  }

  return String(json.id)
}

async function ensureFolder(token: string, parentId: string, name: string) {
  const safeName = String(name || '未分類').trim() || '未分類'
  const cacheKey = `${parentId}::${safeName}`
  const cached = folderCache.get(cacheKey)
  if (cached) return cached

  const existing = await findFolder(token, parentId, safeName)
  if (existing) {
    folderCache.set(cacheKey, existing)
    return existing
  }

  const created = await createFolder(token, parentId, safeName)
  folderCache.set(cacheKey, created)
  return created
}

/**
 * 舊報表歸檔函式保留相容；目前正式報表中心已改為純下載，不會呼叫這段。
 */
export async function resolveReportFolder({
  category,
  month,
  parkingLotName,
  rootFolderIdOverride,
}: {
  category: DriveCategory
  month: string
  parkingLotName: string
  rootFolderIdOverride?: string
}) {
  const root = String(rootFolderIdOverride || '').trim() || configuredDriveRoot()
  const categoryRoot = configuredCategoryFolder(category)

  if (!root && !categoryRoot) {
    throw new Error('目前報表中心為純下載模式，沒有設定預設 Google Drive Folder ID。')
  }

  const token = await getGoogleDriveAccessToken()

  if (root) {
    const monthFolder = await ensureFolder(token, root, month)
    const lotFolder = await ensureFolder(token, monthFolder, parkingLotName)
    return ensureFolder(token, lotFolder, DRIVE_CATEGORY_LABELS[category])
  }

  const monthFolder = await ensureFolder(token, categoryRoot, month)
  return ensureFolder(token, monthFolder, parkingLotName)
}

export async function uploadToGoogleDrive({
  folderId,
  fileName,
  mimeType,
  bytes,
}: {
  folderId: string
  fileName: string
  mimeType: string
  bytes: ArrayBuffer
}) {
  if (!folderId) {
    throw new Error('缺少 Google Drive 資料夾 ID')
  }

  const token = await getGoogleDriveAccessToken()
  const form = new FormData()

  form.append(
    'metadata',
    new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], {
      type: 'application/json',
    })
  )

  form.append(
    'file',
    new Blob([bytes], { type: mimeType || 'application/octet-stream' }),
    fileName
  )

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      cache: 'no-store',
    }
  )

  const json = await response.json()
  if (!response.ok) {
    throw new Error(json?.error?.message || 'Google Drive 上傳失敗')
  }

  return json as {
    id: string
    name: string
    webViewLink?: string
  }
}
