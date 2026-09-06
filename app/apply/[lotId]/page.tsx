'use client'

import publicUi from '@/components/PublicPortal.module.css'
import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  qualificationHelpText,
  qualificationLabel,
  qualificationTypeForRentalType,
} from '@/lib/online-contracts/qualification'

type FormState = {
  applicant_name: string
  phone: string
  email: string
  vehicle_plate: string
  vehicle_type: string
  rental_type: string
  address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  privacy_agreed: boolean
}


type CapacityItem = {
  limit: number | null
  used: number
  remaining: number | null
  full: boolean
  waiting: number
}

type CapacitySnapshot = {
  auto_waitlist_when_full: boolean
  car: CapacityItem
  motorcycle: CapacityItem
  heavy_motorcycle: CapacityItem
}

function formatDateTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleString('zh-TW')
}

export default function PublicRentalApplyPage() {
  const params = useParams<{ lotId: string }>()
  const lotId = params?.lotId || ''

  const [lotName, setLotName] = useState('')
  const [lotLoading, setLotLoading] = useState(true)
  const [lotError, setLotError] = useState('')
  const [allowedRentalTypes, setAllowedRentalTypes] = useState<string[]>([])
  const [publicNote, setPublicNote] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [capacity, setCapacity] = useState<CapacitySnapshot | null>(null)
  const [autoWaitlisted, setAutoWaitlisted] = useState(false)
  const [waitingNo, setWaitingNo] = useState<number | null>(null)

  const [form, setForm] = useState<FormState>({
    applicant_name: '',
    phone: '',
    email: '',
    vehicle_plate: '',
    vehicle_type: 'car',
    rental_type: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    privacy_agreed: false,
  })

  const qualificationType = useMemo(
    () => qualificationTypeForRentalType(form.rental_type),
    [form.rental_type]
  )


  const selectedCapacity = useMemo(() => {
    if (!capacity) return null
    if (form.vehicle_type === 'motorcycle') return capacity.motorcycle
    if (form.vehicle_type === 'heavy_motorcycle') {
      return capacity.heavy_motorcycle
    }
    return capacity.car
  }, [capacity, form.vehicle_type])

  const [challengeId, setChallengeId] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpVerified, setOtpVerified] = useState(false)
  const [debugCode, setDebugCode] = useState('')
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [completed, setCompleted] = useState(false)
  const [applicationId, setApplicationId] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        setLotError('')
        const response = await fetch(
          `/api/public/parking-lots?id=${encodeURIComponent(lotId)}`,
          { cache: 'no-store' }
        )
        const result = await response.json()

        if (!response.ok) {
          setLotError(result?.error || '此停車場目前未開放線上月租申請。')
          return
        }

        const types = Array.isArray(result?.lot?.allowed_rental_types)
          ? result.lot.allowed_rental_types.filter(Boolean)
          : []

        setLotName(result?.lot?.name || '')
        setAllowedRentalTypes(types)
        setPublicNote(result?.lot?.public_note || '')
        setEndsAt(result?.lot?.ends_at || '')
        setCapacity(result?.lot?.capacity || null)

        if (types.length) {
          setForm((current) => ({
            ...current,
            rental_type: types.includes(current.rental_type)
              ? current.rental_type
              : types[0],
          }))
        }
      } catch (error: any) {
        setLotError(error?.message || '停車場資料讀取失敗。')
      } finally {
        setLotLoading(false)
      }
    })()
  }, [lotId])

  function setPhone(value: string) {
    setForm({ ...form, phone: value })
    setOtpVerified(false)
    setChallengeId('')
    setOtpCode('')
    setDebugCode('')
  }

  async function requestOtp() {
    setMessage('')

    if (!/^09\d{8}$/.test(form.phone.replace(/\s+/g, ''))) {
      setMessage('請輸入正確的 10 碼手機號碼。')
      return
    }

    if (lotError || !allowedRentalTypes.length) {
      setMessage('此停車場目前未開放線上月租申請。')
      return
    }

    setSendingOtp(true)

    try {
      const response = await fetch('/api/public/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parking_lot_id: lotId,
          phone: form.phone,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        setMessage(result?.error || '驗證碼發送失敗。')
        return
      }

      setChallengeId(result.challenge_id)
      setDebugCode(result.debug_code || '')
      setOtpVerified(false)
      setMessage('驗證碼已發送，請在 5 分鐘內完成驗證。')
    } catch (error: any) {
      setMessage(error?.message || '無法連線到驗證服務。')
    } finally {
      setSendingOtp(false)
    }
  }

  async function verifyOtp() {
    if (!challengeId || !/^\d{6}$/.test(otpCode)) {
      setMessage('請先取得驗證碼並輸入 6 位數驗證碼。')
      return
    }

    setMessage('')
    setVerifyingOtp(true)

    try {
      const response = await fetch('/api/public/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: challengeId,
          code: otpCode,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        setMessage(result?.error || '驗證失敗。')
        return
      }

      setOtpVerified(true)
      setMessage('手機驗證完成。')
    } catch (error: any) {
      setMessage(error?.message || '驗證服務連線失敗。')
    } finally {
      setVerifyingOtp(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage('')

    if (lotError || !allowedRentalTypes.length) {
      setMessage('此停車場目前未開放線上月租申請。')
      return
    }

    if (
      !form.applicant_name.trim() ||
      !form.phone.trim() ||
      !form.vehicle_plate.trim()
    ) {
      setMessage('請填寫姓名、手機及車牌。')
      return
    }

    if (!allowedRentalTypes.includes(form.rental_type)) {
      setMessage('請選擇目前開放的月租類型。')
      return
    }

    if (qualificationType === 'resident' && !form.address.trim()) {
      setMessage('里民／住戶月租申請請填寫聯絡地址。')
      return
    }

    if (!otpVerified || !challengeId) {
      setMessage('請先完成手機 OTP 驗證。')
      return
    }

    if (!form.privacy_agreed) {
      setMessage('請先閱讀並同意個資蒐集告知事項。')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/public/rental-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          parking_lot_id: lotId,
          otp_challenge_id: challengeId,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        setMessage(result?.error || '送出失敗。')
        return
      }

      setApplicationId(result.id || '')
      setAutoWaitlisted(Boolean(result.auto_waitlisted))
      setWaitingNo(result.waiting_no ? Number(result.waiting_no) : null)
      setCompleted(true)
      setMessage(
        result.auto_waitlisted
          ? '目前名額已滿，系統已自動為您登記候補。'
          : '申請已完成，請等待管理人員審核。'
      )
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setSaving(false)
    }
  }

  if (completed) {
    return (
      <main className={publicUi.portal} style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
        <div
          className={publicUi.resultCard}
          style={{
            padding: 24,
            border: '1px solid #bbf7d0',
            borderRadius: 14,
            background: '#f0fdf4',
          }}
        >
          <h1 style={{ marginTop: 0 }}>申請完成</h1>
          {lotName && (
            <p>
              停車場：<strong>{lotName}</strong>
            </p>
          )}
          {applicationId && (
            <p>
              申請編號：<strong>{applicationId}</strong>
            </p>
          )}
          {autoWaitlisted ? (
            <>
              <p>
                此車種目前月租名額已滿，系統已自動將您的申請加入候補名單。
              </p>
              {waitingNo && (
                <p>
                  目前候補順位：<strong>第 {waitingNo} 位</strong>
                </p>
              )}
              <p style={{ color: '#64748b', fontSize: 14 }}>
                有名額時由管理人員依候補流程轉正式，再發送電子簽約連結。
              </p>
            </>
          ) : (
            <>
              <p>
                您的月租申請已送出。審核通過後，系統會提供專屬線上簽約連結。
              </p>
              <p style={{ color: '#64748b', fontSize: 14 }}>
                如本月租類型需要資格確認，將由管理人員進行人工審核。
              </p>
            </>
          )}
          {applicationId && (
            <Link
              href={`/status?application_id=${encodeURIComponent(applicationId)}`}
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '10px 14px',
                borderRadius: 10,
                background: '#166534',
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 800,
              }}
            >
              查詢這筆申請進度
            </Link>
          )}
        </div>
      </main>
    )
  }

  if (!lotLoading && lotError) {
    return (
      <main className={publicUi.portal} style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
        <h1>月租停車線上申請</h1>
        <div
          style={{
            padding: 20,
            borderRadius: 12,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}
        >
          <strong>{lotError}</strong>
          <p style={{ color: '#64748b', marginBottom: 0 }}>
            請返回公開申請首頁查看目前已開放的停車場。
          </p>
          <p>
            <a href="/apply">返回月租線上申請首頁</a>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className={publicUi.portal} style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
      <h1>月租停車線上申請</h1>

      <div
        className={publicUi.lotHero}
        style={{
          padding: 14,
          background: '#f8fafc',
          borderRadius: 10,
          marginBottom: 18,
        }}
      >
        <div style={{ fontSize: 13, color: '#64748b' }}>申請停車場</div>
        <strong className={publicUi.lotName}>{lotLoading ? '讀取中…' : lotName || '停車場資料讀取失敗'}</strong>
        {publicNote && (
          <div style={{ marginTop: 8, color: '#475569', lineHeight: 1.6 }}>
            {publicNote}
          </div>
        )}
        {endsAt && (
          <div style={{ marginTop: 6, color: '#b45309', fontSize: 13 }}>
            本期申請截止：{formatDateTime(endsAt)}
          </div>
        )}
      </div>

      <p style={{ color: '#64748b' }}>
        手機驗證完成後才能送出申請。可申請的月租類型由停車場管理端設定，資格驗證方式由系統自動判斷。
      </p>

      {selectedCapacity && selectedCapacity.limit !== null && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            marginBottom: 16,
            background: selectedCapacity.full ? '#fff7ed' : '#f0fdf4',
            border: selectedCapacity.full
              ? '1px solid #fed7aa'
              : '1px solid #bbf7d0',
          }}
        >
          <strong>
            {selectedCapacity.full
              ? '此車種目前月租名額已滿'
              : `此車種目前剩餘 ${selectedCapacity.remaining} 名`}
          </strong>
          <div style={{ marginTop: 5, color: '#475569', fontSize: 14 }}>
            月租上限 {selectedCapacity.limit} 名，目前占用 {selectedCapacity.used} 名。
            {selectedCapacity.full && capacity?.auto_waitlist_when_full
              ? ' 仍可送出申請，送出後會自動登記候補。'
              : selectedCapacity.full
                ? ' 仍可送出申請，由管理人員審核後決定候補處理。'
                : ''}
          </div>
          {selectedCapacity.waiting > 0 && (
            <div style={{ marginTop: 4, color: '#64748b', fontSize: 13 }}>
              目前同車種候補：{selectedCapacity.waiting} 人
            </div>
          )}
        </div>
      )}

      <form className={publicUi.applicationForm} onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <label>
          姓名
          <input
            value={form.applicant_name}
            onChange={(e) => setForm({ ...form, applicant_name: e.target.value })}
            style={{ width: '100%', padding: 10 }}
          />
        </label>

        <label>
          手機
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              value={form.phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="numeric"
              placeholder="0912345678"
              style={{ flex: 1, padding: 10 }}
            />
            <button
              type="button"
              onClick={requestOtp}
              disabled={sendingOtp || otpVerified || lotLoading}
            >
              {otpVerified ? '已驗證' : sendingOtp ? '發送中…' : '發送驗證碼'}
            </button>
          </div>
        </label>

        {challengeId && !otpVerified && (
          <div style={{ padding: 14, background: '#eff6ff', borderRadius: 10 }}>
            <label>
              手機驗證碼
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  style={{ flex: 1, padding: 10 }}
                />
                <button type="button" onClick={verifyOtp} disabled={verifyingOtp}>
                  {verifyingOtp ? '驗證中…' : '確認驗證'}
                </button>
              </div>
            </label>

            {debugCode && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#9a3412' }}>
                開發測試驗證碼：<strong>{debugCode}</strong>
                （正式上線請關閉 OTP_DEV_MODE）
              </div>
            )}
          </div>
        )}

        <label>
          Email（選填）
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={{ width: '100%', padding: 10 }}
          />
        </label>

        <label>
          車牌
          <input
            value={form.vehicle_plate}
            onChange={(e) =>
              setForm({ ...form, vehicle_plate: e.target.value.toUpperCase() })
            }
            placeholder="ABC-1234"
            style={{ width: '100%', padding: 10 }}
          />
        </label>

        <label>
          車種
          <select
            value={form.vehicle_type}
            onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}
            style={{ width: '100%', padding: 10 }}
          >
            <option value="car">汽車</option>
            <option value="motorcycle">機車</option>
            <option value="heavy_motorcycle">重機</option>
          </select>
        </label>

        <label>
          月租類型
          <select
            value={form.rental_type}
            onChange={(e) => setForm({ ...form, rental_type: e.target.value })}
            style={{ width: '100%', padding: 10 }}
            disabled={!allowedRentalTypes.length}
          >
            {allowedRentalTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: qualificationType === 'none' ? '#f0fdf4' : '#fff7ed',
            border:
              qualificationType === 'none'
                ? '1px solid #bbf7d0'
                : '1px solid #fed7aa',
          }}
        >
          <strong>{qualificationLabel(qualificationType)}</strong>
          <div style={{ marginTop: 5, color: '#475569', fontSize: 14 }}>
            {qualificationHelpText(qualificationType)}
          </div>
        </div>

        <label>
          聯絡地址
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder={qualificationType === 'resident' ? '里民／住戶資格申請必填' : '選填'}
            style={{ width: '100%', padding: 10 }}
          />
        </label>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label>
            緊急聯絡人（選填）
            <input
              value={form.emergency_contact_name}
              onChange={(e) =>
                setForm({ ...form, emergency_contact_name: e.target.value })
              }
              style={{ width: '100%', padding: 10 }}
            />
          </label>

          <label>
            緊急聯絡電話（選填）
            <input
              value={form.emergency_contact_phone}
              onChange={(e) =>
                setForm({ ...form, emergency_contact_phone: e.target.value })
              }
              style={{ width: '100%', padding: 10 }}
            />
          </label>
        </div>

        <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, lineHeight: 1.7 }}>
          <strong>個人資料蒐集告知事項</strong>
          <p style={{ fontSize: 14 }}>
            智驛科技有限公司為辦理月租停車申請、資格審核、契約管理、通知及停車服務，
            蒐集姓名、聯絡電話、Email、車牌、地址及必要資格資料。資料僅於上述目的必要範圍內使用，
            並依公司資料保存政策及相關法令辦理保存與刪除。當事人得依法行使查詢、閱覽、補充、更正、
            停止蒐集、處理、利用及刪除等權利。正式商用前應由公司法務確認最終告知文字。
          </p>
          <label>
            <input
              type="checkbox"
              checked={form.privacy_agreed}
              onChange={(e) => setForm({ ...form, privacy_agreed: e.target.checked })}
            />{' '}
            我已閱讀並同意個資蒐集告知事項
          </label>
        </div>

        <button
          disabled={saving || !otpVerified || lotLoading || !allowedRentalTypes.length}
          type="submit"
          style={{ padding: 12, fontWeight: 700 }}
        >
          {saving ? '送出中…' : '送出申請'}
        </button>

        {message && <div>{message}</div>}
      </form>
    </main>
  )
}
