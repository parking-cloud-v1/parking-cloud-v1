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

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.is_active || profile.role !== 'supervisor') {
      return NextResponse.json({ error: '只有主管可處理違規通知。' }, { status: 403 })
    }

    const body = await request.json()
    const status = String(body?.status || '').trim()

    if (!['seen','reported','closed'].includes(status)) {
      return NextResponse.json({ error: '狀態錯誤。' }, { status: 400 })
    }

    const { id } = await context.params
    const db = admin()
    const now = new Date().toISOString()

    const patch: Record<string, any> = {
      supervisor_status: status,
      updated_at: now,
    }

    if (status === 'seen') patch.supervisor_seen_at = now
    if (status === 'reported' || status === 'closed') {
      patch.handled_at = now
      patch.handled_by = user.id
    }

    const { error } = await db
      .from('violation_parking_cases')
      .update(patch)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: null,
        action: 'VIOLATION_CASE_STATUS_CHANGED',
        entity_type: 'violation_parking_case',
        entity_id: id,
        detail: { status },
      })
    } catch {
      // 稽核紀錄失敗不應阻止違規案件狀態更新。
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '違規通知狀態更新失敗。' },
      { status: 500 }
    )
  }
}
