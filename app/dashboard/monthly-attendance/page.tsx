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
      now.getMonth() -
        1,
      1
    )

  const year =
    date.getFullYear()

  const month =
    String(
      date.getMonth() +
        1
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
  if (
    !value
  ) {
    return '-'
  }

  return value.slice(
    0,
    7
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

  const existingRow =
    useMemo(
      () =>
        rows.find(
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

      const ext =
        file.name
          .split('.')
          .pop() ||
        'file'

      const storagePath =
        `${selectedLotId}/${month}/attendance_${Date.now()}.${ext}`

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

      if (
        existingRow
      ) {
        await supabase
          .storage
          .from(
            'monthly-attendance'
          )
          .remove([
            existingRow.storage_path,
          ])

        const {
          error:
            updateError,
        } =
          await supabase
            .from(
              'monthly_attendance_sheets'
            )
            .update({
              storage_path:
                storagePath,

              file_name:
                file.name,

              uploaded_by:
                user.id,

              uploaded_at:
                new Date()
                  .toISOString(),

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              'id',
              existingRow.id
            )
            .eq(
              'parking_lot_id',
              selectedLotId
            )

        if (
          updateError
        ) {
          setMessage(
            `簽到表更新失敗：${updateError.message}`
          )
          return
        }

        setMessage(
          `${month} 簽到表已重新上傳`
        )
      } else {
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
          setMessage(
            `簽到表紀錄建立失敗：${insertError.message}`
          )
          return
        }

        setMessage(
          `${month} 簽到表上傳完成`
        )
      }

      setFile(
        null
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
    if (
      !window.confirm(
        `確定刪除 ${displayMonth(row.attendance_month)} 的簽到表？`
      )
    ) {
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

    const {
      error,
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
      error
    ) {
      setMessage(
        `刪除失敗：${error.message}`
      )
      return
    }

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
          <h2>
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
                ) =>
                  setMonth(
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
                簽到表檔案
              </label>

              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx"
                onChange={(
                  event
                ) =>
                  setFile(
                    event
                      .target
                      .files?.[0] ||
                      null
                  )
                }
              />
            </div>
          </div>

          {existingRow && (
            <div
              style={{
                marginTop:
                  14,
                padding:
                  12,
                borderRadius:
                  8,
                background:
                  '#fffbeb',
                color:
                  '#92400e',
              }}
            >
              {month} 已有簽到表，本次上傳會取代原檔。
            </div>
          )}

          {file && (
            <div
              className="muted"
              style={{
                marginTop:
                  10,
              }}
            >
              已選擇：
              {file.name}
            </div>
          )}

          <button
            type="submit"
            className="btn"
            disabled={
              saving ||
              !selectedLotId
            }
            style={{
              marginTop:
                16,
            }}
          >
            {saving
              ? '上傳中…'
              : existingRow
                ? '重新上傳簽到表'
                : '上傳簽到表'}
          </button>

          {message && (
            <div
              style={{
                marginTop:
                  14,
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
        <h2>
          歷史簽到表
        </h2>

        <div
          style={{
            overflowX:
              'auto',
          }}
        >
          <table
            className="table"
            style={{
              minWidth:
                800,
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

                    <td>
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