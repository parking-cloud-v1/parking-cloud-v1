import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createSign,
  randomBytes,
} from 'crypto'
import { cookies } from 'next/headers'

const REFRESH_COOKIE =
  'parking_gdrive_refresh_v1'

const OAUTH_STATE_COOKIE =
  'parking_gdrive_state_v1'

const OAUTH_RETURN_COOKIE =
  'parking_gdrive_return_v1'

const DRIVE_SCOPE =
  'https://www.googleapis.com/auth/drive'

type OAuthConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

type TokenCacheEntry = {
  accessToken: string
  expiresAt: number
}

const accessTokenCache =
  new Map<string, TokenCacheEntry>()

let serviceAccountTokenCache:
  | TokenCacheEntry
  | null = null

function env(name: string) {
  return String(
    process.env[name] || ''
  ).trim()
}

/**
 * Service Account 設定仍保留，
 * 避免其他舊程式 import 此函式時發生錯誤。
 *
 * 但 Google Drive 實際上傳流程
 * 已經不會再自動使用 Service Account。
 */
function serviceAccountEmail() {
  return (
    env(
      'GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL'
    ) ||
    env(
      'GOOGLE_SERVICE_ACCOUNT_EMAIL'
    )
  )
}

function serviceAccountPrivateKey() {
  return (
    env(
      'GOOGLE_DRIVE_PRIVATE_KEY'
    ) ||
    env(
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'
    )
  )
}

export function configuredGoogleDriveServiceAccount() {
  return Boolean(
    serviceAccountEmail() &&
      serviceAccountPrivateKey()
  )
}

function base64url(
  input: string | Buffer
) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

/**
 * 舊 Service Account 函式保留相容性。
 *
 * 注意：
 * getGoogleDriveAccessToken()
 * 已經不會呼叫這個函式。
 */
async function getGoogleDriveServiceAccountAccessToken() {
  const email =
    serviceAccountEmail()

  const rawKey =
    serviceAccountPrivateKey()

  if (!email || !rawKey) {
    throw new Error(
      'Vercel 尚未設定 GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY'
    )
  }

  if (
    serviceAccountTokenCache &&
    Date.now() <
      serviceAccountTokenCache.expiresAt
  ) {
    return serviceAccountTokenCache.accessToken
  }

  const privateKey =
    rawKey.replace(
      /\\n/g,
      '\n'
    )

  const now =
    Math.floor(
      Date.now() / 1000
    )

  const header =
    base64url(
      JSON.stringify({
        alg: 'RS256',
        typ: 'JWT',
      })
    )

  const payload =
    base64url(
      JSON.stringify({
        iss: email,
        scope: DRIVE_SCOPE,
        aud:
          'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })
    )

  const unsigned =
    `${header}.${payload}`

  const signer =
    createSign(
      'RSA-SHA256'
    )

  signer.update(unsigned)
  signer.end()

  const signature =
    signer
      .sign(privateKey)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')

  const assertion =
    `${unsigned}.${signature}`

  const response =
    await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },

        body:
          new URLSearchParams({
            grant_type:
              'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
          }),

        cache: 'no-store',
      }
    )

  const json =
    await response.json()

  if (
    !response.ok ||
    !json?.access_token
  ) {
    throw new Error(
      json?.error_description ||
        json?.error ||
        'Google Drive Service Account 授權失敗'
    )
  }

  const accessToken =
    String(
      json.access_token
    )

  const expiresIn =
    Math.max(
      60,
      Number(
        json.expires_in || 3600
      )
    )

  serviceAccountTokenCache = {
    accessToken,

    expiresAt:
      Date.now() +
      Math.max(
        60,
        expiresIn - 120
      ) *
        1000,
  }

  return accessToken
}

/**
 * Google Drive OAuth 設定。
 *
 * 現在正式的 Drive 上傳
 * 一律使用主管 Google 帳號 OAuth。
 */
export function getGoogleDriveOAuthConfig(): OAuthConfig {
  return {
    clientId:
      env(
        'GOOGLE_DRIVE_OAUTH_CLIENT_ID'
      ),

    clientSecret:
      env(
        'GOOGLE_DRIVE_OAUTH_CLIENT_SECRET'
      ),

    redirectUri:
      env(
        'GOOGLE_DRIVE_OAUTH_REDIRECT_URI'
      ),
  }
}

