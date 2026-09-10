import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import DenguePhotoUpload from '@/components/DenguePhotoUpload'

export default async function DenguePhotosPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_active) {
    redirect('/login')
  }

  if (!['supervisor', 'manager'].includes(profile.role)) {
    redirect('/dashboard/reports')
  }

  const lotId = await getCurrentWorkParkingLotId()

  let lotName = ''

  if (lotId) {
    const { data } = await supabase
      .from('parking_lots')
      .select('name')
      .eq('id', lotId)
      .maybeSingle()

    lotName = data?.name || ''
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>登革熱消毒作業</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        現場只保留「自主檢查」與「委外消毒」兩種作業；主管可切換每一間停車場，直接把當日完整資料上傳到指定的 Google Drive 資料夾。
      </p>

      {!lotId ? (
        <div className="card" style={{ marginTop: 20, color: '#b91c1c' }}>
          請先從左側選擇目前工作停車場。
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <DenguePhotoUpload
            parkingLotId={lotId}
            parkingLotName={lotName || '目前停車場'}
            canDirectUploadToDrive={profile.role === 'supervisor'}
          />
        </div>
      )}
    </div>
  )
}
