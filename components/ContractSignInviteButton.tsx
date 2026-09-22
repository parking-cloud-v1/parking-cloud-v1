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
  const [onsiteLoading, setOnsiteLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [signUrl, setSignUrl] = useState('')

  async function createLink(delivery: 'sms' | 'onsite') {
    const isOnsite = delivery === 'onsite'

    if (
      !isOnsite &&
      !window.confirm(
        '確定重新產生簽約連結？\n\n原本尚未使用的簽約連結會立即失效，新連結有效 72 小時。'
      )
    ) {
      return
    }

    if (
      isOnsite &&
      !window.confirm(
        '確定開始「現場簽約」？\n\n系統會產生新的 72 小時簽約連結，但不發送簽約通知簡訊。\n客戶仍需使用本人手機完成 OTP 驗證與手寫簽名。'
      )
    ) {
      return
    }

    if (isOnsite) setOnsiteLoading(true)
    else setLoading(true)

    setMessage('')
    setSignUrl('')

    try {
      const response = await fetch('/api/admin/online-contracts/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: contractId,
          source,
          delivery,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setMessage(result?.error || '產生簽約連結失敗。')
        return
      }

      const url = String(result.sign_url || '')
      setSignUrl(url)

      if (isOnsite) {
        setMessage(
          '現場簽約連結已建立。請在此裝置開啟後交由客戶操作；客戶仍須完成手機 OTP、契約確認與手寫簽名。'
        )

        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer')
        }
        return
      }

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
      if (isOnsite) setOnsiteLoading(false)
      else setLoading(false)
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
    <div style={{ display: 'grid', gap: 9 }}>
      <button
        type="button"
        onClick={() => createLink('onsite')}
        disabled={loading || onsiteLoading}
        style={{
          padding: '11px 14px',
          fontWeight: 800,
          borderRadius: 9,
          border: '1px solid #15803d',
          background: '#16a34a',
          color: '#fff',
          cursor: onsiteLoading ? 'wait' : 'pointer',
        }}
      >
        {onsiteLoading ? '正在開啟現場簽約…' : '📱 現場直接簽約'}
      </button>

      <div
        style={{
          fontSize: 12,
          color: '#64748b',
          lineHeight: 1.6,
        }}
      >
        戶外場可用手機或平板直接開啟。此模式不先發簽約通知簡訊，但客戶本人手機 OTP、閱讀契約、手寫簽名仍全部保留。
      </div>

      <button
        type="button"
        onClick={() => createLink('sms')}
        disabled={loading || onsiteLoading}
      >
        {loading ? '產生中…' : '重新產生並發送簽約連結'}
      </button>

      {signUrl && (
        <>
          <div
            style={{
              maxWidth: 420,
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

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={copyLink}>
              複製連結
            </button>
            <a href={signUrl} target="_blank" rel="noreferrer">
              開啟簽約頁
            </a>
          </div>
        </>
      )}

      {message && (
        <div
          style={{
            fontSize: 12,
            color: '#475569',
            maxWidth: 420,
            lineHeight: 1.6,
          }}
        >
          {message}
        </div>
      )}
    </div>
  )
}
