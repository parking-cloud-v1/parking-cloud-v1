import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const PHOTO_TYPES = [
  'overview',
  'center_window',
  'right_window',
  'left_window',
  'daily',
  'general',
] as const

const MAX_FILE_SIZE = 20 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

type Profile = { id: string; role: string; is_active: boolean }

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整')
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function authorize() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null as Profile | null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  return { supabase, user, profile: (profile || null) as Profile | null }
}

async function canAccessLot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  profile: Profile,
  lotId: string
) {
  if (profile.role === 'supervisor') return true
  if (profile.role !== 'manager') return false

  const { data, error } = await supabase
    .from('user_parking_lots')
    .select('parking_lot_id')
    .eq('user_id', userId)
    .eq('parking_lot_id', lotId)
    .maybeSingle()

  if (error) throw new Error(`停車場權限確認失敗：${error.message}`)
  return Boolean(data)
}

function safeExt(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.png')) return 'png'
  if (name.endsWith('.webp')) return 'webp'
  return 'jpg'
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function dayNumber(startDate: string, photoDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`)
  const target = new Date(`${photoDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(target.getTime())) return 0
  return Math.floor((target.getTime() - start.getTime()) / 86400000) + 1
}

async function loadCase(db: ReturnType<typeof admin>, id: string) {
  const { data, error } = await db
    .from('violation_parking_cases')
    .select('id,parking_lot_id,case_type,start_date')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return null
  return data as {
    id: string
    parking_lot_id: string
    case_type: 'reserved_violation' | 'long_stay' | 'unplated'
    start_date: string
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user, profile } = await authorize()
    if (!user) return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })
    if (!profile?.is_active || !['manager', 'supervisor'].includes(profile.role)) {
      return NextResponse.json({ error: '沒有照片查看權限。' }, { status: 403 })
    }

    const { id } = await context.params
    const url = new URL(request.url)
    const photoId = String(url.searchParams.get('photoId') || '').trim()
    if (!id || !photoId) {
      return NextResponse.json({ error: '缺少案件或照片 ID。' }, { status: 400 })
    }

    const db = admin()
    const caseRow = await loadCase(db, id)
    if (!caseRow) return NextResponse.json({ error: '找不到案件。' }, { status: 404 })

    if (!(await canAccessLot(supabase, user.id, profile, caseRow.parking_lot_id))) {
      return NextResponse.json({ error: '沒有此停車場的操作權限。' }, { status: 403 })
    }

    const { data: photo, error } = await db
      .from('violation_parking_photos')
      .select('id,case_id,storage_path,file_name,mime_type')
      .eq('id', photoId)
      .eq('case_id', id)
      .maybeSingle()

    if (error || !photo?.storage_path) {
      return NextResponse.json({ error: '找不到照片。' }, { status: 404 })
    }

    const { data, error: signedError } = await db.storage
      .from('violation-parking')
      .createSignedUrl(photo.storage_path, 60 * 10)

    if (signedError || !data?.signedUrl) {
      return NextResponse.json(
        { error: signedError?.message || '照片預覽網址建立失敗。' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      signedUrl: data.signedUrl,
      fileName: photo.file_name,
      mimeType: photo.mime_type,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '照片預覽失敗。' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user, profile } = await authorize()
    if (!user) return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })
    if (!profile?.is_active || !['manager', 'supervisor'].includes(profile.role)) {
      return NextResponse.json({ error: '沒有照片上傳權限。' }, { status: 403 })
    }

    const { id } = await context.params
    const db = admin()
    const caseRow = await loadCase(db, id)
    if (!caseRow) return NextResponse.json({ error: '找不到案件。' }, { status: 404 })

    if (!(await canAccessLot(supabase, user.id, profile, caseRow.parking_lot_id))) {
      return NextResponse.json({ error: '沒有此停車場的操作權限。' }, { status: 403 })
    }

    const form = await request.formData()
    const file = form.get('file')
    const photoType = String(form.get('photoType') || '').trim()
    const photoDate = String(form.get('photoDate') || '').trim()

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '沒有照片檔案。' }, { status: 400 })
    }
    if (!PHOTO_TYPES.includes(photoType as any)) {
      return NextResponse.json({ error: '照片類型錯誤。' }, { status: 400 })
    }
    if (!validDate(photoDate)) {
      return NextResponse.json({ error: '照片日期格式錯誤。' }, { status: 400 })
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '單張照片需介於 1 byte 到 20MB。' }, { status: 400 })
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: '只接受 JPG、PNG、WEBP。' }, { status: 400 })
    }

    if (caseRow.case_type === 'reserved_violation') {
      const allowed = ['overview', 'center_window', 'right_window', 'left_window']
      if (!allowed.includes(photoType)) {
        return NextResponse.json(
          { error: '身障／婦幼違規只接受四種指定角度照片。' },
          { status: 400 }
        )
      }

      const { data: exists } = await db
        .from('violation_parking_photos')
        .select('id')
        .eq('case_id', id)
        .eq('photo_type', photoType)
        .limit(1)

      if ((exists || []).length > 0) {
        return NextResponse.json(
          { error: '這個指定角度已經有照片；如要重拍，請先刪除舊照片。' },
          { status: 400 }
        )
      }
    }

    if (caseRow.case_type === 'long_stay') {
      if (photoType !== 'daily') {
        return NextResponse.json({ error: '久停車只能上傳每日紀錄照片。' }, { status: 400 })
      }
      const day = dayNumber(caseRow.start_date, photoDate)
      if (day < 1 || day > 10) {
        return NextResponse.json({ error: '久停照片日期必須在開始追蹤日起 10 天內。' }, { status: 400 })
      }

      const { data: exists } = await db
        .from('violation_parking_photos')
        .select('id')
        .eq('case_id', id)
        .eq('photo_type', 'daily')
        .eq('photo_date', photoDate)
        .limit(1)

      if ((exists || []).length > 0) {
        return NextResponse.json(
          { error: '這一天已經有追蹤照片；如要重拍，請先刪除舊照片。' },
          { status: 400 }
        )
      }
    }

    if (caseRow.case_type === 'unplated' && photoType !== 'general') {
      return NextResponse.json({ error: '無牌車請使用一般照片。' }, { status: 400 })
    }

    const ext = safeExt(file)
    const path = `${caseRow.parking_lot_id}/${id}/${photoDate}/${Date.now()}-${photoType}.${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await db.storage
      .from('violation-parking')
      .upload(path, bytes, {
        upsert: false,
        contentType: file.type,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: `照片上傳失敗：${uploadError.message}` },
        { status: 500 }
      )
    }

    const { data: inserted, error: insertError } = await db
      .from('violation_parking_photos')
      .insert({
        case_id: id,
        parking_lot_id: caseRow.parking_lot_id,
        photo_type: photoType,
        photo_date: photoDate,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
        uploaded_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      await db.storage.from('violation-parking').remove([path])
      return NextResponse.json(
        { error: `照片紀錄建立失敗：${insertError?.message || '未知錯誤'}` },
        { status: 500 }
      )
    }

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: caseRow.parking_lot_id,
        action: 'VIOLATION_PHOTO_UPLOADED',
        entity_type: 'violation_parking_photo',
        entity_id: inserted.id,
        detail: { case_id: id, photo_type: photoType, photo_date: photoDate },
      })
    } catch {
      // 稽核失敗不阻止上傳。
    }

    return NextResponse.json({ ok: true, id: inserted.id })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '照片上傳失敗。' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user, profile } = await authorize()
    if (!user) return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })
    if (!profile?.is_active || !['manager', 'supervisor'].includes(profile.role)) {
      return NextResponse.json({ error: '沒有照片刪除權限。' }, { status: 403 })
    }

    const { id } = await context.params
    const body = await request.json()
    const photoId = String(body?.photoId || '').trim()
    if (!id || !photoId) {
      return NextResponse.json({ error: '缺少案件或照片 ID。' }, { status: 400 })
    }

    const db = admin()
    const caseRow = await loadCase(db, id)
    if (!caseRow) return NextResponse.json({ error: '找不到案件。' }, { status: 404 })

    if (!(await canAccessLot(supabase, user.id, profile, caseRow.parking_lot_id))) {
      return NextResponse.json({ error: '沒有此停車場的操作權限。' }, { status: 403 })
    }

    const { data: photo, error: readError } = await db
      .from('violation_parking_photos')
      .select('id,case_id,storage_path,file_name,photo_type,photo_date')
      .eq('id', photoId)
      .eq('case_id', id)
      .maybeSingle()

    if (readError || !photo) {
      return NextResponse.json({ error: '找不到照片。' }, { status: 404 })
    }

    if (photo.storage_path) {
      const { error: storageError } = await db.storage
        .from('violation-parking')
        .remove([photo.storage_path])

      if (storageError) {
        return NextResponse.json(
          { error: `Storage 刪除失敗：${storageError.message}` },
          { status: 500 }
        )
      }
    }

    const { error: deleteError } = await db
      .from('violation_parking_photos')
      .delete()
      .eq('id', photoId)
      .eq('case_id', id)

    if (deleteError) {
      return NextResponse.json(
        { error: `照片紀錄刪除失敗：${deleteError.message}` },
        { status: 500 }
      )
    }

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: caseRow.parking_lot_id,
        action: 'VIOLATION_PHOTO_DELETED',
        entity_type: 'violation_parking_photo',
        entity_id: photoId,
        detail: {
          case_id: id,
          file_name: photo.file_name,
          photo_type: photo.photo_type,
          photo_date: photo.photo_date,
        },
      })
    } catch {
      // 稽核失敗不阻止刪除。
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '照片刪除失敗。' },
      { status: 500 }
    )
  }
}
