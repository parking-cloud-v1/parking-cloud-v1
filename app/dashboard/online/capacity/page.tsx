import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import WaitlistOfferButton from '@/components/WaitlistOfferButton'
import {
  getCapacitySnapshot,
  vehicleTypeText,
  type CapacityItem,
  type OnlineVehicleType,
} from '@/lib/online-contracts/capacity'
import admin from '@/components/OnlineAdmin.module.css'

type WaitingCandidate = {
  id: string
  source_application_id: string | null
  wait_no: number
  customer_name: string
  vehicle_plate: string | null
  vehicle_type: OnlineVehicleType
  offer_status: string
  offer_expires_at: string | null
  offer_notified_at: string | null
  offer_count: number
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleString('zh-TW')
}

function CapacityCard({ item }: { item: CapacityItem }) {
  const unlimited = item.limit === null
  const statusText = unlimited
    ? '未設定上限'
    : item.full
      ? '名額已滿'
      : `剩餘 ${item.remaining} 名`
  const statusColor = item.full ? '#b91c1c' : unlimited ? '#64748b' : '#166534'

  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ margin: 0 }}>{vehicleTypeText(item.vehicle_type)}</h2>
        <strong style={{ color: statusColor }}>{statusText}</strong>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
          gap: 10,
          marginTop: 16,
        }}
      >
        <div>
          <div className="muted">月租上限</div>
          <strong>{unlimited ? '不限' : item.limit}</strong>
        </div>
        <div>
          <div className="muted">目前占用</div>
          <strong>{item.used}</strong>
        </div>
        <div>
          <div className="muted">有效月租</div>
          <strong>{item.active}</strong>
        </div>
        <div>
          <div className="muted">待簽／未同步保留</div>
          <strong>{item.contract_reserved}</strong>
        </div>
        <div>
          <div className="muted">核准／候補名額保留</div>
          <strong>{item.held}</strong>
        </div>
        <div>
          <div className="muted">目前候補</div>
          <strong>{item.waiting}</strong>
        </div>
        <div>
          <div className="muted">待審核／待補件</div>
          <strong>{item.pending}</strong>
        </div>
        <div>
          <div className="muted">可再核准</div>
          <strong>{unlimited ? '不限' : item.remaining}</strong>
        </div>
      </div>
    </div>
  )
}

function PromotionCard({
  parkingLotId,
  item,
  candidate,
}: {
  parkingLotId: string
  item: CapacityItem
  candidate: WaitingCandidate | null
}) {
  const hasAvailability = item.limit === null || Number(item.remaining || 0) > 0
  const activeOffer =
    candidate?.offer_status === 'offered' || candidate?.offer_status === 'accepted'

  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ margin: 0 }}>{vehicleTypeText(item.vehicle_type)}候補遞補</h3>
        <strong style={{ color: hasAvailability || activeOffer ? '#166534' : '#64748b' }}>
          {activeOffer
            ? candidate?.offer_status === 'accepted'
              ? '已接受遞補'
              : '等待民眾回覆'
            : hasAvailability
              ? '目前有名額'
              : '尚無名額'}
        </strong>
      </div>

      {!candidate ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          目前沒有此車種候補資料。
        </p>
      ) : (
        <div style={{ marginTop: 14, display: 'grid', gap: 8, lineHeight: 1.6 }}>
          <div>
            第一順位：<strong>第 {candidate.wait_no} 位｜{candidate.customer_name}</strong>
          </div>
          <div>車牌：{candidate.vehicle_plate || '未填寫'}</div>
          <div>
            來源：{candidate.source_application_id ? '線上申請' : '現場手動候補'}
          </div>
          {candidate.offer_count > 0 && <div>已通知次數：{candidate.offer_count}</div>}

          {candidate.offer_status === 'offered' && (
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                background: '#fffbeb',
                color: '#92400e',
              }}
            >
              已發送候補名額通知，等待民眾完成 OTP 回覆。
              <br />
              回覆期限：{formatDateTime(candidate.offer_expires_at)}
            </div>
          )}

          {candidate.offer_status === 'accepted' && (
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                background: '#f0fdf4',
                color: '#166534',
              }}
            >
              民眾已確認接受遞補，名額暫時保留至 {formatDateTime(candidate.offer_expires_at)}。
              <br />
              請在期限內完成最終審核並建立契約。
            </div>
          )}

          {!candidate.source_application_id ? (
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                background: '#fff7ed',
                color: '#9a3412',
              }}
            >
              此順位為現場手動候補。系統不會跳過第一順位，請先到候補名單人工處理。
            </div>
          ) : candidate.offer_status === 'accepted' ? (
            <Link href={`/dashboard/online/applications/${candidate.source_application_id}`}>
              前往案件完成最終審核 →
            </Link>
          ) : hasAvailability || candidate.offer_status === 'offered' ? (
            <WaitlistOfferButton
              parkingLotId={parkingLotId}
              vehicleType={item.vehicle_type}
              label={
                candidate.offer_status === 'offered'
                  ? '重新發送 72 小時遞補通知'
                  : '通知候補第一順位'
              }
            />
          ) : (
            <div className="muted">目前尚無可供遞補名額。</div>
          )}
        </div>
      )}
    </div>
  )
}

