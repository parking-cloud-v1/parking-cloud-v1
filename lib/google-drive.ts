import { createSign } from 'crypto'

function env(name: string) {
  return String(process.env[name] || '').trim()
}

function base64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function getAccessToken() {
  const email = env('GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL')
  const rawKey = env('GOOGLE_DRIVE_PRIVATE_KEY')

  if (!email || !rawKey) {
    throw new Error(
      '尚未設定 GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY'
    )
  }

  const privateKey = rawKey.replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)

  const header = base64url(
    JSON.stringify({
      alg: 'RS256',
      typ: 'JWT',
    })
  )

  const payload = base64url(
    JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )

  const unsigned = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()

  const signature = signer
    .sign(privateKey)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  const assertion = `${unsigned}.${signature}`

  const response = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type:
          'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      cache: 'no-store',
    }
  )

  const json = await response.json()

  if (
    !response.ok ||
    !json?.access_token
  ) {
    throw new Error(
      json?.error_description ||
        json?.error ||
        'Google Drive 授權失敗'
    )
  }

  return String(json.access_token)
}

export function configuredDriveFolder(
  category:
    | 'attendance'
    | 'dengue'
    | 'violation'
) {
  const map = {
    attendance:
      'GOOGLE_DRIVE_ATTENDANCE_FOLDER_ID',
    dengue:
      'GOOGLE_DRIVE_DENGUE_FOLDER_ID',
    violation:
      'GOOGLE_DRIVE_VIOLATION_FOLDER_ID',
  } as const

  return env(map[category])
}

export function driveFolderUrl(
  folderId: string
) {
  if (!folderId) return ''

  return `https://drive.google.com/drive/folders/${encodeURIComponent(
    folderId
  )}`
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
    throw new Error(
      '尚未設定此類別的 Google Drive Folder ID'
    )
  }

  const token =
    await getAccessToken()

  const form =
    new FormData()

  form.append(
    'metadata',
    new Blob(
      [
        JSON.stringify({
          name: fileName,
          parents: [folderId],
        }),
      ],
      {
        type: 'application/json',
      }
    )
  )

  form.append(
    'file',
    new Blob(
      [bytes],
      {
        type:
          mimeType ||
          'application/octet-stream',
      }
    ),
    fileName
  )

  const response =
    await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
        body: form,
        cache: 'no-store',
      }
    )

  const json =
    await response.json()

  if (!response.ok) {
    throw new Error(
      json?.error?.message ||
        'Google Drive 上傳失敗'
    )
  }

  return json as {
    id: string
    name: string
    webViewLink?: string
  }
}
