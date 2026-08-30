'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ParkingLot = {
  id: string
  name: string
}

type PaymentRow = {
  fileName: string

  lotName: string
  dataMonth: string
  workstation: string

  sequenceNo: string
  ticketNo: string

  entryTime: string
  exitTime: string

  vehiclePlate: string
  rateName: string

  amountDue: number
  discountAmount: number
  amountPaid: number

  paymentMethod: string
  invoiceNumber: string

  paymentDate: string

  matched: boolean
  duplicate: boolean

  rentalId?: string
  parkingLotId?: string

  customerCode?: string
  customerName?: string
  phone?: string

  rentalStartDate?: string
  rentalEndDate?: string

  sourceReference?: string

  message: string
}

function text(value: any) {
  return String(value ?? '').trim()
}

function normalizePlate(value: any) {
  return text(value)
    .replace(/\s/g, '')
    .replace(/-/g, '')
    .toUpperCase()
}

function numberValue(value: any) {
  const valueText = text(value)
    .replace(/,/g, '')
    .replace(/\$/g, '')

  const result = Number(valueText)

  return Number.isFinite(result)
    ? result
    : 0
}

function toDate(value: string) {
  const match = text(value).match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/
  )

  if (!match) {
    return ''
  }

  return `${match[1]}-${match[2].padStart(
    2,
    '0'
  )}-${match[3].padStart(2, '0')}`
}

/*
 * 正確處理 CSV：
 *
 * - 逗號
 * - 雙引號
 * - 引號內換行
 * - "" 轉成 "
 */
function parseCsv(csvText: string) {
  const rows: string[][] = []

  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (
    let i = 0;
    i < csvText.length;
    i++
  ) {
    const char = csvText[i]
    const next = csvText[i + 1]

    if (char === '"') {
      if (
        inQuotes &&
        next === '"'
      ) {
        field += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }

      continue
    }

    if (
      char === ',' &&
      !inQuotes
    ) {
      row.push(field)
      field = ''
      continue
    }

    if (
      (
        char === '\n' ||
        char === '\r'
      ) &&
      !inQuotes
    ) {
      if (
        char === '\r' &&
        next === '\n'
      ) {
        i++
      }

      row.push(field)

      if (
        row.some(
          (item) =>
            item !== ''
        )
      ) {
        rows.push(row)
      }

      row = []
      field = ''

      continue
    }

    field += char
  }

  if (
    field.length > 0 ||
    row.length > 0
  ) {
    row.push(field)

    if (
      row.some(
        (item) =>
          item !== ''
      )
    ) {
      rows.push(row)
    }
  }

  return rows
}

async function readCsvFile(
  file: File
) {
  const buffer =
    await file.arrayBuffer()

  let result =
    new TextDecoder(
      'utf-8'
    ).decode(buffer)

  const badChars =
    (
      result.match(/�/g) ||
      []
    ).length

  if (badChars > 5) {
    try {
      result =
        new TextDecoder(
          'big5'
        ).decode(buffer)
    } catch {
      // 使用原本 UTF-8
    }
  }

  return result.replace(
    /^\uFEFF/,
    ''
  )
}

