'use client'

import { useMemo, useState } from 'react'

type Report = {
  id: string
  closing_date: string
  shift_start_at: string
  shift_end_at: string
  closing_status: string
  amount_due: number
  amount_paid: number
  aps_monthly_count: number
  aps_monthly_amount: number
  electronic_payment_total: number
  mobile_payment_total: number
  cash_actual: number
  temporary_cash: number
  monthly_cash: number
  daily_cash_total: number
  remittance_total: number
  operator_name: string | null
  notes: string | null
}

type Machine = {
  machine_no: number
  machine_name: string
  invoice_start_no: string | null
  invoice_end_no: string | null
  amount_due: number
  amount_paid: number
  aps_monthly_count: number
  aps_monthly_amount: number
  electronic_payment_total: number
  mobile_payment_total: number
  cash_actual: number
}

type Detail = {
  detail_start_date: string
  detail_end_date: string
  temporary_cash: number
  monthly_cash: number
  daily_cash_total: number
  sort_order: number
}

function money(v: any) {
  const n = Number(v || 0)
  return `NT$${n.toLocaleString('zh-TW')}`
}

function dateText(value?: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('zh-TW')
}

function timeText(value?: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function ShiftClosingCompanyReport({
  companyName,
  parkingLotName,
  report,
  machines,
  details,
}: {
  companyName: string
  parkingLotName: string
  report: Report
  machines: Machine[]
  details: Detail[]
}) {
  const [selected, setSelected] = useState<'all' | string>('all')

  const selectedMachine = useMemo(() => {
    if (selected === 'all') return null
    return machines.find((x) => String(x.machine_no) === selected) || null
  }, [selected, machines])

  const view = selectedMachine
    ? {
        name: selectedMachine.machine_name || `繳費機 ${selectedMachine.machine_no}`,
        invoiceStart: selectedMachine.invoice_start_no || '-',
        invoiceEnd: selectedMachine.invoice_end_no || '-',
        amountDue: Number(selectedMachine.amount_due || 0),
        amountPaid: Number(selectedMachine.amount_paid || 0),
        apsCount: Number(selectedMachine.aps_monthly_count || 0),
        apsAmount: Number(selectedMachine.aps_monthly_amount || 0),
        electronic: Number(selectedMachine.electronic_payment_total || 0),
        mobile: Number(selectedMachine.mobile_payment_total || 0),
        cash: Number(selectedMachine.cash_actual || 0),
      }
    : {
        name: '全部繳費機合計',
        invoiceStart: machines.length === 1 ? machines[0]?.invoice_start_no || '-' : '-',
        invoiceEnd: machines.length === 1 ? machines[0]?.invoice_end_no || '-' : '-',
        amountDue: Number(report.amount_due || 0),
        amountPaid: Number(report.amount_paid || 0),
        apsCount: Number(report.aps_monthly_count || 0),
        apsAmount: Number(report.aps_monthly_amount || 0),
        electronic: Number(report.electronic_payment_total || 0),
        mobile: Number(report.mobile_payment_total || 0),
        cash: Number(report.cash_actual || 0),
      }

  const digital = view.electronic + view.mobile
  const firstDetail = details[0]
  const temporaryCash = selectedMachine ? view.cash : Number(report.temporary_cash ?? firstDetail?.temporary_cash ?? 0)
  const monthlyCash = selectedMachine ? view.apsAmount : Number(report.monthly_cash ?? firstDetail?.monthly_cash ?? 0)
  const dailyCash = selectedMachine ? temporaryCash + monthlyCash : Number(report.daily_cash_total ?? firstDetail?.daily_cash_total ?? 0)

  return (
    <main className="company-report-page">
      <style jsx global>{`
        html,body{margin:0;background:#eef2f7;font-family:Arial,'Noto Sans TC',sans-serif;color:#111827}
        *{box-sizing:border-box}
        .company-report-page{min-height:100vh;padding:18px}
        .toolbar{max-width:760px;margin:0 auto 12px;display:flex;gap:10px;align-items:end;flex-wrap:wrap}
        .toolbar .field{min-width:240px;flex:1}
        .toolbar label{display:block;font-weight:800;margin-bottom:5px}
        .toolbar select,.toolbar button{width:100%;min-height:42px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:8px 10px;font-size:15px}
        .toolbar button{width:auto;background:#0f172a;color:#fff;border:0;font-weight:800;cursor:pointer}
        .sheet{max-width:760px;margin:0 auto;background:#fff;border:1px solid #d1d5db}
        .title{display:grid;grid-template-columns:1fr 190px;background:#fde68a;border-bottom:1px solid #9ca3af;font-size:22px;font-weight:900;text-align:center}
        .title>div{padding:8px;border-right:1px solid #9ca3af}.title>div:last-child{border-right:0}
        .grid{display:grid;grid-template-columns:1.1fr 1.1fr 1fr 1.1fr;border-bottom:1px solid #9ca3af}
        .cell{min-height:38px;padding:7px 8px;border-right:1px solid #9ca3af;border-bottom:1px solid #d1d5db;display:flex;align-items:center;justify-content:center;text-align:center}
        .grid>.cell:nth-child(4n){border-right:0}.grid>.cell:nth-last-child(-n+4){border-bottom:0}
        .label{background:#fff7d6;font-weight:800}.strong{font-weight:900;font-size:19px}.good{background:#dcfce7}.pink{background:#fee2e2}.blue{background:#dbeafe}.gray{background:#e5e7eb}.yellow{background:#fde68a}
        .sectionTitle{padding:7px 10px;text-align:center;font-weight:900;font-size:19px;background:#dcfce7;border-bottom:1px solid #9ca3af}
        .cashTable{width:100%;border-collapse:collapse}.cashTable th,.cashTable td{border:1px solid #9ca3af;padding:7px;text-align:center}.cashTable th{background:#fecaca}.cashTable tfoot td{background:#dcfce7;font-weight:900;font-size:18px}
        .note{padding:10px;border-top:1px solid #9ca3af;font-size:13px;color:#475569}
        @media(max-width:620px){.company-report-page{padding:6px}.title{grid-template-columns:1fr 120px;font-size:17px}.grid{grid-template-columns:1fr 1fr}.grid>.cell{border-right:1px solid #9ca3af;border-bottom:1px solid #d1d5db}.grid>.cell:nth-child(2n){border-right:0}.strong{font-size:17px}.sheet{font-size:14px}}
        @media print{body{background:#fff}.company-report-page{padding:0}.toolbar{display:none}.sheet{border:0;max-width:none;width:100%}@page{size:A4 portrait;margin:7mm}}
      `}</style>

      <div className="toolbar">
        <div className="field">
          <label>選擇公司回報繳費機</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="all">全部繳費機合計</option>
            {machines.map((m) => (
              <option key={m.machine_no} value={String(m.machine_no)}>
                {m.machine_name || `繳費機 ${m.machine_no}`}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={() => window.print()}>列印／另存 PDF</button>
      </div>

      <section className="sheet">
        <div className="title">
          <div>{companyName}－{parkingLotName}</div>
          <div>{dateText(report.closing_date)}</div>
        </div>

        <div className="grid">
          <div className="cell label">值班時間</div><div className="cell">{timeText(report.shift_start_at)}-{timeText(report.shift_end_at)}</div>
          <div className="cell label">結班員</div><div className="cell">{report.operator_name || '-'}</div>
          <div className="cell label">開班日期</div><div className="cell">{dateText(report.shift_start_at)}</div>
          <div className="cell label">結班日期</div><div className="cell">{dateText(report.shift_end_at)}</div>
          <div className="cell label">開班時間</div><div className="cell">{timeText(report.shift_start_at)}</div>
          <div className="cell label">結班時間</div><div className="cell">{timeText(report.shift_end_at)}</div>
          <div className="cell label">繳費機</div><div className="cell strong blue">{view.name}</div>
          <div className="cell label">結班狀態</div><div className="cell strong">{report.closing_status === 'normal' ? '正常' : '異常'}</div>
          <div className="cell label">繳費機發票起號</div><div className="cell">{view.invoiceStart}</div>
          <div className="cell label">繳費機發票結束</div><div className="cell">{view.invoiceEnd}</div>
          <div className="cell label yellow">應收總計</div><div className="cell strong yellow">{money(view.amountDue)}</div>
          <div className="cell label yellow">實收總計</div><div className="cell strong good">{money(view.amountPaid)}</div>
          <div className="cell label blue">APS 月租總筆數</div><div className="cell">{view.apsCount}</div>
          <div className="cell label yellow">APS 本日月租額</div><div className="cell pink">{money(view.apsAmount)}</div>
          <div className="cell label blue">電子支付總額</div><div className="cell">{money(view.electronic)}</div>
          <div className="cell label blue">手機支付總額</div><div className="cell">{money(view.mobile)}</div>
          <div className="cell label gray">電子＋手機支付</div><div className="cell gray">{money(digital)}</div>
          <div className="cell label">扣除電子＋手機＋月租後臨停現金</div><div className="cell strong">{money(temporaryCash)}</div>
        </div>

        <div className="sectionTitle">本班現金實收</div>
        <table className="cashTable">
          <thead><tr><th>匯款金額開始日</th><th>匯款金額結束日</th><th>臨停現金</th><th>月租現金</th><th>當日現金總計</th></tr></thead>
          <tbody>
            {(selectedMachine ? [{...firstDetail, temporary_cash: temporaryCash, monthly_cash: monthlyCash, daily_cash_total: dailyCash}] : details).map((d:any, i:number) => (
              <tr key={i}><td>{d?.detail_start_date || dateText(report.shift_start_at)}</td><td>{d?.detail_end_date || dateText(report.shift_end_at)}</td><td>{money(d?.temporary_cash)}</td><td>{money(d?.monthly_cash)}</td><td>{money(d?.daily_cash_total)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={4}>各項加總</td><td>{selectedMachine ? money(dailyCash) : money(report.remittance_total)}</td></tr></tfoot>
        </table>
        {report.notes && <div className="note">備註／異常說明：{report.notes}</div>}
      </section>
    </main>
  )
}
