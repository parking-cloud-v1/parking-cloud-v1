'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Term = {
  id: string
  parking_lot_id: string
  term_name: string
  start_date: string
  end_date: string
  is_active: boolean
  source: string | null
  notes: string | null
  created_at?: string | null
}

export default function RentalTermManager({
  lotId,
  lotName,
  initialTerms,
}: {
  lotId: string
  lotName: string
  initialTerms: Term[]
}) {
  const [terms, setTerms] = useState<Term[]>(initialTerms)
  const [termName, setTermName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const activeTerm = useMemo(
    () => terms.find((item) => item.is_active) || null,
    [terms]
  )

  async function reload() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('parking_lot_rental_terms')
      .select('*')
      .eq('parking_lot_id', lotId)
      .order('start_date', { ascending: false })

    if (error) {
      setMessage('讀取租期失敗：' + error.message)
      return
    }

    setTerms((data || []) as Term[])
  }

  async function addTerm() {
    if (!termName.trim()) return setMessage('請輸入期別名稱')
    if (!startDate || !endDate) return setMessage('請輸入租期開始與結束日')
    if (endDate < startDate) return setMessage('租期結束日不可早於開始日')

    setSaving(true)
    setMessage('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    try {
      const { error: closeError } = await supabase
        .from('parking_lot_rental_terms')
        .update({ is_active: false, updated_by: user?.id || null })
        .eq('parking_lot_id', lotId)
        .eq('is_active', true)

      if (closeError) throw closeError

      const { error } = await supabase
        .from('parking_lot_rental_terms')
        .insert({
          parking_lot_id: lotId,
          term_name: termName.trim(),
          start_date: startDate,
          end_date: endDate,
          is_active: true,
          source: 'lottery',
          notes: notes.trim() || null,
          created_by: user?.id || null,
          updated_by: user?.id || null,
        })

      if (error) throw error

      setTermName('')
      setStartDate('')
      setEndDate('')
      setNotes('')
      setMessage('租期已建立，並設為目前有效期別。')
      await reload()
    } catch (error: any) {
      setMessage('建立租期失敗：' + (error?.message || '未知錯誤'))
    } finally {
      setSaving(false)
    }
  }

  async function activate(id: string) {
    setSaving(true)
    setMessage('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    try {
      const { error: closeError } = await supabase
        .from('parking_lot_rental_terms')
        .update({ is_active: false, updated_by: user?.id || null })
        .eq('parking_lot_id', lotId)
        .eq('is_active', true)
      if (closeError) throw closeError

      const { error } = await supabase
        .from('parking_lot_rental_terms')
        .update({ is_active: true, updated_by: user?.id || null })
        .eq('id', id)
        .eq('parking_lot_id', lotId)
      if (error) throw error

      setMessage('已切換目前有效租期。')
      await reload()
    } catch (error: any) {
      setMessage('切換租期失敗：' + (error?.message || '未知錯誤'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, color: '#64748b' }}>目前工作停車場</div>
        <h2 style={{ margin: '4px 0 0' }}>{lotName}</h2>
        <div style={{ marginTop: 8, color: activeTerm ? '#166534' : '#b45309' }}>
          {activeTerm
            ? `目前租期：${activeTerm.term_name}｜${activeTerm.start_date} ～ ${activeTerm.end_date}`
            : '目前尚未設定有效租期。新匯入戶會暫用檔案內日期，直到主管設定場站租期。'}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>新增抽籤／年度租期</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
          <div className="field">
            <label>期別名稱 *</label>
            <input value={termName} onChange={(e) => setTermName(e.target.value)} placeholder="例如：115年度汽車月租" />
          </div>
          <div className="field">
            <label>租期開始 *</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field">
            <label>租期結束 *</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="field">
            <label>備註</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="抽籤公告、期別說明等" />
          </div>
        </div>
        <button className="btn" type="button" onClick={addTerm} disabled={saving} style={{ marginTop: 14 }}>
          {saving ? '儲存中…' : '建立並設為目前租期'}
        </button>
      </div>

      {message && (
        <div className="card" style={{ marginTop: 18, whiteSpace: 'pre-line' }}>{message}</div>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>租期歷史</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: 8 }}>期別</th>
                <th style={{ padding: 8 }}>開始</th>
                <th style={{ padding: 8 }}>結束</th>
                <th style={{ padding: 8 }}>狀態</th>
                <th style={{ padding: 8 }}>備註</th>
                <th style={{ padding: 8 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((term) => (
                <tr key={term.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 8, fontWeight: 700 }}>{term.term_name}</td>
                  <td style={{ padding: 8 }}>{term.start_date}</td>
                  <td style={{ padding: 8 }}>{term.end_date}</td>
                  <td style={{ padding: 8 }}>{term.is_active ? '目前使用' : '歷史期別'}</td>
                  <td style={{ padding: 8 }}>{term.notes || '-'}</td>
                  <td style={{ padding: 8 }}>
                    {!term.is_active && (
                      <button type="button" onClick={() => activate(term.id)} disabled={saving}>
                        設為目前租期
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {terms.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>尚無租期設定</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
