'use client'

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'

type ParkingLot = {
  id: string
  name: string
}

type ResultValue =
  | 'yes'
  | 'no'
  | ''

type ItemForm = {
  item_code: string
  category:
    | '文件類'
    | '設備類'
    | '環境類'
  item_name: string
  result: ResultValue
  item_note: string
  sort_order: number
}

const DEFAULT_ITEMS: ItemForm[] = [
  {
    item_code:
      'document_monthly_list',
    category:
      '文件類',
    item_name:
      '月票車主名冊是否備妥',
    result: '',
    item_note:
      '無則免',
    sort_order: 1,
  },
  {
    item_code:
      'document_emergency_phone',
    category:
      '文件類',
    item_name:
      '緊急通報電話是否備妥',
    result: '',
    item_note:
      '必填',
    sort_order: 2,
  },
  {
    item_code:
      'equipment_flood_gate',
    category:
      '設備類',
    item_name:
      '防水閘門測試功能良好',
    result: '',
    item_note:
      '無則免',
    sort_order: 3,
  },
  {
    item_code:
      'equipment_pump',
    category:
      '設備類',
    item_name:
      '抽水馬達測試功能良好',
    result: '',
    item_note:
      '無則免',
    sort_order: 4,
  },
  {
    item_code:
      'equipment_mobile_pump',
    category:
      '設備類',
    item_name:
      '移動式抽水機測試功能良好',
    result: '',
    item_note:
      '無則免',
    sort_order: 5,
  },
  {
    item_code:
      'equipment_generator',
    category:
      '設備類',
    item_name:
      '緊急發電機測試功能良好',
    result: '',
    item_note:
      '必填',
    sort_order: 6,
  },
  {
    item_code:
      'equipment_sandbags',
    category:
      '設備類',
    item_name:
      '沙包是否備妥',
    result: '',
    item_note:
      '必填',
    sort_order: 7,
  },
  {
    item_code:
      'environment_drain',
    category:
      '環境類',
    item_name:
      '截（排）水溝是否清浚',
    result: '',
    item_note:
      '必填',
    sort_order: 8,
  },
  {
    item_code:
      'environment_tree',
    category:
      '環境類',
    item_name:
      '樹木是否修剪及加固',
    result: '',
    item_note:
      '無則免',
    sort_order: 9,
  },
]

function localDateText() {
  const now =
    new Date()

  const year =
    now.getFullYear()

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      '0'
    )

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      '0'
    )

  return `${year}-${month}-${day}`
}

function rocDateText(
  value: string
) {
  if (!value) {
    return ''
  }

  const [year, month, day] =
    value
      .split('-')
      .map(Number)

  if (
    !year ||
    !month ||
    !day
  ) {
    return value
  }

  return `${year - 1911}年${String(month).padStart(2, '0')}月${String(day).padStart(2, '0')}日`
}

