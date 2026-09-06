'use client'

import { useState } from 'react'

export default function SupplementReminderButton({
  applicationId,
}: {
  applicationId: string
}) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')

  async function resend() {
    if (
      !window.confirm(
        '確定重新產生補件連結？\n\n原本尚未使用的補件連結會失效，新連結有效 72 小時。'
      )
    ) {
      return
    }

    setLoading(true)
    setMessage('')
    setUrl('')

    try {
      const response = await fetch('/api/admin/online-reminders/supplement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: applicationId }),
      })
      const result = await response.json()

      if (!response.ok) {
        setMessage(result?.error || '重新發送失敗。')
        return
      }

      setUrl(result.supplement_url || '')
      setMessage(
        result.dev_mode
          ? '補件連結已重新建立；目前為開發測試模式，不會真正發送簡訊。'
          : result.sms_status === 'sent'
            ? '補件連結已重新建立並發送簡訊。'
            : `補件連結已建立，但簡訊發送失敗：${result.sms_error || '未知錯誤'}`
      )
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setMessage('補件連結已複製。')
    } catch {
      setMessage('無法自動複製，請手動選取連結。')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <button type="button" onClick={resend} disabled={loading}>
        {loading ? '發送中…' : '重新發送補件連結'}
      </button>
      {url && (
        <div style={{ display: 'grid', gap: 5 }}>
          <div
            style={{
              maxWidth: 330,
              padding: 7,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              wordBreak: 'break-all',
              fontSize: 12,
            }}
          >
            {url}
          </div>
          <button type="button" onClick={copy}>複製補件連結</button>
        </div>
      )}
      {message && <div style={{ fontSize: 12, maxWidth: 350 }}>{message}</div>}
    </div>
  )
}
