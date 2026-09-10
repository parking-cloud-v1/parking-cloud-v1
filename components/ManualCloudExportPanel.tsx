'use client'

import Link from 'next/link'

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
    note: '下載與現場月租異動欄位一致的 Excel ZIP。',
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

export default function ManualCloudExportPanel({ month }: { month: string }) {
  function download(category: Category) {
    window.location.href = `/api/report-center/manual-export?month=${encodeURIComponent(
      month
    )}&category=${encodeURIComponent(category)}`
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2 style={{ marginTop: 0 }}>報表下載</h2>
      <div className="muted">
        報表中心只保留下載功能。Google Drive 上傳不在這裡操作，避免報表中心與各停車場現場作業混在一起。
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
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

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <button
                type="button"
                className="btn"
                onClick={() => download(item.key)}
                disabled={!month}
              >
                {item.button}
              </button>

              <Link
                href={item.sourceHref}
                style={{ fontWeight: 700, alignSelf: 'center' }}
              >
                開啟現場報表
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
