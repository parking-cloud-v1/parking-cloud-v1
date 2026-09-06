'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type Props = {
  contractSnapshot: string
  signerName?: string | null
  signedAt?: string | null
  signatureUrl?: string | null
  autoPrint?: boolean
}

function formatDateTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleString('zh-TW')
}

export default function OnePageContractSheet({
  contractSnapshot,
  signerName,
  signedAt,
  signatureUrl,
  autoPrint = false,
}: Props) {
  const areaRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)

  function fitToOnePage() {
    const area = areaRef.current
    const content = contentRef.current
    if (!area || !content) return

    content.style.transform = 'none'
    content.style.transformOrigin = 'top left'
    content.style.width = '100%'

    let size = 12.2
    content.style.fontSize = `${size}px`
    content.style.lineHeight = '1.36'

    while (size > 7.4 && content.scrollHeight > area.clientHeight) {
      size -= 0.2
      content.style.fontSize = `${size}px`
    }

    if (content.scrollHeight > area.clientHeight) {
      const scale = Math.max(
        0.72,
        Math.min(1, area.clientHeight / content.scrollHeight)
      )
      content.style.transform = `scale(${scale})`
    }

    setReady(true)
  }

  useLayoutEffect(() => {
    fitToOnePage()
    // contractSnapshot 改變時重新計算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractSnapshot, signerName, signedAt, signatureUrl])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function prepare() {
      try {
        if ('fonts' in document) {
          await document.fonts.ready
        }
      } catch {
        // 字型等待失敗時仍繼續。
      }

      const images = Array.from(
        areaRef.current?.querySelectorAll('img') || []
      )
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

      if (cancelled) return
      fitToOnePage()

      if (autoPrint) {
        timer = setTimeout(() => {
          if (!cancelled) window.print()
        }, 250)
      }
    }

    void prepare()

    const onResize = () => fitToOnePage()
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint])

  return (
    <>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        html, body {
          margin: 0;
          padding: 0;
          background: #eef2f7;
        }
        @media print {
          html, body {
            width: 210mm;
            height: 297mm;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            overflow: hidden !important;
          }
          .contract-print-toolbar {
            display: none !important;
          }
          .one-page-contract-sheet {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: 0 !important;
          }
        }
      `}</style>

      <section
        className="one-page-contract-sheet"
        style={{
          width: '210mm',
          height: '297mm',
          margin: '18px auto',
          padding: '8mm 9mm 7mm',
          boxSizing: 'border-box',
          overflow: 'hidden',
          background: '#fff',
          color: '#111827',
          boxShadow: '0 10px 30px rgba(15,23,42,.15)',
          fontFamily:
            '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif',
        }}
      >
        <div
          ref={areaRef}
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <div
            ref={contentRef}
            style={{
              width: '100%',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#111827',
              opacity: ready ? 1 : 0,
            }}
          >
            {contractSnapshot || '沒有契約內容'}

            {(signerName || signedAt || signatureUrl) && (
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 6,
                  borderTop: '1px solid #111827',
                  breakInside: 'avoid',
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  電子簽署：{signerName || '-'}
                  {signedAt ? `　簽署時間：${formatDateTime(signedAt)}` : ''}
                </div>
                {signatureUrl && (
                  <img
                    src={signatureUrl}
                    alt="承租人手寫簽名"
                    onLoad={fitToOnePage}
                    style={{
                      display: 'block',
                      width: 150,
                      height: 44,
                      marginTop: 4,
                      objectFit: 'contain',
                      objectPosition: 'left center',
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
