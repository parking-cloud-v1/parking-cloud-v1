'use client'

import publicUi from '@/components/PublicPortal.module.css'
import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'

type StatusResult = {
  application: {
    id: string
    application_kind?: string
    renewal_requested_months?: number | null
    renewal_current_end_date?: string | null
    renewal_suggested_start_date?: string | null
    renewal_suggested_end_date?: string | null
    applicant_name: string
    parking_lot_name: string
    vehicle_plate: string
    vehicle_type: string
    rental_type: string
    qualification_status: string
    qualification_label: string
    status: string
    status_label: string
    status_message: string
    created_at: string
    updated_at: string
    supplement_note?: string | null
    supplement_expires_at?: string | null
    rejection_note?: string | null
  }
  waiting?: {
    wait_no: number
    registered_date?: string | null
    status?: string | null
    offer_status?: string | null
    offer_expires_at?: string | null
    offer_notified_at?: string | null
    offer_responded_at?: string | null
  } | null
  contract?: {
    id?: string | null
    contract_no?: string | null
    customer_code?: string | null
    status?: string | null
    start_date?: string | null
    end_date?: string | null
    monthly_fee?: number | null
    signed_at?: string | null
    sign_token_expires_at?: string | null
    sign_invitation_status?: string | null
    archive_download_available?: boolean
    archive_pdf_available?: boolean
  } | null
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleString('zh-TW')
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  return value.slice(0, 10)
}

function vehicleTypeLabel(value: string) {
  if (value === 'motorcycle') return '機車'
  if (value === 'heavy_motorcycle') return '重機'
  return '汽車'
}

