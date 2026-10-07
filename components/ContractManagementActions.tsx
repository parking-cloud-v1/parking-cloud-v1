'use client'

import { useState } from 'react'

export default function ContractManagementActions({
  contractId,
  status,
  applicationId,
  canVoidSigned = false,
}: {
  contractId: string
  status: string
  applicationId?: string | null
  canVoidSigned?: boolean
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const isPending = ['draft', 'sent'].includes(status)
  const isSignedVoidable = status === 'signed' && canVoidSigned

  if (!isPending && !isSignedVoidable) return null

  async function submitAction(action: 'cancel_pending' | 'void_signed') {
    const trimmed = reason.trim()

    if (!trimmed) {
      setMessage(action === 'void_signed' ? '請先填寫正式作廢原因。' : '請先填寫取消原因。')
      return
    }

    const warning =
      action === 'void_signed'
        ? '確定正式作廢這份已簽署契約？\n\n系統會先封存目前版本的契約內容、簽名、PDF 與 Hash，再退回原申請重新審核。此動作會留下永久稽核紀錄。'
        : '確定取消這份待簽契約？\n\n原簽約連結會立即失效；若有對應線上申請，案件會退回待審核。'

    if (!window.confirm(warning)) return

    setLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/online-contracts/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: contractId,
          action,
          reason: trimmed,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setMessage(result?.error || '處理失敗。')
        return
      }

      setMessage(result?.message || '處理完成。')

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
      <h2 style={{ marginTop: 0 }}>
        {isSignedVoidable ? '正式契約作廢／重簽' : '待簽契約異常處理'}
      </h2>
      <p className="muted">
        {isSignedVoidable
          ? '已簽署契約不能直接修改或覆蓋。正式作廢時會先封存舊版本，再退回原申請重新審核建立新版本。'
          : '若租期、金額、車牌或申請資料有誤，可先取消這份尚未簽署的契約，再回申請案件重新審核建立。'}
      </p>

      <label style={{ display: 'grid', gap: 6, maxWidth: 720 }}>
        {isSignedVoidable ? '正式作廢原因 *' : '取消原因 *'}
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={
            isSignedVoidable
              ? '例如：租期誤植，需保留原已簽版本並重新簽署。'
              : '例如：租期輸入錯誤，需退回重新審核。'
          }
          style={{ minHeight: 90, padding: 9 }}
        />
      </label>

      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          disabled={loading}
          onClick={() => submitAction(isSignedVoidable ? 'void_signed' : 'cancel_pending')}
          style={{ color: '#b91c1c' }}
        >
          {loading
            ? '處理中…'
            : isSignedVoidable
              ? '封存舊版本並正式作廢'
              : '取消待簽並退回審核'}
        </button>
      </div>

      {message && (
        <div style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{message}</div>
      )}
    </div>
  )
}
