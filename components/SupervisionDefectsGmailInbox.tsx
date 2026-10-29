'use client'
import { useFeatureAccess } from '@/components/FeaturePermissions'
import {useCallback,useEffect,useState} from 'react'
import ui from './SupervisionDefects.module.css'
type Row={id:string;file_name:string;subject:string;received_at:string;status:string;line_state:string;line_sent:number}
export type GmailReport={id:string;file:File}
export default function GmailInbox({onAnalyze,disabled=false}:{onAnalyze:(report:GmailReport)=>void;disabled?:boolean}){
  const canManageFeature = useFeatureAccess('defects') === 'manage'

 const [rows,setRows]=useState<Row[]>([]),[total,setTotal]=useState(0),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('')
 const load=useCallback(async()=>{try{const r=await fetch('/api/supervision-defects/gmail/inbox',{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error);setRows(d.items);setTotal(d.total);setError('')}catch(e){setError((e as Error).message)}},[])
 useEffect(()=>{void load();const changed=()=>{void load()},timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},60000);window.addEventListener('sd-gmail-changed',changed);return()=>{clearInterval(timer);window.removeEventListener('sd-gmail-changed',changed)}},[load])
 async function open(row:Row){if(!canManageFeature)return;setBusy(row.id);setMessage('');try{
  const r=await fetch('/api/supervision-defects/gmail/inbox?id='+row.id,{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error)
  const file=await fetch(d.url);if(!file.ok)throw new Error('附件下載失敗，請重新整理後重試')
  onAnalyze({id:row.id,file:new File([await file.blob()],d.file_name,{type:'application/pdf'})})
 }catch(e){setError((e as Error).message)}finally{setBusy('')}}
 async function action(row:Row,name:string){
    if (!canManageFeature) { return }
setBusy(row.id);try{const r=await fetch('/api/supervision-defects/gmail/inbox',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id,action:name})}),d=await r.json();if(!r.ok)throw new Error(d.error);setMessage(name==='reviewed'?'已標記為核對完成，無需列入缺失。':d.state==='sent'?'主管 LINE 已送達。':d.state==='not_configured'?'尚未設定主管 LINE 收件對象。':'LINE 尚未全部送達，可稍後重試。');await load()}catch(e){setError((e as Error).message)}finally{setBusy('')}}
 return <section className={ui.panel} aria-label="Gmail 督導報告收件匣"><div className={ui.row}><h3 className={ui.title} style={{flex:1}}>Gmail 自動收件｜待確認 {total} 份</h3><button className={ui.button} disabled={!!busy||disabled} onClick={()=>void load()}>重新整理收件</button></div><p className={ui.muted}>收件：zxc54875697@gmail.com｜寄件：ntcparking@gmail.com｜主旨含「督導審查通知」。附件收到後在此辨識、核對，再存入草稿。</p>{error&&<p role="alert" className={`${ui.notice} ${ui.error}`}>{error}</p>}{message&&<p role="status" className={ui.notice}>{message}</p>}{!rows.length&&!error&&<p className={ui.muted}>尚無待確認附件。首次使用請依隨附說明啟用 Gmail 定時收件。</p>}{rows.map(row=><article className={ui.card} key={row.id}><strong>{row.file_name}</strong><p className={ui.muted}>{row.subject}<br/>收件：{new Date(row.received_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}｜{row.status==='ready'?'待辨識核對':'附件上傳中，下次排程會接續'}<br/>主管 LINE：{row.line_state==='sent'?`已送出 ${row.line_sent} 則`:row.line_state==='not_configured'?'尚未設定':row.line_state==='pending'?'待通知':'可重試通知'}</p>{row.status==='ready'&&<div className={ui.actions}><button className={`${ui.button} ${ui.primary}`} disabled={!canManageFeature||!!busy||disabled} onClick={()=>void open(row)}>{busy===row.id?'處理中…':'辨識並核對'}</button><button className={ui.button} disabled={!canManageFeature || (!!busy||disabled)} onClick={()=>void action(row,'reviewed')}>已核對無缺失</button>{row.line_state!=='sent'&&<button className={ui.button} disabled={!canManageFeature || (!!busy||disabled)} onClick={()=>void action(row,'retry')}>重試主管 LINE</button>}</div>}</article>)}{total>rows.length&&<p className={ui.muted}>先列出最早的 {rows.length} 份，完成核對後會顯示下一批。</p>}</section>
}
