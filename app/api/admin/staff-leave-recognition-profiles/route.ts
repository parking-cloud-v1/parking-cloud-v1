import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function requireSupervisor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: '未登入' }, { status: 401 }) }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) }
  }

  if (!profile?.is_active || profile.role !== 'supervisor') {
    return { error: NextResponse.json({ error: '僅主管可使用' }, { status: 403 }) }
  }

  return { supabase, user }
}

function normalizeKeywords(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 30)
  )]
}

export async function GET() {
  const auth = await requireSupervisor()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('staff_leave_recognition_profiles')
    .select('id,name,staff_name,parking_lot_name,leave_shift,match_keywords,created_at,updated_at')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profiles: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireSupervisor()
  if ('error' in auth) return auth.error
  const { supabase, user } = auth

  const body = await request.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const staffName = String(body.staff_name || '').trim()
  const parkingLotName = String(body.parking_lot_name || '').trim()
  const leaveShift = String(body.leave_shift || '全天').trim() || '全天'
  const keywords = normalizeKeywords(body.match_keywords)

  if (!name || !staffName || !parkingLotName || keywords.length === 0) {
    return NextResponse.json({
      error: '請填設定名稱、管理員姓名、停車場與至少 1 個辨識關鍵字',
    }, { status: 400 })
  }

  // 同名設定直接更新，避免各主管重複建立。
  const { data: existing, error: existingError } = await supabase
    .from('staff_leave_recognition_profiles')
    .select('id')
    .eq('name', name)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('staff_leave_recognition_profiles')
      .update({
        staff_name: staffName,
        parking_lot_name: parkingLotName,
        leave_shift: leaveShift,
        match_keywords: keywords,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ profile: data, action: 'updated' })
  }

  const { data, error } = await supabase
    .from('staff_leave_recognition_profiles')
    .insert({
      name,
      staff_name: staffName,
      parking_lot_name: parkingLotName,
      leave_shift: leaveShift,
      match_keywords: keywords,
      created_by: user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data, action: 'created' })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSupervisor()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const id = new URL(request.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: '缺少設定 ID' }, { status: 400 })

  const { error } = await supabase
    .from('staff_leave_recognition_profiles')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
