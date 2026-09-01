import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ShiftClosingForm from '@/components/ShiftClosingForm'

export default async function NewShiftClosingPage(){
  const supabase=await createClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user) redirect('/login')

  const {data:profile}=await supabase.from('profiles')
    .select('id,is_active').eq('id',user.id).maybeSingle()
  if(!profile || !profile.is_active) redirect('/login')

  const {data:parkingLots}=await supabase.from('parking_lots')
    .select('id,name').eq('status','active').order('name')

  return <div>
    <h1 style={{marginBottom:6}}>新增當日結班</h1>
    <p className="muted" style={{marginTop:0}}>填寫本班結班資料與當日結班明細。</p>
    <div style={{marginTop:20}}>
      <ShiftClosingForm parkingLots={(parkingLots||[]).map((x:any)=>({id:x.id,name:x.name}))}/>
    </div>
  </div>
}