export default async function OnlineCapacityPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const workLotId = await getCurrentWorkParkingLotId()

  if (!workLotId) {
    return (
      <div className={admin.page}>
        <h1 style={{ marginTop: 0 }}>月租名額控管</h1>
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          請先從左側選擇「目前工作停車場」。
        </div>
      </div>
    )
  }

  const { data: lot } = await supabase
    .from('parking_lots')
    .select('id,name,status')
    .eq('id', workLotId)
    .maybeSingle()

  if (!lot) {
    return (
      <div className={admin.page}>
        <h1 style={{ marginTop: 0 }}>月租名額控管</h1>
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          找不到目前工作停車場，或你的帳號沒有此場站權限。
        </div>
      </div>
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return (
      <div className={admin.page}>
        <h1 style={{ marginTop: 0 }}>月租名額控管</h1>
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          Server 環境變數未設定完整，無法計算名額。
        </div>
      </div>
    )
  }

  const serviceAdmin = createAdminClient(url, serviceKey, {
    auth: { persistSession: false },
  })

  let capacity = null
  let errorMessage = ''
  const candidates: Partial<Record<OnlineVehicleType, WaitingCandidate | null>> = {}

  try {
    await serviceAdmin.rpc('expire_online_waitlist_offers', {
      p_parking_lot_id: workLotId,
    })

    capacity = await getCapacitySnapshot(serviceAdmin, workLotId)

    const vehicleTypes: OnlineVehicleType[] = [
      'car',
      'motorcycle',
      'heavy_motorcycle',
    ]

    const results = await Promise.all(
      vehicleTypes.map((vehicleType) =>
        serviceAdmin
          .from('monthly_waiting_list')
          .select(`
            id,
            source_application_id,
            wait_no,
            customer_name,
            vehicle_plate,
            vehicle_type,
            offer_status,
            offer_expires_at,
            offer_notified_at,
            offer_count
          `)
          .eq('parking_lot_id', workLotId)
          .eq('vehicle_type', vehicleType)
          .eq('status', 'waiting')
          .order('wait_no', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
      )
    )

    vehicleTypes.forEach((vehicleType, index) => {
      if (results[index].error) {
        throw results[index].error
      }
      candidates[vehicleType] = (results[index].data || null) as WaitingCandidate | null
    })
  } catch (error: any) {
    errorMessage = error?.message || '名額統計讀取失敗。'
  }

  return (
    <div className={admin.page}>
      <div className={admin.headerPanel}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>月租名額控管</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {lot.name}｜有效月租、待簽契約、候補遞補保留與核准中的保留會一起計算，避免超額核准。
          </p>
        </div>
        <div className={admin.headerActions}>
          <Link href="/dashboard/online/application-settings">調整名額設定</Link>
          <Link href="/dashboard/online/applications">申請名單</Link>
          <Link href="/dashboard/monthly-rentals/waiting-list">候補名單</Link>
        </div>
      </div>

      {errorMessage && (
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          {errorMessage}
        </div>
      )}

      {capacity && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
              gap: 16,
              marginTop: 20,
            }}
          >
            <CapacityCard item={capacity.car} />
            <CapacityCard item={capacity.motorcycle} />
            <CapacityCard item={capacity.heavy_motorcycle} />
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>名額釋出後的候補遞補</h2>
            <p className="muted" style={{ lineHeight: 1.7 }}>
              系統只會處理同車種第一順位。通知成功後先保留名額 72 小時；民眾須使用原申請手機 OTP 確認。接受後再保留 24 小時給管理員完成最終審核。
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
                gap: 16,
                marginTop: 16,
              }}
            >
              <PromotionCard
                parkingLotId={workLotId}
                item={capacity.car}
                candidate={candidates.car || null}
              />
              <PromotionCard
                parkingLotId={workLotId}
                item={capacity.motorcycle}
                candidate={candidates.motorcycle || null}
              />
              <PromotionCard
                parkingLotId={workLotId}
                item={capacity.heavy_motorcycle}
                candidate={candidates.heavy_motorcycle || null}
              />
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>額滿處理規則</h2>
            <p style={{ marginBottom: 0, lineHeight: 1.7 }}>
              公開送件額滿時：
              <strong>
                {capacity.auto_waitlist_when_full
                  ? ' 自動轉入月租候補名單'
                  : ' 保留待審核，由人員決定是否轉候補'}
              </strong>
              。候補遞補與後台核准都會使用同一套資料庫名額鎖，因此不會因為同時操作而超出設定上限。
            </p>
          </div>
        </>
      )}
    </div>
  )
}
