import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ContractSignInviteButton from '@/components/ContractSignInviteButton'
import ContractMonthlySyncRetryButton from '@/components/ContractMonthlySyncRetryButton'
import ContractManagementActions from '@/components/ContractManagementActions'
import FormalContractPdfButton from '@/components/FormalContractPdfButton'
import admin from '@/components/OnlineAdmin.module.css'

function maskPhone(phone?: string | null) {
  if (!phone) return '-'
  if (phone.length < 7) return phone
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`
}

function relationName(value: any) {
  if (Array.isArray(value)) return value[0]?.name || '-'
  return value?.name || '-'
}

function statusText(value?: string | null) {
  if (value === 'draft') return '草稿'
  if (value === 'sent') return '待簽約'
  if (value === 'signed') return '已簽署'
  if (value === 'cancelled') return '已取消／退回審核'
  return value || '-'
}

function eventText(value?: string | null) {
  const map: Record<string, string> = {
    CREATED: '建立待簽契約',
    SIGN_LINK_REGENERATED: '重新產生簽約連結',
    CANCELLED_FOR_REVIEW: '取消待簽並退回審核',
    REISSUED_AFTER_REVIEW: '重新審核並重建契約',
    SIGNED: '完成電子簽署',
  }
  return map[value || ''] || value || '-'
}

export default async function OnlineContractDetailPage({
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
    .from('contracts')
    .select(`
      id, application_id, contract_no, customer_code, parking_lot_id,
      customer_name, phone, customer_address,
      emergency_contact_name, emergency_contact_phone,
      vehicle_plate, vehicle_type, rental_type, start_date, end_date,
      monthly_fee, contract_version, contract_snapshot, document_hash,
      status, signed_at, pdf_path, pdf_generated_at, sign_token_expires_at,
      sign_invitation_sent_at, sign_invitation_provider,
      sign_invitation_status, sign_invitation_error,
      monthly_sync_status, monthly_sync_error, monthly_rental_id,
      cancelled_at, cancelled_by, cancel_reason,
      reissue_count, reissued_at, reissued_by,
      created_at, parking_lots(name),
      contract_signatures(
        id, signer_name, verification_method, otp_verified, signed_at,
        document_hash, privacy_agreed_at, electronic_agreed_at,
        electronic_signature_consent_at,
        contract_read_confirmed_at, data_confirmed_at,
        non_fixed_space_agreed_at,
        handwritten_signature_hash, handwritten_signature_at,
        handwritten_signature_stroke_count, handwritten_signature_point_count,
        handwritten_signature_path_length
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error || !row) notFound()

  const { data: lifecycleEvents } = await supabase
    .from('contract_lifecycle_events')
    .select(`
      id, event_type, previous_status, new_status, note, metadata,
      actor_user_id, created_at
    `)
    .eq('contract_id', id)
    .order('created_at', { ascending: false })

  const signature = Array.isArray(row.contract_signatures)
    ? row.contract_signatures[0]
    : row.contract_signatures

  const linkExpired =
    row.status === 'sent' &&
    Boolean(row.sign_token_expires_at) &&
    new Date(row.sign_token_expires_at as string).getTime() < Date.now()

  return (
    <div className={admin.page}>
      <div className={admin.headerPanel}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>電子契約詳細資料</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            契約編號：{row.contract_no}
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
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
          {row.application_id && (
            <Link href={`/dashboard/online/applications/${row.application_id}`}>
              查看申請案件
            </Link>
          )}
          <Link href="/dashboard/online/contracts">返回契約名單</Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>契約資料</h2>
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
            <strong>{relationName(row.parking_lots)}</strong>
          </div>
          <div>
            <span className="muted">客戶編號</span>
            <br />
            <strong>{row.customer_code || '-'}</strong>
          </div>
          <div>
            <span className="muted">承租人</span>
            <br />
            <strong>{row.customer_name}</strong>
          </div>
          <div>
            <span className="muted">手機</span>
            <br />
            <strong>{maskPhone(row.phone)}</strong>
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
            <strong>{row.rental_type || '一般'}</strong>
          </div>
          <div>
            <span className="muted">租期</span>
            <br />
            <strong>
              {row.start_date} ～ {row.end_date}
            </strong>
          </div>
          <div>
            <span className="muted">月租金額</span>
            <br />
            <strong>
              NT$ {Number(row.monthly_fee || 0).toLocaleString()}
            </strong>
          </div>
          <div>
            <span className="muted">契約版本</span>
            <br />
            <strong>{row.contract_version}</strong>
          </div>
          <div>
            <span className="muted">契約狀態</span>
            <br />
            <strong>{statusText(row.status)}</strong>
          </div>
          <div>
            <span className="muted">重新審核次數</span>
            <br />
            <strong>{Number(row.reissue_count || 0)}</strong>
          </div>
          <div>
            <span className="muted">月租同步</span>
            <br />
            <strong>{row.monthly_sync_status || '-'}</strong>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span className="muted">文件雜湊</span>
            <br />
            <strong style={{ wordBreak: 'break-all' }}>
              {row.document_hash || '-'}
            </strong>
          </div>
        </div>
      </div>

      {row.status === 'cancelled' && (
        <div
          className="card"
          style={{
            marginTop: 20,
            border: '1px solid #fecaca',
            background: '#fff7f7',
          }}
        >
          <h2 style={{ marginTop: 0 }}>此待簽契約已取消</h2>
          <p>
            取消時間：
            {row.cancelled_at
              ? new Date(row.cancelled_at).toLocaleString('zh-TW')
              : '-'}
          </p>
          <p style={{ whiteSpace: 'pre-wrap' }}>
            取消原因：{row.cancel_reason || '-'}
          </p>
          {row.application_id && (
            <Link href={`/dashboard/online/applications/${row.application_id}`}>
              回原申請重新審核
            </Link>
          )}
        </div>
      )}

      {row.status === 'sent' && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>簽約通知</h2>
          <p>
            連結狀態：
            <strong style={{ color: linkExpired ? '#b91c1c' : '#166534' }}>
              {linkExpired ? '已過期' : '有效'}
            </strong>
          </p>
          <p>
            目前簽約連結有效至：
            {row.sign_token_expires_at
              ? new Date(row.sign_token_expires_at).toLocaleString('zh-TW')
              : '-'}
          </p>
          <p>最近通知狀態：{row.sign_invitation_status || '-'}</p>
          {row.sign_invitation_error && (
            <p style={{ color: '#b91c1c' }}>{row.sign_invitation_error}</p>
          )}
          <ContractSignInviteButton contractId={row.id} />
        </div>
      )}

      <ContractManagementActions
        contractId={row.id}
        status={row.status}
        applicationId={row.application_id}
      />

      {row.status === 'signed' && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>電子簽署紀錄</h2>
          {signature ? (
            <>
            <div style={{ display: 'grid', gap: 8 }}>
              <div>
                簽署人：<strong>{signature.signer_name}</strong>
              </div>
              <div>
                簽署方式：
                {signature.verification_method === 'contract_sign_phone_otp_handwritten'
                  ? '手機 OTP＋手寫簽名'
                  : signature.verification_method}
              </div>
              <div>
                手機 OTP：{signature.otp_verified ? '✓ 已驗證' : '✕ 未驗證'}
              </div>
              <div>
                簽署時間：
                {new Date(signature.signed_at).toLocaleString('zh-TW')}
              </div>
              <div>
                契約閱讀確認：{signature.contract_read_confirmed_at ? '✓' : '-'}
              </div>
              <div>
                電子文件同意：{signature.electronic_agreed_at ? '✓' : '-'}
              </div>
              <div>
                電子簽章方式明確同意：
                {signature.electronic_signature_consent_at ? '✓' : '-'}
              </div>
              <div>
                資料正確確認：{signature.data_confirmed_at ? '✓' : '-'}
              </div>
              <div>
                非固定車位確認：
                {signature.non_fixed_space_agreed_at ? '✓' : '-'}
              </div>
              <div>
                手寫簽名：{signature.handwritten_signature_at ? '✓ 已完成' : '-'}
              </div>
            </div>

            {signature.handwritten_signature_at && (
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  border: '1px solid #cbd5e1',
                  borderRadius: 10,
                  background: '#fff',
                  maxWidth: 620,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 8 }}>承租人手寫簽名</div>
                <img
                  src={`/api/admin/online-contracts/signature/${row.id}`}
                  alt="承租人手寫簽名"
                  style={{
                    display: 'block',
                    width: '100%',
                    maxWidth: 520,
                    height: 150,
                    objectFit: 'contain',
                    objectPosition: 'left center',
                    background: '#fff',
                  }}
                />
                <div
                  style={{
                    marginTop: 8,
                    color: '#64748b',
                    fontSize: 11,
                    wordBreak: 'break-all',
                  }}
                >
                  簽名 SHA-256：{signature.handwritten_signature_hash || '-'}
                </div>
              </div>
            )}
            </>
          ) : (
            <p>尚未讀取到簽署紀錄。</p>
          )}

          {row.monthly_sync_status !== 'synced' && (
            <div style={{ marginTop: 14 }}>
              <ContractMonthlySyncRetryButton contractId={row.id} />
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>契約異動紀錄</h2>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              minWidth: 850,
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>時間</th>
                <th>事件</th>
                <th>狀態變化</th>
                <th>說明</th>
              </tr>
            </thead>
            <tbody>
              {(lifecycleEvents || []).map((item: any) => (
                <tr key={item.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 8 }}>
                    {new Date(item.created_at).toLocaleString('zh-TW')}
                  </td>
                  <td style={{ padding: 8 }}>
                    <strong>{eventText(item.event_type)}</strong>
                  </td>
                  <td style={{ padding: 8 }}>
                    {item.previous_status || '-'} → {item.new_status || '-'}
                  </td>
                  <td style={{ padding: 8, whiteSpace: 'pre-wrap' }}>
                    {item.note || '-'}
                  </td>
                </tr>
              ))}
              {!lifecycleEvents?.length && (
                <tr>
                  <td colSpan={4} style={{ padding: 18, color: '#64748b' }}>
                    目前尚無第十二階段生命週期紀錄；舊契約不會回填歷史事件。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>契約內容快照</h2>
        <div
          style={{
            whiteSpace: 'pre-wrap',
            lineHeight: 1.8,
            padding: 18,
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            background: '#fff',
          }}
        >
          {row.contract_snapshot || '沒有契約內容'}
        </div>
      </div>
    </div>
  )
}
