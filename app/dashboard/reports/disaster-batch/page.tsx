import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DisasterInspectionBatchExporter from '@/components/DisasterInspectionBatchExporter'

export default async function ReportDisasterBatchPage({searchParams}:{searchParams:Promise<{date?:string;download?:string}>}){
  const params=await searchParams; const date=params.date||''; const autoDownload=params.download==='1'
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect('/dashboard/reports')
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login')
  const {data:profile}=await supabase.from('profiles').select('role,is_active').eq('id',user.id).maybeSingle(); if(!profile?.is_active) redirect('/login'); if(!['supervisor','accountant'].includes(profile.role)) redirect('/dashboard')
  const {data,error}=await supabase.from('disaster_inspections').select('id').eq('inspection_date',date).order('created_at',{ascending:true})
  const ids=(data||[]).map((x:any)=>x.id as string)
  return <div style={{paddingBottom:40}}><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><h1 style={{margin:'0 0 6px'}}>報表中心｜防災當日批次下載</h1><p className="muted" style={{margin:0}}>檢查日期：{date}｜共 {ids.length} 份</p></div><Link href="/dashboard/reports" style={{textDecoration:'none',padding:'9px 13px',border:'1px solid #cbd5e1',borderRadius:8}}>返回報表中心</Link></div>{error?<div className="card" style={{marginTop:20,color:'#b91c1c'}}>讀取失敗：{error.message}</div>:!ids.length?<div className="card" style={{marginTop:20}}>這個日期沒有防災檢查資料。</div>:<DisasterInspectionBatchExporter inspectionIds={ids} inspectionDate={date} autoDownload={autoDownload}/>}</div>
}
