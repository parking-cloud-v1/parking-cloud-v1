'use client'

import publicUi from '@/components/PublicPortal.module.css'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Application = {
  id: string
  parking_lot_name: string
  applicant_name: string
  phone_masked: string
  email: string
  vehicle_plate: string
  vehicle_type: string
  rental_type: string
  address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  qualification_type: string
  supplement_note: string
  supplement_expires_at: string
}

export default function SupplementPage() {
  const params = useParams<{ token: string }>()
  const token = String(params?.token || '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  const [application, setApplication] = useState<Application | null>(null)

  const [form, setForm] = useState({
    applicant_name: '',
    email: '',
    vehicle_plate: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  })

  useEffect(() => {
    if (!token) return

    async function load() {
      setLoading(true)
      setMessage('')
      try {
        const response = await fetch(
          `/api/public/rental-applications/supplement?token=${encodeURIComponent(token)}`,
          { cache: 'no-store' }
        )
        const result = await response.json()
        if (!response.ok) {
          setMessage(result?.error || '補件連結無效。')
          return
        }

        const row = result.application as Application
        setApplication(row)
        setForm({
          applicant_name: row.applicant_name || '',
          email: row.email || '',
          vehicle_plate: row.vehicle_plate || '',
          address: row.address || '',
          emergency_contact_name: row.emergency_contact_name || '',
          emergency_contact_phone: row.emergency_contact_phone || '',
        })
      } catch (error: any) {
        setMessage(error?.message || '讀取補件資料失敗。')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [token])

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit() {
    if (!application) return
    if (!form.applicant_name.trim()) {
      setMessage('請填寫姓名。')
      return
    }
    if (!form.vehicle_plate.trim()) {
      setMessage('請填寫車牌。')
      return
    }
    if (
      application.qualification_type === 'resident' &&
      !form.address.trim()
    ) {
      setMessage('里民／住戶資格請填寫聯絡地址。')
      return
    }

    if (!window.confirm('確定送出補件資料？送出後會重新進入後台審核。')) {
      return
    }

    setSaving(true)
    setMessage('')
    try {
      const response = await fetch(
        '/api/public/rental-applications/supplement',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, ...form }),
        }
      )
      const result = await response.json()
      if (!response.ok) {
        setMessage(result?.error || '補件送出失敗。')
        return
      }
      setDone(true)
      setMessage(result?.message || '補件資料已送出。')
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main
      className={publicUi.portal}
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: '32px 18px 60px',
      }}
    >
      <h1 style={{ marginBottom: 6 }}>月租申請補件</h1>
      <p style={{ color: '#64748b', marginTop: 0 }}>
        智驛科技有限公司｜請依審核通知補正資料
      </p>

      {loading && <div className="card">資料讀取中…</div>}

      {!loading && message && !application && (
        <div className="card" style={{ color: '#b91c1c' }}>
          {message}
        </div>
      )}

      {application && (
        <>
          <div className="card" style={{ marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>補件通知</h2>
            <div
              style={{
                padding: 14,
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                borderRadius: 8,
                whiteSpace: 'pre-wrap',
                lineHeight: 1.7,
              }}
            >
              {application.supplement_note || '請依通知確認並補正申請資料。'}
            </div>
            <p style={{ marginBottom: 0 }}>
              補件期限：
              <strong>
                {new Date(application.supplement_expires_at).toLocaleString(
                  'zh-TW'
                )}
              </strong>
            </p>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>原申請資訊</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
                gap: 12,
              }}
            >
              <div>
                停車場<br />
                <strong>{application.parking_lot_name}</strong>
              </div>
              <div>
                手機（已完成 OTP，不可在補件頁修改）<br />
                <strong>{application.phone_masked}</strong>
              </div>
              <div>
                車種<br />
                <strong>{application.vehicle_type}</strong>
              </div>
              <div>
                月租類型<br />
                <strong>{application.rental_type}</strong>
              </div>
            </div>
          </div>

          {!done && (
            <div className="card" style={{ marginTop: 20 }}>
              <h2 style={{ marginTop: 0 }}>補正資料</h2>
              <div style={{ display: 'grid', gap: 14 }}>
                <label>
                  姓名 *
                  <input
                    value={form.applicant_name}
                    onChange={(e) => setField('applicant_name', e.target.value)}
                    style={{ width: '100%', padding: 10, marginTop: 5 }}
                  />
                </label>

                <label>
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    style={{ width: '100%', padding: 10, marginTop: 5 }}
                  />
                </label>

                <label>
                  車牌 *
                  <input
                    value={form.vehicle_plate}
                    onChange={(e) => setField('vehicle_plate', e.target.value)}
                    style={{ width: '100%', padding: 10, marginTop: 5 }}
                  />
                </label>

                <label>
                  聯絡／資格地址
                  <input
                    value={form.address}
                    onChange={(e) => setField('address', e.target.value)}
                    style={{ width: '100%', padding: 10, marginTop: 5 }}
                  />
                </label>

                <label>
                  緊急聯絡人
                  <input
                    value={form.emergency_contact_name}
                    onChange={(e) =>
                      setField('emergency_contact_name', e.target.value)
                    }
                    style={{ width: '100%', padding: 10, marginTop: 5 }}
                  />
                </label>

                <label>
                  緊急聯絡電話
                  <input
                    value={form.emergency_contact_phone}
                    onChange={(e) =>
                      setField('emergency_contact_phone', e.target.value)
                    }
                    style={{ width: '100%', padding: 10, marginTop: 5 }}
                  />
                </label>

                <button
                  type="button"
                  className="btn"
                  onClick={submit}
                  disabled={saving}
                >
                  {saving ? '送出中…' : '送出補件資料'}
                </button>

                {message && (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{message}</div>
                )}
              </div>
            </div>
          )}

          {done && (
            <div
              className="card"
              style={{ marginTop: 20, background: '#f0fdf4' }}
            >
              <h2 style={{ marginTop: 0 }}>補件完成</h2>
              <p>{message}</p>
              <p style={{ marginBottom: 0 }}>
                後台會重新審核本案，不需要再次送出新的申請。
              </p>
            </div>
          )}
        </>
      )}
    </main>
  )
}
