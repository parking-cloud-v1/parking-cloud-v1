'use client'

import Link from 'next/link'

type Category =
  | 'attendance'
  | 'rentals'
  | 'changes'
  | 'taxi'
  | 'shift'
  | 'disaster'

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
    note: '原始上傳檔直接打包。',
    button: '下載 ZIP',
    sourceHref: '/dashboard/monthly-attendance',
  },
  {
    key: 'rentals',
    label: '月租總表',
    note: '與現場 Excel 匯出相同欄位。',
    button: '下載 Excel ZIP',
    sourceHref: '/dashboard/monthly-rentals',
  },
  {
    key: 'changes',
    label: '月租簽約異動',
    note: '與現場會計異動 Excel 相同欄位。',
    button: '下載 Excel ZIP',
    sourceHref: '/dashboard/monthly-rentals/changes',
  },
  {
    key: 'taxi',
    label: '計程車優惠報表',
    note: '各停車場免費停車統計表。',
    button: '下載 Excel ZIP',
    sourceHref: '/dashboard/taxi-discounts',
  },
  {
    key: 'shift',
    label: '當日結班報表',
    note: '下載各停車場月份結班彙整 Excel。',
    button: '下載 Excel ZIP',
    sourceHref: '/dashboard/shift-closing',
  },
  {
    key: 'disaster',
    label: '防災檢查',
    note: '直接下載現場已產生的正式 PDF。',
    button: '下載 PDF ZIP',
    sourceHref: '/dashboard/disaster-inspections',
  },
]

export default function ManualCloudExportPanel({ month }: { month: string }) {
  function download(category: Category) {
    window.location.href = `/api/report-center/manual-export?month=${encodeURIComponent(
      month
    )}&category=${encodeURIComponent(category)}`
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2 style={{ marginTop: 0 }}>本機下載備份</h2>
      <div className="muted">
        本機備份與 Google Drive 現在共用同一個報表來源，不再各自維護一套欄位；因此兩邊下載內容會一致。
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))',
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
            <strong>{item.label}</strong>
            <div className="muted" style={{ marginTop: 6, minHeight: 42 }}>
              {item.note}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <Link href={item.sourceHref} style={{ fontWeight: 700 }}>
                開啟現場報表
              </Link>
              <button
                type="button"
                className="btn"
                onClick={() => download(item.key)}
                disabled={!month}
              >
                {item.button}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
