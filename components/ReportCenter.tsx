'use client'

import { useState } from 'react'
import GoogleDriveReportPanel from '@/components/GoogleDriveReportPanel'
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
        報表中心只保留正式月報／報表類別；Google Drive 與本機備份共用同一份資料來源。違規案件請到「違規即時通知」處理；登革熱請到各停車場「登革熱消毒作業」頁逐日手動上傳 Google Drive。
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

      <GoogleDriveReportPanel month={month} />
      <ManualCloudExportPanel month={month} />
    </div>
  )
}
