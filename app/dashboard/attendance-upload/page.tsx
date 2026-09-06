import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import AttendanceSheetUpload from '@/components/AttendanceSheetUpload'

export default async function AttendanceUploadPage(){
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login')
  const {data:profile}=await supabase.from('profiles').select('role,is_active').eq('id',user.id).maybeSingle(); if(!profile?.is_active) redirect('/login'); if(!['supervisor','manager'].includes(profile.role)) redirect('/dashboard/reports')
  const lotId=await getCurrentWorkParkingLotId()
  let lotName=''
  if(lotId){ const {data}=await supabase.from('parking_lots').select('name').eq('id',lotId).maybeSingle(); lotName=data?.name||'' }
  return <div><h1 style={{marginBottom:6}}>月份簽到表上傳</h1><p className="muted" style={{marginTop:0}}>現場依工作停車場、月份上傳簽到表。會計與主管可在報表中心一次下載該月份所有場站資料。</p>{!lotId?<div className="card" style={{marginTop:20,color:'#b91c1c'}}>請先從左側選擇目前工作停車場。</div>:<div style={{marginTop:20}}><AttendanceSheetUpload parkingLotId={lotId} parkingLotName={lotName||'目前停車場'} /></div>}</div>
}
