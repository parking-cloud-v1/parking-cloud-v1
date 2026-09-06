'use client'

import {
  useEffect,
  useRef,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'

type Inspection = {
  id: string
  parking_lot_id: string
  event_type: string
  lot_type:
    | '立體'
    | '機械'
    | '平面'
    | null
  operator_name: string | null
  inspector_name: string
  inspection_date: string
  parking_lot_phone: string | null
  emergency_contact_1: string | null
  emergency_phone_1: string | null
  emergency_contact_2: string | null
  emergency_phone_2: string | null
  reviewer: string | null
  status: 'draft' | 'completed'
  created_at?: string
  parking_lots?: {
    name: string
  } | null
}

type Item = {
  id: string
  inspection_id: string
  item_code: string
  category: string
  item_name: string
  result:
    | 'yes'
    | 'no'
    | null
  item_note: string | null
  sort_order: number
}

type Photo = {
  id: string
  inspection_id: string
  storage_path: string
  file_name: string | null
  caption: string | null
  sort_order: number
  signedUrl?: string
}

type PreparedInspection = Inspection & {
  items: Item[]
  photos: Photo[]
}

const FIXED_TITLE =
  '新北市政府交通局颱風前（或豪、大雨）整備工作自主檢查表'

function rocDate(
  dateValue: string
) {
  if (!dateValue) {
    return ''
  }

  const [y, m, d] =
    dateValue
      .split('-')
      .map(Number)

  if (!y || !m || !d) {
    return dateValue
  }

  return `${y - 1911}年${String(m).padStart(2, '0')}月${String(d).padStart(2, '0')}日`
}

function normalizeParkingLot(
  value: unknown
): { name: string } | null {
  if (Array.isArray(value)) {
    const first = value[0] as
      | { name?: string }
      | undefined

    return first?.name
      ? { name: first.name }
      : null
  }

  if (
    value &&
    typeof value === 'object' &&
    'name' in value
  ) {
    return {
      name: String(
        (value as { name: unknown })
          .name || ''
      ),
    }
  }

  return null
}

async function waitForImages(
  container: HTMLElement
) {
  const images =
    Array.from(
      container.querySelectorAll<HTMLImageElement>(
        'img'
      )
    )

  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>(
          (resolve) => {
            if (
              image.complete &&
              image.naturalWidth > 0
            ) {
              resolve()
              return
            }

            const finish = () => {
              image.removeEventListener(
                'load',
                finish
              )
              image.removeEventListener(
                'error',
                finish
              )
              resolve()
            }

            image.addEventListener(
              'load',
              finish,
              { once: true }
            )
            image.addEventListener(
              'error',
              finish,
              { once: true }
            )
          }
        )
    )
  )
}

