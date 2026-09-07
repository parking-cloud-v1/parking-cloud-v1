import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const MAX_FILE_SIZE = 20 * 1024 * 1024

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整')
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '登入狀態失效。' }, { status: 401 })
    }

    const { id } = await context.params

    const { data: inspection, error: inspectionError } = await supabase
      .from('disaster_inspections')
      .select('id, parking_lot_id, inspection_date')
      .eq('id', id)
      .maybeSingle()

    if (inspectionError || !inspection) {
      return NextResponse.json({ error: '找不到防災檢查資料。' }, { status: 404 })
    }

    const form = await request.formData()
    const file = form.get('file')
    const fileName = String(form.get('fileName') || '防災自主檢查表.pdf').trim()

    if (!(file instanceof File) || file.type !== 'application/pdf') {
      return NextResponse.json({ error: '只接受 PDF 檔案。' }, { status: 400 })
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'PDF 大小需介於 1 byte 到 20 MB。' }, { status: 400 })
    }

    const db = admin()
    const path =
      `${inspection.parking_lot_id}/${inspection.inspection_date}/${inspection.id}/${Date.now()}.pdf`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await db.storage
      .from('disaster-inspection-pdfs')
      .upload(path, buffer, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: `防災 PDF 封存失敗：${uploadError.message}` },
        { status: 500 }
      )
    }

    const { data: oldRow } = await db
      .from('disaster_inspections')
      .select('pdf_path')
      .eq('id', id)
      .maybeSingle()

    const { error: updateError } = await db
      .from('disaster_inspections')
      .update({
        pdf_path: path,
        pdf_file_name: fileName,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      await db.storage.from('disaster-inspection-pdfs').remove([path])
      return NextResponse.json(
        { error: `防災 PDF 紀錄更新失敗：${updateError.message}` },
        { status: 500 }
      )
    }

    if (oldRow?.pdf_path && oldRow.pdf_path !== path) {
      await db.storage.from('disaster-inspection-pdfs').remove([oldRow.pdf_path])
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '防災 PDF 封存失敗。' },
      { status: 500 }
    )
  }
}
