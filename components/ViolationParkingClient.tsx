'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'

type CaseRow = {
  id: string
  parking_lot_id: string
  case_type: 'reserved_violation' | 'long_stay' | 'unplated'
  reserved_type: 'disabled' | 'parent_child' | null
  vehicle_plate: string | null
  location_text: string | null
  start_date: string
  notes: string | null
  status: string
  created_at: string
  violation_parking_photos?: PhotoRow[]
}

type PhotoRow = {
  id: string
  photo_type: string
  photo_date: string
  storage_path: string
  file_name: string
  uploaded_at: string
}

const today = () => new Date().toISOString().slice(0, 10)

export default function ViolationParkingClient({
  parkingLotId,
  parkingLotName,
}: {
  parkingLotId: string
  parkingLotName: string
}) {
  const [tab, setTab] = useState<'reserved_violation'|'long_stay'|'unplated'>('reserved_violation')
  const [rows, setRows] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [reservedType, setReservedType] = useState<'disabled'|'parent_child'>('disabled')
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
      const res = await fetch(`/api/violation-parking?lotId=${encodeURIComponent(parkingLotId)}`, {
        cache: 'no-store',
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || '讀取失敗')
      setRows(body.data || [])
    } catch (error: any) {
      setMessage(error?.message || '讀取失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
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
      const res = await fetch('/api/violation-parking', {
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

      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || '建立失敗')

      setPlate('')
      setLocationText('')
      setStartDate(today())
      setNotes('')
      setMessage('案件已建立，請接著上傳照片。')
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
    const form = new FormData()
    form.append('file', file)
    form.append('photoType', photoType)
    form.append('photoDate', photoDate)

    setMessage('照片上傳中…')
    const res = await fetch(`/api/violation-parking/${caseId}/photos`, {
      method: 'POST',
      body: form,
    })
    const body = await res.json()

    if (!res.ok) {
      setMessage(body?.error || '照片上傳失敗')
      return
    }

    setMessage('照片上傳完成。')
    await loadRows()
  }

  function photoCount(row: CaseRow, type: string) {
    return (row.violation_parking_photos || []).filter(
      (photo) => photo.photo_type === type
    ).length
  }

  function longStayDays(row: CaseRow) {
    return new Set(
      (row.violation_parking_photos || [])
        .filter((photo) => photo.photo_type === 'daily')
        .map((photo) => photo.photo_date)
    ).size
  }

  const title =
    tab === 'reserved_violation'
      ? '身障／婦幼違規停車'
      : tab === 'long_stay'
        ? '場內久停車'
        : '無牌車輛'

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

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>新增－{title}</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))',
            gap: 12,
          }}
        >
          {tab === 'reserved_violation' && (
            <div className="field">
              <label>違規類型</label>
              <select
                value={reservedType}
                onChange={(e) => setReservedType(e.target.value as any)}
              >
                <option value="disabled">身障車格違規</option>
                <option value="parent_child">婦幼車格違規</option>
              </select>
            </div>
          )}

          {tab !== 'unplated' && (
            <div className="field">
              <label>車牌</label>
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="ABC-1234"
              />
            </div>
          )}

          <div className="field">
            <label>{tab === 'long_stay' ? '開始追蹤日期' : '發現日期'}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          <div className="field">
            <label>位置／車格</label>
            <input
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              placeholder="例如 B2-035"
            />
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>備註</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <button
          className="btn"
          type="button"
          onClick={createCase}
          disabled={saving || !parkingLotId}
          style={{ marginTop: 14 }}
        >
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

        {!loading && filtered.length === 0 && (
          <div className="card">目前沒有此類案件。</div>
        )}

        {filtered.map((row) => {
          const photos = row.violation_parking_photos || []
          const days = longStayDays(row)

          return (
            <div className="card" key={row.id} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ fontSize: 18 }}>
                    {row.case_type === 'reserved_violation'
                      ? row.reserved_type === 'disabled'
                        ? '身障車格違規'
                        : '婦幼車格違規'
                      : row.case_type === 'long_stay'
                        ? '場內久停車'
                        : '無牌車輛'}
                  </strong>
                  <div className="muted" style={{ marginTop: 4 }}>
                    車牌：{row.vehicle_plate || '無牌'} ｜ 日期：{row.start_date} ｜ 位置：{row.location_text || '-'}
                  </div>
                </div>

                {row.case_type === 'long_stay' && (
                  <div style={{ fontWeight: 800, fontSize: 20 }}>
                    已完成 {days} / 10 天
                  </div>
                )}
              </div>

              {row.case_type === 'reserved_violation' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
                    gap: 10,
                    marginTop: 14,
                  }}
                >
                  {[
                    ['overview', '1. 車格和牌面全景照'],
                    ['center_window', '2. 置中全窗照片'],
                    ['right_window', '3. 右側全窗照片'],
                    ['left_window', '4. 左側全窗照片'],
                  ].map(([type, label]) => (
                    <PhotoUpload
                      key={type}
                      label={label}
                      done={photoCount(row, type) > 0}
                      disabled={photoCount(row, type) > 0}
                      onFile={(file) => uploadPhoto(row.id, type, row.start_date, file)}
                    />
                  ))}
                </div>
              )}

              {row.case_type === 'long_stay' && (
                <LongStayUpload
                  caseId={row.id}
                  startDate={row.start_date}
                  uploadedDates={new Set(
                    photos.filter((p) => p.photo_type === 'daily').map((p) => p.photo_date)
                  )}
                  onUpload={(date, file) => uploadPhoto(row.id, 'daily', date, file)}
                />
              )}

              {row.case_type === 'unplated' && (
                <div style={{ marginTop: 14 }}>
                  <PhotoUpload
                    label={`新增照片（目前 ${photoCount(row, 'general')} 張）`}
                    done={false}
                    disabled={false}
                    onFile={(file) => uploadPhoto(row.id, 'general', today(), file)}
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

function PhotoUpload({
  label,
  done,
  disabled,
  onFile,
}: {
  label: string
  done: boolean
  disabled: boolean
  onFile: (file: File) => void
}) {
  return (
    <label
      style={{
        display: 'block',
        border: '1px solid #cbd5e1',
        borderRadius: 10,
        padding: 12,
        background: done ? '#f0fdf4' : '#fff',
      }}
    >
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div className="muted" style={{ marginTop: 4 }}>
        {done ? '已上傳' : '尚未上傳'}
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
        style={{ marginTop: 8 }}
      />
    </label>
  )
}

function LongStayUpload({
  startDate,
  uploadedDates,
  onUpload,
}: {
  caseId: string
  startDate: string
  uploadedDates: Set<string>
  onUpload: (date: string, file: File) => void
}) {
  const [date, setDate] = useState(today())

  const start = new Date(`${startDate}T00:00:00`)
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
          {uploadedDates.has(date) ? '（已上傳）' : ''}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={!within || uploadedDates.has(date)}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onUpload(date, file)
          }}
        />
      </div>
    </div>
  )
}
