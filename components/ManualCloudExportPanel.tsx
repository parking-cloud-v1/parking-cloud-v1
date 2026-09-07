'use client'

import { useEffect, useState } from 'react'

type Category =
  | 'attendance'
  | 'rentals'
  | 'changes'
  | 'taxi'
  | 'shift'
  | 'disaster'
  | 'dengue'
  | 'violation'

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
    key: 'taxi',
    label: '計程車折扣',
    note: '取消報表內統計月份；一鍵下載各停車場 Excel，ZIP 內依停車場分資料夾。',
  },
  {
    key: 'shift',
    label: '結班報表',
    note: '下載指定月份結班報表資料。',
  },
  {
    key: 'disaster',
    label: '防災檢查',
    note: '一鍵下載各停車場正式 PDF，ZIP 內依停車場分資料夾。',
  },
  {
    key: 'dengue',
    label: '登革熱自主檢查報表',
    note: '只包含自主檢查報表；委外消毒不包含報表。',
  },
  {
    key: 'violation',
    label: '違規停車照片',
    note: '包含身障／婦幼違規、久停10天與無牌車照片。',
  },
]

function storageKey(category: Category) {
  return `report-center-google-drive-folder-url:${category}`
}

export default function ManualCloudExportPanel({
  month,
}: {
  month: string
}) {
  const [folderUrls, setFolderUrls] = useState<Record<Category, string>>({
    attendance: '',
    rentals: '',
    changes: '',
    taxi: '',
    shift: '',
    disaster: '',
    dengue: '',
    violation: '',
  })

  const [editing, setEditing] = useState<Category | ''>('')
  const [draftUrl, setDraftUrl] = useState('')

  useEffect(() => {
    const next = {} as Record<Category, string>

    for (const item of CATEGORIES) {
      next[item.key] =
        window.localStorage.getItem(storageKey(item.key)) || ''
    }

    setFolderUrls(next)
  }, [])

  function download(category: Category) {
    window.location.href =
      `/api/report-center/manual-export?month=${encodeURIComponent(month)}&category=${encodeURIComponent(category)}`
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

    setFolderUrls((current) => ({
      ...current,
      [category]: value,
    }))

    setEditing('')
    setDraftUrl('')
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2 style={{ marginTop: 0 }}>Google Drive 分類歸檔</h2>

      <div className="muted">
        因為每一種報表要放到不同 Google Drive 資料夾，所以改成每個項目分別下載、分別設定自己的資料夾連結。
        不需要 Google API、不需要 Vercel 金鑰。
      </div>

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
                onClick={() => download(item.key)}
              >
                {item.key === 'disaster'
                  ? '各停車場 PDF ZIP'
                  : item.key === 'taxi'
                    ? '各停車場 Excel ZIP'
                    : '分別下載'}
              </button>

              <button
                type="button"
                onClick={() => openDrive(item.key)}
              >
                開啟此類資料夾
              </button>

              <button
                type="button"
                onClick={() => beginEdit(item.key)}
              >
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
                ? '已設定此類專用 Google Drive 資料夾'
                : '尚未設定專用資料夾，按「開啟此類資料夾」會先開啟我的雲端硬碟'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
