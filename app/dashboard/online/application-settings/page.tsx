import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import OnlineApplicationSettingsEditor from '@/components/OnlineApplicationSettingsEditor'
import admin from '@/components/OnlineAdmin.module.css'

export default async function OnlineApplicationSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const workLotId = await getCurrentWorkParkingLotId()

  if (!workLotId) {
    return (
      <div className={admin.page}>
        <h1 style={{ marginTop: 0 }}>線上申請開放設定</h1>
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          請先從左側選擇「目前工作停車場」。
        </div>
      </div>
    )
  }

  const [{ data: lot }, { data: setting, error: settingError }] =
    await Promise.all([
      supabase
        .from('parking_lots')
        .select('id,name,status')
        .eq('id', workLotId)
        .maybeSingle(),
      supabase
        .from('online_application_settings')
        .select(
          'parking_lot_id,enabled,starts_at,ends_at,allowed_rental_types,public_note,monthly_capacity_car,monthly_capacity_motorcycle,monthly_capacity_heavy_motorcycle,auto_waitlist_when_full,renewal_enabled,updated_at'
        )
        .eq('parking_lot_id', workLotId)
        .maybeSingle(),
    ])

  if (!lot) {
    return (
      <div className={admin.page}>
        <h1 style={{ marginTop: 0 }}>線上申請開放設定</h1>
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          找不到目前工作停車場，或你的帳號沒有此場站權限。
        </div>
      </div>
    )
  }

  return (
    <div className={admin.page}>
      <div className={admin.headerPanel}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>線上申請開放設定</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            控制此停車場的新申請、既有月租續租、申請期間、可申請月租類型與各車種月租名額。
          </p>
        </div>
        <div className={admin.headerActions}>
          <Link href="/dashboard/online/capacity">名額控管</Link>
          <Link href="/dashboard/online/reports">營運報表</Link>
          <Link href="/dashboard/online/applications">申請名單</Link>
          <Link href="/dashboard/online">返回線上作業</Link>
        </div>
      </div>

      {settingError && (
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          設定讀取失敗：{settingError.message}
        </div>
      )}

      <OnlineApplicationSettingsEditor
        parkingLotId={lot.id}
        parkingLotName={lot.name}
        initialSetting={setting || null}
      />

      <div className="card" style={{ marginTop: 20 }}>
        <strong>公開頁安全規則</strong>
        <p className="muted" style={{ marginBottom: 0, lineHeight: 1.7 }}>
          關閉或逾期後，場站不只會從 /apply 清單消失；直接網址、OTP 發送與最終送出申請也會由 Server API 再次阻擋，避免民眾繞過畫面限制送件。
        </p>
      </div>
    </div>
  )
}