export function configuredGoogleDriveOAuth() {
  const config =
    getGoogleDriveOAuthConfig()

  return Boolean(
    config.clientId &&
      config.clientSecret &&
      config.redirectUri
  )
}

function encryptionKey() {
  const {
    clientSecret,
  } =
    getGoogleDriveOAuthConfig()

  if (!clientSecret) {
    throw new Error(
      'Vercel 尚未設定 GOOGLE_DRIVE_OAUTH_CLIENT_SECRET'
    )
  }

  return createHash(
    'sha256'
  )
    .update(
      clientSecret,
      'utf8'
    )
    .digest()
}

export function encryptGoogleDriveRefreshToken(
  value: string
) {
  const token =
    String(
      value || ''
    ).trim()

  if (!token) {
    throw new Error(
      'Google OAuth refresh token 為空'
    )
  }

  const iv =
    randomBytes(12)

  const cipher =
    createCipheriv(
      'aes-256-gcm',
      encryptionKey(),
      iv
    )

  const encrypted =
    Buffer.concat([
      cipher.update(
        token,
        'utf8'
      ),
      cipher.final(),
    ])

  const tag =
    cipher.getAuthTag()

  return Buffer.concat([
    iv,
    tag,
    encrypted,
  ]).toString(
    'base64url'
  )
}

export function decryptGoogleDriveRefreshToken(
  value: string
) {
  try {
    const packed =
      Buffer.from(
        String(
          value || ''
        ),
        'base64url'
      )

    if (
      packed.length <= 28
    ) {
      return ''
    }

    const iv =
      packed.subarray(
        0,
        12
      )

    const tag =
      packed.subarray(
        12,
        28
      )

    const encrypted =
      packed.subarray(28)

    const decipher =
      createDecipheriv(
        'aes-256-gcm',
        encryptionKey(),
        iv
      )

    decipher.setAuthTag(tag)

    return Buffer.concat([
      decipher.update(
        encrypted
      ),
      decipher.final(),
    ]).toString(
      'utf8'
    )
  } catch {
    return ''
  }
}

export const googleDriveOAuthCookieNames =
  {
    refresh:
      REFRESH_COOKIE,

    state:
      OAUTH_STATE_COOKIE,

    returnTo:
      OAUTH_RETURN_COOKIE,
  } as const

export function googleDriveOAuthCookieOptions() {
  return {
    httpOnly: true,

    secure:
      process.env.NODE_ENV ===
      'production',

    sameSite:
      'lax' as const,

    path: '/',
  }
}

export function newGoogleDriveOAuthState() {
  return randomBytes(
    24
  ).toString(
    'base64url'
  )
}

export function buildGoogleDriveAuthorizationUrl(
  state: string
) {
  const config =
    getGoogleDriveOAuthConfig()

  if (
    !configuredGoogleDriveOAuth()
  ) {
    throw new Error(
      'Vercel 尚未設定 GOOGLE_DRIVE_OAUTH_CLIENT_ID / GOOGLE_DRIVE_OAUTH_CLIENT_SECRET / GOOGLE_DRIVE_OAUTH_REDIRECT_URI'
    )
  }

  const url =
    new URL(
      'https://accounts.google.com/o/oauth2/v2/auth'
    )

  url.searchParams.set(
    'client_id',
    config.clientId
  )

  url.searchParams.set(
    'redirect_uri',
    config.redirectUri
  )

  url.searchParams.set(
    'response_type',
    'code'
  )

  url.searchParams.set(
    'scope',
    DRIVE_SCOPE
  )

  url.searchParams.set(
    'access_type',
    'offline'
  )

  /*
   * 每次重新授權都要求 Google 回傳 refresh token。
   * 這樣就算之前的 token 被撤銷，
   * 重新按連結 Google Drive 後也能恢復。
   */
  url.searchParams.set(
    'prompt',
    'consent'
  )

  url.searchParams.set(
    'include_granted_scopes',
    'true'
  )

  url.searchParams.set(
    'state',
    state
  )

  return url.toString()
}

