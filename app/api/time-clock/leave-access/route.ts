import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/time-clock/core'
export const runtime='nodejs'
const fail=(error:string,status=400)=>NextResponse.json({error},{status})
async function supervisor(){const c=await createClient(),{data:{user}}=await c.auth.getUser();if(!user)return null;const {data:p}=await db().from('profiles').select('role,is_active').eq('id',user.id).maybeSingle();return p?.is_active&&p.role==='supervisor'?user:null}
export async function GET(){
 try{
  const s=await supervisor();if(!s)return fail('僅主管可管理排休協助權限',403)
  const d=db()
  const [accounts,lots,permissions,profiles]=await Promise.all([
   d.auth.admin.listUsers({perPage:1000,page:1}),
   d.from('parking_lots').select('id,name').eq('status','active').order('name'),
   d.from('time_clock_leave_editors').select('user_id,parking_lot_id'),
   d.from('profiles').select('id,role,is_active').eq('is_active',true)
  ])
  if(accounts.error||lots.error||permissions.error||profiles.error)return fail(accounts.error?.message||lots.error?.message||permissions.error?.message||profiles.error?.message||'讀取失敗',500)
  const valid=new Set((profiles.data||[]).filter(p=>p.role!=='supervisor').map(p=>p.id))
  const users=(accounts.data?.users||[]).filter(u=>valid.has(u.id)).map(u=>({id:u.id,email:u.email||'無Email'}))
  return NextResponse.json({users,lots:lots.data||[],permissions:permissions.data||[],note:accounts.data?.users?.length===1000?'帳號超過1000人，請聯絡管理者擴充查詢':''})
 }catch{return fail('讀取授權設定失敗',500)}
}
export async function POST(req:Request){
 try{
  const s=await supervisor();if(!s)return fail('僅主管可設定',403)
  const b=await req.json(),userId=String(b.userId||''),lotId=String(b.lotId||''),enabled=b.enabled===true
  if(!/^[0-9a-f-]{36}$/i.test(userId)||!/^[0-9a-f-]{36}$/i.test(lotId))return fail('帳號或場站錯誤')
  const d=db()
  const [p,l]=await Promise.all([d.from('profiles').select('role,is_active').eq('id',userId).maybeSingle(),d.from('parking_lots').select('id').eq('id',lotId).eq('status','active').maybeSingle()])
  if(p.error||l.error||!p.data?.is_active||p.data.role==='supervisor'||!l.data)return fail('僅能授權有效的非主管帳號及營運中場站',400)
  const r=enabled?await d.from('time_clock_leave_editors').upsert({user_id:userId,parking_lot_id:lotId,created_by:s.id},{onConflict:'user_id,parking_lot_id'}):await d.from('time_clock_leave_editors').delete().eq('user_id',userId).eq('parking_lot_id',lotId)
  return r.error?fail(r.error.message,500):NextResponse.json({ok:true})
 }catch{return fail('儲存授權失敗',400)}
}
