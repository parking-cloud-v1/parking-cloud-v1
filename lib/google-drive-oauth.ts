import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto'
import { cookies } from 'next/headers'

const REFRESH_COOKIE = 'parking_gdrive_refresh_v1'
const OAUTH_STATE_COOKIE = 'parking_gdrive_state_v1'
const OAUTH_RETURN_COOKIE = 'parking_gdrive_return_v1'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

type OAuthConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

type TokenCacheEntry = {
  accessToken: string
  expiresAt: number
}

const accessTokenCache = new Map<string, TokenCacheEntry>()

function env(name: string) {
  return String(process.env[name] || '').trim()
}

export function getGoogleDriveOAuthConfig(): OAuthConfig {
  return {
    clientId: env('GOOGLE_DRIVE_OAUTH_CLIENT_ID'),
    clientSecret: env('GOOGLE_DRIVE_OAUTH_CLIENT_SECRET'),
    redirectUri: env('GOOGLE_DRIVE_OAUTH_REDIRECT_URI'),
  }
}

export function configuredGoogleDriveOAuth() {
  const config = getGoogleDriveOAuthConfig()
  return Boolean(config.clientId && config.clientSecret && config.redirectUri)
}

function encryptionKey() {
  const { clientSecret } = getGoogleDriveOAuthConfig()
  if (!clientSecret) {
    throw new Error('Vercel 尚未設定 GOOGLE_DRIVE_OAUTH_CLIENT_SECRET')
  }
  return createHash('sha256').update(clientSecret, 'utf8').digest()
}

export function encryptGoogleDriveRefreshToken(value: string) {
  const token = String(value || '').trim()
  if (!token) throw new Error('Google OAuth refresh token 為空')

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function decryptGoogleDriveRefreshToken(value: string) {
  try {
    const packed = Buffer.from(String(value || ''), 'base64url')
    if (packed.length <= 28) return ''

    const iv = packed.subarray(0, 12)
    const tag = packed.subarray(12, 28)
    const encrypted = packed.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
    decipher.setAuthTag(tag)

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return ''
  }
}

export const googleDriveOAuthCookieNames = {
  refresh: REFRESH_COOKIE,
  state: OAUTH_STATE_COOKIE,
  returnTo: OAUTH_RETURN_COOKIE,
} as const

export function googleDriveOAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
}

export function newGoogleDriveOAuthState() {
  return randomBytes(24).toString('base64url')
}

export function buildGoogleDriveAuthorizationUrl(state: string) {
  const config = getGoogleDriveOAuthConfig()
  if (!configuredGoogleDriveOAuth()) {
    throw new Error(
      'Vercel 尚未設定 GOOGLE_DRIVE_OAUTH_CLIENT_ID / GOOGLE_DRIVE_OAUTH_CLIENT_SECRET / GOOGLE_DRIVE_OAUTH_REDIRECT_URI'
    )
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', DRIVE_SCOPE)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeGoogleDriveCode(code: string) {
  const config = getGoogleDriveOAuthConfig()
  if (!configuredGoogleDriveOAuth()) {
    throw new Error('Google Drive OAuth 環境變數尚未設定完整')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  })

  const json = await response.json()
  if (!response.ok || !json?.access_token) {
    throw new Error(
      json?.error_description || json?.error || 'Google OAuth 授權交換失敗'
    )
  }

  return {
    accessToken: String(json.access_token),
    refreshToken: String(json.refresh_token || ''),
    expiresIn: Number(json.expires_in || 3600),
  }
}

export async function storedGoogleDriveRefreshToken() {
  const store = await cookies()
  const encrypted = store.get(REFRESH_COOKIE)?.value || ''
  if (!encrypted) return ''
  return decryptGoogleDriveRefreshToken(encrypted)
}

export async function hasGoogleDriveOAuthConnection() {
  return Boolean(await storedGoogleDriveRefreshToken())
}

export async function getGoogleDriveAccessToken() {
  const config = getGoogleDriveOAuthConfig()
  if (!configuredGoogleDriveOAuth()) {
    throw new Error('Google Drive OAuth 環境變數尚未設定完整')
  }

  const refreshToken = await storedGoogleDriveRefreshToken()
  if (!refreshToken) {
    throw new Error('尚未連結 Google Drive，請主管先按「連結 Google Drive」。')
  }

  const cacheKey = createHash('sha256').update(refreshToken, 'utf8').digest('hex')
  const cached = accessTokenCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.accessToken
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })

  const json = await response.json()
  if (!response.ok || !json?.access_token) {
    throw new Error(
      json?.error_description ||
        json?.error ||
        'Google Drive 授權已失效，請重新連結 Google Drive。'
    )
  }

  const accessToken = String(json.access_token)
  const expiresIn = Math.max(60, Number(json.expires_in || 3600))
  accessTokenCache.set(cacheKey, {
    accessToken,
    expiresAt: Date.now() + Math.max(60, expiresIn - 120) * 1000,
  })

  return accessToken
}
