import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'
import WorkParkingLotSelector from '@/components/WorkParkingLotSelector'
import ui from '@/components/PlatformAdmin.module.css'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import { isOnlineOperationAccessOpen } from '@/lib/online-operations/access'

export default async function DashboardShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  const { data: profile, error: profileError } = user
    ? await supabase.from('profiles').select('id, display_name, role, is_active').eq('id', user.id).maybeSingle()
    : { data: null, error: null }

  const roleText = profile?.role === 'supervisor' ? '主管' : profile?.role === 'manager' ? '場站管理員' : '使用者'
  let workParkingLots: { id: string; name: string }[] = []
  let onlineOperationsOpen = profile?.role === 'supervisor'
  let currentWorkLotId = ''
  let pendingViolationCount = 0

  if (user && profile?.is_active) {
    currentWorkLotId = await getCurrentWorkParkingLotId()

    if (profile.role === 'supervisor') {
      const { data } = await supabase.from('parking_lots').select('id, name').eq('status', 'active').order('name')
      workParkingLots = (data || []).map((x: any) => ({ id: x.id, name: x.name }))
      const { count } = await supabase
        .from('violation_parking_cases')
        .select('id', { count: 'exact', head: true })
        .in('supervisor_status', ['pending','seen'])
      pendingViolationCount = count || 0
    } else if (profile.role === 'manager') {
      const { data } = await supabase.from('user_parking_lots').select(`parking_lots (id,name,status)`).eq('user_id', user.id)
      workParkingLots = (data || []).map((x: any) => {
        const lot = Array.isArray(x.parking_lots) ? x.parking_lots[0] : x.parking_lots
        return lot?.status === 'active' ? { id: lot.id, name: lot.name } : null
      }).filter(Boolean) as { id: string; name: string }[]
      workParkingLots.sort((a,b)=>a.name.localeCompare(b.name,'zh-TW'))

      if (!currentWorkLotId && workParkingLots.length === 1) {
        currentWorkLotId = workParkingLots[0].id
      }

      if (currentWorkLotId) {
        const { data: access } = await supabase
          .from('parking_lot_online_operation_access')
          .select('is_enabled,open_from,open_until')
          .eq('parking_lot_id', currentWorkLotId)
          .maybeSingle()
        onlineOperationsOpen = isOnlineOperationAccessOpen(access)
      }
    }
  }

  const Nav = ({ href, icon, children }: { href: string; icon: string; children: React.ReactNode }) => (
    <Link href={href} className={ui.navLink}><span className={ui.navIcon}>{icon}</span><span>{children}</span></Link>
  )

  return <div className={ui.shell}>
    <header className={ui.topbar}>
      <div className={ui.brandWrap}>
        <div className={ui.brandMark}>ZY</div>
        <div><div className={ui.brandText}>智驛停車營運雲端平台</div><div className={ui.brandSub}>智驛科技有限公司</div></div>
      </div>
      <div className={ui.userBox}><span><span className={ui.userName}>{profile?.display_name || user?.email || '未登入'}</span> · {roleText}</span><LogoutButton /></div>
    </header>

    {(userError || profileError || !profile) && <div className={ui.systemWarning}>
      <strong>系統檢查：</strong> {user ? '使用者已登入' : '登入讀取失敗'}；Profile {profile ? '讀取成功' : '讀取失敗'}。
      {userError ? ` 登入錯誤：${userError.message}` : ''}{profileError ? ` Profile 錯誤：${profileError.message}` : ''}
    </div>}

    <div className={ui.layout}>
      <aside className={ui.sidebar}>
        <>
            <WorkParkingLotSelector parkingLots={workParkingLots} />
            <div className={ui.navGroup}><div className={ui.navTitle}>總覽</div><Nav href="/dashboard" icon="首">營運首頁</Nav></div>
            {onlineOperationsOpen && (
              <div className={ui.navGroup}><div className={ui.navTitle}>線上作業</div>
                <Nav href="/dashboard/online" icon="線">線上作業中心</Nav>
                <Nav href="/dashboard/online/applications" icon="申">申請審核</Nav>
                <Nav href="/dashboard/online/contracts" icon="約">電子契約</Nav>
                <Nav href="/dashboard/online/reminders" icon="待">待辦提醒</Nav>
                <Nav href="/dashboard/online/renewal-reminders" icon="續">續租提醒</Nav>
                <Nav href="/dashboard/online/reports" icon="營">營運報表</Nav>
              </div>
            )}
            <div className={ui.navGroup}><div className={ui.navTitle}>現場作業</div>
              <Nav href="/dashboard/monthly-rentals" icon="月">月租管理</Nav>
              <Nav href="/dashboard/monthly-rentals/waiting-list" icon="候">月租候補名單</Nav>
              <Nav href="/dashboard/monthly-rentals/sms-list" icon="簡">每月簡訊名單</Nav>
              <Nav href="/dashboard/taxi-discounts" icon="計">計程車折扣</Nav>
              <Nav href="/dashboard/disaster-inspections" icon="防">防災檢查</Nav>
              <Nav href="/dashboard/attendance-upload" icon="簽">簽到表上傳</Nav>
              <Nav href="/dashboard/dengue-photos" icon="登">登革熱消毒</Nav>
              <Nav href="/dashboard/violation-parking" icon="違">違規停車照片</Nav>
              {profile?.role === 'supervisor' && <Nav href="/dashboard/violation-alerts" icon="告">違規即時通知{pendingViolationCount > 0 ? ` (${pendingViolationCount})` : ''}</Nav>}
              <Nav href="/dashboard/shift-closing" icon="結">當日結班報表</Nav>
            </div>
            {profile?.role === 'supervisor' && (
              <div className={ui.navGroup}><div className={ui.navTitle}>報表</div><Nav href="/dashboard/reports" icon="報">報表中心</Nav></div>
            )}
            <div className={ui.navGroup}><div className={ui.navTitle}>基本管理</div><Nav href="/dashboard/parking-lots" icon="場">停車場管理</Nav></div>
            {profile?.role === 'supervisor' && <div className={ui.navGroup}><div className={ui.navTitle}>系統管理</div><Nav href="/dashboard/settings" icon="設">系統設定</Nav><Nav href="/dashboard/data-maintenance" icon="清">資料維護</Nav><Nav href="/dashboard/online/audit" icon="稽">操作紀錄</Nav><Nav href="/dashboard/online/health" icon="安">上線安全檢查</Nav></div>}
          </>
      </aside>
      <main className={ui.main}>{children}</main>
    </div>
  </div>
}
