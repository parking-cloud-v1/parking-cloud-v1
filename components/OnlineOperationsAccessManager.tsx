'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ParkingLot = {
  id: string
  name: string
  status?: string | null
}

type AccessRow = {
  parking_lot_id: string
  is_enabled: boolean
  open_from: string | null
  open_until: string | null
  note: string | null
}

type Draft = {
  is_enabled: boolean
  open_from: string
  open_until: string
  note: string
}

function toLocalInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toIsoOrNull(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function statusText(draft: Draft) {
  if (!draft.is_enabled) return '目前關閉'

  const now = Date.now()
  const from = draft.open_from ? new Date(draft.open_from).getTime() : null
  const until = draft.open_until ? new Date(draft.open_until).getTime() : null

  if (from !== null && Number.isFinite(from) && now < from) return '已設定，尚未開始'
  if (until !== null && Number.isFinite(until) && now > until) return '開放期間已結束'
  return '目前開放中'
}

export default function OnlineOperationsAccessManager({
  parkingLots,
  initialRows,
}: {
  parkingLots: ParkingLot[]
  initialRows: AccessRow[]
}) {
  const supabase = createClient()
  const activeLots = useMemo(
    () => parkingLots.filter((lot) => lot.status !== 'inactive'),
    [parkingLots]
  )

  const initialMap = useMemo(
    () => new Map(initialRows.map((row) => [row.parking_lot_id, row])),
    [initialRows]
  )

  const [selectedLotId, setSelectedLotId] = useState(activeLots[0]?.id || '')
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const result: Record<string, Draft> = {}
    for (const lot of activeLots) {
      const row = initialMap.get(lot.id)
      result[lot.id] = {
        is_enabled: Boolean(row?.is_enabled),
        open_from: toLocalInput(row?.open_from),
        open_until: toLocalInput(row?.open_until),
        note: row?.note || '',
      }
    }
    return result
  })

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const draft = drafts[selectedLotId] || {
    is_enabled: false,
    open_from: '',
    open_until: '',
    note: '',
  }

  function patch(next: Partial<Draft>) {
    if (!selectedLotId) return
    setDrafts((current) => ({
      ...current,
      [selectedLotId]: {
        ...(current[selectedLotId] || draft),
        ...next,
      },
    }))
  }

  async function save() {
    if (!selectedLotId) {
      setMessage('請先選擇停車場')
      return
    }

    if (draft.open_from && draft.open_until) {
      const from = new Date(draft.open_from).getTime()
      const until = new Date(draft.open_until).getTime()
      if (Number.isFinite(from) && Number.isFinite(until) && until <= from) {
        setMessage('結束時間必須晚於開始時間')
        return
      }
    }

    setSaving(true)
    setMessage('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('登入狀態已失效')

      const { error } = await supabase
        .from('parking_lot_online_operation_access')
        .upsert({
          parking_lot_id: selectedLotId,
          is_enabled: draft.is_enabled,
          open_from: toIsoOrNull(draft.open_from),
          open_until: toIsoOrNull(draft.open_until),
          note: draft.note.trim() || null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'parking_lot_id' })

      if (error) throw error
      setMessage('已儲存。場站管理員重新整理後會依這個時間顯示或隱藏「線上作業」。')
    } catch (error: any) {
      setMessage(`儲存失敗：${error?.message || '未知錯誤'}`)
    } finally {
      setSaving(false)
    }
  }

  if (!activeLots.length) {
    return <div className="muted">目前沒有啟用中的停車場。</div>
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="field">
        <label>停車場</label>
        <select value={selectedLotId} onChange={(e) => setSelectedLotId(e.target.value)}>
          {activeLots.map((lot) => (
            <option key={lot.id} value={lot.id}>{lot.name}</option>
          ))}
        </select>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800 }}>
        <input
          type="checkbox"
          checked={draft.is_enabled}
          onChange={(e) => patch({ is_enabled: e.target.checked })}
        />
        開放這個停車場的「線上作業」給場站管理員使用
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <div className="field">
          <label>開始時間（可留空＝立即）</label>
          <input
            type="datetime-local"
            value={draft.open_from}
            onChange={(e) => patch({ open_from: e.target.value })}
          />
        </div>
        <div className="field">
          <label>結束時間（可留空＝持續開放）</label>
          <input
            type="datetime-local"
            value={draft.open_until}
            onChange={(e) => patch({ open_until: e.target.value })}
          />
        </div>
      </div>

      <div className="field">
        <label>備註（選填）</label>
        <input
          value={draft.note}
          onChange={(e) => patch({ note: e.target.value })}
          placeholder="例如：本期抽籤作業開放"
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={save} disabled={saving}>
          {saving ? '儲存中…' : '儲存開放設定'}
        </button>
        <strong style={{ color: statusText(draft) === '目前開放中' ? '#15803d' : '#64748b' }}>
          {statusText(draft)}
        </strong>
      </div>

      {message && (
        <div style={{ padding: 10, borderRadius: 8, background: message.startsWith('儲存失敗') ? '#fee2e2' : '#ecfdf5', color: message.startsWith('儲存失敗') ? '#b91c1c' : '#166534' }}>
          {message}
        </div>
      )}
    </div>
  )
}
