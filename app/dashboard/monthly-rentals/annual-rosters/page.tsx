import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import AnnualRosterManager from '@/components/AnnualRosterManager'

export default async function AnnualRostersPage() {
  const supabase =
    await createClient()

  const {
    data: { user },
  } =
    await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const {
    data: profile,
  } = await supabase
    .from('profiles')
    .select('id, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (
    !profile ||
    !profile.is_active
  ) {
    redirect('/login')
  }

  const {
    data: parkingLots,
  } = await supabase
    .from('parking_lots')
    .select('id, name')
    .eq('status', 'active')
    .order('name')

  const {
    data: rosters,
  } = await supabase
    .from('monthly_lottery_rosters')
    .select(`
      id,
      parking_lot_id,
      roster_year,
      title,
      status,
      created_at,
      parking_lots (
        id,
        name
      )
    `)
    .order(
      'roster_year',
      {
        ascending: false,
      }
    )

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              marginBottom: 6,
            }}
          >
            年度抽籤總表
          </h1>

          <p
            className="muted"
            style={{
              marginTop: 0,
            }}
          >
            保存每年度原始抽籤名單，並與目前月租總表自動比較。
          </p>
        </div>

        <Link
          href="/dashboard/monthly-rentals"
          style={{
            textDecoration: 'none',
            color: '#475569',
          }}
        >
          ← 返回月租管理
        </Link>
      </div>

      <AnnualRosterManager
        parkingLots={
          parkingLots?.map(
            (lot: any) => ({
              id: lot.id,
              name: lot.name,
            })
          ) || []
        }
        rosters={
          (rosters as any[]) || []
        }
      />
    </div>
  )
}