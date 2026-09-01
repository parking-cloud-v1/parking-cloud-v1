import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'

import LogoutButton from '@/components/LogoutButton'
import WorkParkingLotSelector from '@/components/WorkParkingLotSelector'

export default async function DashboardShell({
  children,
}: {
  children:
    React.ReactNode
}) {
  const supabase =
    await createClient()

  const {
    data: {
      user,
    },
    error:
      userError,
  } =
    await supabase
      .auth
      .getUser()

  const {
    data:
      profile,
    error:
      profileError,
  } =
    user
      ? await supabase
          .from(
            'profiles'
          )
          .select(
            'id, display_name, role, is_active'
          )
          .eq(
            'id',
            user.id
          )
          .maybeSingle()
      : {
          data:
            null,
          error:
            null,
        }

  const role =
    profile?.role as
      | 'supervisor'
      | 'manager'
      | 'accountant'
      | undefined

  const roleText =
    role ===
    'supervisor'
      ? '主管'
      : role ===
          'manager'
        ? '場站管理員'
        : role ===
            'accountant'
          ? '會計'
          : '角色讀取失敗'

  let workParkingLots: {
    id: string
    name: string
  }[] = []

  if (
    user &&
    profile?.is_active &&
    role !==
      'accountant'
  ) {
    if (
      role ===
      'supervisor'
    ) {
      const {
        data:
          lotData,
      } =
        await supabase
          .from(
            'parking_lots'
          )
          .select(
            'id, name'
          )
          .eq(
            'status',
            'active'
          )
          .order(
            'name'
          )

      workParkingLots =
        (
          lotData ||
          []
        ).map(
          (
            item: any
          ) => ({
            id:
              item.id,

            name:
              item.name,
          })
        )
    } else if (
      role ===
      'manager'
    ) {
      const {
        data:
          assignmentData,
      } =
        await supabase
          .from(
            'user_parking_lots'
          )
          .select(`
            parking_lots (
              id,
              name,
              status
            )
          `)
          .eq(
            'user_id',
            user.id
          )

      workParkingLots =
        (
          assignmentData ||
          []
        )
          .map(
            (
              item: any
            ) => {
              const lot =
                Array.isArray(
                  item.parking_lots
                )
                  ? item
                      .parking_lots[0] ||
                    null
                  : item.parking_lots ||
                    null

              if (
                !lot ||
                lot.status !==
                  'active'
              ) {
                return null
              }

              return {
                id:
                  lot.id,

                name:
                  lot.name,
              }
            }
          )
          .filter(
            Boolean
          ) as {
            id: string
            name: string
          }[]

      workParkingLots.sort(
        (
          a,
          b
        ) =>
          a.name.localeCompare(
            b.name,
            'zh-TW'
          )
      )
    }
  }

  const isAccountant =
    role ===
    'accountant'

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          智驛停車營運雲端平台
        </div>

        <div
          style={{
            display:
              'flex',
            alignItems:
              'center',
            gap:
              8,
          }}
        >
          <span>
            {profile?.display_name ||
              user?.email ||
              '未登入'}{' '}
            ·{' '}
            {
              roleText
            }
          </span>

          <LogoutButton />
        </div>
      </div>

      {(userError ||
        profileError ||
        !profile) && (
        <div
          style={{
            background:
              '#fff3cd',
            padding:
              '12px 20px',
            color:
              '#664d03',
          }}
        >
          <strong>
            系統檢查：
          </strong>

          <br />

          使用者：
          {user
            ? '已登入'
            : '讀取失敗'}

          <br />

          Profile：
          {profile
            ? '讀取成功'
            : '讀取失敗'}

          <br />

          {userError && (
            <>
              登入錯誤：
              {
                userError.message
              }

              <br />
            </>
          )}

          {profileError && (
            <>
              Profile 錯誤：
              {
                profileError.message
              }

              <br />
            </>
          )}
        </div>
      )}

      <div className="layout">
        <aside className="sidebar">
          {isAccountant ? (
            <>
              <div
                style={{
                  marginBottom:
                    12,
                  padding:
                    12,
                  border:
                    '1px solid #e5e7eb',
                  borderRadius:
                    10,
                  background:
                    '#f8fafc',
                }}
              >
                <div
                  style={{
                    fontSize:
                      12,
                    color:
                      '#64748b',
                  }}
                >
                  使用權限
                </div>

                <div
                  style={{
                    marginTop:
                      4,
                    fontWeight:
                      800,
                  }}
                >
                  會計報表
                </div>
              </div>

              <Link href="/dashboard/accounting">
                報表中心
              </Link>
            </>
          ) : (
            <>
              <WorkParkingLotSelector
                parkingLots={
                  workParkingLots
                }
              />

              <Link href="/dashboard">
                首頁
              </Link>

              <Link href="/dashboard/parking-lots">
                停車場管理
              </Link>

              {role ===
                'supervisor' && (
                <>
                  <Link href="/dashboard/settings">
                    系統設定
                  </Link>

                  <Link href="/dashboard/accounting">
                    報表中心
                  </Link>
                </>
              )}

              <div
                style={{
                  marginTop:
                    20,
                }}
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

              <Link href="/dashboard/dengue-prevention">
                登革熱防治作業
              </Link>

              <Link href="/dashboard/monthly-attendance">
                每月簽到表
              </Link>

              <Link href="/dashboard/shift-closing">
                當日結班報表
              </Link>
            </>
          )}
        </aside>

        <main className="main">
          {
            children
          }
        </main>
      </div>
    </div>
  )
}