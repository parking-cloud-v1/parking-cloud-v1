import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'

export default async function DashboardShell({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  const {
    data: profile,
    error: profileError,
  } = user
    ? await supabase
        .from('profiles')
        .select('id, display_name, role, is_active')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null, error: null }

  const roleText =
    profile?.role === 'supervisor'
      ? '主管'
      : profile?.role === 'manager'
        ? '場站管理員'
        : '角色讀取失敗'

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          智驛停車營運雲端平台
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span>
            {profile?.display_name ||
              user?.email ||
              '未登入'}{' '}
            · {roleText}
          </span>

          <LogoutButton />
        </div>
      </div>

      {(userError ||
        profileError ||
        !profile) && (
        <div
          style={{
            background: '#fff3cd',
            padding: '12px 20px',
            color: '#664d03',
          }}
        >
          <strong>系統檢查：</strong>
          <br />
          使用者：
          {user ? '已登入' : '讀取失敗'}
          <br />
          Profile：
          {profile ? '讀取成功' : '讀取失敗'}
          <br />

          {userError && (
            <>
              登入錯誤：{userError.message}
              <br />
            </>
          )}

          {profileError && (
            <>
              Profile 錯誤：{profileError.message}
              <br />
            </>
          )}
        </div>
      )}

      <div className="layout">
        <aside className="sidebar">
          <Link href="/dashboard">
            首頁
          </Link>

          <Link href="/dashboard/parking-lots">
            停車場管理
          </Link>

          {profile?.role === 'supervisor' && (
            <Link href="/dashboard/settings">
              系統設定
            </Link>
          )}

          <div
            style={{ marginTop: 20 }}
            className="muted"
          >
            現場作業
          </div>

          <Link href="/dashboard/monthly-rentals">
            月租管理
          </Link>

          <Link href="/dashboard/monthly-rentals/waiting-list">
            月租候補名單
          </Link>

          <Link href="/dashboard/monthly-rentals/sms-list">
            每月簡訊名單
          </Link>

          <Link href="/dashboard/taxi-discounts">
            計程車折扣
          </Link>

          <Link href="/dashboard/disaster-inspections">
            防災檢查
          </Link>

        </aside>

        <main className="main">
          {children}
        </main>
      </div>
    </div>
  )
}
