import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { clientIp,db,digest,requireSupervisor,token } from '@/lib/time-clock/core'
export const runtime='nodejs'
const fail=(error:string,status=400)=>NextResponse.json({error},{status})
export async function GET(req:Request){
 if(!await requireSupervisor())return fail('僅主管可查看',403)
 const lot=new URL(req.url).searchParams.get('lot')||''
 const d=db()
 const month=new URL(req.url).searchParams.get('month')||new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'}).slice(0,7)
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return fail('月份錯誤')
 const [yy,mm]=month.split('-').map(Number)
 const startUtc=new Date(Date.UTC(yy,mm-1,1)-8*3600000).toISOString()
 const endUtc=new Date(Date.UTC(yy,mm+0,2)-8*3600000).toISOString() // 多取一日，支援月底跨日簽退
 const [lots,staff,devices,events]=await Promise.all([
 d.from('parking_lots').select('id,name').eq('status','active').order('name'),
 d.from('time_clock_staff').select('id,name,parking_lot_id,is_active,pin_hash').eq('is_active',true).order('name'),
 d.from('time_clock_devices').select('id,label,parking_lot_id,ip_address,enabled,created_at').eq('enabled',true).order('created_at',{ascending:false}),
 d.from('time_clock_events').select('id,staff_id,device_id,event_type,punched_at').gte('punched_at',startUtc).lt('punched_at',endUtc).order('punched_at',{ascending:true}).limit(10000)
 ])
 for(const r of [lots,staff,devices,events])if(r.error)return fail(r.error.message,500)
 const {data:access,error:accessError}=await d.from('time_clock_staff_lot_access').select('staff_id,parking_lot_id,access_type,start_date,end_date').order('created_at',{ascending:false})
 if(accessError)return fail('請先執行跨場站授權 SQL：'+accessError.message,500)
 return NextResponse.json({access:access||[],lots:lots.data,staff:(staff.data||[]).map(({pin_hash,...s})=>({...s,activated:!!pin_hash})),devices:devices.data,events:events.data,month,eventsTruncated:(events.data||[]).length>=10000,ip:clientIp(req)})
}
export async function POST(req:Request){
 const user=await requireSupervisor(); if(!user)return fail('僅主管可設定',403)
 let body:any;try{body=await req.json()}catch{return fail('資料錯誤')}
 const d=db();const action=String(body.action||'')
 if(action==='saveAccess'){
  const id=String(body.id||''),type=String(body.type||''),lots=body.lots,from=String(body.from||''),to=String(body.to||'')
  if(!/^[a-f0-9-]{36}$/i.test(id)||!['fixed','mobile','temporary'].includes(type))return fail('員工或類型錯誤')
  const {data:person,error:pe}=await d.from('time_clock_staff').select('id,parking_lot_id').eq('id',id).eq('is_active',true).maybeSingle()
  if(pe||!person)return fail('找不到有效員工')
  if(!Array.isArray(lots)||lots.length>100||lots.some((x:unknown)=>typeof x!=='string'||!/^[a-f0-9-]{36}$/i.test(x as string))||new Set(lots).size!==lots.length)return fail('場站資料錯誤')
  const otherLots=lots.filter((x:string)=>x!==person.parking_lot_id)
  if(type==='temporary' && (!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||Number.isNaN(Date.parse(from))||Number.isNaN(Date.parse(to))))return fail('調動期間有誤')
  if(type==='fixed' && otherLots.length)return fail('固定員工不需選其他場站')
  if(type!=='fixed' && otherLots.length===0)return fail('至少選一個支援場站')
  if(otherLots.length){const {data:live,error:le}=await d.from('parking_lots').select('id').in('id',otherLots).eq('status','active');if(le||live?.length!==otherLots.length)return fail('支援場站必須營運中')}
  // 先清除先前授權後寫入目前設定；資料庫操作若中途失敗會顯示錯誤供主管重試。
  const {error:de}=await d.from('time_clock_staff_lot_access').delete().eq('staff_id',id)
  if(de)return fail(de.message,500)
  if(otherLots.length){const rows=otherLots.map((parking_lot_id:string)=>({staff_id:id,parking_lot_id,access_type:type==='temporary'?'temporary':'mobile',start_date:type==='temporary'?from:null,end_date:type==='temporary'?to:null}))
   const {error:ie}=await d.from('time_clock_staff_lot_access').insert(rows)
   if(ie)return fail('授權寫入失敗，請重試：'+ie.message,500)
  }
  return NextResponse.json({ok:true,note:'打卡場站授權已更新；原本PIN不變'})
 }
 if(action==='addStaff'){
  const name=String(body.name||'').trim(),parking_lot_id=String(body.lot||'')
  if(!name||name.length>50||!parking_lot_id)return fail('請選擇場站及姓名')
  const {data:activeLot,error:lotError}=await d.from('parking_lots').select('id').eq('id',parking_lot_id).eq('status','active').maybeSingle()
  if(lotError)return fail(lotError.message,500)
  if(!activeLot)return fail('此停車場已停用或不存在',400)
  const {data,error}=await d.from('time_clock_staff').insert({name,parking_lot_id}).select('id').single()
  return error?fail(error.message):NextResponse.json({ok:true,id:data.id})
 }
 if(action==='activation'){
  const id=String(body.id||'');const code=randomCode()
  const {error}=await d.from('time_clock_staff').update({activation_hash:digest(code),activation_expires_at:new Date(Date.now()+24*3600*1000).toISOString(),pin_hash:null}).eq('id',id).eq('is_active',true)
  return error?fail(error.message):NextResponse.json({ok:true,code,note:'啟用碼只顯示一次，有效24小時；重發會清除舊PIN'})
 }
 if(action==='authorizeDevice'){
  const label=String(body.label||'').trim(),lot=String(body.lot||''),ip=clientIp(req)
  if(!label||!lot||!ip)return fail('請在要授權的中控電腦操作，並填寫裝置名稱及場站')
  const {data:activeLot,error:lotError}=await d.from('parking_lots').select('id').eq('id',lot).eq('status','active').maybeSingle()
  if(lotError)return fail(lotError.message,500)
  if(!activeLot)return fail('此停車場已停用或不存在',400)
  const secret=token()
  const {data,error}=await d.from('time_clock_devices').insert({label,parking_lot_id:lot,ip_address:ip,secret_hash:digest(secret)}).select('id').single()
  if(error)return fail(error.message)
  ;(await cookies()).set('tc_device',`${data.id}.${secret}`,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/time-clock/kiosk',maxAge:60*60*24*365})
  return NextResponse.json({ok:true,ip,note:'已授權本機。須使用同一瀏覽器打卡；清除Cookie或更換IP後需重新授權。'})
 }
 if(action==='toggleDevice'){
  const {error}=await d.from('time_clock_devices').update({enabled:body.enabled===true}).eq('id',String(body.id||''))
  return error?fail(error.message):NextResponse.json({ok:true})
 }
 if(action==='toggleStaff'){
  const {error}=await d.from('time_clock_staff').update({is_active:body.enabled===true}).eq('id',String(body.id||''))
  return error?fail(error.message):NextResponse.json({ok:true})
 }
 return fail('未知操作')
}
function randomCode(){const bytes=crypto.getRandomValues(new Uint8Array(9));return [...bytes].map(b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%32]).join('')}
