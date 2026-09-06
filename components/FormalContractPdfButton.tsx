'use client'

import { useState } from 'react'
import { buildSignedContractPdfBlob } from '@/lib/online-contracts/signedPdfClient'

type Props = {
  contractId: string
  pdfReady?: boolean
  compact?: boolean
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('簽名讀取失敗'))
    reader.readAsDataURL(blob)
  })
}

export default function FormalContractPdfButton({
  contractId,
  pdfReady = false,
  compact = false,
}: Props) {
  const [ready, setReady] = useState(pdfReady)
  const [loading, setLoading] = useState(false)

  function downloadStoredPdf() {
    const a = document.createElement('a')
    a.href = `/api/admin/online-contracts/archive/${encodeURIComponent(contractId)}`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function generateAndDownload() {
    if (loading) return

    if (ready) {
      downloadStoredPdf()
      return
    }

    setLoading(true)

    try {
      const sourceResponse = await fetch(
        `/api/admin/online-contracts/archive-source/${encodeURIComponent(contractId)}`,
        { cache: 'no-store' }
      )
      const source = await sourceResponse.json()

      if (!sourceResponse.ok) {
        throw new Error(source?.error || '正式 PDF 資料讀取失敗。')
      }

      if (source.pdf_ready) {
        setReady(true)
        downloadStoredPdf()
        return
      }

      let signatureDataUrl = ''
      if (source.has_handwritten_signature) {
        const signatureResponse = await fetch(
          `/api/admin/online-contracts/signature/${encodeURIComponent(contractId)}`,
          { cache: 'no-store' }
        )
        if (signatureResponse.ok) {
          signatureDataUrl = await blobToDataUrl(await signatureResponse.blob())
        }
      }

      const pdfBlob = await buildSignedContractPdfBlob({
        ...source.input,
        handwrittenSignatureDataUrl: signatureDataUrl || null,
      })

      const form = new FormData()
      form.append(
        'file',
        new File(
          [pdfBlob],
          `${source.input.contractNo || 'contract'}_正式留存.pdf`,
          { type: 'application/pdf' }
        )
      )

      const saveResponse = await fetch(
        `/api/admin/online-contracts/archive/${encodeURIComponent(contractId)}`,
        {
          method: 'POST',
          body: form,
        }
      )
      const saved = await saveResponse.json()

      if (!saveResponse.ok) {
        throw new Error(saved?.error || '正式 PDF 建立失敗。')
      }

      setReady(true)
      downloadStoredPdf()
    } catch (error: any) {
      window.alert(error?.message || '正式 PDF 建立失敗，請稍後再試。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={generateAndDownload}
      disabled={loading}
      style={{
        padding: compact ? 0 : '8px 12px',
        border: compact ? 0 : '1px solid #cbd5e1',
        borderRadius: compact ? 0 : 8,
        background: compact ? 'transparent' : '#fff',
        color: '#1d4ed8',
        font: 'inherit',
        fontWeight: 700,
        cursor: loading ? 'wait' : 'pointer',
        textAlign: 'left',
      }}
    >
      {loading
        ? '正在建立正式 PDF…'
        : '下載正式留存檔（PDF）'}
    </button>
  )
}
