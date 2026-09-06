import { createHash, createHmac, randomUUID } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

const GENERIC_PUBLIC_ERROR = '系統暫時無法處理，請稍後再試。'

export function requireOtpHashSecret() {
  const secret = String(process.env.OTP_HASH_SECRET || '')
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')

  if (secret.length < 32) {
    throw new Error('OTP_HASH_SECRET_NOT_CONFIGURED')
  }

  if (serviceKey && secret === serviceKey) {
    throw new Error('OTP_HASH_SECRET_MUST_BE_SEPARATE')
  }

  return secret
}

export function hashOtpCode(challengeId: string, code: string) {
  const secret = requireOtpHashSecret()
  return createHmac('sha256', secret)
    .update(`${challengeId}:${code}`)
    .digest('hex')
}

export function hashOpaqueToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function clientAddress(request: NextRequest) {
  const forwarded = String(request.headers.get('x-forwarded-for') || '')
    .split(',')[0]
    .trim()
  const realIp = String(request.headers.get('x-real-ip') || '').trim()
  return (forwarded || realIp || 'unknown').slice(0, 128)
}

function rateLimitKey(scope: string, subject: string) {
  return createHmac('sha256', requireOtpHashSecret())
    .update(`public-rate-limit:${scope}:${subject}`)
    .digest('hex')
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export async function consumePublicRateLimit(
  admin: SupabaseClient,
  request: NextRequest,
  options: {
    scope: string
    subject?: string
    includeIp?: boolean
    limit: number
    windowSeconds: number
  }
): Promise<RateLimitResult> {
  const rawSubject = String(options.subject || '').slice(0, 180)
  const subject = options.includeIp === false
    ? rawSubject
    : `${clientAddress(request)}|${rawSubject}`
  const keyHash = rateLimitKey(options.scope, subject)

  const { data, error } = await admin.rpc('consume_public_rate_limit', {
    p_scope: options.scope,
    p_key_hash: keyHash,
    p_window_seconds: Math.max(10, Math.min(86400, Math.round(options.windowSeconds))),
    p_limit: Math.max(1, Math.min(10000, Math.round(options.limit))),
  })

  if (error) {
    console.error('[public-rate-limit] rpc failed', {
      scope: options.scope,
      message: error.message,
    })
    throw new Error('PUBLIC_RATE_LIMIT_UNAVAILABLE')
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    allowed: Boolean(row?.allowed),
    remaining: Number(row?.remaining || 0),
    retryAfterSeconds: Math.max(1, Number(row?.retry_after_seconds || 60)),
  }
}

export function rateLimitResponse(result: RateLimitResult) {
  return NextResponse.json(
    { error: '操作過於頻繁，請稍後再試。' },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    }
  )
}

export function publicFailure(
  context: string,
  error: unknown,
  message = GENERIC_PUBLIC_ERROR,
  status = 500
) {
  const requestId = randomUUID()
  const detail =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { value: String(error) }

  console.error(`[${context}] ${requestId}`, detail)

  return NextResponse.json(
    { error: message, request_id: requestId },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    }
  )
}

export function secureJson(
  body: unknown,
  init: number | ResponseInit = 200
) {
  const responseInit: ResponseInit =
    typeof init === 'number' ? { status: init } : { ...init }

  responseInit.headers = {
    ...(responseInit.headers || {}),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  }

  return NextResponse.json(body, responseInit)
}
