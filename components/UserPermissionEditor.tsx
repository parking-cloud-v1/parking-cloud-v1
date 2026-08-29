'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ParkingLot = {
  id: string
  name: string
  status: string
}

type UserRow = {
  id: string
  display_name: string | null
  role: 'supervisor' | 'manager'
  is_active: boolean
  assigned_lot_ids: string[]
}

export default function UserPermissionEditor({
  user,
  parkingLots,
  currentUserId,
}: {
  user: UserRow
  parkingLots: ParkingLot[]
  currentUserId: string
}) {
  const [role, setRole] = useState(user.role)
  const [isActive, setIsActive] = useState(user.is_active)
  const [selectedLots, setSelectedLots] = useState<string[]>(
    user.assigned_lot_ids || []
  )
  const [saving, setSaving] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')

  const isCurrentUser = user.id === currentUserId

  function toggleLot(id: string) {
    setSelectedLots((current) =>
      current.includes(id)
        ? current.filter((lotId) => lotId !== id)
        : [...current, id]
    )
  }

  async function save() {
    setSaving(true)
    setMessage('')

    const supabase = createClient()

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        role,
        is_active: isCurrentUser ? true : isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (profileError) {
      setMessage('儲存失敗：' + profileError.message)
      setSaving(false)
      return
    }

    const { error: deleteError } = await supabase
      .from('user_parking_lots')
      .delete()
      .eq('user_id', user.id)

    if (deleteError) {
      setMessage('停車場權限更新失敗：' + deleteError.message)
      setSaving(false)
      return
    }

    if (role === 'manager' && selectedLots.length > 0) {
      const rows = selectedLots.map((parkingLotId) => ({
        user_id: user.id,
        parking_lot_id: parkingLotId,
      }))

      const { error: insertError } = await supabase
        .from('user_parking_lots')
        .insert(rows)

      if (insertError) {
        setMessage('停車場權限更新失敗：' + insertError.message)
        setSaving(false)
        return
      }
    }

    setMessage('已儲存')
    setSaving(false)

    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  async function changeActive(nextActive: boolean) {
    if (isCurrentUser) {
      setMessage('目前登入中的主管帳號不能停用自己。')
      return
    }

    const actionText = nextActive ? '啟用' : '停用'

    if (
      !window.confirm(
        `確定要${actionText}「${user.display_name || user.id}」嗎？`
      )
    ) {
      return
    }

    setStatusSaving(true)
    setMessage('')

    const supabase = createClient()

    const { error } = await supabase
      .from('profiles')
      .update({
        is_active: nextActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      setMessage(`${actionText}失敗：${error.message}`)
      setStatusSaving(false)
      return
    }

    setIsActive(nextActive)
    setStatusSaving(false)
    setMessage(`帳號已${actionText}`)
  }

  async function deleteUser() {
    if (isCurrentUser) {
      setMessage('目前登入中的主管帳號不能刪除自己。')
      return
    }

    const firstConfirm = window.confirm(
      `確定要永久刪除「${user.display_name || user.id}」嗎？\n\n若此帳號已有月租、計程車、防災或系統操作歷史，系統會拒絕刪除，請改用停用。`
    )

    if (!firstConfirm) {
      return
    }

    const typed = window.prompt(
      '請輸入「永久刪除」四個字確認：'
    )

    if (typed !== '永久刪除') {
      setMessage('已取消刪除。')
      return
    }

    setDeleting(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setMessage(result?.error || '刪除失敗。')
        return
      }

      setMessage('帳號已永久刪除。')

      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (error: any) {
      setMessage(
        '刪除失敗：' +
          (error?.message || '無法連線到刪除服務。')
      )
    } finally {
      setDeleting(false)
    }
  }

  const busy = saving || statusSaving || deleting

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
        marginTop: 12,
        background: isActive ? '#ffffff' : '#f8fafc',
        opacity: isActive ? 1 : 0.8,
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <strong>{user.display_name || user.id}</strong>

            {isCurrentUser && (
              <span
                style={{
                  marginLeft: 8,
                  color: '#2563eb',
                  fontSize: 13,
                }}
              >
                （目前登入帳號）
              </span>
            )}
          </div>

          <span
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              color: isActive ? '#166534' : '#991b1b',
              background: isActive ? '#dcfce7' : '#fee2e2',
            }}
          >
            {isActive ? '啟用中' : '已停用'}
          </span>
        </div>

        <div>
          <label>角色</label>
          <br />

          <select
            value={role}
            onChange={(e) =>
              setRole(
                e.target.value as 'supervisor' | 'manager'
              )
            }
            disabled={isCurrentUser}
            style={{
              marginTop: 6,
              padding: 8,
              minWidth: 180,
            }}
          >
            <option value="supervisor">主管</option>
            <option value="manager">場站管理員</option>
          </select>

          {isCurrentUser && (
            <div
              style={{
                marginTop: 6,
                color: '#64748b',
                fontSize: 13,
              }}
            >
              為避免把自己鎖在系統外，目前登入帳號不可直接更改角色。
            </div>
          )}
        </div>

        {role === 'manager' && (
          <div>
            <div style={{ marginBottom: 8 }}>
              <strong>可管理停車場</strong>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 8,
                maxHeight: 260,
                overflowY: 'auto',
                padding: 8,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
              }}
            >
              {parkingLots.map((lot) => (
                <label
                  key={lot.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedLots.includes(lot.id)}
                    onChange={() => toggleLot(lot.id)}
                  />

                  <span>{lot.name}</span>

                  {lot.status !== 'active' && (
                    <span style={{ color: '#64748b' }}>
                      （停用）
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <button
            onClick={save}
            disabled={busy}
            className="btn"
          >
            {saving ? '儲存中…' : '儲存設定'}
          </button>

          {!isCurrentUser &&
            (isActive ? (
              <button
                type="button"
                onClick={() => changeActive(false)}
                disabled={busy}
                style={{
                  padding: '8px 14px',
                  border: '1px solid #d97706',
                  borderRadius: 8,
                  background: '#fff7ed',
                  color: '#9a3412',
                }}
              >
                {statusSaving ? '處理中…' : '停用帳號'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => changeActive(true)}
                disabled={busy}
                style={{
                  padding: '8px 14px',
                  border: '1px solid #16a34a',
                  borderRadius: 8,
                  background: '#f0fdf4',
                  color: '#166534',
                }}
              >
                {statusSaving ? '處理中…' : '重新啟用'}
              </button>
            ))}

          {!isCurrentUser && (
            <button
              type="button"
              onClick={deleteUser}
              disabled={busy}
              style={{
                padding: '8px 14px',
                border: '1px solid #dc2626',
                borderRadius: 8,
                background: '#ffffff',
                color: '#b91c1c',
              }}
            >
              {deleting ? '刪除中…' : '永久刪除'}
            </button>
          )}
        </div>

        {message && (
          <div
            style={{
              padding: '9px 11px',
              borderRadius: 8,
              background:
                message.includes('已儲存') ||
                message.includes('已啟用') ||
                message.includes('已停用') ||
                message.includes('已永久刪除')
                  ? '#f0fdf4'
                  : '#fef2f2',
              color:
                message.includes('已儲存') ||
                message.includes('已啟用') ||
                message.includes('已停用') ||
                message.includes('已永久刪除')
                  ? '#166534'
                  : '#b91c1c',
              whiteSpace: 'pre-wrap',
            }}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  )
}
