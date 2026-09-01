'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type ParkingLotOption = { id: string; name: string }
type DetailRow = {
  detail_start_date: string
  detail_end_date: string
  temporary_cash: number
  monthly_cash: number
}
type InitialReport = {
  id: string
  parking_lot_id: string
  closing_date: string
  shift_start_at: string
  shift_end_at: string
  closing_status: 'normal' | 'abnormal'
  invoice_start_no: string | null
  invoice_end_no: string | null
  amount_due: number
  amount_paid: number
  aps_monthly_count: number
  aps_monthly_amount: number
  electronic_payment_total: number
  mobile_payment_total: number
  refund_note: string | null
  refund_amount: number
  temporary_cash: number
  monthly_cash: number
  operator_name: string | null
  notes: string | null
}

const num = (v:any) => Number.isFinite(Number(v)) ? Number(v) : 0

function localDateTime(v?: string | null) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const p=(n:number)=>String(n).padStart(2,'0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function ShiftClosingForm({
  parkingLots,
  initialReport,
  initialDetails=[],
}:{
  parkingLots: ParkingLotOption[]
  initialReport?: InitialReport | null
  initialDetails?: DetailRow[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const today = new Date().toISOString().slice(0,10)

  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const [parkingLotId,setParkingLotId]=useState(initialReport?.parking_lot_id || '')
  const [closingDate,setClosingDate]=useState(initialReport?.closing_date || today)
  const [shiftStartAt,setShiftStartAt]=useState(localDateTime(initialReport?.shift_start_at))
  const [shiftEndAt,setShiftEndAt]=useState(localDateTime(initialReport?.shift_end_at))
  const [closingStatus,setClosingStatus]=useState<'normal'|'abnormal'>(initialReport?.closing_status || 'normal')
  const [invoiceStartNo,setInvoiceStartNo]=useState(initialReport?.invoice_start_no || '')
  const [invoiceEndNo,setInvoiceEndNo]=useState(initialReport?.invoice_end_no || '')
  const [amountDue,setAmountDue]=useState(num(initialReport?.amount_due))
  const [amountPaid,setAmountPaid]=useState(num(initialReport?.amount_paid))
  const [apsMonthlyCount,setApsMonthlyCount]=useState(num(initialReport?.aps_monthly_count))
  const [apsMonthlyAmount,setApsMonthlyAmount]=useState(num(initialReport?.aps_monthly_amount))
  const [electronicPaymentTotal,setElectronicPaymentTotal]=useState(num(initialReport?.electronic_payment_total))
  const [mobilePaymentTotal,setMobilePaymentTotal]=useState(num(initialReport?.mobile_payment_total))
  const [refundNote,setRefundNote]=useState(initialReport?.refund_note || '')
  const [refundAmount,setRefundAmount]=useState(num(initialReport?.refund_amount))
  const [temporaryCash,setTemporaryCash]=useState(num(initialReport?.temporary_cash))
  const [monthlyCash,setMonthlyCash]=useState(num(initialReport?.monthly_cash))
  const [operatorName,setOperatorName]=useState(initialReport?.operator_name || '')
  const [notes,setNotes]=useState(initialReport?.notes || '')
  const [details,setDetails]=useState<DetailRow[]>(
    initialDetails.length ? initialDetails : [{
      detail_start_date: initialReport?.closing_date || today,
      detail_end_date: initialReport?.closing_date || today,
      temporary_cash: 0,
      monthly_cash: 0,
    }]
  )

  const cashActual = useMemo(
    ()=>num(amountPaid)-num(electronicPaymentTotal)-num(mobilePaymentTotal),
    [amountPaid,electronicPaymentTotal,mobilePaymentTotal]
  )
  const dailyCashTotal = useMemo(()=>num(temporaryCash)+num(monthlyCash),[temporaryCash,monthlyCash])
  const remittanceTotal = useMemo(
    ()=>details.reduce((sum,r)=>sum+num(r.temporary_cash)+num(r.monthly_cash),0),
    [details]
  )

  const updateDetail=(i:number,patch:Partial<DetailRow>)=>{
    setDetails(rows=>rows.map((r,idx)=>idx===i?{...r,...patch}:r))
  }

  async function save() {
    setMessage('')
    if (!parkingLotId) return setMessage('請選擇停車場。')
    if (!closingDate || !shiftStartAt || !shiftEndAt) return setMessage('請完成結班日期與開／結班時間。')
    if (new Date(shiftEndAt).getTime() < new Date(shiftStartAt).getTime()) return setMessage('結班時間不可早於開班時間。')
    if (details.some(r=>!r.detail_start_date || !r.detail_end_date || r.detail_end_date < r.detail_start_date)) {
      return setMessage('請確認當日結班開始日／當日結班結束日。')
    }

    setSaving(true)
    try {
      const {data:{user}}=await supabase.auth.getUser()
      if (!user) throw new Error('登入狀態已失效')

      const payload = {
        parking_lot_id: parkingLotId,
        closing_date: closingDate,
        shift_start_at: new Date(shiftStartAt).toISOString(),
        shift_end_at: new Date(shiftEndAt).toISOString(),
        closing_status: closingStatus,
        invoice_start_no: invoiceStartNo || null,
        invoice_end_no: invoiceEndNo || null,
        amount_due: num(amountDue),
        amount_paid: num(amountPaid),
        aps_monthly_count: num(apsMonthlyCount),
        aps_monthly_amount: num(apsMonthlyAmount),
        electronic_payment_total: num(electronicPaymentTotal),
        mobile_payment_total: num(mobilePaymentTotal),
        cash_actual: num(cashActual),
        refund_note: refundNote || null,
        refund_amount: num(refundAmount),
        temporary_cash: num(temporaryCash),
        monthly_cash: num(monthlyCash),
        daily_cash_total: num(dailyCashTotal),
        remittance_total: num(remittanceTotal),
        operator_name: operatorName || null,
        notes: notes || null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }

      let reportId = initialReport?.id || ''
      if (initialReport?.id) {
        const {error}=await supabase.from('shift_closing_reports').update(payload).eq('id',initialReport.id)
        if (error) throw error
        const {error:deleteError}=await supabase.from('shift_closing_details').delete().eq('report_id',initialReport.id)
        if (deleteError) throw deleteError
      } else {
        const {data,error}=await supabase.from('shift_closing_reports')
          .insert({...payload,created_by:user.id}).select('id').single()
        if (error) throw error
        reportId=data.id
      }

      const {error:detailError}=await supabase.from('shift_closing_details').insert(
        details.map((r,i)=>({
          report_id: reportId,
          detail_start_date:r.detail_start_date,
          detail_end_date:r.detail_end_date,
          temporary_cash:num(r.temporary_cash),
          monthly_cash:num(r.monthly_cash),
          daily_cash_total:num(r.temporary_cash)+num(r.monthly_cash),
          sort_order:i,
        }))
      )
      if (detailError) throw detailError

      router.push('/dashboard/shift-closing')
      router.refresh()
    } catch(e:any) {
      setMessage(`儲存失敗：${e?.message || '未知錯誤'}`)
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle={display:'grid',gridTemplateColumns:'repeat(3,minmax(180px,1fr))',gap:14}

  return <div style={{maxWidth:1180}}>
    <div className="card">
      <h2 style={{marginTop:0}}>基本資料</h2>
      <div style={fieldStyle}>
        <div className="field"><label>停車場</label><select value={parkingLotId} onChange={e=>setParkingLotId(e.target.value)}><option value="">請選擇停車場</option>{parkingLots.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="field"><label>結班日期</label><input type="date" value={closingDate} onChange={e=>setClosingDate(e.target.value)}/></div>
        <div className="field"><label>結班狀態</label><select value={closingStatus} onChange={e=>setClosingStatus(e.target.value as any)}><option value="normal">正常</option><option value="abnormal">異常</option></select></div>
        <div className="field"><label>開班日期／時間</label><input type="datetime-local" value={shiftStartAt} onChange={e=>setShiftStartAt(e.target.value)}/></div>
        <div className="field"><label>結班日期／時間</label><input type="datetime-local" value={shiftEndAt} onChange={e=>setShiftEndAt(e.target.value)}/></div>
        <div className="field"><label>值班人員</label><input value={operatorName} onChange={e=>setOperatorName(e.target.value)}/></div>
      </div>
    </div>

    <div className="card" style={{marginTop:18}}>
      <h2 style={{marginTop:0}}>結班金額資料</h2>
      <div style={fieldStyle}>
        <div className="field"><label>繳費機發票起號</label><input value={invoiceStartNo} onChange={e=>setInvoiceStartNo(e.target.value)}/></div>
        <div className="field"><label>繳費機發票訖號</label><input value={invoiceEndNo} onChange={e=>setInvoiceEndNo(e.target.value)}/></div>
        <div className="field"><label>應收總計</label><input type="number" value={amountDue} onChange={e=>setAmountDue(num(e.target.value))}/></div>
        <div className="field"><label>實收總計</label><input type="number" value={amountPaid} onChange={e=>setAmountPaid(num(e.target.value))}/></div>
        <div className="field"><label>APS 月租總筆數</label><input type="number" value={apsMonthlyCount} onChange={e=>setApsMonthlyCount(num(e.target.value))}/></div>
        <div className="field"><label>APS 本日月租金額</label><input type="number" value={apsMonthlyAmount} onChange={e=>setApsMonthlyAmount(num(e.target.value))}/></div>
        <div className="field"><label>電子支付本日總額</label><input type="number" value={electronicPaymentTotal} onChange={e=>setElectronicPaymentTotal(num(e.target.value))}/></div>
        <div className="field"><label>手機支付本日總額</label><input type="number" value={mobilePaymentTotal} onChange={e=>setMobilePaymentTotal(num(e.target.value))}/></div>
        <div className="field"><label>扣除電子支付＋手機支付後的現金實收</label><input type="number" value={cashActual} readOnly/></div>
        <div className="field"><label>退款金額</label><input type="number" value={refundAmount} onChange={e=>setRefundAmount(num(e.target.value))}/></div>
        <div className="field" style={{gridColumn:'span 2'}}><label>退款說明</label><input value={refundNote} onChange={e=>setRefundNote(e.target.value)}/></div>
        <div className="field"><label>本班臨停現金實收</label><input type="number" value={temporaryCash} onChange={e=>setTemporaryCash(num(e.target.value))}/></div>
        <div className="field"><label>月租現金</label><input type="number" value={monthlyCash} onChange={e=>setMonthlyCash(num(e.target.value))}/></div>
        <div className="field"><label>當日現金總計</label><input type="number" value={dailyCashTotal} readOnly/></div>
      </div>
    </div>

    <div className="card" style={{marginTop:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2 style={{margin:0}}>當日結班明細</h2>
        <button type="button" className="btn" onClick={()=>setDetails(r=>[...r,{detail_start_date:closingDate,detail_end_date:closingDate,temporary_cash:0,monthly_cash:0}])}>＋新增明細</button>
      </div>
      <div style={{overflowX:'auto',marginTop:14}}>
        <table style={{width:'100%',minWidth:820,borderCollapse:'collapse'}}>
          <thead><tr><th>當日結班開始日</th><th>當日結班結束日</th><th>臨停現金</th><th>月租現金</th><th>當日現金總計</th><th>操作</th></tr></thead>
          <tbody>{details.map((r,i)=><tr key={i} style={{borderTop:'1px solid #e5e7eb'}}>
            <td style={{padding:8}}><input type="date" value={r.detail_start_date} onChange={e=>updateDetail(i,{detail_start_date:e.target.value})}/></td>
            <td style={{padding:8}}><input type="date" value={r.detail_end_date} onChange={e=>updateDetail(i,{detail_end_date:e.target.value})}/></td>
            <td style={{padding:8}}><input type="number" value={r.temporary_cash} onChange={e=>updateDetail(i,{temporary_cash:num(e.target.value)})}/></td>
            <td style={{padding:8}}><input type="number" value={r.monthly_cash} onChange={e=>updateDetail(i,{monthly_cash:num(e.target.value)})}/></td>
            <td style={{padding:8,fontWeight:700}}>${(num(r.temporary_cash)+num(r.monthly_cash)).toLocaleString()}</td>
            <td style={{padding:8}}><button type="button" disabled={details.length<=1} onClick={()=>setDetails(rows=>rows.length<=1?rows:rows.filter((_,idx)=>idx!==i))}>刪除</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div style={{textAlign:'right',marginTop:16,fontSize:18,fontWeight:800}}>匯款總金額：${remittanceTotal.toLocaleString()}</div>
    </div>

    <div className="card" style={{marginTop:18}}>
      <div className="field"><label>備註／異常說明</label><textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)}/></div>
    </div>

    {message && <div className="card" style={{marginTop:18,color:'#dc2626'}}>{message}</div>}
    <div style={{display:'flex',gap:10,marginTop:18}}>
      <button type="button" className="btn" disabled={saving} onClick={save}>{saving?'儲存中…':'儲存結班報表'}</button>
      <button type="button" disabled={saving} onClick={()=>router.push('/dashboard/shift-closing')}>返回</button>
    </div>
  </div>
}