export default function NewDisasterInspectionPage() {
  const supabase =
    createClient()

  const [
    parkingLots,
    setParkingLots,
  ] =
    useState<
      ParkingLot[]
    >([])

  const [
    parkingLotId,
    setParkingLotId,
  ] =
    useState('')

  const [
    eventType,
    setEventType,
  ] =
    useState<
      'typhoon'
      | 'heavy_rain'
    >('typhoon')

  const [
    lotType,
    setLotType,
  ] =
    useState<
      | '立體'
      | '機械'
      | '平面'
      | ''
    >('')

  const [
    operatorName,
    setOperatorName,
  ] =
    useState(
      '智驛科技有限公司'
    )

  const [
    inspectorName,
    setInspectorName,
  ] =
    useState('')

  const [
    inspectionDate,
    setInspectionDate,
  ] =
    useState(
      localDateText()
    )

  const [
    parkingLotPhone,
    setParkingLotPhone,
  ] =
    useState('')

  const [
    emergencyContact1,
    setEmergencyContact1,
  ] =
    useState('')

  const [
    emergencyPhone1,
    setEmergencyPhone1,
  ] =
    useState('')

  const [
    emergencyContact2,
    setEmergencyContact2,
  ] =
    useState('')

  const [
    emergencyPhone2,
    setEmergencyPhone2,
  ] =
    useState('')

  const [
    reviewer,
    setReviewer,
  ] =
    useState('')

  const [
    items,
    setItems,
  ] =
    useState<
      ItemForm[]
    >(
      DEFAULT_ITEMS
    )

  const [
    saving,
    setSaving,
  ] =
    useState(false)

  const [
    message,
    setMessage,
  ] =
    useState('')

  const [
    showPreview,
    setShowPreview,
  ] =
    useState(false)


  const [
    exportingPdf,
    setExportingPdf,
  ] =
    useState(false)

  const [
    selectedPhotos,
    setSelectedPhotos,
  ] =
    useState<File[]>([])

  useEffect(() => {
    loadParkingLots()
  }, [])

  async function loadParkingLots() {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          'parking_lots'
        )
        .select(
          'id, name'
        )
        .eq(
          'status',
          'active'
        )
        .order(
          'name'
        )

    if (
      error
    ) {
      setMessage(
        '停車場讀取失敗：' +
          error.message
      )
      return
    }

    const lots =
      data || []

    setParkingLots(
      lots
    )

    if (
      lots.length >
      0
    ) {
      setParkingLotId(
        lots[0].id
      )
    }
  }

  const selectedParkingLot =
    useMemo(
      () =>
        parkingLots.find(
          (lot) =>
            lot.id ===
            parkingLotId
        ),
      [
        parkingLots,
        parkingLotId,
      ]
    )

  function updateItemResult(
    index: number,
    result: ResultValue
  ) {
    setItems(
      (
        current
      ) =>
        current.map(
          (
            item,
            itemIndex
          ) =>
            itemIndex ===
            index
              ? {
                  ...item,
                  result,
                }
              : item
        )
    )
  }

  function updateItemNote(
    index: number,
    note: string
  ) {
    setItems(
      (
        current
      ) =>
        current.map(
          (
            item,
            itemIndex
          ) =>
            itemIndex ===
            index
              ? {
                  ...item,
                  item_note:
                    note,
                }
              : item
        )
    )
  }

  function selectPhotos(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const incoming =
      Array.from(
        event.target.files || []
      )

    event.target.value = ''

    if (!incoming.length) return

    const merged =
      [
        ...selectedPhotos,
        ...incoming,
      ].slice(0, 6)

    if (
      selectedPhotos.length +
        incoming.length >
      6
    ) {
      alert('佐證照片最多 6 張')
    }

    setSelectedPhotos(merged)
  }

  function removeSelectedPhoto(
    index: number
  ) {
    setSelectedPhotos(
      current =>
        current.filter(
          (_, photoIndex) =>
            photoIndex !== index
        )
    )
  }

  async function saveInspection(
    e: FormEvent
  ) {
    e.preventDefault()

    if (
      saving
    ) {
      return
    }

    setMessage('')

    if (
      !parkingLotId
    ) {
      setMessage(
        '請選擇停車場'
      )
      return
    }

    if (
      !lotType
    ) {
      setMessage(
        '請選擇停車場型式'
      )
      return
    }

    if (
      !inspectorName.trim()
    ) {
      setMessage(
        '請輸入檢查人員'
      )
      return
    }

    if (
      !inspectionDate
    ) {
      setMessage(
        '請選擇檢查日期'
      )
      return
    }

    setSaving(
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
        setMessage(
          '登入狀態失效，請重新登入'
        )
        return
      }

      const {
        data:
          inspection,
        error:
          insertError,
      } =
        await supabase
          .from(
            'disaster_inspections'
          )
          .insert({
            parking_lot_id:
              parkingLotId,

            event_type:
              eventType,

            lot_type:
              lotType,

            operator_name:
              operatorName.trim() ||
              null,

            inspector_name:
              inspectorName.trim(),

            inspection_date:
              inspectionDate,

            parking_lot_phone:
              parkingLotPhone.trim() ||
              null,

            emergency_contact_1:
              emergencyContact1.trim() ||
              null,

            emergency_phone_1:
              emergencyPhone1.trim() ||
              null,

            emergency_contact_2:
              emergencyContact2.trim() ||
              null,

            emergency_phone_2:
              emergencyPhone2.trim() ||
              null,

            reviewer:
              reviewer.trim() ||
              null,

            status:
              'draft',

            created_by:
              user.id,

            updated_at:
              new Date()
                .toISOString(),
          })
          .select(
            'id'
          )
          .single()

      if (
        insertError ||
        !inspection
      ) {
        setMessage(
          '建立檢查表失敗：' +
            (insertError?.message ||
              '未知錯誤')
        )
        return
      }

      /*
       * 主表建立後，資料庫 trigger
       * 會自動建立 9 個檢查項目。
       * 這裡只更新使用者實際填寫的結果與備註。
       */
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
                item.result ||
                null,

              item_note:
                item.item_note ||
                null,
            })
            .eq(
              'inspection_id',
              inspection.id
            )
            .eq(
              'item_code',
              item.item_code
            )

        if (
          itemError
        ) {
          setMessage(
            '檢查表已建立，但檢查項目儲存失敗：' +
              itemError.message
          )
          return
        }
      }

      if (
        selectedPhotos.length >
        0
      ) {
        for (
          let index = 0;
          index <
          selectedPhotos.length;
          index++
        ) {
          const file =
            selectedPhotos[index]

          const ext =
            file.name
              .split('.')
              .pop() ||
            'jpg'

          const storagePath =
            `${inspection.id}/${Date.now()}_${index}.${ext}`

          const {
            error: uploadError,
          } =
            await supabase
              .storage
              .from(
                'disaster-inspections'
              )
              .upload(
                storagePath,
                file,
                {
                  upsert: false,
                }
              )

          if (uploadError) {
            setMessage(
              `檢查表已建立，但第 ${index + 1} 張照片上傳失敗：${uploadError.message}`
            )
            return
          }

          const {
            error: photoRowError,
          } =
            await supabase
              .from(
                'disaster_inspection_photos'
              )
              .insert({
                inspection_id:
                  inspection.id,
                storage_path:
                  storagePath,
                file_name:
                  file.name,
                sort_order:
                  index + 1,
                uploaded_by:
                  user.id,
              })

          if (photoRowError) {
            setMessage(
              `檢查表已建立，但第 ${index + 1} 張照片紀錄失敗：${photoRowError.message}`
            )
            return
          }
        }
      }

      window.location.href =
        `/dashboard/disaster-inspections/${inspection.id}`
    } catch (
      error: any
    ) {
      setMessage(
        '儲存失敗：' +
          (error?.message ||
            '未知錯誤')
      )
    } finally {
      setSaving(
        false
      )
    }
  }

  async function exportPdf() {
    if (exportingPdf) {
      return
    }

    const pages =
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '.disaster-preview-page'
        )
      )

    if (
      pages.length ===
      0
    ) {
      alert(
        '請先開啟表單預覽'
      )
      return
    }

    setExportingPdf(
      true
    )

    try {
      const [
        html2canvasModule,
        jspdfModule,
      ] =
        await Promise.all([
          import(
            'html2canvas'
          ),
          import(
            'jspdf'
          ),
        ])

      const html2canvas =
        html2canvasModule.default

      const {
        jsPDF,
      } =
        jspdfModule

      const pdf =
        new jsPDF({
          orientation:
            'portrait',
          unit: 'mm',
          format: 'a4',
          compress:
            true,
        })

      for (
        let index = 0;
        index <
        pages.length;
        index++
      ) {
        const page =
          pages[index]

        const canvas =
          await html2canvas(
            page,
            {
              scale: 2,
              useCORS:
                true,
              backgroundColor:
                '#ffffff',
              logging:
                false,
            }
          )

        const imgData =
          canvas.toDataURL(
            'image/jpeg',
            0.95
          )

        if (
          index >
          0
        ) {
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
          selectedParkingLot?.name ||
          '防災自主檢查表'
        )
          .replace(
            /[\\/:*?"<>|]/g,
            '_'
          )

      const dateText =
        inspectionDate ||
        '未填日期'

      pdf.save(
        `${lotName}_${dateText}_防災自主檢查表.pdf`
      )
    } catch (
      error: any
    ) {
      console.error(
        error
      )

      alert(
        'PDF 匯出失敗：' +
          (
            error?.message ||
            '未知錯誤'
          )
      )
    } finally {
      setExportingPdf(
        false
      )
    }
  }

  return (
    <>
      <div
        style={{
          paddingBottom:
            40,
        }}
      >
      <div>
        <h1
          style={{
            marginTop: 0,
            marginBottom: 6,
          }}
        >
          新增防災自主檢查表
        </h1>

        <p
          className="muted"
          style={{
            margin: 0,
          }}
        >
          欄位依新北市政府交通局颱風前（或豪、大雨）整備工作自主檢查表建立。
        </p>
      </div>

      <form
        onSubmit={
          saveInspection
        }
      >
        <div
          className="card"
          style={{
            marginTop:
              20,
          }}
        >
          <h2
            style={{
              marginTop: 0,
            }}
          >
            基本資料
          </h2>

          <div
            style={{
              display:
                'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            <div
              className="field"
            >
              <label>
                停車場名稱 *
              </label>

              <select
                value={
                  parkingLotId
                }
                onChange={(
                  e
                ) =>
                  setParkingLotId(
                    e.target
                      .value
                  )
                }
                required
              >
                {parkingLots.map(
                  (
                    lot
                  ) => (
                    <option
                      key={
                        lot.id
                      }
                      value={
                        lot.id
                      }
                    >
                      {
                        lot.name
                      }
                    </option>
                  )
                )}
              </select>
            </div>

            <div
              className="field"
            >
              <label>
                防災類型
              </label>

              <select
                value={
                  eventType
                }
                onChange={(
                  e
                ) =>
                  setEventType(
                    e.target
                      .value as
                      | 'typhoon'
                      | 'heavy_rain'
                  )
                }
              >
                <option value="typhoon">
                  颱風前
                </option>

                <option value="heavy_rain">
                  豪、大雨
                </option>
              </select>
            </div>

            <div
              className="field"
            >
              <label>
                停車場型式 *
              </label>

              <select
                value={
                  lotType
                }
                onChange={(
                  e
                ) =>
                  setLotType(
                    e.target
                      .value as
                      | '立體'
                      | '機械'
                      | '平面'
                      | ''
                  )
                }
                required
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
                  operatorName
                }
                onChange={(
                  e
                ) =>
                  setOperatorName(
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
                檢查人員 *
              </label>

              <input
                value={
                  inspectorName
                }
                onChange={(
                  e
                ) =>
                  setInspectorName(
                    e.target
                      .value
                  )
                }
                required
              />
            </div>

            <div
              className="field"
            >
              <label>
                檢查日期 *
              </label>

              <input
                type="date"
                value={
                  inspectionDate
                }
                onChange={(
                  e
                ) =>
                  setInspectionDate(
                    e.target
                      .value
                  )
                }
                required
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
                  parkingLotPhone
                }
                onChange={(
                  e
                ) =>
                  setParkingLotPhone(
                    e.target
                      .value
                  )
                }
              />
            </div>
          </div>

          {selectedParkingLot && (
            <div
              className="muted"
              style={{
                marginTop:
                  14,
              }}
            >
              目前選擇：
              {
                selectedParkingLot.name
              }
            </div>
          )}
        </div>

        <div
          className="card"
          style={{
            marginTop:
              20,
          }}
        >
          <h2
            style={{
              marginTop: 0,
            }}
          >
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
                    item,
                    index
                  ) => (
                    <tr
                      key={
                        item.item_code
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
                          fontWeight:
                            700,
                          width:
                            100,
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
                          minWidth:
                            280,
                        }}
                      >
                        {
                          item.item_name
                        }
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          textAlign:
                            'center',
                        }}
                      >
                        <input
                          type="radio"
                          name={
                            item.item_code
                          }
                          checked={
                            item.result ===
                            'yes'
                          }
                          onChange={() =>
                            updateItemResult(
                              index,
                              'yes'
                            )
                          }
                        />
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          textAlign:
                            'center',
                        }}
                      >
                        <input
                          type="radio"
                          name={
                            item.item_code
                          }
                          checked={
                            item.result ===
                            'no'
                          }
                          onChange={() =>
                            updateItemResult(
                              index,
                              'no'
                            )
                          }
                        />
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          minWidth:
                            200,
                        }}
                      >
                        <input
                          value={
                            item.item_note
                          }
                          onChange={(
                            e
                          ) =>
                            updateItemNote(
                              index,
                              e.target
                                .value
                            )
                          }
                          style={{
                            width:
                              '100%',
                            boxSizing:
                              'border-box',
                          }}
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
          <h2
            style={{
              marginTop: 0,
            }}
          >
            緊急聯絡資料
          </h2>

          <div
            style={{
              display:
                'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            <div
              className="field"
            >
              <label>
                緊急連絡人 1
              </label>

              <input
                value={
                  emergencyContact1
                }
                onChange={(
                  e
                ) =>
                  setEmergencyContact1(
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
                電話
              </label>

              <input
                value={
                  emergencyPhone1
                }
                onChange={(
                  e
                ) =>
                  setEmergencyPhone1(
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
                緊急連絡人 2
              </label>

              <input
                value={
                  emergencyContact2
                }
                onChange={(
                  e
                ) =>
                  setEmergencyContact2(
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
                電話
              </label>

              <input
                value={
                  emergencyPhone2
                }
                onChange={(
                  e
                ) =>
                  setEmergencyPhone2(
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
                  reviewer
                }
                onChange={(
                  e
                ) =>
                  setReviewer(
                    e.target
                      .value
                  )
                }
                placeholder="可先留空"
              />
            </div>
          </div>
        </div>

        <div
          className="card"
          style={{ marginTop: 20 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2 style={{ marginTop: 0, marginBottom: 6 }}>
                佐證照片
              </h2>
              <div className="muted">
                最多 6 張；輸出固定第 1 頁 2 張、第 2 頁 4 張。
              </div>
            </div>

            <label
              className="btn"
              style={{ cursor: 'pointer' }}
            >
              ＋ 選擇照片
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={selectPhotos}
                disabled={selectedPhotos.length >= 6}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          {selectedPhotos.length === 0 ? (
            <div
              style={{
                marginTop: 16,
                padding: 24,
                border: '1px dashed #cbd5e1',
                borderRadius: 8,
                textAlign: 'center',
                color: '#64748b',
              }}
            >
              尚未選擇佐證照片
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                marginTop: 16,
              }}
            >
              {selectedPhotos.map((file, index) => (
                <div
                  key={`${file.name}-${file.lastModified}-${index}`}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`佐證照片 ${index + 1}`}
                    style={{
                      width: '100%',
                      height: 180,
                      objectFit: 'cover',
                    }}
                  />
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                    }}
                  >
                    照片 {index + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      removeSelectedPhoto(index)
                    }
                    style={{ marginTop: 6 }}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: 6,
                }}
              >
                表單預覽
              </h2>

              <div className="muted">
                預覽版型依交通局原始自主檢查表排列，照片會同步顯示。
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setShowPreview(
                    !showPreview
                  )
                }
              >
                {showPreview
                  ? '關閉預覽'
                  : '預覽交通局表單'}
              </button>

              {showPreview && (
                <button
                  type="button"
                  className="btn"
                  onClick={
                    exportPdf
                  }
                  disabled={
                    exportingPdf
                  }
                >
                  {exportingPdf
                    ? 'PDF 產生中…'
                    : '匯出 PDF'}
                </button>
              )}
            </div>
          </div>

          {showPreview && (
            <div
              id="disaster-new-preview"
              style={{
                marginTop: 18,
                background: '#e5e7eb',
                padding: 18,
                overflowX: 'auto',
              }}
            >
              {/* 第 1 頁 */}
              <div
                className="disaster-preview-page"
                style={{
                  width: '210mm',
                  minHeight: '297mm',
                  margin: '0 auto 24px',
                  background: '#fff',
                  color: '#000',
                  padding: 18,
                  boxSizing: 'border-box',
                  fontFamily:
                    '"DFKai-SB", "BiauKai", "Microsoft JhengHei", sans-serif',
                }}
              >
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 23,
                    fontWeight: 700,
                    marginBottom: 16,
                  }}
                >
                  新北市政府交通局颱風前（或豪、大雨）整備工作自主檢查表
                </div>

                <div
                  style={{
                    fontSize: 19,
                    marginBottom: 10,
                  }}
                >
                  停車場名稱：
                  {selectedParkingLot?.name ||
                    '________________'}
                </div>

                <div
                  style={{
                    fontSize: 19,
                    marginBottom: 14,
                  }}
                >
                  停車場型式：
                  {lotType === '立體'
                    ? '☑'
                    : '□'}立體　　
                  {lotType === '機械'
                    ? '☑'
                    : '□'}機械　　
                  {lotType === '平面'
                    ? '☑'
                    : '□'}平面
                </div>

                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 15,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        rowSpan={2}
                        style={{
                          border: '1px solid #000',
                          padding: 7,
                          width: 86,
                        }}
                      >
                        工作事項
                      </th>

                      <th
                        rowSpan={2}
                        style={{
                          border: '1px solid #000',
                          padding: 7,
                        }}
                      >
                        檢查項目
                      </th>

                      <th
                        colSpan={2}
                        style={{
                          border: '1px solid #000',
                          padding: 7,
                          width: 125,
                        }}
                      >
                        檢查結果
                      </th>

                      <th
                        rowSpan={2}
                        style={{
                          border: '1px solid #000',
                          padding: 7,
                          width: 115,
                        }}
                      >
                        備註
                      </th>
                    </tr>

                    <tr>
                      <th
                        style={{
                          border: '1px solid #000',
                          padding: 7,
                        }}
                      >
                        是
                      </th>

                      <th
                        style={{
                          border: '1px solid #000',
                          padding: 7,
                        }}
                      >
                        否
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {items.map(
                      (
                        item,
                        index
                      ) => {
                        const previousCategory =
                          index > 0
                            ? items[index - 1].category
                            : null

                        const isCategoryStart =
                          previousCategory !==
                          item.category

                        const rowSpan =
                          items.filter(
                            (x) =>
                              x.category ===
                              item.category
                          ).length

                        return (
                          <tr
                            key={
                              item.item_code
                            }
                          >
                            {isCategoryStart && (
                              <td
                                rowSpan={rowSpan}
                                style={{
                                  border: '1px solid #000',
                                  padding: 7,
                                  textAlign: 'center',
                                  verticalAlign: 'middle',
                                }}
                              >
                                {item.category}
                              </td>
                            )}

                            <td
                              style={{
                                border: '1px solid #000',
                                padding: 7,
                              }}
                            >
                              {item.item_name}
                            </td>

                            <td
                              style={{
                                border: '1px solid #000',
                                padding: 7,
                                textAlign: 'center',
                                fontSize: 18,
                              }}
                            >
                              {item.result === 'yes'
                                ? 'V'
                                : ''}
                            </td>

                            <td
                              style={{
                                border: '1px solid #000',
                                padding: 7,
                                textAlign: 'center',
                                fontSize: 18,
                              }}
                            >
                              {item.result === 'no'
                                ? 'V'
                                : ''}
                            </td>

                            <td
                              style={{
                                border: '1px solid #000',
                                padding: 7,
                                textAlign: 'center',
                              }}
                            >
                              {item.item_note}
                            </td>
                          </tr>
                        )
                      }
                    )}

                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          border: '1px solid #000',
                          padding: 16,
                          textAlign: 'center',
                          fontSize: 19,
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
                            gridTemplateColumns: '1fr 1fr',
                            height: 285,
                          }}
                        >
                          {[0, 1].map(
                            (
                              photoIndex
                            ) => (
                              <div
                                key={photoIndex}
                                style={{
                                  borderRight:
                                    photoIndex === 0
                                      ? '1px solid #000'
                                      : undefined,
                                  padding: 8,
                                  boxSizing: 'border-box',
                                  overflow: 'hidden',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: '#fff',
                                }}
                              >
                                {selectedPhotos[
                                  photoIndex
                                ] ? (
                                  <img
                                    src={URL.createObjectURL(
                                      selectedPhotos[
                                        photoIndex
                                      ]
                                    )}
                                    alt={`佐證照片 ${photoIndex + 1}`}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover',
                                      display: 'block',
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

              {/* 第 2 頁 */}
              <div
                className="disaster-preview-page"
                style={{
                  width: '210mm',
                  minHeight: '297mm',
                  margin: '0 auto',
                  background: '#fff',
                  color: '#000',
                  padding: 18,
                  boxSizing: 'border-box',
                  fontFamily:
                    '"DFKai-SB", "BiauKai", "Microsoft JhengHei", sans-serif',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gridTemplateRows: '1fr 1fr',
                    height: 610,
                    border: '1px solid #000',
                  }}
                >
                  {[2, 3, 4, 5].map(
                    (
                      photoIndex
                    ) => (
                      <div
                        key={photoIndex}
                        style={{
                          borderRight:
                            photoIndex % 2 === 0
                              ? '1px solid #000'
                              : undefined,
                          borderBottom:
                            photoIndex < 4
                              ? '1px solid #000'
                              : undefined,
                          padding: 8,
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#fff',
                        }}
                      >
                        {selectedPhotos[
                          photoIndex
                        ] ? (
                          <img
                            src={URL.createObjectURL(
                              selectedPhotos[
                                photoIndex
                              ]
                            )}
                            alt={`佐證照片 ${photoIndex + 1}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
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
                    fontSize: 15,
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
                          {operatorName || ''}
                        </div>

                        <div>
                          檢查人員：
                          {inspectorName || ''}
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
                        {rocDateText(inspectionDate)}
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
                            fontSize: 15,
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
                                  verticalAlign: 'top',
                                  background: '#fff59d',
                                  color: '#ef4444',
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <div
                                  style={{
                                    height: 31,
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0 8px',
                                    boxSizing: 'border-box',
                                  }}
                                >
                                  停車場電話：
                                </div>

                                <div
                                  style={{
                                    height: 31,
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0 8px',
                                    boxSizing: 'border-box',
                                  }}
                                >
                                  緊急連絡人1：
                                </div>

                                <div
                                  style={{
                                    height: 31,
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0 8px',
                                    boxSizing: 'border-box',
                                  }}
                                >
                                  緊急連絡人2：
                                </div>
                              </td>

                              <td
                                style={{
                                  border: 0,
                                  borderLeft: '1px solid #000',
                                  padding: 0,
                                  verticalAlign: 'top',
                                }}
                              >
                                <div
                                  style={{
                                    height: 31,
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0 10px',
                                    boxSizing: 'border-box',
                                  }}
                                >
                                  {parkingLotPhone || ''}
                                </div>

                                <div
                                  style={{
                                    height: 31,
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0 10px',
                                    boxSizing: 'border-box',
                                  }}
                                >
                                  {emergencyContact1 || ''}
                                  {emergencyPhone1
                                    ? `　電話：${emergencyPhone1}`
                                    : ''}
                                </div>

                                <div
                                  style={{
                                    height: 31,
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0 10px',
                                    boxSizing: 'border-box',
                                  }}
                                >
                                  {emergencyContact2 || ''}
                                  {emergencyPhone2
                                    ? `　電話：${emergencyPhone2}`
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
                        {reviewer || ''}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.8,
                    marginTop: 8,
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
          )}
        </div>

        {message && (
          <div
            style={{
              marginTop:
                20,
              padding:
                12,
              borderRadius:
                8,
              background:
                '#fee2e2',
              color:
                '#b91c1c',
            }}
          >
            {
              message
            }
          </div>
        )}

        <div
          style={{
            display:
              'flex',
            gap: 12,
            alignItems:
              'center',
            marginTop:
              22,
          }}
        >
          <button
            type="submit"
            className="btn"
            disabled={
              saving
            }
          >
            {saving
              ? '儲存中…'
              : '儲存檢查表'}
          </button>

          <a
            href="/dashboard/disaster-inspections"
            style={{
              color:
                '#475569',
              textDecoration:
                'none',
            }}
          >
            取消
          </a>
        </div>
      </form>
    </div>
    </>
  )
}
