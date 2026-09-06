import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import OnlineReportCsvButtons from '@/components/OnlineReportCsvButtons'
import admin from '@/components/OnlineAdmin.module.css'

const PAGE_SIZE = 1000

function dateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function startOfCurrentMonth() {
  const now = new Date()
  return dateString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
}

function today() {
  return dateString(new Date())
}

function isDateText(value?: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return dateString(date)
}

function statusText(value?: string | null) {
  if (value === 'pending') return '待審核'
  if (value === 'approved') return '已核准'
  if (value === 'needs_revision') return '待補件'
  if (value === 'rejected') return '未通過'
  if (value === 'waiting') return '候補'
  if (value === 'contract_sent') return '待簽約'
  if (value === 'completed') return '已完成'
  return value || '-'
}

function contractStatusText(value?: string | null) {
  if (value === 'draft') return '草稿'
  if (value === 'sent') return '待簽約'
  if (value === 'signed') return '已簽署'
  if (value === 'cancelled') return '已取消'
  return value || '-'
}

function syncText(value?: string | null) {
  if (value === 'pending') return '待同步'
  if (value === 'synced') return '已進月租總表'
  if (value === 'conflict') return '資料衝突'
  if (value === 'error') return '同步失敗'
  return value || '-'
}

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-TW') : ''
}

function averageHours(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length / 3_600_000
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0
  return (numerator / denominator) * 100
}

