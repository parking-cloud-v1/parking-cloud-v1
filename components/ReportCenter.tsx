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
        各類資料分開整理、分開下載，並可各自設定不同的 Google Drive 資料夾連結。
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
