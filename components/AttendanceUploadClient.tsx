'use client'
import { ChangeEvent, useEffect, useState } from 'react'

type Lot={id:string;name:string}
type Row={id:string;parking_lot_id:string;attendance_month:string;file_name:string;file_size:number|null;uploaded_at:string}

function currentMonth(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
function sizeText(n?:number|null){ if(!n) return '-'; return n<1024*1024?`${(n/1024).toFixed(1)} KB`:`${(n/1024/1024).toFixed(1)} MB` }

export default function AttendanceUploadClient({parkingLots,defaultParkingLotId}:{parkingLots:Lot[];defaultParkingLotId?:string}){
 const [lot,setLot]=useState(defaultParkingLotId||parkingLots[0]?.id||'')
 const [month,setMonth]=useState(currentMonth())
 const [file,setFile]=useState<File|null>(null)
 const [rows,setRows]=useState<Row[]>([])
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const lotMap=new Map(parkingLots.map(x=>[x.id,x.name]))
 async function load(){ if(!lot){setRows([]);return}; const r=await fetch(`/api/attendance/list?lot=${encodeURIComponent(lot)}`,{cache:'no-store'}); const j=await r.json(); if(!r.ok){setMessage(j.error||'讀取失敗');return}; setRows(j.rows||[]) }
 useEffect(()=>{void load()},[lot])
 async function upload(){ if(!lot||!month||!file){setMessage('請選擇停車場、月份與檔案。');return}; setBusy(true);setMessage('正在上傳…'); try{ const fd=new FormData();fd.set('parkingLotId',lot);fd.set('attendanceMonth',month);fd.set('file',file); const r=await fetch('/api/attendance/upload',{method:'POST',body:fd}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'上傳失敗'); setMessage('簽到表上傳完成。同一停車場同月份若重新上傳，會自動取代舊檔。');setFile(null); const input=document.getElementById('attendance-file') as HTMLInputElement|null;if(input)input.value='';await load() }catch(e:any){setMessage(e.message||'上傳失敗')}finally{setBusy(false)} }
 return <div style={{paddingBottom:40}}><h1>簽到表上傳</h1><p className="muted">簽到表改由伺服器安全上傳；同一停車場同月份只保留最新版，避免重複佔用容量。</p>
 <div className="card" style={{marginTop:18,maxWidth:760}}><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14}}>
 <div className="field"><label>停車場</label><select value={lot} onChange={e=>setLot(e.target.value)}><option value="">請選擇</option>{parkingLots.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
 <div className="field"><label>簽到月份</label><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div></div>
 <div className="field" style={{marginTop:14}}><label>簽到表檔案</label><input id="attendance-file" type="file" accept=".pdf,.xls,.xlsx,.csv,image/jpeg,image/png,image/webp" onChange={(e:ChangeEvent<HTMLInputElement>)=>setFile(e.target.files?.[0]||null)}/></div>
 {file&&<div className="muted" style={{marginTop:8}}>{file.name} · {sizeText(file.size)}</div>}
 <button type="button" className="btn" onClick={upload} disabled={busy||!file} style={{marginTop:16}}>{busy?'上傳中…':'上傳／取代本月簽到表'}</button>
 {message&&<div style={{marginTop:14,fontWeight:700,whiteSpace:'pre-wrap'}}>{message}</div>}</div>
 <div className="card" style={{marginTop:18}}><h2 style={{marginTop:0}}>最近上傳</h2><div style={{overflowX:'auto'}}><table className="table" style={{minWidth:650}}><thead><tr><th>停車場</th><th>月份</th><th>檔名</th><th>大小</th><th>上傳時間</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{lotMap.get(r.parking_lot_id)||'-'}</td><td>{r.attendance_month?.slice(0,7)}</td><td>{r.file_name}</td><td>{sizeText(r.file_size)}</td><td>{new Date(r.uploaded_at).toLocaleString('zh-TW')}</td></tr>)}{rows.length===0&&<tr><td colSpan={5} style={{textAlign:'center',padding:24}}>目前沒有資料</td></tr>}</tbody></table></div></div></div>
}
