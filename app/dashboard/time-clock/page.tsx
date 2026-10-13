'use client'
import {useEffect,useState} from 'react'
type Staff={id:string,name:string,parking_lot_id:string,activated:boolean,is_active:boolean}
type Dev={id:string,label:string,parking_lot_id:string,ip_address:string,enabled:boolean}
type Event={id:string,staff_id:string,event_type:'in'|'out',punched_at:string}
export default function TimeClockAdmin(){
 const [data,setData]=useState<{lots:{id:string,name:string}[],staff:Staff[],devices:Dev[],events:Event[],ip:string}|null>(null)
 const [lot,setLot]=useState(''),[name,setName]=useState(''),[label,setLabel]=useState(''),[message,setMessage]=useState(''),[code,setCode]=useState('')
 async function load(){const r=await fetch('/api/time-clock/admin'+(lot?'?lot='+encodeURIComponent(lot):''),{cache:'no-store'}),j=await r.json();if(!r.ok){setMessage(j.error);return}setData(j)}
 useEffect(()=>{void load()},[lot])
 async function act(action:string,extra:Record<string,unknown>={}){setCode('');const r=await fetch('/api/time-clock/admin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...extra})}),j=await r.json();setMessage(j.error||j.note||'更新成功');if(j.code)setCode(j.code);await load()}
 const staff=data?.staff||[],events=data?.events||[]
 const displayTime=(v:string)=>new Date(v).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})
 const csv=()=>{const lines=[['姓名','停車場','上班時間','下班時間','工時(小時)','加班(超過8小時,僅供參考)']];for(const s of staff.filter(s=>!lot||s.parking_lot_id===lot)){
 const e=events.filter(x=>x.staff_id===s.id).sort((a,b)=>a.punched_at.localeCompare(b.punched_at));let start:Event|null=null;for(const v of e){if(v.event_type==='in')start=v;else if(start){const hours=Math.max(0,(Date.parse(v.punched_at)-Date.parse(start.punched_at))/3600000);lines.push([s.name,data?.lots.find(x=>x.id===s.parking_lot_id)?.name||'',displayTime(start.punched_at),displayTime(v.punched_at),hours.toFixed(2),Math.max(0,hours-8).toFixed(2)]);start=null}}}
 const content='\ufeff'+lines.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));a.download='打卡工時_初步統計.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
 }
 return <main style={{padding:24,maxWidth:1150,margin:'auto'}}><h1>主管｜電子打卡管理</h1><p>員工使用 <a href="/time-clock" target="_blank">/time-clock</a> 在授權中控電腦打卡。IP：{data?.ip}</p><p style={{color:'#a44'}}>{message}</p><p style={{fontSize:13}}>此功能的工時為上／下班配對的初步統計，加班以超過 8 小時暫估；尚未套用休息時間、排班、勞基法或公司核准規則，不應作為薪資結算依據。</p>
 <label>場站：</label><select value={lot} onChange={e=>setLot(e.target.value)}><option value="">全部</option>{data?.lots.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
 <h2>新增員工</h2><input placeholder="員工姓名" value={name} onChange={e=>setName(e.target.value)}/><button disabled={!lot||!name.trim()} onClick={()=>act('addStaff',{name,lot})}>新增至所選場站</button><h2>單次啟用碼</h2>{code&&<div style={{padding:12,background:'#fff4dc'}}><strong>僅顯示一次：{code}</strong>（24 小時內使用）</div>}
 <table style={{width:'100%',textAlign:'left'}}><thead><tr><th>員工</th><th>場站</th><th>狀態</th><th>操作</th></tr></thead><tbody>{staff.filter(s=>!lot||s.parking_lot_id===lot).map(s=><tr key={s.id}><td>{s.name}</td><td>{data?.lots.find(x=>x.id===s.parking_lot_id)?.name}</td><td>{s.is_active?'啟用':'停用'}／{s.activated?'PIN已設定':'待設定PIN'}</td><td><button onClick={()=>{if(confirm('重新發碼將重設該員工原PIN，確定嗎？'))void act('activation',{id:s.id})}}>發送／重設啟用碼</button><button onClick={()=>act('toggleStaff',{id:s.id,enabled:!s.is_active})}>{s.is_active?'停用':'啟用'}</button></td></tr>)}</tbody></table>
 <h2>授權這台中控電腦</h2><input placeholder="裝置名稱" value={label} onChange={e=>setLabel(e.target.value)}/><button disabled={!lot||!label.trim()} onClick={()=>act('authorizeDevice',{label,lot})}>綁定目前電腦與 IP</button><p>需在中控電腦上，以主管帳號登入後按授權。固定 IP 變動或清除 Cookie 後需重新授權。</p>
 <h2>授權設備</h2>{data?.devices.filter(d=>!lot||d.parking_lot_id===lot).map(d=><div key={d.id} style={{padding:8,borderBottom:'1px solid #ddd'}}>{d.label}｜{d.ip_address}｜{d.enabled?'啟用':'停用'} <button onClick={()=>act('toggleDevice',{id:d.id,enabled:!d.enabled})}>{d.enabled?'撤銷':'重新啟用'}</button></div>)}
 <h2>打卡紀錄（最近 2,000 筆）</h2><button onClick={csv}>下載配對工時 CSV</button><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>姓名</th><th>打卡</th><th>時間</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{staff.find(s=>s.id===e.staff_id)?.name||e.staff_id}</td><td>{e.event_type==='in'?'上班':'下班'}</td><td>{displayTime(e.punched_at)}</td></tr>)}</tbody></table>
 </main>
}
