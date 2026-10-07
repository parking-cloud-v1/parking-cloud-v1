'use client'

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export default function MonthlyWaitlistPushControl({ parkingLotId, vapidPublicKey }: { parkingLotId: string; vapidPublicKey: string }) {
  const [state, setState] = useState<'unsupported' | 'blocked' | 'off' | 'on' | 'working'>('off')

  async function saveSubscription(registration: ServiceWorkerRegistration) {
    if (!parkingLotId || !vapidPublicKey) return false
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
    }
    const response = await fetch('/api/monthly-waitlist/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parking_lot_id: parkingLotId, subscription: subscription.toJSON() }),
    })
    return response.ok
  }

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('blocked')
      return
    }
    if (!parkingLotId || !vapidPublicKey) {
      setState('off')
      return
    }
    if (Notification.permission === 'granted') {
      navigator.serviceWorker.register('/monthly-waitlist-sw.js').then(async (registration) => {
        try {
          const ok = await saveSubscription(registration)
          setState(ok ? 'on' : 'off')
        } catch {
          setState('off')
        }
      })
    } else {
      setState('off')
    }
  }, [parkingLotId, vapidPublicKey])

  async function enable() {
    if (!parkingLotId) {
      alert('請先選擇工作停車場')
      return
    }
    if (!vapidPublicKey) {
      alert('系統尚未設定 Web Push 金鑰，請先完成 Vercel 環境變數設定。')
      return
    }
    setState('working')
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'denied') {
        setState('blocked')
        return
      }
      if (permission !== 'granted') {
        setState('off')
        return
      }
      const registration = await navigator.serviceWorker.register('/monthly-waitlist-sw.js')
      const ok = await saveSubscription(registration)
      setState(ok ? 'on' : 'off')
      if (ok) alert('月租候補通知已開啟。之後此停車場有新候補時，這台裝置可收到通知。')
    } catch (error: any) {
      console.error(error)
      setState('off')
      alert('通知開啟失敗，請確認瀏覽器沒有封鎖網站通知。')
    }
  }

  if (state === 'unsupported') return <span style={{ fontSize: 12, color: '#64748b' }}>此瀏覽器不支援通知</span>
  if (state === 'blocked') return <button type="button" onClick={() => alert('瀏覽器已封鎖通知。請點網址列左側的網站設定，將「通知」改成允許後重新整理。')} style={buttonStyle}>候補通知：已封鎖</button>
  if (state === 'on') return <button type="button" onClick={enable} style={buttonStyle}>🔔 候補通知：已開啟</button>
  return <button type="button" onClick={enable} disabled={state === 'working'} style={buttonStyle}>{state === 'working' ? '設定通知中…' : '🔕 開啟候補通知'}</button>
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  borderRadius: 10,
  padding: '7px 10px',
  cursor: 'pointer',
  fontSize: 13,
  whiteSpace: 'nowrap',
}
