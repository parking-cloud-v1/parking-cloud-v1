import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { normalizeRentalTypes } from '@/lib/online-contracts/applicationAvailability'


function normalizeCapacity(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) return NaN
  return number
}

function normalizeIso(value: unknown) {
  const text = String(value || '').trim()
  if (!text) return null

  const date = new Date(text)
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString()
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '未登入。' }, { status: 401 })
    }

    const actorUserId = user.id

    const body = await request.json()
    const parkingLotId = String(body?.parking_lot_id || '').trim()

    if (!parkingLotId) {
      return NextResponse.json(
        { error: '缺少停車場資料。' },
        { status: 400 }
      )
    }

    // 透過登入者自己的 Supabase session + RLS 確認場站權限。
    const { data: accessibleLot, error: lotError } = await supabase
      .from('parking_lots')
      .select('id,name,status')
      .eq('id', parkingLotId)
      .maybeSingle()

    if (lotError || !accessibleLot) {
      return NextResponse.json(
        { error: '找不到停車場或沒有此場站權限。' },
        { status: 403 }
      )
    }

    const enabled = Boolean(body?.enabled)
    const startsAt = normalizeIso(body?.starts_at)
    const endsAt = normalizeIso(body?.ends_at)
    const allowedRentalTypes = normalizeRentalTypes(body?.allowed_rental_types)
    const publicNote = String(body?.public_note || '').trim() || null
    const monthlyCapacityCar = normalizeCapacity(body?.monthly_capacity_car)
    const monthlyCapacityMotorcycle = normalizeCapacity(
      body?.monthly_capacity_motorcycle
    )
    const monthlyCapacityHeavyMotorcycle = normalizeCapacity(
      body?.monthly_capacity_heavy_motorcycle
    )
    const autoWaitlistWhenFull = body?.auto_waitlist_when_full !== false
    const renewalEnabled = body?.renewal_enabled !== false

    if (
      Number.isNaN(monthlyCapacityCar) ||
      Number.isNaN(monthlyCapacityMotorcycle) ||
      Number.isNaN(monthlyCapacityHeavyMotorcycle)
    ) {
      return NextResponse.json(
        { error: '月租名額必須是 0 以上整數；留空代表不限制。' },
        { status: 400 }
      )
    }

    if (enabled && !allowedRentalTypes.length) {
      return NextResponse.json(
        { error: '開放線上申請時至少需要一種月租類型。' },
        { status: 400 }
      )
    }

    if (
      startsAt &&
      endsAt &&
      new Date(endsAt).getTime() <= new Date(startsAt).getTime()
    ) {
      return NextResponse.json(
        { error: '申請截止時間必須晚於開始時間。' },
        { status: 400 }
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: '伺服器環境變數未設定完整。' },
        { status: 500 }
      )
    }

    const admin = createAdminClient(url, serviceKey, {
      auth: { persistSession: false },
    })

    const now = new Date().toISOString()

    const { data, error } = await admin
      .from('online_application_settings')
      .upsert(
        {
          parking_lot_id: parkingLotId,
          enabled,
          starts_at: startsAt,
          ends_at: endsAt,
          allowed_rental_types: allowedRentalTypes,
          public_note: publicNote,
          monthly_capacity_car: monthlyCapacityCar,
          monthly_capacity_motorcycle: monthlyCapacityMotorcycle,
          monthly_capacity_heavy_motorcycle: monthlyCapacityHeavyMotorcycle,
          auto_waitlist_when_full: autoWaitlistWhenFull,
          renewal_enabled: renewalEnabled,
          updated_by: actorUserId,
          updated_at: now,
        },
        { onConflict: 'parking_lot_id' }
      )
      .select(
        'parking_lot_id,enabled,starts_at,ends_at,allowed_rental_types,public_note,monthly_capacity_car,monthly_capacity_motorcycle,monthly_capacity_heavy_motorcycle,auto_waitlist_when_full,renewal_enabled,updated_at'
      )
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await admin.from('online_audit_logs').insert({
      actor_user_id: actorUserId,
      parking_lot_id: parkingLotId,
      action: 'ONLINE_APPLICATION_SETTINGS_UPDATED',
      detail: {
        enabled,
        starts_at: startsAt,
        ends_at: endsAt,
        allowed_rental_types: allowedRentalTypes,
        monthly_capacity_car: monthlyCapacityCar,
        monthly_capacity_motorcycle: monthlyCapacityMotorcycle,
        monthly_capacity_heavy_motorcycle: monthlyCapacityHeavyMotorcycle,
        auto_waitlist_when_full: autoWaitlistWhenFull,
        renewal_enabled: renewalEnabled,
      },
    })

    return NextResponse.json({ ok: true, setting: data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '系統錯誤。' },
      { status: 500 }
    )
  }
}
