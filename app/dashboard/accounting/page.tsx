'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import { createClient } from '@/lib/supabase/client'

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
  uploaded_at: string
}

type RentalRow = {
  id: string
  parking_lot_id: string
  customer_code: string | null
  customer_name: string | null
  phone: string | null
  vehicle_plate: string | null
  vehicle_type: string | null
  rental_type: string | null
  start_date: string | null
  end_date: string | null
  monthly_fee: number | null
  payment_status: string | null
  payment_date: string | null
  invoice_number: string | null
  rental_status: string | null
  notes: string | null
  updated_at: string | null
}

type ChangeRow = {
  id: string
  parking_lot_id: string
  monthly_rental_id: string | null
  customer_code: string | null
  customer_name: string | null
  phone: string | null
  vehicle_plate: string | null
  vehicle_type: string | null
  rental_type: string | null
  change_type: string
  effective_date: string | null
  reason: string | null
  change_detail: string | null
  source: string | null
  created_at: string
}

function currentMonthText() {
  const now =
    new Date()

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(
    2,
    '0'
  )}`
}

function monthStart(
  month: string
) {
  return `${month}-01`
}

function nextMonthStart(
  month: string
) {
  const [
    yearText,
    monthText,
  ] =
    month.split('-')

  const date =
    new Date(
      Number(
        yearText
      ),
      Number(
        monthText
      ),
      1
    )

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(
    2,
    '0'
  )}-01`
}

