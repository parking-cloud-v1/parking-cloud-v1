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
        Google Drive 為正式歸檔，本機 ZIP 為備援下載；主管可查看全部停車場，管理員僅能處理自己被指派的停車場。
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
