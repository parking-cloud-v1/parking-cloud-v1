'use client'

import { useMemo, useState } from 'react'

type Lot = {
  id: string
  name: string
}

type ModuleKey =
  | 'attendance'
  | 'dengue'
  | 'violation'
  | 'disaster'
  | 'shift'
  | 'taxi'

const MODULES: { key: ModuleKey; label: string; hasFile: boolean }[] = [
  { key: 'attendance', label: '簽到表', hasFile: true },
  { key: 'dengue', label: '登革熱照片／報表', hasFile: true },
  { key: 'violation', label: '違規停車照片', hasFile: true },
  { key: 'disaster', label: '防災照片', hasFile: true },
  { key: 'shift', label: '結班報表', hasFile: false },
  { key: 'taxi', label: '計程車折扣', hasFile: false },
]

function rowTitle(row: any) {
  return (
    row.file_name ||
    row.vehicle_plate ||
    row.operator_name ||
    row.work_type ||
    row.photo_type ||
    row.id
  )
}

function rowDate(row: any) {
  return (
    row.attendance_month ||
    row.work_date ||
    row.photo_date ||
    row.inspection_date ||
    row.closing_date ||
    row.discount_date ||
    row.uploaded_at ||
    row.created_at ||
    '-'
  )
}

function formatSize(value: unknown) {
  const bytes = Number(value || 0)

  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function DataMaintenanceClient({
  parkingLots,
}: {
  parkingLots: Lot[]
}) {
  const [module, setModule] = useState<ModuleKey>('attendance')
  const [lot, setLot] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const lotMap = useMemo(
    () => new Map(parkingLots.map((item) => [item.id, item.name])),
    [parkingLots]
  )

  const selectedModule = MODULES.find((item) => item.key === module)!

  async function search() {
    setBusy(true)
    setMessage('')

    try {
      const params = new URLSearchParams({ module })

      if (lot) params.set('lot', lot)
      if (from) params.set('from', from)
      if (to) params.set('to', to)

      const response = await fetch(
        `/api/admin/data-maintenance?${params.toString()}`,
        { cache: 'no-store' }
      )
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || '讀取失敗')
      }

      setRows(json?.rows || [])
      setMessage(`查詢完成，共 ${json?.rows?.length || 0} 筆。`)
    } catch (error: any) {
      setMessage(error?.message || '讀取失敗')
    } finally {
      setBusy(false)
    }
  }

  async function preview(row: any) {
    if (!selectedModule.hasFile) return

    try {
      const params = new URLSearchParams({
        module,
        action: 'preview',
        id: row.id,
      })

      const response = await fetch(
        `/api/admin/data-maintenance?${params.toString()}`,
        { cache: 'no-store' }
      )
      const json = await response.json()

      if (!response.ok || !json?.signedUrl) {
        throw new Error(json?.error || '預覽失敗')
      }

      window.open(json.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (error: any) {
      window.alert(error?.message || '預覽失敗')
    }
  }

  async function remove(row: any) {
    const confirmed = window.confirm(
      `確定永久刪除這筆「${selectedModule.label}」資料？\n\n${rowTitle(
        row
      )}\n\n若有 Storage 實體檔案，會一起清除。此操作無法復原。`
    )

    if (!confirmed) return

    setBusy(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/data-maintenance', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          module,
          id: row.id,
        }),
      })
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || '刪除失敗')
      }

      setRows((current) => current.filter((item) => item.id !== row.id))
      setMessage(
        json?.warning
          ? `資料紀錄已刪除；${json.warning}`
          : '刪除完成，相關 Storage 實體檔案已同步清除，並已寫入 system_logs。'
      )
    } catch (error: any) {
      setMessage(error?.message || '刪除失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <h1>資料維護</h1>
      <p className="muted">
        僅主管可使用。可查詢、預覽及永久刪除營運資料；正式電子合約、正式合約 PDF、簽名與客戶合約留存不在本頁刪除範圍。
      </p>

      <div className="card" style={{ marginTop: 18 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
            gap: 12,
          }}
        >
          <div className="field">
            <label>資料類型</label>
            <select
              value={module}
              onChange={(event) => {
                setModule(event.target.value as ModuleKey)
                setRows([])
                setMessage('')
              }}
            >
              {MODULES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>停車場</label>
            <select value={lot} onChange={(event) => setLot(event.target.value)}>
              <option value="">全部</option>
              {parkingLots.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>開始日期</label>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>

          <div className="field">
            <label>結束日期</label>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <button className="btn" type="button" onClick={search} disabled={busy}>
            {busy ? '處理中…' : '查詢資料'}
          </button>
          <button
            type="button"
            onClick={() => {
              setLot('')
              setFrom('')
              setTo('')
              setRows([])
              setMessage('')
            }}
          >
            清除條件
          </button>
        </div>

        {message && (
          <div style={{ marginTop: 12, fontWeight: 700, whiteSpace: 'pre-wrap' }}>
            {message}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>查詢結果（最多 200 筆）</h2>

        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>停車場</th>
                <th>日期</th>
                <th>資料</th>
                <th>大小</th>
                <th>操作</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{lotMap.get(row.parking_lot_id) || '-'}</td>
                  <td>{String(rowDate(row)).slice(0, 19)}</td>
                  <td>{rowTitle(row)}</td>
                  <td>{formatSize(row.file_size)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {selectedModule.hasFile && row.storage_path && (
                        <button type="button" onClick={() => preview(row)}>
                          預覽
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => remove(row)}
                        disabled={busy}
                        style={{
                          background: '#b91c1c',
                          color: '#fff',
                          border: 0,
                          borderRadius: 8,
                          padding: '8px 12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        永久刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>
                    請先查詢
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
