import { NextRequest,NextResponse } from 'next/server'
import { clientIp,db,digest,pinHash,validPin,verifyPin } from '@/lib/time-clock/core'
export const runtime='nodejs'
const fail=(error:string,status=400)=>NextResponse.json({error},{status})
async function device(req:NextRequest){
 const raw=req.cookies.get('tc_device')?.value||''
 const [id,secret]=raw.split('.')
 if(!/^[a-f0-9-]{36}$/.test(id||'')||! /^[a-f0-9]{64}$/.test(secret||''))return null
 const {data}=await db().from('time_clock_devices').select('*').eq('id',id).eq('secret_hash',digest(secret)).eq('enabled',true).maybeSingle()
 const ip=clientIp(req)
 if(!data || !ip || data.ip_address!==ip)return null
 const {data:lot,error:lotError}=await db().from('parking_lots').select('id').eq('id',data.parking_lot_id).eq('status','active').maybeSingle()
 if(lotError||!lot)return null
 return data
}
async function eligibleStaff(lotId:string,kind:'in'|'out'='in'){
 const d=db()
 const {data:direct,error:e1}=await d.from('time_clock_staff').select('id,name,parking_lot_id,pin_hash').eq('parking_lot_id',lotId).eq('is_active',true)
 if(e1)throw new Error(e1.message)
 const localDay=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'})
 const {data:access,error:e2}=await d.from('time_clock_staff_lot_access').select('staff_id,access_type,start_date,end_date').eq('parking_lot_id',lotId)
 if(e2)throw new Error(e2.message)
 const ids=(access||[]).filter(a=>a.access_type==='mobile'||(a.start_date<=localDay && a.end_date>=localDay)).map(a=>a.staff_id)
 // 跨午夜簽退允許前一日調動授權，但限仍有未結束班次者。
 if(kind==='out'){
  const yesterday=new Date(Date.now()-24*3600000).toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'})
  for(const a of access||[])if(a.access_type==='temporary'&&a.start_date<=yesterday&&a.end_date>=yesterday)ids.push(a.staff_id)
 }
 const {data:allMobile,error:mobileError}=await d.from('time_clock_mobile_staff').select('staff_id')
 if(mobileError)throw new Error(mobileError.message)
 ids.push(...(allMobile||[]).map(x=>x.staff_id))
 const unique=[...new Set(ids)]
 const {data:more,error:e3}=unique.length?await d.from('time_clock_staff').select('id,name,parking_lot_id,pin_hash').in('id',unique).eq('is_active',true):{data:[],error:null}
 if(e3)throw new Error(e3.message)
 return [...new Map([...(direct||[]),...(more||[])].map(v=>[v.id,v])).values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-TW'))
}
export async function GET(req:NextRequest){
 const dev=await device(req);if(!dev)return fail('此電腦尚未授權，或外部 IP 已變更，請聯絡主管重新授權。',403)
 try{const staff=await eligibleStaff(dev.parking_lot_id);return NextResponse.json({device:dev.label,staff:staff.map(({pin_hash,...s})=>({...s,activated:!!pin_hash}))})}catch(e){return fail(e instanceof Error?e.message:'讀取失敗',500)}
}
export async function POST(req:NextRequest){
 const dev=await device(req);if(!dev)return fail('此電腦或 IP 未授權',403)
 let b:any;try{b=await req.json()}catch{return fail('資料格式錯誤')}
 const id=String(b.staffId||'')
 const d=db();const {data:s}=await d.from('time_clock_staff').select('*').eq('id',id).eq('is_active',true).maybeSingle()
 if(!s)return fail('找不到有效員工')
 try{const allowed=await eligibleStaff(dev.parking_lot_id,b.kind==='out'?'out':'in');if(!allowed.some(x=>x.id===id))return fail('此員工尚未授權於本場打卡',403)}catch(e){return fail(e instanceof Error?e.message:'授權檢查失敗',500)}
 // Restrict repeated guesses; failed attempts are recorded server-side.
 const windowStart=new Date(Date.now()-10*60*1000).toISOString()
 const {count}=await d.from('time_clock_attempts').select('id',{count:'exact',head:true}).eq('staff_id',id).gte('attempted_at',windowStart)
 if((count||0)>=8)return fail('嘗試次數過多，請10分鐘後再試',429)
 const {error:attemptError}=await d.from('time_clock_attempts').insert({staff_id:id})
 if(attemptError)return fail('打卡驗證暫時無法使用',500)
 if(b.action==='activate'){
  if(s.pin_hash)return fail('已啟用；需要重設請找主管重新發碼')
  if(!validPin(b.pin))return fail('PIN限4至6位數字')
  const code=String(b.code||'').trim().toUpperCase()
  if(!s.activation_hash||!s.activation_expires_at||Date.parse(s.activation_expires_at)<Date.now()||digest(code)!==s.activation_hash)return fail('啟用碼錯誤或已失效')
  const {data, error}=await d.from('time_clock_staff').update({pin_hash:pinHash(b.pin),activation_hash:null,activation_expires_at:null}).eq('id',id).eq('activation_hash',s.activation_hash).is('pin_hash',null).select('id')
  if(error)return fail(error.message,500)
  if(!data?.length)return fail('啟用碼已被使用，請重新取得')
  return NextResponse.json({ok:true,message:'PIN設定成功，請開始打卡'})
 }
 if(b.action==='punch'){
  if(!validPin(b.pin)||!s.pin_hash||!verifyPin(b.pin,s.pin_hash))return fail('PIN錯誤或尚未啟用',403)
  const kind=String(b.kind||'')
  if(!['in','out'].includes(kind))return fail('選擇上班或下班')
  const {data,error}=await d.rpc('time_clock_record',{p_staff_id:id,p_device_id:dev.id,p_kind:kind})
  if(error)return fail(error.message)
  return NextResponse.json({ok:true,at:data,kind,message:kind==='in'?'上班打卡成功':'下班打卡成功'})
 }
 return fail('未知操作')
}
