'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type Category =
  | 'attendance'
  | 'rentals'
  | 'changes'
  | 'taxi'
  | 'shift'
  | 'disaster'
  | 'dengue'

type StatusData = {
  configured: Record<Category, boolean>
  folderUrls: Record<Category, string>
  counts: Record<Category, number>
  archiveCounts: Record<Category, number>
  categoryErrors?: Partial<Record<Category, string>>
  role: 'supervisor' | 'manager'
  lotCount: number
  driveRootFolderId?: string
  driveRootFolderUrl?: string
  driveRootSettingSource?: 'database' | 'environment' | 'legacy'
  driveCredentialsConfigured?: boolean
  serviceAccountEmail?: string
}

const CATEGORIES: {
  key: Category
  label: string
  note: string
  sourceHref: string
}[] = [
  {
    key: 'attendance',
    label: '每月簽到表',
    note: '使用現場上傳的原始簽到檔，不另外轉格式。',
    sourceHref: '/dashboard/monthly-attendance',
  },
  {
    key: 'rentals',
    label: '月租總表',
    note: 'Excel 欄位與月租管理的「Excel 匯出」一致。',
    sourceHref: '/dashboard/monthly-rentals',
  },
  {
    key: 'changes',
    label: '月租簽約異動',
    note: 'Excel 欄位與現場「匯出會計異動 Excel」一致。',
    sourceHref: '/dashboard/monthly-rentals/changes',
  },
  {
    key: 'taxi',
    label: '計程車優惠報表',
    note: '沿用新北市政府交通局計程車免費停車統計表格式。',
    sourceHref: '/dashboard/taxi-discounts',
  },
  {
    key: 'shift',
    label: '當日結班報表',
    note: 'Drive 下載為月份彙整 Excel；每班與匯款週期明細以現場頁為準。',
    sourceHref: '/dashboard/shift-closing',
  },
  {
    key: 'disaster',
    label: '防災檢查',
    note: '直接歸檔現場已產生的正式 PDF，不重新排版。',
    sourceHref: '/dashboard/disaster-inspections',
  },
  {
    key: 'dengue',
    label: '登革熱消毒作業',
    note: '同場同日一個 ZIP，含自主檢查／委外消毒照片與報表。',
    sourceHref: '/dashboard/dengue-photos',
  },
]

