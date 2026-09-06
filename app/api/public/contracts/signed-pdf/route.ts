import { createHash, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  consumePublicRateLimit,
  publicFailure,
  rateLimitResponse,
} from '@/lib/security/publicSecurity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PDF_BUCKET = 'contract-signed-pdfs'
const MAX_PDF_BYTES = 20 * 1024 * 1024
const SIGNED_LINK_GRACE_MS = 24 * 60 * 60 * 1000

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) throw new Error('SERVER_ENV_NOT_READY')

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

function safeFileName(value: unknown) {
  return (
    String(value || 'contract')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_') || 'contract'
  )
}

async function readStoredPdf(
  admin: ReturnType<typeof adminClient>,
  path: string,
  expectedHash?: string | null
) {
  const { data: file, error } = await admin.storage.from(PDF_BUCKET).download(path)

  if (error || !file) {
    console.error('[signed-pdf] storage download failed', {
      path,
      message: error?.message || 'missing file',
    })
    throw new Error('PDF_STORAGE_READ_FAILED')
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const actualHash = createHash('sha256').update(bytes).digest('hex')

  if (expectedHash && actualHash !== expectedHash) {
    console.error('[signed-pdf] integrity mismatch', { path })
    throw new Error('PDF_INTEGRITY_FAILED')
  }

  return { bytes, actualHash }
}

export async function GET(request: NextRequest) {
  try {
    const token = String(request.nextUrl.searchParams.get('token') || '').trim()

    if (!token) {
      return NextResponse.json({ error: '缺少契約 token。' }, { status: 400 })
    }

    const admin = adminClient()
    const hashedToken = tokenHash(token)
    const downloadLimit = await consumePublicRateLimit(admin, request, {
      scope: 'signed_pdf_download_ip',
      subject: hashedToken,
      limit: 60,
      windowSeconds: 600,
    })
    if (!downloadLimit.allowed) return rateLimitResponse(downloadLimit)

    const { data: contract } = await admin
      .from('contracts')
      .select('id,contract_no,status,signed_at')
      .eq('sign_token_hash', hashedToken)
      .maybeSingle()

    if (!contract || contract.status !== 'signed' || !contract.signed_at) {
      return NextResponse.json(
        { error: '找不到已完成簽署的契約。' },
        { status: 404 }
      )
    }

    const signedMs = new Date(contract.signed_at).getTime()
    if (!signedMs || Date.now() - signedMs > SIGNED_LINK_GRACE_MS) {
      return NextResponse.json(
        {
          error:
            '此簽約連結的直接下載期限已結束。請回「申請進度查詢」完成手機 OTP 後下載正式合約。',
        },
        { status: 410 }
      )
    }

    const { data: archive } = await admin
      .from('signed_contract_archives')
      .select('pdf_path,pdf_hash')
      .eq('contract_id', contract.id)
      .maybeSingle()

    if (!archive?.pdf_path) {
      return NextResponse.json({ error: '正式 PDF 尚未建立。' }, { status: 404 })
    }

    const { bytes } = await readStoredPdf(
      admin,
      String(archive.pdf_path),
      archive.pdf_hash
    )

    const filename = `${safeFileName(contract.contract_no)}_正式簽約留存.pdf`

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    })
  } catch (error: any) {
    return publicFailure(
      'signed-pdf-get',
      error,
      '正式 PDF 暫時無法下載，請稍後再試。',
      503
    )
  }
}

