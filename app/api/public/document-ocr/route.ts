import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGoogleServiceAccessToken } from '@/lib/google-calendar/google-service-auth'
import {
  consumePublicRateLimit,
  publicFailure,
  rateLimitResponse,
  secureJson,
} from '@/lib/security/publicSecurity'
import {
  createDocumentVerificationToken,
  normalizeVerificationPlate,
  normalizeVerificationText,
  type VerifiedDocumentType,
} from '@/lib/online-contracts/documentVerification'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

function cleanLine(value: unknown) {
  return String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
}

function linesFromText(fullText: string) {
  return fullText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)
}

function valueAfterLabel(lines: string[], labels: RegExp[]) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    for (const label of labels) {
      if (!label.test(line)) continue
      const sameLine = cleanLine(line.replace(label, '').replace(/^[：:\-]/, ''))
      if (sameLine && sameLine.length > 1) return sameLine
      const next = cleanLine(lines[i + 1] || '')
      if (next) return next
    }
  }
  return ''
}

function sanitizeName(value: string) {
  const match = value.match(/[\u3400-\u9fff·]{2,20}/)
  return cleanLine(match?.[0] || '')
}

function sanitizeAddress(value: string) {
  return cleanLine(value)
    .replace(/^(?:住址|地址|戶籍地址|戶籍地)[：:\s]*/i, '')
    .slice(0, 200)
}

function guessVehicleType(fullText: string) {
  const compact = fullText.replace(/\s+/g, '')
  if (/大型重型機車|重型機車|重機/.test(compact)) return 'heavy_motorcycle'
  if (/機器腳踏車|普通重型機車|普通輕型機車|機車/.test(compact)) return 'motorcycle'
  return 'car'
}

function parseVehicleRegistration(fullText: string) {
  const lines = linesFromText(fullText)
  const compact = fullText.normalize('NFKC').replace(/[\s　]/g, '')

  const plateLabelValue = valueAfterLabel(lines, [
    /車牌號碼/i,
    /牌照號碼/i,
    /車號/i,
  ])
  const plateFromLabel = plateLabelValue.match(/[A-Z0-9]{2,4}[-－]?[A-Z0-9]{2,4}/i)?.[0] || ''
  const plateFallback = compact.match(/[A-Z]{2,4}[-－]?[0-9A-Z]{2,4}/i)?.[0] || ''
  const vehiclePlate = String(plateFromLabel || plateFallback)
    .toUpperCase()
    .replace(/－/g, '-')

  const ownerName = sanitizeName(
    valueAfterLabel(lines, [/車主姓名/i, /車主/i, /所有人/i])
  )

  const address = sanitizeAddress(
    valueAfterLabel(lines, [/車主住址/i, /住址/i, /地址/i])
  )

  return {
    applicant_name: ownerName,
    vehicle_plate: vehiclePlate,
    address,
    vehicle_type: guessVehicleType(fullText),
  }
}

function parseIdCard(fullText: string) {
  const lines = linesFromText(fullText)

  // 僅取姓名與戶籍地；刻意不回傳身分證字號、生日等欄位。
  const applicantName = sanitizeName(
    valueAfterLabel(lines, [/^姓名/i, /姓名/i])
  )
  const address = sanitizeAddress(
    valueAfterLabel(lines, [/戶籍地址/i, /戶籍地/i, /住址/i, /地址/i])
  )

  return {
    applicant_name: applicantName,
    address,
  }
}

