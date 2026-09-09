import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import ViolationParkingClient from '@/components/ViolationParkingClient'

export default async function ViolationParkingPage({
  searchParams,
}: {
  searchParams?: Promise<{ case?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_active || !['manager', 'supervisor'].includes(profile.role)) {
    redirect('/dashboard')
  }

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

  const params = searchParams ? await searchParams : {}

  return (
    <ViolationParkingClient
      parkingLotId={lotId || ''}
      parkingLotName={lotName}
      focusCaseId={params.case || ''}
    />
  )
}
