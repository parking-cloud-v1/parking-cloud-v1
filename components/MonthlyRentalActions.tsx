'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import MonthlyRentalModal from '@/components/MonthlyRentalModal'

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
  rental_status: string
  payment_date: string | null
  invoice_number: string | null
  notes: string | null
  last_paid_month?: string | null
  rental_term_id?: string | null
  paid_through_date?: string | null
  system_cycle_start_date?: string | null
  system_cycle_end_date?: string | null
}

type ModalMode = 'payment' | 'renew' | 'edit' | 'correct-paid-through' | null

export default function MonthlyRentalActions({
  rental,
  canCorrectPaidThrough = false,
}: {
  rental: Rental
  canManageTerm?: boolean
  canCorrectPaidThrough?: boolean
}) {
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [correctDate, setCorrectDate] = useState(rental.paid_through_date || '')
  const [correcting, setCorrecting] = useState(false)


  async function correctPaidThroughDate() {
    if (!correctDate) {
      setMessage('請選擇要校正的已繳至日期。')
      return
    }

    setCorrecting(true)
    setMessage('')

    try {
      const response = await fetch('/api/monthly-rentals/correct-paid-through', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rentalId: rental.id,
          paidThroughDate: correctDate,
        }),
      })

      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.ok) {
        setMessage(result?.error || '校正已繳至日期失敗。')
        return
      }

      window.location.reload()
    } catch {
      setMessage('校正已繳至日期失敗，請稍後再試。')
    } finally {
      setCorrecting(false)
    }
  }

  async function cancelRental() {
    const confirmed = window.confirm(`確定要將「${rental.customer_name}」設定為退租嗎？`)
    if (!confirmed) return

    setLoading(true)
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase
      .from('monthly_rentals')
      .update({ rental_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', rental.id)

    if (error) {
      setMessage('退租失敗：' + error.message)
      setLoading(false)
      return
    }
    window.location.reload()
  }

  if (rental.rental_status === 'cancelled') return <span style={{ color: '#64748b' }}>已退租</span>

  return (
    <>
      <div>
        <div className="monthly-rental-actions" style={{
            display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* 手收付款走正式付款週期；不直接手動改到期日。 */}
          <button type="button" onClick={() => setModalMode('payment')} disabled={loading} style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>
            收款
          </button>
          <button type="button" onClick={() => setModalMode('edit')} disabled={loading} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
            編輯
          </button>
          {canCorrectPaidThrough && (
            <button
              type="button"
              onClick={() => {
                setCorrectDate(rental.paid_through_date || '')
                setModalMode('correct-paid-through')
              }}
              disabled={loading}
              style={{ padding: '6px 10px', border: '1px solid #93c5fd', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}
            >
              校正日期
            </button>
          )}
          <button type="button" onClick={cancelRental} disabled={loading} style={{ padding: '6px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fff', color: '#b91c1c', cursor: 'pointer' }}>
            {loading ? '處理中…' : '退租'}
          </button>
        </div>
        {message && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 6 }}>{message}</div>}
      </div>

      {modalMode && modalMode !== 'correct-paid-through' && (
        <MonthlyRentalModal open mode={modalMode} rental={rental} onClose={() => setModalMode(null)} />
      )}

      {modalMode === 'correct-paid-through' && canCorrectPaidThrough && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 14, padding: 22, boxShadow: '0 20px 50px rgba(15,23,42,.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>校正已繳至日期</h2>
              <button type="button" onClick={() => setModalMode(null)} disabled={correcting} style={{ border: 0, background: 'transparent', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#f8fafc', fontSize: 14, lineHeight: 1.7 }}>
              <div><strong>{rental.customer_name}</strong>・{rental.vehicle_plate}</div>
              <div>目前已繳至：<strong>{rental.paid_through_date || '尚未建立'}</strong></div>
              {rental.system_cycle_start_date && rental.system_cycle_end_date && (
                <div style={{ color: '#64748b' }}>正式租期：{rental.system_cycle_start_date} ～ {rental.system_cycle_end_date}</div>
              )}
            </div>

            <label style={{ display: 'block', marginTop: 16, fontWeight: 700 }}>新的已繳至日期</label>
            <input
              type="date"
              value={correctDate}
              min={rental.system_cycle_start_date || undefined}
              max={rental.system_cycle_end_date || undefined}
              onChange={(event) => setCorrectDate(event.target.value)}
              disabled={correcting}
              style={{ width: '100%', marginTop: 7, padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 16 }}
            />

            <div style={{ marginTop: 10, color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
              只校正付款套用到哪一天；實際繳費日期、金額、發票與月租類型不會變更。
            </div>

            {message && (
              <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 14 }}>{message}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button type="button" onClick={() => setModalMode(null)} disabled={correcting} style={{ padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>取消</button>
              <button type="button" onClick={correctPaidThroughDate} disabled={correcting || !correctDate} style={{ padding: '9px 14px', border: 0, borderRadius: 8, background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {correcting ? '校正中…' : '確認校正'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


