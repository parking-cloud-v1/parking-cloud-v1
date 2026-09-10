'use client'

import { useEffect, useState } from 'react'

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
  const [credentialsConfigured, setCredentialsConfigured] = useState(true)
  const [serviceAccountEmail, setServiceAccountEmail] = useState('')
  const [folderUrl, setFolderUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

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
      setCredentialsConfigured(Boolean(json?.credentialsConfigured))
      setServiceAccountEmail(String(json?.serviceAccountEmail || ''))
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
        每間停車場可使用不同資料夾；更換公司資料夾時直接修改下方網址即可。
      </div>

      {!credentialsConfigured && (
        <div style={{ marginTop: 8, color: '#b91c1c', fontWeight: 800 }}>
          Vercel 尚未完成 Google Drive 服務帳號設定。
          {serviceAccountEmail ? ` 服務帳號：${serviceAccountEmail}` : ''}
        </div>
      )}

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
          disabled={uploading || !credentialsConfigured}
        >
          {uploading ? 'Google Drive 上傳中…' : '直接上傳 Google Drive'}
        </button>
        {folderUrl.trim() && isDriveFolderUrl(folderUrl) && (
          <button
            type="button"
            onClick={() => window.open(folderUrl.trim(), '_blank', 'noopener,noreferrer')}
          >
            開啟資料夾
          </button>
        )}
      </div>

      {message && (
        <div style={{ marginTop: 8, fontWeight: 700 }}>
          {message}
        </div>
      )}
    </div>
  )
}
