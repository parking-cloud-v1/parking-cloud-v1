'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'

type CaseType = 'reserved_violation' | 'long_stay' | 'unplated'

type PhotoRow = {
  id: string
  photo_type: string
  photo_date: string
  storage_path: string
  file_name: string
  mime_type?: string | null
  file_size?: number | null
  uploaded_at: string
}

type CaseRow = {
  id: string
  parking_lot_id: string
  case_type: CaseType
  reserved_type: 'disabled' | 'parent_child' | null
  vehicle_plate: string | null
  location_text: string | null
  start_date: string
  notes: string | null
  status: string
  supervisor_status?: string | null
  supervisor_seen_at?: string | null
  handled_at?: string | null
  created_at: string
  violation_parking_photos?: PhotoRow[]
}

const today = () => new Date().toISOString().slice(0, 10)

const PHOTO_LABELS: Record<string, string> = {
  overview: '車格和牌面全景照',
  center_window: '置中全窗照片',
  right_window: '右側全窗照片',
  left_window: '左側全窗照片',
  daily: '每日追蹤照片',
  general: '現場照片',
}

function supervisorStatusText(value?: string | null) {
  if (value === 'pending') return '待主管查看'
  if (value === 'seen') return '主管已查看'
  if (value === 'reported') return '已舉發'
  if (value === 'closed') return '已結案'
  return value || '-'
}

function caseTitle(row: CaseRow) {
  if (row.case_type === 'reserved_violation') {
    return row.reserved_type === 'disabled' ? '身障車格違規' : '婦幼車格違規'
  }
  if (row.case_type === 'long_stay') return '場內久停車'
  return '無牌車輛'
}

function sortPhotos(photos: PhotoRow[]) {
  return [...photos].sort((a, b) => {
    const dateCompare = String(a.photo_date).localeCompare(String(b.photo_date))
    if (dateCompare !== 0) return dateCompare
    return String(a.uploaded_at).localeCompare(String(b.uploaded_at))
  })
}

