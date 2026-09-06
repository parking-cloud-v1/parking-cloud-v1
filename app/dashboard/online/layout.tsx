import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import { isOnlineOperationAccessOpen } from '@/lib/online-operations/access'

export default async function OnlineOperationsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_active) redirect('/login')
  if (profile.role === 'supervisor') return children
  if (profile.role !== 'manager') redirect('/dashboard')

  let workLotId = await getCurrentWorkParkingLotId()

  if (!workLotId) {
    const { data: assignments } = await supabase
      .from('user_parking_lots')
      .select('parking_lot_id')
      .eq('user_id', user.id)

    if ((assignments || []).length === 1) {
      workLotId = assignments![0].parking_lot_id
    }
  }

  if (!workLotId) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>尚未選擇工作停車場</h2>
        <p className="muted">請先從左側選擇目前工作停車場。</p>
      </div>
    )
  }

  const { data: access } = await supabase
    .from('parking_lot_online_operation_access')
    .select('is_enabled,open_from,open_until')
    .eq('parking_lot_id', workLotId)
    .maybeSingle()

  if (!isOnlineOperationAccessOpen(access)) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>線上作業目前未開放</h2>
        <p className="muted">
          此功能由主管依場站作業期間開放。開放後重新整理頁面即可使用。
        </p>
      </div>
    )
  }

  return children
}
