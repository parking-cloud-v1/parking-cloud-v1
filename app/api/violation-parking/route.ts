import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Profile = {
  id: string
  role: string
  is_active: boolean
}

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

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export async function GET(request: Request) {
  try {
    const { supabase, user, profile } = await authorize()

    if (!user) {
      return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })
    }
    if (!profile?.is_active || !['manager', 'supervisor'].includes(profile.role)) {
      return NextResponse.json({ error: '此帳號沒有違規案件讀取權限。' }, { status: 403 })
    }

    const url = new URL(request.url)
    const lotId = String(url.searchParams.get('lotId') || '').trim()
    if (!lotId) return NextResponse.json({ data: [] })

    if (!(await canAccessLot(supabase, user.id, profile, lotId))) {
      return NextResponse.json({ error: '沒有此停車場的操作權限。' }, { status: 403 })
    }

    const db = admin()
    const { data, error } = await db
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
        supervisor_status,
        supervisor_seen_at,
        handled_at,
        created_at,
        violation_parking_photos (
          id,
          photo_type,
          photo_date,
          storage_path,
          file_name,
          mime_type,
          file_size,
          uploaded_at
        )
      `)
      .eq('parking_lot_id', lotId)
      .in('supervisor_status', ['pending', 'seen'])
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: `違規案件讀取失敗：${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '違規案件讀取失敗。' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user, profile } = await authorize()

    if (!user) {
      return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })
    }
    if (!profile?.is_active || !['manager', 'supervisor'].includes(profile.role)) {
      return NextResponse.json({ error: '此帳號沒有違規案件建立權限。' }, { status: 403 })
    }

    const body = await request.json()
    const parkingLotId = String(body?.parkingLotId || '').trim()
    const caseType = String(body?.caseType || '').trim()
    const reservedType = body?.reservedType ? String(body.reservedType).trim() : null
    const plate = body?.vehiclePlate
      ? String(body.vehiclePlate).trim().toUpperCase()
      : null
    const locationText = body?.locationText
      ? String(body.locationText).trim()
      : null
    const startDate = String(body?.startDate || '').trim()
    const notes = body?.notes ? String(body.notes).trim() : null

    if (!parkingLotId || !caseType || !validDate(startDate)) {
      return NextResponse.json({ error: '請完整填寫停車場、案件類型與日期。' }, { status: 400 })
    }
    if (!['reserved_violation', 'long_stay', 'unplated'].includes(caseType)) {
      return NextResponse.json({ error: '案件類型錯誤。' }, { status: 400 })
    }
    if (
      caseType === 'reserved_violation' &&
      !['disabled', 'parent_child'].includes(String(reservedType || ''))
    ) {
      return NextResponse.json({ error: '請選擇身障或婦幼違規。' }, { status: 400 })
    }
    if (caseType !== 'unplated' && !plate) {
      return NextResponse.json({ error: '請輸入車牌。' }, { status: 400 })
    }

    if (!(await canAccessLot(supabase, user.id, profile, parkingLotId))) {
      return NextResponse.json({ error: '沒有此停車場的操作權限。' }, { status: 403 })
    }

    const db = admin()
    const { data, error } = await db
      .from('violation_parking_cases')
      .insert({
        parking_lot_id: parkingLotId,
        case_type: caseType,
        reserved_type: caseType === 'reserved_violation' ? reservedType : null,
        vehicle_plate: caseType === 'unplated' ? null : plate,
        location_text: locationText || null,
        start_date: startDate,
        notes: notes || null,
        status: 'active',
        supervisor_status: 'pending',
        created_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || '建立案件失敗。' },
        { status: 500 }
      )
    }

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: parkingLotId,
        action: 'VIOLATION_CASE_CREATED',
        entity_type: 'violation_parking_case',
        entity_id: data.id,
        detail: {
          case_type: caseType,
          reserved_type: caseType === 'reserved_violation' ? reservedType : null,
          vehicle_plate: caseType === 'unplated' ? null : plate,
          start_date: startDate,
        },
      })
    } catch {
      // 稽核寫入失敗不阻止案件建立。
    }

    return NextResponse.json({ ok: true, id: data.id })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '建立違規案件失敗。' },
      { status: 500 }
    )
  }
}