function extractTransactions(
  matrix: string[][],
  fileName: string
) {
  const result:
    PaymentRow[] = []

  for (const row of matrix) {
    /*
     * 目前報表資料位置：
     *
     * 3  停車場
     * 4  報表／交易明細名稱（不再作為月租判斷條件）
     * 6  工作站
     * 8  資料月份
     *
     * 26 序號
     * 27 票號
     * 28 入場時間
     * 29 出場時間
     * 30 車號
     * 31 費率
     *
     * 37 應收
     * 38 折扣
     * 39 實收
     * 40 付款方式
     * 42 發票
     */

    /*
     * 不再限制「費率」一定要叫做「月租續約」。
     *
     * 只要這一列具備交易明細的基本結構：
     * - 有車牌
     * - 有出場／交易時間
     * - 可以取得交易日期
     *
     * 就先納入候選資料。
     *
     * 後續仍會用「停車場 + 車牌」去比對目前有效月租，
     * 因此一般臨停交易若車牌不在月租名單內，
     * 只會顯示「未匹配」，不會被寫成已繳。
     */

    const rateName =
      text(row[31])

    const vehiclePlate =
      text(row[30])
        .replace(/\s/g, '')
        .toUpperCase()

    if (!vehiclePlate) {
      continue
    }

    const exitTime =
      text(row[29])

    const paymentDate =
      toDate(exitTime)

    if (
      !exitTime ||
      !paymentDate
    ) {
      continue
    }

    result.push({
      fileName,

      lotName:
        text(row[3]),

      dataMonth:
        text(row[8]),

      workstation:
        text(row[6]),

      sequenceNo:
        text(row[26]),

      ticketNo:
        text(row[27]),

      entryTime:
        text(row[28]),

      exitTime,

      vehiclePlate,

      rateName,

      amountDue:
        numberValue(
          row[37]
        ),

      discountAmount:
        numberValue(
          row[38]
        ),

      amountPaid:
        numberValue(
          row[39]
        ),

      paymentMethod:
        text(row[40]),

      invoiceNumber:
        text(row[42]),

      paymentDate,

      matched: false,
      duplicate: false,

      message: '',
    })
  }

  return result
}

function cleanLotName(
  value: string
) {
  return value
    .replace(
      /新北市/g,
      ''
    )
    .replace(
      /地下停車場/g,
      ''
    )
    .replace(
      /停車場/g,
      ''
    )
    .replace(
      /板橋區|三重區|汐止區|蘆洲區|新莊區|土城區|中和區|永和區|樹林區|林口區|五股區|泰山區|淡水區/g,
      ''
    )
    .replace(
      /\s/g,
      ''
    )
}

function findParkingLot(
  parkingLots: ParkingLot[],
  sourceName: string
) {
  const source =
    text(sourceName)

  if (!source) {
    return undefined
  }

  let lot =
    parkingLots.find(
      (item) =>
        item.name === source
    )

  if (lot) {
    return lot
  }

  lot =
    parkingLots.find(
      (item) =>
        item.name.includes(
          source
        ) ||
        source.includes(
          item.name
        )
    )

  if (lot) {
    return lot
  }

  const sourceClean =
    cleanLotName(
      source
    )

  return parkingLots.find(
    (item) => {
      const itemClean =
        cleanLotName(
          item.name
        )

      return (
        itemClean.includes(
          sourceClean
        ) ||
        sourceClean.includes(
          itemClean
        )
      )
    }
  )
}

/*
 * 建立繳費歷史唯一辨識碼。
 *
 * 同一張繳費交易重新匯入時，
 * source_reference 會一樣。
 */
function buildSourceReference(
  row: PaymentRow
) {
  return [
    'payment_csv',
    row.parkingLotId || '',
    row.ticketNo || '',
    normalizePlate(
      row.vehiclePlate
    ),
    row.exitTime || '',
    row.invoiceNumber || '',
    String(
      row.amountPaid || 0
    ),
  ].join('|')
}

