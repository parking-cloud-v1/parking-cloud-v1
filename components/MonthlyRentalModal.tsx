'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'payment' | 'renew' | 'edit'

type Rental = {
  id: string
  parking_lot_id: string
  customer_code: string | null
  customer_name: string
  phone: string | null
  vehicle_plate: string
  vehicle_type: string
  rental_type: string | null
  start_date: string
  end_date: string
  monthly_fee: number
  payment_status: string
  payment_date: string | null
  invoice_number: string | null
  notes: string | null
  last_paid_month?: string | null
}

function monthText(value?: string | null) {
  return value ? String(value).slice(0, 7) : ''
}

function addMonth(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})/)
  if (!match) return value
  const y = Number(match[1])
  const m = Number(match[2])
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }
  return `${next.y}-${String(next.m).padStart(2, '0')}`
}

export default function MonthlyRentalModal({
  open,
  mode,
  rental,
  onClose,
}: {
  open: boolean
  mode: Mode
  rental: Rental
  onClose: () => void
}) {
  const [customerCode, setCustomerCode] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [vehicleType, setVehicleType] = useState('car')
  const [rentalType, setRentalType] = useState('')
  const [endDate, setEndDate] = useState('')
  const [monthlyFee, setMonthlyFee] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [coverageMonth, setCoverageMonth] = useState('')
  const [monthCount, setMonthCount] = useState('1')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    setCustomerCode(rental.customer_code || '')
    setCustomerName(rental.customer_name || '')
    setPhone(rental.phone || '')
    setVehiclePlate(rental.vehicle_plate || '')
    setVehicleType(rental.vehicle_type || 'car')
    setRentalType(rental.rental_type || '')
    setEndDate(rental.end_date || '')
    setMonthlyFee(String(rental.monthly_fee || ''))
    setPaymentDate(new Date().toISOString().slice(0, 10))
    const startMonth = monthText(rental.start_date)
    const endMonth = monthText(rental.end_date)
    const currentMonth = new Date().toISOString().slice(0, 7)
    const legacyFallbackMonth = currentMonth < startMonth
      ? startMonth
      : currentMonth > endMonth
        ? endMonth
        : currentMonth

    setCoverageMonth(
      rental.last_paid_month
        ? addMonth(monthText(rental.last_paid_month))
        : rental.payment_status === 'paid'
          ? legacyFallbackMonth
          : startMonth
    )
    setMonthCount('1')
    setInvoiceNumber('')
    setNotes(rental.notes || '')
    setMessage('')
  }, [open, rental])

  if (!open) return null

  async function savePayment() {
    if (!paymentDate) return setMessage('請選擇收款日期')
    if (!coverageMonth) return setMessage('請選擇本次繳費月份')
    const count = Number(monthCount)
    if (!Number.isInteger(count) || count < 1 || count > 24) return setMessage('繳費月數必須為 1～24')

    setLoading(true)
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase.rpc('record_monthly_rental_payment_month', {
      p_monthly_rental_id: rental.id,
      p_payment_date: paymentDate,
      p_amount: Number(rental.monthly_fee || 0) * count,
      p_invoice_number: invoiceNumber.trim() || null,
      p_source: 'manual',
      p_source_reference: null,
      p_coverage_month: `${coverageMonth}-01`,
      p_month_count: count,
      p_notes: null,
    })

    if (error) {
      setMessage('收款失敗：' + error.message)
      setLoading(false)
      return
    }
    window.location.reload()
  }

  async function saveRenew() {
    if (!endDate) return setMessage('請輸入新的到期日')
    if (endDate <= rental.end_date) return setMessage('新的到期日必須晚於目前到期日')

    setLoading(true)
    setMessage('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('monthly_rentals')
      .update({
        end_date: endDate,
        rental_status: 'active',
        rental_term_locked: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rental.id)

    if (error) {
      setMessage('續租失敗：' + error.message)
      setLoading(false)
      return
    }

    // 若歷史版本有 monthly_renew_logs，盡量留下續租紀錄；沒有表也不阻斷主流程。
    try {
      await supabase.from('monthly_renew_logs').insert({
        monthly_rental_id: rental.id,
        parking_lot_id: rental.parking_lot_id,
        old_start_date: rental.start_date,
        old_end_date: rental.end_date,
        new_start_date: rental.start_date,
        new_end_date: endDate,
        renewed_months: 1,
        amount: 0,
        notes: '月租管理手動續租；繳費月份另行記錄',
        created_by: user?.id || null,
      })
    } catch {
      // 相容較舊資料庫。
    }

    window.location.reload()
  }

  async function saveEdit() {
    if (!customerCode.trim()) return setMessage('客戶編號不可空白')
    if (!customerName.trim()) return setMessage('姓名不可空白')
    if (!vehiclePlate.trim()) return setMessage('車牌不可空白')
    const fee = Number(monthlyFee || 0)
    if (!Number.isFinite(fee) || fee < 0) return setMessage('月租金額格式錯誤')

    setLoading(true)
    setMessage('')
    const supabase = createClient()

    const { data: duplicateCustomer, error: duplicateCustomerError } = await supabase
      .from('monthly_rentals')
      .select('id,customer_name,vehicle_plate')
      .eq('parking_lot_id', rental.parking_lot_id)
      .eq('customer_code', customerCode.trim())
      .neq('id', rental.id)
      .neq('rental_status', 'cancelled')
      .limit(1)
      .maybeSingle()

    if (duplicateCustomerError) {
      setMessage('客戶編號檢查失敗：' + duplicateCustomerError.message)
      setLoading(false)
      return
    }
    if (duplicateCustomer) {
      setMessage(`客戶編號 ${customerCode.trim()} 已被 ${duplicateCustomer.customer_name || '其他月租戶'}／${duplicateCustomer.vehicle_plate || '未填車牌'} 使用。`)
      setLoading(false)
      return
    }

    const { error } = await supabase
      .from('monthly_rentals')
      .update({
        customer_code: customerCode.trim(),
        customer_name: customerName.trim(),
        phone: phone.trim() || null,
        vehicle_plate: vehiclePlate.trim().toUpperCase(),
        vehicle_type: vehicleType,
        rental_type: rentalType.trim() || null,
        monthly_fee: fee,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rental.id)

    if (error) {
      setMessage('修改失敗：' + error.message)
      setLoading(false)
      return
    }
    window.location.reload()
  }

  async function submit() {
    if (mode === 'payment') return savePayment()
    if (mode === 'renew') return saveRenew()
    return saveEdit()
  }

  const title = mode === 'payment' ? '月租收款' : mode === 'renew' ? '正式續租' : '編輯月租基本資料'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: mode === 'edit' ? 760 : 560, maxHeight: '90vh', overflowY: 'auto', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div><h2 style={{ margin: 0 }}>{title}</h2><div style={{ marginTop: 5, color: '#64748b' }}>{rental.customer_name} ・ {rental.vehicle_plate}</div></div>
          <button type="button" onClick={onClose} style={{ border: 0, background: '#f1f5f9', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        {mode === 'payment' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 10, padding: 12 }}>
              本次只記錄「繳費月份」，不會修改正式租期。正式租期仍為 {rental.start_date} ～ {rental.end_date}。
            </div>
            <div className="field"><label>本次起始繳費月份 *</label><input type="month" value={coverageMonth} onChange={(e) => setCoverageMonth(e.target.value)} /></div>
            <div className="field"><label>連續繳費月數 *</label><input type="number" min="1" max="24" value={monthCount} onChange={(e) => setMonthCount(e.target.value)} /></div>
            <div className="field"><label>本次應收總額</label><input value={`$${(Number(rental.monthly_fee || 0) * Number(monthCount || 1)).toLocaleString()}`} disabled /></div>
            <div className="field"><label>收款日期 *</label><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
            <div className="field"><label>發票號碼</label><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())} placeholder="沒有可留空" /></div>
          </div>
        )}

        {mode === 'renew' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10 }}>
              <div>目前正式租期：<strong>{rental.start_date} ～ {rental.end_date}</strong></div>
              <div style={{ marginTop: 6, color: '#64748b' }}>續租只延長正式到期日；舊的已繳月份不會被清除。新的月份要等實際收款時再記錄。</div>
            </div>
            <div className="field"><label>新的到期日 *</label><input type="date" value={endDate} min={rental.end_date} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
        )}

        {mode === 'edit' && (
          <div>
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, color: '#475569', marginBottom: 16 }}>
              此處只修改基本資料。租期請用「續租」或主管「調整租期」；繳費請用「收款」，避免日期互相覆蓋。
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
              <div className="field"><label>客戶編號 *</label><input value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} /></div>
              <div className="field"><label>姓名 *</label><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
              <div className="field"><label>電話</label><input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div className="field"><label>車牌 *</label><input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} /></div>
              <div className="field"><label>車種</label><select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}><option value="car">汽車</option><option value="motorcycle">機車</option><option value="heavy_motorcycle">重機</option></select></div>
              <div className="field"><label>月租類型</label><input value={rentalType} onChange={(e) => setRentalType(e.target.value)} /></div>
              <div className="field"><label>月租金額</label><input type="number" min="0" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>備註</label><textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
          </div>
        )}

        {message && <div style={{ color: '#b91c1c', marginTop: 16 }}>{message}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button type="button" onClick={onClose} disabled={loading}>取消</button>
          <button type="button" className="btn" onClick={submit} disabled={loading}>{loading ? '儲存中…' : mode === 'payment' ? '確認收款' : mode === 'renew' ? '確認續租' : '儲存修改'}</button>
        </div>
      </div>
    </div>
  )
}
