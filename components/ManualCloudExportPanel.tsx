'use client'

import { useEffect, useState } from 'react'

type Category =
  | 'attendance'
  | 'rentals'
  | 'changes'
  | 'shift'

const CATEGORIES: {
  key: Category
  label: string
  note: string
}[] = [
  {
    key: 'attendance',
    label: '每月簽到表',
    note: '同場同月可保留多位管理員上傳的不同簽到表。',
  },
  {
    key: 'rentals',
    label: '月租總表',
    note: '下載目前月租總表 CSV。',
  },
  {
    key: 'changes',
    label: '月租異動',
    note: '下載指定月份新增、退租等異動資料。',
  },
  {
    key: 'shift',
    label: '結班報表',
    note: '下載指定月份結班報表資料。',
  },
]

function storageKey(category: Category) {
  return `report-center-google-drive-folder-url:${category}`
}

function contentDispositionFileName(header: string | null, fallback: string) {
  if (!header) return fallback

  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {
      return utf8[1]
    }
  }

  const normal = header.match(/filename="?([^";]+)"?/i)
  return normal?.[1] || fallback
}

export default function ManualCloudExportPanel({ month }: { month: string }) {
  const [folderUrls, setFolderUrls] = useState<Record<Category, string>>({
    attendance: '',
    rentals: '',
    changes: '',
    shift: '',
  })
  const [editing, setEditing] = useState<Category | ''>('')
  const [draftUrl, setDraftUrl] = useState('')
  const [uploading, setUploading] = useState<Category | ''>('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const next = {} as Record<Category, string>
    for (const item of CATEGORIES) {
      next[item.key] = window.localStorage.getItem(storageKey(item.key)) || ''
    }
    setFolderUrls(next)
  }, [])

  function download(category: Category) {
    window.location.href = `/api/report-center/manual-export?month=${encodeURIComponent(
      month
    )}&category=${encodeURIComponent(category)}`
  }

  function openDrive(category: Category) {
    const url =
      folderUrls[category]?.trim() ||
      'https://drive.google.com/drive/my-drive'

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function beginEdit(category: Category) {
    setEditing(category)
    setDraftUrl(folderUrls[category] || '')
  }

  function saveFolder(category: Category) {
    const value = draftUrl.trim()

    if (value && !/^https:\/\/drive\.google\.com\//i.test(value)) {
      window.alert('請貼上 Google Drive 資料夾網址。')
      return
    }

    window.localStorage.setItem(storageKey(category), value)
    setFolderUrls((current) => ({ ...current, [category]: value }))
    setEditing('')
    setDraftUrl('')
  }

  async function directUpload(category: Category, label: string) {
    if (uploading) return

    const folderUrl = folderUrls[category]?.trim()
    if (!folderUrl) {
      window.alert('請先設定此類報表的 Google Drive 資料夾連結。')
      return
    }

    if (
      !window.confirm(
        `確定把 ${month}「${label}」直接上傳到已設定的 Google Drive 資料夾？\n\n不會刪除系統原始資料，也不會下載到電腦。`
      )
    ) {
      return
    }

    setUploading(category)
    setMessage(`${label}：正在產生檔案並上傳 Google Drive…`)

    try {
      const exportResponse = await fetch(
        `/api/report-center/manual-export?month=${encodeURIComponent(
          month
        )}&category=${encodeURIComponent(category)}`,
        { cache: 'no-store' }
      )

      if (!exportResponse.ok) {
        let errorText = '報表產生失敗'
        try {
          const json = await exportResponse.json()
          errorText = json?.error || errorText
        } catch {}
        throw new Error(errorText)
      }

      const blob = await exportResponse.blob()
      const fallback = `${month}_${label}.zip`
      const fileName = contentDispositionFileName(
        exportResponse.headers.get('content-disposition'),
        fallback
      )

      const form = new FormData()
      form.append('file', blob, fileName)
      form.append('category', category)
      form.append('month', month)
      form.append('folderUrl', folderUrl)

      const uploadResponse = await fetch(
        '/api/report-center/manual-drive-upload',
        {
          method: 'POST',
          body: form,
        }
      )

      const result = await uploadResponse.json()
      if (!uploadResponse.ok) {
        throw new Error(result?.error || 'Google Drive 上傳失敗')
      }

      setMessage(
        `${label}：已直接上傳 Google Drive\n檔名：${
          result.fileName || fileName
        }`
      )
    } catch (error: any) {
      setMessage(`${label}：${error?.message || '上傳失敗'}`)
    } finally {
      setUploading('')
    }
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2 style={{ marginTop: 0 }}>Google Drive 分類歸檔</h2>

      <div className="muted">
        這裡只保留每月簽到表、月租總表、月租異動與結班報表。
        計程車折扣、防災檢查、登革熱自主檢查報表與違規停車照片維持各自現場功能，不在報表中心重複整合。
      </div>

      {message && (
        <div className="card" style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>
          {message}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
          gap: 12,
          marginTop: 16,
        }}
      >
        {CATEGORIES.map((item) => (
          <div
            key={item.key}
            style={{
              border: '1px solid #dbe3ec',
              borderRadius: 12,
              padding: 14,
              background: '#fff',
            }}
          >
            <strong style={{ fontSize: 18 }}>{item.label}</strong>
            <div className="muted" style={{ marginTop: 6, minHeight: 42 }}>
              {item.note}
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 12,
              }}
            >
              <button
                type="button"
                className="btn"
                disabled={!folderUrls[item.key] || Boolean(uploading)}
                onClick={() => directUpload(item.key, item.label)}
              >
                {uploading === item.key
                  ? '上傳中…'
                  : '直接上傳 Google Drive'}
              </button>

              <button
                type="button"
                onClick={() => download(item.key)}
                disabled={Boolean(uploading)}
              >
                下載備份
              </button>

              <button type="button" onClick={() => openDrive(item.key)}>
                開啟此類資料夾
              </button>

              <button type="button" onClick={() => beginEdit(item.key)}>
                {folderUrls[item.key]
                  ? '更改資料夾連結'
                  : '設定資料夾連結'}
              </button>
            </div>

            {editing === item.key && (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                <div className="field">
                  <label>{item.label}－Google Drive 資料夾網址</label>
                  <input
                    value={draftUrl}
                    onChange={(event) => setDraftUrl(event.target.value)}
                    placeholder="貼上此類報表要放的 Google Drive 資料夾網址"
                  />
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => saveFolder(item.key)}
                  >
                    儲存
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing('')
                      setDraftUrl('')
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            <div className="muted" style={{ marginTop: 10 }}>
              {folderUrls[item.key]
                ? '已設定此類專用 Google Drive 資料夾，可直接上傳'
                : '尚未設定專用資料夾，請先設定資料夾連結'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
