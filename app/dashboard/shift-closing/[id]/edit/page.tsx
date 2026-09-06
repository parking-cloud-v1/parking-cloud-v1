import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ShiftClosingForm from '@/components/ShiftClosingForm'

export default async function EditShiftClosingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: report, error }, { data: details }, { data: parkingLots }] =
    await Promise.all([
      supabase
        .from('shift_closing_reports')
        .select('*')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('shift_closing_details')
        .select('*')
        .eq('report_id', id)
        .order('sort_order'),
      supabase
        .from('parking_lots')
        .select('id,name')
        .eq('status', 'active')
        .order('name'),
    ])

  if (error || !report) {
    return (
      <div className="card">
        <h1>找不到結班報表</h1>
        <p>{error?.message || '這筆資料不存在或您沒有權限。'}</p>
        <Link href="/dashboard/shift-closing">返回結班報表</Link>
      </div>
    )
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'flex-start'}}>
        <div>
          <h1 style={{marginBottom:6}}>修改當日結班報表</h1>
          <p className="muted" style={{marginTop:0}}>
            已儲存的結班資料可再次修改並儲存；支出欄位僅紀錄，不影響既有計算。
          </p>
        </div>
        <Link href="/dashboard/shift-closing" style={{textDecoration:'none',fontWeight:700}}>返回列表</Link>
      </div>
      <div style={{marginTop:20}}>
        <ShiftClosingForm
          parkingLots={(parkingLots || []).map((x:any)=>({id:x.id,name:x.name}))}
          initialReport={report as any}
          initialDetails={(details || []) as any}
        />
      </div>
    </div>
  )
}
