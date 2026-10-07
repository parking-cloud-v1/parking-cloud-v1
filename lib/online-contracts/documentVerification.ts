import { createHmac, timingSafeEqual } from 'crypto'
import { requireOtpHashSecret } from '@/lib/security/publicSecurity'

export type VerifiedDocumentType = 'vehicle_registration' | 'id_card'

export type VerifiedDocumentPayload = {
  v: 1
  document_type: VerifiedDocumentType
  challenge_id: string
  parking_lot_id: string
  applicant_name?: string
  vehicle_plate?: string
  address?: string
  vehicle_type?: string
  issued_at: number
  expires_at: number
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signingKey() {
  return createHmac('sha256', requireOtpHashSecret())
    .update('online-contract-document-verification:v1')
    .digest()
}

function signature(data: string) {
  return createHmac('sha256', signingKey()).update(data).digest('base64url')
}

export function createDocumentVerificationToken(
  payload: Omit<VerifiedDocumentPayload, 'v' | 'issued_at' | 'expires_at'>,
  ttlSeconds = 15 * 60
) {
  const issuedAt = Math.floor(Date.now() / 1000)
  const complete: VerifiedDocumentPayload = {
    v: 1,
    ...payload,
    issued_at: issuedAt,
    expires_at: issuedAt + Math.max(60, Math.min(ttlSeconds, 30 * 60)),
  }
  const encoded = base64UrlEncode(JSON.stringify(complete))
  return `${encoded}.${signature(encoded)}`
}

export function verifyDocumentVerificationToken(token: unknown) {
  const value = String(token || '').trim()
  const [encoded, suppliedSignature] = value.split('.')
  if (!encoded || !suppliedSignature) return null

  const expected = signature(encoded)
  const a = Buffer.from(expected)
  const b = Buffer.from(suppliedSignature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as VerifiedDocumentPayload
    const now = Math.floor(Date.now() / 1000)
    if (payload?.v !== 1 || payload.expires_at < now || payload.issued_at > now + 60) {
      return null
    }
    if (!['vehicle_registration', 'id_card'].includes(payload.document_type)) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export function normalizeVerificationText(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\s　]/g, '')
    .replace(/[，,。．.]/g, '')
    .trim()
}

export function normalizeVerificationPlate(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}
