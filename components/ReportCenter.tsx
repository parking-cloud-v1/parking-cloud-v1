'use client'

import { useState } from 'react'
import ManualCloudExportPanel from '@/components/ManualCloudExportPanel'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function ReportCenter() {
  const [month, setMonth] = useState(currentMonth())

  return (
    <div style={{ paddingBottom: 40 }}>
      <h1 style={{ marginBottom: 6 }}>報表中心</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Google Drive 已改為全手動歸檔：先下載系統整理好的正式檔案，再直接開啟你當下指定的 Google Drive 資料夾手動上傳。
        資料夾連結可隨時更改，不再使用系統預設雲端位置。
      </p>

      <div className="card" style={{ marginTop: 18, maxWidth: 520 }}>
        <div className="field">
          <label>報表月份</label>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </div>
      </div>

      <ManualCloudExportPanel month={month} />
    </div>
  )
}
