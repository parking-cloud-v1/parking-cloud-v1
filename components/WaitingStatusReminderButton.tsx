'use client'

import { useState } from 'react'

export default function WaitingStatusReminderButton({
  applicationId,
}: {
  applicationId: string
}) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function send() {
    if (loading) return
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/online-reminders/waiting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: applicationId }),
      })
      const result = await response.json()

      if (!response.ok) {
        setMessage(result?.error || '發送失敗。')
        return
      }

      setMessage(
        result.dev_mode
          ? '候補進度提醒已建立；目前為開發測試模式，不會真正發送簡訊。'
          : result.sms_status === 'sent'
            ? '候補進度提醒已發送。'
            : `簡訊發送失敗：${result.sms_error || '未知錯誤'}`
      )

      setTimeout(() => window.location.reload(), 700)
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button type="button" onClick={send} disabled={loading}>
        {loading ? '發送中…' : '發送候補進度提醒'}
      </button>
      {message && (
        <div style={{ marginTop: 5, fontSize: 12, maxWidth: 320 }}>
          {message}
        </div>
      )}
    </div>
  )
}
