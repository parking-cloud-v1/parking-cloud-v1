import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import ViolationParkingClient from '@/components/ViolationParkingClient'

export default async function ViolationParkingPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_active) redirect('/login')

  const lotId = await getCurrentWorkParkingLotId()

  let lotName = ''
  if (lotId) {
    const { data: lot } = await supabase
      .from('parking_lots')
      .select('name')
      .eq('id', lotId)
      .maybeSingle()
    lotName = lot?.name || ''
  }

  return (
    <ViolationParkingClient
      parkingLotId={lotId || ''}
      parkingLotName={lotName}
    />
  )
}
