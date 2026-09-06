'use client'

import { useState } from 'react'

type ParkingLot = { id: string; name: string; status: string }
type AppRole = 'supervisor' | 'manager' | 'accountant'

export default function CreateUserForm({ parkingLots }: { parkingLots: ParkingLot[] }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AppRole>('manager')
  const [selectedLots, setSelectedLots] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  function toggleLot(id: string) {
    setSelectedLots((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    )
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setMessage('')
    if (!username.trim()) return setMessage('請輸入帳號。')
    if (password.length < 8) return setMessage('密碼至少需要 8 碼。')
    if (role === 'manager' && selectedLots.length === 0) {
      return setMessage('場站管理員至少需要分配 1 個停車場。')
    }

    setSaving(true)
    try {
      const response = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          role,
          parkingLotIds: role === 'manager' ? selectedLots : [],
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        setMessage(result?.error || '新增帳號失敗。')
        return
      }
      setMessage('帳號新增成功。')
      setUsername('')
      setPassword('')
      setSelectedLots([])
      setTimeout(() => window.location.reload(), 500)
    } catch (error: any) {
      setMessage(error?.message || '新增帳號失敗。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <div className="field">
          <label>帳號</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="例如 accounting01" />
        </div>
        <div className="field">
          <label>初始密碼</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 碼" />
        </div>
        <div className="field">
          <label>角色</label>
          <select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
            <option value="manager">場站管理員</option>
            <option value="supervisor">主管</option>
            <option value="accountant">會計（僅報表中心）</option>
          </select>
        </div>
      </div>

      {role === 'accountant' && (
        <div style={{ padding: 12, borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', fontSize: 14 }}>
          會計帳號不分配工作停車場，登入後只會進入「報表中心」，不會看到月租管理、計程車、防災或其他現場操作頁。
        </div>
      )}

      {role === 'manager' && (
        <div>
          <strong>可管理停車場</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, marginTop: 8 }}>
            {parkingLots.filter((lot) => lot.status === 'active').map((lot) => (
              <label key={lot.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <input type="checkbox" checked={selectedLots.includes(lot.id)} onChange={() => toggleLot(lot.id)} />
                {lot.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {message && <div style={{ color: message.includes('成功') ? '#166534' : '#b91c1c', fontWeight: 700 }}>{message}</div>}
      <div><button className="btn" disabled={saving}>{saving ? '建立中…' : '新增使用者'}</button></div>
    </form>
  )
}
