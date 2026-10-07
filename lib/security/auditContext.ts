import { createHmac } from 'crypto'
import type { NextRequest } from 'next/server'

function requestIp(request: NextRequest) {
  const forwarded = String(request.headers.get('x-forwarded-for') || '')
    .split(',')[0]
    .trim()
  const realIp = String(request.headers.get('x-real-ip') || '').trim()
  return (forwarded || realIp || 'unknown').slice(0, 128)
}

function hashIp(ip: string) {
  const secret = String(process.env.OTP_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  if (!secret) return null
  return createHmac('sha256', secret).update(`audit-ip:${ip}`).digest('hex')
}

export function auditRequestContext(request: NextRequest) {
  return {
    ip_hash: hashIp(requestIp(request)),
    user_agent: String(request.headers.get('user-agent') || '').slice(0, 1000) || null,
    forwarded_proto: String(request.headers.get('x-forwarded-proto') || '').slice(0, 20) || null,
  }
}