async function runVision(imageBase64: string) {
  const accessToken = await getGoogleServiceAccessToken(
    'https://www.googleapis.com/auth/cloud-platform'
  )

  const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          imageContext: { languageHints: ['zh-TW', 'en'] },
        },
      ],
    }),
    cache: 'no-store',
  })

  const result = await response.json()
  if (!response.ok || result?.responses?.[0]?.error) {
    const message = result?.responses?.[0]?.error?.message || result?.error?.message || 'OCR_FAILED'
    throw new Error(message)
  }

  return String(result?.responses?.[0]?.fullTextAnnotation?.text || '').trim()
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const documentType = String(formData.get('document_type') || '') as VerifiedDocumentType
    const challengeId = String(formData.get('challenge_id') || '').trim()
    const parkingLotId = String(formData.get('parking_lot_id') || '').trim()
    const file = formData.get('file')

    if (!['vehicle_registration', 'id_card'].includes(documentType)) {
      return secureJson({ error: '證件類型不正確。' }, 400)
    }
    if (!challengeId || !parkingLotId) {
      return secureJson({ error: '請先完成手機驗證。' }, 400)
    }
    if (!(file instanceof File) || file.size <= 0) {
      return secureJson({ error: '請選擇要辨識的照片。' }, 400)
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return secureJson({ error: '照片過大，請使用 8MB 以下的照片。' }, 413)
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return secureJson({ error: '僅支援 JPG、PNG、WebP、HEIC/HEIF 圖片。' }, 415)
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return secureJson({ error: '服務暫時無法使用，請稍後再試。' }, 500)
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    const limit = await consumePublicRateLimit(admin, request, {
      scope: 'document_ocr',
      subject: challengeId,
      limit: 10,
      windowSeconds: 15 * 60,
    })
    if (!limit.allowed) return rateLimitResponse(limit)

    const { data: challenge } = await admin
      .from('public_otp_challenges')
      .select('id,parking_lot_id,verified_at,consumed_at,expires_at,purpose,contract_id')
      .eq('id', challengeId)
      .maybeSingle()

    if (
      !challenge ||
      !challenge.verified_at ||
      challenge.consumed_at ||
      challenge.parking_lot_id !== parkingLotId ||
      (challenge.purpose && challenge.purpose !== 'application') ||
      challenge.contract_id
    ) {
      return secureJson({ error: '手機驗證狀態無效，請重新驗證。' }, 400)
    }

    if (new Date(challenge.verified_at).getTime() < Date.now() - 15 * 60_000) {
      return secureJson({ error: '手機驗證已逾時，請重新驗證。' }, 410)
    }

    // 圖片僅存在這次 HTTP request 的記憶體中；不寫入 Supabase/Storage/Drive。
    const imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const fullText = await runVision(imageBase64)
    if (!fullText) {
      return secureJson({ error: '沒有辨識到文字，請重新拍攝清楚一點。' }, 422)
    }

    if (documentType === 'vehicle_registration') {
      const parsed = parseVehicleRegistration(fullText)
      if (!parsed.vehicle_plate) {
        return secureJson({ error: '無法辨識車牌號碼，請重新拍攝完整行照。' }, 422)
      }

      const token = createDocumentVerificationToken({
        document_type: documentType,
        challenge_id: challengeId,
        parking_lot_id: parkingLotId,
        applicant_name: normalizeVerificationText(parsed.applicant_name),
        vehicle_plate: normalizeVerificationPlate(parsed.vehicle_plate),
        address: normalizeVerificationText(parsed.address),
        vehicle_type: parsed.vehicle_type,
      })

      return secureJson({
        ok: true,
        document_type: documentType,
        token,
        data: parsed,
        image_stored: false,
      })
    }

    const parsed = parseIdCard(fullText)
    if (!parsed.applicant_name || !parsed.address) {
      return secureJson({ error: '無法完整辨識姓名與戶籍地，請重新拍攝證件正面。' }, 422)
    }

    const token = createDocumentVerificationToken({
      document_type: documentType,
      challenge_id: challengeId,
      parking_lot_id: parkingLotId,
      applicant_name: normalizeVerificationText(parsed.applicant_name),
      address: normalizeVerificationText(parsed.address),
    })

    return secureJson({
      ok: true,
      document_type: documentType,
      token,
      data: parsed,
      image_stored: false,
    })
  } catch (error) {
    return publicFailure('document-ocr', error, '證件辨識暫時無法使用，請稍後再試。', 503)
  }
}
