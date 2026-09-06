import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import OnlineAuditCsvButton from '@/components/OnlineAuditCsvButton'
import admin from '@/components/OnlineAdmin.module.css'

const MAX_ROWS = 500

function taipeiDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function validDate(value?: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function actionCategory(action: string) {
  if (action.includes('MONTHLY_RENTAL')) return '月租同步'
  if (action.includes('REMINDER') || action.includes('INVITATION') || action.includes('SUPPLEMENT_LINK')) return '提醒通知'
  if (action.includes('CAPACITY')) return '名額控管'
  if (action.includes('SETTINGS')) return '系統設定'
  if (action.includes('CONTRACT')) return '電子契約'
  if (action.includes('WAITLIST') || action.includes('WAITING')) return '候補'
  if (action.includes('APPLICATION') || action.includes('SUPPLEMENT')) return '線上申請'
  return '其他'
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    APPLICATION_SUPPLEMENT_REQUESTED: '要求申請人補件',
    APPLICATION_SUPPLEMENT_COMPLETED: '申請人完成補件',
    APPLICATION_SUPPLEMENT_LINK_REGENERATED: '重新產生補件連結',
    APPLICATION_WAITLISTED: '線上案件轉候補',
    APPLICATION_REJECTED: '申請審核未通過',
    APPLICATION_APPROVED_CONTRACT_CREATED: '核准並建立契約',
    WAITLIST_CONVERTED_CONTRACT_CREATED: '候補轉正式並建立契約',
    CONTRACT_REISSUED_AFTER_REVIEW: '重新審核並重建契約',
    CONTRACT_CANCELLED_FOR_REVIEW: '取消待簽並退回審核',
    CONTRACT_SIGN_LINK_REGENERATED: '重新產生簽約連結',
    CONTRACT_SIGNED: '完成電子簽署',
    CONTRACT_SIGN_SUBMIT_DUPLICATE: '重複送出已簽署契約',
    MONTHLY_RENTAL_SYNCED: '契約同步月租成功',
    MONTHLY_RENTAL_RENEWED_FROM_CONTRACT: '既有月租依契約續租',
    MONTHLY_RENTAL_RESIGNED_FROM_CONTRACT: '既有月租依新契約更新',
    MONTHLY_RENTAL_SYNC_CONFLICT: '月租同步資料衝突',
    MONTHLY_RENTAL_SYNC_ERROR: '月租同步失敗',
    MONTHLY_RENTAL_SYNC_RECOVERED: '月租同步異常已恢復',
    MONTHLY_RENTAL_SYNC_RETRY: '人工重新同步月租',
    ONLINE_APPLICATION_SETTINGS_UPDATED: '更新公開申請設定',
    ONLINE_REMINDER_SETTINGS_UPDATED: '更新待辦提醒設定',
    SUPPLEMENT_REMINDER_SENT: '發送補件提醒',
    WAITING_STATUS_REMINDER_SENT: '發送候補進度提醒',
    APPLICATION_AUTO_WAITLISTED_CAPACITY_FULL: '名額已滿自動轉候補',
    CAPACITY_AUTO_WAITLIST_CHECK_FAILED: '自動候補名額判斷失敗',
    CAPACITY_RESERVATION_FINALIZE_FAILED: '名額保留完成標記失敗',
    RENEWAL_APPLICATION_SUBMITTED: '既有月租戶送出續租申請',
    RENEWAL_INVITATION_BATCH_SENT: '批次發送續租邀請',
  }
  return labels[action] || action
}

function normalizedResult(row: any) {
  const detail = row?.detail || {}
  const stored = String(row?.result || 'success')
  const resultStatus = String(detail?.result_status || '').toLowerCase()
  const smsStatus = String(detail?.sms_status || '').toLowerCase()

  if (resultStatus === 'error') return 'error'
  if (resultStatus === 'conflict' || smsStatus === 'failed') return 'warning'
  if (stored === 'error' || stored === 'warning' || stored === 'info') return stored
  return 'success'
}

function resultLabel(value: string) {
  if (value === 'success') return '成功'
  if (value === 'warning') return '需注意'
  if (value === 'error') return '失敗'
  return '資訊'
}

function resultColor(value: string) {
  if (value === 'error') return '#b91c1c'
  if (value === 'warning') return '#b45309'
  if (value === 'success') return '#15803d'
  return '#475569'
}

