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
 return data && ip && data.ip_address===ip?data:null
}
export async function GET(req:NextRequest){
 const dev=await device(req);if(!dev)return fail('此電腦尚未授權，或外部 IP 已變更，請聯絡主管重新授權。',403)
 const {data,error}=await db().from('time_clock_staff').select('id,name,parking_lot_id,pin_hash').eq('parking_lot_id',dev.parking_lot_id).eq('is_active',true).order('name')
 return error?fail(error.message,500):NextResponse.json({device:dev.label,staff:(data||[]).map(({pin_hash,...s})=>({...s,activated:!!pin_hash}))})
}
export async function POST(req:NextRequest){
 const dev=await device(req);if(!dev)return fail('此電腦或 IP 未授權',403)
 let b:any;try{b=await req.json()}catch{return fail('資料格式錯誤')}
 const id=String(b.staffId||'')
 const d=db();const {data:s}=await d.from('time_clock_staff').select('*').eq('id',id).eq('parking_lot_id',dev.parking_lot_id).eq('is_active',true).maybeSingle()
 if(!s)return fail('沒有此場站員工')
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
