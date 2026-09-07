import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })

  const url = new URL(request.url)
  const lot = url.searchParams.get('lot') || ''
  let query = supabase.from('monthly_attendance_sheets')
    .select('id,parking_lot_id,attendance_month,file_name,file_size,uploaded_at')
    .order('attendance_month', { ascending: false })
    .order('uploaded_at', { ascending: false })
    .limit(24)
  if (lot) query = query.eq('parking_lot_id', lot)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data || [] })
}
