import { createHash, randomBytes, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncSignedContractToMonthlyRental } from '@/lib/online-contracts/syncMonthlyRental'
import {
  consumePublicRateLimit,
  publicFailure,
  rateLimitResponse,
} from '@/lib/security/publicSecurity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SIGNATURE_BUCKET = 'contract-handwritten-signatures'
const SIGNATURE_URL_TTL_SECONDS = 15 * 60
const MAX_SIGNATURE_DATA_URL_LENGTH = 2_500_000
const MAX_SIGNATURE_BYTES = 1_500_000
const SIGNED_LINK_GRACE_MS = 24 * 60 * 60 * 1000
const PDF_UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('SERVER_ENV_NOT_READY')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

function relationName(value: any) {
  if (Array.isArray(value)) return value[0]?.name || ''
  return value?.name || ''
}

function maskPhone(phone: string) {
  if (!/^09\d{8}$/.test(phone)) return '已驗證手機'
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`
}

function publicMonthlySyncMessage(status?: string | null) {
  if (status === 'synced' || status === 'completed') {
    return '月租資料已同步完成。'
  }
  if (status === 'conflict') {
    return '契約已完成；月租資料需由管理人員確認後同步。'
  }
  if (status === 'error') {
    return '契約已完成；月租同步稍後由管理人員處理。'
  }
  return null
}

function parsePngSignature(dataUrl: string) {
  if (!dataUrl || dataUrl.length > MAX_SIGNATURE_DATA_URL_LENGTH) {
    throw new Error('手寫簽名檔案過大或不存在。')
  }

  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) {
    throw new Error('手寫簽名格式不正確，請清除後重新簽名。')
  }

  const buffer = Buffer.from(match[1], 'base64')

  if (buffer.length < 800 || buffer.length > MAX_SIGNATURE_BYTES) {
    throw new Error('手寫簽名內容不完整或檔案過大，請重新簽名。')
  }

  if (
    buffer.length < 24 ||
    buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
  ) {
    throw new Error('手寫簽名 PNG 檔案驗證失敗。')
  }

  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)

  if (
    width < 280 ||
    height < 120 ||
    width > 3000 ||
    height > 1200
  ) {
    throw new Error('手寫簽名畫布尺寸異常，請重新簽名。')
  }

  return {
    buffer,
    width,
    height,
    hash: createHash('sha256').update(buffer).digest('hex'),
  }
}

function validateSignatureMetrics(body: any) {
  const strokeCount = Number(body?.handwritten_signature_stroke_count || 0)
  const pointCount = Number(body?.handwritten_signature_point_count || 0)
  const pathLength = Number(body?.handwritten_signature_path_length || 0)

  if (
    !Number.isFinite(strokeCount) ||
    !Number.isFinite(pointCount) ||
    !Number.isFinite(pathLength) ||
    strokeCount < 1 ||
    pointCount < 12 ||
    pathLength < 80
  ) {
    throw new Error('手寫簽名字跡過少，請完整簽名後再送出。')
  }

  return {
    strokeCount: Math.min(Math.round(strokeCount), 1000),
    pointCount: Math.min(Math.round(pointCount), 100000),
    pathLength: Math.min(Math.round(pathLength * 10) / 10, 1000000),
  }
}

async function signedSignatureUrl(
  admin: ReturnType<typeof adminClient>,
  path?: string | null
) {
  if (!path) return null

  const { data, error } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .createSignedUrl(path, SIGNATURE_URL_TTL_SECONDS)

  if (error) return null
  return data?.signedUrl || null
}

async function issuePdfUploadToken(
  admin: ReturnType<typeof adminClient>,
  contractId: string
) {
  const rawToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + PDF_UPLOAD_TOKEN_TTL_MS).toISOString()

  const { data, error } = await admin
    .from('signed_contract_archives')
    .update({
      pdf_upload_token_hash: tokenHash(rawToken),
      pdf_upload_token_expires_at: expiresAt,
      pdf_upload_token_used_at: null,
    })
    .eq('contract_id', contractId)
    .is('pdf_path', null)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[contract-sign] pdf upload token issue failed', {
      contractId,
      message: error.message,
    })
    return null
  }

  if (!data) return null
  return { token: rawToken, expiresAt }
}

export async function GET(request: NextRequest) {
  try {
    const token = String(request.nextUrl.searchParams.get('token') || '').trim()

    if (!token) {
      return NextResponse.json({ error: '缺少簽約 token。' }, { status: 400 })
    }

    const admin = adminClient()
    const hashedToken = tokenHash(token)
    const viewLimit = await consumePublicRateLimit(admin, request, {
      scope: 'contract_sign_view_ip',
      subject: hashedToken,
      limit: 120,
      windowSeconds: 600,
    })
    if (!viewLimit.allowed) return rateLimitResponse(viewLimit)

    const { data: contract } = await admin
      .from('contracts')
      .select(
        `
        id,
        contract_no,
        customer_name,
        vehicle_plate,
        vehicle_type,
        rental_type,
        start_date,
        end_date,
        monthly_fee,
        contract_version,
        contract_snapshot,
        document_hash,
        status,
        signed_at,
        sign_token_expires_at,
        sign_token_used_at,
        monthly_sync_status,
        monthly_rental_id,
        parking_lots(name),
        contract_signatures(
          signer_name, verification_method, otp_verified, signed_at,
          document_hash, privacy_agreed_at, electronic_agreed_at,
          electronic_signature_consent_at,
          contract_read_confirmed_at, data_confirmed_at,
          non_fixed_space_agreed_at,
          handwritten_signature_path, handwritten_signature_hash,
          handwritten_signature_at, handwritten_signature_stroke_count,
          handwritten_signature_point_count, handwritten_signature_path_length
        )
        `
      )
      .eq('sign_token_hash', hashedToken)
      .maybeSingle()

    if (!contract) {
      return NextResponse.json({ error: '簽約連結不存在。' }, { status: 404 })
    }

    if (contract.sign_token_used_at && contract.status !== 'signed') {
      return NextResponse.json({ error: '簽約連結已使用。' }, { status: 410 })
    }

    if (contract.status === 'signed') {
      const signedMs = contract.signed_at
        ? new Date(contract.signed_at).getTime()
        : 0

      if (!signedMs || Date.now() - signedMs > SIGNED_LINK_GRACE_MS) {
        return NextResponse.json(
          {
            error:
              '此簽約連結已完成並關閉。若要下載正式合約，請回「申請進度查詢」完成手機 OTP 驗證。',
          },
          { status: 410 }
        )
      }
    } else if (
      !contract.sign_token_expires_at ||
      new Date(contract.sign_token_expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: '簽約連結已過期，請聯絡管理人員重新發送。' },
        { status: 410 }
      )
    }

    const currentHash = createHash('sha256')
      .update(String(contract.contract_snapshot || ''))
      .digest('hex')

    if (!contract.document_hash || currentHash !== contract.document_hash) {
      return NextResponse.json(
        { error: '契約文件驗證失敗，請聯絡管理人員。' },
        { status: 409 }
      )
    }

    const rawSignature = Array.isArray(contract.contract_signatures)
      ? contract.contract_signatures[0] || null
      : contract.contract_signatures || null

    const signature = rawSignature
      ? {
          ...rawSignature,
          handwritten_signature_url: await signedSignatureUrl(
            admin,
            rawSignature.handwritten_signature_path
          ),
          handwritten_signature_path: undefined,
        }
      : null

    let pdfAvailable = false
    if (contract.status === 'signed') {
      const { data: archive } = await admin
        .from('signed_contract_archives')
        .select('pdf_path')
        .eq('contract_id', contract.id)
        .maybeSingle()
      pdfAvailable = Boolean(archive?.pdf_path)
    }

    return NextResponse.json({
      ok: true,
      contract: {
        ...contract,
        parking_lot_name: relationName(contract.parking_lots),
        parking_lots: undefined,
        contract_signatures: undefined,
        signature,
        document_verified: true,
        pdf_available: pdfAvailable,
      },
    })
  } catch (error: any) {
    return publicFailure(
      'contract-sign-get',
      error,
      '契約暫時無法讀取，請稍後再試。',
      503
    )
  }
}

export async function POST(request: NextRequest) {
  let uploadedSignaturePath = ''

  try {
    const body = await request.json()
    const token = String(body?.token || '').trim()
    const signerName = String(body?.signer_name || '').trim()
    const signOtpChallengeId = String(
      body?.sign_otp_challenge_id || ''
    ).trim()

    if (
      !token ||
      !signerName ||
      signerName.length > 100 ||
      !signOtpChallengeId ||
      !body?.privacy_agreed ||
      !body?.electronic_agreed ||
      !body?.electronic_signature_consent ||
      !body?.contract_read_confirmed ||
      !body?.data_confirmed ||
      !body?.non_fixed_space_agreed ||
      !body?.confirmed
    ) {
      return NextResponse.json(
        { error: '簽署資料、手機驗證或同意項目不完整。' },
        { status: 400 }
      )
    }

    const admin = adminClient()
    const hashedToken = tokenHash(token)
    const submitLimit = await consumePublicRateLimit(admin, request, {
      scope: 'contract_sign_submit_ip',
      subject: hashedToken,
      limit: 20,
      windowSeconds: 600,
    })
    if (!submitLimit.allowed) return rateLimitResponse(submitLimit)

    const { data: contract } = await admin
      .from('contracts')
      .select('*')
      .eq('sign_token_hash', hashedToken)
      .maybeSingle()

    if (!contract) {
      return NextResponse.json({ error: '簽約連結不存在。' }, { status: 404 })
    }

    if (contract.status === 'signed') {
      const syncResult = await syncSignedContractToMonthlyRental(admin, contract.id)
      const signedMs = contract.signed_at
        ? new Date(contract.signed_at).getTime()
        : 0
      const pdfToken =
        signedMs && Date.now() - signedMs <= 15 * 60 * 1000
          ? await issuePdfUploadToken(admin, contract.id)
          : null

      return NextResponse.json({
        ok: true,
        contract_no: contract.contract_no,
        already_signed: true,
        monthly_sync_status: syncResult.status,
        monthly_rental_id: syncResult.monthlyRentalId || null,
        monthly_sync_message: publicMonthlySyncMessage(syncResult.status),
        pdf_upload_token: pdfToken?.token || null,
        pdf_upload_token_expires_at: pdfToken?.expiresAt || null,
      })
    }

    if (contract.sign_token_used_at) {
      return NextResponse.json({ error: '簽約連結已使用。' }, { status: 410 })
    }

    if (
      !contract.sign_token_expires_at ||
      new Date(contract.sign_token_expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json({ error: '簽約連結已過期。' }, { status: 410 })
    }

    if (signerName !== String(contract.customer_name || '').trim()) {
      return NextResponse.json(
        { error: '簽署姓名與申請人不一致。' },
        { status: 400 }
      )
    }

    const currentHash = createHash('sha256')
      .update(String(contract.contract_snapshot || ''))
      .digest('hex')

    if (!contract.document_hash || currentHash !== contract.document_hash) {
      return NextResponse.json(
        { error: '契約內容驗證失敗，請聯絡管理人員。' },
        { status: 409 }
      )
    }

    let signatureImage: ReturnType<typeof parsePngSignature>
    let signatureMetrics: ReturnType<typeof validateSignatureMetrics>

    try {
      signatureImage = parsePngSignature(
        String(body?.handwritten_signature_data_url || '')
      )
      signatureMetrics = validateSignatureMetrics(body)
    } catch (error: any) {
      return NextResponse.json(
        { error: error?.message || '手寫簽名驗證失敗。' },
        { status: 400 }
      )
    }

    uploadedSignaturePath = `${contract.parking_lot_id}/${contract.id}/${Date.now()}_${randomUUID()}.png`

    const { error: uploadError } = await admin.storage
      .from(SIGNATURE_BUCKET)
      .upload(uploadedSignaturePath, signatureImage.buffer, {
        contentType: 'image/png',
        cacheControl: '0',
        upsert: false,
      })

    if (uploadError) {
      console.error('[contract-sign] signature upload failed', {
        contractId: contract.id,
        message: uploadError.message,
      })
      return NextResponse.json(
        { error: '手寫簽名保存失敗，請稍後再試。' },
        { status: 503 }
      )
    }

    const userAgent = request.headers.get('user-agent') || null
    const { data: finalizedRows, error: finalizeError } = await admin.rpc(
      'finalize_online_contract_signature_with_handwriting',
      {
        p_contract_id: contract.id,
        p_challenge_id: signOtpChallengeId,
        p_signer_name: signerName,
        p_user_agent: userAgent,
        p_signature_path: uploadedSignaturePath,
        p_signature_hash: signatureImage.hash,
        p_signature_stroke_count: signatureMetrics.strokeCount,
        p_signature_point_count: signatureMetrics.pointCount,
        p_signature_path_length: signatureMetrics.pathLength,
        p_electronic_signature_consent: Boolean(
          body?.electronic_signature_consent
        ),
      }
    )

    if (finalizeError) {
      await admin.storage.from(SIGNATURE_BUCKET).remove([uploadedSignaturePath])
      uploadedSignaturePath = ''

      const raw = String(finalizeError.message || '')
      const expired = raw.includes('過期') || raw.includes('逾時')
      const invalid =
        raw.includes('不一致') ||
        raw.includes('無效') ||
        raw.includes('不可簽署') ||
        raw.includes('手寫簽名')

      console.error('[contract-sign] finalize failed', {
        contractId: contract.id,
        message: raw,
      })

      return NextResponse.json(
        {
          error: expired
            ? '手機驗證或簽約連結已逾時，請重新驗證後再試。'
            : invalid
              ? '簽署資料驗證失敗，請確認後重新送出。'
              : '電子簽署暫時無法完成，請稍後再試。',
        },
        { status: expired ? 410 : invalid ? 400 : 503 }
      )
    }

    const finalized = Array.isArray(finalizedRows)
      ? finalizedRows[0]
      : finalizedRows

    if (!finalized) {
      await admin.storage.from(SIGNATURE_BUCKET).remove([uploadedSignaturePath])
      uploadedSignaturePath = ''
      return NextResponse.json(
        { error: '電子簽署交易未完成，請重新整理後再試。' },
        { status: 503 }
      )
    }

    const signedAt = finalized.signed_at || new Date().toISOString()
    const signatureUrl = await signedSignatureUrl(admin, uploadedSignaturePath)

    await admin.from('online_audit_logs').insert({
      parking_lot_id: finalized.parking_lot_id || contract.parking_lot_id,
      application_id: finalized.application_id || contract.application_id,
      contract_id: contract.id,
      action: finalized.already_signed
        ? 'CONTRACT_SIGN_SUBMIT_DUPLICATE'
        : 'CONTRACT_SIGNED',
      detail: {
        contract_no: contract.contract_no,
        contract_version: contract.contract_version,
        verification_method: 'contract_sign_phone_otp_handwritten',
        sign_otp_challenge_id: signOtpChallengeId,
        document_hash: finalized.document_hash || contract.document_hash,
        handwritten_signature_hash: signatureImage.hash,
        handwritten_signature_stroke_count: signatureMetrics.strokeCount,
        handwritten_signature_point_count: signatureMetrics.pointCount,
        handwritten_signature_path_length: signatureMetrics.pathLength,
        already_signed: Boolean(finalized.already_signed),
        privacy_agreed: true,
        electronic_agreed: true,
        electronic_signature_consent: true,
        contract_read_confirmed: true,
        data_confirmed: true,
        non_fixed_space_agreed: true,
      },
    })

    const syncResult = await syncSignedContractToMonthlyRental(admin, contract.id)
    const pdfToken = await issuePdfUploadToken(admin, contract.id)

    return NextResponse.json({
      ok: true,
      contract_no: contract.contract_no,
      signed_at: signedAt,
      masked_phone: maskPhone(String(contract.phone || '')),
      signature: {
        signer_name: signerName,
        verification_method: 'contract_sign_phone_otp_handwritten',
        otp_verified: true,
        signed_at: signedAt,
        document_hash: contract.document_hash,
        privacy_agreed_at: signedAt,
        electronic_agreed_at: signedAt,
        electronic_signature_consent_at: signedAt,
        contract_read_confirmed_at: signedAt,
        data_confirmed_at: signedAt,
        non_fixed_space_agreed_at: signedAt,
        handwritten_signature_hash: signatureImage.hash,
        handwritten_signature_at: signedAt,
        handwritten_signature_url: signatureUrl,
        handwritten_signature_stroke_count: signatureMetrics.strokeCount,
        handwritten_signature_point_count: signatureMetrics.pointCount,
        handwritten_signature_path_length: signatureMetrics.pathLength,
      },
      monthly_sync_status: syncResult.status,
      monthly_rental_id: syncResult.monthlyRentalId || null,
      monthly_sync_message: publicMonthlySyncMessage(syncResult.status),
      pdf_upload_token: pdfToken?.token || null,
      pdf_upload_token_expires_at: pdfToken?.expiresAt || null,
    })
  } catch (error: any) {
    if (uploadedSignaturePath) {
      try {
        const admin = adminClient()
        await admin.storage.from(SIGNATURE_BUCKET).remove([uploadedSignaturePath])
      } catch {
        // 清理失敗只記錄主要錯誤，不對外顯示細節。
      }
    }

    return publicFailure(
      'contract-sign-post',
      error,
      '電子簽署暫時無法處理，請稍後再試。',
      503
    )
  }
}