function safeFileName(
  value: string
) {
  return String(
    value ||
      ''
  )
    .replace(
      /[\\/:*?"<>|]/g,
      '_'
    )
    .replace(
      /\s+/g,
      '_'
    )
    .trim()
}

function safeSheetName(
  value: string,
  fallback: string
) {
  const result =
    String(
      value ||
        fallback
    )
      .replace(
        /[\\/*?:[\]]/g,
        '_'
      )
      .slice(
        0,
        31
      )

  return (
    result ||
    fallback
  )
}

function vehicleTypeText(
  value?: string | null
) {
  if (
    value ===
      'car' ||
    value ===
      '汽車'
  ) {
    return '汽車'
  }

  if (
    value ===
      'motorcycle' ||
    value ===
      '機車'
  ) {
    return '機車'
  }

  if (
    value ===
      'heavy_motorcycle' ||
    value ===
      '重機'
  ) {
    return '重機'
  }

  return (
    value ||
    ''
  )
}

function rentalStatusText(
  value?: string | null
) {
  if (
    value ===
    'active'
  ) {
    return '有效'
  }

  if (
    value ===
    'cancelled'
  ) {
    return '已退租'
  }

  if (
    value ===
    'inactive'
  ) {
    return '停用'
  }

  return (
    value ||
    ''
  )
}

function paymentStatusText(
  value?: string | null
) {
  if (
    value ===
    'paid'
  ) {
    return '已繳'
  }

  if (
    value ===
    'unpaid'
  ) {
    return '未繳'
  }

  return (
    value ||
    ''
  )
}

function changeTypeText(
  value: string
) {
  if (
    value ===
    'joined'
  ) {
    return '新增'
  }

  if (
    value ===
    'cancelled'
  ) {
    return '退租'
  }

  return value
}

function saveBlob(
  blob: Blob,
  fileName: string
) {
  const url =
    URL.createObjectURL(
      blob
    )

  const link =
    document.createElement(
      'a'
    )

  link.href =
    url

  link.download =
    fileName

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
}

export default function AccountingReportCenterPage() {
  const supabase =
    createClient()

  const db =
    supabase as any

  const [
    month,
    setMonth,
  ] =
    useState(
      currentMonthText()
    )

  const [
    parkingLots,
    setParkingLots,
  ] =
    useState<
      ParkingLot[]
    >([])

  const [
    attendanceRows,
    setAttendanceRows,
  ] =
    useState<
      AttendanceRow[]
    >([])

  const [
    changes,
    setChanges,
  ] =
    useState<
      ChangeRow[]
    >([])

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    accessDenied,
    setAccessDenied,
  ] =
    useState(false)

  const [
    attendanceDownloading,
    setAttendanceDownloading,
  ] =
    useState(false)

  const [
    rentalDownloading,
    setRentalDownloading,
  ] =
    useState(false)

  const [
    changeDownloading,
    setChangeDownloading,
  ] =
    useState(false)

  const [
    message,
    setMessage,
  ] =
    useState('')

  useEffect(() => {
    loadInitial()
  }, [])

  useEffect(() => {
    if (
      !loading &&
      !accessDenied
    ) {
      loadMonthData()
    }
  }, [
    month,
  ])

  async function loadInitial() {
    setLoading(true)
    setMessage('')

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
        setAccessDenied(
          true
        )

        setMessage(
          '登入狀態失效，請重新登入。'
        )

        return
      }

      const {
        data:
          profile,
        error:
          profileError,
      } =
        await db
          .from(
            'profiles'
          )
          .select(
            'id, role, is_active'
          )
          .eq(
            'id',
            user.id
          )
          .maybeSingle()

      if (
        profileError
      ) {
        setAccessDenied(
          true
        )

        setMessage(
          `權限讀取失敗：${profileError.message}`
        )

        return
      }

      if (
        !profile ||
        !profile.is_active ||
        (
          profile.role !==
            'accountant' &&
          profile.role !==
            'supervisor'
        )
      ) {
        setAccessDenied(
          true
        )

        setMessage(
          '此帳號沒有會計報表中心權限。'
        )

        return
      }

      const {
        data:
          lots,
        error:
          lotsError,
      } =
        await db
          .from(
            'parking_lots'
          )
          .select(
            'id, name'
          )
          .order(
            'name'
          )

      if (
        lotsError
      ) {
        setMessage(
          `停車場讀取失敗：${lotsError.message}`
        )

        return
      }

      setParkingLots(
        (
          lots ||
          []
        ) as ParkingLot[]
      )

      await loadMonthData()
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '報表中心載入失敗'
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  async function loadMonthData() {
    setMessage('')

    const start =
      monthStart(
        month
      )

    const next =
      nextMonthStart(
        month
      )

    const {
      data:
        attendanceData,
      error:
        attendanceError,
    } =
      await db
        .from(
          'monthly_attendance_sheets'
        )
        .select(`
          id,
          parking_lot_id,
          attendance_month,
          storage_path,
          file_name,
          uploaded_at
        `)
        .eq(
          'attendance_month',
          start
        )
        .order(
          'uploaded_at',
          {
            ascending:
              false,
          }
        )

    if (
      attendanceError
    ) {
      setMessage(
        `簽到表讀取失敗：${attendanceError.message}`
      )

      return
    }

    setAttendanceRows(
      (
        attendanceData ||
        []
      ) as AttendanceRow[]
    )

    const {
      data:
        changeData,
      error:
        changeError,
    } =
      await db
        .from(
          'monthly_rental_changes'
        )
        .select(`
          id,
          parking_lot_id,
          monthly_rental_id,
          customer_code,
          customer_name,
          phone,
          vehicle_plate,
          vehicle_type,
          rental_type,
          change_type,
          effective_date,
          reason,
          change_detail,
          source,
          created_at
        `)
        .in(
          'change_type',
          [
            'joined',
            'cancelled',
          ]
        )
        .gte(
          'effective_date',
          start
        )
        .lt(
          'effective_date',
          next
        )
        .order(
          'effective_date',
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
      changeError
    ) {
      setMessage(
        `簽約異動讀取失敗：${changeError.message}`
      )

      return
    }

    setChanges(
      (
        changeData ||
        []
      ) as ChangeRow[]
    )
  }

  const lotNameMap =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            string
          >()

        parkingLots.forEach(
          (
            lot
          ) => {
            map.set(
              lot.id,
              lot.name
            )
          }
        )

        return map
      },
      [
        parkingLots,
      ]
    )

  const attendanceLotCount =
    useMemo(
      () =>
        new Set(
          attendanceRows.map(
            (
              row
            ) =>
              row.parking_lot_id
          )
        ).size,
      [
        attendanceRows,
      ]
    )

  const joinedCount =
    changes.filter(
      (
        row
      ) =>
        row.change_type ===
        'joined'
    ).length

  const cancelledCount =
    changes.filter(
      (
        row
      ) =>
        row.change_type ===
        'cancelled'
    ).length

  async function downloadAttendanceZip() {
    if (
      attendanceDownloading
    ) {
      return
    }

    if (
      attendanceRows.length ===
      0
    ) {
      setMessage(
        `${month} 沒有任何已上傳的簽到表。`
      )

      return
    }

    setAttendanceDownloading(
      true
    )

    setMessage(
      '正在下載簽到表並建立 ZIP，請勿關閉頁面…'
    )

    try {
      const JSZip =
        (
          await import(
            'jszip'
          )
        ).default

      const zip =
        new JSZip()

      const usedNames =
        new Set<
          string
        >()

      for (
        let index = 0;
        index <
        attendanceRows.length;
        index++
      ) {
        const row =
          attendanceRows[
            index
          ]

        const lotName =
          safeFileName(
            lotNameMap.get(
              row.parking_lot_id
            ) ||
              '未知停車場'
          )

        const {
          data:
            fileBlob,
          error:
            downloadError,
        } =
          await supabase
            .storage
            .from(
              'monthly-attendance'
            )
            .download(
              row.storage_path
            )

        if (
          downloadError ||
          !fileBlob
        ) {
          throw new Error(
            `${lotName}／${row.file_name} 下載失敗：${
              downloadError?.message ||
              '未知錯誤'
            }`
          )
        }

        let fileName =
          safeFileName(
            row.file_name
          )

        let fullPath =
          `${lotName}/${fileName}`

        if (
          usedNames.has(
            fullPath
          )
        ) {
          fileName =
            `${String(
              index + 1
            ).padStart(
              2,
              '0'
            )}_${fileName}`

          fullPath =
            `${lotName}/${fileName}`
        }

        usedNames.add(
          fullPath
        )

        zip.file(
          fullPath,
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

      saveBlob(
        zipBlob,
        `${month}_所有停車場_簽到表.zip`
      )

      setMessage(
        `${month} 簽到表 ZIP 已完成，共 ${attendanceRows.length} 份檔案。`
      )
    } catch (
      error: any
    ) {
      setMessage(
        `簽到表下載失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setAttendanceDownloading(
        false
      )
    }
  }

  async function downloadLatestMonthlyRentals() {
    if (
      rentalDownloading
    ) {
      return
    }

    setRentalDownloading(
      true
    )

    setMessage(
      '正在讀取目前最新月租資料並製作 Excel…'
    )

    try {
      const {
        data,
        error,
      } =
        await db
          .from(
            'monthly_rentals'
          )
          .select(`
            id,
            parking_lot_id,
            customer_code,
            customer_name,
            phone,
            vehicle_plate,
            vehicle_type,
            rental_type,
            start_date,
            end_date,
            monthly_fee,
            payment_status,
            payment_date,
            invoice_number,
            rental_status,
            notes,
            updated_at
          `)
          .order(
            'parking_lot_id'
          )
          .order(
            'customer_name'
          )

      if (
        error
      ) {
        throw new Error(
          error.message
        )
      }

      /*
       * 最新月租名單只放目前仍在租用中的資料。
       * 已退租者會出現在「簽約異動」報表。
       */
      const rentals =
        (
          data ||
          []
        ).filter(
          (
            row: RentalRow
          ) =>
            row.rental_status !==
            'cancelled'
        ) as RentalRow[]

      const XLSX =
        await import(
          'xlsx'
        )

      const workbook =
        XLSX.utils.book_new()

      function mapRental(
        row: RentalRow
      ) {
        return {
          停車場:
            lotNameMap.get(
              row.parking_lot_id
            ) ||
            '',

          客戶編號:
            row.customer_code ||
            '',

          姓名:
            row.customer_name ||
            '',

          電話:
            row.phone ||
            '',

          車牌:
            row.vehicle_plate ||
            '',

          車種:
            vehicleTypeText(
              row.vehicle_type
            ),

          月租類型:
            row.rental_type ||
            '',

          起租日:
            row.start_date ||
            '',

          到期日:
            row.end_date ||
            '',

          月租金額:
            Number(
              row.monthly_fee ||
              0
            ),

          付款狀態:
            paymentStatusText(
              row.payment_status
            ),

          付款日期:
            row.payment_date ||
            '',

          發票號碼:
            row.invoice_number ||
            '',

          租用狀態:
            rentalStatusText(
              row.rental_status
            ),

          備註:
            row.notes ||
            '',

          資料更新時間:
            row.updated_at
              ? new Date(
                  row.updated_at
                ).toLocaleString(
                  'zh-TW'
                )
              : '',
        }
      }

      const allRows =
        rentals.map(
          mapRental
        )

      const allSheet =
        XLSX.utils.json_to_sheet(
          allRows
        )

      XLSX.utils.book_append_sheet(
        workbook,
        allSheet,
        '全部月租'
      )

      const usedSheetNames =
        new Set<string>([
          '全部月租',
        ])

      for (
        const lot of
        parkingLots
      ) {
        const lotRows =
          rentals
            .filter(
              (
                row
              ) =>
                row.parking_lot_id ===
                lot.id
            )
            .map(
              mapRental
            )

        if (
          lotRows.length ===
          0
        ) {
          continue
        }

        let sheetName =
          safeSheetName(
            lot.name,
            '停車場'
          )

        let suffix =
          2

        while (
          usedSheetNames.has(
            sheetName
          )
        ) {
          const suffixText =
            `_${suffix}`

          sheetName =
            `${safeSheetName(
              lot.name,
              '停車場'
            ).slice(
              0,
              31 -
                suffixText.length
            )}${suffixText}`

          suffix++
        }

        usedSheetNames.add(
          sheetName
        )

        const sheet =
          XLSX.utils.json_to_sheet(
            lotRows
          )

        XLSX.utils.book_append_sheet(
          workbook,
          sheet,
          sheetName
        )
      }

      const generatedAt =
        new Date()

      const dateText =
        `${generatedAt.getFullYear()}-${String(
          generatedAt.getMonth() +
            1
        ).padStart(
          2,
          '0'
        )}-${String(
          generatedAt.getDate()
        ).padStart(
          2,
          '0'
        )}`

      XLSX.writeFile(
        workbook,
        `${dateText}_所有停車場_最新月租名單.xlsx`
      )

      setMessage(
        `最新月租名單 Excel 已完成，共 ${rentals.length} 筆。下載內容為按下按鈕當下的最新資料。`
      )
    } catch (
      error: any
    ) {
      setMessage(
        `月租名單下載失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setRentalDownloading(
        false
      )
    }
  }

  async function downloadContractChanges() {
    if (
      changeDownloading
    ) {
      return
    }

    if (
      changes.length ===
      0
    ) {
      setMessage(
        `${month} 沒有新增或退租異動。`
      )

      return
    }

    setChangeDownloading(
      true
    )

    setMessage(
      '正在製作簽約異動 Excel…'
    )

    try {
      const XLSX =
        await import(
          'xlsx'
        )

      const workbook =
        XLSX.utils.book_new()

      function mapChange(
        row: ChangeRow
      ) {
        return {
          異動類型:
            changeTypeText(
              row.change_type
            ),

          異動日期:
            row.effective_date ||
            row.created_at.slice(
              0,
              10
            ),

          停車場:
            lotNameMap.get(
              row.parking_lot_id
            ) ||
            '',

          客戶編號:
            row.customer_code ||
            '',

          姓名:
            row.customer_name ||
            '',

          電話:
            row.phone ||
            '',

          車牌:
            row.vehicle_plate ||
            '',

          車種:
            vehicleTypeText(
              row.vehicle_type
            ),

          月租類型:
            row.rental_type ||
            '',

          異動說明:
            row.change_detail ||
            '',

          原因:
            row.reason ||
            '',

          來源:
            row.source ||
            '',
        }
      }

      const allRows =
        changes.map(
          mapChange
        )

      const joinedRows =
        changes
          .filter(
            (
              row
            ) =>
              row.change_type ===
              'joined'
          )
          .map(
            mapChange
          )

      const cancelledRows =
        changes
          .filter(
            (
              row
            ) =>
              row.change_type ===
              'cancelled'
          )
          .map(
            mapChange
          )

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          allRows
        ),
        '全部異動'
      )

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          joinedRows
        ),
        '新增'
      )

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          cancelledRows
        ),
        '退租'
      )

      XLSX.writeFile(
        workbook,
        `${month}_所有停車場_簽約異動.xlsx`
      )

      setMessage(
        `${month} 簽約異動 Excel 已完成：新增 ${joinedCount} 筆、退租 ${cancelledCount} 筆。`
      )
    } catch (
      error: any
    ) {
      setMessage(
        `簽約異動下載失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setChangeDownloading(
        false
      )
    }
  }

  if (
    accessDenied
  ) {
    return (
      <div className="card">
        <h1>
          報表中心
        </h1>

        <p
          style={{
            color:
              '#b91c1c',
            fontWeight:
              700,
          }}
        >
          {
            message
          }
        </p>
      </div>
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
          會計報表中心
        </h1>

        <p
          className="muted"
          style={{
            marginTop:
              0,
          }}
        >
          統一下載所有停車場的簽到表、最新月租名單與簽約新增／退租異動。
        </p>
      </div>

      <div
        className="card"
        style={{
          marginTop:
            18,
        }}
      >
        <div
          style={{
            display:
              'flex',
            gap:
              14,
            alignItems:
              'end',
            flexWrap:
              'wrap',
          }}
        >
          <div
            className="field"
            style={{
              minWidth:
                220,
            }}
          >
            <label>
              報表月份
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

          <button
            type="button"
            onClick={
              loadMonthData
            }
            disabled={
              loading
            }
          >
            重新整理本月資料
          </button>
        </div>
      </div>

      <div
        style={{
          display:
            'grid',
          gridTemplateColumns:
            'repeat(auto-fit,minmax(280px,1fr))',
          gap:
            16,
          marginTop:
            18,
        }}
      >
        <div className="card">
          <h2
            style={{
              marginTop:
                0,
            }}
          >
            每月簽到表
          </h2>

          <div
            style={{
              fontSize:
                30,
              fontWeight:
                800,
              margin:
                '8px 0',
            }}
          >
            {
              attendanceRows.length
            }{' '}
            份
          </div>

          <div className="muted">
            已上傳停車場：
            {
              attendanceLotCount
            }{' '}
            間
          </div>

          <div
            className="muted"
            style={{
              marginTop:
                4,
            }}
          >
            月份：
            {
              month
            }
          </div>

          <button
            type="button"
            className="btn"
            onClick={
              downloadAttendanceZip
            }
            disabled={
              attendanceDownloading ||
              attendanceRows.length ===
                0
            }
            style={{
              marginTop:
                16,
            }}
          >
            {attendanceDownloading
              ? '正在建立 ZIP…'
              : '下載本月全部簽到表 ZIP'}
          </button>
        </div>

        <div className="card">
          <h2
            style={{
              marginTop:
                0,
            }}
          >
            最新月租名單
          </h2>

          <div
            style={{
              marginTop:
                12,
              lineHeight:
                1.7,
            }}
          >
            直接讀取月租管理目前最新資料，不使用快照。
          </div>

          <div
            className="muted"
            style={{
              marginTop:
                8,
            }}
          >
            建議每月 25 日由會計下載一次作帳版本。
          </div>

          <button
            type="button"
            className="btn"
            onClick={
              downloadLatestMonthlyRentals
            }
            disabled={
              rentalDownloading
            }
            style={{
              marginTop:
                16,
            }}
          >
            {rentalDownloading
              ? '正在製作 Excel…'
              : '下載最新月租名單 Excel'}
          </button>
        </div>

        <div className="card">
          <h2
            style={{
              marginTop:
                0,
            }}
          >
            簽約異動
          </h2>

          <div
            style={{
              display:
                'flex',
              gap:
                18,
              marginTop:
                12,
            }}
          >
            <div>
              <div
                className="muted"
              >
                新增
              </div>

              <div
                style={{
                  fontSize:
                    26,
                  fontWeight:
                    800,
                }}
              >
                {
                  joinedCount
                }
              </div>
            </div>

            <div>
              <div
                className="muted"
              >
                退租
              </div>

              <div
                style={{
                  fontSize:
                    26,
                  fontWeight:
                    800,
                }}
              >
                {
                  cancelledCount
                }
              </div>
            </div>
          </div>

          <div
            className="muted"
            style={{
              marginTop:
                8,
            }}
          >
            僅包含新增與退租，不包含一般資料修改與續租日期異動。
          </div>

          <button
            type="button"
            className="btn"
            onClick={
              downloadContractChanges
            }
            disabled={
              changeDownloading ||
              changes.length ===
                0
            }
            style={{
              marginTop:
                16,
            }}
          >
            {changeDownloading
              ? '正在製作 Excel…'
              : '下載本月簽約異動 Excel'}
          </button>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop:
            18,
        }}
      >
        <h2
          style={{
            marginTop:
              0,
          }}
        >
          {month} 簽到表上傳狀況
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
                760,
            }}
          >
            <thead>
              <tr>
                <th>
                  停車場
                </th>

                <th>
                  檔名
                </th>

                <th>
                  上傳時間
                </th>
              </tr>
            </thead>

            <tbody>
              {attendanceRows.map(
                (
                  row
                ) => (
                  <tr
                    key={
                      row.id
                    }
                  >
                    <td>
                      {lotNameMap.get(
                        row.parking_lot_id
                      ) ||
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
                  </tr>
                )
              )}

              {!loading &&
                attendanceRows.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={
                        3
                      }
                      style={{
                        textAlign:
                          'center',
                        padding:
                          24,
                      }}
                    >
                      本月份尚未上傳任何簽到表
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {message && (
        <div
          className="card"
          style={{
            marginTop:
              16,
            whiteSpace:
              'pre-wrap',
          }}
        >
          {
            message
          }
        </div>
      )}
    </div>
  )
}