export default function PublicApplicationStatusPage() {
  const [applicationId, setApplicationId] = useState('')
  const [phone, setPhone] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  const [debugCode, setDebugCode] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<StatusResult | null>(null)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('application_id')
    if (id) setApplicationId(id)
  }, [])

  async function requestOtp(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setResult(null)
    setDebugCode('')

    if (!applicationId.trim()) {
      setMessage('請輸入申請編號。')
      return
    }

    if (!/^09\d{8}$/.test(phone.replace(/\s+/g, ''))) {
      setMessage('請輸入申請時使用的手機號碼。')
      return
    }

    setSending(true)

    try {
      const response = await fetch(
        '/api/public/application-status/request-otp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: applicationId.trim(),
            phone: phone.replace(/\s+/g, ''),
          }),
        }
      )

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

  async function verifyAndQuery(event: FormEvent) {
    event.preventDefault()
    setMessage('')

    if (!challengeId) {
      setMessage('請先取得驗證碼。')
      return
    }

    if (!/^\d{6}$/.test(code.trim())) {
      setMessage('請輸入 6 位數驗證碼。')
      return
    }

    setChecking(true)

    try {
      const response = await fetch(
        '/api/public/application-status/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: applicationId.trim(),
            challenge_id: challengeId,
            code: code.trim(),
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        setMessage(data?.error || '查詢驗證失敗。')
        return
      }

      setResult({
        application: data.application,
        waiting: data.waiting || null,
        contract: data.contract || null,
      })
      setMessage('')
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setChecking(false)
    }
  }

  function resetQuery() {
    setChallengeId('')
    setCode('')
    setDebugCode('')
    setResult(null)
    setMessage('')
  }

  return (
    <main className={publicUi.portal} style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
      <div style={{ marginBottom: 18 }}>
        <Link href="/apply" style={{ color: '#2563eb' }}>
          ← 返回月租線上申請
        </Link>
      </div>

      <h1 style={{ marginBottom: 8 }}>月租申請進度查詢</h1>
      <p style={{ color: '#64748b', lineHeight: 1.7 }}>
        請使用「申請編號＋申請時手機號碼」取得一次性驗證碼。驗證完成後才會顯示案件進度。
      </p>

      {!result && (
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
              <strong>申請編號</strong>
              <input
                value={applicationId}
                onChange={(event) => setApplicationId(event.target.value)}
                placeholder="例如：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                autoComplete="off"
                style={{ padding: 11 }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <strong>申請時手機號碼</strong>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="例如：0912345678"
                inputMode="tel"
                autoComplete="tel"
                style={{ padding: 11 }}
              />
            </label>

            <button
              type="submit"
              disabled={sending}
              style={{ padding: 12, fontWeight: 800 }}
            >
              {sending ? '發送中…' : challengeId ? '重新取得驗證碼' : '取得查詢驗證碼'}
            </button>
          </form>

          {challengeId && (
            <form
              onSubmit={verifyAndQuery}
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
                    background: '#fff7ed',
                    borderRadius: 8,
                    color: '#9a3412',
                  }}
                >
                  開發測試碼：<strong>{debugCode}</strong>
                </div>
              )}

              <button
                type="submit"
                disabled={checking}
                style={{ padding: 12, fontWeight: 800 }}
              >
                {checking ? '查詢中…' : '驗證並查詢進度'}
              </button>
            </form>
          )}
        </>
      )}

      {message && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            background: '#f8fafc',
          }}
        >
          {message}
        </div>
      )}

      {result && (
        <div style={{ display: 'grid', gap: 16, marginTop: 22 }}>
          <section
            style={{
              padding: 22,
              borderRadius: 14,
              border: '1px solid #cbd5e1',
              background: '#fff',
            }}
          >
            <div style={{ color: '#64748b', fontSize: 14 }}>目前進度</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>
              {result.application.status_label}
            </div>
            <p style={{ lineHeight: 1.8, marginBottom: 0 }}>
              {result.application.status_message}
            </p>
          </section>

          <section
            style={{
              padding: 20,
              borderRadius: 14,
              border: '1px solid #e2e8f0',
            }}
          >
            <h2 style={{ marginTop: 0 }}>申請資料</h2>
            <div style={{ display: 'grid', gap: 9, lineHeight: 1.6 }}>
              <div>申請編號：{result.application.id}</div>
              <div>
                申請類型：
                <strong style={{ color: result.application.application_kind === 'renewal' ? '#166534' : undefined }}>
                  {result.application.application_kind === 'renewal' ? '既有月租續租' : '新月租申請'}
                </strong>
              </div>
              <div>停車場：{result.application.parking_lot_name}</div>
              <div>申請人：{result.application.applicant_name}</div>
              <div>車牌：{result.application.vehicle_plate}</div>
              <div>車種：{vehicleTypeLabel(result.application.vehicle_type)}</div>
              <div>月租類型：{result.application.rental_type}</div>
              <div>資格狀態：{result.application.qualification_label}</div>
              <div>送件時間：{formatDateTime(result.application.created_at)}</div>
              <div>最後更新：{formatDateTime(result.application.updated_at)}</div>
            </div>
          </section>

          {result.application.status === 'needs_revision' && (
            <section
              style={{
                padding: 20,
                borderRadius: 14,
                border: '1px solid #fed7aa',
                background: '#fff7ed',
              }}
            >
              <h2 style={{ marginTop: 0 }}>補件內容</h2>
              <div style={{ lineHeight: 1.8 }}>
                {result.application.supplement_note || '請依簡訊通知完成補件。'}
              </div>
              <div style={{ marginTop: 8, color: '#9a3412' }}>
                補件期限：{formatDateTime(result.application.supplement_expires_at)}
              </div>
            </section>
          )}

          {result.application.status === 'rejected' &&
            result.application.rejection_note && (
              <section
                style={{
                  padding: 20,
                  borderRadius: 14,
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                }}
              >
                <h2 style={{ marginTop: 0 }}>審核說明</h2>
                <div style={{ lineHeight: 1.8 }}>
                  {result.application.rejection_note}
                </div>
              </section>
            )}

          {result.application.application_kind === 'renewal' && (
            <div
              style={{
                marginTop: 16,
                padding: 16,
                border: '1px solid #bbf7d0',
                background: '#f0fdf4',
                borderRadius: 12,
              }}
            >
              <strong>續租申請資料</strong>
              <div style={{ marginTop: 8, lineHeight: 1.8 }}>
                希望續租：{result.application.renewal_requested_months || '—'} 個月
                <br />
                原到期日：{formatDate(result.application.renewal_current_end_date)}
                <br />
                系統建議期間：
                {formatDate(result.application.renewal_suggested_start_date)} ～ {formatDate(result.application.renewal_suggested_end_date)}
              </div>
            </div>
          )}

          {result.waiting && (
            <section
              style={{
                padding: 20,
                borderRadius: 14,
                border: '1px solid #fde68a',
                background: '#fffbeb',
              }}
            >
              <h2 style={{ marginTop: 0 }}>候補資訊</h2>
              <div style={{ fontSize: 24, fontWeight: 900 }}>
                目前候補順位：第 {result.waiting.wait_no} 位
              </div>
              <div style={{ marginTop: 8, color: '#92400e' }}>
                登記日期：{formatDate(result.waiting.registered_date)}
              </div>

              {result.waiting.offer_status === 'offered' && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 10,
                    background: '#fff7ed',
                    color: '#9a3412',
                    lineHeight: 1.7,
                  }}
                >
                  已有月租名額釋出，系統已寄出專屬遞補通知。請使用簡訊中的連結完成手機 OTP 回覆。
                  <br />
                  回覆期限：{formatDateTime(result.waiting.offer_expires_at)}
                </div>
              )}

              {result.waiting.offer_status === 'accepted' && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 10,
                    background: '#f0fdf4',
                    color: '#166534',
                    lineHeight: 1.7,
                  }}
                >
                  您已確認接受本次遞補名額，目前等待管理人員完成最終審核。
                  <br />
                  名額暫時保留至：{formatDateTime(result.waiting.offer_expires_at)}
                </div>
              )}
            </section>
          )}

          {result.contract && (
            <section
              style={{
                padding: 20,
                borderRadius: 14,
                border: '1px solid #bbf7d0',
                background: '#f0fdf4',
              }}
            >
              <h2 style={{ marginTop: 0 }}>契約資訊</h2>
              <div style={{ display: 'grid', gap: 8, lineHeight: 1.6 }}>
                <div>客戶編號：{result.contract.customer_code || '—'}</div>
                <div>契約編號：{result.contract.contract_no || '—'}</div>
                <div>
                  租期：{formatDate(result.contract.start_date)} ～{' '}
                  {formatDate(result.contract.end_date)}
                </div>
                <div>
                  月租金額：NT$ {Number(result.contract.monthly_fee || 0).toLocaleString('zh-TW')}
                </div>
                {result.contract.signed_at && (
                  <div>完成簽署：{formatDateTime(result.contract.signed_at)}</div>
                )}
                {!result.contract.signed_at &&
                  result.contract.sign_token_expires_at && (
                    <div>
                      簽約連結有效至：
                      {formatDateTime(result.contract.sign_token_expires_at)}
                    </div>
                  )}
              </div>

              {result.contract.signed_at &&
                result.contract.archive_download_available && (
                  <div style={{ marginTop: 16 }}>
                    {result.contract.archive_pdf_available ? (
                      <>
                        <a
                          href={`/api/public/application-status/contract-archive?application_id=${encodeURIComponent(applicationId.trim())}&challenge_id=${encodeURIComponent(challengeId)}`}
                          style={{ display: 'inline-block', padding: '11px 16px', borderRadius: 8, background: '#166534', color: '#fff', textDecoration: 'none', fontWeight: 800 }}
                        >
                          下載正式留存檔（PDF）
                        </a>
                        <div style={{ marginTop: 8, color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
                          此下載權限來自剛才的手機 OTP 驗證，短時間有效；下載檔案固定為正式 PDF。
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          background: '#f8fafc',
                          color: '#64748b',
                          fontSize: 13,
                        }}
                      >
                        此筆舊契約尚未建立正式 PDF，請聯絡管理人員。
                      </div>
                    )}
                  </div>
                )}
            </section>
          )}

          <button
            type="button"
            onClick={resetQuery}
            style={{ padding: 12, fontWeight: 800 }}
          >
            重新查詢
          </button>
        </div>
      )}
    </main>
  )
}
