import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  consumePublicRateLimit,
  publicFailure,
  rateLimitResponse,
} from '@/lib/security/publicSecurity'

export const dynamic = 'force-dynamic'

const PDF_BUCKET = 'contract-signed-pdfs'
const DOWNLOAD_WINDOW_MS = 15 * 60 * 1000

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SERVER_ENV_NOT_READY')
  return createClient(url, key, { auth: { persistSession: false } })
}

function safeFileName(value: unknown) {
  return (
    String(value || 'contract')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_') || 'contract'
  )
}

export async function GET(request: NextRequest) {
  try {
    const applicationId = String(
      request.nextUrl.searchParams.get('application_id') || ''
    ).trim()
    const challengeId = String(
      request.nextUrl.searchParams.get('challenge_id') || ''
    ).trim()

    if (!applicationId || !challengeId) {
      return NextResponse.json(
        { error: '下載驗證資料不完整。' },
        { status: 400 }
      )
    }

    const admin = adminClient()
    const downloadLimit = await consumePublicRateLimit(admin, request, {
      scope: 'status_contract_download_ip',
      subject: `${applicationId}|${challengeId}`,
      limit: 60,
      windowSeconds: 600,
    })
    if (!downloadLimit.allowed) return rateLimitResponse(downloadLimit)

    const { data: challenge } = await admin
      .from('public_otp_challenges')
      .select('id,application_id,phone,purpose,verified_at,consumed_at')
      .eq('id', challengeId)
      .maybeSingle()

    const verifiedAt = challenge?.verified_at
      ? new Date(challenge.verified_at).getTime()
      : 0

    if (
      !challenge ||
      challenge.purpose !== 'application_status' ||
      challenge.application_id !== applicationId ||
      !challenge.consumed_at ||
      !verifiedAt ||
      Date.now() - verifiedAt > DOWNLOAD_WINDOW_MS
    ) {
      return NextResponse.json(
        { error: '合約下載驗證已失效，請回進度查詢重新完成手機 OTP。' },
        { status: 401 }
      )
    }

    const { data: application } = await admin
      .from('rental_applications')
      .select('id,phone')
      .eq('id', applicationId)
      .eq('phone', challenge.phone)
      .maybeSingle()

    if (!application) {
      return NextResponse.json({ error: '找不到申請資料。' }, { status: 404 })
    }

    const { data: contract } = await admin
      .from('contracts')
      .select('id,status,signed_at')
      .eq('application_id', applicationId)
      .maybeSingle()

    if (!contract?.id || !contract.signed_at) {
      return NextResponse.json(
        { error: '此案件尚未完成簽署，沒有可下載的正式 PDF。' },
        { status: 404 }
      )
    }

    const { data: row, error } = await admin
      .from('signed_contract_archives')
      .select('contract_id,contract_no,pdf_path,pdf_hash')
      .eq('contract_id', contract.id)
      .maybeSingle()

    if (error || !row) {
      return NextResponse.json(
        { error: '正式合約 PDF 尚未建立，請聯絡管理人員。' },
        { status: 404 }
      )
    }

    if (!row.pdf_path) {
      return NextResponse.json(
        {
          error:
            '此筆舊契約尚未建立正式 PDF。正式留存檔只提供 PDF，請聯絡管理人員。',
        },
        { status: 409 }
      )
    }

    const { data: pdfFile, error: pdfError } = await admin.storage
      .from(PDF_BUCKET)
      .download(String(row.pdf_path))

    if (pdfError || !pdfFile) {
      console.error(
        '[application-status-contract-archive] pdf download failed',
        pdfError
      )
      return NextResponse.json(
        { error: '正式 PDF 暫時無法讀取，請稍後再試。' },
        { status: 503 }
      )
    }

    const pdfBytes = Buffer.from(await pdfFile.arrayBuffer())
    const actualPdfHash = createHash('sha256').update(pdfBytes).digest('hex')

    if (row.pdf_hash && actualPdfHash !== row.pdf_hash) {
      return NextResponse.json(
        { error: '正式 PDF 完整性驗證失敗，請聯絡管理人員。' },
        { status: 409 }
      )
    }

    const pdfFilename = `${safeFileName(row.contract_no)}_正式留存.pdf`

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(pdfFilename)}`,
        'Content-Length': String(pdfBytes.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    })
  } catch (error: any) {
    return publicFailure(
      'application-status-contract-archive',
      error,
      '正式合約 PDF 暫時無法下載，請稍後再試。',
      503
    )
  }
}
