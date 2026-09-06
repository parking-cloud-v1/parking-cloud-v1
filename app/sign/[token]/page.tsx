'use client'

import publicUi from '@/components/PublicPortal.module.css'
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useParams } from 'next/navigation'
import PrintContractButton from '@/components/PrintContractButton'
import HandwrittenSignaturePad from '@/components/HandwrittenSignaturePad'
import { buildSignedContractPdfBlob } from '@/lib/online-contracts/signedPdfClient'

type ContractView = {
  contract_no: string
  parking_lot_name?: string
  customer_name: string
  vehicle_plate: string
  vehicle_type?: string
  rental_type?: string | null
  start_date: string
  end_date: string
  monthly_fee: number
  contract_version?: string
  contract_snapshot: string
  document_verified?: boolean
  document_hash?: string | null
  status: string
  signed_at?: string | null
  monthly_sync_status?: string | null
  pdf_available?: boolean
  signature?: {
    signer_name?: string | null
    verification_method?: string | null
    otp_verified?: boolean | null
    signed_at?: string | null
    document_hash?: string | null
    privacy_agreed_at?: string | null
    electronic_agreed_at?: string | null
    electronic_signature_consent_at?: string | null
    contract_read_confirmed_at?: string | null
    data_confirmed_at?: string | null
    non_fixed_space_agreed_at?: string | null
    handwritten_signature_hash?: string | null
    handwritten_signature_at?: string | null
    handwritten_signature_url?: string | null
    handwritten_signature_stroke_count?: number | null
    handwritten_signature_point_count?: number | null
    handwritten_signature_path_length?: number | null
  } | null
}

function money(value: number) {
  return new Intl.NumberFormat('zh-TW').format(Number(value || 0))
}

