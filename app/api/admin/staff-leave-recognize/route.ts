import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recognizeScheduleImage } from '@/lib/google-vision/schedule-ocr'

export const dynamic = 'force-dynamic'

async function requireSupervisor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: '未登入' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_active || profile.role !== 'supervisor') {
    return { error: NextResponse.json({ error: '僅主管可使用' }, { status: 403 }) }
  }
  return { user }
}

export async function POST(request: NextRequest) {
  const auth = await requireSupervisor()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => ({}))
  const imageBase64 = String(body.image_base64 || '').trim()
  const yearMonth = String(body.year_month || '').trim()
  const staffName = String(body.staff_name || '').trim()
  const parkingLotName = String(body.parking_lot_name || '').trim()
  const profiles = Array.isArray(body.profiles)
    ? body.profiles.slice(0, 30).map((profile: any) => ({
        id: String(profile?.id || '').trim(),
        name: String(profile?.name || '').trim(),
        staff_name: String(profile?.staff_name || '').trim(),
        parking_lot_name: String(profile?.parking_lot_name || '').trim(),
        leave_shift: String(profile?.leave_shift || '').trim(),
        match_keywords: Array.isArray(profile?.match_keywords)
          ? profile.match_keywords.map((value: any) => String(value || '').trim()).filter(Boolean).slice(0, 20)
          : [],
      }))
    : []

  if (!imageBase64 || !yearMonth) {
    return NextResponse.json({ error: '請選擇班表月份並上傳照片' }, { status: 400 })
  }
  if (imageBase64.length > 9_000_000) {
    return NextResponse.json({ error: '照片太大，請改用 6MB 以下的截圖或照片' }, { status: 413 })
  }

  try {
    const result = await recognizeScheduleImage({
      imageBase64,
      yearMonth,
      staffName,
      parkingLotName,
      profiles,
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({
      error: String(error instanceof Error ? error.message : error),
    }, { status: 500 })
  }
}
