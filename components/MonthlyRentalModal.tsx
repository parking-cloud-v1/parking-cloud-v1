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
  paid_through_date?: string | null
  system_cycle_start_date?: string | null
  system_cycle_end_date?: string | null
}

function todayText() {
  return new Date().toISOString().slice(0, 10)
}

function newRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
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
  const [paymentDate, setPaymentDate] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [notes, setNotes] = useState('')

  const [paymentMonths, setPaymentMonths] = useState(1)
  const [manualPaymentAmount, setManualPaymentAmount] = useState('')
  const [manualRequestId, setManualRequestId] = useState('')

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
    setPaymentDate(todayText())
    setInvoiceNumber('')
    setNotes(rental.notes || '')
    setMessage('')
    setManualRequestId(newRequestId())

    if (mode !== 'payment') return

    setPaymentMonths(1)
    setManualPaymentAmount(
      Number(rental.monthly_fee || 0) > 0
        ? String(Number(rental.monthly_fee || 0))
        : ''
    )
  }, [open, mode, rental])

  if (!open) return null

  async function savePayment() {
    if (!paymentDate) {
      setMessage('請輸入繳費日期')
      return
    }
    if (!Number.isInteger(paymentMonths) || paymentMonths < 1 || paymentMonths > 24) {
      setMessage('本次繳費月數請輸入 1～24 個月')
      return
    }
    const amountPaid = Number(manualPaymentAmount)
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
      setMessage('請輸入正確的本次收款金額')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/monthly-rentals/manual-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rentalId: rental.id,
          paymentDate,
          invoiceNumber: invoiceNumber.trim() || null,
          months: paymentMonths,
          amountPaid: manualPaymentAmount,
          requestId: manualRequestId || newRequestId(),
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(result?.error || '手動收款失敗')
        setLoading(false)
        return
      }

      setMessage(`收款完成，已繳至 ${result?.paidThroughDate || '最新週期'}`)
      setTimeout(() => window.location.reload(), 500)
    } catch (error: any) {
      setMessage('手動收款失敗：' + (error?.message || '網路連線異常'))
      setLoading(false)
    }
  }

  async function saveRenew() {
    setMessage('續租不直接修改日期；請用正式繳費報表或「收款」功能，系統會依已繳至日期往後接。')
  }

  async function saveEdit() {
    if (!customerCode.trim()) {
      setMessage('客戶編號不可空白')
      return
    }
    if (!customerName.trim()) {
      setMessage('姓名不可空白')
      return
    }
    if (!vehiclePlate.trim()) {
      setMessage('車牌不可空白')
      return
    }

    setLoading(true)
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase
      .from('monthly_rentals')
      .update({
        customer_code: customerCode.trim(),
        customer_name: customerName.trim(),
        phone: phone.trim() || null,
        vehicle_plate: vehiclePlate.trim().toUpperCase(),
        vehicle_type: vehicleType,
        rental_type: rentalType.trim() || null,
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

  const title =
    mode === 'payment'
      ? '手動收款'
      : mode === 'renew'
        ? '續租'
        : '編輯月租資料'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', width: '100%', maxWidth: mode === 'edit' ? 760 : 560,
          maxHeight: '90vh', overflowY: 'auto', borderRadius: 16, padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <div style={{ marginTop: 5, color: '#64748b' }}>
              {rental.customer_name} ・ {rental.vehicle_plate}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: 0, background: '#f1f5f9', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        {mode === 'payment' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, color: '#475569', fontSize: 14 }}>
              目前已繳至：<strong>{rental.paid_through_date || '尚未建立'}</strong>。手收也走正式週期，提前繳或晚繳都從目前最早未繳月份往後接，不直接改到期日。
            </div>

            <div className="field">
              <label>本次繳費月數 *</label>
              <input
                type="number"
                min={1}
                max={24}
                step={1}
                value={paymentMonths}
                onChange={(e) => setPaymentMonths(Number(e.target.value))}
              />
            </div>

            <div className="field">
              <label>本次收款金額 *</label>
              <input
                type="number"
                min={1}
                step={1}
                value={manualPaymentAmount}
                onChange={(e) => setManualPaymentAmount(e.target.value)}
                placeholder="請輸入本次實收金額"
              />
              <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                目前月租參考：${Number(rental.monthly_fee || 0).toLocaleString()}；本次實收可自行修改。
              </div>
            </div>

            <div className="field">
              <label>繳費日期 *</label>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>

            <div className="field">
              <label>發票號碼</label>
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())} placeholder="沒有可留空" />
            </div>
          </div>
        )}

        {mode === 'renew' && (
          <div className="card" style={{ background: '#f8fafc' }}>
            <strong>續租請直接使用「收款」</strong>
            <div style={{ marginTop: 8, color: '#64748b' }}>
              可自行輸入本次繳費月數與實收金額，系統仍會從目前已繳至日期往後接續；正式租期到期後需先建立下一期租約。
            </div>
          </div>
        )}

        {mode === 'edit' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div className="field"><label>客戶編號 *</label><input value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} /></div>
            <div className="field"><label>姓名 *</label><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
            <div className="field"><label>電話</label><input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="field"><label>車牌 *</label><input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} /></div>
            <div className="field">
              <label>車種</label>
              <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                <option value="car">汽車</option><option value="motorcycle">機車</option><option value="heavy_motorcycle">重機</option>
              </select>
            </div>
            <div className="field"><label>月租類型</label><input value={rentalType} onChange={(e) => setRentalType(e.target.value)} /></div>
            <div className="field"><label>月租金額</label><div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 8, color: '#475569' }}>${Number(rental.monthly_fee || 0).toLocaleString()}（由月租類型設定統一管理）</div></div>
            <div className="field"><label>正式租期</label><div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 8, color: '#475569' }}>由「租期設定」統一管理。</div></div>
            <div style={{ gridColumn: '1 / -1', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, color: '#475569', fontSize: 14 }}>
              付款狀態不在「編輯」直接修改；手收請使用「收款」，自動報表則使用「匯入繳費報表」。
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>備註</label><textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 }} /></div>
          </div>
        )}

        {message && <div style={{ color: '#b91c1c', marginTop: 16 }}>{message}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button type="button" onClick={onClose} disabled={loading} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>取消</button>
          <button type="button" onClick={submit} disabled={loading} style={{ padding: '9px 18px', borderRadius: 8, border: 0, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>
            {loading ? '儲存中…' : mode === 'payment' ? '確認收款' : mode === 'renew' ? '前往收款' : '儲存修改'}
          </button>
        </div>
      </div>
    </div>
  )
}