function InspectionPrintPages({
  report,
}: {
  report: PreparedInspection
}) {
  const grouped =
    new Map<string, Item[]>()

  report.items.forEach((item) => {
    const key =
      item.category || '其他'
    const current =
      grouped.get(key) || []

    current.push(item)
    grouped.set(key, current)
  })

  const photos = report.photos

  return (
    <div
      data-inspection-id={report.id}
      style={{
        marginBottom: 28,
      }}
    >
      <div
        className="disaster-batch-page"
        style={{
          width: '210mm',
          minHeight: '297mm',
          margin: '0 auto 20px',
          background: '#fff',
          padding: '10mm 8mm',
          boxSizing: 'border-box',
          color: '#000',
          fontFamily:
            '"Microsoft JhengHei","Noto Sans TC",sans-serif',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {FIXED_TITLE}
        </div>

        <div
          style={{
            fontSize: 17,
            marginBottom: 8,
          }}
        >
          停車場名稱：
          {report.parking_lots?.name || ''}
        </div>

        <div
          style={{
            fontSize: 17,
            marginBottom: 10,
          }}
        >
          停車場型式：
          {report.lot_type === '立體'
            ? '☑'
            : '□'}
          立體　　
          {report.lot_type === '機械'
            ? '☑'
            : '□'}
          機械　　
          {report.lot_type === '平面'
            ? '☑'
            : '□'}
          平面
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 14,
          }}
        >
          <thead>
            <tr>
              <th
                rowSpan={2}
                style={{
                  border: '1px solid #000',
                  padding: 6,
                  width: 70,
                }}
              >
                工作事項
              </th>
              <th
                rowSpan={2}
                style={{
                  border: '1px solid #000',
                  padding: 6,
                }}
              >
                檢查項目
              </th>
              <th
                colSpan={2}
                style={{
                  border: '1px solid #000',
                  padding: 6,
                  width: 100,
                }}
              >
                檢查結果
              </th>
              <th
                rowSpan={2}
                style={{
                  border: '1px solid #000',
                  padding: 6,
                  width: 100,
                }}
              >
                備註
              </th>
            </tr>
            <tr>
              <th
                style={{
                  border: '1px solid #000',
                  padding: 6,
                }}
              >
                是
              </th>
              <th
                style={{
                  border: '1px solid #000',
                  padding: 6,
                }}
              >
                否
              </th>
            </tr>
          </thead>

          <tbody>
            {Array.from(
              grouped.entries()
            ).flatMap(
              ([category, categoryItems]) =>
                categoryItems.map(
                  (item, index) => (
                    <tr key={item.id}>
                      {index === 0 && (
                        <td
                          rowSpan={
                            categoryItems.length
                          }
                          style={{
                            border:
                              '1px solid #000',
                            padding: 6,
                            textAlign:
                              'center',
                          }}
                        >
                          {category}
                        </td>
                      )}

                      <td
                        style={{
                          border:
                            '1px solid #000',
                          padding: 6,
                        }}
                      >
                        {item.item_name}
                      </td>

                      <td
                        style={{
                          border:
                            '1px solid #000',
                          textAlign:
                            'center',
                        }}
                      >
                        {item.result === 'yes'
                          ? 'V'
                          : ''}
                      </td>

                      <td
                        style={{
                          border:
                            '1px solid #000',
                          textAlign:
                            'center',
                        }}
                      >
                        {item.result === 'no'
                          ? 'V'
                          : ''}
                      </td>

                      <td
                        style={{
                          border:
                            '1px solid #000',
                          padding: 6,
                          textAlign:
                            'center',
                        }}
                      >
                        {item.item_note || ''}
                      </td>
                    </tr>
                  )
                )
            )}

            <tr>
              <td
                colSpan={5}
                style={{
                  border: '1px solid #000',
                  textAlign: 'center',
                  fontSize: 18,
                  padding: 14,
                }}
              >
                佐證照片
              </td>
            </tr>

            <tr>
              <td
                colSpan={5}
                style={{
                  border: '1px solid #000',
                  padding: 0,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '1fr 1fr',
                    height: 260,
                  }}
                >
                  {[0, 1].map(
                    (index) => (
                      <div
                        key={index}
                        style={{
                          borderRight:
                            index === 0
                              ? '1px solid #000'
                              : undefined,
                          padding: 10,
                          boxSizing:
                            'border-box',
                        }}
                      >
                        {photos[index]
                          ?.signedUrl ? (
                          <img
                            src={
                              photos[index]
                                .signedUrl
                            }
                            alt=""
                            crossOrigin="anonymous"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          />
                        ) : null}
                      </div>
                    )
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        className="disaster-batch-page"
        style={{
          width: '210mm',
          minHeight: '297mm',
          margin: '0 auto',
          background: '#fff',
          padding: '8mm',
          boxSizing: 'border-box',
          color: '#000',
          fontFamily:
            '"Microsoft JhengHei","Noto Sans TC",sans-serif',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              '1fr 1fr',
            gridTemplateRows:
              '1fr 1fr',
            height: 520,
            border: '1px solid #000',
          }}
        >
          {[2, 3, 4, 5].map(
            (index) => (
              <div
                key={index}
                style={{
                  borderRight:
                    index % 2 === 0
                      ? '1px solid #000'
                      : undefined,
                  borderBottom:
                    index < 4
                      ? '1px solid #000'
                      : undefined,
                  padding: 8,
                  boxSizing:
                    'border-box',
                }}
              >
                {photos[index]
                  ?.signedUrl ? (
                  <img
                    src={
                      photos[index]
                        .signedUrl
                    }
                    alt=""
                    crossOrigin="anonymous"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : null}
              </div>
            )
          )}
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: 0,
            fontSize: 14,
          }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '6px 10px',
                  width: '56%',
                  verticalAlign: 'top',
                  lineHeight: 1.9,
                }}
              >
                <div>
                  經營廠商：
                  {report.operator_name || ''}
                </div>
                <div>
                  檢查人員：
                  {report.inspector_name}
                </div>
              </td>

              <td
                style={{
                  border: '1px solid #000',
                  padding: '6px 10px',
                  width: '44%',
                  verticalAlign: 'middle',
                  lineHeight: 1.9,
                }}
              >
                檢查日期：
                {rocDate(
                  report.inspection_date
                )}
              </td>
            </tr>

            <tr>
              <td
                colSpan={2}
                style={{
                  border: '1px solid #000',
                  padding: 0,
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse:
                      'collapse',
                    tableLayout: 'fixed',
                    fontSize: 14,
                  }}
                >
                  <colgroup>
                    <col
                      style={{
                        width: 145,
                      }}
                    />
                    <col />
                  </colgroup>

                  <tbody>
                    <tr>
                      <td
                        style={{
                          border: 0,
                          padding: 0,
                          verticalAlign:
                            'top',
                          background:
                            '#fff59d',
                          color: '#ef4444',
                          fontWeight: 700,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        <div
                          style={{
                            height: 31,
                            display: 'flex',
                            alignItems:
                              'center',
                            padding:
                              '0 8px',
                            boxSizing:
                              'border-box',
                          }}
                        >
                          停車場電話：
                        </div>
                        <div
                          style={{
                            height: 31,
                            display: 'flex',
                            alignItems:
                              'center',
                            padding:
                              '0 8px',
                            boxSizing:
                              'border-box',
                          }}
                        >
                          緊急連絡人1：
                        </div>
                        <div
                          style={{
                            height: 31,
                            display: 'flex',
                            alignItems:
                              'center',
                            padding:
                              '0 8px',
                            boxSizing:
                              'border-box',
                          }}
                        >
                          緊急連絡人2：
                        </div>
                      </td>

                      <td
                        style={{
                          border: 0,
                          borderLeft:
                            '1px solid #000',
                          padding: 0,
                          verticalAlign:
                            'top',
                        }}
                      >
                        <div
                          style={{
                            height: 31,
                            display: 'flex',
                            alignItems:
                              'center',
                            padding:
                              '0 10px',
                            boxSizing:
                              'border-box',
                          }}
                        >
                          {report.parking_lot_phone ||
                            ''}
                        </div>
                        <div
                          style={{
                            height: 31,
                            display: 'flex',
                            alignItems:
                              'center',
                            padding:
                              '0 10px',
                            boxSizing:
                              'border-box',
                          }}
                        >
                          {report.emergency_contact_1 ||
                            ''}
                          {report.emergency_phone_1
                            ? `　電話：${report.emergency_phone_1}`
                            : ''}
                        </div>
                        <div
                          style={{
                            height: 31,
                            display: 'flex',
                            alignItems:
                              'center',
                            padding:
                              '0 10px',
                            boxSizing:
                              'border-box',
                          }}
                        >
                          {report.emergency_contact_2 ||
                            ''}
                          {report.emergency_phone_2
                            ? `　電話：${report.emergency_phone_2}`
                            : ''}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            <tr>
              <td
                colSpan={2}
                style={{
                  border: '1px solid #000',
                  padding: '6px 10px',
                  height: 42,
                  verticalAlign: 'middle',
                  lineHeight: 1.7,
                }}
              >
                交通局承辦人員覆核：
                {report.reviewer || ''}
              </td>
            </tr>
          </tbody>
        </table>

        <div
          style={{
            fontSize: 12,
            lineHeight: 1.7,
            marginTop: 8,
          }}
        >
          <div>備註：</div>
          <div>
            一、經營業者應確實檢查及測試場內各項設施設備，並填寫公司名稱與檢查人員，該表視為公文書，偽造者自負責任。
          </div>
          <div>
            二、請經營廠商將本表傳回本局各停車場承辦人員，或傳真至2970-1120（並註明承辦人員）。
          </div>
          <div>
            三、一座停車場填報一張自主檢查表，請勿多場合併填寫。
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DisasterInspectionBatchExporter({
  inspectionIds,
  inspectionDate,
  autoDownload = false,
}: {
  inspectionIds: string[]
  inspectionDate: string
  autoDownload?: boolean
}) {
  const supabase = createClient()
  const printRootRef =
    useRef<HTMLDivElement | null>(null)
  const autoStartedRef =
    useRef(false)

  const [reports, setReports] =
    useState<PreparedInspection[]>([])
  const [loading, setLoading] =
    useState(true)
  const [exporting, setExporting] =
    useState(false)
  const [message, setMessage] =
    useState('')

  useEffect(() => {
    loadReports()
  }, [
    inspectionDate,
    inspectionIds.join(','),
  ])

  useEffect(() => {
    if (
      !autoDownload ||
      loading ||
      reports.length === 0 ||
      autoStartedRef.current
    ) {
      return
    }

    autoStartedRef.current = true

    const timer = window.setTimeout(
      () => {
        exportAllPdf()
      },
      700
    )

    return () =>
      window.clearTimeout(timer)
  }, [
    autoDownload,
    loading,
    reports.length,
  ])

  async function loadReports() {
    setLoading(true)
    setMessage('')

    try {
      const {
        data: inspectionData,
        error: inspectionError,
      } = await supabase
        .from('disaster_inspections')
        .select(`
          id,
          parking_lot_id,
          event_type,
          lot_type,
          operator_name,
          inspector_name,
          inspection_date,
          parking_lot_phone,
          emergency_contact_1,
          emergency_phone_1,
          emergency_contact_2,
          emergency_phone_2,
          reviewer,
          status,
          created_at,
          parking_lots (
            name
          )
        `)
        .in('id', inspectionIds)

      if (inspectionError) {
        throw inspectionError
      }

      const {
        data: itemData,
        error: itemError,
      } = await supabase
        .from(
          'disaster_inspection_items'
        )
        .select(`
          id,
          inspection_id,
          item_code,
          category,
          item_name,
          result,
          item_note,
          sort_order
        `)
        .in(
          'inspection_id',
          inspectionIds
        )
        .order('sort_order')

      if (itemError) {
        throw itemError
      }

      const {
        data: photoData,
        error: photoError,
      } = await supabase
        .from(
          'disaster_inspection_photos'
        )
        .select(`
          id,
          inspection_id,
          storage_path,
          file_name,
          caption,
          sort_order
        `)
        .in(
          'inspection_id',
          inspectionIds
        )
        .order('sort_order')

      if (photoError) {
        throw photoError
      }

      const signedPhotos =
        await Promise.all(
          ((photoData || []) as Photo[]).map(
            async (photo) => {
              const {
                data: signedData,
              } = await supabase
                .storage
                .from(
                  'disaster-inspections'
                )
                .createSignedUrl(
                  photo.storage_path,
                  60 * 60
                )

              return {
                ...photo,
                signedUrl:
                  signedData?.signedUrl,
              }
            }
          )
        )

      const normalizedInspections =
        (inspectionData || []).map(
          (raw: any) => ({
            ...raw,
            parking_lots:
              normalizeParkingLot(
                raw.parking_lots
              ),
          })
        ) as Inspection[]

      normalizedInspections.sort(
        (a, b) =>
          (
            a.parking_lots?.name ||
            ''
          ).localeCompare(
            b.parking_lots?.name ||
              '',
            'zh-Hant'
          )
      )

      const prepared =
        normalizedInspections.map(
          (report) => ({
            ...report,
            items: (
              (itemData || []) as Item[]
            ).filter(
              (item) =>
                item.inspection_id ===
                report.id
            ),
            photos: signedPhotos.filter(
              (photo) =>
                photo.inspection_id ===
                report.id
            ),
          })
        )

      setReports(prepared)
    } catch (error: any) {
      console.error(error)
      setMessage(
        '批次資料讀取失敗：' +
          (error?.message ||
            '未知錯誤')
      )
    } finally {
      setLoading(false)
    }
  }

  async function exportAllPdf() {
    if (
      exporting ||
      !printRootRef.current ||
      reports.length === 0
    ) {
      return
    }

    setExporting(true)
    setMessage('正在產生當日合併 PDF，請稍候…')

    try {
      await waitForImages(
        printRootRef.current
      )

      const pages =
        Array.from(
          printRootRef.current.querySelectorAll<HTMLElement>(
            '.disaster-batch-page'
          )
        )

      if (!pages.length) {
        throw new Error(
          '找不到可輸出的防災檢查頁面'
        )
      }

      const [
        html2canvasModule,
        jspdfModule,
      ] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const html2canvas =
        html2canvasModule.default
      const { jsPDF } =
        jspdfModule

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      })

      for (
        let index = 0;
        index < pages.length;
        index++
      ) {
        setMessage(
          `正在產生 PDF：第 ${index + 1} / ${pages.length} 頁…`
        )

        const canvas =
          await html2canvas(
            pages[index],
            {
              scale: 1.7,
              useCORS: true,
              backgroundColor:
                '#ffffff',
              logging: false,
            }
          )

        const imgData =
          canvas.toDataURL(
            'image/jpeg',
            0.9
          )

        if (index > 0) {
          pdf.addPage(
            'a4',
            'portrait'
          )
        }

        pdf.addImage(
          imgData,
          'JPEG',
          0,
          0,
          210,
          297,
          undefined,
          'FAST'
        )
      }

      pdf.save(
        `防災自主檢查表_${inspectionDate}_共${reports.length}場.pdf`
      )

      setMessage(
        `下載完成：${inspectionDate} 共 ${reports.length} 份防災檢查，已合併為 1 個 PDF。`
      )
    } catch (error: any) {
      console.error(error)
      setMessage(
        '批次 PDF 產生失敗：' +
          (error?.message ||
            '未知錯誤')
      )
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div
        className="card"
        style={{ marginTop: 20 }}
      >
        正在準備 {inspectionDate} 的防災檢查資料與照片…
      </div>
    )
  }

  if (message && reports.length === 0) {
    return (
      <div
        className="card"
        style={{
          marginTop: 20,
          color: '#b91c1c',
        }}
      >
        {message}
      </div>
    )
  }

  return (
    <>
      <div
        className="card"
        style={{
          marginTop: 20,
          position: 'sticky',
          top: 10,
          zIndex: 20,
          border: '1px solid #bfdbfe',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 900,
                color: '#0f172a',
              }}
            >
              已準備 {reports.length} 份檢查表，共 {reports.length * 2} 頁
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                color: '#64748b',
              }}
            >
              下載後是一個合併 PDF，依停車場名稱排序。
            </div>
          </div>

          <button
            type="button"
            className="btn"
            onClick={exportAllPdf}
            disabled={exporting}
          >
            {exporting
              ? 'PDF 產生中…'
              : '下載當日全部 PDF'}
          </button>
        </div>

        {message && (
          <div
            style={{
              marginTop: 12,
              padding: '9px 11px',
              borderRadius: 8,
              background: '#f8fafc',
              color: '#334155',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {message}
          </div>
        )}
      </div>

      <div
        ref={printRootRef}
        style={{
          marginTop: 20,
          background: '#e5e7eb',
          padding: 20,
          overflowX: 'auto',
        }}
      >
        {reports.map((report) => (
          <InspectionPrintPages
            key={report.id}
            report={report}
          />
        ))}
      </div>
    </>
  )
}
