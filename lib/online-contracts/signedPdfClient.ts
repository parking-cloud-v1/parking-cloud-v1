export type SignedContractPdfSignature = {
  signer_name?: string | null
  otp_verified?: boolean | null
  signed_at?: string | null
  verification_method?: string | null
  privacy_agreed_at?: string | null
  electronic_agreed_at?: string | null
  electronic_signature_consent_at?: string | null
  contract_read_confirmed_at?: string | null
  data_confirmed_at?: string | null
  non_fixed_space_agreed_at?: string | null
  handwritten_signature_hash?: string | null
  handwritten_signature_at?: string | null
}

export type SignedContractPdfInput = {
  contractNo: string
  customerCode?: string | null
  parkingLotName?: string | null
  contractVersion?: string | null
  customerName: string
  vehiclePlate: string
  contractSnapshot: string
  documentHash?: string | null
  archiveHash?: string | null
  signedAt?: string | null
  signature?: SignedContractPdfSignature | null
  handwrittenSignatureDataUrl?: string | null
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleString('zh-TW')
}

async function waitForImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    images.map(async (img) => {
      if (img.complete) return
      try {
        await img.decode()
      } catch {
        await new Promise<void>((resolve) => {
          img.onload = () => resolve()
          img.onerror = () => resolve()
        })
      }
    })
  )
}

function fitToSinglePage(root: HTMLElement, content: HTMLElement) {
  content.style.transform = 'none'
  content.style.transformOrigin = 'top left'
  content.style.width = '100%'

  let size = 12.3
  content.style.fontSize = `${size}px`
  content.style.lineHeight = '1.36'

  while (size > 7.4 && content.scrollHeight > root.clientHeight) {
    size -= 0.2
    content.style.fontSize = `${size}px`
  }

  if (content.scrollHeight > root.clientHeight) {
    const scale = Math.max(
      0.72,
      Math.min(1, root.clientHeight / content.scrollHeight)
    )
    content.style.transform = `scale(${scale})`
  }
}

export async function buildSignedContractPdfBlob(
  input: SignedContractPdfInput
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PDF 只能在瀏覽器端建立。')
  }

  const [html2canvasModule, jspdfModule] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const html2canvas = html2canvasModule.default
  const { jsPDF } = jspdfModule
  const signature = input.signature || {}

  const handwritten =
    input.handwrittenSignatureDataUrl &&
    /^data:image\/(png|jpe?g|webp);base64,/i.test(
      input.handwrittenSignatureDataUrl
    )
      ? `<img src="${input.handwrittenSignatureDataUrl}" alt="承租人手寫簽名" style="display:block;width:150px;height:44px;margin-top:4px;object-fit:contain;object-position:left center;background:#fff;" />`
      : ''

  const root = document.createElement('div')
  root.style.position = 'fixed'
  root.style.left = '-12000px'
  root.style.top = '0'
  root.style.width = '794px'
  root.style.height = '1123px'
  root.style.boxSizing = 'border-box'
  root.style.padding = '30px 34px 28px'
  root.style.overflow = 'hidden'
  root.style.background = '#ffffff'
  root.style.color = '#111827'
  root.style.fontFamily =
    '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif'

  const content = document.createElement('div')
  content.style.width = '100%'
  content.style.whiteSpace = 'pre-wrap'
  content.style.wordBreak = 'break-word'
  content.innerHTML = `${escapeHtml(input.contractSnapshot || '')}
    <div style="margin-top:8px;padding-top:6px;border-top:1px solid #111827;break-inside:avoid;">
      <div style="font-weight:700;">電子簽署：${escapeHtml(
        signature.signer_name || input.customerName
      )}　簽署時間：${escapeHtml(
        formatDateTime(signature.signed_at || input.signedAt)
      )}</div>
      ${handwritten}
    </div>`

  root.appendChild(content)
  document.body.appendChild(root)

  try {
    if ('fonts' in document) {
      try {
        await document.fonts.ready
      } catch {
        // 字型等待失敗時仍繼續。
      }
    }

    await waitForImages(root)
    fitToSinglePage(root, content)

    const canvas = await html2canvas(root, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      width: 794,
      height: 1123,
      windowWidth: 900,
    })

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    })

    pdf.setProperties({
      title: `${input.contractNo} 正式簽約留存`,
      subject: '智驛科技有限公司 月租停車電子契約',
      author: '智驛科技有限公司',
      creator: '智驛停車營運雲端平台',
    })

    const image = canvas.toDataURL('image/jpeg', 0.96)
    pdf.addImage(image, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')

    return pdf.output('blob')
  } finally {
    if (document.body.contains(root)) {
      document.body.removeChild(root)
    }
  }
}
