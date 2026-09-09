'use client'

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { createClient } from '@/lib/supabase/client'
import { getSavedWorkParkingLotId } from '@/components/useWorkParkingLot'

type ParkingLot = {
  id: string
  name: string
}

type AttendanceRow = {
  id: string
  parking_lot_id: string
  attendance_month: string
  file_name: string
  mime_type: string | null
  file_size: number | null
  uploaded_by: string | null
  uploaded_at: string
  updated_at: string
}

function previousMonthText() {
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function displayMonth(value: string) {
  return value ? value.slice(0, 7) : '-'
}

function normalizeFileName(value: string) {
  return String(value || '').trim().toLocaleLowerCase('zh-TW')
}

function formatSize(value?: number | null) {
  const size = Number(value || 0)

  if (!size) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`

  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

export default function MonthlyAttendancePage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [parkingLots, setParkingLots] = useState<ParkingLot[]>([])
  const [selectedLotId, setSelectedLotId] = useState('')
  const [month, setMonth] = useState(previousMonthText())
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadParkingLots()
  }, [])

  useEffect(() => {
    if (selectedLotId) {
      void loadRows(selectedLotId)
    } else {
      setRows([])
    }
  }, [selectedLotId])

  async function loadParkingLots() {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('parking_lots')
      .select('id, name')
      .eq('status', 'active')
      .order('name')

    if (error) {
      setMessage(`停車場讀取失敗：${error.message}`)
      setLoading(false)
      return
    }

    const lots = (data || []) as ParkingLot[]
    setParkingLots(lots)

    const workLotId = getSavedWorkParkingLotId()

    if (workLotId && lots.some((lot) => lot.id === workLotId)) {
      setSelectedLotId(workLotId)
    } else {
      setSelectedLotId('')
      setMessage('請先在左側「目前工作停車場」選擇停車場。')
    }

    setLoading(false)
  }

  async function loadRows(lotId: string) {
    setLoading(true)

    try {
      const response = await fetch(
        `/api/monthly-attendance?lot=${encodeURIComponent(lotId)}`,
        { cache: 'no-store' }
      )
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || '簽到表讀取失敗')
      }

      setRows((json?.rows || []) as AttendanceRow[])
    } catch (error: any) {
      setMessage(error?.message || '簽到表讀取失敗')
    } finally {
      setLoading(false)
    }
  }

  const currentLot = useMemo(
    () => parkingLots.find((lot) => lot.id === selectedLotId),
    [parkingLots, selectedLotId]
  )

  const duplicateRow = useMemo(() => {
    if (!file || !month) return undefined

    const targetName = normalizeFileName(file.name)

    return rows.find(
      (row) =>
        row.attendance_month.slice(0, 7) === month &&
        normalizeFileName(row.file_name) === targetName
    )
  }, [rows, month, file])

  const monthRows = useMemo(
    () => rows.filter((row) => row.attendance_month.slice(0, 7) === month),
    [rows, month]
  )

  async function saveAttendance(event: FormEvent) {
    event.preventDefault()

    if (saving) return

    setMessage('')

    if (!selectedLotId) {
      setMessage('請先選擇目前工作停車場')
      return
    }

    if (!month) {
      setMessage('請選擇簽到月份')
      return
    }

    if (!file) {
      setMessage('請選擇簽到表檔案')
      return
    }

    if (duplicateRow) {
      setMessage(
        `此月份已存在相同檔名「${file.name}」，系統已取消上傳，不會覆蓋舊檔案。`
      )
      return
    }

    setSaving(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('parkingLotId', selectedLotId)
      formData.append('attendanceMonth', month)

      const response = await fetch('/api/monthly-attendance/upload', {
        method: 'POST',
        body: formData,
      })
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || '簽到表上傳失敗')
      }

      setFile(null)

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      setMessage(`${month} 簽到表上傳完成，舊檔案均已保留。`)
      await loadRows(selectedLotId)
    } catch (error: any) {
      setMessage(error?.message || '上傳失敗')
    } finally {
      setSaving(false)
    }
  }

  async function openAttendance(row: AttendanceRow) {
    try {
      const response = await fetch(
        `/api/monthly-attendance?action=preview&id=${encodeURIComponent(row.id)}`,
        { cache: 'no-store' }
      )
      const json = await response.json()

      if (!response.ok || !json?.signedUrl) {
        throw new Error(json?.error || '檔案開啟失敗')
      }

      window.open(json.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (error: any) {
      window.alert(error?.message || '檔案開啟失敗')
    }
  }

  async function deleteAttendance(row: AttendanceRow) {
    const confirmed = window.confirm(
      `確定要刪除這份簽到表？\n\n月份：${displayMonth(
        row.attendance_month
      )}\n檔名：${row.file_name}\n\n刪除後無法復原。`
    )

    if (!confirmed) return

    try {
      const response = await fetch('/api/monthly-attendance', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: row.id }),
      })
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || '簽到表刪除失敗')
      }

      setRows((current) => current.filter((item) => item.id !== row.id))
      setMessage(
        json?.warning
          ? `簽到表紀錄已刪除；${json.warning}`
          : `已刪除「${row.file_name}」，Storage 實體檔案已同步清除。`
      )
    } catch (error: any) {
      setMessage(error?.message || '簽到表刪除失敗')
    }
  }

  const successMessage =
    message.includes('完成') ||
    message.includes('已刪除') ||
    message.includes('同步清除')

  return (
    <div style={{ paddingBottom: 40 }}>
      <div>
        <h1 style={{ marginTop: 0, marginBottom: 6 }}>每月簽到表</h1>
        <div className="muted">
          目前工作停車場：{currentLot?.name || '尚未選擇'}
        </div>
      </div>

      {!selectedLotId && (
        <div
          className="card"
          style={{
            marginTop: 20,
            background: '#fffbeb',
            color: '#b45309',
            fontWeight: 700,
          }}
        >
          請先在左側「目前工作停車場」選擇停車場。
        </div>
      )}

      <form onSubmit={saveAttendance}>
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>上傳簽到表</h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
              gap: 14,
            }}
          >
            <div className="field">
              <label>停車場</label>
              <select value={selectedLotId} disabled>
                {!selectedLotId && <option value="">尚未選擇</option>}
                {parkingLots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>簽到月份</label>
              <input
                type="month"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value)
                  setMessage('')
                }}
              />
            </div>

            <div className="field">
              <label>簽到表檔案</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,.jpg,.jpeg,.png,.webp"
                onChange={(event) => {
                  setFile(event.target.files?.[0] || null)
                  setMessage('')
                }}
              />
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 8,
              background: '#f0f9ff',
              color: '#075985',
            }}
          >
            同一月份可以上傳多份簽到表；系統不會覆蓋舊檔案。只有同一停車場、同一月份、檔名相同時會阻止重複上傳。單檔上限 20 MB。
          </div>

          {monthRows.length > 0 && (
            <div style={{ marginTop: 10, color: '#475569' }}>
              {month} 目前已有 <strong>{monthRows.length}</strong> 份簽到表。
            </div>
          )}

          {file && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 8,
                background: duplicateRow ? '#fee2e2' : '#f8fafc',
                color: duplicateRow ? '#b91c1c' : '#475569',
              }}
            >
              已選擇：<strong>{file.name}</strong>（{formatSize(file.size)}）
              {duplicateRow && (
                <div style={{ marginTop: 8, fontWeight: 700 }}>
                  此月份已有相同檔名，系統不會覆蓋原檔。
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn"
            disabled={
              saving || !selectedLotId || !file || Boolean(duplicateRow)
            }
            style={{ marginTop: 16 }}
          >
            {saving ? '上傳中…' : '新增簽到表'}
          </button>

          {message && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 8,
                background: successMessage ? '#ecfdf5' : '#fee2e2',
                color: successMessage ? '#166534' : '#b91c1c',
                whiteSpace: 'pre-wrap',
              }}
            >
              {message}
            </div>
          )}
        </div>
      </form>

      <div className="card" style={{ marginTop: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ margin: 0 }}>歷史簽到表</h2>
          <span className="muted">共 {rows.length} 份</span>
        </div>

        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table className="table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>月份</th>
                <th>停車場</th>
                <th>檔名</th>
                <th>大小</th>
                <th>上傳時間</th>
                <th>操作</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{displayMonth(row.attendance_month)}</td>
                  <td>{currentLot?.name || '-'}</td>
                  <td style={{ fontWeight: 700 }}>{row.file_name}</td>
                  <td>{formatSize(row.file_size)}</td>
                  <td>{new Date(row.uploaded_at).toLocaleString('zh-TW')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => openAttendance(row)}>
                        預覽
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAttendance(row)}
                        style={{ color: '#dc2626' }}
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>
                    目前沒有簽到表
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>
                    讀取中…
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
