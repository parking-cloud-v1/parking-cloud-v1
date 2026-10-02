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
export default function StaffLeaveClient() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    staff_name: '', parking_lot_name: '', leave_date: '', leave_shift: '', leave_type: '排休',
    substitute_name: '', substitute_shift: '', notes: '',
  })

  async function load() {
    setLoading(true)
    const response = await fetch('/api/admin/staff-leave-notifications', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) setMessage(data.error || '讀取失敗')
    else {
      setItems(data.items || [])
    }
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
    setMessage('已新增休假通知')
    await load()
  }

  async function remove(id: string) {
    if (!confirm('確定刪除這筆休假通知？')) return
    const response = await fetch(`/api/admin/staff-leave-notifications?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) return setMessage(data.error || '刪除失敗')
    await load()
  }

  return <div className={styles.page}>
    <div className={styles.header}>
      <div><div className={styles.eyebrow}>主管限定</div><h1>管理員休假／代班通知</h1><p>登記後會自動同步到 Google Calendar；主管可在 TimeTree 顯示這個 Google 行事曆。</p></div>
    </div>

    <section className={styles.card}>
      <h2>新增休假安排</h2>
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
