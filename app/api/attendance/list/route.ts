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

export async function GET(request: Request) {
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

    if (!profile?.is_active || !['supervisor','manager'].includes(profile.role)) {
      return NextResponse.json({ error: '此帳號沒有簽到表讀取權限。' }, { status: 403 })
    }

    const url = new URL(request.url)
    const lotId = String(url.searchParams.get('lot') || '').trim()

    if (!lotId) {
      return NextResponse.json({ rows: [] })
    }

    if (profile.role === 'manager') {
      const { data: assignment } = await supabase
        .from('user_parking_lots')
        .select('parking_lot_id')
        .eq('user_id', user.id)
        .eq('parking_lot_id', lotId)
        .maybeSingle()

      if (!assignment) {
        return NextResponse.json({ error: '沒有此停車場的操作權限。' }, { status: 403 })
      }
    }

    const db = admin()
    const { data, error } = await db
      .from('monthly_attendance_sheets')
      .select('id,parking_lot_id,attendance_month,file_name,file_size,uploaded_at')
      .eq('parking_lot_id', lotId)
      .order('uploaded_at', { ascending: false })
      .limit(100)

    if (error) {
      return NextResponse.json(
        { error: `簽到表讀取失敗：${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ rows: data || [] })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '簽到表讀取失敗。' },
      { status: 500 }
    )
  }
}
