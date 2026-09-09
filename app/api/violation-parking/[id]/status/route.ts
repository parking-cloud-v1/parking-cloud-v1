import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

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
      return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,role,is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json(
        { error: `權限讀取失敗：${profileError.message}` },
        { status: 500 }
      )
    }

    if (!profile?.is_active || profile.role !== 'supervisor') {
      return NextResponse.json({ error: '只有主管可處理違規通知。' }, { status: 403 })
    }

    const body = await request.json()
    const nextStatus = String(body?.status || '').trim()
    if (!['seen', 'reported', 'closed'].includes(nextStatus)) {
      return NextResponse.json({ error: '狀態錯誤。' }, { status: 400 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: '缺少違規案件 ID。' }, { status: 400 })

    const db = admin()
    const { data: caseRow, error: readError } = await db
      .from('violation_parking_cases')
      .select('id,parking_lot_id,supervisor_status')
      .eq('id', id)
      .maybeSingle()

    if (readError || !caseRow) {
      return NextResponse.json({ error: '找不到違規案件。' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const patch: Record<string, unknown> = {
      supervisor_status: nextStatus,
      updated_at: now,
    }

    if (nextStatus === 'seen') {
      patch.supervisor_seen_at = now
      patch.handled_at = null
      patch.handled_by = null
    }

    if (nextStatus === 'reported') {
      patch.handled_at = now
      patch.handled_by = user.id
    }

    if (nextStatus === 'closed') {
      patch.status = 'closed'
      patch.handled_at = now
      patch.handled_by = user.id
    }

    const { error: updateError } = await db
      .from('violation_parking_cases')
      .update(patch)
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: caseRow.parking_lot_id,
        action: 'VIOLATION_CASE_STATUS_CHANGED',
        entity_type: 'violation_parking_case',
        entity_id: id,
        detail: {
          previous_status: caseRow.supervisor_status,
          status: nextStatus,
        },
      })
    } catch {
      // 稽核紀錄失敗不阻止主要狀態更新。
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '違規通知狀態更新失敗。' },
      { status: 500 }
    )
  }
}
