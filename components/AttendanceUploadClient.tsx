'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'

type Lot = { id: string; name: string }
type Role = 'supervisor' | 'manager'

type StaffName = {
  id: string
  parking_lot_id: string
  name: string
  is_active: boolean
}

type Row = {
  id: string
  parking_lot_id: string
  attendance_month: string
  file_name: string
  file_size: number | null
  staff_name: string | null
  uploaded_at: string
}

function previousMonthText() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())

  const year = Number(parts.find((x) => x.type === 'year')?.value || 0)
  const month = Number(parts.find((x) => x.type === 'month')?.value || 1)
  const date = new Date(year, month - 2, 1)

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function sizeText(n?: number | null) {
  if (!n) return '-'
  return n < 1024 * 1024
    ? `${(n / 1024).toFixed(1)} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function AttendanceUploadClient({
  parkingLots,
  defaultParkingLotId,
  role,
}: {
  parkingLots: Lot[]
  defaultParkingLotId?: string
  role: Role
}) {
  const fixedMonth = useMemo(() => previousMonthText(), [])
  const [lot, setLot] = useState(defaultParkingLotId || parkingLots[0]?.id || '')
  const [file, setFile] = useState<File | null>(null)
  const [staffNames, setStaffNames] = useState<StaffName[]>([])
  const [staffName, setStaffName] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [statusRows, setStatusRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const [historyMonth, setHistoryMonth] = useState('')
  const [historyName, setHistoryName] = useState('')

  const [newName, setNewName] = useState('')
  const [staffBusy, setStaffBusy] = useState(false)

  const lotMap = useMemo(
    () => new Map(parkingLots.map((x) => [x.id, x.name])),
    [parkingLots]
  )

  async function loadRows(
    targetLot = lot,
    monthFilter = historyMonth,
    nameFilter = historyName
  ) {
    if (!targetLot) {
      setRows([])
      return
    }

    const params = new URLSearchParams({ lot: targetLot })
    if (monthFilter) params.set('month', monthFilter)
    if (nameFilter) params.set('staffName', nameFilter)

    const response = await fetch(`/api/attendance/list?${params.toString()}`, {
      cache: 'no-store',
    })
    const json = await response.json()

    if (!response.ok) {
      setMessage(json.error || '讀取失敗')
      return
    }

    setRows(json.rows || [])
  }

  async function loadStatusRows(targetLot = lot) {
    if (!targetLot) {
      setStatusRows([])
      return
    }

    const params = new URLSearchParams({
      lot: targetLot,
      month: fixedMonth,
    })

    const response = await fetch(`/api/attendance/list?${params.toString()}`, {
      cache: 'no-store',
    })
    const json = await response.json()

    if (!response.ok) {
      setMessage(json.error || '上傳狀態讀取失敗')
      return
    }

    setStatusRows(json.rows || [])
  }

  async function loadStaffNames(targetLot = lot) {
    if (!targetLot) {
      setStaffNames([])
      setStaffName('')
      return
    }

    const response = await fetch(
      `/api/attendance/staff-names?lot=${encodeURIComponent(targetLot)}`,
      { cache: 'no-store' }
    )
    const json = await response.json()

    if (!response.ok) {
      setMessage(json.error || '管理員姓名讀取失敗')
      return
    }

    const names = (json.rows || []) as StaffName[]
    setStaffNames(names)

    setStaffName((current) =>
      names.some((x) => x.name === current) ? current : ''
    )
  }

  useEffect(() => {
    void loadRows(lot, '', '')
    void loadStatusRows(lot)
    void loadStaffNames(lot)
  }, [lot])

  async function upload() {
    if (!lot || !staffName || !file) {
      setMessage('請選擇停車場、管理員姓名與簽到表檔案。')
      return
    }

    setBusy(true)
    setMessage('正在上傳…')

    try {
      const fd = new FormData()
      fd.set('parkingLotId', lot)
      fd.set('attendanceMonth', fixedMonth)
      fd.set('staffName', staffName)
      fd.set('file', file)

      const response = await fetch('/api/attendance/upload', {
        method: 'POST',
        body: fd,
      })
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.error || '上傳失敗')
      }

      setMessage(
        `${staffName} 的 ${fixedMonth} 簽到表上傳完成。每次上傳都會獨立保留，不會覆蓋其他管理員的檔案。`
      )
      setFile(null)

      const input = document.getElementById(
        'attendance-file'
      ) as HTMLInputElement | null

      if (input) input.value = ''

      await Promise.all([loadRows(lot), loadStatusRows(lot)])
    } catch (error: any) {
      setMessage(`簽到表上傳失敗：${error?.message || '未知錯誤'}`)
    } finally {
      setBusy(false)
    }
  }

  async function addStaffName() {
    const name = newName.trim()
    if (!lot || !name || staffBusy) return

    setStaffBusy(true)
    setMessage('')

    try {
      const response = await fetch('/api/attendance/staff-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parkingLotId: lot, name }),
      })
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.error || '新增失敗')
      }

      setNewName('')
      setMessage(`已新增管理員姓名：${name}`)
      await loadStaffNames(lot)
    } catch (error: any) {
      setMessage(error?.message || '新增管理員姓名失敗')
    } finally {
      setStaffBusy(false)
    }
  }

  async function removeStaffName(row: StaffName) {
    if (staffBusy) return
    if (
      !window.confirm(
        `確定停用「${row.name}」？\n\n歷史簽到紀錄不會刪除，只是不再出現在之後的上傳姓名清單。`
      )
    ) {
      return
    }

    setStaffBusy(true)
    setMessage('')

    try {
      const response = await fetch('/api/attendance/staff-names', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      })
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.error || '停用失敗')
      }

      setMessage(`已停用管理員姓名：${row.name}`)
      await loadStaffNames(lot)
    } catch (error: any) {
      setMessage(error?.message || '停用管理員姓名失敗')
    } finally {
      setStaffBusy(false)
    }
  }

  const fixedMonthRows = statusRows.filter(
    (row) => row.attendance_month?.slice(0, 7) === fixedMonth
  )

  const submittedNames = new Set(
    fixedMonthRows.map((row) => row.staff_name).filter(Boolean)
  )

  return (
    <div style={{ paddingBottom: 40 }}>
      <h1>簽到表上傳</h1>
      <p className="muted">
        為避免月份誤傳，上傳月份由系統固定為「上個月」。例如 11 月登入時只能上傳 10 月簽到表；歷史紀錄仍可依月份與姓名搜尋。
      </p>

      <div className="card" style={{ marginTop: 18, maxWidth: 900 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
            gap: 14,
          }}
        >
          <div className="field">
            <label>停車場</label>
            <select
              value={lot}
              onChange={(event) => {
                setLot(event.target.value)
                setStaffName('')
                setHistoryName('')
              }}
            >
              <option value="">請選擇</option>
              {parkingLots.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>本次固定上傳月份</label>
            <input value={fixedMonth} readOnly />
          </div>

          <div className="field">
            <label>管理員姓名</label>
            <select
              value={staffName}
              onChange={(event) => setStaffName(event.target.value)}
            >
              <option value="">請選擇自己的名字</option>
              {staffNames.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!staffNames.length && lot && (
          <div className="muted" style={{ marginTop: 10 }}>
            此停車場尚未設定管理員姓名，請先由主管在下方「管理員姓名設定」新增。
          </div>
        )}

        <div className="field" style={{ marginTop: 14 }}>
          <label>簽到表檔案</label>
          <input
            id="attendance-file"
            type="file"
            accept=".pdf,.xls,.xlsx,.csv,image/jpeg,image/png,image/webp"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setFile(event.target.files?.[0] || null)
            }
          />
        </div>

        {file && (
          <div className="muted" style={{ marginTop: 8 }}>
            {file.name} · {sizeText(file.size)}
          </div>
        )}

        <button
          type="button"
          className="btn"
          onClick={upload}
          disabled={busy || !file || !lot || !staffName}
          style={{ marginTop: 16 }}
        >
          {busy ? '上傳中…' : `上傳 ${fixedMonth} 簽到表`}
        </button>

        {message && (
          <div
            style={{
              marginTop: 14,
              fontWeight: 700,
              whiteSpace: 'pre-wrap',
            }}
          >
            {message}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>{fixedMonth} 上傳狀態</h2>
        <div className="muted" style={{ marginBottom: 12 }}>
          不用開啟圖片即可查看目前停車場哪些管理員已上傳、哪些尚未上傳。
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {staffNames.map((item) => {
            const submitted = submittedNames.has(item.name)
            return (
              <span
                key={item.id}
                style={{
                  border: '1px solid #dbe3ec',
                  borderRadius: 999,
                  padding: '7px 11px',
                  fontWeight: 700,
                }}
              >
                {item.name}：{submitted ? '已上傳' : '未上傳'}
              </span>
            )
          })}

          {!staffNames.length && <span className="muted">尚未設定管理員姓名</span>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>歷史簽到表搜尋</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
            gap: 12,
          }}
        >
          <div className="field">
            <label>歷史月份</label>
            <input
              type="month"
              value={historyMonth}
              onChange={(event) => setHistoryMonth(event.target.value)}
            />
          </div>

          <div className="field">
            <label>管理員姓名</label>
            <select
              value={historyName}
              onChange={(event) => setHistoryName(event.target.value)}
            >
              <option value="">全部姓名</option>
              {staffNames.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 12,
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={() => void loadRows(lot, historyMonth, historyName)}
          >
            搜尋
          </button>
          <button
            type="button"
            onClick={() => {
              setHistoryMonth('')
              setHistoryName('')
              void loadRows(lot, '', '')
            }}
          >
            顯示全部歷史
          </button>
        </div>

        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table className="table" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>停車場</th>
                <th>月份</th>
                <th>管理員姓名</th>
                <th>檔名</th>
                <th>大小</th>
                <th>上傳時間</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{lotMap.get(row.parking_lot_id) || '-'}</td>
                  <td>{row.attendance_month?.slice(0, 7)}</td>
                  <td>
                    <strong>{row.staff_name || '舊資料未記姓名'}</strong>
                  </td>
                  <td>{row.file_name}</td>
                  <td>{sizeText(row.file_size)}</td>
                  <td>{new Date(row.uploaded_at).toLocaleString('zh-TW')}</td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>
                    目前沒有符合條件的資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {role === 'supervisor' && (
        <div className="card" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>管理員姓名設定（主管）</h2>
          <div className="muted">
            名字依停車場分類。管理員上傳時只會看到目前停車場已啟用的姓名清單。
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 12,
              alignItems: 'end',
            }}
          >
            <div className="field" style={{ minWidth: 260, margin: 0 }}>
              <label>新增管理員姓名</label>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="例如：王小明"
              />
            </div>

            <button
              type="button"
              className="btn"
              disabled={!lot || !newName.trim() || staffBusy}
              onClick={() => void addStaffName()}
            >
              新增到目前停車場
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 14,
            }}
          >
            {staffNames.map((item) => (
              <span
                key={item.id}
                style={{
                  border: '1px solid #dbe3ec',
                  borderRadius: 10,
                  padding: '8px 10px',
                }}
              >
                <strong>{item.name}</strong>{' '}
                <button
                  type="button"
                  disabled={staffBusy}
                  onClick={() => void removeStaffName(item)}
                  style={{ marginLeft: 6 }}
                >
                  停用
                </button>
              </span>
            ))}

            {!staffNames.length && (
              <span className="muted">目前停車場尚未設定姓名。</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
