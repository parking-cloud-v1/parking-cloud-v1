'use client'

import { useState } from 'react'

export default function ContractMonthlySyncRetryButton({
  contractId,
}: {
  contractId: string
}) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function retry() {
    if (loading) return

    setLoading(true)
    setMessage('')

    try {
      const response = await fetch(
        '/api/admin/online-contracts/retry-sync',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contract_id: contractId,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setMessage(
          result?.error || '重新同步失敗。'
        )
        return
      }

      if (result.status === 'synced') {
        setMessage('月租同步完成。')

        setTimeout(() => {
          window.location.reload()
        }, 600)
        return
      }

      setMessage(
        result?.message ||
          '仍有資料衝突，請先處理後再重試。'
      )
    } catch (error: any) {
      setMessage(
        error?.message || '無法連線到同步服務。'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={retry}
        disabled={loading}
        style={{
          padding: '6px 10px',
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          background: '#fff',
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? '同步中…' : '重新同步'}
      </button>

      {message && (
        <div
          style={{
            marginTop: 5,
            maxWidth: 260,
            fontSize: 12,
            color: '#b45309',
            whiteSpace: 'normal',
          }}
        >
          {message}
        </div>
      )}
    </div>
  )
}
