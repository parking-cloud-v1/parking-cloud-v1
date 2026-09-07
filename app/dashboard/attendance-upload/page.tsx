import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AttendanceUploadClient from '@/components/AttendanceUploadClient'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'

export default async function AttendanceUploadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,is_active').eq('id', user.id).maybeSingle()
  if (!profile?.is_active || !['supervisor','manager'].includes(profile.role)) redirect('/dashboard')

  let lots: {id:string;name:string}[] = []
  if (profile.role === 'supervisor') {
    const { data } = await supabase.from('parking_lots').select('id,name').eq('status','active').order('name')
    lots = (data || []) as any
  } else {
    const { data } = await supabase.from('user_parking_lots').select('parking_lots(id,name,status)').eq('user_id', user.id)
    lots = (data || []).map((x:any)=>Array.isArray(x.parking_lots)?x.parking_lots[0]:x.parking_lots)
      .filter((x:any)=>x?.status==='active').map((x:any)=>({id:x.id,name:x.name}))
  }

  return <AttendanceUploadClient parkingLots={lots} defaultParkingLotId={await getCurrentWorkParkingLotId()} />
}