function shortId(value?: string | null) {
  if (!value) return '-'
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

function detailSummary(detail: any) {
  if (!detail || typeof detail !== 'object') return '-'

  const pieces: string[] = []
  const add = (label: string, value: unknown) => {
    if (value === null || value === undefined || String(value).trim() === '') return
    pieces.push(`${label}：${String(value)}`)
  }

  add('契約', detail.contract_no)
  add('客戶編號', detail.customer_code)
  add('審核備註', detail.review_note)
  add('同步結果', detail.result_status)
  add('同步訊息', detail.result_message)
  add('簡訊', detail.sms_status)
  add('候補ID', detail.waiting_list_id ? shortId(String(detail.waiting_list_id)) : '')
  add('期限', detail.expires_at ? new Date(detail.expires_at).toLocaleString('zh-TW') : '')
  add('原因', detail.reason)

  return pieces.length ? pieces.slice(0, 4).join('；') : '-'
}

export default async function OnlineAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string
    to?: string
    lot?: string
    category?: string
    result?: string
    q?: string
  }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const params = await searchParams
  const defaultFrom = taipeiDate(-6)
  const defaultTo = taipeiDate(0)
  const rawFrom = validDate(params.from) ? params.from! : defaultFrom
  const rawTo = validDate(params.to) ? params.to! : defaultTo
  const from = rawFrom <= rawTo ? rawFrom : rawTo
  const to = rawFrom <= rawTo ? rawTo : rawFrom
  const toExclusive = nextDate(to)
  const categoryFilter = params.category || 'all'
  const resultFilter = params.result || 'all'
  const keyword = String(params.q || '').trim().toLowerCase()

  const [{ data: profile }, { data: lots, error: lotsError }] = await Promise.all([
    supabase.from('profiles').select('role,full_name').eq('id', user.id).maybeSingle(),
    supabase.from('parking_lots').select('id,name,status').order('name'),
  ])

  const accessibleLots = lots || []
  const lotNameById = new Map(accessibleLots.map((lot: any) => [lot.id, lot.name]))
  const isSupervisor = profile?.role === 'supervisor'
  const workLotId = await getCurrentWorkParkingLotId()

  let selectedLotId: string | null = null
  if (isSupervisor) {
    if (
      params.lot &&
      params.lot !== 'all' &&
      accessibleLots.some((lot: any) => lot.id === params.lot)
    ) {
      selectedLotId = params.lot
    }
  } else {
    selectedLotId = workLotId || null
  }

  if (!isSupervisor && !selectedLotId) {
    return (
      <div className={admin.page}>
        <h1 style={{ marginTop: 0 }}>線上作業操作紀錄</h1>
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          請先從左側選擇「目前工作停車場」。
        </div>
      </div>
    )
  }

  let query = supabase
    .from('online_audit_logs')
    .select(`
      id, actor_user_id, parking_lot_id, application_id, contract_id,
      action, detail, result, source, error_message, request_id, created_at
    `)
    .gte('created_at', `${from}T00:00:00+08:00`)
    .lt('created_at', `${toExclusive}T00:00:00+08:00`)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)

  if (selectedLotId) query = query.eq('parking_lot_id', selectedLotId)

  const { data: rawRows, error: auditError } = await query
  const rows = rawRows || []

  const actorIds = Array.from(
    new Set(rows.map((row: any) => row.actor_user_id).filter(Boolean))
  ) as string[]

  const actorNameById = new Map<string, string>()
  if (actorIds.length) {
    const { data: actors } = await supabase
      .from('profiles')
      .select('id,full_name,role')
      .in('id', actorIds)

    for (const actor of actors || []) {
      actorNameById.set(
        actor.id,
        actor.full_name || (actor.role === 'supervisor' ? '主管' : '管理員')
      )
    }
  }

  const normalizedRows = rows.map((row: any) => {
    const category = actionCategory(row.action)
    const result = normalizedResult(row)
    const actor = row.actor_user_id
      ? actorNameById.get(row.actor_user_id) || '後台人員'
      : row.action === 'CONTRACT_SIGNED' || row.action.includes('SUPPLEMENT_COMPLETED')
        ? '民眾'
        : '系統'
    const detail = detailSummary(row.detail)
    const parkingLot = row.parking_lot_id
      ? lotNameById.get(row.parking_lot_id) || '未知停車場'
      : '系統'

    return {
      ...row,
      category,
      result,
      actor,
      detailText: detail,
      parkingLot,
      actionText: actionLabel(row.action),
    }
  })

  const filteredRows = normalizedRows.filter((row: any) => {
    if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
    if (resultFilter !== 'all' && row.result !== resultFilter) return false
    if (!keyword) return true

    const haystack = [
      row.action,
      row.actionText,
      row.actor,
      row.parkingLot,
      row.application_id || '',
      row.contract_id || '',
      row.detailText,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(keyword)
  })

  const successCount = filteredRows.filter((row: any) => row.result === 'success').length
  const warningCount = filteredRows.filter((row: any) => row.result === 'warning').length
  const errorCount = filteredRows.filter((row: any) => row.result === 'error').length

  const exportRows = filteredRows.map((row: any) => ({
    time: new Date(row.created_at).toLocaleString('zh-TW'),
    parkingLot: row.parkingLot,
    actor: row.actor,
    category: row.category,
    action: row.actionText,
    result: resultLabel(row.result),
    applicationId: row.application_id || '',
    contractId: row.contract_id || '',
    detail: row.detailText,
  }))

  const categories = ['線上申請', '候補', '名額控管', '電子契約', '提醒通知', '月租同步', '系統設定', '其他']

  return (
    <div className={admin.page}>
      <div className={admin.headerPanel}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>線上作業操作紀錄</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {isSupervisor
              ? '主管可跨場追查線上申請、補件、候補、契約、提醒與月租同步異動。'
              : `目前工作停車場：${lotNameById.get(selectedLotId || '') || '-'}`}
          </p>
        </div>

        <div className={admin.headerActions}>
          <Link href="/dashboard/online/capacity">名額控管</Link>
          <Link href="/dashboard/online/reports">營運報表</Link>
          <Link href="/dashboard/online/reminders">待辦提醒</Link>
          <Link href="/dashboard/online/applications">線上申請</Link>
          <Link href="/dashboard/online/contracts">電子契約</Link>
          {isSupervisor && <Link href="/dashboard/online/health">上線安全檢查</Link>}
        </div>
      </div>

      <form
        method="get"
        className="card"
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',
          gap: 14,
          alignItems: 'end',
        }}
      >
        <div className="field">
          <label>開始日期</label>
          <input type="date" name="from" defaultValue={from} />
        </div>
        <div className="field">
          <label>結束日期</label>
          <input type="date" name="to" defaultValue={to} />
        </div>

        {isSupervisor && (
          <div className="field">
            <label>停車場</label>
            <select name="lot" defaultValue={selectedLotId || 'all'}>
              <option value="all">全部可管理停車場</option>
              {accessibleLots.map((lot: any) => (
                <option key={lot.id} value={lot.id}>
                  {lot.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label>類別</label>
          <select name="category" defaultValue={categoryFilter}>
            <option value="all">全部類別</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>結果</label>
          <select name="result" defaultValue={resultFilter}>
            <option value="all">全部結果</option>
            <option value="success">成功</option>
            <option value="warning">需注意</option>
            <option value="error">失敗</option>
            <option value="info">資訊</option>
          </select>
        </div>

        <div className="field">
          <label>搜尋</label>
          <input
            name="q"
            defaultValue={params.q || ''}
            placeholder="操作、姓名、場站、申請ID、契約ID"
          />
        </div>

        <button type="submit" className="btn">
          套用篩選
        </button>
      </form>

      {(lotsError || auditError) && (
        <div className="card" style={{ marginTop: 20, color: '#b91c1c' }}>
          資料讀取失敗：{lotsError?.message || auditError?.message}
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
        <div className="card"><div className="muted">目前筆數</div><strong style={{ fontSize: 24 }}>{filteredRows.length}</strong></div>
        <div className="card"><div className="muted">成功</div><strong style={{ fontSize: 24, color: '#15803d' }}>{successCount}</strong></div>
        <div className="card"><div className="muted">需注意</div><strong style={{ fontSize: 24, color: '#b45309' }}>{warningCount}</strong></div>
        <div className="card"><div className="muted">失敗</div><strong style={{ fontSize: 24, color: '#b91c1c' }}>{errorCount}</strong></div>
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
        <div className="muted">
          最多顯示最近 {MAX_ROWS} 筆；匯出內容不包含手機號碼與 OTP。
        </div>
        <OnlineAuditCsvButton rows={exportRows} from={from} to={to} />
      </div>

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 1180, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th>時間</th>
              <th>停車場</th>
              <th>操作人員</th>
              <th>類別</th>
              <th>操作</th>
              <th>結果</th>
              <th>關聯資料</th>
              <th>摘要</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row: any) => (
              <tr key={row.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                  {new Date(row.created_at).toLocaleString('zh-TW')}
                </td>
                <td style={{ padding: 8 }}>{row.parkingLot}</td>
                <td style={{ padding: 8 }}>{row.actor}</td>
                <td style={{ padding: 8 }}>{row.category}</td>
                <td style={{ padding: 8 }}><strong>{row.actionText}</strong></td>
                <td style={{ padding: 8 }}>
                  <strong style={{ color: resultColor(row.result) }}>
                    {resultLabel(row.result)}
                  </strong>
                </td>
                <td style={{ padding: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {row.application_id && (
                      <Link href={`/dashboard/online/applications/${row.application_id}`}>
                        申請 {shortId(row.application_id)}
                      </Link>
                    )}
                    {row.contract_id && (
                      <Link href={`/dashboard/online/contracts/${row.contract_id}`}>
                        契約 {shortId(row.contract_id)}
                      </Link>
                    )}
                    {!row.application_id && !row.contract_id && '-'}
                  </div>
                </td>
                <td style={{ padding: 8, maxWidth: 380 }}>{row.detailText}</td>
              </tr>
            ))}

            {!filteredRows.length && (
              <tr>
                <td colSpan={8} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                  目前篩選條件沒有操作紀錄。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length >= MAX_ROWS && (
        <div className="muted" style={{ marginTop: 12 }}>
          此期間紀錄超過 {MAX_ROWS} 筆，請縮小日期範圍後再查詢或匯出。
        </div>
      )}
    </div>
  )
}
