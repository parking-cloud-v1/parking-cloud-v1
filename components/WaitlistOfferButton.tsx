'use client'

import { useState } from 'react'

export default function WaitlistOfferButton({
  parkingLotId,
  vehicleType,
  label = '通知候補第一順位',
}: {
  parkingLotId: string
  vehicleType: 'car' | 'motorcycle' | 'heavy_motorcycle'
  label?: string
}) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function sendOffer() {
    if (loading) return
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/online-capacity/waitlist-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parking_lot_id: parkingLotId,
          vehicle_type: vehicleType,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setMessage(data?.error || '候補通知發送失敗。')
        return
      }

      setMessage(
        `已通知候補第 ${data.wait_no} 位，回覆期限：${new Date(
          data.expires_at
        ).toLocaleString('zh-TW')}`
      )

      window.setTimeout(() => window.location.reload(), 900)
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        type="button"
        onClick={sendOffer}
        disabled={loading}
        style={{ padding: '10px 14px', fontWeight: 800 }}
      >
        {loading ? '發送中…' : label}
      </button>
      {message && (
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: message.startsWith('已通知') ? '#166534' : '#b91c1c',
          }}
        >
          {message}
        </div>
      )}
    </div>
  )
}
