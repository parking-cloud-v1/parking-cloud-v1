import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ShiftClosingPage({
  searchParams,
}:{
  searchParams?: Promise<{lot?:string;date?:string}>
}) {
  const supabase=await createClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user) redirect('/login')

  const {data:profile}=await supabase.from('profiles')
    .select('id, role, is_active').eq('id',user.id).maybeSingle()
  if(!profile || !profile.is_active) redirect('/login')

  const params=searchParams?await searchParams:{}
  const lot=params.lot || ''
  const date=params.date || ''

  const {data:parkingLots}=await supabase.from('parking_lots')
    .select('id, name').eq('status','active').order('name')

  let query=supabase.from('shift_closing_reports').select(`
    id, parking_lot_id, closing_date, shift_start_at, shift_end_at,
    closing_status, amount_due, amount_paid, cash_actual,
    daily_cash_total, remittance_total, operator_name,
    parking_lots (id, name)
  `).order('closing_date',{ascending:false}).order('shift_end_at',{ascending:false})

  if(lot) query=query.eq('parking_lot_id',lot)
  if(date) query=query.eq('closing_date',date)

  const {data:reports,error}=await query

  return <div>
    <div style={{display:'flex',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
      <div>
        <h1 style={{marginBottom:6}}>當日結班報表</h1>
        <p className="muted" style={{marginTop:0}}>紀錄各停車場每日結班資料與當日結班明細。</p>
      </div>
      <Link href="/dashboard/shift-closing/new" className="btn" style={{textDecoration:'none'}}>＋新增當日結班</Link>
    </div>

    <div className="card" style={{marginTop:20}}>
      <form method="GET" style={{display:'grid',gridTemplateColumns:'minmax(220px,1fr) minmax(160px,.7fr) auto',gap:12,alignItems:'end'}}>
        <div className="field"><label>停車場</label><select name="lot" defaultValue={lot}><option value="">全部停車場</option>{(parkingLots||[]).map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="field"><label>結班日期</label><input type="date" name="date" defaultValue={date}/></div>
        <div style={{display:'flex',gap:8}}><button className="btn" type="submit">查詢</button><Link href="/dashboard/shift-closing" style={{padding:'9px 14px',border:'1px solid #cbd5e1',borderRadius:8,textDecoration:'none',color:'#475569'}}>清除</Link></div>
      </form>
    </div>

    {error && <div className="card" style={{marginTop:20,color:'#dc2626'}}>結班報表讀取失敗：{error.message}</div>}

    <div className="card" style={{marginTop:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2 style={{margin:0}}>結班紀錄</h2><span className="muted">共 {(reports||[]).length} 筆</span></div>
      {!error && (!reports || reports.length===0) && <div style={{padding:30,textAlign:'center',color:'#64748b'}}>目前沒有符合條件的結班紀錄。</div>}
      {!error && reports && reports.length>0 && <div style={{overflowX:'auto',marginTop:16}}>
        <table style={{width:'100%',minWidth:1100,borderCollapse:'collapse'}}>
          <thead><tr><th>停車場</th><th>結班日期</th><th>開班時間</th><th>結班時間</th><th>狀態</th><th>應收</th><th>實收</th><th>現金實收</th><th>當日現金總計</th><th>匯款總金額</th><th>值班人員</th><th>操作</th></tr></thead>
          <tbody>{reports.map((item:any)=>{
            const lotInfo=Array.isArray(item.parking_lots)?item.parking_lots[0]||null:item.parking_lots||null
            return <tr key={item.id} style={{borderTop:'1px solid #e5e7eb'}}>
              <td style={{padding:8}}>{lotInfo?.name||'-'}</td>
              <td style={{padding:8}}>{item.closing_date||'-'}</td>
              <td style={{padding:8,whiteSpace:'nowrap'}}>{item.shift_start_at?new Date(item.shift_start_at).toLocaleString('zh-TW'):'-'}</td>
              <td style={{padding:8,whiteSpace:'nowrap'}}>{item.shift_end_at?new Date(item.shift_end_at).toLocaleString('zh-TW'):'-'}</td>
              <td style={{padding:8,fontWeight:700,color:item.closing_status==='abnormal'?'#dc2626':'#15803d'}}>{item.closing_status==='abnormal'?'異常':'正常'}</td>
              <td style={{padding:8}}>${Number(item.amount_due||0).toLocaleString()}</td>
              <td style={{padding:8}}>${Number(item.amount_paid||0).toLocaleString()}</td>
              <td style={{padding:8}}>${Number(item.cash_actual||0).toLocaleString()}</td>
              <td style={{padding:8}}>${Number(item.daily_cash_total||0).toLocaleString()}</td>
              <td style={{padding:8,fontWeight:700}}>${Number(item.remittance_total||0).toLocaleString()}</td>
              <td style={{padding:8}}>{item.operator_name||'-'}</td>
              <td style={{padding:8}}><Link href={`/dashboard/shift-closing/${item.id}/edit`} style={{textDecoration:'none',fontWeight:700}}>編輯</Link></td>
            </tr>
          })}</tbody>
        </table>
      </div>}
    </div>
  </div>
}
