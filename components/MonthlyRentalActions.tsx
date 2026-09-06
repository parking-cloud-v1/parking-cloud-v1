'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import MonthlyRentalModal from '@/components/MonthlyRentalModal'
import SupervisorTermAdjustButton from '@/components/SupervisorTermAdjustButton'

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
}

type ModalMode = 'payment' | 'renew' | 'edit' | null

export default function MonthlyRentalActions({
  rental,
  canManageTerm = false,
}: {
  rental: Rental
  canManageTerm?: boolean
}) {
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* 月租是逐月付款，因此即使上一個月份已繳，仍必須可以繼續收下一個月。 */}
          <button type="button" onClick={() => setModalMode('payment')} disabled={loading} style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>
            收款
          </button>
          <button type="button" onClick={() => setModalMode('renew')} disabled={loading} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
            續租
          </button>
          <button type="button" onClick={() => setModalMode('edit')} disabled={loading} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
            編輯
          </button>
          {canManageTerm && <SupervisorTermAdjustButton rental={rental} />}
          <button type="button" onClick={cancelRental} disabled={loading} style={{ padding: '6px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fff', color: '#b91c1c', cursor: 'pointer' }}>
            {loading ? '處理中…' : '退租'}
          </button>
        </div>
        {message && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 6 }}>{message}</div>}
      </div>

      {modalMode && (
        <MonthlyRentalModal open mode={modalMode} rental={rental} onClose={() => setModalMode(null)} />
      )}
    </>
  )
}
