import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 20 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('伺服器環境變數未設定完整')
  }

  return createAdminClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function safeExt(name: string) {
  const ext = String(name || '')
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  return ext || 'bin'
}

function normalizeFileName(value: string) {
  return String(value || '').trim().toLocaleLowerCase('zh-TW')
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: '登入狀態已失效。' },
        { status: 401 }
      )
    }

    const form = await request.formData()
    const file = form.get('file')
    const parkingLotId = String(form.get('parkingLotId') || '').trim()
    const attendanceMonth = String(form.get('attendanceMonth') || '').trim()

    if (
      !(file instanceof File) ||
      !parkingLotId ||
      !/^\d{4}-\d{2}$/.test(attendanceMonth)
    ) {
      return NextResponse.json(
        { error: '請選擇停車場、月份與簽到表檔案。' },
        { status: 400 }
      )
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: '檔案大小需介於 1 byte 到 20 MB。' },
        { status: 400 }
      )
    }

    const ext = safeExt(file.name)
    const inferredMime = MIME_BY_EXT[ext]

    if (!inferredMime) {
      return NextResponse.json(
        { error: '只接受 PDF、Excel、CSV、Word、JPG、PNG、WebP。' },
        { status: 400 }
      )
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (
      !profile?.is_active ||
      !['supervisor', 'manager'].includes(String(profile.role || ''))
    ) {
      return NextResponse.json(
        { error: '此帳號沒有簽到表上傳權限。' },
        { status: 403 }
      )
    }

    if (profile.role === 'manager') {
      const { data: access, error: accessError } = await supabase
        .from('user_parking_lots')
        .select('parking_lot_id')
        .eq('user_id', user.id)
        .eq('parking_lot_id', parkingLotId)
        .limit(1)

      if (accessError) {
        return NextResponse.json(
          { error: `停車場權限確認失敗：${accessError.message}` },
          { status: 500 }
        )
      }

      if (!access?.length) {
        return NextResponse.json(
          { error: '沒有此停車場的操作權限。' },
          { status: 403 }
        )
      }
    }

    const db = admin()
    const monthDate = `${attendanceMonth}-01`

    const { data: existingRows, error: duplicateError } = await db
      .from('monthly_attendance_sheets')
      .select('id, file_name')
      .eq('parking_lot_id', parkingLotId)
      .eq('attendance_month', monthDate)

    if (duplicateError) {
      return NextResponse.json(
        { error: `重複檢查失敗：${duplicateError.message}` },
        { status: 500 }
      )
    }

    const sameName = (existingRows || []).some(
      (row: any) =>
        normalizeFileName(row.file_name) === normalizeFileName(file.name)
    )

    if (sameName) {
      return NextResponse.json(
        {
          error: `此月份已存在相同檔名「${file.name}」，系統已阻止重複上傳。`,
        },
        { status: 409 }
      )
    }

    const path = `${parkingLotId}/${attendanceMonth.replace('-', '')}/${user.id}/${randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const contentType =
      file.type && file.type !== 'application/octet-stream'
        ? file.type
        : inferredMime

    const { error: uploadError } = await db.storage
      .from('monthly-attendance')
      .upload(path, buffer, {
        contentType,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: `檔案上傳失敗：${uploadError.message}` },
        { status: 500 }
      )
    }

    const now = new Date().toISOString()
    const payload = {
      parking_lot_id: parkingLotId,
      attendance_month: monthDate,
      storage_path: path,
      file_name: file.name,
      mime_type: contentType,
      file_size: file.size,
      uploaded_by: user.id,
      uploaded_at: now,
      updated_at: now,
    }

    const result = await db
      .from('monthly_attendance_sheets')
      .insert(payload)
      .select(`
        id,
        parking_lot_id,
        attendance_month,
        file_name,
        mime_type,
        file_size,
        uploaded_by,
        uploaded_at,
        updated_at
      `)
      .single()

    if (result.error) {
      await db.storage.from('monthly-attendance').remove([path])

      return NextResponse.json(
        {
          error:
            result.error.code === '23505'
              ? `此月份已存在相同檔名「${file.name}」，原有檔案未受影響。`
              : `簽到表紀錄寫入失敗：${result.error.message}`,
        },
        { status: result.error.code === '23505' ? 409 : 500 }
      )
    }

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: parkingLotId,
        action: 'MONTHLY_ATTENDANCE_UPLOAD',
        entity_type: 'monthly_attendance_sheets',
        entity_id: result.data.id,
        detail: {
          attendance_month: monthDate,
          file_name: file.name,
          file_size: file.size,
          mime_type: contentType,
        },
      })
    } catch {
      // 上傳已完成；log 失敗不回滾。
    }

    return NextResponse.json({
      ok: true,
      row: result.data,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '簽到表上傳失敗。' },
      { status: 500 }
    )
  }
}
