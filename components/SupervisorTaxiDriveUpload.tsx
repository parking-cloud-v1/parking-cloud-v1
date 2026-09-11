'use client'

import { useEffect, useState } from 'react'
import { useGoogleDriveOAuth } from '@/components/useGoogleDriveOAuth'

function storageKey(parkingLotId: string) {
  return `direct-google-drive-folder:taxi:${parkingLotId}`
}

function isDriveFolderUrl(value: string) {
  return /^https:\/\/drive\.google\.com\//i.test(value.trim())
}

export default function SupervisorTaxiDriveUpload({
  parkingLotId,
  parkingLotName,
  month,
}: {
  parkingLotId: string
  parkingLotName: string
  month: string
}) {
  const [allowed, setAllowed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [folderUrl, setFolderUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const driveOAuth = useGoogleDriveOAuth(allowed)

  useEffect(() => {
    setFolderUrl(
      parkingLotId
        ? window.localStorage.getItem(storageKey(parkingLotId)) || ''
        : ''
    )
    void loadAccess()
  }, [parkingLotId])

  async function loadAccess() {
    try {
      const response = await fetch('/api/taxi-discounts/google-drive', {
        cache: 'no-store',
      })
      if (response.status === 403) {
        setAllowed(false)
        setChecked(true)
        return
      }
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || 'Drive 狀態讀取失敗')
      setAllowed(true)
    } catch (error: any) {
      setAllowed(false)
      setMessage(error?.message || 'Drive 狀態讀取失敗')
    } finally {
      setChecked(true)
    }
  }

  if (!checked || !allowed || !parkingLotId) return null

  function saveFolder() {
    const value = folderUrl.trim()
    if (!value || !isDriveFolderUrl(value)) {
      setMessage('請貼上正確的 Google Drive 資料夾網址。')
      return
    }
    window.localStorage.setItem(storageKey(parkingLotId), value)
    setMessage('這間停車場的 Drive 連結已儲存在目前瀏覽器，可隨時更改。')
  }

  async function upload() {
    const value = folderUrl.trim()
    if (!driveOAuth.connected) {
      setMessage('請先按「連結 Google Drive」完成主管 Google 帳號授權。')
      return
    }
    if (!value || !isDriveFolderUrl(value)) {
      setMessage('請先貼上這間停車場要使用的 Google Drive 資料夾網址。')
      return
    }
    if (!month) {
      setMessage('請先選擇報表月份。')
      return
    }

    if (
      !window.confirm(
        `確定將 ${parkingLotName || '目前停車場'}／${month} 的計程車優惠報表直接上傳 Google Drive？`
      )
    ) {
      return
    }

    setUploading(true)
    setMessage('計程車優惠報表正在直接上傳 Google Drive…')

    try {
      const response = await fetch('/api/taxi-discounts/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parkingLotId,
          month,
          folderUrl: value,
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || 'Google Drive 上傳失敗')

      window.localStorage.setItem(storageKey(parkingLotId), value)
      setMessage(
        `已直接上傳：${json?.fileName || '計程車優惠報表'}（${json?.recordCount ?? 0} 筆）`
      )
    } catch (error: any) {
      setMessage(error?.message || 'Google Drive 上傳失敗')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: 14,
        border: '1px solid #bfdbfe',
        borderRadius: 10,
        background: '#eff6ff',
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 18 }}>
        主管｜此停車場直接上傳 Google Drive
      </div>
      <div className="muted" style={{ marginTop: 5 }}>
        主管只要先連結一次 Google 帳號；之後每間停車場貼自己的資料夾網址即可直接上傳。
      </div>

      <div
        style={{
          marginTop: 10,
          padding: 10,
          borderRadius: 8,
          background: driveOAuth.connected ? '#ecfdf5' : '#fff7ed',
        }}
      >
        <strong>
          {driveOAuth.loading
            ? '正在檢查 Google Drive 連線…'
            : driveOAuth.connected
              ? 'Google Drive 已連結'
              : 'Google Drive 尚未連結'}
        </strong>
        {!driveOAuth.configured && !driveOAuth.loading && (
          <div style={{ marginTop: 5, color: '#b91c1c', fontWeight: 700 }}>
            Vercel OAuth 三個環境變數尚未設定完整。
          </div>
        )}
        {driveOAuth.error && (
          <div style={{ marginTop: 5, color: '#b91c1c' }}>{driveOAuth.error}</div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {!driveOAuth.connected ? (
            <button
              type="button"
              className="btn"
              onClick={driveOAuth.connect}
              disabled={!driveOAuth.configured || driveOAuth.loading}
            >
              連結 Google Drive
            </button>
          ) : (
            <>
              <button type="button" onClick={driveOAuth.connect}>
                重新授權
              </button>
              <button type="button" onClick={() => void driveOAuth.disconnect()}>
                解除連結
              </button>
            </>
          )}
        </div>
      </div>

      <div className="field" style={{ marginTop: 10 }}>
        <label>{parkingLotName || '目前停車場'}－Google Drive 資料夾網址</label>
        <input
          value={folderUrl}
          onChange={(event) => setFolderUrl(event.target.value)}
          placeholder="https://drive.google.com/drive/folders/..."
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button type="button" onClick={saveFolder}>
          儲存／更新此場連結
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void upload()}
          disabled={uploading || !driveOAuth.connected}
        >
          {uploading ? 'Google Drive 上傳中…' : '直接上傳 Google Drive'}
        </button>
        {folderUrl.trim() && isDriveFolderUrl(folderUrl) && (
          <button
            type="button"
            onClick={() =>
              window.open(folderUrl.trim(), '_blank', 'noopener,noreferrer')
            }
          >
            開啟資料夾
          </button>
        )}
      </div>

      {message && <div style={{ marginTop: 8, fontWeight: 700 }}>{message}</div>}
    </div>
  )
}
