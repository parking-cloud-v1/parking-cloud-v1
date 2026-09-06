'use client'

import { useState } from 'react'

type Setting = {
  enabled?: boolean | null
  pending_review_hours?: number | null
  supplement_warning_hours?: number | null
  sign_warning_hours?: number | null
  waiting_followup_days?: number | null
  monthly_sync_pending_minutes?: number | null
  renewal_reminder_days?: number | null
  renewal_repeat_days?: number | null
  renewal_expired_grace_days?: number | null
  renewal_batch_limit?: number | null
}

export default function OnlineReminderSettingsEditor({
  parkingLotId,
  initialSetting,
}: {
  parkingLotId: string
  initialSetting?: Setting | null
}) {
  const [enabled, setEnabled] = useState(initialSetting?.enabled !== false)
  const [pendingHours, setPendingHours] = useState(
    Number(initialSetting?.pending_review_hours || 24)
  )
  const [supplementHours, setSupplementHours] = useState(
    Number(initialSetting?.supplement_warning_hours || 24)
  )
  const [signHours, setSignHours] = useState(
    Number(initialSetting?.sign_warning_hours || 24)
  )
  const [waitingDays, setWaitingDays] = useState(
    Number(initialSetting?.waiting_followup_days || 30)
  )
  const [syncMinutes, setSyncMinutes] = useState(
    Number(initialSetting?.monthly_sync_pending_minutes || 10)
  )
  const [renewalDays, setRenewalDays] = useState(
    Number(initialSetting?.renewal_reminder_days || 20)
  )
  const [renewalRepeatDays, setRenewalRepeatDays] = useState(
    Number(initialSetting?.renewal_repeat_days || 7)
  )
  const [renewalGraceDays, setRenewalGraceDays] = useState(
    Number(initialSetting?.renewal_expired_grace_days ?? 30)
  )
  const [renewalBatchLimit, setRenewalBatchLimit] = useState(
    Number(initialSetting?.renewal_batch_limit || 100)
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function save() {
    if (saving) return
    setSaving(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/online-reminders/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parking_lot_id: parkingLotId,
          enabled,
          pending_review_hours: pendingHours,
          supplement_warning_hours: supplementHours,
          sign_warning_hours: signHours,
          waiting_followup_days: waitingDays,
          monthly_sync_pending_minutes: syncMinutes,
          renewal_reminder_days: renewalDays,
          renewal_repeat_days: renewalRepeatDays,
          renewal_expired_grace_days: renewalGraceDays,
          renewal_batch_limit: renewalBatchLimit,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        setMessage(result?.error || '儲存失敗。')
        return
      }

      setMessage('提醒門檻已儲存。')
      setTimeout(() => window.location.reload(), 500)
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = {
    width: '100%',
    padding: 9,
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>提醒門檻設定</h2>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontWeight: 700,
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        啟用此停車場的線上案件待辦提醒
      </label>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))',
          gap: 14,
          marginTop: 16,
        }}
      >
        <label>
          待審核超過幾小時列為逾時
          <input
            type="number"
            min={1}
            max={720}
            value={pendingHours}
            onChange={(event) => setPendingHours(Number(event.target.value))}
            style={fieldStyle}
          />
        </label>

        <label>
          補件剩餘幾小時開始提醒
          <input
            type="number"
            min={1}
            max={168}
            value={supplementHours}
            onChange={(event) => setSupplementHours(Number(event.target.value))}
            style={fieldStyle}
          />
        </label>

        <label>
          簽約連結剩餘幾小時開始提醒
          <input
            type="number"
            min={1}
            max={168}
            value={signHours}
            onChange={(event) => setSignHours(Number(event.target.value))}
            style={fieldStyle}
          />
        </label>

        <label>
          候補幾天未聯絡再次列入提醒
          <input
            type="number"
            min={1}
            max={365}
            value={waitingDays}
            onChange={(event) => setWaitingDays(Number(event.target.value))}
            style={fieldStyle}
          />
        </label>

        <label>
          簽署後待同步超過幾分鐘列為異常
          <input
            type="number"
            min={1}
            max={1440}
            value={syncMinutes}
            onChange={(event) => setSyncMinutes(Number(event.target.value))}
            style={fieldStyle}
          />
        </label>

        <label>
          月租到期前幾天列入續租提醒
          <input
            type="number"
            min={1}
            max={180}
            value={renewalDays}
            onChange={(event) => setRenewalDays(Number(event.target.value))}
            style={fieldStyle}
          />
        </label>

        <label>
          同一月租至少隔幾天再提醒
          <input
            type="number"
            min={1}
            max={90}
            value={renewalRepeatDays}
            onChange={(event) => setRenewalRepeatDays(Number(event.target.value))}
            style={fieldStyle}
          />
        </label>

        <label>
          到期後幾天仍列入續租提醒
          <input
            type="number"
            min={0}
            max={180}
            value={renewalGraceDays}
            onChange={(event) => setRenewalGraceDays(Number(event.target.value))}
            style={fieldStyle}
          />
        </label>

        <label>
          續租簡訊單次批次上限
          <input
            type="number"
            min={1}
            max={500}
            value={renewalBatchLimit}
            onChange={(event) => setRenewalBatchLimit(Number(event.target.value))}
            style={fieldStyle}
          />
        </label>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={saving}>
          {saving ? '儲存中…' : '儲存提醒設定'}
        </button>
        {message && <span>{message}</span>}
      </div>
    </div>
  )
}
