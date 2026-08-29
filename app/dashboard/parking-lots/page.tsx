import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function addLot(formData:FormData){
  'use server'
  const supabase=await createClient()
  const name=String(formData.get('name')||'').trim()
  const address=String(formData.get('address')||'').trim()
  if(!name) return
  await supabase.from('parking_lots').insert({name,address,status:'active'})
  revalidatePath('/dashboard/parking-lots')
}

export default async function ParkingLots(){
  const supabase=await createClient()
  const { data:{ user } }=await supabase.auth.getUser()
  const { data: profile }=await supabase.from('profiles').select('role').eq('id',user?.id).maybeSingle()
  const { data: lots }=await supabase.from('parking_lots').select('*').order('created_at',{ascending:false})
  return <><h1>停車場管理</h1>
    {profile?.role==='supervisor' && <div className="card" style={{marginBottom:20}}><h2>新增停車場</h2><form action={addLot} className="row"><input name="name" placeholder="停車場名稱" required/><input name="address" placeholder="地址"/><button className="btn">新增</button></form></div>}
    <div className="card"><table className="table"><thead><tr><th>名稱</th><th>地址</th><th>狀態</th></tr></thead><tbody>{lots?.map(l=><tr key={l.id}><td>{l.name}</td><td>{l.address||'-'}</td><td>{l.status}</td></tr>)}</tbody></table></div>
  </>
}