async function fetchAllApplications(
  supabase: any,
  from: string,
  toExclusive: string,
  lotId?: string | null
) {
  const rows: any[] = []
  for (let start = 0; ; start += PAGE_SIZE) {
    let query = supabase
      .from('rental_applications')
      .select(`
        id, parking_lot_id, application_kind, customer_code, applicant_name, vehicle_plate,
        rental_type, status, created_at, reviewed_at
      `)
      .gte('created_at', `${from}T00:00:00`)
      .lt('created_at', `${toExclusive}T00:00:00`)
      .order('created_at', { ascending: true })
      .range(start, start + PAGE_SIZE - 1)

    if (lotId) query = query.eq('parking_lot_id', lotId)

    const { data, error } = await query
    if (error) throw error
    const page = data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

async function fetchContractsByApplicationIds(supabase: any, applicationIds: string[]) {
  if (!applicationIds.length) return []
  const rows: any[] = []
  const chunkSize = 200

  for (let index = 0; index < applicationIds.length; index += chunkSize) {
    const ids = applicationIds.slice(index, index + chunkSize)
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        id, application_id, parking_lot_id, contract_no, status, created_at,
        signed_at, monthly_sync_status, monthly_sync_error
      `)
      .in('application_id', ids)

    if (error) throw error
    rows.push(...(data || []))
  }

  return rows
}

export default async function OnlineOperationReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string
    to?: string
    lot?: string
  }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const params = await searchParams
  const from = isDateText(params.from) ? params.from! : startOfCurrentMonth()
  const to = isDateText(params.to) ? params.to! : today()
  const safeFrom = from <= to ? from : to
  const safeTo = from <= to ? to : from
  const toExclusive = nextDate(safeTo)

  const [{ data: profile }, { data: accessibleLots, error: lotsError }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('parking_lots').select('id,name,status').order('name'),
  ])

  const lots = accessibleLots || []
  const lotNameById = new Map(lots.map((lot: any) => [lot.id, lot.name]))
  const isSupervisor = profile?.role === 'supervisor'
  const workLotId = await getCurrentWorkParkingLotId()

  let selectedLotId: string | null = null
  if (isSupervisor) {
    if (params.lot && params.lot !== 'all' && lots.some((lot: any) => lot.id === params.lot)) {
      selectedLotId = params.lot
    }
  } else {
    selectedLotId = workLotId || null
  }

  if (!isSupervisor && !selectedLotId) {
    return (
      <div className={admin.page}>
        <h1 style={{ marginTop: 0 }}>線上申請營運報表</h1>
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          請先從左側選擇「目前工作停車場」。
        </div>
      </div>
    )
  }

  let applications: any[] = []
  let contracts: any[] = []
  let errorText = lotsError?.message || ''

  if (!errorText) {
    try {
      applications = await fetchAllApplications(
        supabase,
        safeFrom,
        toExclusive,
        selectedLotId
      )
      contracts = await fetchContractsByApplicationIds(
        supabase,
        applications.map((row: any) => row.id)
      )
    } catch (error: any) {
      errorText = error?.message || '報表資料讀取失敗'
    }
  }

  const contractsByApp = new Map<string, any>()
  for (const contract of contracts) {
    if (!contract.application_id) continue
    const existing = contractsByApp.get(contract.application_id)
    if (!existing || new Date(contract.created_at).getTime() > new Date(existing.created_at).getTime()) {
      contractsByApp.set(contract.application_id, contract)
    }
  }

  const includedLotIds = selectedLotId
    ? [selectedLotId]
    : lots.map((lot: any) => lot.id)

  const summaryRows = includedLotIds
    .map((lotId) => {
      const appRows = applications.filter((row: any) => row.parking_lot_id === lotId)
      const appIds = new Set(appRows.map((row: any) => row.id))
      const contractRows = contracts.filter((row: any) => appIds.has(row.application_id))
      const eligibleContracts = contractRows.filter((row: any) => row.status !== 'cancelled')
      const signedContracts = eligibleContracts.filter((row: any) => row.status === 'signed')
      const decidedApps = appRows.filter((row: any) =>
        ['approved', 'contract_sent', 'completed', 'rejected'].includes(row.status)
      )
      const approvedApps = appRows.filter((row: any) =>
        ['approved', 'contract_sent', 'completed'].includes(row.status)
      )
      const reviewDurations = appRows
        .filter((row: any) => row.reviewed_at)
        .map(
          (row: any) =>
            new Date(row.reviewed_at).getTime() - new Date(row.created_at).getTime()
        )
        .filter((value: number) => value >= 0)
      const signDurations = signedContracts
        .filter((row: any) => row.signed_at)
        .map(
          (row: any) =>
            new Date(row.signed_at).getTime() - new Date(row.created_at).getTime()
        )
        .filter((value: number) => value >= 0)

      return {
        lotId,
        parkingLot: lotNameById.get(lotId) || '未知停車場',
        applications: appRows.length,
        newApplications: appRows.filter((row: any) => row.application_kind !== 'renewal').length,
        renewals: appRows.filter((row: any) => row.application_kind === 'renewal').length,
        pending: appRows.filter((row: any) => row.status === 'pending').length,
        needsRevision: appRows.filter((row: any) => row.status === 'needs_revision').length,
        waiting: appRows.filter((row: any) => row.status === 'waiting').length,
        rejected: appRows.filter((row: any) => row.status === 'rejected').length,
        contractSent: appRows.filter((row: any) => row.status === 'contract_sent').length,
        completed: appRows.filter((row: any) => row.status === 'completed').length,
        approvalRateValue: percent(approvedApps.length, decidedApps.length),
        avgReviewHoursValue: averageHours(reviewDurations),
        contracts: eligibleContracts.length,
        signed: signedContracts.length,
        signRateValue: percent(signedContracts.length, eligibleContracts.length),
        avgSignHoursValue: averageHours(signDurations),
        syncIssues: signedContracts.filter((row: any) =>
          ['conflict', 'error'].includes(row.monthly_sync_status)
        ).length,
      }
    })
    .sort((a, b) => a.parkingLot.localeCompare(b.parkingLot, 'zh-Hant'))

  const totalApps = applications.length
  const totalNewApplications = applications.filter((row: any) => row.application_kind !== 'renewal').length
  const totalRenewals = applications.filter((row: any) => row.application_kind === 'renewal').length
  const totalPending = applications.filter((row: any) => row.status === 'pending').length
  const totalRevision = applications.filter((row: any) => row.status === 'needs_revision').length
  const totalWaiting = applications.filter((row: any) => row.status === 'waiting').length
  const totalCompleted = applications.filter((row: any) => row.status === 'completed').length
  const totalRejected = applications.filter((row: any) => row.status === 'rejected').length
  const totalDecided = applications.filter((row: any) =>
    ['approved', 'contract_sent', 'completed', 'rejected'].includes(row.status)
  ).length
  const totalApproved = applications.filter((row: any) =>
    ['approved', 'contract_sent', 'completed'].includes(row.status)
  ).length
  const activeContracts = contracts.filter((row: any) => row.status !== 'cancelled')
  const totalSigned = activeContracts.filter((row: any) => row.status === 'signed').length
  const totalSyncIssues = activeContracts.filter(
    (row: any) =>
      row.status === 'signed' && ['conflict', 'error'].includes(row.monthly_sync_status)
  ).length

  const exportSummaryRows = summaryRows.map((row) => ({
    parkingLot: row.parkingLot,
    applications: row.applications,
    newApplications: row.newApplications,
    renewals: row.renewals,
    pending: row.pending,
    needsRevision: row.needsRevision,
    waiting: row.waiting,
    rejected: row.rejected,
    contractSent: row.contractSent,
    completed: row.completed,
    approvalRate: `${row.approvalRateValue.toFixed(1)}%`,
    avgReviewHours: row.avgReviewHoursValue.toFixed(1),
    contracts: row.contracts,
    signed: row.signed,
    signRate: `${row.signRateValue.toFixed(1)}%`,
    avgSignHours: row.avgSignHoursValue.toFixed(1),
    syncIssues: row.syncIssues,
  }))

  const detailRows = applications.map((row: any) => {
    const contract = contractsByApp.get(row.id)
    return {
      applicationId: row.id,
      applicationKind: row.application_kind === 'renewal' ? '續租' : '新申請',
      parkingLot: lotNameById.get(row.parking_lot_id) || '未知停車場',
      appliedAt: formatTime(row.created_at),
      customerCode: row.customer_code || '',
      applicantName: row.applicant_name || '',
      vehiclePlate: row.vehicle_plate || '',
      rentalType: row.rental_type || '',
      applicationStatus: statusText(row.status),
      reviewedAt: formatTime(row.reviewed_at),
      contractNo: contract?.contract_no || '',
      contractStatus: contract ? contractStatusText(contract.status) : '',
      signedAt: formatTime(contract?.signed_at),
      monthlySyncStatus: contract ? syncText(contract.monthly_sync_status) : '',
    }
  })

  return (
    <div className={admin.page}>
      <div className={admin.headerPanel}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>線上申請營運報表</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {isSupervisor
              ? '主管可查看所有有權限的停車場並比較線上申請、審核與簽約成果。'
              : `目前工作停車場：${lotNameById.get(selectedLotId || '') || '-'}`}
          </p>
        </div>
        <div className={admin.headerActions}>
          <Link href="/dashboard/online/applications">線上申請</Link>
          <Link href="/dashboard/online/contracts">電子契約</Link>
          <Link href="/dashboard/online/capacity">名額控管</Link>
          <Link href="/dashboard/online/reminders">待辦提醒</Link>
          <Link href="/dashboard/online/audit">操作紀錄</Link>
        </div>
      </div>

      <form
        method="get"
        className="card"
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
          gap: 14,
          alignItems: 'end',
        }}
      >
        <div className="field">
          <label>開始日期</label>
          <input type="date" name="from" defaultValue={safeFrom} />
        </div>
        <div className="field">
          <label>結束日期</label>
          <input type="date" name="to" defaultValue={safeTo} />
        </div>

        {isSupervisor && (
          <div className="field">
            <label>停車場</label>
            <select name="lot" defaultValue={selectedLotId || 'all'}>
              <option value="all">全部可管理停車場</option>
              {lots.map((lot: any) => (
                <option key={lot.id} value={lot.id}>
                  {lot.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <button type="submit" className="btn">
            查詢報表
          </button>
        </div>
      </form>

      {errorText && (
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          報表讀取失敗：{errorText}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
          gap: 12,
          marginTop: 20,
        }}
      >
        <div className="card"><div className="muted">申請件數</div><strong style={{ fontSize: 24 }}>{totalApps}</strong></div>
        <div className="card"><div className="muted">新申請</div><strong style={{ fontSize: 24 }}>{totalNewApplications}</strong></div>
        <div className="card"><div className="muted">續租申請</div><strong style={{ fontSize: 24 }}>{totalRenewals}</strong></div>
        <div className="card"><div className="muted">待審核</div><strong style={{ fontSize: 24 }}>{totalPending}</strong></div>
        <div className="card"><div className="muted">待補件</div><strong style={{ fontSize: 24 }}>{totalRevision}</strong></div>
        <div className="card"><div className="muted">候補</div><strong style={{ fontSize: 24 }}>{totalWaiting}</strong></div>
        <div className="card"><div className="muted">已完成</div><strong style={{ fontSize: 24 }}>{totalCompleted}</strong></div>
        <div className="card"><div className="muted">未通過</div><strong style={{ fontSize: 24 }}>{totalRejected}</strong></div>
        <div className="card"><div className="muted">核准率</div><strong style={{ fontSize: 24 }}>{percent(totalApproved, totalDecided).toFixed(1)}%</strong></div>
        <div className="card"><div className="muted">簽約完成率</div><strong style={{ fontSize: 24 }}>{percent(totalSigned, activeContracts.length).toFixed(1)}%</strong></div>
        <div className="card"><div className="muted">同步異常</div><strong style={{ fontSize: 24, color: totalSyncIssues ? '#b91c1c' : undefined }}>{totalSyncIssues}</strong></div>
      </div>

      <div
        className="card"
        style={{
          marginTop: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong>報表期間：{safeFrom} ～ {safeTo}</strong>
          <div className="muted" style={{ marginTop: 4 }}>
            CSV 為 UTF-8 BOM 格式，可直接用 Excel 開啟。申請明細不輸出手機號碼，降低不必要的個資外流風險。
          </div>
        </div>
        <OnlineReportCsvButtons
          from={safeFrom}
          to={safeTo}
          summaryRows={exportSummaryRows}
          detailRows={detailRows}
        />
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>場站統計</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 1500, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>停車場</th>
                <th>申請</th>
                <th>新申請</th>
                <th>續租</th>
                <th>待審核</th>
                <th>待補件</th>
                <th>候補</th>
                <th>未通過</th>
                <th>待簽約</th>
                <th>已完成</th>
                <th>核准率</th>
                <th>平均審核</th>
                <th>契約</th>
                <th>已簽署</th>
                <th>簽約完成率</th>
                <th>平均簽署</th>
                <th>同步異常</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.lotId} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 8 }}><strong>{row.parkingLot}</strong></td>
                  <td style={{ padding: 8 }}>{row.applications}</td>
                  <td style={{ padding: 8 }}>{row.newApplications}</td>
                  <td style={{ padding: 8 }}>{row.renewals}</td>
                  <td style={{ padding: 8 }}>{row.pending}</td>
                  <td style={{ padding: 8 }}>{row.needsRevision}</td>
                  <td style={{ padding: 8 }}>{row.waiting}</td>
                  <td style={{ padding: 8 }}>{row.rejected}</td>
                  <td style={{ padding: 8 }}>{row.contractSent}</td>
                  <td style={{ padding: 8 }}>{row.completed}</td>
                  <td style={{ padding: 8 }}>{row.approvalRateValue.toFixed(1)}%</td>
                  <td style={{ padding: 8 }}>{row.avgReviewHoursValue.toFixed(1)} 小時</td>
                  <td style={{ padding: 8 }}>{row.contracts}</td>
                  <td style={{ padding: 8 }}>{row.signed}</td>
                  <td style={{ padding: 8 }}>{row.signRateValue.toFixed(1)}%</td>
                  <td style={{ padding: 8 }}>{row.avgSignHoursValue.toFixed(1)} 小時</td>
                  <td style={{ padding: 8, color: row.syncIssues ? '#b91c1c' : undefined }}>
                    {row.syncIssues}
                  </td>
                </tr>
              ))}
              {!summaryRows.length && (
                <tr>
                  <td colSpan={17} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                    此期間沒有線上申請資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>申請明細</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 1320, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>申請時間</th>
                <th>類型</th>
                <th>停車場</th>
                <th>客戶編號</th>
                <th>姓名</th>
                <th>車牌</th>
                <th>月租類型</th>
                <th>案件狀態</th>
                <th>審核時間</th>
                <th>契約編號</th>
                <th>契約狀態</th>
                <th>簽署時間</th>
                <th>月租同步</th>
              </tr>
            </thead>
            <tbody>
              {detailRows.map((row) => (
                <tr key={row.applicationId} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 8 }}>{row.appliedAt}</td>
                  <td style={{ padding: 8 }}>{row.applicationKind}</td>
                  <td style={{ padding: 8 }}>{row.parkingLot}</td>
                  <td style={{ padding: 8 }}>{row.customerCode || '-'}</td>
                  <td style={{ padding: 8 }}>
                    <Link href={`/dashboard/online/applications/${row.applicationId}`}>
                      {row.applicantName}
                    </Link>
                  </td>
                  <td style={{ padding: 8 }}>{row.vehiclePlate}</td>
                  <td style={{ padding: 8 }}>{row.rentalType || '-'}</td>
                  <td style={{ padding: 8 }}>{row.applicationStatus}</td>
                  <td style={{ padding: 8 }}>{row.reviewedAt || '-'}</td>
                  <td style={{ padding: 8 }}>{row.contractNo || '-'}</td>
                  <td style={{ padding: 8 }}>{row.contractStatus || '-'}</td>
                  <td style={{ padding: 8 }}>{row.signedAt || '-'}</td>
                  <td style={{ padding: 8 }}>{row.monthlySyncStatus || '-'}</td>
                </tr>
              ))}
              {!detailRows.length && (
                <tr>
                  <td colSpan={12} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                    此期間沒有申請明細
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
