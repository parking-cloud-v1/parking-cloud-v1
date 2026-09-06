import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
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
      return NextResponse.json({ error: '缺少停車場資料。' }, { status: 400 })
    }

    const { data: lot, error: lotError } = await supabase
      .from('parking_lots')
      .select('id,name')
      .eq('id', parkingLotId)
      .maybeSingle()

    if (lotError || !lot) {
      return NextResponse.json(
        { error: '找不到停車場或沒有此場站權限。' },
        { status: 403 }
      )
    }

    const setting = {
      parking_lot_id: parkingLotId,
      enabled: body?.enabled !== false,
      pending_review_hours: boundedInt(body?.pending_review_hours, 24, 1, 720),
      supplement_warning_hours: boundedInt(
        body?.supplement_warning_hours,
        24,
        1,
        168
      ),
      sign_warning_hours: boundedInt(body?.sign_warning_hours, 24, 1, 168),
      waiting_followup_days: boundedInt(body?.waiting_followup_days, 30, 1, 365),
      monthly_sync_pending_minutes: boundedInt(
        body?.monthly_sync_pending_minutes,
        10,
        1,
        1440
      ),
      renewal_reminder_days: boundedInt(
        body?.renewal_reminder_days,
        20,
        1,
        180
      ),
      renewal_repeat_days: boundedInt(
        body?.renewal_repeat_days,
        7,
        1,
        90
      ),
      renewal_expired_grace_days: boundedInt(
        body?.renewal_expired_grace_days,
        30,
        0,
        180
      ),
      renewal_batch_limit: boundedInt(
        body?.renewal_batch_limit,
        100,
        1,
        500
      ),
      updated_by: actorUserId,
      updated_at: new Date().toISOString(),
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

    const { data, error } = await admin
      .from('online_reminder_settings')
      .upsert(setting, { onConflict: 'parking_lot_id' })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await admin.from('online_audit_logs').insert({
      actor_user_id: actorUserId,
      parking_lot_id: parkingLotId,
      action: 'ONLINE_REMINDER_SETTINGS_UPDATED',
      detail: setting,
    })

    return NextResponse.json({ ok: true, setting: data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '系統錯誤。' },
      { status: 500 }
    )
  }
}
