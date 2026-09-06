'use client'

import publicUi from '@/components/PublicPortal.module.css'
import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'

type Lot = { id: string; name: string }

type SubmitResult = {
  application_id: string
  status: string
  customer_code: string
  current_end_date?: string | null
  suggested_start_date: string
  suggested_end_date: string
  requested_months: number
  auto_waitlisted?: boolean
  waiting_no?: number | null
}

export default function PublicRenewalPage() {
  const [lots, setLots] = useState<Lot[]>([])
  const [parkingLotId, setParkingLotId] = useState('')
  const [customerCode, setCustomerCode] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [phone, setPhone] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  const [debugCode, setDebugCode] = useState('')
  const [verified, setVerified] = useState(false)
  const [requestedMonths, setRequestedMonths] = useState(1)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const response = await fetch('/api/public/renewal/parking-lots', {
          cache: 'no-store',
        })
        const data = await response.json()
        if (!response.ok) {
          setMessage(data?.error || '停車場資料讀取失敗。')
          return
        }
        const rows = data.lots || []
        setLots(rows)

        const params =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search)
            : new URLSearchParams()
        const requestedLotId = String(params.get('parking_lot_id') || '').trim()

        if (requestedLotId && rows.some((row: Lot) => row.id === requestedLotId)) {
          setParkingLotId(requestedLotId)
        } else if (rows.length === 1) {
          setParkingLotId(rows[0].id)
        }
      } catch (error: any) {
        setMessage(error?.message || '系統連線失敗。')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function requestOtp(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setVerified(false)
    setChallengeId('')
    setCode('')
    setDebugCode('')

    if (!parkingLotId || !customerCode.trim() || !vehiclePlate.trim()) {
      setMessage('請完整輸入停車場、客戶編號與車牌。')
      return
    }
    if (!/^09\d{8}$/.test(phone.replace(/\s+/g, ''))) {
      setMessage('請輸入原月租資料登記的手機號碼。')
      return
    }

    setSending(true)
    try {
      const response = await fetch('/api/public/renewal/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parking_lot_id: parkingLotId,
          customer_code: customerCode.trim(),
          vehicle_plate: vehiclePlate.trim(),
          phone: phone.replace(/\s+/g, ''),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setMessage(data?.error || '驗證碼發送失敗。')
        return
      }
      setChallengeId(data.challenge_id || '')
      setDebugCode(data.debug_code || '')
      setMessage('驗證碼已發送，請輸入 6 位數驗證碼。')
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setSending(false)
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    if (!challengeId || !/^\d{6}$/.test(code.trim())) {
      setMessage('請輸入 6 位數驗證碼。')
      return
    }

    setVerifying(true)
    try {
      const response = await fetch('/api/public/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_id: challengeId, code: code.trim() }),
      })
      const data = await response.json()
      if (!response.ok) {
        setMessage(data?.error || '驗證失敗。')
        return
      }
      setVerified(true)
      setMessage('手機驗證完成，請選擇希望續租月數。')
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setVerifying(false)
    }
  }

  async function submitRenewal(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    if (!verified) {
      setMessage('請先完成手機 OTP 驗證。')
      return
    }
    if (!privacyAgreed) {
      setMessage('請先同意個資告知與續租資料使用。')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/public/renewal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: challengeId,
          requested_months: requestedMonths,
          privacy_agreed: true,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setMessage(data?.error || '續租申請送出失敗。')
        return
      }
      setResult(data)
      setMessage('')
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className={publicUi.portal} style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <Link href="/apply">← 新月租申請</Link>
        <Link href="/status">查詢申請進度</Link>
      </div>

      <h1 style={{ marginBottom: 8 }}>既有月租戶線上續租</h1>
      <p style={{ color: '#64748b', lineHeight: 1.8 }}>
        請使用原月租資料中的「停車場、客戶編號、車牌、手機號碼」驗證身分。送出後仍由管理人員確認續租期間、費用與資格，再建立正式電子契約。
      </p>

      {result ? (
        <div
          style={{
            marginTop: 20,
            padding: 20,
            border: '1px solid #bbf7d0',
            borderRadius: 14,
            background: '#f0fdf4',
            lineHeight: 1.8,
          }}
        >
          <h2 style={{ marginTop: 0 }}>續租申請已送出</h2>
          <div>申請編號：<strong>{result.application_id}</strong></div>
          <div>客戶編號：<strong>{result.customer_code}</strong></div>
          <div>原到期日：<strong>{result.current_end_date || '—'}</strong></div>
          <div>希望續租：<strong>{result.requested_months} 個月</strong></div>
          <div>
            系統建議期間：<strong>{result.suggested_start_date} ～ {result.suggested_end_date}</strong>
          </div>
          {result.auto_waitlisted && (
            <div style={{ color: '#9a3412', marginTop: 8 }}>
              原月租已過期且目前名額已滿，本案已依場站規則轉候補
              {result.waiting_no ? `（順位 ${result.waiting_no}）` : ''}。
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <Link href={`/status?application_id=${encodeURIComponent(result.application_id)}`}>
              查詢這筆續租申請進度
            </Link>
          </div>
        </div>
      ) : (
        <>
          <form
            onSubmit={requestOtp}
            style={{
              marginTop: 20,
              padding: 20,
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              display: 'grid',
              gap: 14,
            }}
          >
            <label style={{ display: 'grid', gap: 6 }}>
              <strong>停車場</strong>
              <select
                value={parkingLotId}
                onChange={(e) => setParkingLotId(e.target.value)}
                disabled={loading || verified}
                style={{ padding: 11 }}
              >
                <option value="">請選擇</option>
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>{lot.name}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <strong>客戶編號</strong>
              <input
                value={customerCode}
                onChange={(e) => setCustomerCode(e.target.value)}
                disabled={verified}
                placeholder="例如：0445"
                autoComplete="off"
                style={{ padding: 11 }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <strong>車牌號碼</strong>
              <input
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                disabled={verified}
                placeholder="例如：ABC-1234"
                autoComplete="off"
                style={{ padding: 11 }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <strong>原月租登記手機</strong>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={verified}
                placeholder="例如：0912345678"
                inputMode="tel"
                autoComplete="tel"
                style={{ padding: 11 }}
              />
            </label>

            {!verified && (
              <button type="submit" disabled={sending || loading} style={{ padding: 12, fontWeight: 800 }}>
                {sending ? '發送中…' : '取得續租驗證碼'}
              </button>
            )}
          </form>

          {challengeId && !verified && (
            <form
              onSubmit={verifyOtp}
              style={{
                marginTop: 16,
                padding: 20,
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                borderRadius: 14,
                display: 'grid',
                gap: 12,
              }}
            >
              <label style={{ display: 'grid', gap: 6 }}>
                <strong>6 位數驗證碼</strong>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  style={{ padding: 11, fontSize: 20, letterSpacing: 4 }}
                />
              </label>
              {debugCode && (
                <div style={{ color: '#b45309' }}>
                  開發測試 OTP：<strong>{debugCode}</strong>
                </div>
              )}
              <button type="submit" disabled={verifying} style={{ padding: 12, fontWeight: 800 }}>
                {verifying ? '驗證中…' : '驗證手機'}
              </button>
            </form>
          )}

          {verified && (
            <form
              onSubmit={submitRenewal}
              style={{
                marginTop: 16,
                padding: 20,
                border: '1px solid #bbf7d0',
                background: '#f0fdf4',
                borderRadius: 14,
                display: 'grid',
                gap: 14,
              }}
            >
              <div style={{ color: '#166534', fontWeight: 800 }}>✓ 手機身分驗證完成</div>
              <label style={{ display: 'grid', gap: 6 }}>
                <strong>希望續租月數</strong>
                <select
                  value={requestedMonths}
                  onChange={(e) => setRequestedMonths(Number(e.target.value))}
                  style={{ padding: 11 }}
                >
                  {[1, 2, 3, 6, 12].map((months) => (
                    <option key={months} value={months}>{months} 個月</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, lineHeight: 1.7 }}>
                <input
                  type="checkbox"
                  checked={privacyAgreed}
                  onChange={(e) => setPrivacyAgreed(e.target.checked)}
                  style={{ marginTop: 5 }}
                />
                我同意系統以既有月租資料建立本次續租申請，並由管理單位確認最終租期、費用與契約內容。
              </label>
              <button type="submit" disabled={submitting} style={{ padding: 12, fontWeight: 800 }}>
                {submitting ? '送出中…' : '送出續租申請'}
              </button>
            </form>
          )}
        </>
      )}

      {!loading && !lots.length && !result && (
        <div style={{ marginTop: 16, padding: 14, background: '#f8fafc', borderRadius: 10 }}>
          目前沒有開放線上續租的停車場。
        </div>
      )}

      {message && (
        <div style={{ marginTop: 16, whiteSpace: 'pre-wrap', color: message.includes('完成') ? '#166534' : '#b45309' }}>
          {message}
        </div>
      )}
    </main>
  )
}
