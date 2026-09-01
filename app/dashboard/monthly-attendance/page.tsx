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

type AttendanceRow = {
  id: string
  parking_lot_id: string
  attendance_month: string
  storage_path: string
  file_name: string
  uploaded_by: string | null
  uploaded_at: string
  updated_at: string
}

function previousMonthText() {
  const now =
    new Date()

  const date =
    new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    )

  const year =
    date.getFullYear()

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      '0'
    )

  return `${year}-${month}`
}

function monthToDate(
  month: string
) {
  return `${month}-01`
}

function displayMonth(
  value: string
) {
  if (!value) {
    return '-'
  }

  return value.slice(
    0,
    7
  )
}

function normalizeFileName(
  value: string
) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase()
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

export default function MonthlyAttendancePage() {
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
    month,
    setMonth,
  ] =
    useState(
      previousMonthText()
    )

  const [
    file,
    setFile,
  ] =
    useState<
      File | null
    >(null)

  const [
    rows,
    setRows,
  ] =
    useState<
      AttendanceRow[]
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
      loadRows(
        selectedLotId
      )
    } else {
      setRows([])
    }
  }, [
    selectedLotId,
  ])

  async function loadParkingLots() {
    setLoading(true)
    setMessage('')

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

      setLoading(false)

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

    setLoading(false)
  }

  async function loadRows(
    lotId: string
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          'monthly_attendance_sheets'
        )
        .select(`
          id,
          parking_lot_id,
          attendance_month,
          storage_path,
          file_name,
          uploaded_by,
          uploaded_at,
          updated_at
        `)
        .eq(
          'parking_lot_id',
          lotId
        )
        .order(
          'attendance_month',
          {
            ascending:
              false,
          }
        )
        .order(
          'uploaded_at',
          {
            ascending:
              false,
          }
        )

    if (
      error
    ) {
      setMessage(
        `簽到表讀取失敗：${error.message}`
      )

      return
    }

    setRows(
      (
        data ||
        []
      ) as AttendanceRow[]
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

  const duplicateRow =
    useMemo(
      () => {
        if (
          !file ||
          !month
        ) {
          return undefined
        }

        const targetName =
          normalizeFileName(
            file.name
          )

        return rows.find(
          (
            row
          ) =>
            row.attendance_month.slice(
              0,
              7
            ) ===
              month &&
            normalizeFileName(
              row.file_name
            ) ===
              targetName
        )
      },
      [
        rows,
        month,
        file,
      ]
    )

  const monthRows =
    useMemo(
      () =>
        rows.filter(
          (
            row
          ) =>
            row.attendance_month.slice(
              0,
              7
            ) ===
            month
        ),
      [
        rows,
        month,
      ]
    )

  async function saveAttendance(
    event: FormEvent
  ) {
    event.preventDefault()

    if (
      saving
    ) {
      return
    }

    setMessage('')

    if (
      !selectedLotId
    ) {
      setMessage(
        '請先選擇目前工作停車場'
      )

      return
    }

    if (
      !month
    ) {
      setMessage(
        '請選擇簽到月份'
      )

      return
    }

    if (
      !file
    ) {
      setMessage(
        '請選擇簽到表檔案'
      )

      return
    }

    if (
      duplicateRow
    ) {
      setMessage(
        `此月份已存在相同檔名「${file.name}」，系統已取消上傳，不會覆蓋舊檔案。`
      )

      return
    }

    setSaving(true)

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
       * 上傳前再查一次資料庫，
       * 避免多人或多支手機同時操作。
       */
      const {
        data:
          duplicateData,
        error:
          duplicateError,
      } =
        await supabase
          .from(
            'monthly_attendance_sheets'
          )
          .select(
            'id, file_name'
          )
          .eq(
            'parking_lot_id',
            selectedLotId
          )
          .eq(
            'attendance_month',
            monthToDate(
              month
            )
          )

      if (
        duplicateError
      ) {
        setMessage(
          `重複檢查失敗：${duplicateError.message}`
        )

        return
      }

      const alreadyExists =
        (
          duplicateData ||
          []
        ).some(
          (
            item: any
          ) =>
            normalizeFileName(
              item.file_name
            ) ===
            normalizeFileName(
              file.name
            )
        )

      if (
        alreadyExists
      ) {
        setMessage(
          `此月份已存在相同檔名「${file.name}」，系統已阻止重複上傳。`
        )

        return
      }

      const ext =
        file.name
          .split('.')
          .pop() ||
        'file'

      /*
       * 手機相容 UUID。
       * Storage 實體檔名使用 UUID，
       * 不會因為原始檔名相同而覆蓋。
       */
      const fileId =
        createUuid()

      const storagePath =
        `${selectedLotId}/${month}/${fileId}.${ext}`

      const {
        error:
          uploadError,
      } =
        await supabase
          .storage
          .from(
            'monthly-attendance'
          )
          .upload(
            storagePath,
            file,
            {
              upsert:
                false,
            }
          )

      if (
        uploadError
      ) {
        setMessage(
          `簽到表上傳失敗：${uploadError.message}`
        )

        return
      }

      const {
        error:
          insertError,
      } =
        await supabase
          .from(
            'monthly_attendance_sheets'
          )
          .insert({
            parking_lot_id:
              selectedLotId,

            attendance_month:
              monthToDate(
                month
              ),

            storage_path:
              storagePath,

            file_name:
              file.name,

            uploaded_by:
              user.id,
          })

      if (
        insertError
      ) {
        /*
         * DB 寫入失敗：
         * 只刪除「本次剛上傳」的 Storage 檔。
         * 完全不碰舊檔。
         */
        await supabase
          .storage
          .from(
            'monthly-attendance'
          )
          .remove([
            storagePath,
          ])

        if (
          insertError.code ===
          '23505'
        ) {
          setMessage(
            `此月份已存在相同檔名「${file.name}」，系統已阻止重複上傳，原有檔案未受影響。`
          )
        } else {
          setMessage(
            `簽到表紀錄建立失敗：${insertError.message}`
          )
        }

        return
      }

      setFile(
        null
      )

      setMessage(
        `${month} 簽到表上傳完成，所有舊檔案均已保留。`
      )

      await loadRows(
        selectedLotId
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '上傳失敗'
      )
    } finally {
      setSaving(false)
    }
  }

  async function openAttendance(
    row: AttendanceRow
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .storage
        .from(
          'monthly-attendance'
        )
        .createSignedUrl(
          row.storage_path,
          60 * 10
        )

    if (
      error ||
      !data?.signedUrl
    ) {
      alert(
        error?.message ||
          '檔案開啟失敗'
      )

      return
    }

    window.open(
      data.signedUrl,
      '_blank'
    )
  }

  async function deleteAttendance(
    row: AttendanceRow
  ) {
    const confirmed =
      window.confirm(
        `確定要刪除這份簽到表？\n\n月份：${displayMonth(
          row.attendance_month
        )}\n檔名：${row.file_name}\n\n刪除後無法復原。`
      )

    if (
      !confirmed
    ) {
      return
    }

    /*
     * 先刪資料庫。
     * 成功後才刪 Storage。
     */
    const {
      error:
        deleteError,
    } =
      await supabase
        .from(
          'monthly_attendance_sheets'
        )
        .delete()
        .eq(
          'id',
          row.id
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

    await supabase
      .storage
      .from(
        'monthly-attendance'
      )
      .remove([
        row.storage_path,
      ])

    setMessage(
      `已刪除「${row.file_name}」`
    )

    await loadRows(
      selectedLotId
    )
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
          每月簽到表
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
            background:
              '#fffbeb',
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
          saveAttendance
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
              marginTop:
                0,
            }}
          >
            上傳簽到表
          </h2>

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
                簽到月份
              </label>

              <input
                type="month"
                value={
                  month
                }
                onChange={(
                  event
                ) => {
                  setMonth(
                    event
                      .target
                      .value
                  )

                  setMessage(
                    ''
                  )
                }}
              />
            </div>

            <div
              className="field"
            >
              <label>
                簽到表檔案
              </label>

              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx"
                onChange={(
                  event
                ) => {
                  const selected =
                    event
                      .target
                      .files?.[0] ||
                    null

                  setFile(
                    selected
                  )

                  setMessage(
                    ''
                  )
                }}
              />
            </div>
          </div>

          <div
            style={{
              marginTop:
                14,
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
            同一月份可以上傳多份簽到表。系統不會自動覆蓋任何舊檔案；只有同一停車場、同一月份、檔名相同時才會阻止重複上傳。
          </div>

          {monthRows.length >
            0 && (
            <div
              style={{
                marginTop:
                  10,
                color:
                  '#475569',
              }}
            >
              {month} 目前已有{' '}
              <strong>
                {
                  monthRows.length
                }
              </strong>{' '}
              份簽到表。
            </div>
          )}

          {file && (
            <div
              style={{
                marginTop:
                  12,
                padding:
                  12,
                borderRadius:
                  8,
                background:
                  duplicateRow
                    ? '#fee2e2'
                    : '#f8fafc',
                color:
                  duplicateRow
                    ? '#b91c1c'
                    : '#475569',
              }}
            >
              已選擇：
              <strong>
                {
                  file.name
                }
              </strong>

              {duplicateRow && (
                <div
                  style={{
                    marginTop:
                      8,
                    fontWeight:
                      700,
                  }}
                >
                  此月份已有相同檔名，系統不會覆蓋原檔。
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn"
            disabled={
              saving ||
              !selectedLotId ||
              !file ||
              Boolean(
                duplicateRow
              )
            }
            style={{
              marginTop:
                16,
            }}
          >
            {saving
              ? '上傳中…'
              : '新增簽到表'}
          </button>

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
                  message.includes(
                    '完成'
                  ) ||
                  message.includes(
                    '已刪除'
                  )
                    ? '#ecfdf5'
                    : '#fee2e2',
                color:
                  message.includes(
                    '完成'
                  ) ||
                  message.includes(
                    '已刪除'
                  )
                    ? '#166534'
                    : '#b91c1c',
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
            歷史簽到表
          </h2>

          <span
            className="muted"
          >
            共{' '}
            {
              rows.length
            }{' '}
            份
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
                900,
            }}
          >
            <thead>
              <tr>
                <th>
                  月份
                </th>

                <th>
                  停車場
                </th>

                <th>
                  檔名
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
              {rows.map(
                (
                  row
                ) => (
                  <tr
                    key={
                      row.id
                    }
                  >
                    <td>
                      {displayMonth(
                        row.attendance_month
                      )}
                    </td>

                    <td>
                      {currentLot?.name ||
                        '-'}
                    </td>

                    <td
                      style={{
                        fontWeight:
                          700,
                      }}
                    >
                      {
                        row.file_name
                      }
                    </td>

                    <td>
                      {new Date(
                        row.uploaded_at
                      ).toLocaleString(
                        'zh-TW'
                      )}
                    </td>

                    <td>
                      <div
                        style={{
                          display:
                            'flex',
                          gap:
                            8,
                          flexWrap:
                            'wrap',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            openAttendance(
                              row
                            )
                          }
                        >
                          查看
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            deleteAttendance(
                              row
                            )
                          }
                          style={{
                            color:
                              '#dc2626',
                          }}
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}

              {!loading &&
                rows.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={
                        5
                      }
                      style={{
                        textAlign:
                          'center',
                        padding:
                          24,
                      }}
                    >
                      目前沒有簽到表
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