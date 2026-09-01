'use client'

import { useState } from 'react'

type ParkingLot = {
  id: string
  name: string
  status: string
}

type UserRole =
  | 'supervisor'
  | 'manager'
  | 'accountant'

export default function CreateUserForm({
  parkingLots,
}: {
  parkingLots: ParkingLot[]
}) {
  const [
    username,
    setUsername,
  ] =
    useState('')

  const [
    password,
    setPassword,
  ] =
    useState('')

  const [
    role,
    setRole,
  ] =
    useState<UserRole>(
      'manager'
    )

  const [
    selectedLots,
    setSelectedLots,
  ] =
    useState<string[]>(
      []
    )

  const [
    loading,
    setLoading,
  ] =
    useState(false)

  const [
    message,
    setMessage,
  ] =
    useState('')

  const [
    success,
    setSuccess,
  ] =
    useState(false)

  function toggleLot(
    id: string
  ) {
    setSelectedLots(
      (
        current
      ) =>
        current.includes(
          id
        )
          ? current.filter(
              (
                lotId
              ) =>
                lotId !==
                id
            )
          : [
              ...current,
              id,
            ]
    )
  }

  async function submit() {
    if (
      loading
    ) {
      return
    }

    setMessage('')
    setSuccess(false)

    const cleanUsername =
      username.trim()

    if (
      !cleanUsername
    ) {
      setMessage(
        '請輸入帳號'
      )

      return
    }

    if (
      password.length <
      8
    ) {
      setMessage(
        '密碼至少需要 8 碼'
      )

      return
    }

    if (
      role ===
        'manager' &&
      selectedLots.length ===
        0
    ) {
      setMessage(
        '場站管理員至少需要分配一個停車場'
      )

      return
    }

    setLoading(true)

    try {
      const response =
        await fetch(
          '/api/admin/users',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                username:
                  cleanUsername,

                password,

                role,

                /*
                 * 只有場站管理員
                 * 需要寫入停車場權限。
                 *
                 * 主管、會計都不綁定場站。
                 */
                parkingLotIds:
                  role ===
                  'manager'
                    ? selectedLots
                    : [],
              }),
          }
        )

      const data =
        await response.json()

      if (
        !response.ok
      ) {
        setMessage(
          data.error ||
            '建立帳號失敗'
        )

        return
      }

      setSuccess(
        true
      )

      const roleText =
        role ===
        'supervisor'
          ? '主管'
          : role ===
              'accountant'
            ? '會計'
            : '場站管理員'

      setMessage(
        `帳號 ${cleanUsername} 建立成功（${roleText}）`
      )

      setUsername('')
      setPassword('')
      setRole(
        'manager'
      )
      setSelectedLots(
        []
      )

      setTimeout(
        () => {
          window.location.reload()
        },
        800
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '系統連線失敗'
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  return (
    <div
      style={{
        border:
          '1px solid #e5e7eb',

        borderRadius:
          12,

        padding:
          18,

        marginTop:
          16,
      }}
    >
      <h3
        style={{
          marginTop:
            0,
        }}
      >
        新增帳號
      </h3>

      <div
        style={{
          display:
            'grid',

          gap:
            14,

          maxWidth:
            600,
        }}
      >
        <div>
          <label>
            帳號
          </label>

          <input
            value={
              username
            }
            onChange={(
              event
            ) =>
              setUsername(
                event
                  .target
                  .value
              )
            }
            placeholder="例如：jinlong02"
            autoComplete="off"
            style={{
              width:
                '100%',

              marginTop:
                6,

              padding:
                10,

              border:
                '1px solid #cbd5e1',

              borderRadius:
                8,
            }}
          />

          <div
            style={{
              marginTop:
                5,

              fontSize:
                13,

              color:
                '#64748b',
            }}
          >
            只需要輸入帳號，不需要 Email。
          </div>
        </div>

        <div>
          <label>
            密碼
          </label>

          <input
            type="password"
            value={
              password
            }
            onChange={(
              event
            ) =>
              setPassword(
                event
                  .target
                  .value
              )
            }
            placeholder="至少 8 碼"
            autoComplete="new-password"
            style={{
              width:
                '100%',

              marginTop:
                6,

              padding:
                10,

              border:
                '1px solid #cbd5e1',

              borderRadius:
                8,
            }}
          />
        </div>

        <div>
          <label>
            角色
          </label>

          <select
            value={
              role
            }
            onChange={(
              event
            ) => {
              const nextRole =
                event
                  .target
                  .value as UserRole

              setRole(
                nextRole
              )

              /*
               * 切到主管或會計時，
               * 清掉暫時勾選的場站。
               */
              if (
                nextRole !==
                'manager'
              ) {
                setSelectedLots(
                  []
                )
              }

              setMessage('')
              setSuccess(false)
            }}
            style={{
              width:
                '100%',

              marginTop:
                6,

              padding:
                10,

              border:
                '1px solid #cbd5e1',

              borderRadius:
                8,

              background:
                '#ffffff',
            }}
          >
            <option value="manager">
              場站管理員
            </option>

            <option value="supervisor">
              主管
            </option>

            <option value="accountant">
              會計
            </option>
          </select>
        </div>

        {role ===
          'manager' && (
          <div>
            <strong>
              分配停車場
            </strong>

            <div
              style={{
                marginTop:
                  8,

                border:
                  '1px solid #e5e7eb',

                borderRadius:
                  8,

                padding:
                  10,

                maxHeight:
                  260,

                overflowY:
                  'auto',

                display:
                  'grid',

                gap:
                  8,
              }}
            >
              {parkingLots.map(
                (
                  lot
                ) => (
                  <label
                    key={
                      lot.id
                    }
                    style={{
                      display:
                        'flex',

                      gap:
                        8,

                      alignItems:
                        'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedLots.includes(
                          lot.id
                        )
                      }
                      onChange={() =>
                        toggleLot(
                          lot.id
                        )
                      }
                    />

                    <span>
                      {
                        lot.name
                      }
                    </span>

                    {lot.status !==
                      'active' && (
                      <span
                        style={{
                          color:
                            '#64748b',
                        }}
                      >
                        （停用）
                      </span>
                    )}
                  </label>
                )
              )}

              {parkingLots.length ===
                0 && (
                <div
                  style={{
                    color:
                      '#64748b',

                    fontSize:
                      13,
                  }}
                >
                  目前沒有可分配的停車場。
                </div>
              )}
            </div>

            <div
              style={{
                marginTop:
                  6,

                fontSize:
                  13,

                color:
                  '#64748b',
              }}
            >
              場站管理員只能操作被分配的停車場。
            </div>
          </div>
        )}

        {role ===
          'supervisor' && (
          <div
            style={{
              padding:
                12,

              borderRadius:
                8,

              background:
                '#f8fafc',

              color:
                '#475569',

              fontSize:
                14,

              lineHeight:
                1.6,
            }}
          >
            主管不需要指定停車場，可管理全部停車場及系統設定。
          </div>
        )}

        {role ===
          'accountant' && (
          <div
            style={{
              padding:
                12,

              borderRadius:
                8,

              background:
                '#f0f9ff',

              color:
                '#075985',

              fontSize:
                14,

              lineHeight:
                1.6,

              border:
                '1px solid #bae6fd',
            }}
          >
            <strong>
              會計帳號
            </strong>

            <div
              style={{
                marginTop:
                  5,
              }}
            >
              不需要分配停車場。
            </div>

            <div>
              登入後只使用報表中心。
            </div>

            <div>
              可讀取所有停車場會計所需資料，但不提供現場資料修改權限。
            </div>
          </div>
        )}

        <div
          style={{
            display:
              'flex',

            gap:
              12,

            alignItems:
              'center',

            flexWrap:
              'wrap',
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={
              submit
            }
            disabled={
              loading
            }
          >
            {loading
              ? '建立中…'
              : '新增帳號'}
          </button>

          {message && (
            <span
              style={{
                color:
                  success
                    ? '#166534'
                    : '#b91c1c',

                fontWeight:
                  600,
              }}
            >
              {
                message
              }
            </span>
          )}
        </div>
      </div>
    </div>
  )
}