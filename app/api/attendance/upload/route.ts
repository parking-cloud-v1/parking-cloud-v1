import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const MAX_FILE_SIZE = 20 * 1024 * 1024
const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('伺服器環境變數未設定完整')
  }

  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function safeExt(name: string) {
  const ext = (name.split('.').pop() || 'bin')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  return ext || 'bin'
}

function previousMonthTaipei() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())

  const year = Number(parts.find((x) => x.type === 'year')?.value || 0)
  const month = Number(parts.find((x) => x.type === 'month')?.value || 1)
  const date = new Date(year, month - 2, 1)

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })
    }

    const form = await request.formData()
    const file = form.get('file')
    const parkingLotId = String(form.get('parkingLotId') || '').trim()
    const attendanceMonth = String(form.get('attendanceMonth') || '').trim()
    const staffName = String(form.get('staffName') || '').trim()
    const fixedMonth = previousMonthTaipei()

    if (
      !(file instanceof File) ||
      !parkingLotId ||
      !staffName ||
      !/^\d{4}-\d{2}$/.test(attendanceMonth)
    ) {
      return NextResponse.json(
        { error: '請選擇停車場、管理員姓名與簽到表檔案。' },
        { status: 400 }
      )
    }

    if (attendanceMonth !== fixedMonth) {
      return NextResponse.json(
        {
          error: `本月只能上傳 ${fixedMonth} 的簽到表，系統已阻止錯誤月份上傳。`,
        },
        { status: 400 }
      )
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: '檔案大小需介於 1 byte 到 20 MB。' },
        { status: 400 }
      )
    }

    if (file.type && !ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: '只接受 PDF、Excel、CSV、JPG、PNG、WebP。' },
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
      !['supervisor', 'manager'].includes(profile.role)
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
        .maybeSingle()

      if (accessError) {
        return NextResponse.json(
          { error: `停車場權限確認失敗：${accessError.message}` },
          { status: 500 }
        )
      }

      if (!access) {
        return NextResponse.json(
          { error: '沒有此停車場的操作權限。' },
          { status: 403 }
        )
      }
    }

    const db = admin()

    const { data: validName, error: nameError } = await db
      .from('attendance_staff_names')
      .select('id,name')
      .eq('parking_lot_id', parkingLotId)
      .eq('name', staffName)
      .eq('is_active', true)
      .maybeSingle()

    if (nameError) {
      return NextResponse.json(
        { error: `管理員姓名確認失敗：${nameError.message}` },
        { status: 500 }
      )
    }

    if (!validName) {
      return NextResponse.json(
        { error: '此姓名不在目前停車場的有效名單中，請重新選擇。' },
        { status: 400 }
      )
    }

    const monthDate = `${fixedMonth}-01`
    const path = `${parkingLotId}/${fixedMonth.replace(
      '-',
      ''
    )}/${user.id}/${Date.now()}.${safeExt(file.name)}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await db.storage
      .from('monthly-attendance')
      .upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
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
      staff_name: staffName,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      uploaded_by: user.id,
      uploaded_at: now,
      updated_at: now,
    }

    const result = await db
      .from('monthly_attendance_sheets')
      .insert(payload)
      .select('id,file_name,staff_name,uploaded_at')
      .single()

    if (result.error) {
      await db.storage.from('monthly-attendance').remove([path])

      return NextResponse.json(
        { error: `簽到表紀錄寫入失敗：${result.error.message}` },
        { status: 500 }
      )
    }

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: parkingLotId,
        action: 'ATTENDANCE_UPLOAD',
        entity_type: 'monthly_attendance_sheets',
        entity_id: result.data.id,
        detail: {
          attendance_month: monthDate,
          staff_name: staffName,
          file_name: file.name,
        },
      })
    } catch {
      // 稽核紀錄失敗不影響上傳。
    }

    return NextResponse.json({ ok: true, row: result.data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '簽到表上傳失敗。' },
      { status: 500 }
    )
  }
}
