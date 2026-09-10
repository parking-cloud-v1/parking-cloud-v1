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
        報表中心改為直接對應現場正式模組；Google Drive 與本機備份共用同一份資料來源。違規案件不再放在報表中心，請到「違規即時通知」查看、下載或舉發。
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
