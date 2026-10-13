'use client'
import {useEffect,useMemo,useState} from 'react'
type Staff={id:string,name:string,parking_lot_id:string,activated:boolean,is_active:boolean}
type Dev={id:string,label:string,parking_lot_id:string,ip_address:string,enabled:boolean}
type Event={id:string,staff_id:string,event_type:'in'|'out',punched_at:string}
type Payload={lots:{id:string,name:string}[],staff:Staff[],devices:Dev[],events:Event[],ip:string,eventsTruncated:boolean}
const localDate=(v:string)=>new Date(v).toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'})
const localTime=(v:string)=>new Date(v).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,hour:'2-digit',minute:'2-digit'})
const nextMonth=(month:string,n:number)=>{const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+n,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
const minutesText=(n:number)=>`${Math.floor(n/60)}小時${n%60?`${n%60}分`:''}`
function buildRows(events:Event[],staffId:string,month:string,breakMinutes:number){
 const [y,m]=month.split('-').map(Number),count=new Date(y,m,0).getDate()
 const rows=Array.from({length:count},(_,i)=>({date:month+'-'+String(i+1).padStart(2,'0'),ins:[] as string[],outs:[] as string[],minutes:0,notes:[] as string[]}))
 const ev=events.filter(e=>e.staff_id===staffId).sort((a,b)=>a.punched_at.localeCompare(b.punched_at))
 let open:Event|null=null
 for(const e of ev){if(e.event_type==='in'){
   if(open){const ix=rows.findIndex(r=>r.date===localDate(open!.punched_at));if(ix>=0)rows[ix].notes.push('有未配對簽到')}
   open=e
 }else if(open){const start=open as Event,idx=rows.findIndex(r=>r.date===localDate(start.punched_at))
   if(idx>=0){const diff=Math.round((Date.parse(e.punched_at)-Date.parse(start.punched_at))/60000)
    if(diff>0&&diff<=36*60){rows[idx].ins.push(localTime(start.punched_at));rows[idx].outs.push(localDate(e.punched_at)===rows[idx].date?localTime(e.punched_at):`${localDate(e.punched_at).slice(5)} ${localTime(e.punched_at)}`);rows[idx].minutes+=Math.max(0,diff-breakMinutes)}
    else rows[idx].notes.push('打卡間隔異常，待確認')
   }open=null
 }else{const idx=rows.findIndex(r=>r.date===localDate(e.punched_at));if(idx>=0)rows[idx].notes.push('未配對簽退')}
 }
 if(open){const idx=rows.findIndex(r=>r.date===localDate(open!.punched_at));if(idx>=0){rows[idx].ins.push(localTime(open.punched_at));rows[idx].notes.push('未簽退')}}
 return rows
}
export default function TimeClockAdmin(){
 const [data,setData]=useState<Payload|null>(null),[lot,setLot]=useState(''),[month,setMonth]=useState(()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'}).slice(0,7)),[selected,setSelected]=useState('')
 const [name,setName]=useState(''),[label,setLabel]=useState(''),[message,setMessage]=useState(''),[code,setCode]=useState('')
 const [startTime,setStartTime]=useState('08:00'),[endTime,setEndTime]=useState('17:00'),[breakMinutes,setBreakMinutes]=useState('0'),[offDays,setOffDays]=useState<number[]>([]),[saving,setSaving]=useState(false)
 async function load(){const q=new URLSearchParams({month});if(lot)q.set('lot',lot);const r=await fetch('/api/time-clock/admin?'+q,{cache:'no-store'}),j=await r.json();if(!r.ok){setMessage(j.error);return}setData(j)}
 useEffect(()=>{void load()},[lot,month])
 useEffect(()=>{if(!selected){setOffDays([]);return}const q=new URLSearchParams({staffId:selected,month});fetch('/api/time-clock/schedule?'+q,{cache:'no-store'}).then(r=>r.json()).then(j=>{if(j.error){setMessage('請先執行排班 SQL：'+j.error);return}setStartTime(String(j.shift.start_time).slice(0,5));setEndTime(String(j.shift.end_time).slice(0,5));setBreakMinutes(String(j.shift.break_minutes));setOffDays((j.offDays||[]).map((v:string)=>Number(v.slice(-2))))})},[selected,month])
 async function act(action:string,extra:Record<string,unknown>={}){setCode('');const r=await fetch('/api/time-clock/admin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...extra})}),j=await r.json();setMessage(j.error||j.note||'更新成功');if(j.code)setCode(j.code);await load()}
 async function saveSchedule(){if(!selected)return;setSaving(true);try{const r=await fetch('/api/time-clock/schedule',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({staffId:selected,month,startTime,endTime,breakMinutes:Number(breakMinutes),offDays})});const j=await r.json();setMessage(j.error||'本月休假與固定班別已儲存')}finally{setSaving(false)}}
 const staff=data?.staff||[],visible=staff.filter(s=>!lot||s.parking_lot_id===lot),chosen=staff.find(s=>s.id===selected)
 const rows=useMemo(()=>selected?buildRows(data?.events||[],selected,month,Number(breakMinutes)||0):[],[data,selected,month,breakMinutes]);const total=rows.reduce((s,r)=>s+r.minutes,0)
 const count=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate()
 const first=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1,1).getDay()
 const download=()=>{if(!chosen)return;const result=[['日期','簽到時間','簽退時間','備註'],...rows.map(r=>[r.date,r.ins.join('、'),r.outs.join('、'),[...r.notes,...(offDays.includes(Number(r.date.slice(-2)))?['休假']:[])].join('；')])];const csv='\ufeff'+result.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`${month}_${chosen.name}_打卡紀錄.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 const line={marginBottom:12},button={padding:'7px 12px',margin:'4px'},input={padding:8,margin:'4px'},heading={marginTop:28}
 return <main style={{padding:24,maxWidth:1100,margin:'auto'}}><h1>主管｜電子打卡管理</h1><p>授權中控電腦的打卡入口：<a href="/time-clock" target="_blank" rel="noreferrer">/time-clock</a>；目前 IP：{data?.ip}</p>
 <p style={{color:'#a33'}}>{message}</p><p>本系統只統計打卡工時，不計算薪資或加班費。無打卡但排班上班，僅標記「待確認」，不自動判定曠工。</p>
 <div style={line}>場站：<select style={input} value={lot} onChange={e=>{setLot(e.target.value);setSelected('')}}><option value="">全部</option>{data?.lots.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select> 月份：<input type="month" style={input} value={month} onChange={e=>setMonth(e.target.value)}/></div>
 <h2 style={heading}>員工管理</h2><input style={input} placeholder="新增員工姓名" value={name} onChange={e=>setName(e.target.value)}/><button style={button} disabled={!lot||!name.trim()} onClick={()=>act('addStaff',{name,lot})}>新增到所選場站</button>
 {code&&<p style={{background:'#fff5d9',padding:12}}>單次啟用碼：<strong>{code}</strong>（有效24小時）</p>}
 <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>員工</th><th>所屬場站</th><th>PIN</th><th>操作</th></tr></thead><tbody>{visible.map(s=><tr key={s.id}><td>{s.name}</td><td>{data?.lots.find(l=>l.id===s.parking_lot_id)?.name}</td><td>{s.activated?'已設定':'待啟用'}</td><td><button style={button} onClick={()=>setSelected(s.id)}>查看排班／工時</button><button style={button} onClick={()=>{if(confirm('將重設舊PIN，確定？'))void act('activation',{id:s.id})}}>發啟用碼</button><button style={button} onClick={()=>act('toggleStaff',{id:s.id,enabled:!s.is_active})}>{s.is_active?'停用':'啟用'}</button></td></tr>)}</tbody></table></div>
 <h2 style={heading}>每月休假月曆與工時</h2>{!selected?<p>請先點選上方員工的「查看排班／工時」。</p>:<section style={{border:'1px solid #ddd',padding:16,borderRadius:12}}><h3>{chosen?.name}｜{month}</h3>
 <div style={line}>固定班別：<input aria-label="上班時間" type="time" style={input} value={startTime} onChange={e=>setStartTime(e.target.value)}/> ～ <input aria-label="下班時間" type="time" style={input} value={endTime} onChange={e=>setEndTime(e.target.value)}/>　每班不計入工時的休息：<input aria-label="休息分鐘" type="number" min="0" max="720" style={{...input,width:75}} value={breakMinutes} onChange={e=>setBreakMinutes(e.target.value)}/> 分鐘</div>
 <p>點日期切換「班／休」；固定班別只需設定一次，每月更新休假日期。</p>
 <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:5,maxWidth:590}}>{['日','一','二','三','四','五','六'].map(w=><div key={w} style={{textAlign:'center',fontWeight:700}}>{w}</div>)}{Array.from({length:first},(_,i)=><div key={'empty'+i}/>)}{Array.from({length:count},(_,i)=>i+1).map(d=><button key={d} style={{padding:'12px 2px',borderRadius:7,border:'1px solid #ccd5df',background:offDays.includes(d)?'#ffe6de':'#f2f7fc',color:'#243247'}} onClick={()=>setOffDays(v=>v.includes(d)?v.filter(x=>x!==d):[...v,d].sort((a,b)=>a-b))}>{d}<small style={{display:'block'}}>{offDays.includes(d)?'休':'班'}</small></button>)}</div>
 <p>本月排休 {offDays.length} 天｜預排上班 {count-offDays.length} 天　<button style={button} disabled={saving} onClick={saveSchedule}>{saving?'儲存中':'儲存休假與班別'}</button></p>
 <h3>工時統計（僅主管端）</h3><div style={{display:'flex',gap:22,flexWrap:'wrap'}}><strong>當月完整打卡出勤：{rows.filter(r=>r.minutes>0).length} 天</strong><strong>當月有效工時：{minutesText(total)}</strong><strong>待確認筆數：{rows.filter(r=>r.notes.length>0).length}</strong></div>
 {data?.eventsTruncated&&<p style={{color:'#aa3311'}}>當月打卡量超過讀取上限，總工時可能不完整，請勿用於查核。</p>}
 <p><button style={button} onClick={download}>匯出此員工個人打卡表（CSV）</button>（不包含工時與薪資）</p>
 <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th>日期</th><th>簽到</th><th>簽退</th><th>當日有效工時</th><th>狀態</th></tr></thead><tbody>{rows.map(r=><tr key={r.date} style={{borderTop:'1px solid #e4e7eb'}}><td>{r.date}</td><td>{r.ins.join('、')||'—'}</td><td>{r.outs.join('、')||'—'}</td><td>{r.minutes?minutesText(r.minutes):'—'}</td><td>{r.notes.join('、')|| (offDays.includes(Number(r.date.slice(-2)))?'休假':r.minutes?'已出勤':'未打卡／待確認')}</td></tr>)}</tbody></table></div>
 <p style={{fontSize:12,color:'#666'}}>工時＝每組簽退－簽到－預設休息分鐘，跨日歸在簽到日；未配對紀錄不計入總工時。跨月班次及補登需主管核對。</p></section>}
 <h2 style={heading}>授權中控電腦</h2><input style={input} placeholder="電腦名稱" value={label} onChange={e=>setLabel(e.target.value)}/><button style={button} disabled={!lot||!label.trim()} onClick={()=>act('authorizeDevice',{label,lot})}>授權目前電腦及IP</button><p>請在中控電腦上操作授權，固定外部 IP 變動或清除 Cookie 後須重新授權。</p>
 {data?.devices.filter(d=>!lot||d.parking_lot_id===lot).map(d=><div key={d.id}>{d.label}｜{d.ip_address}｜{d.enabled?'啟用':'停用'} <button style={button} onClick={()=>act('toggleDevice',{id:d.id,enabled:!d.enabled})}>{d.enabled?'撤銷':'重新啟用'}</button></div>)}
 </main>
}