export default function PublicContractSignPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token || ''
  const contractBoxRef = useRef<HTMLDivElement | null>(null)

  const [contract, setContract] = useState<ContractView | null>(null)
  const [signerName, setSignerName] = useState('')
  const [readComplete, setReadComplete] = useState(false)
  const [handwrittenSignature, setHandwrittenSignature] = useState({
    dataUrl: '',
    strokeCount: 0,
    pointCount: 0,
    pathLength: 0,
    isValid: false,
  })

  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [electronicAgreed, setElectronicAgreed] = useState(false)
  const [electronicSignatureConsent, setElectronicSignatureConsent] = useState(false)
  const [contractReadConfirmed, setContractReadConfirmed] = useState(false)
  const [dataConfirmed, setDataConfirmed] = useState(false)
  const [nonFixedSpaceAgreed, setNonFixedSpaceAgreed] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const [signOtpChallengeId, setSignOtpChallengeId] = useState('')
  const [signOtpCode, setSignOtpCode] = useState('')
  const [signOtpVerified, setSignOtpVerified] = useState(false)
  const [maskedPhone, setMaskedPhone] = useState('')
  const [debugCode, setDebugCode] = useState('')
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [monthlySyncMessage, setMonthlySyncMessage] = useState('')
  const [pdfMessage, setPdfMessage] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const response = await fetch(
          `/api/public/contracts/sign?token=${encodeURIComponent(token)}`,
          { cache: 'no-store' }
        )
        const result = await response.json()

        if (!response.ok) {
          setMessage(result?.error || '契約讀取失敗。')
          return
        }

        setContract(result.contract)
        setSignerName(result.contract.customer_name || '')
      } catch (error: any) {
        setMessage(error?.message || '系統連線失敗。')
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  function checkReadPosition() {
    const el = contractBoxRef.current
    if (!el) return

    const nearBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 24

    if (nearBottom) {
      setReadComplete(true)
    }
  }

  async function requestSignOtp() {
    setMessage('')
    setSendingOtp(true)
    setSignOtpVerified(false)
    setSignOtpCode('')
    setDebugCode('')

    try {
      const response = await fetch(
        '/api/public/contracts/sign/request-otp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setMessage(result?.error || '簽署驗證碼發送失敗。')
        return
      }

      setSignOtpChallengeId(result.challenge_id || '')
      setMaskedPhone(result.masked_phone || '')
      setDebugCode(result.debug_code || '')
      setMessage(
        `簽署驗證碼已發送至 ${result.masked_phone || '登記手機'}，請於 5 分鐘內完成驗證。`
      )
    } catch (error: any) {
      setMessage(error?.message || '無法連線到驗證服務。')
    } finally {
      setSendingOtp(false)
    }
  }

  async function verifySignOtp() {
    if (!signOtpChallengeId || !/^\d{6}$/.test(signOtpCode)) {
      setMessage('請輸入 6 位數簽署驗證碼。')
      return
    }

    setVerifyingOtp(true)
    setMessage('')

    try {
      const response = await fetch('/api/public/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: signOtpChallengeId,
          code: signOtpCode,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setMessage(result?.error || '簽署驗證失敗。')
        return
      }

      setSignOtpVerified(true)
      setMessage('簽署手機驗證完成。')
    } catch (error: any) {
      setMessage(error?.message || '驗證服務連線失敗。')
    } finally {
      setVerifyingOtp(false)
    }
  }

  async function createFormalPdf(
    signedContract: ContractView,
    signatureDataUrl: string,
    pdfUploadToken?: string | null
  ) {
    if (!pdfUploadToken) {
      setPdfMessage(
        '契約已完成正式封存；PDF 自動留存授權未建立，請稍後由主管確認。'
      )
      return
    }

    setPdfMessage('正在建立正式 PDF 留存檔…')

    try {
      const pdfBlob = await buildSignedContractPdfBlob({
        contractNo: signedContract.contract_no,
        parkingLotName: signedContract.parking_lot_name || '-',
        contractVersion: signedContract.contract_version || '-',
        customerName: signedContract.customer_name,
        vehiclePlate: signedContract.vehicle_plate,
        contractSnapshot: signedContract.contract_snapshot,
        documentHash:
          signedContract.document_hash ||
          signedContract.signature?.document_hash ||
          null,
        signedAt: signedContract.signed_at || null,
        signature: signedContract.signature || null,
        handwrittenSignatureDataUrl: signatureDataUrl,
      })

      const formData = new FormData()
      formData.append('pdf_upload_token', pdfUploadToken)
      formData.append(
        'file',
        new File(
          [pdfBlob],
          `${signedContract.contract_no}_正式簽約留存.pdf`,
          { type: 'application/pdf' }
        )
      )

      const response = await fetch(
        '/api/public/contracts/signed-pdf',
        {
          method: 'POST',
          body: formData,
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result?.error ||
            '正式 PDF 留存建立失敗。'
        )
      }

      setContract({
        ...signedContract,
        pdf_available: true,
      })

      setPdfMessage(
        result.already_exists
          ? '正式 PDF 留存檔已存在，可直接下載。'
          : '正式 PDF 留存檔已自動建立完成。'
      )
    } catch (error: any) {
      setPdfMessage(
        `契約已完成簽署，但正式 PDF 留存建立失敗：${
          error?.message || '未知錯誤'
        }。可稍後由主管處理。`
      )
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()

    if (!contract) return

    if (signerName.trim() !== contract.customer_name.trim()) {
      setMessage('簽署姓名必須與申請人姓名一致。')
      return
    }

    if (!readComplete) {
      setMessage('請先將完整契約內容閱讀至最下方。')
      return
    }

    if (!handwrittenSignature.isValid || !handwrittenSignature.dataUrl) {
      setMessage('請先完成承租人手寫簽名。')
      return
    }

    if (!signOtpVerified || !signOtpChallengeId) {
      setMessage('請先完成本次電子簽署手機 OTP 驗證。')
      return
    }

    if (
      !privacyAgreed ||
      !electronicAgreed ||
      !electronicSignatureConsent ||
      !contractReadConfirmed ||
      !dataConfirmed ||
      !nonFixedSpaceAgreed ||
      !confirmed
    ) {
      setMessage('請完成所有契約確認與同意項目。')
      return
    }

    if (
      !window.confirm(
        '確認送出電子簽署？\n\n送出後本版本契約內容將鎖定，並保存簽署與驗證紀錄。'
      )
    ) {
      return
    }

    setSaving(true)
    setMessage('')
    setMonthlySyncMessage('')
    setPdfMessage('')

    try {
      const response = await fetch('/api/public/contracts/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          signer_name: signerName,
          sign_otp_challenge_id: signOtpChallengeId,
          privacy_agreed: privacyAgreed,
          electronic_agreed: electronicAgreed,
          electronic_signature_consent: electronicSignatureConsent,
          contract_read_confirmed: contractReadConfirmed,
          data_confirmed: dataConfirmed,
          non_fixed_space_agreed: nonFixedSpaceAgreed,
          confirmed,
          handwritten_signature_data_url: handwrittenSignature.dataUrl,
          handwritten_signature_stroke_count: handwrittenSignature.strokeCount,
          handwritten_signature_point_count: handwrittenSignature.pointCount,
          handwritten_signature_path_length: handwrittenSignature.pathLength,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setMessage(result?.error || '簽署失敗。')
        return
      }

      const signedContract: ContractView = {
        ...contract,
        status: 'signed',
        signed_at: result.signed_at || new Date().toISOString(),
        signature: result.signature || null,
        monthly_sync_status: result.monthly_sync_status || null,
        pdf_available: false,
      }

      setContract(signedContract)
      setMessage(`電子簽署完成。契約編號：${result.contract_no}`)

      await createFormalPdf(
        signedContract,
        handwrittenSignature.dataUrl,
        result.pdf_upload_token || null
      )

      if (result.monthly_sync_status === 'synced') {
        setMonthlySyncMessage('月租資料已同步建立。')
      } else if (result.monthly_sync_message) {
        setMonthlySyncMessage(
          `契約已完成；月租同步狀態：${result.monthly_sync_message}`
        )
      }
    } catch (error: any) {
      setMessage(error?.message || '系統連線失敗。')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className={publicUi.portal} style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
        契約讀取中…
      </main>
    )
  }

  if (!contract) {
    return (
      <main className={publicUi.portal} style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
        <h1>無法開啟契約</h1>
        <p>{message}</p>
      </main>
    )
  }

  if (contract.status === 'signed') {
    const signature = contract.signature

    return (
      <main
        className={publicUi.portal}
        style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: '20px 20px 50px',
          color: '#111827',
          fontFamily:
            '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif',
        }}
      >
        <style>{`
          @page { size: A4; margin: 12mm; }
          @media print {
            .no-print { display: none !important; }
            .signed-summary { display: none !important; }
            .signed-contract { border: none !important; padding: 0 !important; margin: 0 !important; }
            .print-contract-heading { display: none !important; }
            .contract-text { font-size: 11pt !important; line-height: 1.65 !important; }
            .signature-cert { display: none !important; }
          }
        `}</style>

        <div
          className="signed-summary"
          style={{
            padding: 24,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 14,
          }}
        >
          <h1 style={{ marginTop: 0 }}>電子簽署完成</h1>
          <p>
            契約編號：<strong>{contract.contract_no}</strong>
          </p>
          <p>契約版本：{contract.contract_version || 'V2.1'}</p>
          <p>
            簽署時間：
            {contract.signed_at
              ? new Date(contract.signed_at).toLocaleString('zh-TW')
              : '-'}
          </p>
          <p>{message || '此契約已完成簽署。'}</p>
          {monthlySyncMessage && <p>{monthlySyncMessage}</p>}
          {pdfMessage && <p>{pdfMessage}</p>}
          <div
            className="no-print"
            style={{
              marginTop: 14,
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            {contract.pdf_available && (
              <a
                href={`/api/public/contracts/signed-pdf?token=${encodeURIComponent(token)}`}
                style={{
                  display: 'inline-block',
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: '#166534',
                  color: '#fff',
                  textDecoration: 'none',
                  fontWeight: 800,
                }}
              >
                下載正式留存檔（PDF）
              </a>
            )}
            <PrintContractButton label="列印" />
          </div>
        </div>

        <section
          className="signed-contract"
          style={{
            marginTop: 20,
            padding: 24,
            border: '1px solid #d1d5db',
            borderRadius: 12,
            background: '#fff',
          }}
        >
          <div
            className="print-contract-heading"
            style={{ textAlign: 'center', marginBottom: 18 }}
          >
            <h2 style={{ margin: 0, fontSize: 24 }}>租用停車位合約書</h2>
            <div style={{ marginTop: 8, color: '#64748b', fontSize: 13 }}>
              電子簽署正式留存版
            </div>
          </div>

          <div
            className="contract-text"
            style={{
              whiteSpace: 'pre-wrap',
              lineHeight: 1.8,
              fontSize: 15,
            }}
          >
            {contract.contract_snapshot}
          </div>

          <div
            className="signature-cert"
            style={{
              marginTop: 28,
              paddingTop: 18,
              borderTop: '2px solid #111827',
            }}
          >
            <h3 style={{ margin: '0 0 12px' }}>電子簽署憑證</h3>
            <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              <div>簽署人：<strong>{signature?.signer_name || contract.customer_name}</strong></div>
              <div>
                驗證方式：手機 OTP＋手寫簽名 {signature?.otp_verified === false ? '-' : '✓ 已驗證'}
              </div>
              <div>
                手寫簽名：{signature?.handwritten_signature_at ? '✓ 已完成' : '-'}
              </div>
              <div>完整閱讀：{signature?.contract_read_confirmed_at ? '✓ 已確認' : '-'}</div>
              <div>資料正確：{signature?.data_confirmed_at ? '✓ 已確認' : '-'}</div>
              <div>個資告知：{signature?.privacy_agreed_at ? '✓ 已確認' : '-'}</div>
              <div>電子文件：{signature?.electronic_agreed_at ? '✓ 已確認' : '-'}</div>
              <div>電子簽章方式明確同意：{signature?.electronic_signature_consent_at ? '✓ 已確認' : '-'}</div>
              <div>非固定車位：{signature?.non_fixed_space_agreed_at ? '✓ 已確認' : '-'}</div>
            </div>

            {signature?.handwritten_signature_url && (
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  border: '1px solid #cbd5e1',
                  borderRadius: 10,
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: '#64748b',
                    fontWeight: 800,
                    marginBottom: 8,
                  }}
                >
                  承租人手寫簽名
                </div>
                <img
                  src={signature.handwritten_signature_url}
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
                {signature.handwritten_signature_hash && (
                  <div
                    style={{
                      marginTop: 7,
                      color: '#64748b',
                      fontSize: 10,
                      wordBreak: 'break-all',
                    }}
                  >
                    簽名 SHA-256：{signature.handwritten_signature_hash}
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                marginTop: 14,
                padding: 10,
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 11,
                wordBreak: 'break-all',
              }}
            >
              <strong>SHA-256 文件雜湊：</strong>
              <br />
              {contract.document_hash || signature?.document_hash || '-'}
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className={publicUi.portal} style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <h1 style={{ marginBottom: 6 }}>租用停車位電子合約書</h1>
      <p style={{ marginTop: 0, color: '#64748b' }}>
        請完整閱讀契約，完成本次手機驗證後再進行電子簽署。
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
          padding: 16,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <span style={{ color: '#64748b', fontSize: 13 }}>契約編號</span>
          <br />
          <strong>{contract.contract_no}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b', fontSize: 13 }}>契約版本</span>
          <br />
          <strong>{contract.contract_version || 'V2.0'}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b', fontSize: 13 }}>停車場</span>
          <br />
          <strong>{contract.parking_lot_name || '-'}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b', fontSize: 13 }}>承租人</span>
          <br />
          <strong>{contract.customer_name}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b', fontSize: 13 }}>車牌</span>
          <br />
          <strong>{contract.vehicle_plate}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b', fontSize: 13 }}>月租類型</span>
          <br />
          <strong>{contract.rental_type || '一般'}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b', fontSize: 13 }}>租期</span>
          <br />
          <strong>
            {contract.start_date} ～ {contract.end_date}
          </strong>
        </div>
        <div>
          <span style={{ color: '#64748b', fontSize: 13 }}>月租金額</span>
          <br />
          <strong>NT$ {money(contract.monthly_fee)}</strong>
        </div>
      </div>

      <div
        style={{
          padding: 10,
          borderRadius: 10,
          marginBottom: 10,
          background: contract.document_verified ? '#f0fdf4' : '#fff7ed',
          color: contract.document_verified ? '#166534' : '#9a3412',
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        {contract.document_verified
          ? '✓ 契約文件完整性驗證通過'
          : '契約文件完整性尚未驗證'}
      </div>

      <div
        ref={contractBoxRef}
        onScroll={checkReadPosition}
        style={{
          height: 470,
          overflowY: 'auto',
          border: '1px solid #cbd5e1',
          borderRadius: 12,
          padding: 20,
          background: '#fff',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.85,
          fontSize: 15,
        }}
      >
        {contract.contract_snapshot}
        <div style={{ height: 12 }} />
        <div
          style={{
            padding: 12,
            background: '#eff6ff',
            borderRadius: 8,
            fontWeight: 700,
          }}
        >
          契約內容已閱讀至最下方。
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          color: readComplete ? '#166534' : '#b45309',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {readComplete
          ? '✓ 已閱讀至契約最下方'
          : '請將上方契約內容捲動至最下方，才能完成簽署確認。'}
      </div>

      <div
        style={{
          marginTop: 20,
          padding: 16,
          background: '#f8fafc',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
      >
        <h2 style={{ marginTop: 0 }}>簽署手機驗證</h2>
        <p style={{ color: '#64748b' }}>
          電子簽署前需再次驗證申請時登記的手機。
          {maskedPhone ? ` 驗證手機：${maskedPhone}` : ''}
        </p>

        {!signOtpVerified && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <button
                type="button"
                onClick={requestSignOtp}
                disabled={sendingOtp}
              >
                {sendingOtp ? '發送中…' : '發送簽署驗證碼'}
              </button>
            </div>

            {signOtpChallengeId && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={signOtpCode}
                  onChange={(e) =>
                    setSignOtpCode(
                      e.target.value.replace(/\D/g, '').slice(0, 6)
                    )
                  }
                  placeholder="6 位數驗證碼"
                  inputMode="numeric"
                  maxLength={6}
                  style={{ padding: 10, minWidth: 200 }}
                />
                <button
                  type="button"
                  onClick={verifySignOtp}
                  disabled={verifyingOtp}
                >
                  {verifyingOtp ? '驗證中…' : '確認簽署驗證'}
                </button>
              </div>
            )}

            {debugCode && (
              <div style={{ fontSize: 13, color: '#9a3412' }}>
                開發測試驗證碼：<strong>{debugCode}</strong>
              </div>
            )}
          </div>
        )}

        {signOtpVerified && (
          <div style={{ color: '#166534', fontWeight: 700 }}>
            ✓ 本次電子簽署手機驗證完成
          </div>
        )}
      </div>

      <form
        onSubmit={submit}
        style={{ display: 'grid', gap: 12, marginTop: 20 }}
      >
        <label>
          簽署人姓名
          <input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            style={{ width: '100%', padding: 10, marginTop: 4 }}
          />
        </label>

        <div
          style={{
            padding: 16,
            border: '1px solid #dbeafe',
            borderRadius: 14,
            background: '#f8fbff',
          }}
        >
          <div
            style={{
              fontSize: 17,
              fontWeight: 900,
              color: '#0f172a',
              marginBottom: 5,
            }}
          >
            承租人手寫簽名
          </div>
          <div
            style={{
              color: '#64748b',
              fontSize: 13,
              lineHeight: 1.7,
              marginBottom: 12,
            }}
          >
            手機可直接用手指簽名；平板可使用觸控筆；電腦可使用滑鼠。簽約完成後簽名字跡將與本契約一併封存，不能再修改。
          </div>
          <HandwrittenSignaturePad
            disabled={saving}
            onChange={setHandwrittenSignature}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gap: 10,
            padding: 16,
            border: '1px solid #e2e8f0',
            borderRadius: 12,
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={dataConfirmed}
              disabled={!readComplete}
              onChange={(e) => setDataConfirmed(e.target.checked)}
            />{' '}
            本人確認所填姓名、車牌及其他申請資料均正確
          </label>

          <label>
            <input
              type="checkbox"
              checked={privacyAgreed}
              disabled={!readComplete}
              onChange={(e) => setPrivacyAgreed(e.target.checked)}
            />{' '}
            本人已閱讀並了解個人資料蒐集告知事項
          </label>

          <label>
            <input
              type="checkbox"
              checked={contractReadConfirmed}
              disabled={!readComplete}
              onChange={(e) => setContractReadConfirmed(e.target.checked)}
            />{' '}
            本人已完整閱讀上述租用停車位合約內容
          </label>

          <label>
            <input
              type="checkbox"
              checked={nonFixedSpaceAgreed}
              disabled={!readComplete}
              onChange={(e) => setNonFixedSpaceAgreed(e.target.checked)}
            />{' '}
            本人了解月租僅為月租使用資格，不代表固定停車位
          </label>

          <label>
            <input
              type="checkbox"
              checked={electronicAgreed}
              disabled={!readComplete}
              onChange={(e) => setElectronicAgreed(e.target.checked)}
            />{' '}
            本人同意以電子文件方式收受、保存及下載本契約
          </label>

          <label
            style={{
              padding: 12,
              border: electronicSignatureConsent
                ? '1px solid #86efac'
                : '1px solid #cbd5e1',
              borderRadius: 10,
              background: electronicSignatureConsent ? '#f0fdf4' : '#fff',
              lineHeight: 1.7,
            }}
          >
            <input
              type="checkbox"
              checked={electronicSignatureConsent}
              disabled={!readComplete}
              onChange={(e) =>
                setElectronicSignatureConsent(e.target.checked)
              }
            />{' '}
            <strong>電子簽章方式明確同意：</strong>本人同意本租用停車位契約以電子文件及電子簽章方式簽署，並同意以本次手機 OTP 驗證、本人手寫簽名及系統簽署紀錄作為本次電子簽署之證明。
          </label>

          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!readComplete}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            本人確認上述手寫簽名為本人親自簽署，並同意完成電子簽署
          </label>
        </div>

        <button
          disabled={
            saving ||
            !readComplete ||
            !handwrittenSignature.isValid ||
            !signOtpVerified ||
            !dataConfirmed ||
            !privacyAgreed ||
            !contractReadConfirmed ||
            !nonFixedSpaceAgreed ||
            !electronicAgreed ||
            !electronicSignatureConsent ||
            !confirmed
          }
          type="submit"
          className="btn"
          style={{ padding: 13, fontWeight: 700 }}
        >
          {saving ? '簽署中…' : '確認手寫簽名並完成電子簽署'}
        </button>

        {message && (
          <div
            style={{
              padding: 12,
              background: '#f8fafc',
              borderRadius: 8,
            }}
          >
            {message}
          </div>
        )}
      </form>
    </main>
  )
}
