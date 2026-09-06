import { redirect } from 'next/navigation'
import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import MonthlyRentalForm from '@/components/MonthlyRentalForm'

export default async function NewMonthlyRentalPage({
  searchParams,
}: {
  searchParams?: Promise<{ waiting_id?: string; parking_lot_id?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_active || !['supervisor', 'manager'].includes(profile.role)) {
    redirect('/dashboard/monthly-rentals')
  }

  const params = searchParams ? await searchParams : {}
  const currentLotId = await getCurrentWorkParkingLotId()
  const lotId = currentLotId || params.parking_lot_id || ''

  if (!lotId) {
    return (
      <div className="card">
        <h1>新增月租</h1>
        <p>請先從左側選擇目前工作停車場。</p>
        <Link href="/dashboard/monthly-rentals">返回月租管理</Link>
      </div>
    )
  }

  const { data: lot } = await supabase
    .from('parking_lots')
    .select('id, name, status')
    .eq('id', lotId)
    .maybeSingle()

  if (!lot) redirect('/dashboard/monthly-rentals')

  const { data: activeTerm } = await supabase
    .from('parking_lot_rental_terms')
    .select('id, term_name, start_date, end_date')
    .eq('parking_lot_id', lotId)
    .eq('is_active', true)
    .maybeSingle()

  let initialData: any = { parkingLotId: lotId }

  if (params.waiting_id) {
    const { data: waiting } = await supabase
      .from('monthly_waiting_list')
      .select('id, parking_lot_id, customer_name, phone, vehicle_plate, vehicle_type, notes, status')
      .eq('id', params.waiting_id)
      .eq('parking_lot_id', lotId)
      .eq('status', 'waiting')
      .maybeSingle()

    if (waiting) {
      initialData = {
        waitingId: waiting.id,
        parkingLotId: waiting.parking_lot_id,
        customerName: waiting.customer_name || '',
        phone: waiting.phone || '',
        vehiclePlate: waiting.vehicle_plate || '',
        vehicleType: waiting.vehicle_type || 'car',
        notes: waiting.notes || '',
      }
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>新增月租</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {activeTerm
              ? `本場已啟用「${activeTerm.term_name}」，正式租期會自動同步，避免不同資料來源把租期弄亂。`
              : '本場尚未設定啟用中的抽籤租期；主管可先到「租期設定」建立。'}
          </p>
        </div>
        <Link href="/dashboard/monthly-rentals" style={{ textDecoration: 'none' }}>返回月租總表</Link>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <MonthlyRentalForm
          parkingLots={[lot]}
          initialData={initialData}
          activeTerm={activeTerm}
        />
      </div>
    </div>
  )
}
