import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import ContractMonthlySyncRetryButton from '@/components/ContractMonthlySyncRetryButton'
import ContractSignInviteButton from '@/components/ContractSignInviteButton'
import FormalContractPdfButton from '@/components/FormalContractPdfButton'
import admin from '@/components/OnlineAdmin.module.css'

function statusText(value?: string | null) {
  if (value === 'draft') return '草稿'
  if (value === 'sent') return '待簽約'
  if (value === 'signed') return '已簽署'
  if (value === 'cancelled') return '已取消'
  return value || '-'
}

function linkState(row: any) {
  if (row.status !== 'sent') return '-'
  if (!row.sign_token_expires_at) return '未建立'
  return new Date(row.sign_token_expires_at).getTime() < Date.now()
    ? '已過期'
    : '有效'
}

function syncText(value?: string | null) {
  if (value === 'pending') return '待同步'
  if (value === 'synced') return '已進月租總表'
  if (value === 'conflict') return '資料衝突'
  if (value === 'error') return '同步失敗'
  return value || '-'
}

function syncColor(value?: string | null) {
  if (value === 'synced') return '#166534'
  if (value === 'conflict') return '#b45309'
  if (value === 'error') return '#b91c1c'
  return '#475569'
}

function inviteText(value?: string | null, dev = false) {
  if (dev && value === 'sent') return '開發測試'
  if (value === 'sent') return '已發送'
  if (value === 'failed') return '發送失敗'
  if (value === 'pending') return '待發送'
  return '-'
}

