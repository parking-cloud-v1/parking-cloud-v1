'use client'

import Link from 'next/link'
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
  button: string
  sourceHref: string
}[] = [
  {
    key: 'attendance',
    label: '每月簽到表',
    note: '下載現場同月上傳的原始簽到檔 ZIP。',
    button: '下載 ZIP',
    sourceHref: '/dashboard/monthly-attendance',
  },
  {
    key: 'rentals',
    label: '月租總表',
    note: '下載與月租管理欄位一致的 Excel ZIP。',
    button: '下載 Excel ZIP',
    sourceHref: '/dashboard/monthly-rentals',
  },
  {
    key: 'changes',
    label: '月租簽約異動',
    note: '下載與現場會計異動欄位一致的 Excel ZIP。',
    button: '下載 Excel ZIP',
    sourceHref: '/dashboard/monthly-rentals/changes',
  },
  {
    key: 'shift',
    label: '當日結班報表',
    note: '下載各停車場指定月份結班彙整 Excel。',
    button: '下載 Excel ZIP',
    sourceHref: '/dashboard/shift-closing',
  },
]

function storageKey(category: Category) {
  return `manual-google-drive-folder:${category}`
}

function isDriveFolderUrl(value: string) {
  return /^https:\/\/drive\.google\.com\//i.test(value.trim())
}

export default function ManualCloudExportPanel({ month }: { month: string }) {
  const [folderUrls, setFolderUrls] = useState<Record<Category, string>>({
    attendance: '',
    rentals: '',
    changes: '',
    shift: '',
  })
  const [message, setMessage] = useState('')

  useEffect(() => {
    const next = {} as Record<Category, string>
    for (const item of CATEGORIES) {
      next[item.key] = window.localStorage.getItem(storageKey(item.key)) || ''
    }
    setFolderUrls(next)
  }, [])

  function updateFolder(category: Category, value: string) {
    setFolderUrls((current) => ({ ...current, [category]: value }))
  }

  function saveFolder(category: Category) {
    const value = folderUrls[category].trim()
    if (value && !isDriveFolderUrl(value)) {
      setMessage('請貼上 Google Drive 資料夾網址，例如 https://drive.google.com/drive/folders/...')
      return
    }

    if (value) {
      window.localStorage.setItem(storageKey(category), value)
      setMessage(`${CATEGORIES.find((item) => item.key === category)?.label || '此類別'} Drive 連結已儲存在這台瀏覽器；之後仍可直接修改。`)
    } else {
      window.localStorage.removeItem(storageKey(category))
      setMessage('已清除此類別的 Google Drive 連結。')
    }
  }

  function download(category: Category) {
    window.location.href = `/api/report-center/manual-export?month=${encodeURIComponent(
      month
    )}&category=${encodeURIComponent(category)}`
  }

  function openDrive(category: Category) {
    const value = folderUrls[category].trim()
    if (!value) {
      setMessage('請先貼上這次要上傳的 Google Drive 資料夾網址。')
      return
    }
    if (!isDriveFolderUrl(value)) {
      setMessage('Google Drive 連結格式不正確，請確認後再開啟。')
      return
    }
    window.open(value, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2 style={{ marginTop: 0 }}>Google Drive 手動歸檔</h2>
      <div className="muted">
        報表中心只處理這 4 類月報。防災、計程車與登革熱已移回各自現場模組，不再從報表中心操作。這 4 類仍保留本機下載與 Drive 連結備援。
      </div>

      {message && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 8,
            background: message.includes('不正確') || message.includes('請先') ? '#fef2f2' : '#f0fdf4',
            color: message.includes('不正確') || message.includes('請先') ? '#b91c1c' : '#166534',
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))',
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
              padding: 16,
              background: '#fff',
            }}
          >
            <strong style={{ fontSize: 19 }}>{item.label}</strong>
            <div className="muted" style={{ marginTop: 6, minHeight: 44 }}>
              {item.note}
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>這次要上傳的 Google Drive 資料夾</label>
              <input
                value={folderUrls[item.key]}
                onChange={(event) => updateFolder(item.key, event.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
              />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => download(item.key)}
                disabled={!month}
              >
                ① {item.button}
              </button>
              <button type="button" onClick={() => openDrive(item.key)}>
                ② 開啟 Drive 手動上傳
              </button>
              <button type="button" onClick={() => saveFolder(item.key)}>
                儲存／更新連結
              </button>
              <Link href={item.sourceHref} style={{ fontWeight: 700, alignSelf: 'center' }}>
                開啟現場報表
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
