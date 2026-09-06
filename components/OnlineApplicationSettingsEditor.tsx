'use client'

import { useEffect, useMemo, useState } from 'react'

type Props = {
  parkingLotId: string
  parkingLotName: string
  initialSetting?: {
    enabled?: boolean | null
    starts_at?: string | null
    ends_at?: string | null
    allowed_rental_types?: string[] | null
    public_note?: string | null
    monthly_capacity_car?: number | null
    monthly_capacity_motorcycle?: number | null
    monthly_capacity_heavy_motorcycle?: number | null
    auto_waitlist_when_full?: boolean | null
    renewal_enabled?: boolean | null
  } | null
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toIso(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function splitTypes(value: string) {
  const result: string[] = []
  for (const raw of value.split(/\r?\n|,/g)) {
    const text = raw.trim()
    if (!text || result.includes(text)) continue
    result.push(text)
  }
  return result
}

export default function OnlineApplicationSettingsEditor({
  parkingLotId,
  parkingLotName,
  initialSetting,
}: Props) {
  const [enabled, setEnabled] = useState(Boolean(initialSetting?.enabled))
  const [startsAt, setStartsAt] = useState(
    toDatetimeLocal(initialSetting?.starts_at)
  )
  const [endsAt, setEndsAt] = useState(
    toDatetimeLocal(initialSetting?.ends_at)
  )
  const [rentalTypesText, setRentalTypesText] = useState(
    (initialSetting?.allowed_rental_types?.length
      ? initialSetting.allowed_rental_types
      : ['一般']
    ).join('\n')
  )
  const [publicNote, setPublicNote] = useState(
    initialSetting?.public_note || ''
  )
  const [capacityCar, setCapacityCar] = useState(
    initialSetting?.monthly_capacity_car ?? ''
  )
  const [capacityMotorcycle, setCapacityMotorcycle] = useState(
    initialSetting?.monthly_capacity_motorcycle ?? ''
  )
  const [capacityHeavyMotorcycle, setCapacityHeavyMotorcycle] = useState(
    initialSetting?.monthly_capacity_heavy_motorcycle ?? ''
  )
  const [autoWaitlistWhenFull, setAutoWaitlistWhenFull] = useState(
    initialSetting?.auto_waitlist_when_full !== false
  )
  const [renewalEnabled, setRenewalEnabled] = useState(
    initialSetting?.renewal_enabled !== false
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const rentalTypes = useMemo(
    () => splitTypes(rentalTypesText),
    [rentalTypesText]
  )

  const [publicUrl, setPublicUrl] = useState(`/apply/${parkingLotId}`)

  useEffect(() => {
    setPublicUrl(`${window.location.origin}/apply/${parkingLotId}`)
  }, [parkingLotId])

  function currentStatus() {
    if (!enabled) return '未開放'

    const now = Date.now()
    const start = startsAt ? new Date(startsAt).getTime() : null
    const end = endsAt ? new Date(endsAt).getTime() : null

    if (start && now < start) return '已設定，尚未開始'
    if (end && now >= end) return '已截止'
    return '開放中'
  }

  async function save() {
    setMessage('')

    if (enabled && !rentalTypes.length) {
      setMessage('至少要設定一種可申請的月租類型。')
      return
    }

    if (
      startsAt &&
      endsAt &&
      new Date(endsAt).getTime() <= new Date(startsAt).getTime()
    ) {
      setMessage('申請截止時間必須晚於開始時間。')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/admin/online-application-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parking_lot_id: parkingLotId,
          enabled,
          starts_at: toIso(startsAt),
          ends_at: toIso(endsAt),
          allowed_rental_types: rentalTypes,
          public_note: publicNote,
          monthly_capacity_car: capacityCar === '' ? null : Number(capacityCar),
          monthly_capacity_motorcycle:
            capacityMotorcycle === '' ? null : Number(capacityMotorcycle),
          monthly_capacity_heavy_motorcycle:
            capacityHeavyMotorcycle === ''
              ? null
              : Number(capacityHeavyMotorcycle),
          auto_waitlist_when_full: autoWaitlistWhenFull,
          renewal_enabled: renewalEnabled,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        setMessage(result?.error || '儲存失敗。')
        return
      }

      setMessage('線上申請設定已儲存。')
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setSaving(false)
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setMessage('公開申請網址已複製。')
    } catch {
      setMessage(`公開申請網址：${publicUrl}`)
    }
  }

  const status = currentStatus()
  const statusColor =
    status === '開放中'
      ? '#166534'
      : status === '已設定，尚未開始'
        ? '#b45309'
        : '#64748b'

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div>
          <div className="muted">目前停車場</div>
          <h2 style={{ margin: '4px 0 0' }}>{parkingLotName}</h2>
        </div>
        <strong style={{ color: statusColor }}>{status}</strong>
      </div>

      <div style={{ marginTop: 20, display: 'grid', gap: 18 }}>
        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            fontWeight: 700,
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          開放此停車場的線上月租申請
        </label>

        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            fontWeight: 700,
          }}
        >
          <input
            type="checkbox"
            checked={renewalEnabled}
            onChange={(e) => setRenewalEnabled(e.target.checked)}
          />
          開放既有月租戶線上續租（/renew）
        </label>
        <div className="muted" style={{ marginTop: -10, fontSize: 13 }}>
          續租開關與「新客戶線上申請」分開控制；即使暫停收新客戶，也可以保留既有月租戶續租。
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
            gap: 14,
          }}
        >
          <label>
            開始時間（可留空）
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={{ width: '100%', padding: 10 }}
            />
          </label>

          <label>
            截止時間（可留空）
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={{ width: '100%', padding: 10 }}
            />
          </label>
        </div>

        <label>
          可申請月租類型
          <textarea
            value={rentalTypesText}
            onChange={(e) => setRentalTypesText(e.target.value)}
            rows={7}
            placeholder={'一般\n里民\n身障\n老師汽車單月\n老師機車'}
            style={{ width: '100%', padding: 10, resize: 'vertical' }}
          />
          <div className="muted" style={{ marginTop: 5, fontSize: 13 }}>
            一行一種。公開申請頁只會顯示這裡設定的類型，目前共 {rentalTypes.length} 種。
          </div>
        </label>

        <label>
          公開申請說明（選填）
          <textarea
            value={publicNote}
            onChange={(e) => setPublicNote(e.target.value)}
            rows={4}
            placeholder="例如：本期名額有限，資格審核結果以管理單位通知為準。"
            style={{ width: '100%', padding: 10, resize: 'vertical' }}
          />
        </label>


        <div
          style={{
            padding: 16,
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            background: '#f8fafc',
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>月租名額上限</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            留空代表此車種不限制；輸入 0 代表不提供該車種月租名額。系統會把有效月租與待簽約契約一起計入。
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
              gap: 12,
            }}
          >
            <label>
              汽車名額
              <input
                type="number"
                min="0"
                step="1"
                value={capacityCar}
                onChange={(e) =>
                  setCapacityCar(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="留空＝不限制"
                style={{ width: '100%', padding: 10 }}
              />
            </label>
            <label>
              機車名額
              <input
                type="number"
                min="0"
                step="1"
                value={capacityMotorcycle}
                onChange={(e) =>
                  setCapacityMotorcycle(
                    e.target.value === '' ? '' : Number(e.target.value)
                  )
                }
                placeholder="留空＝不限制"
                style={{ width: '100%', padding: 10 }}
              />
            </label>
            <label>
              重機名額
              <input
                type="number"
                min="0"
                step="1"
                value={capacityHeavyMotorcycle}
                onChange={(e) =>
                  setCapacityHeavyMotorcycle(
                    e.target.value === '' ? '' : Number(e.target.value)
                  )
                }
                placeholder="留空＝不限制"
                style={{ width: '100%', padding: 10 }}
              />
            </label>
          </div>

          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              marginTop: 14,
              fontWeight: 700,
            }}
          >
            <input
              type="checkbox"
              checked={autoWaitlistWhenFull}
              onChange={(e) => setAutoWaitlistWhenFull(e.target.checked)}
            />
            名額已滿時，民眾送件後自動轉入月租候補名單
          </label>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: '#f8fafc',
            wordBreak: 'break-all',
          }}
        >
          <div className="muted" style={{ fontSize: 13 }}>
            此停車場公開申請網址
          </div>
          <strong>{publicUrl}</strong>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 10,
            }}
          >
            <button type="button" onClick={copyUrl}>
              複製網址
            </button>
            <a href={`/apply/${parkingLotId}`} target="_blank" rel="noreferrer">
              開啟公開頁測試
            </a>
          </div>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{ padding: 12, fontWeight: 700 }}
        >
          {saving ? '儲存中…' : '儲存線上申請設定'}
        </button>

        {message && <div>{message}</div>}
      </div>
    </div>
  )
}
