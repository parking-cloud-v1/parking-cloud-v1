'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Rental = {
  id: string
  parking_lot_id: string
  customer_name: string
  vehicle_plate: string
  start_date: string
  end_date: string
  rental_term_id?: string | null
}

type Term = {
  id: string
  term_name: string
  start_date: string
  end_date: string
  is_active: boolean
}

export default function SupervisorTermAdjustButton({ rental }: { rental: Rental }) {
  const [open, setOpen] = useState(false)
  const [terms, setTerms] = useState<Term[]>([])
  const [termId, setTermId] = useState(rental.rental_term_id || '')
  const [startDate, setStartDate] = useState(rental.start_date)
  const [endDate, setEndDate] = useState(rental.end_date)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    void supabase
      .from('parking_lot_rental_terms')
      .select('id,term_name,start_date,end_date,is_active')
      .eq('parking_lot_id', rental.parking_lot_id)
      .order('start_date', { ascending: false })
      .then(({ data }) => setTerms((data || []) as Term[]))
  }, [open, rental.parking_lot_id])

  function chooseTerm(id: string) {
    setTermId(id)
    const term = terms.find((item) => item.id === id)
    if (term) {
      setStartDate(term.start_date)
      setEndDate(term.end_date)
    }
  }

  async function save() {
    if (!startDate || !endDate) return setMessage('請輸入完整租期')
    if (endDate < startDate) return setMessage('結束日不可早於開始日')
    if (!reason.trim()) return setMessage('請填寫調整原因')

    setSaving(true)
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase.rpc('supervisor_set_monthly_rental_term', {
      p_monthly_rental_id: rental.id,
      p_start_date: startDate,
      p_end_date: endDate,
      p_rental_term_id: termId || null,
      p_reason: reason.trim(),
    })

    if (error) {
      setMessage('調整失敗：' + error.message)
      setSaving(false)
      return
    }

    window.location.reload()
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
        調整租期
      </button>

      {open && (
        <div onClick={() => !saving && setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(620px,96vw)', background: '#fff', borderRadius: 14, padding: 22 }}>
            <h2 style={{ marginTop: 0 }}>主管調整正式租期</h2>
            <div style={{ marginBottom: 14, color: '#64748b' }}>{rental.customer_name}・{rental.vehicle_plate}</div>
            <div style={{ padding: 12, borderRadius: 8, background: '#fff7ed', color: '#9a3412', marginBottom: 16 }}>
              此功能會改動續租提醒依據，系統將保留調整前後日期、原因與操作者。
            </div>

            <div className="field">
              <label>套用場站期別</label>
              <select value={termId} onChange={(e) => chooseTerm(e.target.value)}>
                <option value="">自訂日期</option>
                {terms.map((term) => <option key={term.id} value={term.id}>{term.term_name}｜{term.start_date}～{term.end_date}{term.is_active ? '（目前）' : ''}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div className="field"><label>開始日</label><input type="date" value={startDate} onChange={(e) => { setTermId(''); setStartDate(e.target.value) }} /></div>
              <div className="field"><label>結束日</label><input type="date" value={endDate} onChange={(e) => { setTermId(''); setEndDate(e.target.value) }} /></div>
            </div>
            <div className="field" style={{ marginTop: 12 }}><label>調整原因 *</label><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：主管補建舊抽籤期別、交通局公告修正租期…" /></div>
            {message && <div style={{ color: '#b91c1c', marginTop: 12 }}>{message}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" onClick={() => setOpen(false)} disabled={saving}>取消</button>
              <button className="btn" type="button" onClick={save} disabled={saving}>{saving ? '儲存中…' : '確認調整'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
