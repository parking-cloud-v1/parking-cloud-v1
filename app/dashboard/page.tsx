import { createClient } from '@/lib/supabase/server'

export default async function Dashboard(){
  const supabase=await createClient()
  const { data:{ user } }=await supabase.auth.getUser()
  const { data: profile }=await supabase.from('profiles').select('role').eq('id',user?.id).maybeSingle()
  let lotsQuery=supabase.from('parking_lots').select('id,name,status').eq('status','active')
  if(profile?.role!=='supervisor'){
    const { data: links }=await supabase.from('user_parking_lots').select('parking_lot_id').eq('user_id',user?.id)
    const ids=(links||[]).map(x=>x.parking_lot_id)
    if(ids.length) lotsQuery=lotsQuery.in('id',ids); else lotsQuery=lotsQuery.eq('id','00000000-0000-0000-0000-000000000000')
  }
  const { data: lots }=await lotsQuery
  return <>
    <div className="row" style={{justifyContent:'space-between',marginBottom:20}}><div><h1 style={{margin:0}}>營運首頁</h1><div className="muted">第一階段系統骨架已建立</div></div><select><option>全部可管理停車場</option>{lots?.map(l=><option key={l.id}>{l.name}</option>)}</select></div>
    <div className="grid">
      <div className="card"><div className="muted">可管理停車場</div><div className="stat">{lots?.length||0}</div></div>
      <div className="card"><div className="muted">今日待辦</div><div className="stat">0</div></div>
      <div className="card"><div className="muted">待改善事項</div><div className="stat">0</div></div>
      <div className="card"><div className="muted">即將到期月租</div><div className="stat">0</div></div>
    </div>
    <div className="card" style={{marginTop:20}}><h2>目前可管理停車場</h2>{lots?.length?<table className="table"><thead><tr><th>名稱</th><th>狀態</th></tr></thead><tbody>{lots.map(l=><tr key={l.id}><td>{l.name}</td><td>{l.status}</td></tr>)}</tbody></table>:<p className="muted">尚未分配停車場。</p>}</div>
  </>
}
