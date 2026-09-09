'use client'

import { useEffect, useState } from 'react'

type PhotoRow = {
  id: string
  photo_type: string
  photo_date: string
  file_name: string
  uploaded_at: string
}

type Row = {
  id: string
  parking_lot_id: string
  case_type: string
  reserved_type: string | null
  vehicle_plate: string | null
  location_text: string | null
  start_date: string
  notes: string | null
  status: string
  supervisor_status: string
  supervisor_seen_at?: string | null
  handled_at?: string | null
  created_at: string
  parking_lots?: { name?: string } | { name?: string }[] | null
  violation_parking_photos?: PhotoRow[]
}

const PHOTO_LABELS: Record<string, string> = {
  overview: '車格和牌面全景',
  center_window: '置中全窗',
  right_window: '右側全窗',
  left_window: '左側全窗',
  daily: '每日追蹤',
  general: '現場照片',
}

function lotName(row: Row) {
  const value = row.parking_lots
  if (Array.isArray(value)) return value[0]?.name || '-'
  return value?.name || '-'
}

function typeText(row: Row) {
  if (row.case_type === 'reserved_violation') {
    return row.reserved_type === 'disabled' ? '身障車格違規' : '婦幼車格違規'
  }
  if (row.case_type === 'long_stay') return '場內久停車'
  return '無牌車輛'
}

function statusText(value: string) {
  if (value === 'pending') return '待主管查看'
  if (value === 'seen') return '主管已查看'
  if (value === 'reported') return '已舉發'
  if (value === 'closed') return '已結案'
  return value || '-'
}

export default function ViolationSupervisorAlerts() {
  const [rows, setRows] = useState<Row[]>([])
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState('')
  const [expanded, setExpanded] = useState('')

  async function load() {
    try {
      const response = await fetch('/api/violation-parking/supervisor-alerts', {
        cache: 'no-store',
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || '違規通知讀取失敗')
      setRows((json.data || []) as Row[])
    } catch (error: any) {
      setMessage(error?.message || '違規通知讀取失敗')
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 10000)
    return () => window.clearInterval(timer)
  }, [])

  async function changeStatus(id: string, status: 'seen' | 'reported' | 'closed') {
    setWorking(id)
    setMessage('')
    try {
      const response = await fetch(`/api/violation-parking/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || '處理失敗')

      setMessage(
        status === 'reported'
          ? '已標記為「已舉發」。'
          : status === 'closed'
            ? '案件已結案。'
            : '已標記主管查看。'
      )
      await load()
    } catch (error: any) {
      setMessage(error?.message || '處理失敗')
    } finally {
      setWorking('')
    }
  }

  async function openPhoto(caseId: string, photoId: string) {
    const key = `${caseId}:${photoId}`
    setWorking(key)
    try {
      const response = await fetch(
        `/api/violation-parking/${caseId}/photos?photoId=${encodeURIComponent(photoId)}`,
        { cache: 'no-store' }
      )
      const json = await response.json()
      if (!response.ok || !json?.signedUrl) throw new Error(json?.error || '照片開啟失敗')
      window.open(json.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (error: any) {
      setMessage(error?.message || '照片開啟失敗')
    } finally {
      setWorking('')
    }
  }

  const pendingCount = rows.filter((row) => row.supervisor_status === 'pending').length

  return (
    <div style={{ paddingBottom: 40 }}>
      <h1 style={{ marginBottom: 6 }}>違規即時通知</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        場站建立案件後會列在這裡；本頁每 10 秒自動更新。可直接展開完整案件與查看照片，再標記已查看、已舉發或結案。
      </p>

      <div className="card" style={{ marginTop: 14 }}>
        <strong>待主管首次查看：{pendingCount} 件</strong>
        <span className="muted">　目前未結案通知共 {rows.length} 件</span>
      </div>

      {message && (
        <div className="card" style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>
          {message}
        </div>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>時間</th><th>停車場</th><th>類型</th><th>車牌</th><th>位置</th><th>照片</th><th>狀態</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const photos = row.violation_parking_photos || []
                const isOpen = expanded === row.id
                return (
                  <FragmentRow
                    key={row.id}
                    row={row}
                    photos={photos}
                    isOpen={isOpen}
                    working={working}
                    onToggle={() => setExpanded(isOpen ? '' : row.id)}
                    onStatus={(status) => changeStatus(row.id, status)}
                    onPhoto={(photoId) => openPhoto(row.id, photoId)}
                  />
                )
              })}

              {rows.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 26 }}>目前沒有待處理違規案件</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function FragmentRow({
  row,
  photos,
  isOpen,
  working,
  onToggle,
  onStatus,
  onPhoto,
}: {
  row: Row
  photos: PhotoRow[]
  isOpen: boolean
  working: string
  onToggle: () => void
  onStatus: (status: 'seen' | 'reported' | 'closed') => void
  onPhoto: (photoId: string) => void
}) {
  return (
    <>
      <tr>
        <td>{new Date(row.created_at).toLocaleString('zh-TW')}</td>
        <td>{lotName(row)}</td>
        <td>{typeText(row)}</td>
        <td>{row.vehicle_plate || '無牌'}</td>
        <td>{row.location_text || '-'}</td>
        <td>{photos.length} 張</td>
        <td><strong>{statusText(row.supervisor_status)}</strong></td>
        <td>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={onToggle}>{isOpen ? '收合' : '完整查看'}</button>
            {row.supervisor_status === 'pending' && (
              <button type="button" disabled={working === row.id} onClick={() => onStatus('seen')}>已查看</button>
            )}
            <button type="button" className="btn" disabled={working === row.id} onClick={() => onStatus('reported')}>已舉發</button>
            <button type="button" disabled={working === row.id} onClick={() => onStatus('closed')}>結案</button>
          </div>
        </td>
      </tr>

      {isOpen && (
        <tr>
          <td colSpan={8} style={{ background: '#f8fafc', padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
              <div><strong>發現／開始日期：</strong>{row.start_date}</div>
              <div><strong>案件狀態：</strong>{row.status || '-'}</div>
              <div><strong>主管狀態：</strong>{statusText(row.supervisor_status)}</div>
              <div><strong>案件 ID：</strong><span style={{ fontSize: 12 }}>{row.id}</span></div>
            </div>

            <div style={{ marginTop: 10 }}><strong>備註：</strong>{row.notes || '無'}</div>

            <div style={{ marginTop: 14, fontWeight: 800 }}>案件照片</div>
            {photos.length === 0 ? (
              <div className="muted" style={{ marginTop: 8 }}>此案件尚未上傳照片。</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {photos
                  .slice()
                  .sort((a, b) => String(a.photo_date).localeCompare(String(b.photo_date)))
                  .map((photo) => (
                    <button
                      type="button"
                      key={photo.id}
                      disabled={working === `${row.id}:${photo.id}`}
                      onClick={() => onPhoto(photo.id)}
                    >
                      {photo.photo_date}｜{PHOTO_LABELS[photo.photo_type] || photo.photo_type}
                    </button>
                  ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
