'use client'

type AuditExportRow = {
  time: string
  parkingLot: string
  actor: string
  category: string
  action: string
  result: string
  applicationId: string
  contractId: string
  detail: string
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadCsv(filename: string, rows: string[][]) {
  const text = '\uFEFF' + rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function OnlineAuditCsvButton({
  rows,
  from,
  to,
}: {
  rows: AuditExportRow[]
  from: string
  to: string
}) {
  function exportCsv() {
    downloadCsv(`線上作業操作紀錄_${from}_${to}.csv`, [
      [
        '時間',
        '停車場',
        '操作人員',
        '類別',
        '操作',
        '結果',
        '申請ID',
        '契約ID',
        '摘要',
      ],
      ...rows.map((row) => [
        row.time,
        row.parkingLot,
        row.actor,
        row.category,
        row.action,
        row.result,
        row.applicationId,
        row.contractId,
        row.detail,
      ]),
    ])
  }

  return (
    <button type="button" className="btn" onClick={exportCsv} disabled={!rows.length}>
      匯出操作紀錄 CSV
    </button>
  )
}
