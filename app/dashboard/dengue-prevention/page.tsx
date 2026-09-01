'use client'

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { createClient } from '@/lib/supabase/client'
import { getSavedWorkParkingLotId } from '@/components/useWorkParkingLot'

type ParkingLot = {
  id: string
  name: string
}

type DengueRecord = {
  id: string
  parking_lot_id: string
  work_date: string
  form_storage_path: string
  form_file_name: string
  notes: string | null
  created_by: string | null
  created_at: string
}

type DenguePhoto = {
  id: string
  record_id: string
  storage_path: string
  file_name: string | null
  sort_order: number
}

function todayText() {
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

function safeFileName(
  value: string
) {
  return String(
    value || ''
  )
    .replace(
      /[\\/:*?"<>|]/g,
      '_'
    )
    .replace(
      /\s+/g,
      '_'
    )
}

function createUuid() {
  if (
    typeof crypto !==
      'undefined' &&
    typeof crypto.randomUUID ===
      'function'
  ) {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    (
      char
    ) => {
      const random =
        Math.floor(
          Math.random() *
            16
        )

      const value =
        char ===
        'x'
          ? random
          : (
              random &
              0x3
            ) |
            0x8

      return value.toString(
        16
      )
    }
  )
}

export default function DenguePreventionPage() {
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
    selectedLotId,
    setSelectedLotId,
  ] =
    useState('')

  const [
    workDate,
    setWorkDate,
  ] =
    useState(
      todayText()
    )

  const [
    formFile,
    setFormFile,
  ] =
    useState<
      File | null
    >(null)

  const [
    photos,
    setPhotos,
  ] =
    useState<
      File[]
    >([])

  const [
    notes,
    setNotes,
  ] =
    useState('')

  const [
    records,
    setRecords,
  ] =
    useState<
      DengueRecord[]
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
    downloadingRecordId,
    setDownloadingRecordId,
  ] =
    useState('')

  const [
    message,
    setMessage,
  ] =
    useState('')

  useEffect(() => {
    loadParkingLots()
  }, [])

  useEffect(() => {
    if (
      selectedLotId
    ) {
      loadRecords(
        selectedLotId
      )
    } else {
      setRecords([])
    }
  }, [
    selectedLotId,
  ])

  async function loadParkingLots() {
    setLoading(
      true
    )

    setMessage(
      ''
    )

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
        `停車場讀取失敗：${error.message}`
      )

      setLoading(
        false
      )

      return
    }

    const lots =
      (
        data ||
        []
      ) as ParkingLot[]

    setParkingLots(
      lots
    )

    const workLotId =
      getSavedWorkParkingLotId()

    if (
      workLotId &&
      lots.some(
        (
          lot
        ) =>
          lot.id ===
          workLotId
      )
    ) {
      setSelectedLotId(
        workLotId
      )
    } else {
      setSelectedLotId(
        ''
      )

      setMessage(
        '請先在左側「目前工作停車場」選擇停車場。'
      )
    }

    setLoading(
      false
    )
  }

  async function loadRecords(
    lotId: string
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          'dengue_prevention_records'
        )
        .select(`
          id,
          parking_lot_id,
          work_date,
          form_storage_path,
          form_file_name,
          notes,
          created_by,
          created_at
        `)
        .eq(
          'parking_lot_id',
          lotId
        )
        .order(
          'work_date',
          {
            ascending:
              false,
          }
        )
        .order(
          'created_at',
          {
            ascending:
              false,
          }
        )

    if (
      error
    ) {
      setMessage(
        `登革熱紀錄讀取失敗：${error.message}`
      )

      return
    }

    setRecords(
      (
        data ||
        []
      ) as DengueRecord[]
    )
  }

  const currentLot =
    useMemo(
      () =>
        parkingLots.find(
          (
            lot
          ) =>
            lot.id ===
            selectedLotId
        ),
      [
        parkingLots,
        selectedLotId,
      ]
    )

  function selectPhotos(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const files =
      Array.from(
        event.target.files ||
          []
      )

    event.target.value =
      ''

    if (
      files.length ===
      0
    ) {
      return
    }

    const merged =
      [
        ...photos,
        ...files,
      ].slice(
        0,
        5
      )

    setPhotos(
      merged
    )

    if (
      photos.length +
        files.length >
      5
    ) {
      alert(
        '佐證照片最多 5 張'
      )
    }
  }

  function removePhoto(
    index: number
  ) {
    setPhotos(
      (
        current
      ) =>
        current.filter(
          (
            _,
            itemIndex
          ) =>
            itemIndex !==
            index
        )
    )
  }

  async function saveRecord(
    event: FormEvent
  ) {
    event.preventDefault()

    if (
      saving
    ) {
      return
    }

    setMessage(
      ''
    )

    if (
      !selectedLotId
    ) {
      setMessage(
        '請先選擇目前工作停車場'
      )

      return
    }

    if (
      !workDate
    ) {
      setMessage(
        '請選擇作業日期'
      )

      return
    }

    if (
      !formFile
    ) {
      setMessage(
        '請上傳登革熱防治表單'
      )

      return
    }

    if (
      photos.length !==
      5
    ) {
      setMessage(
        '佐證照片必須上傳 5 張'
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

      /*
       * 每筆紀錄都使用全新 UUID。
       * 不會覆蓋舊資料。
       */
      const recordId =
        createUuid()

      const formExt =
        formFile.name
          .split('.')
          .pop() ||
        'file'

      const formStoragePath =
        `${selectedLotId}/${recordId}/form_${createUuid()}.${formExt}`

      const {
        error:
          formUploadError,
      } =
        await supabase
          .storage
          .from(
            'dengue-prevention'
          )
          .upload(
            formStoragePath,
            formFile,
            {
              upsert:
                false,
            }
          )

      if (
        formUploadError
      ) {
        setMessage(
          `表單上傳失敗：${formUploadError.message}`
        )

        return
      }

      const {
        error:
          recordError,
      } =
        await supabase
          .from(
            'dengue_prevention_records'
          )
          .insert({
            id:
              recordId,

            parking_lot_id:
              selectedLotId,

            work_date:
              workDate,

            form_storage_path:
              formStoragePath,

            form_file_name:
              formFile.name,

            notes:
              notes.trim() ||
              null,

            created_by:
              user.id,
          })

      if (
        recordError
      ) {
        await supabase
          .storage
          .from(
            'dengue-prevention'
          )
          .remove([
            formStoragePath,
          ])

        setMessage(
          `建立登革熱紀錄失敗：${recordError.message}`
        )

        return
      }

      const uploadedPhotoPaths:
        string[] =
        []

      for (
        let index = 0;
        index <
        photos.length;
        index++
      ) {
        const photo =
          photos[index]

        const ext =
          photo.name
            .split('.')
            .pop() ||
          'jpg'

        const storagePath =
          `${selectedLotId}/${recordId}/photo_${index + 1}_${createUuid()}.${ext}`

        const {
          error:
            uploadError,
        } =
          await supabase
            .storage
            .from(
              'dengue-prevention'
            )
            .upload(
              storagePath,
              photo,
              {
                upsert:
                  false,
              }
            )

        if (
          uploadError
        ) {
          if (
            uploadedPhotoPaths.length >
            0
          ) {
            await supabase
              .storage
              .from(
                'dengue-prevention'
              )
              .remove(
                uploadedPhotoPaths
              )
          }

          await supabase
            .from(
              'dengue_prevention_records'
            )
            .delete()
            .eq(
              'id',
              recordId
            )

          await supabase
            .storage
            .from(
              'dengue-prevention'
            )
            .remove([
              formStoragePath,
            ])

          setMessage(
            `第 ${index + 1} 張照片上傳失敗：${uploadError.message}`
          )

          return
        }

        uploadedPhotoPaths.push(
          storagePath
        )

        const {
          error:
            photoRowError,
        } =
          await supabase
            .from(
              'dengue_prevention_photos'
            )
            .insert({
              record_id:
                recordId,

              storage_path:
                storagePath,

              file_name:
                photo.name,

              sort_order:
                index + 1,
            })

        if (
          photoRowError
        ) {
          setMessage(
            `第 ${index + 1} 張照片紀錄失敗：${photoRowError.message}`
          )

          return
        }
      }

      setFormFile(
        null
      )

      setPhotos(
        []
      )

      setNotes(
        ''
      )

      setWorkDate(
        todayText()
      )

      setMessage(
        '登革熱防治作業上傳完成，原有紀錄均已保留。'
      )

      await loadRecords(
        selectedLotId
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '儲存失敗'
      )
    } finally {
      setSaving(
        false
      )
    }
  }

  async function openForm(
    record: DengueRecord
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .storage
        .from(
          'dengue-prevention'
        )
        .createSignedUrl(
          record.form_storage_path,
          60 * 10
        )

    if (
      error ||
      !data?.signedUrl
    ) {
      alert(
        error?.message ||
          '表單開啟失敗'
      )

      return
    }

    window.open(
      data.signedUrl,
      '_blank'
    )
  }

  async function getRecordPhotos(
    recordId: string
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          'dengue_prevention_photos'
        )
        .select(`
          id,
          record_id,
          storage_path,
          file_name,
          sort_order
        `)
        .eq(
          'record_id',
          recordId
        )
        .order(
          'sort_order'
        )

    if (
      error
    ) {
      throw new Error(
        error.message
      )
    }

    return (
      data ||
      []
    ) as DenguePhoto[]
  }

  async function openPhotos(
    recordId: string
  ) {
    try {
      const rows =
        await getRecordPhotos(
          recordId
        )

      if (
        rows.length ===
        0
      ) {
        alert(
          '目前沒有照片'
        )

        return
      }

      for (
        const row of
        rows
      ) {
        const {
          data:
            signedData,
          error,
        } =
          await supabase
            .storage
            .from(
              'dengue-prevention'
            )
            .createSignedUrl(
              row.storage_path,
              60 * 10
            )

        if (
          !error &&
          signedData?.signedUrl
        ) {
          window.open(
            signedData.signedUrl,
            '_blank'
          )
        }
      }
    } catch (
      error: any
    ) {
      alert(
        error?.message ||
          '照片開啟失敗'
      )
    }
  }

  async function downloadPhotosZip(
    record: DengueRecord
  ) {
    if (
      downloadingRecordId
    ) {
      return
    }

    setDownloadingRecordId(
      record.id
    )

    setMessage(
      '照片下載中，正在建立 ZIP 壓縮檔…'
    )

    try {
      const rows =
        await getRecordPhotos(
          record.id
        )

      if (
        rows.length ===
        0
      ) {
        setMessage(
          '這筆紀錄沒有照片可下載'
        )

        return
      }

      const JSZip =
        (
          await import(
            'jszip'
          )
        ).default

      const zip =
        new JSZip()

      const folder =
        zip.folder(
          '登革熱防治照片'
        )

      if (
        !folder
      ) {
        throw new Error(
          'ZIP 建立失敗'
        )
      }

      for (
        let index = 0;
        index <
        rows.length;
        index++
      ) {
        const row =
          rows[index]

        const {
          data:
            fileBlob,
          error:
            downloadError,
        } =
          await supabase
            .storage
            .from(
              'dengue-prevention'
            )
            .download(
              row.storage_path
            )

        if (
          downloadError ||
          !fileBlob
        ) {
          throw new Error(
            `第 ${index + 1} 張照片下載失敗：${
              downloadError?.message ||
              '未知錯誤'
            }`
          )
        }

        const originalName =
          row.file_name ||
          `photo_${index + 1}.jpg`

        const zipFileName =
          `${String(
            index + 1
          ).padStart(
            2,
            '0'
          )}_${safeFileName(
            originalName
          )}`

        folder.file(
          zipFileName,
          fileBlob
        )
      }

      const zipBlob =
        await zip.generateAsync({
          type:
            'blob',

          compression:
            'DEFLATE',

          compressionOptions: {
            level:
              6,
          },
        })

      const url =
        URL.createObjectURL(
          zipBlob
        )

      const link =
        document.createElement(
          'a'
        )

      const lotName =
        safeFileName(
          currentLot?.name ||
          '停車場'
        )

      link.href =
        url

      link.download =
        `${lotName}_${record.work_date}_登革熱防治照片.zip`

      document.body.appendChild(
        link
      )

      link.click()

      document.body.removeChild(
        link
      )

      setTimeout(
        () => {
          URL.revokeObjectURL(
            url
          )
        },
        1000
      )

      setMessage(
        `${rows.length} 張照片已完成打包並下載 ZIP。`
      )
    } catch (
      error: any
    ) {
      setMessage(
        `ZIP 下載失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setDownloadingRecordId(
        ''
      )
    }
  }

  async function deleteRecord(
    record: DengueRecord
  ) {
    const confirmed =
      window.confirm(
        `確定刪除這筆登革熱防治紀錄？\n\n作業日期：${record.work_date}\n表單：${record.form_file_name}\n\n刪除後表單及 5 張照片都無法復原。`
      )

    if (
      !confirmed
    ) {
      return
    }

    try {
      const photoRows =
        await getRecordPhotos(
          record.id
        )

      const {
        error:
          deleteError,
      } =
        await supabase
          .from(
            'dengue_prevention_records'
          )
          .delete()
          .eq(
            'id',
            record.id
          )
          .eq(
            'parking_lot_id',
            selectedLotId
          )

      if (
        deleteError
      ) {
        setMessage(
          `刪除失敗：${deleteError.message}`
        )

        return
      }

      const storagePaths =
        [
          record.form_storage_path,

          ...photoRows.map(
            (
              row
            ) =>
              row.storage_path
          ),
        ]

      if (
        storagePaths.length >
        0
      ) {
        await supabase
          .storage
          .from(
            'dengue-prevention'
          )
          .remove(
            storagePaths
          )
      }

      setMessage(
        '登革熱防治紀錄已刪除'
      )

      await loadRecords(
        selectedLotId
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '刪除失敗'
      )
    }
  }

  return (
    <div
      style={{
        paddingBottom:
          40,
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
          登革熱防治作業
        </h1>

        <div
          className="muted"
        >
          目前工作停車場：
          {currentLot?.name ||
            '尚未選擇'}
        </div>
      </div>

      {!selectedLotId && (
        <div
          className="card"
          style={{
            marginTop:
              20,
            color:
              '#b45309',
            fontWeight:
              700,
          }}
        >
          請先在左側「目前工作停車場」選擇停車場。
        </div>
      )}

      <form
        onSubmit={
          saveRecord
        }
      >
        <div
          className="card"
          style={{
            marginTop:
              20,
          }}
        >
          <h2>
            新增防治作業
          </h2>

          <div
            style={{
              marginBottom:
                16,
              padding:
                12,
              borderRadius:
                8,
              background:
                '#f0f9ff',
              color:
                '#075985',
            }}
          >
            每次上傳都會建立一筆全新紀錄，不會自動覆蓋任何舊表單或照片。
          </div>

          <div
            style={{
              display:
                'grid',
              gridTemplateColumns:
                'repeat(auto-fit,minmax(240px,1fr))',
              gap:
                14,
            }}
          >
            <div
              className="field"
            >
              <label>
                停車場
              </label>

              <select
                value={
                  selectedLotId
                }
                disabled
              >
                {!selectedLotId && (
                  <option value="">
                    尚未選擇
                  </option>
                )}

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
                作業日期
              </label>

              <input
                type="date"
                value={
                  workDate
                }
                onChange={(
                  event
                ) =>
                  setWorkDate(
                    event
                      .target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
              <label>
                防治表單
              </label>

              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                onChange={(
                  event
                ) =>
                  setFormFile(
                    event
                      .target
                      .files?.[0] ||
                      null
                  )
                }
              />

              {formFile && (
                <div
                  className="muted"
                  style={{
                    marginTop:
                      6,
                  }}
                >
                  已選擇：
                  {
                    formFile.name
                  }
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              marginTop:
                18,
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
                gap:
                  10,
                flexWrap:
                  'wrap',
              }}
            >
              <div>
                <strong>
                  佐證照片
                </strong>

                <div
                  className="muted"
                >
                  每筆必須上傳 5 張
                </div>
              </div>

              <label
                className="btn"
                style={{
                  cursor:
                    'pointer',
                }}
              >
                ＋選擇照片

                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={
                    selectPhotos
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
                  'repeat(auto-fit,minmax(160px,1fr))',
                gap:
                  12,
                marginTop:
                  14,
              }}
            >
              {photos.map(
                (
                  file,
                  index
                ) => (
                  <div
                    key={`${file.name}-${file.lastModified}-${index}`}
                    style={{
                      border:
                        '1px solid #cbd5e1',
                      borderRadius:
                        8,
                      padding:
                        8,
                    }}
                  >
                    <img
                      src={
                        URL.createObjectURL(
                          file
                        )
                      }
                      alt={`照片 ${index + 1}`}
                      style={{
                        width:
                          '100%',
                        height:
                          140,
                        objectFit:
                          'cover',
                      }}
                    />

                    <div
                      style={{
                        marginTop:
                          6,
                      }}
                    >
                      照片{' '}
                      {index + 1}
                    </div>

                    <div
                      className="muted"
                      style={{
                        fontSize:
                          12,
                        overflow:
                          'hidden',
                        textOverflow:
                          'ellipsis',
                        whiteSpace:
                          'nowrap',
                      }}
                    >
                      {
                        file.name
                      }
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        removePhoto(
                          index
                        )
                      }
                      style={{
                        marginTop:
                          6,
                      }}
                    >
                      移除
                    </button>
                  </div>
                )
              )}
            </div>

            <div
              className="muted"
              style={{
                marginTop:
                  8,
              }}
            >
              已選{' '}
              {photos.length}{' '}
              / 5 張
            </div>
          </div>

          <div
            className="field"
            style={{
              marginTop:
                16,
            }}
          >
            <label>
              備註
            </label>

            <textarea
              value={
                notes
              }
              onChange={(
                event
              ) =>
                setNotes(
                  event
                    .target
                    .value
                )
              }
              rows={
                3
              }
            />
          </div>

          <button
            type="submit"
            className="btn"
            disabled={
              saving ||
              !selectedLotId
            }
          >
            {saving
              ? '上傳中…'
              : '新增登革熱防治紀錄'}
          </button>

          {message && (
            <div
              style={{
                marginTop:
                  14,
                padding:
                  10,
                borderRadius:
                  8,
                background:
                  message.includes(
                    '完成'
                  )
                    ? '#ecfdf5'
                    : '#f8fafc',
              }}
            >
              {
                message
              }
            </div>
          )}
        </div>
      </form>

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
            gap:
              12,
            flexWrap:
              'wrap',
          }}
        >
          <h2
            style={{
              margin:
                0,
            }}
          >
            歷史紀錄
          </h2>

          <span
            className="muted"
          >
            共{' '}
            {records.length}{' '}
            筆
          </span>
        </div>

        <div
          style={{
            overflowX:
              'auto',
            marginTop:
              14,
          }}
        >
          <table
            className="table"
            style={{
              minWidth:
                1050,
            }}
          >
            <thead>
              <tr>
                <th>
                  作業日期
                </th>

                <th>
                  停車場
                </th>

                <th>
                  表單
                </th>

                <th>
                  照片
                </th>

                <th>
                  一鍵下載
                </th>

                <th>
                  備註
                </th>

                <th>
                  上傳時間
                </th>

                <th>
                  操作
                </th>
              </tr>
            </thead>

            <tbody>
              {records.map(
                (
                  record
                ) => (
                  <tr
                    key={
                      record.id
                    }
                  >
                    <td>
                      {
                        record.work_date
                      }
                    </td>

                    <td>
                      {currentLot?.name ||
                        '-'}
                    </td>

                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          openForm(
                            record
                          )
                        }
                      >
                        查看表單
                      </button>
                    </td>

                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          openPhotos(
                            record.id
                          )
                        }
                      >
                        查看照片
                      </button>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          downloadPhotosZip(
                            record
                          )
                        }
                        disabled={
                          Boolean(
                            downloadingRecordId
                          )
                        }
                      >
                        {downloadingRecordId ===
                        record.id
                          ? '壓縮中…'
                          : '下載全部照片 ZIP'}
                      </button>
                    </td>

                    <td>
                      {record.notes ||
                        '-'}
                    </td>

                    <td>
                      {new Date(
                        record.created_at
                      ).toLocaleString(
                        'zh-TW'
                      )}
                    </td>

                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          deleteRecord(
                            record
                          )
                        }
                        style={{
                          color:
                            '#dc2626',
                        }}
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                )
              )}

              {!loading &&
                records.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={
                        8
                      }
                      style={{
                        textAlign:
                          'center',
                        padding:
                          24,
                      }}
                    >
                      目前沒有登革熱防治紀錄
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