export async function exchangeGoogleDriveCode(
  code: string
) {
  const config =
    getGoogleDriveOAuthConfig()

  if (
    !configuredGoogleDriveOAuth()
  ) {
    throw new Error(
      'Google Drive OAuth 環境變數尚未設定完整'
    )
  }

  const response =
    await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },

        body:
          new URLSearchParams({
            code,

            client_id:
              config.clientId,

            client_secret:
              config.clientSecret,

            redirect_uri:
              config.redirectUri,

            grant_type:
              'authorization_code',
          }),

        cache:
          'no-store',
      }
    )

  const json =
    await response.json()

  if (
    !response.ok ||
    !json?.access_token
  ) {
    throw new Error(
      json?.error_description ||
        json?.error ||
        'Google OAuth 授權交換失敗'
    )
  }

  return {
    accessToken:
      String(
        json.access_token
      ),

    refreshToken:
      String(
        json.refresh_token || ''
      ),

    expiresIn:
      Number(
        json.expires_in || 3600
      ),
  }
}

export async function storedGoogleDriveRefreshToken() {
  const store =
    await cookies()

  const encrypted =
    store.get(
      REFRESH_COOKIE
    )?.value || ''

  if (!encrypted) {
    return ''
  }

  return decryptGoogleDriveRefreshToken(
    encrypted
  )
}

/**
 * Google Drive 是否真的已經授權。
 *
 * 不再因為 Service Account 有設定
 * 就誤判成「Google Drive 已連結」。
 *
 * 這裡會實際嘗試取得 access token，
 * refresh token 如果已過期或被撤銷，
 * 就直接回傳 false。
 */
export async function hasGoogleDriveOAuthConnection() {
  if (
    !configuredGoogleDriveOAuth()
  ) {
    return false
  }

  const refreshToken =
    await storedGoogleDriveRefreshToken()

  if (!refreshToken) {
    return false
  }

  try {
    await getGoogleDriveAccessToken()
    return true
  } catch {
    return false
  }
}

/**
 * Google Drive 正式上傳權限來源。
 *
 * ★ 現在只使用主管本人 Google OAuth。
 *
 * 不再：
 * - 優先 Service Account
 * - 自動切換 Service Account
 * - 要求每個 Drive 資料夾分享給 Service Account
 *
 * 主管授權自己的 Google 帳號一次之後，
 * 只要該 Google 帳號本身能存取資料夾，
 * 系統就能直接上傳。
 */
export async function getGoogleDriveAccessToken() {
  const config =
    getGoogleDriveOAuthConfig()

  if (
    !configuredGoogleDriveOAuth()
  ) {
    throw new Error(
      'Google Drive OAuth 環境變數尚未設定完整'
    )
  }

  const refreshToken =
    await storedGoogleDriveRefreshToken()

  if (!refreshToken) {
    throw new Error(
      '尚未連結 Google Drive，請主管先完成 Google 帳號授權。'
    )
  }

  const cacheKey =
    createHash(
      'sha256'
    )
      .update(
        refreshToken,
        'utf8'
      )
      .digest(
        'hex'
      )

  const cached =
    accessTokenCache.get(
      cacheKey
    )

  if (
    cached &&
    Date.now() <
      cached.expiresAt
  ) {
    return cached.accessToken
  }

  const response =
    await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },

        body:
          new URLSearchParams({
            client_id:
              config.clientId,

            client_secret:
              config.clientSecret,

            refresh_token:
              refreshToken,

            grant_type:
              'refresh_token',
          }),

        cache:
          'no-store',
      }
    )

  const json =
    await response.json()

  if (
    !response.ok ||
    !json?.access_token
  ) {
    /*
     * 如果 Google 把 refresh token 撤銷，
     * 不再自動退回 Service Account。
     * 直接要求主管重新授權即可。
     */
    throw new Error(
      json?.error_description ||
        json?.error ||
        'Google Drive OAuth 授權已失效，請重新連結 Google Drive。'
    )
  }

  const accessToken =
    String(
      json.access_token
    )

  const expiresIn =
    Math.max(
      60,
      Number(
        json.expires_in || 3600
      )
    )

  accessTokenCache.set(
    cacheKey,
    {
      accessToken,

      expiresAt:
        Date.now() +
        Math.max(
          60,
          expiresIn - 120
        ) *
          1000,
    }
  )

  return accessToken
}