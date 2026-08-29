'use client'

import {
  ChangeEvent,
  useEffect,
  useMemo,
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
  parking_lots?: {
    name: string
  } | null
}

type Item = {
  id: string
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
  storage_path: string
  file_name: string | null
  caption: string | null
  sort_order: number
  signedUrl?: string
}

const FIXED_TITLE =
  '新北市政府交通局颱風前（或豪、大雨）整備工作自主檢查表'

function rocDate(
  dateValue: string
) {
  if (
    !dateValue
  ) {
    return ''
  }

  const [
    y,
    m,
    d,
  ] =
    dateValue
      .split('-')
      .map(
        Number
      )

  if (
    !y ||
    !m ||
    !d
  ) {
    return dateValue
  }

  return `${y - 1911}年${String(m).padStart(2, '0')}月${String(d).padStart(2, '0')}日`
}

export default function DisasterInspectionEditor({
  inspectionId,
}: {
  inspectionId: string
}) {
  const supabase =
    createClient()

  const [
    inspection,
    setInspection,
  ] =
    useState<
      Inspection | null
    >(null)

  const [
    items,
    setItems,
  ] =
    useState<
      Item[]
    >([])

  const [
    photos,
    setPhotos,
  ] =
    useState<
      Photo[]
    >([])

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    saving,
    setSaving,
  ] =
    useState(false)

  const [
    uploading,
    setUploading,
  ] =
    useState(false)

  const [
    message,
    setMessage,
  ] =
    useState('')

  const [
    preview,
    setPreview,
  ] =
    useState(false)

  const [
    exportingPdf,
    setExportingPdf,
  ] =
    useState(false)

  useEffect(() => {
    loadAll()
  }, [
    inspectionId,
  ])

  async function loadAll() {
    setLoading(
      true
    )

    setMessage('')

    try {
      const {
        data:
          inspectionData,
        error:
          inspectionError,
      } =
        await supabase
          .from(
            'disaster_inspections'
          )
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
            parking_lots (
              name
            )
          `)
          .eq(
            'id',
            inspectionId
          )
          .single()

      if (
        inspectionError
      ) {
        setMessage(
          '檢查表讀取失敗：' +
            inspectionError.message
        )

        return
      }

      const {
        data:
          itemData,
        error:
          itemError,
      } =
        await supabase
          .from(
            'disaster_inspection_items'
          )
          .select(`
            id,
            item_code,
            category,
            item_name,
            result,
            item_note,
            sort_order
          `)
          .eq(
            'inspection_id',
            inspectionId
          )
          .order(
            'sort_order'
          )

      if (
        itemError
      ) {
        setMessage(
          '檢查項目讀取失敗：' +
            itemError.message
        )

        return
      }

      const {
        data:
          photoData,
        error:
          photoError,
      } =
        await supabase
          .from(
            'disaster_inspection_photos'
          )
          .select(`
            id,
            storage_path,
            file_name,
            caption,
            sort_order
          `)
          .eq(
            'inspection_id',
            inspectionId
          )
          .order(
            'sort_order'
          )

      if (
        photoError
      ) {
        setMessage(
          '照片資料讀取失敗：' +
            photoError.message
        )

        return
      }

      const photoRows =
        (
          photoData ||
          []
        ) as Photo[]

      const withUrls:
        Photo[] =
        []

      for (
        const photo of
        photoRows
      ) {
        const {
          data:
            signedData,
        } =
          await supabase
            .storage
            .from(
              'disaster-inspections'
            )
            .createSignedUrl(
              photo.storage_path,
              60 * 60
            )

        withUrls.push({
          ...photo,
          signedUrl:
            signedData?.signedUrl,
        })
      }

      setInspection(
        inspectionData as Inspection
      )

      setItems(
        (
          itemData ||
          []
        ) as Item[]
      )

      setPhotos(
        withUrls
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '讀取失敗'
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  function updateInspection(
    key:
      keyof Inspection,
    value: any
  ) {
    setInspection(
      (
        current
      ) =>
        current
          ? {
              ...current,
              [key]:
                value,
            }
          : current
    )
  }

  function updateItem(
    id: string,
    patch:
      Partial<Item>
  ) {
    setItems(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            id
              ? {
                  ...item,
                  ...patch,
                }
              : item
        )
    )
  }

  async function saveAll(
    completed = false
  ) {
    if (
      !inspection ||
      saving
    ) {
      return
    }

    setSaving(
      true
    )

    setMessage('')

    try {
      const {
        error:
          inspectionError,
      } =
        await supabase
          .from(
            'disaster_inspections'
          )
          .update({
            lot_type:
              inspection.lot_type,

            operator_name:
              inspection.operator_name,

            inspector_name:
              inspection.inspector_name,

            inspection_date:
              inspection.inspection_date,

            parking_lot_phone:
              inspection.parking_lot_phone,

            emergency_contact_1:
              inspection.emergency_contact_1,

            emergency_phone_1:
              inspection.emergency_phone_1,

            emergency_contact_2:
              inspection.emergency_contact_2,

            emergency_phone_2:
              inspection.emergency_phone_2,

            reviewer:
              inspection.reviewer,

            status:
              completed
                ? 'completed'
                : inspection.status,

            completed_at:
              completed
                ? new Date()
                    .toISOString()
                : null,
          })
          .eq(
            'id',
            inspectionId
          )

      if (
        inspectionError
      ) {
        setMessage(
          '主表儲存失敗：' +
            inspectionError.message
        )

        return
      }

      for (
        const item of
        items
      ) {
        const {
          error:
            itemError,
        } =
          await supabase
            .from(
              'disaster_inspection_items'
            )
            .update({
              result:
                item.result,

              item_note:
                item.item_note,
            })
            .eq(
              'id',
              item.id
            )

        if (
          itemError
        ) {
          setMessage(
            '檢查項目儲存失敗：' +
              itemError.message
          )

          return
        }
      }

      setInspection({
        ...inspection,
        status:
          completed
            ? 'completed'
            : inspection.status,
      })

      setMessage(
        completed
          ? '檢查表已完成'
          : '儲存完成'
      )
    } finally {
      setSaving(
        false
      )
    }
  }

  async function uploadPhotos(
    event:
      ChangeEvent<HTMLInputElement>
  ) {
    const files =
      Array.from(
        event.target.files ||
          []
      )

    event.target.value =
      ''

    if (
      !files.length
    ) {
      return
    }

    const remaining =
      6 -
      photos.length

    if (
      remaining <=
      0
    ) {
      alert(
        '最多只能上傳 6 張佐證照片'
      )
      return
    }

    const chosen =
      files.slice(
        0,
        remaining
      )

    setUploading(
      true
    )

    try {
      const {
        data: {
          user,
        },
      } =
        await supabase
          .auth
          .getUser()

      if (
        !user
      ) {
        alert(
          '登入狀態失效'
        )
        return
      }

      for (
        let index =
          0;
        index <
        chosen.length;
        index++
      ) {
        const file =
          chosen[
            index
          ]

        const ext =
          file.name
            .split('.')
            .pop() ||
          'jpg'

        const path =
          `${inspectionId}/${Date.now()}_${index}.${ext}`

        const {
          error:
            uploadError,
        } =
          await supabase
            .storage
            .from(
              'disaster-inspections'
            )
            .upload(
              path,
              file,
              {
                upsert:
                  false,
              }
            )

        if (
          uploadError
        ) {
          alert(
            '照片上傳失敗：' +
              uploadError.message
          )
          return
        }

        const {
          error:
            rowError,
        } =
          await supabase
            .from(
              'disaster_inspection_photos'
            )
            .insert({
              inspection_id:
                inspectionId,

              storage_path:
                path,

              file_name:
                file.name,

              sort_order:
                photos.length +
                index +
                1,

              uploaded_by:
                user.id,
            })

        if (
          rowError
        ) {
          alert(
            '照片紀錄建立失敗：' +
              rowError.message
          )
          return
        }
      }

      await loadAll()
    } finally {
      setUploading(
        false
      )
    }
  }

  async function deletePhoto(
    photo: Photo
  ) {
    if (
      !window.confirm(
        '確定刪除這張佐證照片？'
      )
    ) {
      return
    }

    const {
      error:
        storageError,
    } =
      await supabase
        .storage
        .from(
          'disaster-inspections'
        )
        .remove([
          photo.storage_path,
        ])

    if (
      storageError
    ) {
      alert(
        storageError.message
      )
      return
    }

    const {
      error:
        rowError,
    } =
      await supabase
        .from(
          'disaster_inspection_photos'
        )
        .delete()
        .eq(
          'id',
          photo.id
        )

    if (
      rowError
    ) {
      alert(
        rowError.message
      )
      return
    }

    await loadAll()
  }

  const grouped =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            Item[]
          >()

        for (
          const item of
          items
        ) {
          const list =
            map.get(
              item.category
            ) ||
            []

          list.push(
            item
          )

          map.set(
            item.category,
            list
          )
        }

        return map
      },
      [
        items,
      ]
    )

  if (
    loading
  ) {
    return (
      <div>
        讀取中…
      </div>
    )
  }

  if (
    !inspection
  ) {
    return (
      <div>
        {message ||
          '找不到檢查表'}
      </div>
    )
  }

  async function exportPdf() {
    if (exportingPdf) return

    const pages =
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '.disaster-preview-page'
        )
      )

    if (!pages.length) {
      alert('請先開啟表單預覽')
      return
    }

    setExportingPdf(true)

    try {
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

      const pdf =
        new jsPDF({
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
        const canvas =
          await html2canvas(
            pages[index],
            {
              scale: 2,
              useCORS: true,
              backgroundColor: '#ffffff',
              logging: false,
            }
          )

        const imgData =
          canvas.toDataURL(
            'image/jpeg',
            0.95
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

      const lotName =
        (
          inspection?.parking_lots?.name ||
          '防災自主檢查表'
        ).replace(
          /[\\/:*?"<>|]/g,
          '_'
        )

      const dateText =
        inspection?.inspection_date ||
        '未填日期'

      pdf.save(
        `${lotName}_${dateText}_防災自主檢查表.pdf`
      )
    } catch (error: any) {
      console.error(error)
      alert(
        'PDF 匯出失敗：' +
          (error?.message || '未知錯誤')
      )
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <>
      <div
        className="no-print"
        style={{
          paddingBottom:
            40,
        }}
      >
        <div
          style={{
            display:
              'flex',
            justifyContent:
              'space-between',
            alignItems:
              'flex-start',
            gap: 12,
            flexWrap:
              'wrap',
          }}
        >
          <div>
            <h1
              style={{
                marginTop:
                  0,
                marginBottom:
                  6,
              }}
            >
              防災自主檢查表
            </h1>

            <div
              className="muted"
            >
              {
                FIXED_TITLE
              }
            </div>
          </div>

          <div
            style={{
              display:
                'flex',
              gap: 8,
              flexWrap:
                'wrap',
            }}
          >
            <button
              type="button"
              onClick={() =>
                saveAll(
                  false
                )
              }
              disabled={
                saving
              }
            >
              儲存
            </button>

            <button
              type="button"
              className="btn"
              onClick={() =>
                setPreview(
                  !preview
                )
              }
            >
              {preview
                ? '關閉預覽'
                : '預覽表單'}
            </button>

            <button
              type="button"
              className="btn"
              onClick={exportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf
                ? 'PDF 產生中…'
                : '匯出 PDF'}
            </button>

            <button
              type="button"
              onClick={() =>
                saveAll(
                  true
                )
              }
              disabled={
                saving
              }
            >
              完成檢查
            </button>
          </div>
        </div>

        {message && (
          <div
            style={{
              marginTop:
                14,
              padding:
                12,
              borderRadius:
                8,
              background:
                '#f8fafc',
            }}
          >
            {
              message
            }
          </div>
        )}

        <div
          className="card"
          style={{
            marginTop:
              20,
          }}
        >
          <h2>
            基本資料
          </h2>

          <div
            style={{
              display:
                'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 14,
            }}
          >
            <div
              className="field"
            >
              <label>
                停車場名稱
              </label>

              <input
                value={
                  inspection.parking_lots
                    ?.name ||
                  ''
                }
                disabled
              />
            </div>

            <div
              className="field"
            >
              <label>
                停車場型式
              </label>

              <select
                value={
                  inspection.lot_type ||
                  ''
                }
                onChange={(
                  e
                ) =>
                  updateInspection(
                    'lot_type',
                    e.target
                      .value ||
                      null
                  )
                }
              >
                <option value="">
                  請選擇
                </option>

                <option value="立體">
                  立體
                </option>

                <option value="機械">
                  機械
                </option>

                <option value="平面">
                  平面
                </option>
              </select>
            </div>

            <div
              className="field"
            >
              <label>
                經營廠商
              </label>

              <input
                value={
                  inspection.operator_name ||
                  ''
                }
                onChange={(
                  e
                ) =>
                  updateInspection(
                    'operator_name',
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
              <label>
                檢查人員
              </label>

              <input
                value={
                  inspection.inspector_name
                }
                onChange={(
                  e
                ) =>
                  updateInspection(
                    'inspector_name',
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
              <label>
                檢查日期
              </label>

              <input
                type="date"
                value={
                  inspection.inspection_date
                }
                onChange={(
                  e
                ) =>
                  updateInspection(
                    'inspection_date',
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
              <label>
                停車場電話
              </label>

              <input
                value={
                  inspection.parking_lot_phone ||
                  ''
                }
                onChange={(
                  e
                ) =>
                  updateInspection(
                    'parking_lot_phone',
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
              <label>
                緊急連絡人1
              </label>

              <input
                value={
                  inspection.emergency_contact_1 ||
                  ''
                }
                onChange={(
                  e
                ) =>
                  updateInspection(
                    'emergency_contact_1',
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
              <label>
                緊急連絡人1電話
              </label>

              <input
                value={
                  inspection.emergency_phone_1 ||
                  ''
                }
                onChange={(
                  e
                ) =>
                  updateInspection(
                    'emergency_phone_1',
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
              <label>
                緊急連絡人2
              </label>

              <input
                value={
                  inspection.emergency_contact_2 ||
                  ''
                }
                onChange={(
                  e
                ) =>
                  updateInspection(
                    'emergency_contact_2',
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
              <label>
                緊急連絡人2電話
              </label>

              <input
                value={
                  inspection.emergency_phone_2 ||
                  ''
                }
                onChange={(
                  e
                ) =>
                  updateInspection(
                    'emergency_phone_2',
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
              <label>
                交通局承辦人員覆核
              </label>

              <input
                value={
                  inspection.reviewer ||
                  ''
                }
                onChange={(
                  e
                ) =>
                  updateInspection(
                    'reviewer',
                    e.target
                      .value
                  )
                }
              />
            </div>
          </div>
        </div>

        <div
          className="card"
          style={{
            marginTop:
              20,
          }}
        >
          <h2>
            自主檢查項目
          </h2>

          <div
            style={{
              overflowX:
                'auto',
            }}
          >
            <table
              style={{
                width:
                  '100%',
                minWidth:
                  900,
                borderCollapse:
                  'collapse',
              }}
            >
              <thead>
                <tr>
                  <th>
                    工作事項
                  </th>

                  <th>
                    檢查項目
                  </th>

                  <th>
                    是
                  </th>

                  <th>
                    否
                  </th>

                  <th>
                    備註
                  </th>
                </tr>
              </thead>

              <tbody>
                {items.map(
                  (
                    item
                  ) => (
                    <tr
                      key={
                        item.id
                      }
                      style={{
                        borderTop:
                          '1px solid #e5e7eb',
                      }}
                    >
                      <td
                        style={{
                          padding:
                            10,
                        }}
                      >
                        {
                          item.category
                        }
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                        }}
                      >
                        {
                          item.item_name
                        }
                      </td>

                      <td
                        style={{
                          textAlign:
                            'center',
                        }}
                      >
                        <input
                          type="radio"
                          name={
                            `${item.id}-result`
                          }
                          checked={
                            item.result ===
                            'yes'
                          }
                          onChange={() =>
                            updateItem(
                              item.id,
                              {
                                result:
                                  'yes',
                              }
                            )
                          }
                        />
                      </td>

                      <td
                        style={{
                          textAlign:
                            'center',
                        }}
                      >
                        <input
                          type="radio"
                          name={
                            `${item.id}-result`
                          }
                          checked={
                            item.result ===
                            'no'
                          }
                          onChange={() =>
                            updateItem(
                              item.id,
                              {
                                result:
                                  'no',
                              }
                            )
                          }
                        />
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                        }}
                      >
                        <input
                          value={
                            item.item_note ||
                            ''
                          }
                          onChange={(
                            e
                          ) =>
                            updateItem(
                              item.id,
                              {
                                item_note:
                                  e.target
                                    .value,
                              }
                            )
                          }
                        />
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="card"
          style={{
            marginTop:
              20,
          }}
        >
          <div
            style={{
              display:
                'flex',
              justifyContent:
                'space-between',
              alignItems:
                'center',
              gap: 12,
              flexWrap:
                'wrap',
            }}
          >
            <div>
              <h2
                style={{
                  marginTop:
                    0,
                  marginBottom:
                    6,
                }}
              >
                佐證照片
              </h2>

              <div
                className="muted"
              >
                最多 6 張。輸出固定第 1 頁 2 張、第 2 頁 4 張。
              </div>
            </div>

            <label
              className="btn"
              style={{
                cursor:
                  'pointer',
              }}
            >
              {uploading
                ? '上傳中…'
                : '＋ 上傳照片'}

              <input
                type="file"
                accept="image/*"
                multiple
                onChange={
                  uploadPhotos
                }
                disabled={
                  uploading ||
                  photos.length >=
                    6
                }
                style={{
                  display:
                    'none',
                }}
              />
            </label>
          </div>

          <div
            style={{
              display:
                'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginTop:
                16,
            }}
          >
            {photos.map(
              (
                photo,
                index
              ) => (
                <div
                  key={
                    photo.id
                  }
                  style={{
                    border:
                      '1px solid #cbd5e1',
                    borderRadius:
                      8,
                    padding:
                      8,
                  }}
                >
                  {photo.signedUrl && (
                    <img
                      src={
                        photo.signedUrl
                      }
                      alt={
                        photo.file_name ||
                        `佐證照片${index + 1}`
                      }
                      style={{
                        width:
                          '100%',
                        height:
                          180,
                        objectFit:
                          'cover',
                      }}
                    />
                  )}

                  <div
                    style={{
                      fontSize:
                        13,
                      marginTop:
                        6,
                    }}
                  >
                    照片{' '}
                    {index +
                      1}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      deletePhoto(
                        photo
                      )
                    }
                    style={{
                      marginTop:
                        6,
                    }}
                  >
                    刪除
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      <div
        id="disaster-print"
        style={{
          display:
            preview
              ? 'block'
              : 'none',
          background:
            '#e5e7eb',
          padding:
            preview
              ? 20
              : 0,
        }}
      >
        <div
          className="print-page disaster-preview-page"
          style={{
            width:
              '210mm',
            minHeight:
              '297mm',
            margin:
              '0 auto 20px',
            background:
              '#fff',
            padding:
              '10mm 8mm',
            boxSizing:
              'border-box',
            color:
              '#000',
            fontFamily:
              '"Microsoft JhengHei","Noto Sans TC",sans-serif',
          }}
        >
          <div
            style={{
              textAlign:
                'center',
              fontSize:
                20,
              fontWeight:
                700,
              marginBottom:
                12,
            }}
          >
            {
              FIXED_TITLE
            }
          </div>

          <div
            style={{
              fontSize:
                17,
              marginBottom:
                8,
            }}
          >
            停車場名稱：
            {
              inspection.parking_lots
                ?.name
            }
          </div>

          <div
            style={{
              fontSize:
                17,
              marginBottom:
                10,
            }}
          >
            停車場型式：
            {inspection.lot_type ===
            '立體'
              ? '☑'
              : '□'}
            立體　　
            {inspection.lot_type ===
            '機械'
              ? '☑'
              : '□'}
            機械　　
            {inspection.lot_type ===
            '平面'
              ? '☑'
              : '□'}
            平面
          </div>

          <table
            style={{
              width:
                '100%',
              borderCollapse:
                'collapse',
              fontSize:
                14,
            }}
          >
            <thead>
              <tr>
                <th
                  rowSpan={
                    2
                  }
                  style={{
                    border:
                      '1px solid #000',
                    padding:
                      6,
                    width:
                      70,
                  }}
                >
                  工作事項
                </th>

                <th
                  rowSpan={
                    2
                  }
                  style={{
                    border:
                      '1px solid #000',
                    padding:
                      6,
                  }}
                >
                  檢查項目
                </th>

                <th
                  colSpan={
                    2
                  }
                  style={{
                    border:
                      '1px solid #000',
                    padding:
                      6,
                    width:
                      100,
                  }}
                >
                  檢查結果
                </th>

                <th
                  rowSpan={
                    2
                  }
                  style={{
                    border:
                      '1px solid #000',
                    padding:
                      6,
                    width:
                      100,
                  }}
                >
                  備註
                </th>
              </tr>

              <tr>
                <th
                  style={{
                    border:
                      '1px solid #000',
                    padding:
                      6,
                  }}
                >
                  是
                </th>

                <th
                  style={{
                    border:
                      '1px solid #000',
                    padding:
                      6,
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
                (
                  [
                    category,
                    categoryItems,
                  ]
                ) =>
                  categoryItems.map(
                    (
                      item,
                      index
                    ) => (
                      <tr
                        key={
                          item.id
                        }
                      >
                        {index ===
                          0 && (
                          <td
                            rowSpan={
                              categoryItems.length
                            }
                            style={{
                              border:
                                '1px solid #000',
                              padding:
                                6,
                              textAlign:
                                'center',
                            }}
                          >
                            {
                              category
                            }
                          </td>
                        )}

                        <td
                          style={{
                            border:
                              '1px solid #000',
                            padding:
                              6,
                          }}
                        >
                          {
                            item.item_name
                          }
                        </td>

                        <td
                          style={{
                            border:
                              '1px solid #000',
                            textAlign:
                              'center',
                          }}
                        >
                          {item.result ===
                          'yes'
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
                          {item.result ===
                          'no'
                            ? 'V'
                            : ''}
                        </td>

                        <td
                          style={{
                            border:
                              '1px solid #000',
                            padding:
                              6,
                            textAlign:
                              'center',
                          }}
                        >
                          {
                            item.item_note
                          }
                        </td>
                      </tr>
                    )
                  )
              )}

              <tr>
                <td
                  colSpan={
                    5
                  }
                  style={{
                    border:
                      '1px solid #000',
                    textAlign:
                      'center',
                    fontSize:
                      18,
                    padding:
                      14,
                  }}
                >
                  佐證照片
                </td>
              </tr>

              <tr>
                <td
                  colSpan={
                    5
                  }
                  style={{
                    border:
                      '1px solid #000',
                    padding:
                      0,
                  }}
                >
                  <div
                    style={{
                      display:
                        'grid',
                      gridTemplateColumns:
                        '1fr 1fr',
                      height:
                        260,
                    }}
                  >
                    {[0, 1].map(
                      (
                        index
                      ) => (
                        <div
                          key={
                            index
                          }
                          style={{
                            borderRight:
                              index ===
                              0
                                ? '1px solid #000'
                                : undefined,
                            padding:
                              10,
                            boxSizing:
                              'border-box',
                          }}
                        >
                          {photos[
                            index
                          ]
                            ?.signedUrl ? (
                            <img
                              src={
                                photos[
                                  index
                                ]
                                  .signedUrl
                              }
                              alt=""
                              style={{
                                width:
                                  '100%',
                                height:
                                  '100%',
                                objectFit:
                                  'cover',
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
          className="print-page disaster-preview-page"
          style={{
            width:
              '210mm',
            minHeight:
              '297mm',
            margin:
              '0 auto',
            background:
              '#fff',
            padding:
              '8mm',
            boxSizing:
              'border-box',
            color:
              '#000',
            fontFamily:
              '"Microsoft JhengHei","Noto Sans TC",sans-serif',
          }}
        >
          <div
            style={{
              display:
                'grid',
              gridTemplateColumns:
                '1fr 1fr',
              gridTemplateRows:
                '1fr 1fr',
              height:
                520,
              border:
                '1px solid #000',
            }}
          >
            {[2, 3, 4, 5].map(
              (
                index
              ) => (
                <div
                  key={
                    index
                  }
                  style={{
                    borderRight:
                      index %
                        2 ===
                      0
                        ? '1px solid #000'
                        : undefined,
                    borderBottom:
                      index <
                      4
                        ? '1px solid #000'
                        : undefined,
                    padding:
                      8,
                    boxSizing:
                      'border-box',
                  }}
                >
                  {photos[
                    index
                  ]
                    ?.signedUrl ? (
                    <img
                      src={
                        photos[
                          index
                        ]
                          .signedUrl
                      }
                      alt=""
                      style={{
                        width:
                          '100%',
                        height:
                          '100%',
                        objectFit:
                          'cover',
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
                    {inspection.operator_name || ''}
                  </div>
                  <div>
                    檢查人員：
                    {inspection.inspector_name}
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
                    inspection.inspection_date
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
                      borderCollapse: 'collapse',
                      tableLayout: 'fixed',
                      fontSize: 14,
                    }}
                  >
                    <colgroup>
                      <col style={{ width: 145 }} />
                      <col />
                    </colgroup>

                    <tbody>
                      <tr>
                        <td
                          style={{
                            border: 0,
                            padding: 0,
                            verticalAlign: 'top',
                            background: '#fff59d',
                            color: '#ef4444',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <div style={{height:31,display:'flex',alignItems:'center',padding:'0 8px',boxSizing:'border-box'}}>停車場電話：</div>
                          <div style={{height:31,display:'flex',alignItems:'center',padding:'0 8px',boxSizing:'border-box'}}>緊急連絡人1：</div>
                          <div style={{height:31,display:'flex',alignItems:'center',padding:'0 8px',boxSizing:'border-box'}}>緊急連絡人2：</div>
                        </td>

                        <td
                          style={{
                            border: 0,
                            borderLeft: '1px solid #000',
                            padding: 0,
                            verticalAlign: 'top',
                          }}
                        >
                          <div style={{height:31,display:'flex',alignItems:'center',padding:'0 10px',boxSizing:'border-box'}}>
                            {inspection.parking_lot_phone || ''}
                          </div>
                          <div style={{height:31,display:'flex',alignItems:'center',padding:'0 10px',boxSizing:'border-box'}}>
                            {inspection.emergency_contact_1 || ''}
                            {inspection.emergency_phone_1
                              ? `　電話：${inspection.emergency_phone_1}`
                              : ''}
                          </div>
                          <div style={{height:31,display:'flex',alignItems:'center',padding:'0 10px',boxSizing:'border-box'}}>
                            {inspection.emergency_contact_2 || ''}
                            {inspection.emergency_phone_2
                              ? `　電話：${inspection.emergency_phone_2}`
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
                  {inspection.reviewer || ''}
                </td>
              </tr>
            </tbody>
          </table>

          <div
            style={{
              fontSize:
                12,
              lineHeight:
                1.7,
              marginTop:
                8,
            }}
          >
            <div>
              備註：
            </div>

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
    </>
  )
}
