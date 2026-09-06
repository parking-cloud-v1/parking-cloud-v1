import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import LegacyMonthlyImport from '@/components/LegacyMonthlyImport'

export default async function ImportLegacyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,is_active').eq('id', user.id).maybeSingle()
  if (!profile?.is_active) redirect('/login')
  if (!['supervisor', 'manager'].includes(profile.role)) redirect('/dashboard/monthly-rentals')

  const lotId = await getCurrentWorkParkingLotId()
  if (!lotId) {
    return <div><h1>匯入舊系統月租總表</h1><div className="card">請先從左側選擇目前工作停車場。</div><Link href="/dashboard/monthly-rentals">返回</Link></div>
  }

  const { data: lot } = await supabase.from('parking_lots').select('id,name').eq('id', lotId).maybeSingle()
  if (!lot) redirect('/dashboard/monthly-rentals')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>匯入舊系統月租總表</h1>
          <p className="muted" style={{ marginTop: 0 }}>既有月租的正式租期受到保護；新戶優先套用目前場站租期。</p>
        </div>
        <Link href="/dashboard/monthly-rentals">返回月租管理</Link>
      </div>
      <LegacyMonthlyImport parkingLots={[lot]} />
    </div>
  )
}
