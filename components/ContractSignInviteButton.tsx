'use client'

import { useState } from 'react'

export default function ContractSignInviteButton({
  contractId,
  source = 'contract_detail',
}: {
  contractId: string
  source?: string
}) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [signUrl, setSignUrl] = useState('')

  async function regenerate() {
    if (
      !window.confirm(
        '確定重新產生簽約連結？\n\n原本尚未使用的簽約連結會立即失效，新連結有效 72 小時。'
      )
    ) {
      return
    }

    setLoading(true)
    setMessage('')
    setSignUrl('')

    try {
      const response = await fetch('/api/admin/online-contracts/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: contractId, source }),
      })

      const result = await response.json()

      if (!response.ok) {
        setMessage(result?.error || '重新產生失敗。')
        return
      }

      setSignUrl(result.sign_url || '')
      setMessage(
        result.dev_mode
          ? '新連結已建立。現在是開發測試模式，不會真正發送簡訊。'
          : result.sms_status === 'sent'
            ? '新連結已建立並已發送簡訊。'
            : `新連結已建立，但簡訊發送失敗：${result.sms_error || '未知錯誤'}`
      )
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setLoading(false)
    }
  }

  async function copyLink() {
    if (!signUrl) return
    try {
      await navigator.clipboard.writeText(signUrl)
      setMessage('簽約連結已複製。')
    } catch {
      setMessage('無法自動複製，請手動選取連結。')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 7 }}>
      <button type="button" onClick={regenerate} disabled={loading}>
        {loading ? '產生中…' : '重新產生簽約連結'}
      </button>

      {signUrl && (
        <>
          <div
            style={{
              maxWidth: 320,
              padding: 8,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              fontSize: 12,
              wordBreak: 'break-all',
              background: '#f8fafc',
            }}
          >
            {signUrl}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={copyLink}>複製</button>
            <a href={signUrl} target="_blank" rel="noreferrer">
              開啟
            </a>
          </div>
        </>
      )}

      {message && (
        <div style={{ fontSize: 12, color: '#475569', maxWidth: 320 }}>
          {message}
        </div>
      )}
    </div>
  )
}
