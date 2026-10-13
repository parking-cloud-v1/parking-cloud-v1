import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/time-clock/core'
export const runtime='nodejs'
const fail=(error:string,status=400)=>NextResponse.json({error},{status})
const uuid=(x:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x)
const monthOK=(x:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(x)&&Number(x.slice(0,4))>=2000&&Number(x.slice(0,4))<=2100
async function access(){
 const client=await createClient(),{data:{user}}=await client.auth.getUser()
 if(!user)return null
 const d=db(),{data:profile,error}=await d.from('profiles').select('role,is_active').eq('id',user.id).maybeSingle()
 if(error||!profile?.is_active)return null
 const supervisor=profile.role==='supervisor'
 const {data:access,error:e}=await d.from('time_clock_leave_editors').select('parking_lot_id').eq('user_id',user.id)
 if(e)throw new Error('尚未安裝快速排休授權資料表')
 return {userId:user.id,supervisor,allowed:new Set((access||[]).map(x=>x.parking_lot_id))}
}
export async function GET(req:Request){
 try{
 const a=await access();if(!a)return fail('請先登入自己的管理員帳號',401)
 if(!a.supervisor&&!a.allowed.size)return fail('尚未被授權排休',403)
 const u=new URL(req.url),staffId=u.searchParams.get('staffId')||'',month=u.searchParams.get('month')||''
 const d=db()
 const {data:lots,error:le}=await d.from('parking_lots').select('id,name').eq('status','active').order('name')
 if(le)return fail(le.message,500)
 const allowedLots=(lots||[]).filter(l=>a.supervisor||a.allowed.has(l.id))
 const lotIds=allowedLots.map(l=>l.id)
 const {data:staff,error:se}=lotIds.length?await d.from('time_clock_staff').select('id,name,parking_lot_id').eq('is_active',true).in('parking_lot_id',lotIds).order('name'):{data:[],error:null}
 if(se)return fail(se.message,500)
 if(!staffId)return NextResponse.json({lots:allowedLots,staff:staff||[],supervisor:a.supervisor})
 if(!uuid(staffId)||!monthOK(month))return fail('員工或月份格式錯誤')
 const person=(staff||[]).find(s=>s.id===staffId)
 if(!person)return fail('無權限查看此員工',403)
 const first=month+'-01',next=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),1).toISOString().slice(0,10)
 const {data:offs,error:oe}=await d.from('time_clock_day_off').select('off_date').eq('staff_id',staffId).gte('off_date',first).lt('off_date',next).order('off_date')
 if(oe)return fail(oe.message,500)
 return NextResponse.json({lots:allowedLots,staff:staff||[],offDays:(offs||[]).map(x=>Number(x.off_date.slice(-2))),supervisor:a.supervisor})
 }catch(e){return fail(e instanceof Error?e.message:'讀取失敗',500)}
}
export async function POST(req:Request){
 try{
 const a=await access();if(!a)return fail('請先登入自己的管理員帳號',401)
 const b=await req.json(),staffId=String(b.staffId||''),month=String(b.month||''),days=b.offDays
 if(!uuid(staffId)||!monthOK(month)||!Array.isArray(days)||days.length>31)return fail('資料格式錯誤')
 const count=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate()
 if(days.some((x:unknown)=>!Number.isInteger(x)||(x as number)<1||(x as number)>count)||new Set(days).size!==days.length)return fail('休假日期不合法')
 const d=db(),{data:person,error:pe}=await d.from('time_clock_staff').select('parking_lot_id,is_active').eq('id',staffId).maybeSingle()
 if(pe||!person?.is_active)return fail('員工不存在或已停用',404)
 if(!a.supervisor&&!a.allowed.has(person.parking_lot_id))return fail('沒有此場站的排休權限',403)
 const {data:live,error:le}=await d.from('parking_lots').select('id').eq('id',person.parking_lot_id).eq('status','active').maybeSingle()
 if(le||!live)return fail('場站已停用',403)
 const {error}=await d.rpc('time_clock_save_leave',{p_staff_id:staffId,p_month:month,p_off_days:days,p_actor:a.userId})
 return error?fail('儲存未完成：'+error.message,500):NextResponse.json({ok:true})
 }catch{return fail('無法儲存，請檢查登入狀態與資料',400)}
}
