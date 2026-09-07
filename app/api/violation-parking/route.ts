import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function currentProfile(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  return { user, profile }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { user, profile } = await currentProfile(supabase)

  if (!user || !profile?.is_active) {
    return NextResponse.json({ error: '登入狀態失效。' }, { status: 401 })
  }

  const url = new URL(request.url)
  const lotId = String(url.searchParams.get('lotId') || '').trim()

  if (!lotId) {
    return NextResponse.json({ data: [] })
  }

  const { data, error } = await supabase
    .from('violation_parking_cases')
    .select(`
      id,
      parking_lot_id,
      case_type,
      reserved_type,
      vehicle_plate,
      location_text,
      start_date,
      notes,
      status,
      created_at,
      violation_parking_photos (
        id,
        photo_type,
        photo_date,
        storage_path,
        file_name,
        uploaded_at
      )
    `)
    .eq('parking_lot_id', lotId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data: data || [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, profile } = await currentProfile(supabase)

  if (!user || !profile?.is_active) {
    return NextResponse.json({ error: '登入狀態失效。' }, { status: 401 })
  }

  const body = await request.json()
  const parkingLotId = String(body?.parkingLotId || '').trim()
  const caseType = String(body?.caseType || '').trim()
  const reservedType = body?.reservedType ? String(body.reservedType) : null
  const plate = body?.vehiclePlate ? String(body.vehiclePlate).trim().toUpperCase() : null
  const locationText = body?.locationText ? String(body.locationText).trim() : null
  const startDate = String(body?.startDate || '').trim()
  const notes = body?.notes ? String(body.notes).trim() : null

  if (!parkingLotId || !caseType || !startDate) {
    return NextResponse.json({ error: '資料不完整。' }, { status: 400 })
  }

  if (!['reserved_violation','long_stay','unplated'].includes(caseType)) {
    return NextResponse.json({ error: '案件類型錯誤。' }, { status: 400 })
  }

  if (
    caseType === 'reserved_violation' &&
    !['disabled','parent_child'].includes(String(reservedType || ''))
  ) {
    return NextResponse.json({ error: '請選擇身障或婦幼違規。' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('violation_parking_cases')
    .insert({
      parking_lot_id: parkingLotId,
      case_type: caseType,
      reserved_type: caseType === 'reserved_violation' ? reservedType : null,
      vehicle_plate: caseType === 'unplated' ? null : plate,
      location_text: locationText,
      start_date: startDate,
      notes,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || '建立案件失敗。' },
      { status: 400 }
    )
  }

  return NextResponse.json({ id: data.id })
}
