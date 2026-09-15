'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Review = {
  id: string
  monthly_rental_id: string
  amount: number
  monthly_fee: number
  reason: string
  created_at: string
  customer_name?: string
  customer_code?: string
  vehicle_plate?: string
  paid_through_date?: string | null
}

function reasonText(reason: string) {
  if (reason === 'zero_amount') return '0 元，需確認找零不足是否已完成繳費'
  if (reason === 'non_multiple') return '實收金額不是月租金整數倍'
  if (reason === 'invalid_monthly_fee') return '本系統月租金尚未設定'
  if (reason === 'missing_system_term') return '本系統正式租期尚未設定'
  if (reason === 'term_overflow') return '繳費月數會超出目前正式租期，需人工確認'
  return reason
}

export default function MonthlyPaymentReviewClient() {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')

    const { data: reviews, error } = await supabase
      .from('monthly_payment_reviews')
      .select('id,monthly_rental_id,amount,monthly_fee,reason,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(`讀取失敗：${error.message}`)
      setRows([])
      setLoading(false)
      return
    }

    const ids = [...new Set((reviews || []).map((r: any) => r.monthly_rental_id))]
    let rentals: any[] = []
    if (ids.length) {
      const { data } = await supabase
        .from('monthly_rentals')
        .select('id,customer_code,customer_name,vehicle_plate,paid_through_date')
        .in('id', ids)
      rentals = data || []
    }

    const rentalMap = new Map(rentals.map((r: any) => [r.id, r]))
    setRows((reviews || []).map((r: any) => ({ ...r, ...(rentalMap.get(r.monthly_rental_id) || {}) })))
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function resolve(review: Review, action: 'approve' | 'refund_repay') {
    let approvedMonths = 0
    let notes = ''

    if (action === 'approve') {
      const value = window.prompt('確認這筆要算幾個月？請輸入 1～24', '1')
      if (value === null) return
      approvedMonths = Number(value)
      if (!Number.isInteger(approvedMonths) || approvedMonths <= 0 || approvedMonths > 24) {
        setMessage('月數必須是 1～24 的整數。')
        return
      }
      notes = window.prompt('備註（可留空）', '') || ''
    } else {
      if (!window.confirm('確定標記為「退款／需重繳」？這筆不會延長租期。')) return
      notes = window.prompt('退款／重繳備註（可留空）', '') || ''
    }

    setBusyId(review.id)
    setMessage('')
    try {
      const response = await fetch('/api/monthly-rentals/payment-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewId: review.id, action, approvedMonths, notes }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error || '處理失敗')
      setMessage(action === 'approve' ? `已確認繳費 ${approvedMonths} 個月。` : '已標記退款／需重繳。')
      await load()
    } catch (error: any) {
      setMessage(error?.message || '處理失敗')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>月租付款待確認</h1>
        <p className="muted">只有 0 元、非整數倍金額，或尚未設定本系統租期的付款會進到這裡。確認以前不延長租期。</p>
      </div>

      {message && <div className="card" style={{ marginTop: 16 }}>{message}</div>}

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        {loading ? <div>讀取中…</div> : rows.length === 0 ? <div>目前沒有待確認付款。</div> : (
          <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
            <thead><tr><th>客戶</th><th>車牌</th><th>實收</th><th>系統月租</th><th>原因</th><th>目前已繳至</th><th>操作</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 8 }}>{row.customer_code ? `${row.customer_code}／` : ''}{row.customer_name || '-'}</td>
                  <td style={{ padding: 8, fontWeight: 700 }}>{row.vehicle_plate || '-'}</td>
                  <td style={{ padding: 8 }}>${Number(row.amount || 0).toLocaleString()}</td>
                  <td style={{ padding: 8 }}>${Number(row.monthly_fee || 0).toLocaleString()}</td>
                  <td style={{ padding: 8 }}>{reasonText(row.reason)}</td>
                  <td style={{ padding: 8 }}>{row.paid_through_date || '-'}</td>
                  <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                    <button type="button" disabled={busyId === row.id} onClick={() => void resolve(row, 'approve')}>確認已繳</button>{' '}
                    <button type="button" disabled={busyId === row.id} onClick={() => void resolve(row, 'refund_repay')}>退款／需重繳</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
