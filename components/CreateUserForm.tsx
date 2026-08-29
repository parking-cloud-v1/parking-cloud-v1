'use client'

import { useState } from 'react'

type ParkingLot = {
  id: string
  name: string
  status: string
}

export default function CreateUserForm({
  parkingLots,
}: {
  parkingLots: ParkingLot[]
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'supervisor' | 'manager'>('manager')
  const [selectedLots, setSelectedLots] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)

  function toggleLot(id: string) {
    setSelectedLots((current) =>
      current.includes(id)
        ? current.filter((lotId) => lotId !== id)
        : [...current, id]
    )
  }

  async function submit() {
    setLoading(true)
    setMessage('')
    setSuccess(false)

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          role,
          parkingLotIds:
            role === 'manager' ? selectedLots : [],
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setMessage(data.error || '建立帳號失敗')
        setLoading(false)
        return
      }

      setSuccess(true)
      setMessage(`帳號 ${username} 建立成功`)

      setUsername('')
      setPassword('')
      setRole('manager')
      setSelectedLots([])

      setTimeout(() => {
        window.location.reload()
      }, 800)
    } catch {
      setMessage('系統連線失敗')
    }

    setLoading(false)
  }

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 18,
        marginTop: 16,
      }}
    >
      <h3 style={{ marginTop: 0 }}>新增帳號</h3>

      <div
        style={{
          display: 'grid',
          gap: 14,
          maxWidth: 600,
        }}
      >
        <div>
          <label>帳號</label>

          <input
            value={username}
            onChange={(e) =>
              setUsername(e.target.value)
            }
            placeholder="例如：jinlong02"
            style={{
              width: '100%',
              marginTop: 6,
              padding: 10,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
            }}
          />

          <div
            style={{
              marginTop: 5,
              fontSize: 13,
              color: '#64748b',
            }}
          >
            只需要輸入帳號，不需要 Email。
          </div>
        </div>

        <div>
          <label>密碼</label>

          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            placeholder="至少 8 碼"
            style={{
              width: '100%',
              marginTop: 6,
              padding: 10,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
            }}
          />
        </div>

        <div>
          <label>角色</label>

          <select
            value={role}
            onChange={(e) =>
              setRole(
                e.target.value as
                  | 'supervisor'
                  | 'manager'
              )
            }
            style={{
              width: '100%',
              marginTop: 6,
              padding: 10,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
            }}
          >
            <option value="manager">
              場站管理員
            </option>

            <option value="supervisor">
              主管
            </option>
          </select>
        </div>

        {role === 'manager' && (
          <div>
            <strong>分配停車場</strong>

            <div
              style={{
                marginTop: 8,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 10,
                maxHeight: 260,
                overflowY: 'auto',
                display: 'grid',
                gap: 8,
              }}
            >
              {parkingLots.map((lot) => (
                <label
                  key={lot.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedLots.includes(
                      lot.id
                    )}
                    onChange={() =>
                      toggleLot(lot.id)
                    }
                  />

                  <span>{lot.name}</span>

                  {lot.status !== 'active' && (
                    <span
                      style={{
                        color: '#64748b',
                      }}
                    >
                      （停用）
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <button
            className="btn"
            onClick={submit}
            disabled={loading}
          >
            {loading
              ? '建立中…'
              : '新增帳號'}
          </button>

          {message && (
            <span
              style={{
                marginLeft: 12,
                color: success
                  ? '#166534'
                  : '#b91c1c',
              }}
            >
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}