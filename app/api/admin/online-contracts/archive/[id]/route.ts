import { createHash, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PDF_BUCKET = 'contract-signed-pdfs'
const MAX_PDF_BYTES = 20 * 1024 * 1024

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整。')
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

function safeFileName(value: unknown) {
  const text = String(value || 'contract')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
  return text || 'contract'
}

async function authenticatedContract(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: '未登入。', status: 401 as const, user: null, row: null }

  // 使用登入者自己的 RLS 權限確認此人確實能存取這份契約。
  const { data: row, error } = await supabase
    .from('contracts')
    .select('id,contract_no,parking_lot_id,status,signed_at')
    .eq('id', id)
    .maybeSingle()

  if (error || !row) {
    return {
      error: '找不到契約或沒有此契約的存取權限。',
      status: 404 as const,
      user,
      row: null,
    }
  }

  return { error: '', status: 200 as const, user, row }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const access = await authenticatedContract(id)

  if (!access.user || !access.row) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('signed_contract_archives')
    .select('contract_id,contract_no,pdf_path,pdf_hash')
    .eq('contract_id', id)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json(
      { error: '找不到正式留存資料。' },
      { status: 404 }
    )
  }

  if (!row.pdf_path) {
    return NextResponse.json(
      {
        error:
          '此契約尚未建立正式 PDF。請回契約頁按「下載正式留存檔（PDF）」，系統會先自動建立再下載。',
      },
      { status: 409 }
    )
  }

  const admin = serviceClient()
  const { data: pdfFile, error: pdfError } = await admin.storage
    .from(PDF_BUCKET)
    .download(String(row.pdf_path))

  if (pdfError || !pdfFile) {
    console.error('[admin-contract-pdf] storage read failed', {
      contractId: id,
      message: pdfError?.message || 'missing file',
    })
    return NextResponse.json(
      { error: '正式 PDF 讀取失敗，請稍後再試。' },
      { status: 503 }
    )
  }

  const pdfBytes = Buffer.from(await pdfFile.arrayBuffer())
  const actualPdfHash = createHash('sha256').update(pdfBytes).digest('hex')

  if (row.pdf_hash && actualPdfHash !== row.pdf_hash) {
    return NextResponse.json(
      { error: '正式 PDF 完整性驗證失敗。' },
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
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const access = await authenticatedContract(id)

  if (!access.user || !access.row) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  if (access.row.status !== 'signed' || !access.row.signed_at) {
    return NextResponse.json(
      { error: '只有已完成簽署的契約可以建立正式 PDF。' },
      { status: 409 }
    )
  }

  let uploadedPath = ''

  try {
    const form = await request.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少正式 PDF 檔案。' }, { status: 400 })
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

    const admin = serviceClient()
    const { data: archive, error: archiveError } = await admin
      .from('signed_contract_archives')
      .select('id,contract_id,contract_no,archive_hash,pdf_path,pdf_hash,pdf_generated_at')
      .eq('contract_id', id)
      .maybeSingle()

    if (archiveError || !archive) {
      return NextResponse.json(
        { error: '找不到此契約的正式封存資料。' },
        { status: 404 }
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

    const pdfHash = createHash('sha256').update(bytes).digest('hex')
    const generatedAt = new Date().toISOString()
    uploadedPath = `${access.row.parking_lot_id}/${id}/${Date.now()}_${randomUUID()}_signed-contract.pdf`

    const { error: uploadError } = await admin.storage
      .from(PDF_BUCKET)
      .upload(uploadedPath, bytes, {
        contentType: 'application/pdf',
        cacheControl: '0',
        upsert: false,
      })

    if (uploadError) {
      console.error('[admin-contract-pdf] storage upload failed', {
        contractId: id,
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

      console.error('[admin-contract-pdf] archive update failed', updateError)
      return NextResponse.json(
        { error: '正式 PDF 封存失敗，請稍後再試。' },
        { status: 503 }
      )
    }

    await admin
      .from('contracts')
      .update({
        pdf_path: uploadedPath,
        pdf_hash: pdfHash,
        pdf_generated_at: generatedAt,
        updated_at: generatedAt,
      })
      .eq('id', id)

    await admin.from('contract_lifecycle_events').insert({
      contract_id: id,
      parking_lot_id: access.row.parking_lot_id,
      actor_user_id: access.user.id,
      event_type: 'SIGNED_PDF_GENERATED',
      previous_status: 'signed',
      new_status: 'signed',
      note: '主管補建一頁式正式 PDF 留存檔',
      metadata: {
        pdf_hash: pdfHash,
        pdf_file_size: bytes.length,
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
        await serviceClient().storage.from(PDF_BUCKET).remove([uploadedPath])
      } catch {
        // 清理失敗交由後續 Storage 盤點處理。
      }
    }

    console.error('[admin-contract-pdf] generate/save failed', {
      contractId: id,
      message: error?.message || String(error),
    })
    return NextResponse.json(
      { error: '正式 PDF 建立失敗，請稍後再試。' },
      { status: 503 }
    )
  }
}
