import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import RenewalReminderBatchClient from '@/components/RenewalReminderBatchClient'
import admin from '@/components/OnlineAdmin.module.css'

const DAY = 24 * 60 * 60 * 1000

function taipeiToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function parseDate(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function daysBetween(from: string, to: string) {
  return Math.round((parseDate(to) - parseDate(from)) / DAY)
}

function maskPhone(phone?: string | null) {
  const value = String(phone || '').replace(/\s+/g, '')
  if (!value) return '-'
  if (value.length < 7) return '***'
  return `${value.slice(0, 4)}***${value.slice(-3)}`
}

function dueText(days: number) {
  if (days < 0) return `已到期 ${Math.abs(days)} 天`
  if (days === 0) return '今天到期'
  return `${days} 天後到期`
}

export default async function RenewalReminderPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const workLotId = await getCurrentWorkParkingLotId()
  if (!workLotId) {
    return (
      <div className={admin.page}>
        <h1 style={{ marginTop: 0 }}>續租到期提醒</h1>
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          請先從左側選擇「目前工作停車場」。
        </div>
      </div>
    )
  }

  const [lotResult, reminderResult, applicationSettingResult, termResult] =
    await Promise.all([
      supabase
        .from('parking_lots')
        .select('id,name')
        .eq('id', workLotId)
        .maybeSingle(),
      supabase
        .from('online_reminder_settings')
        .select(`
          enabled,renewal_reminder_days,renewal_repeat_days,
          renewal_expired_grace_days,renewal_batch_limit
        `)
        .eq('parking_lot_id', workLotId)
        .maybeSingle(),
      supabase
        .from('online_application_settings')
        .select('renewal_enabled')
        .eq('parking_lot_id', workLotId)
        .maybeSingle(),
      supabase
        .from('parking_lot_rental_terms')
        .select('id,term_name,start_date,end_date,is_active')
        .eq('parking_lot_id', workLotId)
        .eq('is_active', true)
        .maybeSingle(),
    ])

  const setting = reminderResult.data
  const reminderDays = Number(setting?.renewal_reminder_days || 20)
  const repeatDays = Number(setting?.renewal_repeat_days || 7)
  const graceDays = Number(setting?.renewal_expired_grace_days ?? 30)
  const batchLimit = Number(setting?.renewal_batch_limit || 100)
  const remindersEnabled = setting?.enabled !== false
  const renewalEnabled = applicationSettingResult.data?.renewal_enabled === true
  const activeTerm = termResult.data
  const today = taipeiToday()

  let rentals: any[] = []
  let rentalError: any = null
  let termDays: number | null = null
  let inReminderWindow = false

  if (activeTerm?.end_date) {
    termDays = daysBetween(today, String(activeTerm.end_date))
    inReminderWindow = termDays <= reminderDays && termDays >= -graceDays

    if (inReminderWindow) {
      const rentalResult = await supabase
        .from('monthly_rentals')
        .select(`
          id,customer_code,customer_name,phone,vehicle_plate,vehicle_type,
          rental_type,rental_status
        `)
        .eq('parking_lot_id', workLotId)
        .neq('rental_status', 'cancelled')
        .order('customer_code', { ascending: true, nullsFirst: false })
        .order('customer_name', { ascending: true })

      rentals = rentalResult.data || []
      rentalError = rentalResult.error
    }
  }

  const ids = rentals.map((row: any) => row.id)

  let activeApplications: any[] = []
  let reminderLogs: any[] = []

  if (ids.length) {
    const [appRows, logRows] = await Promise.all([
      supabase
        .from('rental_applications')
        .select('existing_monthly_rental_id,status')
        .eq('application_kind', 'renewal')
        .in('existing_monthly_rental_id', ids)
        .in('status', [
          'pending',
          'needs_revision',
          'waiting',
          'approved',
          'contract_sent',
        ]),
      supabase
        .from('online_reminder_logs')
        .select('monthly_rental_id,delivery_status,created_at')
        .eq('parking_lot_id', workLotId)
        .eq('reminder_type', 'renewal_invitation')
        .in('monthly_rental_id', ids)
        .in('delivery_status', ['sent', 'development'])
        .order('created_at', { ascending: false }),
    ])
    activeApplications = appRows.data || []
    reminderLogs = logRows.data || []
  }

  const activeSet = new Set(
    activeApplications
      .map((row: any) => row.existing_monthly_rental_id)
      .filter(Boolean)
  )

  const lastSent = new Map<string, string>()
  for (const log of reminderLogs) {
    if (log.monthly_rental_id && !lastSent.has(log.monthly_rental_id)) {
      lastSent.set(log.monthly_rental_id, log.created_at)
    }
  }

  const candidates = rentals.map((row: any) => {
    const phone = String(row.phone || '').replace(/\s+/g, '')
    const lastSentAt = lastSent.get(row.id) || null
    const cooldown =
      lastSentAt &&
      Date.now() - new Date(lastSentAt).getTime() < repeatDays * DAY
    let blockedReason = ''

    if (!remindersEnabled) blockedReason = '線上提醒已關閉'
    else if (!renewalEnabled) blockedReason = '線上續租尚未開放'
    else if (!/^09\d{8}$/.test(phone)) blockedReason = '缺少有效手機號碼'
    else if (activeSet.has(row.id)) blockedReason = '已有續租案件處理中'
    else if (cooldown) blockedReason = `上次提醒未滿 ${repeatDays} 天`

    return {
      id: row.id,
      customer_code: row.customer_code || '',
      customer_name: row.customer_name || '',
      phone_masked: maskPhone(row.phone),
      vehicle_plate: row.vehicle_plate || '',
      vehicle_type: row.vehicle_type || '',
      rental_type: row.rental_type || '',
      end_date: String(activeTerm?.end_date || ''),
      due_text: termDays === null ? '-' : dueText(termDays),
      last_sent_at: lastSentAt,
      can_send: !blockedReason,
      blocked_reason: blockedReason || null,
    }
  })

  return (
    <div className={admin.page}>
      <div className={admin.headerPanel}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>續租到期提醒</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {lotResult.data?.name || '目前停車場'}｜續租提醒只依主管設定的「正式租期」判斷，不看繳費月份或付款狀態。
          </p>
        </div>
        <div className={admin.headerActions}>
          <Link href="/dashboard/online/reminders">待辦提醒</Link>
          <Link href="/dashboard/online/application-settings">申請開放設定</Link>
          <Link href="/dashboard/online/reports">營運報表</Link>
          <Link href="/renew" target="_blank">開啟民眾續租頁</Link>
        </div>
      </div>

      {termResult.error && (
        <div className="card" style={{ marginTop: 20, color: '#b91c1c' }}>
          正式租期讀取失敗：{termResult.error.message}
        </div>
      )}

      {!termResult.error && !activeTerm && (
        <div
          className="card"
          style={{ marginTop: 20, border: '1px solid #fde68a', background: '#fffbeb' }}
        >
          此停車場尚未設定「目前正式租期」。請先到月租管理的租期設定建立並設為目前租期，續租提醒才會產生名單。
        </div>
      )}

      {activeTerm && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="muted">主管目前設定的正式租期</div>
          <strong style={{ display: 'block', marginTop: 6, fontSize: 18 }}>
            {activeTerm.term_name}｜{activeTerm.start_date} ～ {activeTerm.end_date}
          </strong>
          <div style={{ marginTop: 6, color: inReminderWindow ? '#166534' : '#64748b' }}>
            {termDays === null
              ? '-'
              : inReminderWindow
                ? `已進入續租提醒範圍：${dueText(termDays)}`
                : termDays > reminderDays
                  ? `尚未進入提醒範圍，距正式租期到期還有 ${termDays} 天。`
                  : `已超過到期後 ${graceDays} 天的提醒保留範圍。`}
          </div>
        </div>
      )}

      {rentalError && (
        <div className="card" style={{ marginTop: 20, color: '#b91c1c' }}>
          月租資料讀取失敗：{rentalError.message}
        </div>
      )}

      {!renewalEnabled && (
        <div
          className="card"
          style={{ marginTop: 20, border: '1px solid #fde68a', background: '#fffbeb' }}
        >
          此停車場目前尚未開放 `/renew` 線上續租，因此暫不允許發送續租邀請。
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',
          gap: 12,
          marginTop: 20,
        }}
      >
        <div className="card"><div className="muted">提醒依據</div><strong>正式租期</strong></div>
        <div className="card"><div className="muted">提前提醒</div><strong>{reminderDays} 天</strong></div>
        <div className="card"><div className="muted">到期後保留</div><strong>{graceDays} 天</strong></div>
        <div className="card"><div className="muted">重複提醒間隔</div><strong>{repeatDays} 天</strong></div>
        <div className="card"><div className="muted">本次名單</div><strong>{candidates.length} 筆</strong></div>
        <div className="card"><div className="muted">目前可發送</div><strong>{candidates.filter((r) => r.can_send).length} 筆</strong></div>
      </div>

      <RenewalReminderBatchClient
        parkingLotId={workLotId}
        candidates={candidates}
        batchLimit={batchLimit}
      />
    </div>
  )
}
