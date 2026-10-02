'use client'

import { useEffect, useMemo, useState } from 'react'
import styles from './staff-leave.module.css'

type Item = {
  id: string
  staff_name: string
  parking_lot_name: string
  leave_date: string
  leave_type: string
  leave_shift: string | null
  substitute_name: string | null
  substitute_shift: string | null
  notes: string | null
  reminder_sent_at: string | null
  google_event_id: string | null
  google_calendar_synced_at: string | null
}

type RecognizedRow = {
  selected: boolean
  staff_name: string
  parking_lot_name: string
  leave_date: string
  leave_shift: string
  leave_type: string
  substitute_name: string
  substitute_shift: string
  notes: string
  confidence_note?: string
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result || '')
      resolve(value.includes(',') ? value.split(',')[1] : value)
    }
    reader.onerror = () => reject(reader.error || new Error('讀取照片失敗'))
    reader.readAsDataURL(file)
  })
}

export default function StaffLeaveClient() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    staff_name: '', parking_lot_name: '', leave_date: '', leave_shift: '', leave_type: '排休',
    substitute_name: '', substitute_shift: '', notes: '',
  })

  const [recognizeFiles, setRecognizeFiles] = useState<File[]>([])
  const [recognizeMonth, setRecognizeMonth] = useState('')
  const [recognizeStaff, setRecognizeStaff] = useState('')
  const [recognizeLot, setRecognizeLot] = useState('')
  const [recognizing, setRecognizing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [recognizedRows, setRecognizedRows] = useState<RecognizedRow[]>([])
  const [recognizeMessage, setRecognizeMessage] = useState('')

  async function load() {
    setLoading(true)
    const response = await fetch('/api/admin/staff-leave-notifications', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) setMessage(data.error || '讀取失敗')
    else setItems(data.items || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const today = useMemo(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }), [])
  const visibleItems = useMemo(() => items.filter((item) => item.leave_date >= today), [items, today])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setSaving(true)
    const response = await fetch('/api/admin/staff-leave-notifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await response.json()
    setSaving(false)
    if (!response.ok) return setMessage(data.error || '新增失敗')
    setForm({ staff_name: '', parking_lot_name: '', leave_date: '', leave_shift: '', leave_type: '排休', substitute_name: '', substitute_shift: '', notes: '' })
    setMessage('已新增休假通知並同步 Google Calendar')
    await load()
  }

  async function remove(id: string) {
    if (!confirm('確定刪除這筆休假通知？Google Calendar 對應行程也會一起刪除。')) return
    const response = await fetch(`/api/admin/staff-leave-notifications?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) return setMessage(data.error || '刪除失敗')
    await load()
  }

  async function recognizeSchedules() {
    setRecognizeMessage('')
    setRecognizedRows([])
    if (!recognizeMonth) return setRecognizeMessage('請先選擇班表月份')
    if (recognizeFiles.length === 0) return setRecognizeMessage('請先選擇班表照片')

    setRecognizing(true)
    const merged: RecognizedRow[] = []
    const errors: string[] = []

    for (const file of recognizeFiles) {
      try {
        const imageBase64 = await readFileAsBase64(file)
        const response = await fetch('/api/admin/staff-leave-recognize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: imageBase64,
            year_month: recognizeMonth,
            staff_name: recognizeStaff,
            parking_lot_name: recognizeLot,
          }),
        })
        const data = await response.json()
        if (!response.ok) {
          errors.push(`${file.name}：${data.error || '辨識失敗'}`)
          continue
        }
        for (const row of data.rows || []) {
          merged.push({ selected: true, ...row })
        }
      } catch (error) {
        errors.push(`${file.name}：${String(error instanceof Error ? error.message : error)}`)
      }
    }

    const deduped = new Map<string, RecognizedRow>()
    for (const row of merged) {
      const key = `${row.staff_name}|${row.parking_lot_name}|${row.leave_date}`
      if (!deduped.has(key)) deduped.set(key, row)
    }

    setRecognizedRows([...deduped.values()].sort((a, b) => a.leave_date.localeCompare(b.leave_date) || a.staff_name.localeCompare(b.staff_name)))
    setRecognizing(false)

    const okCount = deduped.size
    const parts = [`辨識完成：${okCount} 筆。請先確認，確認後才會匯入。`]
    if (errors.length) parts.push(...errors)
    setRecognizeMessage(parts.join('\n'))
  }

  function updateRecognized(index: number, key: keyof RecognizedRow, value: string | boolean) {
    setRecognizedRows(rows => rows.map((row, i) => i === index ? { ...row, [key]: value } : row))
  }

  async function importRecognized() {
    const selected = recognizedRows.filter(row => row.selected)
    if (selected.length === 0) return setRecognizeMessage('請至少勾選一筆要匯入的休假資料')
    if (!confirm(`確定匯入 ${selected.length} 筆休假資料並同步到 Google Calendar？`)) return

    setImporting(true)
    setRecognizeMessage('')
    let success = 0
    let skipped = 0
    const failed: string[] = []

    for (const row of selected) {
      const duplicate = items.some(item =>
        item.staff_name.trim() === row.staff_name.trim() &&
        item.parking_lot_name.trim() === row.parking_lot_name.trim() &&
        item.leave_date === row.leave_date
      )
      if (duplicate) {
        skipped += 1
        continue
      }

      const response = await fetch('/api/admin/staff-leave-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_name: row.staff_name,
          parking_lot_name: row.parking_lot_name,
          leave_date: row.leave_date,
          leave_shift: row.leave_shift || '全天',
          leave_type: row.leave_type || '排休',
          substitute_name: row.substitute_name || '',
          substitute_shift: row.substitute_shift || '',
          notes: row.notes || '由班表照片辨識後確認匯入',
        }),
      })
      const data = await response.json()
      if (response.ok) success += 1
      else failed.push(`${row.leave_date} ${row.staff_name}：${data.error || '匯入失敗'}`)
    }

    setImporting(false)
    await load()
    setRecognizeMessage([
      `匯入完成：成功 ${success} 筆${skipped ? `，重複略過 ${skipped} 筆` : ''}${failed.length ? `，失敗 ${failed.length} 筆` : ''}。`,
      ...failed,
    ].join('\n'))
  }

  return <div className={styles.page}>
    <div className={styles.header}>
      <div><div className={styles.eyebrow}>主管限定</div><h1>管理員休假／代班通知</h1><p>可手動登記，也可上傳班表照片自動辨識；確認後同步到 Google Calendar，主管可在 TimeTree 顯示。</p></div>
    </div>

    <section className={styles.card}>
      <h2>班表照片自動辨識</h2>
      <p style={{ marginTop: 0, color: '#64748b' }}>支援：月曆班表、TimeTree 月曆截圖、姓名 × 日期班表。系統只先產生辨識結果，主管確認後才匯入。</p>
      <div className={styles.formGrid}>
        <label>班表月份<input required type="month" value={recognizeMonth} onChange={e => setRecognizeMonth(e.target.value)} /></label>
        <label>管理員姓名（個人月曆用）<input placeholder="照片沒有姓名時先填" value={recognizeStaff} onChange={e => setRecognizeStaff(e.target.value)} /></label>
        <label>預設停車場（個人月曆用）<input placeholder="照片休假日沒有場站時先填" value={recognizeLot} onChange={e => setRecognizeLot(e.target.value)} /></label>
        <label>班表照片<input type="file" accept="image/*" multiple onChange={e => setRecognizeFiles(Array.from(e.target.files || []))} /></label>
        <div className={styles.wide}><button type="button" disabled={recognizing} onClick={recognizeSchedules}>{recognizing ? '辨識中…' : '開始辨識班表照片'}</button></div>
      </div>
      {recognizeFiles.length > 0 && <div style={{ marginTop: 10, fontSize: 14, color: '#475569' }}>已選 {recognizeFiles.length} 張：{recognizeFiles.map(file => file.name).join('、')}</div>}
      {recognizeMessage && <div className={styles.message} style={{ whiteSpace: 'pre-wrap' }}>{recognizeMessage}</div>}

      {recognizedRows.length > 0 && <div style={{ marginTop: 18 }}>
        <div className={styles.listTitle}><h2>辨識結果確認</h2><span>{recognizedRows.length} 筆</span></div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>匯入</th><th>日期</th><th>管理員</th><th>停車場</th><th>休假時段</th><th>類型</th><th>代班</th><th>代班時段</th><th>判斷方式</th></tr></thead>
            <tbody>{recognizedRows.map((row, index) => <tr key={`${row.staff_name}-${row.leave_date}-${index}`}>
              <td><input type="checkbox" checked={row.selected} onChange={e => updateRecognized(index, 'selected', e.target.checked)} /></td>
              <td><input type="date" value={row.leave_date} onChange={e => updateRecognized(index, 'leave_date', e.target.value)} /></td>
              <td><input value={row.staff_name} onChange={e => updateRecognized(index, 'staff_name', e.target.value)} /></td>
              <td><input value={row.parking_lot_name} onChange={e => updateRecognized(index, 'parking_lot_name', e.target.value)} /></td>
              <td><input value={row.leave_shift} onChange={e => updateRecognized(index, 'leave_shift', e.target.value)} /></td>
              <td><select value={row.leave_type} onChange={e => updateRecognized(index, 'leave_type', e.target.value)}><option>排休</option><option>特休</option><option>事假</option><option>病假</option><option>其他</option></select></td>
              <td><input placeholder="可留空" value={row.substitute_name} onChange={e => updateRecognized(index, 'substitute_name', e.target.value)} /></td>
              <td><input placeholder="可留空" value={row.substitute_shift} onChange={e => updateRecognized(index, 'substitute_shift', e.target.value)} /></td>
              <td style={{ minWidth: 120 }}>{row.confidence_note || '-'}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div style={{ marginTop: 14 }}><button type="button" disabled={importing} onClick={importRecognized}>{importing ? '匯入中…' : '確認匯入並同步 Google Calendar'}</button></div>
      </div>}
    </section>

    <section className={styles.card}>
      <h2>手動新增休假安排</h2>
      <form onSubmit={submit} className={styles.formGrid}>
        <label>休假管理員<input required placeholder="直接輸入管理員姓名" value={form.staff_name} onChange={e => setForm(v => ({...v, staff_name:e.target.value}))} /></label>
        <label>停車場<input required placeholder="直接輸入停車場名稱" value={form.parking_lot_name} onChange={e => setForm(v => ({...v, parking_lot_name:e.target.value}))} /></label>
        <label>休假日期<input required type="date" value={form.leave_date} onChange={e => setForm(v => ({...v, leave_date:e.target.value}))} /></label>
        <label>休假時段<input required placeholder="例如 08:00–17:00／早班／晚班" value={form.leave_shift} onChange={e => setForm(v => ({...v, leave_shift:e.target.value}))} /></label>
        <label>休假類型<select value={form.leave_type} onChange={e => setForm(v => ({...v, leave_type:e.target.value}))}><option>排休</option><option>特休</option><option>事假</option><option>病假</option><option>其他</option></select></label>
        <label>代班人員<input placeholder="尚未安排可留空" value={form.substitute_name} onChange={e => setForm(v => ({...v, substitute_name:e.target.value}))} /></label>
        <label>代班時段<input placeholder="例如 08:00–17:00" value={form.substitute_shift} onChange={e => setForm(v => ({...v, substitute_shift:e.target.value}))} /></label>
        <label className={styles.wide}>備註<input placeholder="可留空" value={form.notes} onChange={e => setForm(v => ({...v, notes:e.target.value}))} /></label>
        <div className={styles.wide}><button disabled={saving} type="submit">{saving ? '儲存中…' : '新增休假通知'}</button></div>
      </form>
      {message && <div className={styles.message}>{message}</div>}
    </section>

    <section className={styles.card}>
      <div className={styles.listTitle}><h2>即將休假</h2><span>{visibleItems.length} 筆</span></div>
      {loading ? <div className={styles.empty}>讀取中…</div> : visibleItems.length === 0 ? <div className={styles.empty}>目前沒有即將到來的休假安排。</div> : <div className={styles.tableWrap}><table><thead><tr><th>日期</th><th>場站</th><th>休假人員</th><th>休假時段</th><th>類型</th><th>代班</th><th>代班時段</th><th>Google Calendar</th><th></th></tr></thead><tbody>{visibleItems.map(item => <tr key={item.id}><td>{item.leave_date}</td><td>{item.parking_lot_name}</td><td>{item.staff_name}</td><td>{item.leave_shift || '-'}</td><td>{item.leave_type}</td><td className={!item.substitute_name ? styles.warn : ''}>{item.substitute_name || '⚠ 尚未安排'}</td><td>{item.substitute_shift || '-'}</td><td>{item.google_event_id ? <span className={styles.sent}>已同步</span> : <span className={styles.pending}>未同步</span>}</td><td><button className={styles.delete} onClick={() => remove(item.id)}>刪除</button></td></tr>)}</tbody></table></div>}
    </section>
  </div>
}