export default async function OnlineContractsPage() {
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
      .from('contracts')
      .select(`
        id,
        contract_no,
        customer_code,
        customer_name,
        vehicle_plate,
        start_date,
        end_date,
        monthly_fee,
        status,
        signed_at,
        pdf_path,
        pdf_generated_at,
        created_at,
        sign_token_expires_at,
        sign_invitation_sent_at,
        sign_invitation_provider,
        sign_invitation_status,
        sign_invitation_error,
        monthly_sync_status,
        monthly_sync_error,
        monthly_rental_id,
        monthly_synced_at,
        reissue_count,
        cancelled_at,
        cancel_reason
      `)
      .eq('parking_lot_id', workLotId)
      .order('created_at', { ascending: false })

    rows = data || []
    if (error) errorText = error.message
  }

  const devMode = process.env.OTP_DEV_MODE === 'true'
  const pendingCount = rows.filter((row: any) => row.status === 'sent').length
  const expiredCount = rows.filter((row: any) => linkState(row) === '已過期').length
  const signedCount = rows.filter((row: any) => row.status === 'signed').length
  const syncIssueCount = rows.filter((row: any) =>
    ['conflict', 'error'].includes(row.monthly_sync_status)
  ).length

  return (
    <div className={admin.page}>
      <div className={admin.headerPanel}>
        <div>
          <h1 style={{ marginTop: 0 }}>電子契約</h1>
          <p className="muted">
            待簽約案件可重新產生 72 小時有效的新簽約連結；已簽署契約會自動同步至月租總表。
          </p>
        </div>

        <div className={admin.headerActions}>
          <Link href="/dashboard/online/capacity">名額控管</Link>
          <Link href="/dashboard/online/reports">營運報表</Link>
          <Link href="/dashboard/online/audit">操作紀錄</Link>
          <Link href="/dashboard/online/reminders">待辦提醒</Link>
          <Link href="/dashboard/online/application-settings">申請開放設定</Link>
          <Link href="/dashboard/online">返回線上作業</Link>
        </div>
      </div>

      {!workLotId && (
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          請先選擇工作停車場。
        </div>
      )}

      {errorText && (
        <div className="card" style={{ marginTop: 20, color: '#dc2626' }}>
          讀取失敗：{errorText}
        </div>
      )}

      <div className={admin.metricGrid}>
        <div className={admin.metricCard}>
          <div className={admin.metricLabel}>待簽約</div>
          <div className={admin.metricValue}>{pendingCount}</div>
        </div>
        <div className={admin.metricCard}>
          <div className={admin.metricLabel}>連結已過期</div>
          <div className={admin.metricValue} style={{ color: expiredCount ? '#b91c1c' : undefined }}>{expiredCount}</div>
        </div>
        <div className={admin.metricCard}>
          <div className={admin.metricLabel}>已簽署</div>
          <div className={admin.metricValue}>{signedCount}</div>
        </div>
        <div className={admin.metricCard}>
          <div className={admin.metricLabel}>月租同步異常</div>
          <div className={admin.metricValue} style={{ color: syncIssueCount ? '#b91c1c' : undefined }}>{syncIssueCount}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              minWidth: 1450,
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>客戶編號</th>
                <th>契約編號</th>
                <th>姓名</th>
                <th>車牌</th>
                <th>租期</th>
                <th>金額</th>
                <th>契約狀態</th>
                <th>簽約通知</th>
                <th>連結期限</th>
                <th>月租同步</th>
                <th>簽署時間</th>
                <th>操作</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row: any) => (
                <tr
                  key={row.id}
                  style={{
                    borderTop: '1px solid #e5e7eb',
                    verticalAlign: 'top',
                  }}
                >
                  <td style={{ padding: 8 }}>
                    <strong>{row.customer_code || '-'}</strong>
                  </td>

                  <td style={{ padding: 8 }}>
                    <Link href={`/dashboard/online/contracts/${row.id}`}>
                      {row.contract_no}
                    </Link>
                  </td>

                  <td style={{ padding: 8 }}>{row.customer_name}</td>
                  <td style={{ padding: 8 }}>{row.vehicle_plate}</td>
                  <td style={{ padding: 8 }}>
                    {row.start_date || '-'} ～ {row.end_date || '-'}
                  </td>
                  <td style={{ padding: 8 }}>
                    NT$ {Number(row.monthly_fee || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: 8 }}>
                    <span className={admin.badge} data-status={row.status}>{statusText(row.status)}</span>
                    {row.status === 'sent' && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: linkState(row) === '已過期' ? '#b91c1c' : '#166534',
                          fontWeight: 700,
                        }}
                      >
                        簽約連結：{linkState(row)}
                      </div>
                    )}
                    {Number(row.reissue_count || 0) > 0 && (
                      <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                        已重新審核 {row.reissue_count} 次
                      </div>
                    )}
                  </td>

                  <td style={{ padding: 8 }}>
                    <strong>{inviteText(row.sign_invitation_status, devMode)}</strong>
                    {row.sign_invitation_error && (
                      <div style={{ fontSize: 12, color: '#b91c1c', maxWidth: 220 }}>
                        {row.sign_invitation_error}
                      </div>
                    )}
                  </td>

                  <td style={{ padding: 8 }}>
                    {row.status === 'sent' && row.sign_token_expires_at
                      ? new Date(row.sign_token_expires_at).toLocaleString('zh-TW')
                      : '-'}
                  </td>

                  <td style={{ padding: 8 }}>
                    <div
                      style={{
                        color: syncColor(row.monthly_sync_status),
                        fontWeight: 700,
                      }}
                    >
                      {row.status === 'signed'
                        ? syncText(row.monthly_sync_status)
                        : '-'}
                    </div>
                    {row.monthly_sync_error && (
                      <div
                        style={{
                          marginTop: 5,
                          maxWidth: 280,
                          fontSize: 12,
                          color: '#64748b',
                        }}
                      >
                        {row.monthly_sync_error}
                      </div>
                    )}
                  </td>

                  <td style={{ padding: 8 }}>
                    {row.signed_at
                      ? new Date(row.signed_at).toLocaleString('zh-TW')
                      : '-'}
                  </td>

                  <td style={{ padding: 8 }}>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <Link href={`/dashboard/online/contracts/${row.id}`}>
                        查看契約
                      </Link>

                      {row.status === 'signed' && (
                        <>
                          <Link
                            href={`/contract-print/${row.id}`}
                            target="_blank"
                          >
                            列印
                          </Link>
                          <FormalContractPdfButton
                            contractId={row.id}
                            pdfReady={Boolean(row.pdf_path)}
                            compact
                          />
                        </>
                      )}

                      {row.status === 'sent' && (
                        <ContractSignInviteButton contractId={row.id} />
                      )}

                      {row.monthly_sync_status === 'synced' &&
                      row.monthly_rental_id ? (
                        <Link href="/dashboard/monthly-rentals">
                          查看月租總表
                        </Link>
                      ) : row.status === 'signed' ? (
                        <ContractMonthlySyncRetryButton contractId={row.id} />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td
                    colSpan={12}
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      color: '#64748b',
                    }}
                  >
                    目前沒有契約資料
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
