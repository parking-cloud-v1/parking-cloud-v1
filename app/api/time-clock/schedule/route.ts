import {NextResponse} from 'next/server'
import {db,requireSupervisor} from '@/lib/time-clock/core'
export const runtime='nodejs'
const fail=(error:string,status=400)=>NextResponse.json({error},{status})
const validMonth=(s:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(s)
const validClock=(s:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s)
export async function GET(req:Request){
 if(!await requireSupervisor())return fail('僅主管可查看',403)
 const u=new URL(req.url), staffId=u.searchParams.get('staffId')||'',month=u.searchParams.get('month')||''
 if(!/^[a-f\d-]{36}$/i.test(staffId)||!validMonth(month))return fail('員工或月份錯誤')
 const d=db(),start=month+'-01',end=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),1).toISOString().slice(0,10)
 const [shift,offs]=await Promise.all([
  d.from('time_clock_shift_defaults').select('start_time,end_time,break_minutes').eq('staff_id',staffId).maybeSingle(),
  d.from('time_clock_day_off').select('off_date').eq('staff_id',staffId).gte('off_date',start).lt('off_date',end)
 ])
 if(shift.error||offs.error)return fail(shift.error?.message||offs.error?.message||'讀取失敗',500)
 return NextResponse.json({shift:shift.data||{start_time:'08:00',end_time:'17:00',break_minutes:0},offDays:(offs.data||[]).map(x=>x.off_date)})
}
export async function POST(req:Request){
 if(!await requireSupervisor())return fail('僅主管可設定',403)
 let b:any;try{b=await req.json()}catch{return fail('資料格式錯誤')}
 const staffId=String(b.staffId||''),month=String(b.month||''),startTime=String(b.startTime||''),endTime=String(b.endTime||'')
 const breakMinutes=Number(b.breakMinutes),offDays=b.offDays
 if(!/^[a-f\d-]{36}$/i.test(staffId)||!validMonth(month)||!validClock(startTime)||!validClock(endTime)||!Number.isInteger(breakMinutes)||breakMinutes<0||breakMinutes>720)return fail('班別或月份格式錯誤')
 const count=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate()
 if(!Array.isArray(offDays)||offDays.length>31||offDays.some((v:any)=>!Number.isInteger(v)||v<1||v>count)||new Set(offDays).size!==offDays.length)return fail('休假日期有誤')
 const d=db();const {data:staff,error:staffError}=await d.from('time_clock_staff').select('id').eq('id',staffId).maybeSingle()
 if(staffError||!staff)return fail('查無員工')
 const {error:e1}=await d.from('time_clock_shift_defaults').upsert({staff_id:staffId,start_time:startTime,end_time:endTime,break_minutes:breakMinutes,updated_at:new Date().toISOString()},{onConflict:'staff_id'})
 if(e1)return fail(e1.message,500)
 const first=month+'-01',next=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),1).toISOString().slice(0,10)
 const {error:e2}=await d.from('time_clock_day_off').delete().eq('staff_id',staffId).gte('off_date',first).lt('off_date',next)
 if(e2)return fail(e2.message,500)
 if(offDays.length){const {error:e3}=await d.from('time_clock_day_off').insert(offDays.map((day:number)=>({staff_id:staffId,off_date:month+'-'+String(day).padStart(2,'0')})))
 if(e3)return fail('班表寫入未完成：'+e3.message,500)}
 return NextResponse.json({ok:true})
}
