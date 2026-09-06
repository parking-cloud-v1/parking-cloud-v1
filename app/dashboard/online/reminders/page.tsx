import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import OnlineReminderSettingsEditor from '@/components/OnlineReminderSettingsEditor'
import SupplementReminderButton from '@/components/SupplementReminderButton'
import WaitingStatusReminderButton from '@/components/WaitingStatusReminderButton'
import ContractSignInviteButton from '@/components/ContractSignInviteButton'
import ContractMonthlySyncRetryButton from '@/components/ContractMonthlySyncRetryButton'
import admin from '@/components/OnlineAdmin.module.css'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function timeText(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-TW')
}

function ageText(ms: number) {
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / 60_000))} 分鐘`
  if (ms < DAY) return `${Math.floor(ms / HOUR)} 小時`
  return `${Math.floor(ms / DAY)} 天`
}

function dueText(target?: string | null) {
  if (!target) return '未設定期限'
  const diff = new Date(target).getTime() - Date.now()
  if (diff <= 0) return `已逾期 ${ageText(Math.abs(diff))}`
  return `剩餘 ${ageText(diff)}`
}

export default async function OnlineReminderCenterPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const workLotId = await getCurrentWorkParkingLotId()

  if (!workLotId) {
    return (
      <div className={admin.page}>
        <h1 style={{ marginTop: 0 }}>線上案件待辦提醒</h1>
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          請先從左側選擇「目前工作停車場」。
        </div>
      </div>
    )
  }

  const [{ data: lot }, { data: rawSetting }] = await Promise.all([
    supabase.from('parking_lots').select('id,name').eq('id', workLotId).maybeSingle(),
    supabase
      .from('online_reminder_settings')
      .select('*')
      .eq('parking_lot_id', workLotId)
      .maybeSingle(),
  ])

  const setting = {
    enabled: rawSetting?.enabled !== false,
    pending_review_hours: Number(rawSetting?.pending_review_hours || 24),
    supplement_warning_hours: Number(rawSetting?.supplement_warning_hours || 24),
    sign_warning_hours: Number(rawSetting?.sign_warning_hours || 24),
    waiting_followup_days: Number(rawSetting?.waiting_followup_days || 30),
    monthly_sync_pending_minutes: Number(
      rawSetting?.monthly_sync_pending_minutes || 10
    ),
    renewal_reminder_days: Number(rawSetting?.renewal_reminder_days || 20),
    renewal_repeat_days: Number(rawSetting?.renewal_repeat_days || 7),
    renewal_expired_grace_days: Number(
      rawSetting?.renewal_expired_grace_days ?? 30
    ),
    renewal_batch_limit: Number(rawSetting?.renewal_batch_limit || 100),
  }

  const [{ data: applicationRows, error: appError }, { data: contractRows, error: contractError }] =
    await Promise.all([
      supabase
        .from('rental_applications')
        .select(`
          id, applicant_name, phone, vehicle_plate, status, created_at,
          supplement_expires_at, supplement_requested_at, waiting_list_id
        `)
        .eq('parking_lot_id', workLotId)
        .in('status', ['pending', 'needs_revision', 'waiting'])
        .order('created_at', { ascending: true }),
      supabase
        .from('contracts')
        .select(`
          id, application_id, contract_no, customer_code, customer_name,
          vehicle_plate, status, signed_at, created_at, sign_token_expires_at,
          monthly_sync_status, monthly_sync_error
        `)
        .eq('parking_lot_id', workLotId)
        .in('status', ['sent', 'signed'])
        .order('created_at', { ascending: true }),
    ])

  const apps = applicationRows || []
  const contracts = contractRows || []
  const waitingIds = apps
    .filter((row: any) => row.status === 'waiting' && row.waiting_list_id)
    .map((row: any) => row.waiting_list_id)

  let waitingRows: any[] = []
  if (waitingIds.length) {
    const { data } = await supabase
      .from('monthly_waiting_list')
      .select('id,wait_no,status,registered_date,created_at')
      .in('id', waitingIds)
    waitingRows = data || []
  }

  const waitingAppIds = apps
    .filter((row: any) => row.status === 'waiting')
    .map((row: any) => row.id)

  let waitingReminderLogs: any[] = []
  if (waitingAppIds.length) {
    const { data } = await supabase
      .from('online_reminder_logs')
      .select('application_id,created_at,delivery_status')
      .eq('parking_lot_id', workLotId)
      .eq('reminder_type', 'waiting_status')
      .in('application_id', waitingAppIds)
      .order('created_at', { ascending: false })
    waitingReminderLogs = data || []
  }

  const waitingById = new Map(waitingRows.map((row: any) => [row.id, row]))
  const lastReminderByApp = new Map<string, string>()
  for (const log of waitingReminderLogs) {
    if (log.application_id && !lastReminderByApp.has(log.application_id)) {
      lastReminderByApp.set(log.application_id, log.created_at)
    }
  }

  const now = Date.now()

  const pendingTasks = setting.enabled
    ? apps.filter((row: any) => {
        if (row.status !== 'pending') return false
        return now - new Date(row.created_at).getTime() >= setting.pending_review_hours * HOUR
      })
    : []

  const supplementTasks = setting.enabled
    ? apps.filter((row: any) => {
        if (row.status !== 'needs_revision') return false
        if (!row.supplement_expires_at) return true
        return (
          new Date(row.supplement_expires_at).getTime() - now <=
          setting.supplement_warning_hours * HOUR
        )
      })
    : []

  const signTasks = setting.enabled
    ? contracts.filter((row: any) => {
        if (row.status !== 'sent') return false
        if (!row.sign_token_expires_at) return true
        return (
          new Date(row.sign_token_expires_at).getTime() - now <=
          setting.sign_warning_hours * HOUR
        )
      })
    : []

  const waitingTasks = setting.enabled
    ? apps.filter((row: any) => {
        if (row.status !== 'waiting') return false
        const waiting = row.waiting_list_id
          ? waitingById.get(row.waiting_list_id)
          : null
        const registeredAt = waiting?.registered_date
          ? new Date(`${waiting.registered_date}T00:00:00`).getTime()
          : new Date(row.created_at).getTime()
        const lastReminder = lastReminderByApp.get(row.id)
        const baseline = lastReminder
          ? Math.max(registeredAt, new Date(lastReminder).getTime())
          : registeredAt
        return now - baseline >= setting.waiting_followup_days * DAY
      })
    : []

  const syncTasks = setting.enabled
    ? contracts.filter((row: any) => {
        if (row.status !== 'signed') return false
        if (['conflict', 'error'].includes(row.monthly_sync_status)) return true
        if (row.monthly_sync_status !== 'pending') return false
        const signedAt = row.signed_at ? new Date(row.signed_at).getTime() : now
        return now - signedAt >= setting.monthly_sync_pending_minutes * 60_000
      })
    : []

  const totalTasks =
    pendingTasks.length +
    supplementTasks.length +
    signTasks.length +
    waitingTasks.length +
    syncTasks.length

  return (
    <div className={admin.page}>
      <div className={admin.headerPanel}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>線上案件待辦提醒</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {lot?.name || '目前停車場'}｜集中處理逾時審核、補件、簽約、候補與月租同步異常。
          </p>
        </div>
        <div className={admin.headerActions}>
          <Link href="/dashboard/online/renewal-reminders">續租提醒</Link>
          <Link href="/dashboard/online/capacity">名額控管</Link>
          <Link href="/dashboard/online/reports">營運報表</Link>
          <Link href="/dashboard/online/audit">操作紀錄</Link>
          <Link href="/dashboard/online/applications">線上申請</Link>
          <Link href="/dashboard/online/contracts">電子契約</Link>
        </div>
      </div>

      {(appError || contractError) && (
        <div className="card" style={{ marginTop: 20, color: '#b91c1c' }}>
          資料讀取異常：{appError?.message || contractError?.message}
        </div>
      )}

      {!setting.enabled && (
        <div
          className="card"
          style={{ marginTop: 20, border: '1px solid #fde68a', background: '#fffbeb' }}
        >
          此停車場目前已關閉待辦提醒。下方可重新啟用。
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
        <div className="card"><div className="muted">全部待辦</div><strong style={{ fontSize: 24 }}>{totalTasks}</strong></div>
        <div className="card"><div className="muted">審核逾時</div><strong style={{ fontSize: 24 }}>{pendingTasks.length}</strong></div>
        <div className="card"><div className="muted">補件到期</div><strong style={{ fontSize: 24 }}>{supplementTasks.length}</strong></div>
        <div className="card"><div className="muted">簽約到期</div><strong style={{ fontSize: 24 }}>{signTasks.length}</strong></div>
        <div className="card"><div className="muted">候補追蹤</div><strong style={{ fontSize: 24 }}>{waitingTasks.length}</strong></div>
        <div className="card"><div className="muted">同步異常</div><strong style={{ fontSize: 24 }}>{syncTasks.length}</strong></div>
      </div>

      <OnlineReminderSettingsEditor
        parkingLotId={workLotId}
        initialSetting={setting}
      />

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>① 待審核逾時</h2>
        <p className="muted">超過 {setting.pending_review_hours} 小時仍未完成審核。</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {pendingTasks.map((row: any) => (
            <div key={row.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 9 }}>
              <strong>{row.applicant_name}｜{row.vehicle_plate}</strong>
              <div className="muted" style={{ marginTop: 4 }}>
                已等待 {ageText(now - new Date(row.created_at).getTime())}
              </div>
              <div style={{ marginTop: 7 }}>
                <Link href={`/dashboard/online/applications/${row.id}`}>立即審核</Link>
              </div>
            </div>
          ))}
          {!pendingTasks.length && <div className="muted">目前沒有審核逾時案件。</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>② 補件快到期／已逾期</h2>
        <p className="muted">補件期限剩餘 {setting.supplement_warning_hours} 小時內就會出現在這裡。</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {supplementTasks.map((row: any) => (
            <div key={row.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 9 }}>
              <strong>{row.applicant_name}｜{row.vehicle_plate}</strong>
              <div style={{ marginTop: 4, color: '#b45309' }}>{dueText(row.supplement_expires_at)}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <Link href={`/dashboard/online/applications/${row.id}`}>查看案件</Link>
                <SupplementReminderButton applicationId={row.id} />
              </div>
            </div>
          ))}
          {!supplementTasks.length && <div className="muted">目前沒有補件到期提醒。</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>③ 簽約連結快到期／已逾期</h2>
        <p className="muted">簽約期限剩餘 {setting.sign_warning_hours} 小時內列入提醒。</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {signTasks.map((row: any) => (
            <div key={row.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 9 }}>
              <strong>{row.contract_no}｜{row.customer_name}｜{row.vehicle_plate}</strong>
              <div style={{ marginTop: 4, color: '#b45309' }}>{dueText(row.sign_token_expires_at)}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <Link href={`/dashboard/online/contracts/${row.id}`}>查看契約</Link>
                <ContractSignInviteButton contractId={row.id} source="reminder_center" />
              </div>
            </div>
          ))}
          {!signTasks.length && <div className="muted">目前沒有簽約到期提醒。</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>④ 候補定期追蹤</h2>
        <p className="muted">候補超過 {setting.waiting_followup_days} 天未再通知，就重新列入待辦。</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {waitingTasks.map((row: any) => {
            const waiting = row.waiting_list_id ? waitingById.get(row.waiting_list_id) : null
            const lastReminder = lastReminderByApp.get(row.id)
            return (
              <div key={row.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 9 }}>
                <strong>{row.applicant_name}｜{row.vehicle_plate}</strong>
                <div className="muted" style={{ marginTop: 4 }}>
                  候補順位：{waiting?.wait_no || '-'}｜最近提醒：{timeText(lastReminder)}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <Link href={`/dashboard/online/applications/${row.id}`}>查看案件</Link>
                  <WaitingStatusReminderButton applicationId={row.id} />
                </div>
              </div>
            )
          })}
          {!waitingTasks.length && <div className="muted">目前沒有需要再次追蹤的候補案件。</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>⑤ 月租同步異常</h2>
        <p className="muted">資料衝突／同步失敗會立即顯示；待同步超過 {setting.monthly_sync_pending_minutes} 分鐘也會列入。</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {syncTasks.map((row: any) => (
            <div key={row.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 9 }}>
              <strong>{row.contract_no}｜{row.customer_name}｜{row.vehicle_plate}</strong>
              <div style={{ marginTop: 4, color: '#b91c1c' }}>
                同步狀態：{row.monthly_sync_status || '-'}
                {row.monthly_sync_error ? `｜${row.monthly_sync_error}` : ''}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <Link href={`/dashboard/online/contracts/${row.id}`}>查看契約</Link>
                <ContractMonthlySyncRetryButton contractId={row.id} />
              </div>
            </div>
          ))}
          {!syncTasks.length && <div className="muted">目前沒有月租同步異常。</div>}
        </div>
      </div>
    </div>
  )
}
