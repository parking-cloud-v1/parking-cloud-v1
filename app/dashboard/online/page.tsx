import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import admin from '@/components/OnlineAdmin.module.css'

function Card({
  href,
  title,
  description,
  count,
  icon,
}: {
  href: string
  title: string
  description: string
  count?: number | string | null
  icon: string
}) {
  return (
    <Link href={href} className={admin.navCard}>
      <div className={admin.navIcon}>{icon}</div>
      <div className={admin.navTop}>
        <div className={admin.navTitle}>{title}</div>
        {count !== undefined && count !== null && (
          <div className={admin.navCount}>{count}</div>
        )}
      </div>
      <div className={admin.navDescription}>{description}</div>
    </Link>
  )
}

export default async function OnlineOperationsHomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, workLotId] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    getCurrentWorkParkingLotId(),
  ])

  let lotName = ''
  let pending = 0
  let revision = 0
  let waiting = 0
  let sent = 0
  let signedIssues = 0

  if (workLotId) {
    const [{ data: lot }, { data: apps }, { data: contracts }] = await Promise.all([
      supabase.from('parking_lots').select('name').eq('id', workLotId).maybeSingle(),
      supabase
        .from('rental_applications')
        .select('status')
        .eq('parking_lot_id', workLotId)
        .in('status', ['pending', 'needs_revision', 'waiting', 'contract_sent']),
      supabase
        .from('contracts')
        .select('status,monthly_sync_status')
        .eq('parking_lot_id', workLotId)
        .in('status', ['sent', 'signed']),
    ])

    lotName = lot?.name || ''
    pending = (apps || []).filter((row: any) => row.status === 'pending').length
    revision = (apps || []).filter((row: any) => row.status === 'needs_revision').length
    waiting = (apps || []).filter((row: any) => row.status === 'waiting').length
    sent = (contracts || []).filter((row: any) => row.status === 'sent').length
    signedIssues = (contracts || []).filter(
      (row: any) =>
        row.status === 'signed' &&
        ['conflict', 'error'].includes(row.monthly_sync_status)
    ).length
  }

  const isSupervisor = profile?.role === 'supervisor'

  return (
    <div className={admin.page}>
      <section className={admin.headerPanel}>
        <div>
          <div className={admin.eyebrow}>ONLINE OPERATIONS</div>
          <h1>線上作業中心</h1>
          <div className={admin.lotBanner}>
            <span className={admin.lotDot} />
            <span>
              {workLotId
                ? `目前工作停車場：${lotName || workLotId}`
                : '請先從左側選擇目前工作停車場，再進行場站案件處理。'}
            </span>
          </div>
        </div>
        <div className={admin.headerActions}>
          <Link href="/apply" target="_blank">公開申請頁 ↗</Link>
          <Link href="/renew" target="_blank">公開續租頁 ↗</Link>
          <Link href="/status" target="_blank">公開進度查詢 ↗</Link>
        </div>
      </section>

      <div className={admin.navGrid}>
        <Card
          href="/dashboard/online/applications"
          title="月租線上申請"
          icon="申"
          count={pending}
          description="新申請與續租案件審核、補件、候補轉正式。右上數字為目前待審核。"
        />
        <Card
          href="/dashboard/online/contracts"
          title="電子契約"
          icon="契"
          count={sent}
          description="待簽契約、已簽契約、重新發送、作廢重審、正式契約列印與留存。"
        />
        <Card
          href="/dashboard/online/capacity"
          title="月租名額控管"
          icon="額"
          count={waiting}
          description="汽車／機車／重機名額、額滿候補、名額釋出與候補遞補。右上數字為候補案件。"
        />
        <Card
          href="/dashboard/online/renewal-reminders"
          title="續租到期提醒"
          icon="續"
          description="自動找快到期月租戶，勾選後批次發送 /renew 續租邀請，並防止重複發送。"
        />
        <Card
          href="/dashboard/online/reminders"
          title="待辦／到期提醒"
          icon="待"
          count={revision}
          description="審核逾時、補件期限、簽約期限、候補追蹤與月租同步異常。"
        />
        <Card
          href="/dashboard/online/application-settings"
          title="申請開放設定"
          icon="設"
          description="各停車場新申請／續租開關、開放期間、月租類型與名額上限。"
        />
        <Card
          href="/dashboard/online/reports"
          title="營運報表"
          icon="報"
          description="新申請／續租、核准率、簽約率、平均處理時間、月租同步異常與 CSV。"
        />
        <Card
          href="/dashboard/online/audit"
          title="操作紀錄"
          icon="錄"
          description="補件、候補、契約、簡訊、續租、同步等關鍵操作稽核紀錄。"
        />
        {isSupervisor && (
          <Card
            href="/dashboard/online/health"
            title="正式上線安全檢查"
          icon="安"
            count={signedIssues || null}
            description="環境變數、匿名權限、資料表、SMS、正式契約留存與同步異常檢查。"
          />
        )}
      </div>

      {signedIssues > 0 && (
        <div
          className={`card ${admin.noticeDanger}`}
        >
          <strong style={{ color: '#b91c1c' }}>
            目前有 {signedIssues} 筆已簽契約月租同步需要處理。
          </strong>
          <div style={{ marginTop: 6 }}>
            <Link href="/dashboard/online/reminders">前往待辦提醒處理</Link>
          </div>
        </div>
      )}
    </div>
  )
}
