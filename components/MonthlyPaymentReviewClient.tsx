'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Review = {
  id: string
  parking_lot_id: string
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

const WORK_LOT_STORAGE_KEY = 'current-work-parking-lot-id'

function getCurrentWorkParkingLotId() {
  if (typeof window === 'undefined') return ''

  const stored = String(
    window.localStorage.getItem(WORK_LOT_STORAGE_KEY) || ''
  ).trim()
  if (stored) return stored

  const match = document.cookie.match(
    /(?:^|;\s*)current_work_parking_lot_id=([^;]+)/
  )
  return match?.[1]
    ? decodeURIComponent(match[1]).trim()
    : ''
}

export default function MonthlyPaymentReviewClient() {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState('')
  const [currentLotName, setCurrentLotName] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')

    const currentLotId = getCurrentWorkParkingLotId()
    if (!currentLotId) {
      setRows([])
      setCurrentLotName('')
      setMessage('請先從左側「目前工作停車場」選擇場站。')
      setLoading(false)
      return
    }

    const { data: lotRow } = await supabase
      .from('parking_lots')
      .select('name')
      .eq('id', currentLotId)
      .maybeSingle()

    setCurrentLotName(String(lotRow?.name || '目前場站'))

    const { data: reviews, error } = await supabase
      .from('monthly_payment_reviews')
      .select('id,parking_lot_id,monthly_rental_id,amount,monthly_fee,reason,created_at')
      .eq('status', 'pending')
      .eq('parking_lot_id', currentLotId)
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
    setRows((reviews || []).map((review: any) => {
      const rental = rentalMap.get(review.monthly_rental_id) || {}

      // 重要：monthly_rentals 也有 id。
      // 合併顯示資料時不可讓 rental.id 蓋掉 review.id，
      // 否則按「確認」時會把 monthly_rental_id 當成 reviewId 傳給 API，
      // 後端就會回「找不到待確認付款」。
      return {
        ...review,
        customer_code: rental.customer_code,
        customer_name: rental.customer_name,
        vehicle_plate: rental.vehicle_plate,
        paid_through_date: rental.paid_through_date,
      }
    }))
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function resolve(
    review: Review,
    action: 'approve' | 'refund_repay',
    approvedMonths = 0,
  ) {
    let notes = ''

    if (action === 'approve') {
      if (![1, 2].includes(approvedMonths)) {
        setMessage('請使用「確認 1 個月」或「確認 2 個月」。')
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
        <p className="muted">待確認會保留正式繳費報表的原始實收金額；管理員只需確認這筆算 1 個月或 2 個月，原始金額不會被改寫。確認以前不延長租期。</p>
        <div style={{ marginTop: 10, fontWeight: 700 }}>
          目前工作停車場：{currentLotName || '尚未選擇'}
        </div>
      </div>

      {message && <div className="card" style={{ marginTop: 16 }}>{message}</div>}

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        {loading ? <div>讀取中…</div> : rows.length === 0 ? <div>目前工作停車場沒有待確認付款。</div> : (
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
                    <button type="button" disabled={busyId === row.id} onClick={() => void resolve(row, 'approve', 1)}>確認 1 個月</button>{' '}
                    <button type="button" disabled={busyId === row.id} onClick={() => void resolve(row, 'approve', 2)}>確認 2 個月</button>{' '}
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
