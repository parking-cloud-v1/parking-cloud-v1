'use client'

import { useState } from 'react'

type Props = {
  applicationId: string
  qualificationRequired: boolean
  currentQualificationStatus: string
  currentStatus: string
  currentSupplementNote?: string | null
  capacityFull?: boolean
  capacityLimit?: number | null
  capacityUsed?: number | null
  fromWaiting?: boolean
  isRenewal?: boolean
  initialStartDate?: string | null
  initialEndDate?: string | null
  initialMonthlyFee?: number | null
}

type ApprovalResult = {
  customerCode: string
  contractNo: string
  signUrl: string
  expiresAt: string
  smsStatus: string
  smsProvider: string
  smsError?: string | null
  devMode?: boolean
  convertedFromWaiting?: boolean
  reissuedContract?: boolean
  renewalApplication?: boolean
}

type SupplementResult = {
  supplementUrl: string
  expiresAt: string
  smsStatus: string
  smsProvider: string
  smsError?: string | null
  devMode?: boolean
}

export default function OnlineApplicationReviewActions({
  applicationId,
  qualificationRequired,
  currentQualificationStatus,
  currentStatus,
  currentSupplementNote,
  capacityFull = false,
  capacityLimit = null,
  capacityUsed = null,
  fromWaiting = false,
  isRenewal = false,
  initialStartDate = '',
  initialEndDate = '',
  initialMonthlyFee = null,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [processed, setProcessed] = useState(false)
  const [approvalResult, setApprovalResult] =
    useState<ApprovalResult | null>(null)
  const [supplementResult, setSupplementResult] =
    useState<SupplementResult | null>(null)

  const [qualificationStatus, setQualificationStatus] = useState(
    currentQualificationStatus ||
      (qualificationRequired ? 'pending' : 'not_required')
  )
  const [reviewNote, setReviewNote] = useState(currentSupplementNote || '')
  const [startDate, setStartDate] = useState(initialStartDate || '')
  const [endDate, setEndDate] = useState(initialEndDate || '')
  const [monthlyFee, setMonthlyFee] = useState(
    initialMonthlyFee === null || initialMonthlyFee === undefined
      ? ''
      : String(initialMonthlyFee)
  )
  const waitlistFlow = currentStatus === 'waiting' || fromWaiting

  async function copyText(value: string, successText: string) {
    try {
      await navigator.clipboard.writeText(value)
      setMessage(successText)
    } catch {
      setMessage('無法自動複製，請手動選取連結。')
    }
  }

  async function submit(
    action: 'approve' | 'reject' | 'waiting' | 'needs_revision'
  ) {
    if (action === 'approve') {
      if (currentStatus === 'needs_revision') {
        setMessage('此案件尚未完成補件，完成補件後才能核准。')
        return
      }
      if (qualificationRequired && qualificationStatus !== 'approved') {
        setMessage('此申請需要資格審核，請先將資格結果設為「通過」。')
        return
      }
      if (!startDate || !endDate || Number(monthlyFee) < 0 || monthlyFee === '') {
        setMessage('核准時請填寫租期與月租金額。')
        return
      }
      if (endDate < startDate) {
        setMessage('租期結束日不可早於開始日。')
        return
      }
    }

    if (action === 'needs_revision' && !reviewNote.trim()) {
      setMessage('請先在「審核／補件說明」填寫需要民眾補正的內容。')
      return
    }

    const confirmText =
      action === 'approve'
        ? waitlistFlow
          ? '確定將此候補案件轉正式並建立電子契約？\n\n建立契約成功後，原候補列會標示為已轉正式。'
          : isRenewal
            ? '確定核准這筆既有月租續租並建立電子契約？\n\n系統會沿用原客戶編號，簽署完成後更新原 monthly_rentals，不會新增第二筆月租資料。'
            : '確定核准並建立正式電子契約？\n\n系統會先配置客戶編號，再以「客戶編號-YYYYMM」建立契約編號，並產生 72 小時有效的專屬簽約連結。'
        : action === 'reject'
          ? '確定不通過此申請？'
          : action === 'waiting'
            ? '確定轉入月租候補名單？\n\n這筆資料會同步進原系統的「月租候補名單」。'
            : currentStatus === 'needs_revision'
              ? '確定重新產生補件連結？舊補件連結會立即失效。'
              : '確定要求民眾補件？系統會產生 72 小時有效的補件連結。'

    if (!window.confirm(confirmText)) return

    setSaving(true)
    setMessage('')
    setSupplementResult(null)

    try {
      const response = await fetch('/api/admin/online-applications/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: applicationId,
          action,
          qualification_status: qualificationStatus,
          review_note: reviewNote,
          start_date: startDate,
          end_date: endDate,
          monthly_fee: Number(monthlyFee || 0),
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        setMessage(result?.error || '處理失敗。')
        return
      }

      if (action === 'approve') {
        setProcessed(true)
        setApprovalResult({
          customerCode: result.customer_code,
          contractNo: result.contract_no,
          signUrl: result.sign_url,
          expiresAt: result.expires_at,
          smsStatus: result.sms_status,
          smsProvider: result.sms_provider,
          smsError: result.sms_error,
          devMode: result.dev_mode,
          convertedFromWaiting: result.converted_from_waiting,
          reissuedContract: result.reissued_contract,
          renewalApplication: result.renewal_application,
        })
        setMessage(
          result.reissued_contract
            ? '已重新審核並重建待簽契約。'
            : result.converted_from_waiting
              ? '候補已轉正式並建立電子契約。'
              : result.renewal_application
                ? '續租已核准並建立電子契約。'
                : '已核准並建立電子契約。'
        )
      } else if (action === 'needs_revision') {
        setSupplementResult({
          supplementUrl: result.supplement_url,
          expiresAt: result.expires_at,
          smsStatus: result.sms_status,
          smsProvider: result.sms_provider,
          smsError: result.sms_error,
          devMode: result.dev_mode,
        })
        setMessage('已建立補件通知。')
      } else {
        setMessage(
          action === 'waiting'
            ? '已同步轉入月租候補名單。'
            : '案件已標記為不通過。'
        )
        setTimeout(() => window.location.reload(), 800)
      }
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setSaving(false)
    }
  }

  if (approvalResult) {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>
          {approvalResult.reissuedContract
            ? '重新審核完成'
            : approvalResult.convertedFromWaiting
              ? '候補轉正式完成'
              : approvalResult.renewalApplication
                ? '續租核准完成'
                : '核准完成'}
        </h2>

        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            客戶編號：<strong>{approvalResult.customerCode}</strong>
          </div>
          <div>
            契約編號：<strong>{approvalResult.contractNo}</strong>
          </div>
          <div>
            簽約期限：
            <strong>
              {new Date(approvalResult.expiresAt).toLocaleString('zh-TW')}
            </strong>
          </div>
          <div>
            簡訊通知：
            <strong>
              {approvalResult.devMode
                ? '開發測試模式（未實際發送）'
                : approvalResult.smsStatus === 'sent'
                  ? '已發送'
                  : '發送失敗'}
            </strong>
          </div>

          {approvalResult.smsError && (
            <div style={{ color: '#b91c1c' }}>
              簡訊錯誤：{approvalResult.smsError}
            </div>
          )}

          <div>
            <div style={{ fontWeight: 700, marginBottom: 5 }}>專屬簽約連結</div>
            <div
              style={{
                padding: 10,
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                background: '#f8fafc',
                wordBreak: 'break-all',
              }}
            >
              {approvalResult.signUrl}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              onClick={() =>
                copyText(approvalResult.signUrl, '簽約連結已複製。')
              }
            >
              複製簽約連結
            </button>
            <a
              href={approvalResult.signUrl}
              target="_blank"
              rel="noreferrer"
              className="btn"
              style={{ textDecoration: 'none' }}
            >
              開啟簽約頁測試
            </a>
            <button type="button" onClick={() => window.location.reload()}>
              回到案件資料
            </button>
          </div>

          {message && <div>{message}</div>}
        </div>
      </div>
    )
  }

  if (supplementResult) {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>補件通知已建立</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            補件期限：
            <strong>
              {new Date(supplementResult.expiresAt).toLocaleString('zh-TW')}
            </strong>
          </div>
          <div>
            簡訊通知：
            <strong>
              {supplementResult.devMode
                ? '開發測試模式（未實際發送）'
                : supplementResult.smsStatus === 'sent'
                  ? '已發送'
                  : '發送失敗'}
            </strong>
          </div>

          {supplementResult.smsError && (
            <div style={{ color: '#b91c1c' }}>
              簡訊錯誤：{supplementResult.smsError}
            </div>
          )}

          <div>
            <div style={{ fontWeight: 700, marginBottom: 5 }}>專屬補件連結</div>
            <div
              style={{
                padding: 10,
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                background: '#f8fafc',
                wordBreak: 'break-all',
              }}
            >
              {supplementResult.supplementUrl}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              onClick={() =>
                copyText(
                  supplementResult.supplementUrl,
                  '補件連結已複製。'
                )
              }
            >
              複製補件連結
            </button>
            <a
              href={supplementResult.supplementUrl}
              target="_blank"
              rel="noreferrer"
              className="btn"
              style={{ textDecoration: 'none' }}
            >
              開啟補件頁測試
            </a>
            <button type="button" onClick={() => window.location.reload()}>
              回到案件資料
            </button>
          </div>
          {message && <div>{message}</div>}
        </div>
      </div>
    )
  }

  if (processed || ['contract_sent', 'completed', 'rejected'].includes(currentStatus)) {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        此案件目前狀態：{processed ? 'contract_sent' : currentStatus}，不再提供一般審核操作。
      </div>
    )
  }

  const isWaiting = waitlistFlow
  const isNeedsRevision = currentStatus === 'needs_revision'

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>
        {isWaiting
          ? '候補轉正式處理'
          : isNeedsRevision
            ? '等待補件'
            : isRenewal
              ? '既有月租續租審核'
              : '審核處理'}
      </h2>

      {isRenewal && !isNeedsRevision && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            color: '#166534',
            lineHeight: 1.7,
          }}
        >
          此案件來自既有月租戶線上續租。系統會沿用原客戶編號；若原月租仍有效，續租不增加新的月租名額占用。
        </div>
      )}

      {capacityFull && !isNeedsRevision && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#991b1b',
          }}
        >
          此車種目前月租名額已滿
          {capacityLimit !== null
            ? `（上限 ${capacityLimit}，目前占用 ${capacityUsed ?? capacityLimit}）`
            : ''}
          。按下核准時後端仍會再次即時檢查；若仍額滿，系統會阻擋建立契約。
        </div>
      )}

      {isNeedsRevision && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 8,
          }}
        >
          此案件正在等待民眾補件。可重新產生補件連結，或直接標記不通過；補件送出後案件會自動回到「待審核」。
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, maxWidth: 760 }}>
        {qualificationRequired && !isNeedsRevision && (
          <label>
            資格審核結果
            <select
              value={qualificationStatus}
              onChange={(e) => setQualificationStatus(e.target.value)}
              style={{ width: '100%', padding: 9, marginTop: 4 }}
            >
              <option value="pending">待審核</option>
              <option value="approved">通過</option>
              <option value="rejected">不通過</option>
            </select>
          </label>
        )}

        <label>
          審核／補件說明
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="例如：請補正聯絡地址、車牌輸入錯誤、里民資格資料需再確認…"
            style={{ width: '100%', minHeight: 90, padding: 9, marginTop: 4 }}
          />
        </label>

        {!isNeedsRevision && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
              gap: 10,
            }}
          >
            <label>
              租期開始
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ width: '100%', padding: 9 }}
              />
            </label>
            <label>
              租期結束
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ width: '100%', padding: 9 }}
              />
            </label>
            <label>
              月租金額
              <input
                type="number"
                min="0"
                value={monthlyFee}
                onChange={(e) => setMonthlyFee(e.target.value)}
                style={{ width: '100%', padding: 9 }}
              />
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!isNeedsRevision && (
            <button
              className="btn"
              disabled={saving}
              onClick={() => submit('approve')}
            >
              {saving
                ? '處理中…'
                : isWaiting
                  ? '候補轉正式並建立契約'
                  : isRenewal
                    ? '核准續租並建立契約'
                    : '核准並建立契約'}
            </button>
          )}

          {!isWaiting && (
            <button
              disabled={saving}
              onClick={() => submit('needs_revision')}
            >
              {isNeedsRevision ? '重新發送補件連結' : '要求補件'}
            </button>
          )}

          {!isWaiting && !isNeedsRevision && (
            <button disabled={saving} onClick={() => submit('waiting')}>
              轉候補
            </button>
          )}

          <button
            disabled={saving}
            onClick={() => submit('reject')}
            style={{ color: '#b91c1c' }}
          >
            不通過
          </button>
        </div>

        {message && <div style={{ whiteSpace: 'pre-wrap' }}>{message}</div>}
      </div>
    </div>
  )
}
