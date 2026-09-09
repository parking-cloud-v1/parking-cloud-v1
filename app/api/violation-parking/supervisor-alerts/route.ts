import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整')
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('id,role,is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.is_active || profile.role !== 'supervisor') {
      return NextResponse.json({ error: '只有主管可以查看違規即時通知。' }, { status: 403 })
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
        parking_lots (name),
        violation_parking_photos (
          id,
          photo_type,
          photo_date,
          storage_path,
          file_name,
          uploaded_at
        )
      `)
      .in('supervisor_status', ['pending', 'seen', 'reported'])
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      return NextResponse.json(
        { error: `違規通知讀取失敗：${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '違規通知讀取失敗。' },
      { status: 500 }
    )
  }
}
