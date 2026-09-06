'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Term = {
  id: string
  term_name: string
  start_date: string
  end_date: string
  is_active: boolean
}

export default function SupervisorLegacyRentalForm({
  lotId,
  lotName,
  terms,
}: {
  lotId: string
  lotName: string
  terms: Term[]
}) {
  const active = useMemo(() => terms.find((t) => t.is_active) || null, [terms])
  const [termId, setTermId] = useState(active?.id || '')
  const selected = terms.find((t) => t.id === termId) || null

  const [customerCode, setCustomerCode] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [vehicleType, setVehicleType] = useState('car')
  const [rentalType, setRentalType] = useState('')
  const [monthlyFee, setMonthlyFee] = useState('')
  const [customStartDate, setCustomStartDate] = useState(active?.start_date || '')
  const [customEndDate, setCustomEndDate] = useState(active?.end_date || '')
  const [paidThroughMonth, setPaidThroughMonth] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const startDate = selected?.start_date || customStartDate
  const endDate = selected?.end_date || customEndDate

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!customerName.trim()) return setMessage('姓名不可空白')
    if (!vehiclePlate.trim()) return setMessage('車牌不可空白')
    if (!startDate || !endDate) return setMessage('請輸入租期')
    if (endDate < startDate) return setMessage('租期結束日不可早於開始日')
    if (paidThroughMonth && !paymentDate) return setMessage('有填已繳至月份時，請填最後收款日期')

    setSaving(true)
    setMessage('')
    const supabase = createClient()

    const { data, error } = await supabase.rpc('supervisor_create_legacy_monthly_rental', {
      p_parking_lot_id: lotId,
      p_customer_code: customerCode.trim() || null,
      p_customer_name: customerName.trim(),
      p_phone: phone.trim() || null,
      p_vehicle_plate: vehiclePlate.trim().toUpperCase(),
      p_vehicle_type: vehicleType,
      p_rental_type: rentalType.trim() || null,
      p_monthly_fee: Number(monthlyFee || 0),
      p_start_date: startDate,
      p_end_date: endDate,
      p_rental_term_id: selected?.id || null,
      p_paid_through_month: paidThroughMonth ? `${paidThroughMonth}-01` : null,
      p_payment_date: paymentDate || null,
      p_invoice_number: invoiceNumber.trim() || null,
      p_notes: notes.trim() || null,
    })

    if (error) {
      setMessage('新增舊資料失敗：' + error.message)
      setSaving(false)
      return
    }

    setMessage(`舊月租資料已建立。資料編號：${data}`)
    setTimeout(() => { window.location.href = '/dashboard/monthly-rentals' }, 800)
  }

  return (
    <form onSubmit={submit}>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="muted">目前工作停車場</div>
        <h2 style={{ margin: '4px 0 0' }}>{lotName}</h2>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>舊月租基本資料</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
          <div className="field"><label>客戶編號</label><input value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} /></div>
          <div className="field"><label>姓名 *</label><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
          <div className="field"><label>電話</label><input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="field"><label>車牌 *</label><input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} /></div>
          <div className="field">
            <label>車種</label>
            <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              <option value="car">汽車</option><option value="motorcycle">機車</option><option value="heavy_motorcycle">重機</option>
            </select>
          </div>
          <div className="field"><label>月租類型</label><input value={rentalType} onChange={(e) => setRentalType(e.target.value)} placeholder="一般、里民、身障…" /></div>
          <div className="field"><label>月租金額</label><input type="number" min="0" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} /></div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>正式租期</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
          <div className="field">
            <label>套用場站期別</label>
            <select value={termId} onChange={(e) => setTermId(e.target.value)}>
              <option value="">自訂舊租期</option>
              {terms.map((term) => <option key={term.id} value={term.id}>{term.term_name}｜{term.start_date}～{term.end_date}{term.is_active ? '（目前）' : ''}</option>)}
            </select>
          </div>
          <div className="field"><label>租期開始 *</label><input type="date" value={startDate} disabled={!!selected} onChange={(e) => setCustomStartDate(e.target.value)} /></div>
          <div className="field"><label>租期結束 *</label><input type="date" value={endDate} disabled={!!selected} onChange={(e) => setCustomEndDate(e.target.value)} /></div>
        </div>
        <div style={{ marginTop: 10, color: '#64748b', fontSize: 13 }}>租期只代表使用資格期間，不代表已繳到哪一個月。</div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>舊繳費狀態（可留空）</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
          <div className="field"><label>已繳至月份</label><input type="month" value={paidThroughMonth} onChange={(e) => setPaidThroughMonth(e.target.value)} /></div>
          <div className="field"><label>最後收款日期</label><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
          <div className="field"><label>發票號碼</label><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())} /></div>
        </div>
      </div>

      <div className="field" style={{ marginTop: 18 }}><label>備註</label><textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      {message && <div className="card" style={{ marginTop: 16, whiteSpace: 'pre-line' }}>{message}</div>}
      <button className="btn" type="submit" disabled={saving} style={{ marginTop: 18 }}>{saving ? '建立中…' : '確認新增舊資料'}</button>
    </form>
  )
}
