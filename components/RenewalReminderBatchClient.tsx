'use client'

import { useMemo, useState } from 'react'

type Candidate = {
  id: string
  customer_code: string
  customer_name: string
  phone_masked: string
  vehicle_plate: string
  vehicle_type: string
  rental_type: string
  end_date: string
  due_text: string
  last_sent_at?: string | null
  can_send: boolean
  blocked_reason?: string | null
}

export default function RenewalReminderBatchClient({
  parkingLotId,
  candidates,
  batchLimit,
}: {
  parkingLotId: string
  candidates: Candidate[]
  batchLimit: number
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  const sendableIds = useMemo(
    () => candidates.filter((row) => row.can_send).map((row) => row.id),
    [candidates]
  )

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(sendableIds.slice(0, batchLimit)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  async function send() {
    if (sending) return
    const ids = Array.from(selected)
    if (!ids.length) {
      setMessage('請先勾選要發送的月租戶。')
      return
    }
    if (ids.length > batchLimit) {
      setMessage(`單次最多可發送 ${batchLimit} 筆。`)
      return
    }

    if (
      !window.confirm(
        `確定發送 ${ids.length} 筆續租提醒簡訊？\n\n系統會自動排除已有續租案件或提醒間隔未到的資料。`
      )
    ) {
      return
    }

    setSending(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/online-renewal-reminders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parking_lot_id: parkingLotId,
          monthly_rental_ids: ids,
        }),
      })
      const result = await response.json()

      if (!response.ok) {
        setMessage(result?.error || '發送失敗。')
        return
      }

      setMessage(
        `完成：成功/測試 ${result.sent_count || 0} 筆、失敗 ${
          result.failed_count || 0
        } 筆、略過 ${result.skipped_count || 0} 筆。`
      )
      setSelected(new Set())
      setTimeout(() => window.location.reload(), 900)
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>續租邀請名單</h2>
          <div className="muted" style={{ marginTop: 4 }}>
            可發送 {sendableIds.length} 筆｜已勾選 {selected.size} 筆｜單次上限 {batchLimit} 筆
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={selectAll} disabled={!sendableIds.length || sending}>
            全選可發送
          </button>
          <button type="button" onClick={clearAll} disabled={!selected.size || sending}>
            清除勾選
          </button>
          <button type="button" onClick={send} disabled={!selected.size || sending}>
            {sending ? '發送中…' : `批次發送續租簡訊（${selected.size}）`}
          </button>
        </div>
      </div>

      {message && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 8,
            background: '#f8fafc',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message}
        </div>
      )}

      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ width: '100%', minWidth: 1050, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th>選</th>
              <th>客戶編號</th>
              <th>姓名</th>
              <th>手機</th>
              <th>車牌</th>
              <th>車種</th>
              <th>月租類型</th>
              <th>到期日</th>
              <th>狀態</th>
              <th>上次成功提醒</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((row) => (
              <tr key={row.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px 6px' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={(event) => toggle(row.id, event.target.checked)}
                    disabled={!row.can_send || sending}
                  />
                </td>
                <td>{row.customer_code || '-'}</td>
                <td>{row.customer_name}</td>
                <td>{row.phone_masked}</td>
                <td>{row.vehicle_plate}</td>
                <td>{row.vehicle_type}</td>
                <td>{row.rental_type || '一般'}</td>
                <td>{row.end_date}</td>
                <td>
                  {row.can_send ? (
                    <strong style={{ color: '#166534' }}>{row.due_text}</strong>
                  ) : (
                    <span style={{ color: '#9a3412' }}>
                      {row.blocked_reason || row.due_text}
                    </span>
                  )}
                </td>
                <td>
                  {row.last_sent_at
                    ? new Date(row.last_sent_at).toLocaleString('zh-TW')
                    : '-'}
                </td>
              </tr>
            ))}
            {!candidates.length && (
              <tr>
                <td colSpan={10} style={{ padding: 20, textAlign: 'center' }}>
                  目前沒有進入續租提醒範圍的月租戶。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
