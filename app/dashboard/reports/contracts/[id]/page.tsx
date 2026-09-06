import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function relationName(value:any){ return Array.isArray(value)?value[0]?.name||'-':value?.name||'-' }
function fmt(value:string){ return new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}) }

export default async function ReportContractViewPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login')
  const {data:profile}=await supabase.from('profiles').select('role,is_active').eq('id',user.id).maybeSingle(); if(!profile?.is_active) redirect('/login'); if(!['supervisor','accountant'].includes(profile.role)) redirect('/dashboard')
  const {data:row,error}=await supabase.from('signed_contract_archives').select('contract_id,contract_no,customer_code,customer_name,vehicle_plate,contract_version,contract_snapshot,document_hash,signature_snapshot,signed_at,archive_hash,archived_at,pdf_path,parking_lots(name)').eq('contract_id',id).maybeSingle()
  if(error||!row) notFound()
  const sig=(row.signature_snapshot||{}) as Record<string,any>
  return <div style={{maxWidth:960,paddingBottom:40}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:14,flexWrap:'wrap',alignItems:'flex-start'}}><div><div style={{fontSize:13,color:'#2563eb',fontWeight:900}}>報表中心｜唯讀</div><h1 style={{margin:'5px 0 5px'}}>線上合約書</h1><div className="muted">契約編號：{row.contract_no}</div></div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><Link className="btn" href={`/dashboard/online/contracts/${row.contract_id}/print`} target="_blank" style={{textDecoration:'none'}}>列印</Link>{row.pdf_path?<a className="btn" href={`/api/admin/online-contracts/archive/${row.contract_id}`} style={{textDecoration:'none'}}>下載正式留存檔（PDF）</a>:<span style={{padding:'9px 13px',color:'#94a3b8'}}>正式 PDF 建立中</span>}<Link href="/dashboard/reports" style={{padding:'9px 13px',border:'1px solid #cbd5e1',borderRadius:8,textDecoration:'none'}}>返回報表中心</Link></div></div>
    <div className="card" style={{marginTop:20,padding:20}}><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:14}}><div><span className="muted">停車場</span><br/><strong>{relationName(row.parking_lots)}</strong></div><div><span className="muted">客戶編號</span><br/><strong>{row.customer_code||'-'}</strong></div><div><span className="muted">承租人</span><br/><strong>{row.customer_name}</strong></div><div><span className="muted">車牌</span><br/><strong>{row.vehicle_plate}</strong></div><div><span className="muted">契約版本</span><br/><strong>{row.contract_version||'-'}</strong></div><div><span className="muted">簽署時間</span><br/><strong>{fmt(row.signed_at)}</strong></div></div></div>
    <div className="card" style={{marginTop:18,padding:22}}><h2 style={{marginTop:0}}>契約內容</h2><div style={{whiteSpace:'pre-wrap',lineHeight:1.9,fontSize:15}}>{row.contract_snapshot}</div></div>
    <div className="card" style={{marginTop:18,padding:20}}>
      <h2 style={{marginTop:0}}>電子簽署憑證</h2>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>
        <div>簽署人：<strong>{sig.signer_name||row.customer_name}</strong></div>
        <div>驗證方式：<strong>{sig.verification_method==='contract_sign_phone_otp_handwritten'?'手機 OTP＋手寫簽名':(sig.verification_method||'手機 OTP')}</strong></div>
        <div>OTP 驗證：<strong>{sig.otp_verified?'已完成':'-'}</strong></div>
        <div>手寫簽名：<strong>{sig.handwritten_signature_at?'已完成':'-'}</strong></div>
        <div>電子簽章方式明確同意：<strong>{sig.electronic_signature_consent_at?'已確認':'-'}</strong></div>
        <div>封存時間：<strong>{fmt(row.archived_at)}</strong></div>
      </div>
      {sig.handwritten_signature_at&&<div style={{marginTop:16,padding:14,border:'1px solid #cbd5e1',borderRadius:8,background:'#fff',maxWidth:620}}><div style={{fontWeight:800,marginBottom:8}}>承租人手寫簽名</div><img src={`/api/admin/online-contracts/signature/${row.contract_id}`} alt="承租人手寫簽名" style={{display:'block',width:'100%',maxWidth:520,height:150,objectFit:'contain',objectPosition:'left center',background:'#fff'}}/><div style={{marginTop:7,fontSize:10,color:'#64748b',wordBreak:'break-all'}}>簽名 SHA-256：{sig.handwritten_signature_hash||'-'}</div></div>}
      <div style={{marginTop:16,padding:12,borderRadius:8,background:'#f8fafc',wordBreak:'break-all',fontSize:12}}><strong>契約文件 SHA-256</strong><br/>{row.document_hash}<br/><br/><strong>正式封存 SHA-256</strong><br/>{row.archive_hash}</div>
    </div>
  </div>
}
