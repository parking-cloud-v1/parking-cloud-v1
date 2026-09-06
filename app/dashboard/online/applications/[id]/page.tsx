import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  capacityItemForVehicle,
  getCapacitySnapshot,
  vehicleTypeText,
} from '@/lib/online-contracts/capacity'
import OnlineApplicationReviewActions from '@/components/OnlineApplicationReviewActions'
import SupplementReminderButton from '@/components/SupplementReminderButton'
import admin from '@/components/OnlineAdmin.module.css'

function maskPhone(phone?: string | null) {
  if (!phone) return '-'
  if (phone.length < 7) return phone
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`
}

function statusText(value?: string | null) {
  if (value === 'pending') return '待審核'
  if (value === 'needs_revision') return '待補件'
  if (value === 'waiting') return '候補'
  if (value === 'rejected') return '未通過'
  if (value === 'contract_sent') return '待簽約'
  if (value === 'completed') return '已完成'
  return value || '-'
}

function actionText(value?: string | null) {
  if (value === 'SUPPLEMENT_REQUESTED') return '要求補件'
  if (value === 'SUPPLEMENT_COMPLETED') return '民眾完成補件'
  if (value === 'SUPPLEMENT_REMINDER_SENT') return '重新發送補件連結'
  if (value === 'WAITLISTED') return '轉入候補'
  if (value === 'AUTO_WAITLISTED_CAPACITY_FULL') return '名額已滿自動轉候補'
  if (value === 'WAITLIST_CONVERTED') return '候補轉正式'
  if (value === 'WAITLIST_OFFER_SENT') return '發送候補遞補通知'
  if (value === 'WAITLIST_OFFER_ACCEPTED') return '民眾接受遞補'
  if (value === 'WAITLIST_OFFER_DEFERRED') return '民眾本次暫不遞補'
  if (value === 'APPROVED') return '核准建立契約'
  if (value === 'RENEWAL_REQUESTED') return '民眾提出續租申請'
  if (value === 'RENEWAL_APPROVED') return '續租核准建立契約'
  if (value === 'REJECTED') return '不通過'
  return value || '-'
}

export default async function OnlineApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: row, error } = await supabase
    .from('rental_applications')
    .select(`
      id, parking_lot_id, application_kind, existing_monthly_rental_id,
      renewal_requested_months, renewal_current_end_date,
      renewal_suggested_start_date, renewal_suggested_end_date,
      customer_code, applicant_name, phone, email, vehicle_plate,
      vehicle_type, rental_type, address, emergency_contact_name, emergency_contact_phone,
      qualification_type, qualification_status, qualification_note, otp_verified,
      otp_verified_at, privacy_agreed, privacy_agreed_at, status,
      review_note, reviewed_at, created_at, waiting_list_id,
      supplement_note, supplement_requested_at, supplement_completed_at,
      supplement_expires_at,
      parking_lots(name)
    `)
    .eq('id', id)
    .maybeSingle()

  if (error || !row) notFound()

  const qualificationRequired = Boolean(
    row.qualification_type && row.qualification_type !== 'none'
  )

  const { data: reviews } = await supabase
    .from('online_application_reviews')
    .select(`
      id, actor_label, action, previous_status, new_status,
      qualification_status, note, metadata, created_at
    `)
    .eq('application_id', row.id)
    .order('created_at', { ascending: false })

  let waitingRow: any = null
  if (row.waiting_list_id) {
    const { data } = await supabase
      .from('monthly_waiting_list')
      .select('id, wait_no, status, registered_date, converted_at, offer_status, offer_expires_at, offer_notified_at, offer_responded_at, offer_count')
      .eq('id', row.waiting_list_id)
      .maybeSingle()
    waitingRow = data || null
  }

  let existingMonthlyRental: any = null
  if (row.application_kind === 'renewal' && row.existing_monthly_rental_id) {
    const { data } = await supabase
      .from('monthly_rentals')
      .select('id,customer_code,customer_name,vehicle_plate,vehicle_type,rental_type,start_date,end_date,monthly_fee,payment_status,rental_status')
      .eq('id', row.existing_monthly_rental_id)
      .maybeSingle()
    existingMonthlyRental = data || null
  }

  let capacityItem: any = null
  let capacityAutoWaitlist = true
  const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (adminUrl && serviceKey) {
    try {
      const admin = createAdminClient(adminUrl, serviceKey, {
        auth: { persistSession: false },
      })
      const snapshot = await getCapacitySnapshot(admin, row.parking_lot_id)
      capacityItem = capacityItemForVehicle(snapshot, row.vehicle_type)
      capacityAutoWaitlist = snapshot.auto_waitlist_when_full
    } catch {
      capacityItem = null
    }
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  const activeRenewalOccupiesNoNewSlot = Boolean(
    row.application_kind === 'renewal' &&
      existingMonthlyRental &&
      existingMonthlyRental.rental_status !== 'cancelled' &&
      (!existingMonthlyRental.end_date || existingMonthlyRental.end_date >= today)
  )

  return (
    <div className={admin.page}>
      <div className={admin.headerPanel}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>線上申請詳細資料</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            申請編號：{row.id}
          </p>
        </div>
        <div className={admin.headerActions}>
          {waitingRow?.status === 'waiting' && (
            <Link href="/dashboard/monthly-rentals/waiting-list">
              查看月租候補名單
            </Link>
          )}
          <Link href="/dashboard/online/applications">返回申請名單</Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>申請資料</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
            gap: 12,
          }}
        >
          <div>
            <span className="muted">停車場</span>
            <br />
            <strong>{(row.parking_lots as any)?.name || '-'}</strong>
          </div>
          <div>
            <span className="muted">申請類型</span>
            <br />
            <strong style={{ color: row.application_kind === 'renewal' ? '#166534' : undefined }}>
              {row.application_kind === 'renewal' ? '既有月租續租' : '新月租申請'}
            </strong>
          </div>
          <div>
            <span className="muted">客戶編號</span>
            <br />
            <strong>{row.customer_code || '核准時產生'}</strong>
          </div>
          <div>
            <span className="muted">姓名</span>
            <br />
            <strong>{row.applicant_name}</strong>
          </div>
          <div>
            <span className="muted">手機</span>
            <br />
            <strong>{maskPhone(row.phone)}</strong>
          </div>
          <div>
            <span className="muted">Email</span>
            <br />
            <strong>{row.email || '-'}</strong>
          </div>
          <div>
            <span className="muted">車牌</span>
            <br />
            <strong>{row.vehicle_plate}</strong>
          </div>
          <div>
            <span className="muted">車種</span>
            <br />
            <strong>{row.vehicle_type}</strong>
          </div>
          <div>
            <span className="muted">月租類型</span>
            <br />
            <strong>{row.rental_type || '-'}</strong>
          </div>
          <div>
            <span className="muted">案件狀態</span>
            <br />
            <strong>{statusText(row.status)}</strong>
          </div>
          <div>
            <span className="muted">聯絡地址</span>
            <br />
            <strong>{row.address || '-'}</strong>
          </div>
          <div>
            <span className="muted">緊急聯絡人</span>
            <br />
            <strong>{row.emergency_contact_name || '-'}</strong>
          </div>
          <div>
            <span className="muted">緊急聯絡電話</span>
            <br />
            <strong>
              {row.emergency_contact_phone
                ? maskPhone(row.emergency_contact_phone)
                : '-'}
            </strong>
          </div>
        </div>
      </div>

      {row.application_kind === 'renewal' && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>原月租／續租資料</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
              gap: 12,
            }}
          >
            <div>
              <span className="muted">原客戶編號</span><br />
              <strong>{existingMonthlyRental?.customer_code || row.customer_code || '-'}</strong>
            </div>
            <div>
              <span className="muted">原到期日</span><br />
              <strong>{existingMonthlyRental?.end_date || row.renewal_current_end_date || '-'}</strong>
            </div>
            <div>
              <span className="muted">希望續租</span><br />
              <strong>{row.renewal_requested_months ? `${row.renewal_requested_months} 個月` : '-'}</strong>
            </div>
            <div>
              <span className="muted">系統建議新租期</span><br />
              <strong>
                {row.renewal_suggested_start_date || '-'} ～ {row.renewal_suggested_end_date || '-'}
              </strong>
            </div>
            <div>
              <span className="muted">原月租金額</span><br />
              <strong>{existingMonthlyRental?.monthly_fee ?? '-'}</strong>
            </div>
            <div>
              <span className="muted">原付款狀態</span><br />
              <strong>{existingMonthlyRental?.payment_status || '-'}</strong>
            </div>
          </div>
          <p className="muted" style={{ marginBottom: 0, marginTop: 14 }}>
            核准時可依實際規定調整新租期與金額。簽署完成後系統會更新這筆既有 monthly_rentals，不會新增相同客戶編號的第二筆月租。
          </p>
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>驗證／資格狀態</h2>
        <p>手機 OTP：{row.otp_verified ? '✓ 已驗證' : '✕ 未驗證'}</p>
        <p>個資告知：{row.privacy_agreed ? '✓ 已同意' : '✕ 未同意'}</p>
        <p>資格類型：{row.qualification_type || 'none'}</p>
        <p>資格狀態：{row.qualification_status || '-'}</p>
        {row.address && <p>資格／聯絡地址：{row.address}</p>}
      </div>

      {(row.status === 'needs_revision' || row.supplement_requested_at) && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>補件狀態</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>
            補件內容：{row.supplement_note || '-'}
          </p>
          <p>
            要求補件時間：
            {row.supplement_requested_at
              ? new Date(row.supplement_requested_at).toLocaleString('zh-TW')
              : '-'}
          </p>
          <p>
            補件期限：
            {row.supplement_expires_at
              ? new Date(row.supplement_expires_at).toLocaleString('zh-TW')
              : row.supplement_completed_at
                ? '已完成補件'
                : '-'}
          </p>
          <p>
            完成補件時間：
            {row.supplement_completed_at
              ? new Date(row.supplement_completed_at).toLocaleString('zh-TW')
              : '尚未完成'}
          </p>
          {row.status === 'needs_revision' && (
            <div style={{ marginTop: 12 }}>
              <SupplementReminderButton applicationId={row.id} />
            </div>
          )}
        </div>
      )}

      {waitingRow && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>候補資料</h2>
          <p>
            候補順位：<strong>{waitingRow.wait_no}</strong>
          </p>
          <p>候補狀態：{waitingRow.status}</p>
          <p>登記日期：{waitingRow.registered_date || '-'}</p>
          <p>遞補通知次數：{waitingRow.offer_count || 0}</p>
          {waitingRow.offer_status === 'offered' && (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: '#fff7ed',
                color: '#9a3412',
                lineHeight: 1.7,
              }}
            >
              已發送候補遞補通知，尚未收到民眾 OTP 確認。
              <br />
              回覆期限：
              {waitingRow.offer_expires_at
                ? new Date(waitingRow.offer_expires_at).toLocaleString('zh-TW')
                : '-'}
            </div>
          )}
          {waitingRow.offer_status === 'accepted' && (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: '#f0fdf4',
                color: '#166534',
                lineHeight: 1.7,
              }}
            >
              ✓ 民眾已完成手機 OTP 並確認接受遞補。現在可進行最終審核與建立契約。
              <br />
              名額保留至：
              {waitingRow.offer_expires_at
                ? new Date(waitingRow.offer_expires_at).toLocaleString('zh-TW')
                : '-'}
            </div>
          )}
          {waitingRow.converted_at && (
            <p>
              轉正式時間：
              {new Date(waitingRow.converted_at).toLocaleString('zh-TW')}
            </p>
          )}
        </div>
      )}

      {capacityItem && (
        <div
          className="card"
          style={{
            marginTop: 20,
            border: capacityItem.full
              ? '1px solid #fecaca'
              : '1px solid #bbf7d0',
          }}
        >
          <h2 style={{ marginTop: 0 }}>目前月租名額</h2>
          <p>
            車種：<strong>{vehicleTypeText(row.vehicle_type)}</strong>
          </p>
          <p>
            月租上限：
            <strong>
              {capacityItem.limit === null ? '未設定上限' : capacityItem.limit}
            </strong>
          </p>
          <p>
            目前占用：<strong>{capacityItem.used}</strong>
            {' ／ '}
            可再核准：
            <strong>
              {capacityItem.remaining === null ? '不限' : capacityItem.remaining}
            </strong>
          </p>
          <p>
            有效月租 {capacityItem.active}、待簽／未同步保留{' '}
            {capacityItem.contract_reserved}、核准中保留 {capacityItem.held}、候補{' '}
            {capacityItem.waiting}。
          </p>
          {capacityItem.full && waitingRow?.offer_status === 'accepted' ? (
            <div style={{ color: '#166534', fontWeight: 800 }}>
              此案件已接受候補遞補；目前占用包含為這筆案件保留的名額，後端核准時會排除自己的 reservation 後再次檢查。
            </div>
          ) : capacityItem.full ? (
            <div style={{ color: '#b91c1c', fontWeight: 800 }}>
              此車種目前名額已滿，後端會禁止再建立新的額外占用契約。
              {row.status !== 'waiting' && capacityAutoWaitlist
                ? ' 建議直接轉入候補。'
                : ''}
            </div>
          ) : null}
        </div>
      )}

      <OnlineApplicationReviewActions
        applicationId={row.id}
        qualificationRequired={qualificationRequired}
        currentQualificationStatus={row.qualification_status || ''}
        currentStatus={row.status || ''}
        currentSupplementNote={row.supplement_note || ''}
        capacityFull={
          !activeRenewalOccupiesNoNewSlot &&
          Boolean(capacityItem?.full) &&
          waitingRow?.offer_status !== 'accepted'
        }
        capacityLimit={capacityItem?.limit ?? null}
        capacityUsed={capacityItem?.used ?? null}
        fromWaiting={Boolean(row.waiting_list_id)}
        isRenewal={row.application_kind === 'renewal'}
        initialStartDate={row.renewal_suggested_start_date || ''}
        initialEndDate={row.renewal_suggested_end_date || ''}
        initialMonthlyFee={existingMonthlyRental?.monthly_fee ?? null}
      />

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>完整審核紀錄</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {(reviews || []).map((item: any) => (
            <div
              key={item.id}
              style={{
                padding: 12,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <strong>{actionText(item.action)}</strong>
                <span className="muted">
                  {new Date(item.created_at).toLocaleString('zh-TW')}
                </span>
              </div>
              <div style={{ marginTop: 6 }}>
                操作人：{item.actor_label || '系統／申請人'}
              </div>
              <div>
                狀態：{statusText(item.previous_status)} →{' '}
                {statusText(item.new_status)}
              </div>
              {item.qualification_status && (
                <div>資格狀態：{item.qualification_status}</div>
              )}
              {item.note && (
                <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
                  備註：{item.note}
                </div>
              )}
            </div>
          ))}

          {!reviews?.length && (
            <div className="muted">
              第十一階段啟用後的審核動作會從這裡開始完整保留；舊案件既有歷史仍保留在原稽核紀錄。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
