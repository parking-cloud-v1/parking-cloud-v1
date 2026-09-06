'use client'

type CsvValue = string | number | boolean | null | undefined

type SummaryRow = {
  parkingLot: string
  applications: number
  newApplications: number
  renewals: number
  pending: number
  needsRevision: number
  waiting: number
  rejected: number
  contractSent: number
  completed: number
  approvalRate: string
  avgReviewHours: string
  contracts: number
  signed: number
  signRate: string
  avgSignHours: string
  syncIssues: number
}

type DetailRow = {
  applicationId: string
  applicationKind: string
  parkingLot: string
  appliedAt: string
  customerCode: string
  applicantName: string
  vehiclePlate: string
  rentalType: string
  applicationStatus: string
  reviewedAt: string
  contractNo: string
  contractStatus: string
  signedAt: string
  monthlySyncStatus: string
}

function csvCell(value: CsvValue) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]) {
  const csv = [headers, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')

  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function OnlineReportCsvButtons({
  from,
  to,
  summaryRows,
  detailRows,
}: {
  from: string
  to: string
  summaryRows: SummaryRow[]
  detailRows: DetailRow[]
}) {
  function exportSummary() {
    downloadCsv(
      `線上申請營運統計_${from}_${to}.csv`,
      [
        '停車場',
        '申請件數',
        '新申請',
        '續租申請',
        '待審核',
        '待補件',
        '候補',
        '未通過',
        '待簽約',
        '已完成',
        '核准率',
        '平均審核小時',
        '契約件數',
        '已簽署',
        '簽約完成率',
        '平均簽署小時',
        '月租同步異常',
      ],
      summaryRows.map((row) => [
        row.parkingLot,
        row.applications,
        row.newApplications,
        row.renewals,
        row.pending,
        row.needsRevision,
        row.waiting,
        row.rejected,
        row.contractSent,
        row.completed,
        row.approvalRate,
        row.avgReviewHours,
        row.contracts,
        row.signed,
        row.signRate,
        row.avgSignHours,
        row.syncIssues,
      ])
    )
  }

  function exportDetails() {
    downloadCsv(
      `線上申請明細_${from}_${to}.csv`,
      [
        '申請編號',
        '停車場',
        '申請時間',
        '案件類型',
        '客戶編號',
        '姓名',
        '車牌',
        '月租類型',
        '申請狀態',
        '最近審核時間',
        '契約編號',
        '契約狀態',
        '簽署時間',
        '月租同步狀態',
      ],
      detailRows.map((row) => [
        row.applicationId,
        row.parkingLot,
        row.appliedAt,
        row.applicationKind,
        row.customerCode,
        row.applicantName,
        row.vehiclePlate,
        row.rentalType,
        row.applicationStatus,
        row.reviewedAt,
        row.contractNo,
        row.contractStatus,
        row.signedAt,
        row.monthlySyncStatus,
      ])
    )
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <button type="button" className="btn" onClick={exportSummary}>
        匯出場站統計 CSV
      </button>
      <button type="button" className="btn" onClick={exportDetails}>
        匯出申請明細 CSV
      </button>
    </div>
  )
}
