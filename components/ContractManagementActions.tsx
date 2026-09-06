'use client'

import { useState } from 'react'

export default function ContractManagementActions({
  contractId,
  status,
  applicationId,
}: {
  contractId: string
  status: string
  applicationId?: string | null
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  if (!['draft', 'sent'].includes(status)) return null

  async function cancelPending() {
    const trimmed = reason.trim()

    if (!trimmed) {
      setMessage('請先填寫取消原因。')
      return
    }

    if (
      !window.confirm(
        '確定取消這份待簽契約？\n\n原簽約連結會立即失效；若有對應線上申請，案件會退回待審核。'
      )
    ) {
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/online-contracts/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: contractId,
          action: 'cancel_pending',
          reason: trimmed,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setMessage(result?.error || '取消失敗。')
        return
      }

      setMessage(result?.message || '契約已取消。')

      if (applicationId) {
        setTimeout(() => {
          window.location.href = `/dashboard/online/applications/${applicationId}`
        }, 900)
      } else {
        setTimeout(() => window.location.reload(), 900)
      }
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>待簽契約異常處理</h2>
      <p className="muted">
        若租期、金額、車牌或申請資料有誤，可先取消這份尚未簽署的契約，再回申請案件重新審核建立。
      </p>

      <label style={{ display: 'grid', gap: 6, maxWidth: 720 }}>
        取消原因 *
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="例如：租期輸入錯誤，需退回重新審核。"
          style={{ minHeight: 90, padding: 9 }}
        />
      </label>

      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          disabled={loading}
          onClick={cancelPending}
          style={{ color: '#b91c1c' }}
        >
          {loading ? '處理中…' : '取消待簽並退回審核'}
        </button>
      </div>

      {message && (
        <div style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{message}</div>
      )}
    </div>
  )
}
