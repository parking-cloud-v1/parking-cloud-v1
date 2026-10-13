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
  new Map<
    string,
    TokenCacheEntry
  >()

let serviceAccountTokenCache:
  | TokenCacheEntry
  | null = null

function env(
  name: string
) {
  return String(
    process.env[name] ||
      ''
  ).trim()
}

/**
 * Service Account
 * 優先使用新的 Drive 專用變數。
 *
 * 另外保留舊變數名稱作為相容備援，
 * 避免既有 Vercel 設定突然失效。
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
  return Buffer.from(
    input
  )
    .toString(
      'base64'
    )
    .replace(
      /\+/g,
      '-'
    )
    .replace(
      /\//g,
      '_'
    )
    .replace(
      /=+$/g,
      ''
    )
}

/**
 * 使用 Google Service Account JWT
 * 取得 Google OAuth access token。
 *
 * Service Account 本身不依賴使用者 refresh token，
 * 因此不會因原本 OAuth refresh token 被撤銷而失效。
 */
async function getGoogleDriveServiceAccountAccessToken() {
  const email =
    serviceAccountEmail()

  const rawKey =
    serviceAccountPrivateKey()

  if (
    !email ||
    !rawKey
  ) {
    throw new Error(
      'Vercel 尚未設定 GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY'
    )
  }

  if (
    serviceAccountTokenCache &&
    Date.now() <
      serviceAccountTokenCache
        .expiresAt
  ) {
    return serviceAccountTokenCache
      .accessToken
  }

  /**
   * Vercel 的環境變數有時會把換行存成 \n，
   * 這裡統一還原成真正換行。
   */
  const privateKey =
    rawKey.replace(
      /\\n/g,
      '\n'
    )

  const now =
    Math.floor(
      Date.now() /
        1000
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
        scope:
          DRIVE_SCOPE,
        aud:
          'https://oauth2.googleapis.com/token',
        iat: now,
        exp:
          now +
          3600,
      })
    )

  const unsigned =
    `${header}.${payload}`

  const signer =
    createSign(
      'RSA-SHA256'
    )

  signer.update(
    unsigned
  )

  signer.end()

  const signature =
    signer
      .sign(
        privateKey
      )
      .toString(
        'base64'
      )
      .replace(
        /\+/g,
        '-'
      )
      .replace(
        /\//g,
        '_'
      )
      .replace(
        /=+$/g,
        ''
      )

  const assertion =
    `${unsigned}.${signature}`

  const response =
    await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method:
          'POST',

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
      json
        ?.error_description ||
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
        json.expires_in ||
          3600
      )
    )

  serviceAccountTokenCache =
    {
      accessToken,

      expiresAt:
        Date.now() +
        Math.max(
          60,
          expiresIn -
            120
        ) *
          1000,
    }

  return accessToken
}

/**
 * 原本 OAuth 設定保留。
 * 目前只作為 Service Account 沒設定時的備援。
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

  if (
    !clientSecret
  ) {
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
    randomBytes(
      12
    )

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
          value ||
            ''
        ),
        'base64url'
      )

    if (
      packed.length <=
      28
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
      packed.subarray(
        28
      )

    const decipher =
      createDecipheriv(
        'aes-256-gcm',
        encryptionKey(),
        iv
      )

    decipher.setAuthTag(
      tag
    )

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
    httpOnly:
      true,

    secure:
      process.env
        .NODE_ENV ===
      'production',

    sameSite:
      'lax' as const,

    path:
      '/',
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
        method:
          'POST',

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
      json
        ?.error_description ||
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
        json.refresh_token ||
          ''
      ),

    expiresIn:
      Number(
        json.expires_in ||
          3600
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

export async function hasGoogleDriveOAuthConnection() {
  /**
   * 有 Service Account 時，
   * 視同 Google Drive 已可使用。
   */
  if (
    configuredGoogleDriveServiceAccount()
  ) {
    return true
  }

  return Boolean(
    await storedGoogleDriveRefreshToken()
  )
}

/**
 * 所有 Google Drive API
 * 都從這個函式取得 access token。
 *
 * 1. 優先 Service Account
 * 2. 沒有 Service Account 才退回舊 OAuth
 */
export async function getGoogleDriveAccessToken() {
  if (
    configuredGoogleDriveServiceAccount()
  ) {
    return getGoogleDriveServiceAccountAccessToken()
  }

  const config =
    getGoogleDriveOAuthConfig()

  if (
    !configuredGoogleDriveOAuth()
  ) {
    throw new Error(
      'Google Drive 尚未設定 Service Account，OAuth 環境變數也不完整'
    )
  }

  const refreshToken =
    await storedGoogleDriveRefreshToken()

  if (
    !refreshToken
  ) {
    throw new Error(
      '尚未設定 Google Drive Service Account，且尚未連結 Google Drive。'
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
        method:
          'POST',

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
    throw new Error(
      json
        ?.error_description ||
        json?.error ||
        'Google Drive OAuth 授權已失效，請改用 Service Account 或重新連結。'
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
        json.expires_in ||
          3600
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
          expiresIn -
            120
        ) *
          1000,
    }
  )

  return accessToken
}