export default function CsvImportButton({
  parkingLots,
}: {
  parkingLots: ParkingLot[]
}) {
  const inputRef =
    useRef<HTMLInputElement>(
      null
    )

  const [
    open,
    setOpen,
  ] =
    useState(false)

  const [
    reading,
    setReading,
  ] =
    useState(false)

  const [
    syncing,
    setSyncing,
  ] =
    useState(false)

  const [
    rows,
    setRows,
  ] =
    useState<
      PaymentRow[]
    >([])

  const [
    fileNames,
    setFileNames,
  ] =
    useState<
      string[]
    >([])

  const [
    message,
    setMessage,
  ] =
    useState('')

  async function readFiles(
    files: File[]
  ) {
    setReading(true)
    setRows([])
    setMessage('')

    try {
      let allRows:
        PaymentRow[] = []

      /*
       * =================================================
       * 1. 讀取所有 CSV
       * =================================================
       */

      for (
        const file of files
      ) {
        const csvText =
          await readCsvFile(
            file
          )

        const matrix =
          parseCsv(
            csvText
          )

        const transactions =
          extractTransactions(
            matrix,
            file.name
          )

        allRows = [
          ...allRows,
          ...transactions,
        ]
      }

      if (
        allRows.length === 0
      ) {
        setRows([])

        setMessage(
          '沒有找到可辨識的交易明細。請確認 CSV 內包含車牌、出場時間與交易資料。'
        )

        return
      }

      /*
       * =================================================
       * 2. 本次選擇檔案內重複檢查
       * =================================================
       */

      const seen =
        new Set<string>()

      allRows =
        allRows.map(
          (row) => {
            const key = [
              row.lotName,
              row.ticketNo,
              normalizePlate(
                row.vehiclePlate
              ),
              row.exitTime,
              row.invoiceNumber,
            ].join('|')

            if (
              seen.has(key)
            ) {
              return {
                ...row,

                duplicate: true,

                message:
                  '本次匯入重複',
              }
            }

            seen.add(key)

            return row
          }
        )

      const supabase =
        createClient()

      /*
       * =================================================
       * 3. 抓取目前所有停車場月租資料
       * =================================================
       */

      const rentalCache =
        new Map<
          string,
          any[]
        >()

      for (
        const lot of parkingLots
      ) {
        const {
          data,
          error,
        } =
          await supabase
            .from(
              'monthly_rentals'
            )
            .select(`
              id,
              vehicle_plate,

              customer_code,
              customer_name,
              phone,

              start_date,
              end_date,

              rental_status,
              payment_status,

              created_at
            `)
            .eq(
              'parking_lot_id',
              lot.id
            )
            .neq(
              'rental_status',
              'cancelled'
            )

        if (error) {
          console.error(
            '月租讀取失敗',
            lot.name,
            error
          )

          rentalCache.set(
            lot.id,
            []
          )
        } else {
          rentalCache.set(
            lot.id,
            data || []
          )
        }
      }

      /*
       * =================================================
       * 4. 車牌及停車場比對
       * =================================================
       */

      const checked:
        PaymentRow[] = []

      for (
        const row of allRows
      ) {
        if (
          row.duplicate
        ) {
          checked.push(
            row
          )

          continue
        }

        const lot =
          findParkingLot(
            parkingLots,
            row.lotName
          )

        if (!lot) {
          checked.push({
            ...row,

            matched: false,

            message:
              `找不到停車場：${row.lotName}`,
          })

          continue
        }

        const rentals =
          rentalCache.get(
            lot.id
          ) || []

        const reportPlate =
          normalizePlate(
            row.vehiclePlate
          )

        const matches =
          rentals
            .filter(
              (rental) =>
                normalizePlate(
                  rental.vehicle_plate
                ) ===
                reportPlate
            )
            .sort(
              (
                a,
                b
              ) =>
                String(
                  b.created_at
                ).localeCompare(
                  String(
                    a.created_at
                  )
                )
            )

        const rental =
          matches[0]

        if (!rental) {
          checked.push({
            ...row,

            parkingLotId:
              lot.id,

            matched: false,

            message:
              '找不到對應月租車牌',
          })

          continue
        }

        const matchedRow:
          PaymentRow = {
          ...row,

          parkingLotId:
            lot.id,

          rentalId:
            rental.id,

          customerCode:
            rental.customer_code ||
            '',

          customerName:
            rental.customer_name ||
            '',

          phone:
            rental.phone ||
            '',

          rentalStartDate:
            rental.start_date ||
            '',

          rentalEndDate:
            rental.end_date ||
            '',

          matched: true,

          message:
            row.amountPaid > 0
              ? '可同步'
              : '找零不足（但已繳費）',
        }

        matchedRow.sourceReference =
          buildSourceReference(
            matchedRow
          )

        checked.push(
          matchedRow
        )
      }

      /*
       * =================================================
       * 5. 檢查以前是否已經匯入過同一筆繳費
       * =================================================
       */

      const candidateReferences =
        checked
          .filter(
            (row) =>
              row.matched &&
              !row.duplicate &&
              row.sourceReference
          )
          .map(
            (row) =>
              row.sourceReference!
          )

      const existingReferences =
        new Set<string>()

      /*
       * 分批查詢，避免 URL 太長
       */
      for (
        let i = 0;
        i <
        candidateReferences.length;
        i += 40
      ) {
        const chunk =
          candidateReferences.slice(
            i,
            i + 40
          )

        if (
          chunk.length === 0
        ) {
          continue
        }

        const {
          data:
            existingPayments,

          error:
            paymentHistoryError,
        } =
          await supabase
            .from(
              'monthly_payments'
            )
            .select(
              'source_reference'
            )
            .in(
              'source_reference',
              chunk
            )

        if (
          paymentHistoryError
        ) {
          console.error(
            '繳費歷史重複檢查失敗',
            paymentHistoryError
          )

          continue
        }

        for (
          const item of
          existingPayments || []
        ) {
          if (
            item.source_reference
          ) {
            existingReferences.add(
              item.source_reference
            )
          }
        }
      }

      /*
       * 已存在於繳費歷史的資料，
       * 標記為重複，不再同步。
       */
      const finalRows =
        checked.map(
          (row) => {
            if (
              row.sourceReference &&
              existingReferences.has(
                row.sourceReference
              )
            ) {
              return {
                ...row,

                duplicate: true,

                message:
                  '此筆繳費已匯入過',
              }
            }

            return row
          }
        )

      setRows(
        finalRows
      )

      const syncCount =
        finalRows.filter(
          (row) =>
            row.matched &&
            !row.duplicate
        ).length

      const unmatched =
        finalRows.filter(
          (row) =>
            !row.matched &&
            !row.duplicate
        ).length

      const zero =
        finalRows.filter(
          (row) =>
            row.matched &&
            !row.duplicate &&
            row.amountPaid <= 0
        ).length

      const duplicate =
        finalRows.filter(
          (row) =>
            row.duplicate
        ).length

      setMessage(
        `共找到 ${finalRows.length} 筆交易明細，可同步 ${syncCount} 筆，未匹配 ${unmatched} 筆，找零不足（但已繳費） ${zero} 筆，重複 ${duplicate} 筆`
      )
    } catch (
      error: any
    ) {
      console.error(error)

      setMessage(
        `讀取失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setReading(false)
    }
  }

  async function handleFiles(
    event:
      React.ChangeEvent<HTMLInputElement>
  ) {
    const files =
      Array.from(
        event.target
          .files ||
          []
      )

    if (
      files.length === 0
    ) {
      return
    }

    setFileNames(
      files.map(
        (file) =>
          file.name
      )
    )

    await readFiles(
      files
    )
  }

  /*
   * =====================================================
   * 正式同步
   * =====================================================
   */

  async function confirmSync() {
    const syncRows =
      rows.filter(
        (row) =>
          row.matched &&
          row.rentalId &&
          row.parkingLotId &&
          !row.duplicate
      )

    if (
      syncRows.length === 0
    ) {
      alert(
        '目前沒有可以同步的資料'
      )

      return
    }

    const confirmed =
      window.confirm(
        `確定同步 ${syncRows.length} 筆繳費資料？\n\n` +
        `系統會：\n` +
        `1. 將符合的月租資料更新為「已繳」\n` +
        `2. 同時永久保存一筆繳費歷史\n` +
        `3. 繳費報表實收 0 元會歸類為「找零不足（但已繳費）」\n\n` +
        `未匹配及重複交易不會寫入。`
      )

    if (!confirmed) {
      return
    }

    setSyncing(true)
    setMessage('')

    const supabase =
      createClient()

    let success = 0
    let failed = 0

    let historySuccess = 0
    let historyDuplicate = 0
    let historyFailed = 0

    try {
      /*
       * 取得目前登入人員
       */
      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser()

      if (!user) {
        setMessage(
          '登入狀態失效，請重新登入。'
        )

        return
      }

      for (
        const row of syncRows
      ) {
        /*
         * ===============================================
         * A. 更新月租主表
         * ===============================================
         */

        const {
          data,
          error,
        } =
          await supabase
            .from(
              'monthly_rentals'
            )
            .update({
              payment_status:
                'paid',

              payment_date:
                row.paymentDate ||
                null,

              invoice_number:
                row.invoiceNumber ||
                null,

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              'id',
              row.rentalId!
            )
            .select('id')

        if (
          error ||
          !data ||
          data.length === 0
        ) {
          console.error(
            '月租付款狀態更新失敗',
            row.vehiclePlate,
            error
          )

          failed++
          continue
        }

        success++

        /*
         * ===============================================
         * B. 建立繳費歷史
         * ===============================================
         */

        const sourceReference =
          row.sourceReference ||
          buildSourceReference(
            row
          )

        /*
         * 再檢查一次是否已存在，
         * 避免使用者同時開兩個視窗或重複按。
         */
        const {
          data:
            existingPayment,

          error:
            existingError,
        } =
          await supabase
            .from(
              'monthly_payments'
            )
            .select('id')
            .eq(
              'source_reference',
              sourceReference
            )
            .limit(1)
            .maybeSingle()

        if (existingError) {
          console.error(
            '檢查繳費歷史失敗',
            row.vehiclePlate,
            existingError
          )

          historyFailed++
          continue
        }

        if (
          existingPayment?.id
        ) {
          historyDuplicate++
          continue
        }

        /*
         * monthly_payments.payment_date
         * 是必填欄位。
         */
        const historyPaymentDate =
          row.paymentDate ||
          toDate(
            row.exitTime
          )

        if (
          !historyPaymentDate
        ) {
          console.error(
            '無法取得繳費日期',
            row
          )

          historyFailed++
          continue
        }

        const {
          error:
            historyInsertError,
        } =
          await supabase
            .from(
              'monthly_payments'
            )
            .insert({
              parking_lot_id:
                row.parkingLotId!,

              monthly_rental_id:
                row.rentalId!,

              customer_code:
                row.customerCode ||
                null,

              customer_name:
                row.customerName ||
                null,

              phone:
                row.phone ||
                null,

              vehicle_plate:
                row.vehiclePlate,

              payment_date:
                historyPaymentDate,

              amount:
                row.amountPaid,

              payment_method:
                row.amountPaid <= 0
                  ? '找零不足（但已繳費）'
                  : row.paymentMethod ||
                    null,

              invoice_number:
                row.invoiceNumber ||
                null,

              rental_start_date:
                row.rentalStartDate ||
                null,

              rental_end_date:
                row.rentalEndDate ||
                null,

              source:
                'payment_csv',

              source_reference:
                sourceReference,

              notes: [
                row.amountPaid <= 0
                  ? '找零不足（但已繳費）'
                  : '',

                row.fileName
                  ? `匯入檔案：${row.fileName}`
                  : '',

                row.ticketNo
                  ? `票號：${row.ticketNo}`
                  : '',

                row.workstation
                  ? `工作站：${row.workstation}`
                  : '',

                row.dataMonth
                  ? `報表月份：${row.dataMonth}`
                  : '',
              ]
                .filter(Boolean)
                .join('；') ||
                null,

              created_by:
                user.id,
            })

        if (
          historyInsertError
        ) {
          console.error(
            '繳費歷史新增失敗',
            row.vehiclePlate,
            historyInsertError
          )

          historyFailed++
        } else {
          historySuccess++
        }
      }

      /*
       * ===============================================
       * 完成結果
       * ===============================================
       */

      if (
        failed === 0 &&
        historyFailed === 0 &&
        success > 0
      ) {
        setMessage(
          `同步完成：月租成功 ${success} 筆，繳費歷史新增 ${historySuccess} 筆，已存在 ${historyDuplicate} 筆，即將返回月租管理…`
        )

        setTimeout(
          () => {
            window.location.href =
              '/dashboard/monthly-rentals'
          },
          1000
        )

        return
      }

      setMessage(
        `同步完成：
月租成功 ${success} 筆、
月租失敗 ${failed} 筆、
繳費歷史新增 ${historySuccess} 筆、
繳費歷史已存在 ${historyDuplicate} 筆、
繳費歷史失敗 ${historyFailed} 筆`
      )
    } catch (
      error: any
    ) {
      console.error(error)

      setMessage(
        `同步失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setSyncing(false)
    }
  }

  function clearAll() {
    setRows([])
    setFileNames([])
    setMessage('')

    if (
      inputRef.current
    ) {
      inputRef.current.value =
        ''
    }
  }

  const syncCount =
    rows.filter(
      (row) =>
        row.matched &&
        !row.duplicate
    ).length

  const unmatchedCount =
    rows.filter(
      (row) =>
        !row.matched &&
        !row.duplicate
    ).length

  const zeroCount =
    rows.filter(
      (row) =>
        row.matched &&
        !row.duplicate &&
        row.amountPaid <= 0
    ).length

  const duplicateCount =
    rows.filter(
      (row) =>
        row.duplicate
    ).length

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.CSV"
        multiple
        style={{
          display: 'none',
        }}
        onChange={
          handleFiles
        }
      />

      <button
        type="button"
        onClick={() => {
          setOpen(true)

          setTimeout(
            () => {
              inputRef.current?.click()
            },
            100
          )
        }}
        style={{
          padding:
            '9px 14px',
          borderRadius: 8,
          border:
            '1px solid #cbd5e1',
          background:
            '#fff',
          cursor:
            'pointer',
        }}
      >
        匯入繳費報表
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background:
              'rgba(15,23,42,.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width:
                'min(1450px,96vw)',
              maxHeight:
                '92vh',
              overflow: 'auto',
              background: '#fff',
              borderRadius: 14,
              padding: 22,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                gap: 16,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                  }}
                >
                  匯入月租繳費報表
                </h2>

                <p
                  style={{
                    color:
                      '#64748b',
                  }}
                >
                  可一次選擇多個交易明細 CSV。系統不限制交易名稱，會依「停車場＋車牌」比對現有月租；只有成功匹配的月租車牌才可同步，並同時保存繳費歷史。
                </p>
              </div>

              <button
                type="button"
                disabled={
                  reading ||
                  syncing
                }
                onClick={() =>
                  setOpen(false)
                }
                style={{
                  border: 0,
                  background:
                    'transparent',
                  fontSize: 28,
                  cursor:
                    'pointer',
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap:
                  'wrap',
              }}
            >
              <button
                type="button"
                className="btn"
                disabled={
                  reading ||
                  syncing
                }
                onClick={() =>
                  inputRef.current?.click()
                }
              >
                {reading
                  ? '讀取中…'
                  : '選擇繳費 CSV'}
              </button>

              {rows.length >
                0 && (
                <button
                  type="button"
                  className="btn"
                  disabled={
                    syncing ||
                    syncCount === 0
                  }
                  onClick={
                    confirmSync
                  }
                >
                  {syncing
                    ? '同步中…'
                    : `確認同步 ${syncCount} 筆`}
                </button>
              )}

              {fileNames.length >
                0 && (
                <button
                  type="button"
                  disabled={
                    reading ||
                    syncing
                  }
                  onClick={
                    clearAll
                  }
                  style={{
                    padding:
                      '9px 14px',
                    border:
                      '1px solid #cbd5e1',
                    borderRadius: 8,
                    background:
                      '#fff',
                    cursor:
                      'pointer',
                  }}
                >
                  清除
                </button>
              )}
            </div>

            {fileNames.length >
              0 && (
              <div
                style={{
                  marginTop: 14,
                }}
              >
                <strong>
                  已選擇：
                </strong>{' '}
                {fileNames.join(
                  '、'
                )}
              </div>
            )}

            {message && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 8,
                  background:
                    '#f8fafc',
                  whiteSpace:
                    'pre-line',
                }}
              >
                {message}
              </div>
            )}

            {rows.length >
              0 && (
              <>
                <div
                  style={{
                    marginTop: 18,
                    display:
                      'flex',
                    gap: 10,
                    flexWrap:
                      'wrap',
                  }}
                >
                  <div className="card">
                    總交易：
                    <strong>
                      {rows.length}
                    </strong>
                  </div>

                  <div className="card">
                    可同步：
                    <strong>
                      {syncCount}
                    </strong>
                  </div>

                  <div className="card">
                    未匹配：
                    <strong>
                      {unmatchedCount}
                    </strong>
                  </div>

                  <div className="card">
                    找零不足已繳：
                    <strong>
                      {zeroCount}
                    </strong>
                  </div>

                  <div className="card">
                    重複：
                    <strong>
                      {duplicateCount}
                    </strong>
                  </div>
                </div>

                <div
                  style={{
                    overflowX:
                      'auto',
                    marginTop: 18,
                  }}
                >
                  <table
                    style={{
                      width:
                        '100%',
                      minWidth:
                        1400,
                      borderCollapse:
                        'collapse',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          textAlign:
                            'left',
                        }}
                      >
                        <th>
                          狀態
                        </th>

                        <th>
                          檔案
                        </th>

                        <th>
                          停車場
                        </th>

                        <th>
                          月份
                        </th>

                        <th>
                          工作站
                        </th>

                        <th>
                          車牌
                        </th>

                        <th>
                          出場時間
                        </th>

                        <th>
                          應收
                        </th>

                        <th>
                          實收
                        </th>

                        <th>
                          付款方式
                        </th>

                        <th>
                          發票號碼
                        </th>

                        <th>
                          說明
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {rows.map(
                        (
                          row,
                          index
                        ) => (
                          <tr
                            key={
                              index
                            }
                            style={{
                              borderTop:
                                '1px solid #e5e7eb',

                              background:
                                row.duplicate
                                  ? '#fff7ed'
                                  : !row.matched
                                    ? '#fef2f2'
                                    : row.amountPaid <=
                                        0
                                      ? '#f0fdf4'
                                      : undefined,
                            }}
                          >
                            <td
                              style={{
                                padding: 8,
                              }}
                            >
                              {row.duplicate
                                ? '重複'
                                : !row.matched
                                  ? '未匹配'
                                  : row.amountPaid <=
                                      0
                                    ? '找零不足（已繳）'
                                    : '可同步'}
                            </td>

                            <td
                              style={{
                                padding: 8,
                              }}
                            >
                              {
                                row.fileName
                              }
                            </td>

                            <td
                              style={{
                                padding: 8,
                              }}
                            >
                              {
                                row.lotName
                              }
                            </td>

                            <td
                              style={{
                                padding: 8,
                              }}
                            >
                              {
                                row.dataMonth
                              }
                            </td>

                            <td
                              style={{
                                padding: 8,
                              }}
                            >
                              {
                                row.workstation
                              }
                            </td>

                            <td
                              style={{
                                padding: 8,
                                fontWeight:
                                  700,
                              }}
                            >
                              {
                                row.vehiclePlate
                              }
                            </td>

                            <td
                              style={{
                                padding: 8,
                                whiteSpace:
                                  'nowrap',
                              }}
                            >
                              {
                                row.exitTime
                              }
                            </td>

                            <td
                              style={{
                                padding: 8,
                              }}
                            >
                              $
                              {row.amountDue.toLocaleString()}
                            </td>

                            <td
                              style={{
                                padding: 8,
                                fontWeight:
                                  700,
                              }}
                            >
                              $
                              {row.amountPaid.toLocaleString()}
                            </td>

                            <td
                              style={{
                                padding: 8,
                              }}
                            >
                              {row.paymentMethod ||
                                '-'}
                            </td>

                            <td
                              style={{
                                padding: 8,
                              }}
                            >
                              {row.invoiceNumber ||
                                '-'}
                            </td>

                            <td
                              style={{
                                padding: 8,
                                minWidth: 150,
                              }}
                            >
                              {
                                row.message
                              }
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}