import Link from 'next/link'
import {
  redirect,
} from 'next/navigation'

import {
  createClient,
} from '@/lib/supabase/server'

import MonthlyRentalTypeRuleManager from '@/components/MonthlyRentalTypeRuleManager'

export default async function MonthlyRentalTypeSettingsPage() {
  const supabase =
    await createClient()

  const {
    data: {
      user,
    },
  } =
    await supabase
      .auth
      .getUser()

  if (
    !user
  ) {
    redirect(
      '/login'
    )
  }

  const {
    data:
      profile,
  } =
    await supabase
      .from(
        'profiles'
      )
      .select(
        'id, role, is_active'
      )
      .eq(
        'id',
        user.id
      )
      .maybeSingle()

  if (
    !profile ||
    !profile.is_active ||
    profile.role !==
      'supervisor'
  ) {
    redirect(
      '/dashboard'
    )
  }

  const {
    data:
      parkingLots,
    error:
      parkingLotsError,
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

  return (
    <div>
      <div
        style={{
          display:
            'flex',
          justifyContent:
            'space-between',
          alignItems:
            'flex-start',
          gap: 12,
          flexWrap:
            'wrap',
        }}
      >
        <div>
          <h1
            style={{
              marginBottom:
                6,
            }}
          >
            月租類型設定
          </h1>

          <p
            className="muted"
            style={{
              marginTop:
                0,
            }}
          >
            由主管統一設定各停車場的月租類型、車種、金額與辨識條件。場站管理員不需要操作此頁。
          </p>
        </div>

        <Link
          href="/dashboard/monthly-rentals"
          style={{
            padding:
              '9px 14px',
            border:
              '1px solid #cbd5e1',
            borderRadius:
              8,
            background:
              '#fff',
            color:
              '#334155',
            textDecoration:
              'none',
            fontWeight:
              600,
          }}
        >
          返回月租管理
        </Link>
      </div>

      {parkingLotsError && (
        <div
          className="card"
          style={{
            marginTop:
              20,
            color:
              '#dc2626',
          }}
        >
          停車場讀取失敗：
          {
            parkingLotsError.message
          }
        </div>
      )}

      {!parkingLotsError &&
      (!parkingLots ||
        parkingLots.length ===
          0) ? (
        <div
          className="card"
          style={{
            marginTop:
              20,
          }}
        >
          目前沒有啟用中的停車場。
        </div>
      ) : (
        <MonthlyRentalTypeRuleManager
          parkingLots={
            parkingLots ||
            []
          }
        />
      )}
    </div>
  )
}
