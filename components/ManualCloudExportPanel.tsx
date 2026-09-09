'use client'

type Category =
  | 'attendance'
  | 'rentals'
  | 'changes'
  | 'taxi'
  | 'shift'
  | 'disaster'
  | 'dengue'
  | 'violation'

const CATEGORIES: { key: Category; label: string; note: string; button: string }[] = [
  { key: 'attendance', label: '每月簽到表', note: '下載所選月份簽到表備份。', button: '下載 ZIP' },
  { key: 'rentals', label: '月租總表', note: '下載目前月租總表 CSV 備份。', button: '下載 ZIP' },
  { key: 'changes', label: '月租異動', note: '下載所選月份月租異動。', button: '下載 ZIP' },
  { key: 'taxi', label: '計程車折扣', note: '各停車場 Excel，無資料場站仍保留空白表。', button: '下載 Excel ZIP' },
  { key: 'shift', label: '結班報表', note: '下載所選月份結班資料。', button: '下載 ZIP' },
  { key: 'disaster', label: '防災檢查', note: '只下載所選月份已產生的正式 PDF。', button: '下載 PDF ZIP' },
  { key: 'dengue', label: '登革熱自主檢查', note: '只包含自主檢查報表。', button: '下載 ZIP' },
  { key: 'violation', label: '違規停車照片', note: '下載所選月份違規停車照片。', button: '下載 ZIP' },
]

export default function ManualCloudExportPanel({ month }: { month: string }) {
  function download(category: Category) {
    window.location.href =
      `/api/report-center/manual-export?month=${encodeURIComponent(month)}&category=${encodeURIComponent(category)}`
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2 style={{ marginTop: 0 }}>本機下載備份</h2>
      <div className="muted">
        Google Drive 為正式歸檔；這裡只保留人工下載備援，不再另外保存瀏覽器端 Drive 資料夾網址，避免兩套流程混用。
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))',
          gap: 12,
          marginTop: 16,
        }}
      >
        {CATEGORIES.map((item) => (
          <div
            key={item.key}
            style={{ border: '1px solid #dbe3ec', borderRadius: 12, padding: 14, background: '#fff' }}
          >
            <strong>{item.label}</strong>
            <div className="muted" style={{ marginTop: 6, minHeight: 42 }}>{item.note}</div>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 10 }}
              onClick={() => download(item.key)}
              disabled={!month}
            >
              {item.button}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
