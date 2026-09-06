'use client'

import publicUi from '@/components/PublicPortal.module.css'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type CapacityItem = {
  limit: number | null
  remaining: number | null
  full: boolean
}

type ParkingLot = {
  id: string
  name: string
  public_note?: string | null
  ends_at?: string | null
  capacity?: {
    auto_waitlist_when_full: boolean
    car: CapacityItem
    motorcycle: CapacityItem
    heavy_motorcycle: CapacityItem
  } | null
}

function formatDateTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleString('zh-TW')
}


function capacityText(label: string, item?: CapacityItem | null) {
  if (!item || item.limit === null) return `${label}：不限`
  if (item.full) return `${label}：額滿`
  return `${label}：剩 ${item.remaining} 名`
}

export default function PublicApplyHomePage() {
  const [lots, setLots] = useState<ParkingLot[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const response = await fetch('/api/public/parking-lots', {
          cache: 'no-store',
        })
        const result = await response.json()

        if (!response.ok) {
          setMessage(result?.error || '停車場資料讀取失敗。')
          return
        }

        setLots(result.lots || [])
      } catch (error: any) {
        setMessage(error?.message || '系統連線失敗。')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <main className={publicUi.portal} style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
      <h1>月租停車線上申請</h1>
      <p className={publicUi.pageLead} style={{ color: '#64748b' }}>
        下列僅顯示目前已開放線上月租申請的停車場。
      </p>

      <div className={publicUi.homeActions} style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link
          href="/renew"
          style={{
            display: 'inline-block',
            padding: '10px 14px',
            border: '1px solid #86efac',
            borderRadius: 10,
            textDecoration: 'none',
            color: '#166534',
            fontWeight: 800,
            background: '#f0fdf4',
          }}
        >
          已是月租戶？線上續租
        </Link>
        <Link
          href="/status"
          style={{
            display: 'inline-block',
            padding: '10px 14px',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            textDecoration: 'none',
            color: '#0f172a',
            fontWeight: 700,
          }}
        >
          已送出申請？查詢申請進度
        </Link>
      </div>

      {loading && <div>停車場資料讀取中…</div>}

      {!loading && !lots.length && (
        <div
          style={{
            padding: 18,
            background: '#f8fafc',
            borderRadius: 12,
          }}
        >
          {message || '目前沒有開放線上月租申請的停車場。'}
        </div>
      )}

      <div className={publicUi.lotList} style={{ display: 'grid', gap: 12, marginTop: 20 }}>
        {lots.map((lot) => (
          <Link
            key={lot.id}
            href={`/apply/${lot.id}`}
            className={publicUi.lotCard}
            style={{
              display: 'block',
              padding: 18,
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              textDecoration: 'none',
              color: '#0f172a',
              background: '#fff',
            }}
          >
            <div className={publicUi.lotCardName} style={{ fontWeight: 800 }}>{lot.name}</div>
            {lot.public_note && (
              <div style={{ marginTop: 6, color: '#475569', fontSize: 14 }}>
                {lot.public_note}
              </div>
            )}
            {lot.capacity && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 8,
                  fontSize: 13,
                  color: '#475569',
                }}
              >
                <span>{capacityText('汽車', lot.capacity.car)}</span>
                <span>{capacityText('機車', lot.capacity.motorcycle)}</span>
                <span>{capacityText('重機', lot.capacity.heavy_motorcycle)}</span>
              </div>
            )}
            {lot.ends_at && (
              <div style={{ marginTop: 6, color: '#b45309', fontSize: 13 }}>
                申請截止：{formatDateTime(lot.ends_at)}
              </div>
            )}
          </Link>
        ))}
      </div>

      {message && lots.length > 0 && (
        <div style={{ marginTop: 16, color: '#b45309' }}>{message}</div>
      )}
    </main>
  )
}