export async function POST(request: NextRequest) {
  let uploadedPath = ''

  try {
    const form = await request.formData()
    const uploadToken = String(form.get('pdf_upload_token') || '').trim()
    const file = form.get('file')

    if (!uploadToken || !(file instanceof File)) {
      return NextResponse.json(
        { error: '正式 PDF 上傳資料不完整。' },
        { status: 400 }
      )
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: '正式留存檔必須為 PDF。' },
        { status: 400 }
      )
    }

    if (file.size < 500 || file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'PDF 檔案大小異常。' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return NextResponse.json(
        { error: 'PDF 檔案格式驗證失敗。' },
        { status: 400 }
      )
    }

    const admin = adminClient()
    const uploadTokenHash = tokenHash(uploadToken)
    const uploadLimit = await consumePublicRateLimit(admin, request, {
      scope: 'signed_pdf_upload_ip',
      subject: uploadTokenHash,
      limit: 10,
      windowSeconds: 600,
    })
    if (!uploadLimit.allowed) return rateLimitResponse(uploadLimit)

    const { data: archive, error: archiveError } = await admin
      .from('signed_contract_archives')
      .select(
        'id,contract_id,application_id,parking_lot_id,contract_no,archive_hash,pdf_path,pdf_hash,pdf_generated_at,pdf_upload_token_expires_at,pdf_upload_token_used_at'
      )
      .eq('pdf_upload_token_hash', uploadTokenHash)
      .maybeSingle()

    if (archiveError) {
      console.error('[signed-pdf] archive lookup failed', archiveError)
      return NextResponse.json(
        { error: '正式 PDF 留存授權暫時無法驗證，請稍後再試。' },
        { status: 503 }
      )
    }

    if (!archive) {
      return NextResponse.json(
        { error: '正式 PDF 留存授權不存在或已失效。' },
        { status: 401 }
      )
    }

    if (archive.pdf_path) {
      return NextResponse.json({
        ok: true,
        already_exists: true,
        pdf_hash: archive.pdf_hash || null,
        pdf_generated_at: archive.pdf_generated_at || null,
      })
    }

    if (
      archive.pdf_upload_token_used_at ||
      !archive.pdf_upload_token_expires_at ||
      new Date(archive.pdf_upload_token_expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: '正式 PDF 留存授權已使用或已過期。' },
        { status: 410 }
      )
    }

    const { data: contract } = await admin
      .from('contracts')
      .select('id,status,signed_at,contract_no,application_id,parking_lot_id')
      .eq('id', archive.contract_id)
      .maybeSingle()

    if (!contract || contract.status !== 'signed' || !contract.signed_at) {
      return NextResponse.json(
        { error: '只有已完成簽署的契約可以建立正式 PDF。' },
        { status: 409 }
      )
    }

    const pdfHash = createHash('sha256').update(bytes).digest('hex')
    const generatedAt = new Date().toISOString()
    uploadedPath = `${contract.parking_lot_id}/${contract.id}/${Date.now()}_${randomUUID()}_signed-contract.pdf`

    const { error: uploadError } = await admin.storage
      .from(PDF_BUCKET)
      .upload(uploadedPath, bytes, {
        contentType: 'application/pdf',
        cacheControl: '0',
        upsert: false,
      })

    if (uploadError) {
      console.error('[signed-pdf] storage upload failed', {
        contractId: contract.id,
        message: uploadError.message,
      })
      return NextResponse.json(
        { error: '正式 PDF 保存失敗，請稍後再試。' },
        { status: 503 }
      )
    }

    const { data: updatedArchive, error: updateError } = await admin
      .from('signed_contract_archives')
      .update({
        pdf_path: uploadedPath,
        pdf_hash: pdfHash,
        pdf_generated_at: generatedAt,
        pdf_mime_type: 'application/pdf',
        pdf_file_size: bytes.length,
        pdf_source_archive_hash: archive.archive_hash,
        pdf_upload_token_hash: null,
        pdf_upload_token_expires_at: null,
        pdf_upload_token_used_at: generatedAt,
      })
      .eq('id', archive.id)
      .eq('pdf_upload_token_hash', uploadTokenHash)
      .is('pdf_upload_token_used_at', null)
      .is('pdf_path', null)
      .select('id,pdf_path,pdf_hash,pdf_generated_at')
      .maybeSingle()

    if (updateError || !updatedArchive?.pdf_path) {
      await admin.storage.from(PDF_BUCKET).remove([uploadedPath])
      uploadedPath = ''

      const { data: latest } = await admin
        .from('signed_contract_archives')
        .select('pdf_path,pdf_hash,pdf_generated_at')
        .eq('id', archive.id)
        .maybeSingle()

      if (latest?.pdf_path) {
        return NextResponse.json({
          ok: true,
          already_exists: true,
          pdf_hash: latest.pdf_hash || null,
          pdf_generated_at: latest.pdf_generated_at || null,
        })
      }

      console.error('[signed-pdf] archive update lost/failed', updateError)
      return NextResponse.json(
        { error: '正式 PDF 封存暫時無法完成，請稍後再試。' },
        { status: 503 }
      )
    }

    await admin
      .from('contracts')
      .update({
        pdf_path: uploadedPath,
        pdf_hash: pdfHash,
        pdf_generated_at: generatedAt,
      })
      .eq('id', contract.id)

    await admin.from('online_audit_logs').insert({
      parking_lot_id: contract.parking_lot_id,
      application_id: contract.application_id,
      contract_id: contract.id,
      action: 'CONTRACT_SIGNED_PDF_ARCHIVED',
      detail: {
        contract_no: contract.contract_no,
        pdf_hash: pdfHash,
        pdf_file_size: bytes.length,
        pdf_source_archive_hash: archive.archive_hash,
        authorization: 'one_time_pdf_upload_token',
      },
    })

    return NextResponse.json({
      ok: true,
      already_exists: false,
      pdf_hash: pdfHash,
      pdf_generated_at: generatedAt,
    })
  } catch (error: any) {
    if (uploadedPath) {
      try {
        const admin = adminClient()
        await admin.storage.from(PDF_BUCKET).remove([uploadedPath])
      } catch {
        // best effort cleanup
      }
    }

    return publicFailure(
      'signed-pdf-post',
      error,
      '正式 PDF 暫時無法建立，請稍後再試。',
      503
    )
  }
}
