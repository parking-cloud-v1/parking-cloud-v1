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
  return value || '-'
}

function driveStorageKey() {
  return 'manual-google-drive-folder:violation'
}

function isDriveFolderUrl(value: string) {
  return /^https:\/\/drive\.google\.com\//i.test(value.trim())
}

export default function ViolationSupervisorAlerts() {
  const [rows, setRows] = useState<Row[]>([])
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState('')
  const [expanded, setExpanded] = useState('')
  const [driveFolderUrl, setDriveFolderUrl] = useState('')

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

  useEffect(() => {
    setDriveFolderUrl(window.localStorage.getItem(driveStorageKey()) || '')
  }, [])

  function saveDriveFolder() {
    const value = driveFolderUrl.trim()
    if (value && !isDriveFolderUrl(value)) {
      setMessage('請貼上正確的 Google Drive 資料夾網址。')
      return
    }

    if (value) {
      window.localStorage.setItem(driveStorageKey(), value)
      setMessage('違規案件 Google Drive 連結已儲存在目前瀏覽器，可隨時更改。')
    } else {
      window.localStorage.removeItem(driveStorageKey())
      setMessage('已清除違規案件 Google Drive 連結。')
    }
  }

  function openDriveFolder() {
    const value = driveFolderUrl.trim()
    if (!value) {
      setMessage('請先貼上公司這次指定的 Google Drive 資料夾網址。')
      return
    }
    if (!isDriveFolderUrl(value)) {
      setMessage('Google Drive 連結格式不正確。')
      return
    }
    window.open(value, '_blank', 'noopener,noreferrer')
  }

  async function changeStatus(id: string, status: 'seen' | 'reported') {
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

      if (status === 'reported') {
        setRows((current) => current.filter((row) => row.id !== id))
        if (expanded === id) setExpanded('')
        setMessage(
          '案件已標記為「已舉發」，並從現場／即時通知待處理清單移除。資料庫與照片仍保留作為舉發留底；如屬重複誤傳可另按「刪除」永久清除。'
        )
      } else {
        setMessage('已標記主管查看。')
        await load()
      }
    } catch (error: any) {
      setMessage(error?.message || '處理失敗')
    } finally {
      setWorking('')
    }
  }

  function downloadCase(row: Row) {
    const key = `download:${row.id}`
    setWorking(key)
    setMessage('正在整理案件資料夾…')

    // 用瀏覽器直接下載 Server 產生的 ZIP；下載開始後不需要把整個檔案讀進前端記憶體。
    const anchor = document.createElement('a')
    anchor.href = `/api/violation-parking/${encodeURIComponent(row.id)}/download`
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    window.setTimeout(() => {
      setWorking((current) => (current === key ? '' : current))
      setMessage('案件資料夾已開始下載；可直接將 ZIP 傳給公司。')
    }, 1200)
  }

  async function deleteCase(row: Row) {
    const photos = row.violation_parking_photos || []
    const confirmText = [
      '確定永久刪除這筆違規通知？',
      '',
      `停車場：${lotName(row)}`,
      `類型：${typeText(row)}`,
      `車牌：${row.vehicle_plate || '無牌'}`,
      `照片：${photos.length} 張`,
      '',
      '刪除後會同步刪除：',
      '1. 違規案件資料庫紀錄',
      '2. 該案件全部照片資料庫紀錄',
      '3. violation-parking Storage 內的照片',
      '',
      '此操作無法復原。',
    ].join('\n')

    if (!window.confirm(confirmText)) return

    const key = `delete:${row.id}`
    setWorking(key)
    setMessage('違規案件刪除中…')

    try {
      const response = await fetch('/api/violation-parking/supervisor-alerts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || '刪除失敗')

      setRows((current) => current.filter((item) => item.id !== row.id))
      if (expanded === row.id) setExpanded('')

      const deletedPhotos = Number(json?.deletedPhotos || 0)
      setMessage(`已永久刪除違規案件，並清除 ${deletedPhotos} 張照片。`)
      await load()
    } catch (error: any) {
      setMessage(error?.message || '刪除失敗')
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
      if (!response.ok || !json?.signedUrl) {
        throw new Error(json?.error || '照片開啟失敗')
      }
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
        場站建立案件後會列在這裡；本頁每 10 秒自動更新。案件先下載完整 ZIP，再直接開啟公司指定的 Google Drive 資料夾手動上傳；「已舉發」就是最終處理，按下後會從現場與即時通知待處理清單消失。
      </p>

      <div className="card" style={{ marginTop: 14 }}>
        <strong>待主管首次查看：{pendingCount} 件</strong>
        <span className="muted">　目前待處理共 {rows.length} 件</span>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>公司 Google Drive 手動上傳</h2>
        <div className="muted">
          不再由系統自動傳到固定資料夾。先下載案件 ZIP，再打開你這次指定的 Drive 資料夾手動上傳。
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>違規舉發資料夾網址</label>
          <input
            value={driveFolderUrl}
            onChange={(event) => setDriveFolderUrl(event.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" onClick={saveDriveFolder}>儲存／更新連結</button>
          <button type="button" className="btn" onClick={openDriveFolder}>開啟 Google Drive</button>
        </div>
      </div>

      {message && (
        <div className="card" style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>
          {message}
        </div>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 1080 }}>
            <thead>
              <tr>
                <th>時間</th>
                <th>停車場</th>
                <th>類型</th>
                <th>車牌</th>
                <th>位置</th>
                <th>照片</th>
                <th>狀態</th>
                <th>操作</th>
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
                    onStatus={(status) => void changeStatus(row.id, status)}
                    onPhoto={(photoId) => void openPhoto(row.id, photoId)}
                    onDownload={() => downloadCase(row)}
                    onOpenDrive={openDriveFolder}
                    onDelete={() => void deleteCase(row)}
                  />
                )
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 26 }}>
                    目前沒有違規案件
                  </td>
                </tr>
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
  onDownload,
  onOpenDrive,
  onDelete,
}: {
  row: Row
  photos: PhotoRow[]
  isOpen: boolean
  working: string
  onToggle: () => void
  onStatus: (status: 'seen' | 'reported') => void
  onPhoto: (photoId: string) => void
  onDownload: () => void
  onOpenDrive: () => void
  onDelete: () => void
}) {
  const deleting = working === `delete:${row.id}`
  const downloading = working === `download:${row.id}`
  const rowWorking =
    working === row.id ||
    deleting ||
    downloading ||
    working.startsWith(`${row.id}:`)

  return (
    <>
      <tr>
        <td>{new Date(row.created_at).toLocaleString('zh-TW')}</td>
        <td>{lotName(row)}</td>
        <td>{typeText(row)}</td>
        <td>{row.vehicle_plate || '無牌'}</td>
        <td>{row.location_text || '-'}</td>
        <td>{photos.length} 張</td>
        <td>
          <strong>{statusText(row.supervisor_status)}</strong>
        </td>
        <td>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={onToggle}>
              {isOpen ? '收合' : '完整查看'}
            </button>

            <button
              type="button"
              disabled={rowWorking}
              onClick={onDownload}
              style={{ fontWeight: 700 }}
            >
              {downloading ? '整理中…' : '下載案件資料夾'}
            </button>

            <button
              type="button"
              disabled={rowWorking}
              onClick={onOpenDrive}
            >
              開啟 Drive 手動上傳
            </button>

            {row.supervisor_status === 'pending' && (
              <button type="button" disabled={rowWorking} onClick={() => onStatus('seen')}>
                已查看
              </button>
            )}

            {row.supervisor_status !== 'reported' && (
              <button
                type="button"
                className="btn"
                disabled={rowWorking}
                onClick={() => onStatus('reported')}
              >
                已舉發
              </button>
            )}

            <button
              type="button"
              disabled={rowWorking}
              onClick={onDelete}
              style={{
                border: '1px solid #dc2626',
                color: '#b91c1c',
                background: '#fff',
                fontWeight: 700,
              }}
            >
              {deleting ? '刪除中…' : '刪除'}
            </button>
          </div>
        </td>
      </tr>

      {isOpen && (
        <tr>
          <td colSpan={8} style={{ background: '#f8fafc', padding: 16 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
                gap: 10,
              }}
            >
              <div>
                <strong>發現／開始日期：</strong>
                {row.start_date}
              </div>
              <div>
                <strong>主管狀態：</strong>
                {statusText(row.supervisor_status)}
              </div>
              <div>
                <strong>舉發時間：</strong>
                {row.supervisor_status === 'reported' && row.handled_at
                  ? new Date(row.handled_at).toLocaleString('zh-TW')
                  : '-'}
              </div>
              <div>
                <strong>案件 ID：</strong>
                <span style={{ fontSize: 12 }}>{row.id}</span>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <strong>備註：</strong>
              {row.notes || '無'}
            </div>

            <div style={{ marginTop: 14, fontWeight: 800 }}>案件照片</div>
            {photos.length === 0 ? (
              <div className="muted" style={{ marginTop: 8 }}>
                此案件尚未上傳照片；仍可下載案件 ZIP，裡面會保留案件文字資料。
              </div>
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
