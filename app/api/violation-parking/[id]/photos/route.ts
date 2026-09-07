import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PHOTO_TYPES = [
  'overview',
  'center_window',
  'right_window',
  'left_window',
  'daily',
  'general',
]

function safeExt(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.png')) return 'png'
  if (name.endsWith('.webp')) return 'webp'
  return 'jpg'
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '登入狀態失效。' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_active) {
    return NextResponse.json({ error: '帳號未啟用。' }, { status: 403 })
  }

  const { id } = await context.params

  const { data: caseRow, error: caseError } = await supabase
    .from('violation_parking_cases')
    .select('id, parking_lot_id, case_type, start_date')
    .eq('id', id)
    .maybeSingle()

  if (caseError || !caseRow) {
    return NextResponse.json({ error: '找不到案件。' }, { status: 404 })
  }

  const form = await request.formData()
  const file = form.get('file')
  const photoType = String(form.get('photoType') || '').trim()
  const photoDate = String(form.get('photoDate') || '').trim()

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '沒有照片檔案。' }, { status: 400 })
  }

  if (!PHOTO_TYPES.includes(photoType)) {
    return NextResponse.json({ error: '照片類型錯誤。' }, { status: 400 })
  }

  if (!photoDate) {
    return NextResponse.json({ error: '缺少照片日期。' }, { status: 400 })
  }

  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
    return NextResponse.json({ error: '只接受 JPG、PNG、WEBP。' }, { status: 400 })
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: '單張照片不可超過 20MB。' }, { status: 400 })
  }

  if (caseRow.case_type === 'reserved_violation') {
    const allowed = ['overview','center_window','right_window','left_window']
    if (!allowed.includes(photoType)) {
      return NextResponse.json({ error: '身障／婦幼違規只接受四種指定角度照片。' }, { status: 400 })
    }

    const { data: exists } = await supabase
      .from('violation_parking_photos')
      .select('id')
      .eq('case_id', id)
      .eq('photo_type', photoType)
      .limit(1)

    if ((exists || []).length > 0) {
      return NextResponse.json({ error: '這個指定角度已經有照片。' }, { status: 400 })
    }
  }

  if (caseRow.case_type === 'long_stay' && photoType !== 'daily') {
    return NextResponse.json({ error: '久停車只能上傳每日紀錄照片。' }, { status: 400 })
  }

  if (caseRow.case_type === 'unplated' && photoType !== 'general') {
    return NextResponse.json({ error: '無牌車請使用一般照片。' }, { status: 400 })
  }

  const ext = safeExt(file)
  const path = `${caseRow.parking_lot_id}/${id}/${photoDate}/${Date.now()}-${photoType}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('violation-parking')
    .upload(path, file, { upsert: false })

  if (uploadError) {
    return NextResponse.json(
      { error: '照片上傳失敗：' + uploadError.message },
      { status: 400 }
    )
  }

  const { error: insertError } = await supabase
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
    })

  if (insertError) {
    await supabase.storage.from('violation-parking').remove([path])
    return NextResponse.json(
      { error: '照片紀錄建立失敗：' + insertError.message },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}