export default function ViolationParkingClient({
  parkingLotId,
  parkingLotName,
  focusCaseId = '',
}: {
  parkingLotId: string
  parkingLotName: string
  focusCaseId?: string
}) {
  const [tab, setTab] = useState<CaseType>('reserved_violation')
  const [rows, setRows] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [workingPhoto, setWorkingPhoto] = useState('')
  const [message, setMessage] = useState('')

  const [reservedType, setReservedType] = useState<'disabled' | 'parent_child'>('disabled')
  const [plate, setPlate] = useState('')
  const [locationText, setLocationText] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [notes, setNotes] = useState('')

  async function loadRows() {
    if (!parkingLotId) {
      setRows([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `/api/violation-parking?lotId=${encodeURIComponent(parkingLotId)}`,
        { cache: 'no-store' }
      )
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || '讀取失敗')

      const nextRows = (json.data || []) as CaseRow[]
      setRows(nextRows)

      if (focusCaseId) {
        const focused = nextRows.find((row) => row.id === focusCaseId)
        if (focused) setTab(focused.case_type)
      }
    } catch (error: any) {
      setMessage(error?.message || '讀取失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
    const timer = window.setInterval(() => void loadRows(), 10000)
    return () => window.clearInterval(timer)
  }, [parkingLotId])

  const filtered = useMemo(
    () => rows.filter((row) => row.case_type === tab),
    [rows, tab]
  )

  async function createCase() {
    if (!parkingLotId) {
      setMessage('請先從左側選擇目前工作停車場。')
      return
    }
    if (tab !== 'unplated' && !plate.trim()) {
      setMessage('請輸入車牌。')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/violation-parking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parkingLotId,
          caseType: tab,
          reservedType: tab === 'reserved_violation' ? reservedType : null,
          vehiclePlate: tab === 'unplated' ? null : plate,
          locationText,
          startDate,
          notes,
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || '建立失敗')

      setPlate('')
      setLocationText('')
      setStartDate(today())
      setNotes('')
      setMessage('案件已建立，請接著上傳照片。主管端也會收到待查看通知。')
      await loadRows()
    } catch (error: any) {
      setMessage(error?.message || '建立失敗')
    } finally {
      setSaving(false)
    }
  }

  async function uploadPhoto(
    caseId: string,
    photoType: string,
    photoDate: string,
    file: File
  ) {
    const key = `${caseId}:upload:${photoType}:${photoDate}`
    setWorkingPhoto(key)
    setMessage('照片上傳中…')

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('photoType', photoType)
      form.append('photoDate', photoDate)

      const response = await fetch(`/api/violation-parking/${caseId}/photos`, {
        method: 'POST',
        body: form,
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || '照片上傳失敗')

      setMessage('照片上傳完成。')
      await loadRows()
    } catch (error: any) {
      setMessage(error?.message || '照片上傳失敗')
    } finally {
      setWorkingPhoto('')
    }
  }

  async function openPhoto(caseId: string, photo: PhotoRow) {
    const key = `${caseId}:preview:${photo.id}`
    setWorkingPhoto(key)
    try {
      const response = await fetch(
        `/api/violation-parking/${caseId}/photos?photoId=${encodeURIComponent(photo.id)}`,
        { cache: 'no-store' }
      )
      const json = await response.json()
      if (!response.ok || !json?.signedUrl) {
        throw new Error(json?.error || '照片預覽失敗')
      }
      window.open(json.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (error: any) {
      setMessage(error?.message || '照片預覽失敗')
    } finally {
      setWorkingPhoto('')
    }
  }

  async function deletePhoto(caseId: string, photo: PhotoRow) {
    const confirmed = window.confirm(
      `確定刪除這張照片？\n\n${PHOTO_LABELS[photo.photo_type] || photo.photo_type}\n日期：${photo.photo_date}\n檔名：${photo.file_name}\n\n刪除後可重新上傳，且無法復原。`
    )
    if (!confirmed) return

    const key = `${caseId}:delete:${photo.id}`
    setWorkingPhoto(key)
    setMessage('')
    try {
      const response = await fetch(`/api/violation-parking/${caseId}/photos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: photo.id }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || '照片刪除失敗')

      setMessage('照片已刪除，可以重新上傳。')
      await loadRows()
    } catch (error: any) {
      setMessage(error?.message || '照片刪除失敗')
    } finally {
      setWorkingPhoto('')
    }
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <h1 style={{ marginBottom: 6 }}>違規停車照片</h1>
      <div className="muted">
        目前工作停車場：<strong>{parkingLotName || '尚未選擇'}</strong>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
        <button className="btn" type="button" onClick={() => setTab('reserved_violation')}>
          身障／婦幼違規
        </button>
        <button className="btn" type="button" onClick={() => setTab('long_stay')}>
          場內久停 10 天
        </button>
        <button className="btn" type="button" onClick={() => setTab('unplated')}>
          無牌車輛
        </button>
      </div>

      {!parkingLotId && (
        <div className="card" style={{ marginTop: 18, background: '#fffbeb', color: '#b45309' }}>
          請先在左側「目前工作停車場」選擇停車場。
        </div>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>
          新增－{tab === 'reserved_violation' ? '身障／婦幼違規停車' : tab === 'long_stay' ? '場內久停車' : '無牌車輛'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 }}>
          {tab === 'reserved_violation' && (
            <div className="field">
              <label>違規類型</label>
              <select value={reservedType} onChange={(e) => setReservedType(e.target.value as any)}>
                <option value="disabled">身障車格違規</option>
                <option value="parent_child">婦幼車格違規</option>
              </select>
            </div>
          )}

          {tab !== 'unplated' && (
            <div className="field">
              <label>車牌</label>
              <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="ABC-1234" />
            </div>
          )}

          <div className="field">
            <label>{tab === 'long_stay' ? '開始追蹤日期' : '發現日期'}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          <div className="field">
            <label>位置／車格</label>
            <input value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="例如 B2-035" />
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>備註</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <button className="btn" type="button" onClick={createCase} disabled={saving || !parkingLotId} style={{ marginTop: 14 }}>
          {saving ? '建立中…' : '建立案件'}
        </button>
      </div>

      {message && (
        <div className="card" style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>
          {message}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        {loading && <div className="muted">讀取中…</div>}
        {!loading && filtered.length === 0 && <div className="card">目前沒有此類案件。</div>}

        {filtered.map((row) => {
          const photos = sortPhotos(row.violation_parking_photos || [])
          const dailyDates = new Set(
            photos.filter((photo) => photo.photo_type === 'daily').map((photo) => photo.photo_date)
          )

          return (
            <div
              id={`case-${row.id}`}
              className="card"
              key={row.id}
              style={{
                marginBottom: 14,
                border: focusCaseId === row.id ? '2px solid #2563eb' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ fontSize: 18 }}>{caseTitle(row)}</strong>
                  <div className="muted" style={{ marginTop: 4 }}>
                    車牌：{row.vehicle_plate || '無牌'} ｜ 日期：{row.start_date} ｜ 位置：{row.location_text || '-'}
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    主管狀態：{supervisorStatusText(row.supervisor_status)}
                  </div>
                </div>

                {row.case_type === 'long_stay' && (
                  <div style={{ fontWeight: 800, fontSize: 20 }}>
                    已完成 {dailyDates.size} / 10 天
                  </div>
                )}
              </div>

              {row.notes && (
                <div style={{ marginTop: 10, padding: 10, background: '#f8fafc', borderRadius: 8 }}>
                  備註：{row.notes}
                </div>
              )}

              {row.case_type === 'reserved_violation' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10, marginTop: 14 }}>
                  {[
                    ['overview', '1. 車格和牌面全景照'],
                    ['center_window', '2. 置中全窗照片'],
                    ['right_window', '3. 右側全窗照片'],
                    ['left_window', '4. 左側全窗照片'],
                  ].map(([type, label]) => {
                    const photo = photos.find((item) => item.photo_type === type)
                    return (
                      <PhotoSlot
                        key={type}
                        label={label}
                        photo={photo}
                        busy={Boolean(photo && workingPhoto.includes(photo.id))}
                        uploadBusy={workingPhoto === `${row.id}:upload:${type}:${row.start_date}`}
                        onPreview={() => photo && openPhoto(row.id, photo)}
                        onDelete={() => photo && deletePhoto(row.id, photo)}
                        onFile={(file) => uploadPhoto(row.id, type, row.start_date, file)}
                      />
                    )
                  })}
                </div>
              )}

              {row.case_type === 'long_stay' && (
                <LongStayPanel
                  caseRow={row}
                  photos={photos.filter((photo) => photo.photo_type === 'daily')}
                  workingPhoto={workingPhoto}
                  onUpload={(date, file) => uploadPhoto(row.id, 'daily', date, file)}
                  onPreview={(photo) => openPhoto(row.id, photo)}
                  onDelete={(photo) => deletePhoto(row.id, photo)}
                />
              )}

              {row.case_type === 'unplated' && (
                <div style={{ marginTop: 14 }}>
                  <PhotoUpload label="新增現場照片" disabled={false} onFile={(file) => uploadPhoto(row.id, 'general', today(), file)} />
                  <PhotoList
                    photos={photos.filter((photo) => photo.photo_type === 'general')}
                    workingPhoto={workingPhoto}
                    onPreview={(photo) => openPhoto(row.id, photo)}
                    onDelete={(photo) => deletePhoto(row.id, photo)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PhotoSlot({
  label,
  photo,
  busy,
  uploadBusy,
  onPreview,
  onDelete,
  onFile,
}: {
  label: string
  photo?: PhotoRow
  busy: boolean
  uploadBusy: boolean
  onPreview: () => void
  onDelete: () => void
  onFile: (file: File) => void
}) {
  return (
    <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, background: photo ? '#f0fdf4' : '#fff' }}>
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div className="muted" style={{ marginTop: 4 }}>{photo ? '已上傳' : '尚未上傳'}</div>

      {photo ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" disabled={busy} onClick={onPreview}>查看</button>
          <button type="button" disabled={busy} onClick={onDelete} style={{ color: '#b91c1c' }}>刪除後重拍</button>
        </div>
      ) : (
        <PhotoUpload label={uploadBusy ? '上傳中…' : '選擇照片'} disabled={uploadBusy} onFile={onFile} compact />
      )}
    </div>
  )
}

function PhotoUpload({
  label,
  disabled,
  onFile,
  compact = false,
}: {
  label: string
  disabled: boolean
  onFile: (file: File) => void
  compact?: boolean
}) {
  return (
    <label style={{ display: 'block', marginTop: compact ? 8 : 0, fontWeight: 700 }}>
      <span>{label}</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
        style={{ display: 'block', marginTop: 8 }}
      />
    </label>
  )
}

function PhotoList({
  photos,
  workingPhoto,
  onPreview,
  onDelete,
}: {
  photos: PhotoRow[]
  workingPhoto: string
  onPreview: (photo: PhotoRow) => void
  onDelete: (photo: PhotoRow) => void
}) {
  if (!photos.length) return <div className="muted" style={{ marginTop: 10 }}>尚無照片。</div>

  return (
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table className="table" style={{ minWidth: 680 }}>
        <thead>
          <tr><th>日期</th><th>類型</th><th>檔名</th><th>操作</th></tr>
        </thead>
        <tbody>
          {photos.map((photo) => {
            const busy = workingPhoto.includes(photo.id)
            return (
              <tr key={photo.id}>
                <td>{photo.photo_date}</td>
                <td>{PHOTO_LABELS[photo.photo_type] || photo.photo_type}</td>
                <td>{photo.file_name}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" disabled={busy} onClick={() => onPreview(photo)}>查看</button>
                    <button type="button" disabled={busy} onClick={() => onDelete(photo)} style={{ color: '#b91c1c' }}>刪除</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function LongStayPanel({
  caseRow,
  photos,
  workingPhoto,
  onUpload,
  onPreview,
  onDelete,
}: {
  caseRow: CaseRow
  photos: PhotoRow[]
  workingPhoto: string
  onUpload: (date: string, file: File) => void
  onPreview: (photo: PhotoRow) => void
  onDelete: (photo: PhotoRow) => void
}) {
  const [date, setDate] = useState(today())
  const uploadedDates = new Set(photos.map((photo) => photo.photo_date))
  const start = new Date(`${caseRow.start_date}T00:00:00`)
  const target = new Date(`${date}T00:00:00`)
  const diff =
    Number.isNaN(start.getTime()) || Number.isNaN(target.getTime())
      ? 0
      : Math.floor((target.getTime() - start.getTime()) / 86400000) + 1
  const within = diff >= 1 && diff <= 10

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>每日照片上傳</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <span>
          {within ? `第 ${diff} 天` : '請選開始日後 10 天內日期'}
          {uploadedDates.has(date) ? '（已上傳，可先刪除後重拍）' : ''}
        </span>
        {!uploadedDates.has(date) && (
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={!within || Boolean(workingPhoto)}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) onUpload(date, file)
            }}
          />
        )}
      </div>

      <PhotoList
        photos={photos}
        workingPhoto={workingPhoto}
        onPreview={onPreview}
        onDelete={onDelete}
      />
    </div>
  )
}
