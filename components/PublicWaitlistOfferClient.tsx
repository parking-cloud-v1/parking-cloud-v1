'use client'

import publicUi from '@/components/PublicPortal.module.css'
import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'

type OfferInfo = {
  waiting_id: string
  application_id: string
  parking_lot_name: string
  applicant_name: string
  phone_masked: string
  vehicle_type: string
  vehicle_type_label: string
  vehicle_plate: string
  rental_type: string
  wait_no: number
  expires_at: string
  notified_at?: string | null
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleString('zh-TW')
}

export default function PublicWaitlistOfferClient({ token }: { token: string }) {
  const [offer, setOffer] = useState<OfferInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [responding, setResponding] = useState(false)
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  const [debugCode, setDebugCode] = useState('')
  const [message, setMessage] = useState('')
  const [done, setDone] = useState<'accept' | 'defer' | ''>('')
  const [holdExpiresAt, setHoldExpiresAt] = useState('')
  const [newWaitNo, setNewWaitNo] = useState<number | null>(null)

  useEffect(() => {
    loadOffer()
  }, [token])

  async function loadOffer() {
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch(
        `/api/public/waitlist-offer?token=${encodeURIComponent(token)}`,
        { cache: 'no-store' }
      )
      const data = await response.json()

      if (!response.ok) {
        setMessage(data?.error || '候補通知已失效。')
        return
      }

      setOffer(data.offer || null)
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setLoading(false)
    }
  }

  async function requestOtp(event?: FormEvent) {
    event?.preventDefault()
    setMessage('')
    setDebugCode('')
    setSending(true)

    try {
      const response = await fetch('/api/public/waitlist-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_otp',
          token,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setMessage(data?.error || '驗證碼發送失敗。')
        return
      }

      setChallengeId(data.challenge_id || '')
      setDebugCode(data.debug_code || '')
      setMessage('驗證碼已發送到原申請手機，請輸入 6 位數驗證碼。')
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setSending(false)
    }
  }

  async function respond(decision: 'accept' | 'defer') {
    setMessage('')

    if (!challengeId) {
      setMessage('請先取得手機驗證碼。')
      return
    }

    if (!/^\d{6}$/.test(code.trim())) {
      setMessage('請輸入 6 位數驗證碼。')
      return
    }

    setResponding(true)

    try {
      const response = await fetch('/api/public/waitlist-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'respond',
          token,
          challenge_id: challengeId,
          code: code.trim(),
          decision,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setMessage(data?.error || '候補回覆失敗。')
        return
      }

      setDone(decision)
      setHoldExpiresAt(data.hold_expires_at || '')
      setNewWaitNo(
        data.new_wait_no === null || data.new_wait_no === undefined
          ? null
          : Number(data.new_wait_no)
      )
      setMessage('')
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setResponding(false)
    }
  }

  if (loading) {
    return (
      <main className={publicUi.portal} style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
        <h1>候補名額確認</h1>
        <div className="card" style={{ marginTop: 18 }}>
          讀取候補通知中…
        </div>
      </main>
    )
  }

  if (done) {
    return (
      <main className={publicUi.portal} style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
        <section
          style={{
            padding: 24,
            border: '1px solid #bbf7d0',
            background: '#f0fdf4',
            borderRadius: 16,
          }}
        >
          <h1 style={{ marginTop: 0 }}>
            {done === 'accept' ? '已確認接受遞補' : '已保留候補資格'}
          </h1>
          {done === 'accept' ? (
            <p style={{ lineHeight: 1.8 }}>
              已收到您的確認。此名額目前暫時為您保留，管理人員會進行最後審核並建立電子契約。
              {holdExpiresAt && (
                <>
                  <br />
                  名額保留至：<strong>{formatDateTime(holdExpiresAt)}</strong>
                </>
              )}
            </p>
          ) : (
            <p style={{ lineHeight: 1.8 }}>
              您這次選擇暫不遞補，候補資格不會刪除，已移至同車種候補隊尾。
              {newWaitNo !== null && (
                <>
                  <br />
                  新候補順位：<strong>第 {newWaitNo} 位</strong>
                </>
              )}
            </p>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href={`/status${offer?.application_id ? `?application_id=${offer.application_id}` : ''}`}>
              查詢申請進度
            </Link>
            <Link href="/apply">返回月租線上申請</Link>
          </div>
        </section>
      </main>
    )
  }

  if (!offer) {
    return (
      <main className={publicUi.portal} style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
        <h1>候補名額確認</h1>
        <div
          style={{
            marginTop: 18,
            padding: 20,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            borderRadius: 14,
            color: '#991b1b',
          }}
        >
          {message || '候補通知不存在、已使用或已失效。'}
        </div>
        <div style={{ marginTop: 16 }}>
          <Link href="/status">前往申請進度查詢</Link>
        </div>
      </main>
    )
  }

  return (
    <main className={publicUi.portal} style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
      <div style={{ marginBottom: 18 }}>
        <Link href="/status" style={{ color: '#2563eb' }}>
          ← 申請進度查詢
        </Link>
      </div>

      <h1 style={{ marginBottom: 8 }}>候補名額釋出確認</h1>
      <p style={{ color: '#64748b', lineHeight: 1.7 }}>
        已輪到您的候補順位。為避免名額被其他案件占用，系統已暫時保留此名額；請於期限內完成手機 OTP 並確認是否接受遞補。
      </p>

      <section
        style={{
          marginTop: 20,
          padding: 22,
          border: '1px solid #fde68a',
          background: '#fffbeb',
          borderRadius: 16,
        }}
      >
        <div style={{ display: 'grid', gap: 9, lineHeight: 1.65 }}>
          <div>
            停車場：<strong>{offer.parking_lot_name}</strong>
          </div>
          <div>申請人：{offer.applicant_name}</div>
          <div>原申請手機：{offer.phone_masked}</div>
          <div>車種：{offer.vehicle_type_label}</div>
          <div>車牌：{offer.vehicle_plate}</div>
          <div>月租類型：{offer.rental_type}</div>
          <div>
            原候補順位：<strong>第 {offer.wait_no} 位</strong>
          </div>
          <div style={{ color: '#92400e' }}>
            回覆期限：<strong>{formatDateTime(offer.expires_at)}</strong>
          </div>
        </div>
      </section>

      <form
        onSubmit={requestOtp}
        style={{
          marginTop: 18,
          padding: 20,
          border: '1px solid #dbeafe',
          background: '#eff6ff',
          borderRadius: 14,
          display: 'grid',
          gap: 12,
        }}
      >
        <strong>手機身分確認</strong>
        <div style={{ color: '#475569', lineHeight: 1.6 }}>
          驗證碼只會發送到原申請手機，不可更改成其他號碼。
        </div>
        <button type="submit" disabled={sending} style={{ padding: 12, fontWeight: 800 }}>
          {sending ? '發送中…' : challengeId ? '重新取得 OTP' : '取得手機 OTP'}
        </button>

        {challengeId && (
          <>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>6 位數驗證碼</span>
              <input
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                style={{ padding: 11, letterSpacing: 4, fontSize: 18 }}
              />
            </label>
            {debugCode && (
              <div
                style={{
                  padding: 10,
                  borderRadius: 8,
                  background: '#fff7ed',
                  color: '#9a3412',
                }}
              >
                開發測試碼：<strong>{debugCode}</strong>
              </div>
            )}
          </>
        )}
      </form>

      {message && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            background: '#f8fafc',
            borderRadius: 10,
          }}
        >
          {message}
        </div>
      )}

      {challengeId && (
        <section
          style={{
            marginTop: 18,
            padding: 20,
            border: '1px solid #e2e8f0',
            borderRadius: 14,
          }}
        >
          <h2 style={{ marginTop: 0 }}>請選擇本次候補處理</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <button
              type="button"
              disabled={responding}
              onClick={() => respond('accept')}
              style={{ padding: 13, fontWeight: 900 }}
            >
              {responding ? '處理中…' : '接受本次遞補名額'}
            </button>
            <button
              type="button"
              disabled={responding}
              onClick={() => respond('defer')}
              style={{ padding: 13 }}
            >
              本次暫不遞補，保留候補資格
            </button>
          </div>
          <p style={{ color: '#64748b', lineHeight: 1.7, marginBottom: 0 }}>
            選擇「暫不遞補」不會刪除候補資料，但會移到同車種候補隊尾，讓下一位先遞補。
          </p>
        </section>
      )}
    </main>
  )
}
