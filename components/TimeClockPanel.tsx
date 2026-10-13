'use client'
import {useEffect,useState} from 'react'
export default function TimeClockPanel(){
 const [rows,setRows]=useState<{id:string,name:string,activated:boolean}[]>([])
 const [name,setName]=useState(''),[pin,setPin]=useState(''),[code,setCode]=useState(''),[dev,setDev]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false)
 async function load(){try{const r=await fetch('/api/time-clock/kiosk',{cache:'no-store'}),j=await r.json();if(!r.ok)throw Error(j.error);setRows(j.staff||[]);setDev(j.device);setMsg('')}catch(e:any){setMsg(e.message)}}
 useEffect(()=>{void load()},[])
 const sel=rows.find(x=>x.id===name)
 async function send(action:'activate'|'punch',kind?:'in'|'out'){
  setBusy(true);try{const r=await fetch('/api/time-clock/kiosk',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,staffId:name,pin,code,kind})}),j=await r.json();if(!r.ok)throw Error(j.error);setMsg(`${j.message}${j.at?'（'+new Date(j.at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+'）':''}`);setPin('');setCode('');if(action==='activate')await load()}catch(e:any){setMsg(e.message)}finally{setBusy(false)}
 }
 return <main style={{maxWidth:510,margin:'40px auto',padding:24,fontFamily:'sans-serif',border:'1px solid #ddd',borderRadius:16}}><h1>中控電腦上下班打卡</h1><p>設備：{dev||'尚未授權'}｜台灣時間</p><label>選擇姓名</label><select value={name} onChange={e=>{setName(e.target.value);setMsg('')}} style={{display:'block',width:'100%',padding:13,margin:'8px 0 20px'}}><option value="">請選擇</option>{rows.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
 {sel&&<><label>個人 PIN（4～6 位數字）</label><input type="password" inputMode="numeric" autoComplete="off" value={pin} maxLength={6} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} style={{display:'block',width:'100%',boxSizing:'border-box',padding:13,margin:'8px 0 20px'}}/>
 {!sel.activated?<><label>主管提供的單次啟用碼</label><input value={code} autoComplete="off" onChange={e=>setCode(e.target.value.toUpperCase())} style={{display:'block',width:'100%',boxSizing:'border-box',padding:13,margin:'8px 0 20px'}}/><button disabled={busy||!/^\d{4,6}$/.test(pin)||!code} onClick={()=>send('activate')}>首次設定 PIN</button></>:<div style={{display:'flex',gap:14}}><button disabled={busy||!/^\d{4,6}$/.test(pin)} onClick={()=>send('punch','in')} style={{padding:18,flex:1}}>上班打卡</button><button disabled={busy||!/^\d{4,6}$/.test(pin)} onClick={()=>send('punch','out')} style={{padding:18,flex:1}}>下班打卡</button></div>}</>}
 <p role="status" style={{paddingTop:14,whiteSpace:'pre-wrap'}}>{msg}</p><p style={{color:'#666',fontSize:13}}>此頁不顯示工時、加班或其他同仁打卡紀錄。</p></main>
}
