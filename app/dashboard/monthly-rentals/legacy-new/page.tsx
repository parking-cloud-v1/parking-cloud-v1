import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import SupervisorLegacyRentalForm from '@/components/SupervisorLegacyRentalForm'

export default async function LegacyNewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,is_active').eq('id', user.id).maybeSingle()
  if (!profile?.is_active) redirect('/login')
  if (profile.role !== 'supervisor') redirect('/dashboard/monthly-rentals')

  const lotId = await getCurrentWorkParkingLotId()
  if (!lotId) {
    return <div><h1>主管新增舊月租</h1><div className="card">請先從左側選擇目前工作停車場。</div><Link href="/dashboard/monthly-rentals">返回</Link></div>
  }

  const [{ data: lot }, { data: terms }] = await Promise.all([
    supabase.from('parking_lots').select('id,name').eq('id', lotId).maybeSingle(),
    supabase.from('parking_lot_rental_terms').select('id,term_name,start_date,end_date,is_active').eq('parking_lot_id', lotId).order('start_date', { ascending: false }),
  ])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div><h1 style={{ marginBottom: 6 }}>主管新增舊月租</h1><p className="muted" style={{ marginTop: 0 }}>補建上線前既有資料；租期與已繳月份分開輸入。</p></div>
        <Link href="/dashboard/monthly-rentals">返回月租管理</Link>
      </div>
      <SupervisorLegacyRentalForm lotId={lotId} lotName={lot?.name || '目前停車場'} terms={(terms || []) as any[]} />
    </div>
  )
}
