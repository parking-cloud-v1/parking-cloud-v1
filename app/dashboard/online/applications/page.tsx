import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import { qualificationLabel } from '@/lib/online-contracts/qualification'
import admin from '@/components/OnlineAdmin.module.css'

function statusText(value?: string | null) {
  if (value === 'pending') return '待審核'
  if (value === 'approved') return '已核准'
  if (value === 'needs_revision') return '待補件'
  if (value === 'rejected') return '未通過'
  if (value === 'waiting') return '候補'
  if (value === 'contract_sent') return '待簽約'
  if (value === 'completed') return '已完成'
  return value || '-'
}

function qualificationStatusText(value?: string | null) {
  if (value === 'not_required') return '免審核'
  if (value === 'pending') return '待審核'
  if (value === 'approved') return '已通過'
  if (value === 'needs_revision') return '待補件'
  if (value === 'rejected') return '未通過'
  return value || '-'
}

function maskPhone(phone?: string | null) {
  if (!phone) return '-'
  if (phone.length < 7) return phone
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`
}

export default async function OnlineApplicationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const workLotId = await getCurrentWorkParkingLotId()
  let rows: any[] = []
  let errorText = ''

  if (workLotId) {
    const { data, error } = await supabase
      .from('rental_applications')
      .select(`
        id, application_kind, existing_monthly_rental_id, renewal_requested_months,
        customer_code, applicant_name, phone, vehicle_plate, vehicle_type,
        rental_type, qualification_type, qualification_status,
        otp_verified, status, created_at,
        parking_lots(name)
      `)
      .eq('parking_lot_id', workLotId)
      .order('created_at', { ascending: false })

    rows = data || []
    if (error) errorText = error.message
  }

  const pendingCount = rows.filter((row) => row.status === 'pending').length
  const revisionCount = rows.filter((row) => row.status === 'needs_revision').length
  const waitingCount = rows.filter((row) => row.status === 'waiting').length
  const signingCount = rows.filter((row) => row.status === 'contract_sent').length
  const completedCount = rows.filter((row) => row.status === 'completed').length
  const renewalCount = rows.filter((row) => row.application_kind === 'renewal').length

  return (
    <div className={admin.page}>
      <div className={admin.headerPanel}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>月租線上申請</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            審核民眾線上申請、手機 OTP 與資格資料。
          </p>
        </div>
        <div className={admin.headerActions}>
          <Link
            href="/dashboard/online/capacity"
            className="btn"
            style={{ textDecoration: 'none' }}
          >
            名額控管
          </Link>
          <Link
            href="/dashboard/online/reports"
            className="btn"
            style={{ textDecoration: 'none' }}
          >
            營運報表
          </Link>
          <Link
            href="/dashboard/online/audit"
            className="btn"
            style={{ textDecoration: 'none' }}
          >
            操作紀錄
          </Link>
          <Link
            href="/dashboard/online/reminders"
            className="btn"
            style={{ textDecoration: 'none' }}
          >
            待辦提醒
          </Link>
          <Link
            href="/dashboard/online/application-settings"
            className="btn"
            style={{ textDecoration: 'none' }}
          >
            申請開放設定
          </Link>
          <Link
            href="/dashboard/online"
            className="btn"
            style={{ textDecoration: 'none' }}
          >
            返回線上作業
          </Link>
        </div>
      </div>

      {!workLotId && (
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          請先從左側選擇「目前工作停車場」。
        </div>
      )}

      {errorText && (
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          讀取失敗：{errorText}
        </div>
      )}

      <div className={admin.metricGrid}>
        {[
          ['待審核', pendingCount],
          ['待補件', revisionCount],
          ['候補', waitingCount],
          ['待簽約', signingCount],
          ['已完成', completedCount],
          ['續租申請', renewalCount],
        ].map(([label, value]) => (
          <div key={String(label)} className={admin.metricCard}>
            <div className={admin.metricLabel}>{label}</div>
            <div className={admin.metricValue}>{value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>申請名單</h2>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse' }}
          >
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>申請時間</th>
                <th>申請類型</th>
                <th>客戶編號</th>
                <th>姓名</th>
                <th>電話</th>
                <th>車牌</th>
                <th>車種</th>
                <th>月租類型</th>
                <th>OTP</th>
                <th>資格方式</th>
                <th>資格狀態</th>
                <th>案件狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => (
                <tr key={row.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 8 }}>
                    {new Date(row.created_at).toLocaleString('zh-TW')}
                  </td>
                  <td style={{ padding: 8 }}>
                    <strong style={{ color: row.application_kind === 'renewal' ? '#166534' : '#334155' }}>
                      {row.application_kind === 'renewal' ? '續租' : '新申請'}
                    </strong>
                    {row.application_kind === 'renewal' && row.renewal_requested_months ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        希望 {row.renewal_requested_months} 個月
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: 8 }}>{row.customer_code || '-'}</td>
                  <td style={{ padding: 8 }}>{row.applicant_name}</td>
                  <td style={{ padding: 8 }}>{maskPhone(row.phone)}</td>
                  <td style={{ padding: 8 }}>{row.vehicle_plate}</td>
                  <td style={{ padding: 8 }}>
                    {row.vehicle_type === 'motorcycle'
                      ? '機車'
                      : row.vehicle_type === 'heavy_motorcycle'
                        ? '重機'
                        : '汽車'}
                  </td>
                  <td style={{ padding: 8 }}>{row.rental_type || '-'}</td>
                  <td style={{ padding: 8 }}>{row.otp_verified ? '已驗證' : '未驗證'}</td>
                  <td style={{ padding: 8 }}>{qualificationLabel(row.qualification_type)}</td>
                  <td style={{ padding: 8 }}>{qualificationStatusText(row.qualification_status)}</td>
                  <td style={{ padding: 8 }}><span className={admin.badge} data-status={row.status}>{statusText(row.status)}</span></td>
                  <td style={{ padding: 8 }}>
                    <Link href={`/dashboard/online/applications/${row.id}`}>
                      查看／審核
                    </Link>
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td
                    colSpan={13}
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      color: '#64748b',
                    }}
                  >
                    目前沒有申請資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
