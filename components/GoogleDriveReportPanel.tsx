'use client'

import { useEffect, useMemo, useState } from 'react'

type Category =
  | 'attendance'
  | 'rentals'
  | 'changes'
  | 'taxi'
  | 'shift'
  | 'disaster'
  | 'dengue'
  | 'violation'

type StatusData = {
  configured: Record<Category, boolean>
  folderUrls: Record<Category, string>
  counts: Record<Category, number>
  archiveCounts: Record<Category, number>
  categoryErrors?: Partial<Record<Category, string>>
  role: 'supervisor' | 'manager'
  lotCount: number
}

const CATEGORIES: { key: Category; label: string; note: string }[] = [
  { key: 'attendance', label: '每月簽到表', note: '同場同月可保留多位管理員上傳的不同簽到表。' },
  { key: 'rentals', label: '月租總表', note: '依各停車場建立本月月租總表快照。' },
  { key: 'changes', label: '月租異動', note: '歸檔指定月份新增、退租等異動資料。' },
  { key: 'taxi', label: '計程車折扣', note: '各停車場各一份 Excel；當月無紀錄仍保留空白表。' },
  { key: 'shift', label: '結班報表', note: '包含結班金額與跨班匯款狀態。' },
  { key: 'disaster', label: '防災檢查', note: '只歸檔所選月份已產生的正式 PDF。' },
  { key: 'dengue', label: '登革熱自主檢查報表', note: '只包含自主檢查報表；委外消毒不包含報表。' },
  { key: 'violation', label: '違規停車照片', note: '包含身障／婦幼違規、久停 10 天與無牌車照片。' },
]

export default function GoogleDriveReportPanel({ month }: { month: string }) {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState<Category | ''>('')
  const [message, setMessage] = useState('')

  async function load() {
    if (!month) return
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch(
        `/api/report-center/google-drive?month=${encodeURIComponent(month)}`,
        { cache: 'no-store' }
      )
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || 'Google Drive 狀態讀取失敗')
      setStatus(json)
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

  async function upload(category: Category) {
    if (uploading) return
    const item = CATEGORIES.find((row) => row.key === category)!

    if (!window.confirm(
      `確定將 ${month}「${item.label}」歸檔到公司 Google Drive？\n\n` +
      '完全相同的檔案會自動略過，不會重複上傳；Supabase 原始檔不會刪除。'
    )) return

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
        `${item.label} 歸檔完成：新上傳 ${json.uploaded || 0} 份、重複略過 ${json.skipped || 0} 份、失敗 ${json.failed || 0} 份。` +
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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Google Drive 正式歸檔</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            正式資料夾結構：月份 → 停車場 → 類別。完全相同內容會自動略過；內容有更新才建立新版。
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || Boolean(uploading)}>
          {loading ? '更新中…' : '重新整理'}
        </button>
      </div>

      {status && (
        <div className="muted" style={{ marginTop: 10 }}>
          權限：{status.role === 'supervisor' ? '主管－全部停車場' : '管理員－僅指派停車場'} ｜
          可查看 {status.lotCount} 個停車場 ｜ 已設定 Drive 類別 {configuredCount} / {CATEGORIES.length}
        </div>
      )}

      {message && (
        <div className="card" style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>
          {message}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
          gap: 12,
          marginTop: 16,
        }}
      >
        {CATEGORIES.map((item) => {
          const configured = status?.configured?.[item.key] || false
          const count = status?.counts?.[item.key] || 0
          const archived = status?.archiveCounts?.[item.key] || 0
          const categoryError = status?.categoryErrors?.[item.key] || ''

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
              <strong style={{ fontSize: 18 }}>{item.label}</strong>
              <div className="muted" style={{ marginTop: 6, minHeight: 42 }}>{item.note}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <div>
                  <div className="muted">本月可歸檔</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{count}</div>
                </div>
                <div>
                  <div className="muted">本月歸檔紀錄</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{archived}</div>
                </div>
              </div>

              <div className="muted" style={{ marginTop: 8 }}>
                {configured ? 'Google Drive 已設定' : '尚未設定 Drive Folder ID'}
              </div>

              {categoryError && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    border: '1px solid #fecaca',
                    borderRadius: 8,
                    background: '#fef2f2',
                    fontSize: 13,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  此類資料讀取失敗：{categoryError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={!configured || count === 0 || Boolean(uploading) || loading || Boolean(categoryError)}
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