export default function GoogleDriveReportPanel({ month }: { month: string }) {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState<Category | ''>('')
  const [message, setMessage] = useState('')
  const [folderInput, setFolderInput] = useState('')
  const [savingFolder, setSavingFolder] = useState(false)

  async function load() {
    if (!month) return
    setLoading(true)

    try {
      const response = await fetch(
        `/api/report-center/google-drive?month=${encodeURIComponent(month)}`,
        { cache: 'no-store' }
      )
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || 'Google Drive 狀態讀取失敗')
      setStatus(json)
      setFolderInput(json?.driveRootFolderId || '')
    } catch (error: any) {
      setStatus(null)
      setMessage(error?.message || 'Google Drive 狀態讀取失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [month])

  const configuredCount = useMemo(
    () => CATEGORIES.filter((item) => status?.configured?.[item.key]).length,
    [status]
  )

  async function saveFolder() {
    if (!folderInput.trim() || savingFolder) return

    setSavingFolder(true)
    setMessage('正在測試 Google Drive 權限並儲存總資料夾…')

    try {
      const response = await fetch('/api/report-center/google-drive', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folderInput.trim() }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || 'Google Drive 資料夾設定失敗')

      setMessage(`Google Drive 總資料夾設定完成：${json.folderName || json.folderId}`)
      await load()
    } catch (error: any) {
      setMessage(error?.message || 'Google Drive 資料夾設定失敗')
    } finally {
      setSavingFolder(false)
    }
  }

  async function upload(category: Category) {
    if (uploading) return
    const item = CATEGORIES.find((row) => row.key === category)!

    if (
      !window.confirm(
        `確定將 ${month}「${item.label}」歸檔到公司 Google Drive？\n\n` +
          '本機備份與 Drive 現在使用同一個報表來源；完全相同內容會自動略過，Supabase 原始檔不會刪除。'
      )
    ) {
      return
    }

    setUploading(category)
    setMessage(`${item.label} 正在歸檔…`)

    try {
      const response = await fetch('/api/report-center/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, month }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || 'Google Drive 歸檔失敗')

      setMessage(
        `${item.label} 歸檔完成：新上傳 ${json.uploaded || 0} 份、重複略過 ${
          json.skipped || 0
        } 份、失敗 ${json.failed || 0} 份。` +
          (json.failures?.length ? `\n${json.failures.join('\n')}` : '')
      )
      await load()
    } catch (error: any) {
      setMessage(error?.message || 'Google Drive 歸檔失敗')
    } finally {
      setUploading('')
    }
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Google Drive 正式歸檔</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            正式資料夾：月份 → 停車場 → 報表類別。違規照片已移出報表中心，改由「違規即時通知」單案下載。
          </div>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || Boolean(uploading) || savingFolder}
        >
          {loading ? '更新中…' : '重新整理'}
        </button>
      </div>

      {status && (
        <>
          <div className="muted" style={{ marginTop: 10 }}>
            權限：{status.role === 'supervisor' ? '主管－全部停車場' : '管理員－僅指派停車場'} ｜
            可查看 {status.lotCount} 個停車場 ｜ 可直接歸檔 {configuredCount} / {CATEGORIES.length} 類
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 14,
              border: '1px solid #dbe3ec',
              borderRadius: 12,
              background: '#f8fafc',
            }}
          >
            <strong>Google Drive 總資料夾設定</strong>

            {!status.driveCredentialsConfigured && (
              <div style={{ marginTop: 8, color: '#b91c1c', fontWeight: 700 }}>
                Vercel 尚未設定 Google Drive 服務帳號 email / private key，因此目前無法一鍵歸檔。
              </div>
            )}

            {status.serviceAccountEmail && (
              <div className="muted" style={{ marginTop: 6 }}>
                請確認公司 Drive 總資料夾已共享給
                <strong> {status.serviceAccountEmail} </strong>
                ，權限為「編輯者」。
              </div>
            )}

            {status.role === 'supervisor' ? (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                  marginTop: 10,
                }}
              >
                <div className="field" style={{ flex: '1 1 360px', margin: 0 }}>
                  <label>公司 Google Drive 報表總資料夾網址或 Folder ID</label>
                  <input
                    value={folderInput}
                    onChange={(event) => setFolderInput(event.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={savingFolder || !folderInput.trim()}
                  onClick={() => void saveFolder()}
                >
                  {savingFolder ? '測試／儲存中…' : '測試並儲存'}
                </button>
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 8 }}>
                Drive 總資料夾由主管統一設定；管理員不需要自行設定。
              </div>
            )}

            {status.driveRootFolderUrl && (
              <div style={{ marginTop: 10 }}>
                <a
                  href={status.driveRootFolderUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontWeight: 700 }}
                >
                  開啟目前報表總資料夾
                </a>
              </div>
            )}
          </div>
        </>
      )}

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
        {CATEGORIES.map((item) => {
          const configured = status?.configured?.[item.key] || false
          const count = status?.counts?.[item.key] || 0
          const archived = status?.archiveCounts?.[item.key] || 0
          const categoryError = status?.categoryErrors?.[item.key]

          return (
            <div
              key={item.key}
              style={{
                border: '1px solid #dbe3ec',
                borderRadius: 12,
                padding: 14,
                background: '#fff',
              }}
            >
              <strong style={{ fontSize: 19 }}>{item.label}</strong>
              <div className="muted" style={{ marginTop: 6, minHeight: 48 }}>
                {item.note}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <div>
                  <div className="muted">本月可歸檔</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{count}</div>
                </div>
                <div>
                  <div className="muted">本月歸檔紀錄</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{archived}</div>
                </div>
              </div>

              {categoryError ? (
                <div
                  style={{
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 8,
                    background: '#fef2f2',
                    color: '#b91c1c',
                  }}
                >
                  此類資料讀取失敗：{categoryError}
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 8 }}>
                  {configured
                    ? 'Google Drive 可歸檔'
                    : status?.driveCredentialsConfigured
                      ? '尚未設定 Drive 總資料夾'
                      : '尚未完成 Drive 服務帳號設定'}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <Link href={item.sourceHref} className="btn" style={{ textDecoration: 'none' }}>
                  開啟現場報表
                </Link>

                <button
                  type="button"
                  className="btn"
                  disabled={
                    !configured ||
                    count === 0 ||
                    Boolean(uploading) ||
                    loading ||
                    Boolean(categoryError)
                  }
                  onClick={() => void upload(item.key)}
                >
                  {uploading === item.key ? '歸檔中…' : '一鍵歸檔'}
                </button>

                {status?.folderUrls?.[item.key] && (
                  <a
                    href={status.folderUrls[item.key]}
                    target="_blank"
                    rel="noreferrer"
                    className="btn"
                    style={{ textDecoration: 'none' }}
                  >
                    開啟 Drive
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
