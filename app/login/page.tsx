'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function login(e: FormEvent) {
    e.preventDefault()

    setLoading(true)
    setError('')

    const loginAccount = account.trim().toLowerCase()

    // 舊主管帳號若輸入 Email，可直接登入
    // 未來員工只輸入帳號，例如 jinlong01
    const email = loginAccount.includes('@')
      ? loginAccount
      : `${loginAccount}@parking.local`

    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('帳號或密碼錯誤')
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>智驛停車營運雲端平台</h1>
        <p className="muted">新版 V1</p>

        <form onSubmit={login}>
          <div className="field">
            <label>帳號</label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="請輸入帳號"
              autoComplete="username"
              required
            />
          </div>

          <div className="field">
            <label>密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p style={{ color: '#b91c1c' }}>
              {error}
            </p>
          )}

          <button
            className="btn"
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? '登入中…' : '登入'}
          </button>
        </form>
      </div>
    </div>
  )
}