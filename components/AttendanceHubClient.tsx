'use client'
import {useState} from 'react'
import Link from 'next/link'
import AttendanceUploadClient from '@/components/AttendanceUploadClient'
import TimeClockPanel from '@/components/TimeClockPanel'

type Lot={id:string;name:string}
export default function AttendanceHubClient({parkingLots,defaultParkingLotId,role}:{parkingLots:Lot[];defaultParkingLotId:string;role:'supervisor'|'manager'}){
 const [tab,setTab]=useState<'upload'|'clock'>('upload')
 const style={padding:'12px 18px',borderRadius:10,border:'1px solid #cbd5e1',cursor:'pointer',fontSize:16,fontWeight:600} as const
 return <div>
  <div style={{padding:'18px 16px',borderRadius:14,border:'1px solid #d9e2ec',background:'#f8fafc',marginBottom:20}}>
   <h2 style={{margin:'0 0 12px',fontSize:22}}>簽到表上傳／電子打卡</h2>
   <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
    <button type="button" aria-pressed={tab==='upload'} onClick={()=>setTab('upload')} style={{...style,background:tab==='upload'?'#0f3e65':'white',color:tab==='upload'?'white':'#17283f'}}>簽到表上傳</button>
    <button type="button" aria-pressed={tab==='clock'} onClick={()=>setTab('clock')} style={{...style,background:tab==='clock'?'#0f3e65':'white',color:tab==='clock'?'white':'#17283f'}}>上下班打卡</button>
    {role==='supervisor'&&<Link href="/dashboard/time-clock" style={{...style,background:'#fff',color:'#17283f',textDecoration:'none'}}>主管：排休／工時／異常</Link>}
   </div>
   <p style={{margin:'12px 0 0',color:'#475569',fontSize:14}}>原有簽到表照片上傳功能保持不變。電子打卡需使用已授權的中控電腦。</p>
  </div>
  <div hidden={tab!=='upload'}><AttendanceUploadClient parkingLots={parkingLots} defaultParkingLotId={defaultParkingLotId} role={role}/></div>
  {tab==='clock'&&<TimeClockPanel/>}
 </div>
}
