'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  resolvePaymentRuleByAmount,
  type MonthlyTypeRule,
} from '@/lib/monthly-payment-preview'
import {
  is408MonthlySheet,
  parse408PaymentSheet,
} from '@/lib/monthly-408-payment'

type ParkingLot = {
  id: string
  name: string
}

const WORK_LOT_STORAGE_KEY = 'current-work-parking-lot-id'
const MONTHLY_LOT_STORAGE_KEY = 'monthly-rentals-current-lot'
const WORK_LOT_COOKIE_KEY = 'current_work_parking_lot_id'

function setCurrentWorkParkingLot(parkingLotId: string) {
  const id = String(parkingLotId || '').trim()
  if (!id || typeof window === 'undefined') return

  window.localStorage.setItem(WORK_LOT_STORAGE_KEY, id)
  window.localStorage.setItem(MONTHLY_LOT_STORAGE_KEY, id)
  document.cookie = `${WORK_LOT_COOKIE_KEY}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`
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
  monthlyFee?: number
  standardMonthlyFee?: number
  resolvedRentalType?: string
  resolvedVehicleType?: string
  resolvedMonths?: number
  ruleMatchMethod?: string
  ruleCandidateCount?: number

  rentalStartDate?: string
  rentalEndDate?: string

  sourceReference?: string
  sourceKind?: 'payment_csv' | '408_excel'
  sourceSheet?: string

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

function vehicleTypeLabel(value: unknown) {
  const normalized = text(value).toLowerCase()
  if (normalized === 'motorcycle' || normalized === '機車') return '機車'
  if (normalized === 'heavy_motorcycle' || normalized === '重機') return '重機'
  if (normalized === 'car' || normalized === '汽車') return '汽車'
  return text(value) || '未設定'
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


function paymentNeedsReview(row: PaymentRow) {
  if (!Number.isFinite(Number(row.amountPaid)) || Number(row.amountPaid) <= 0) {
    return true
  }

  return !(
    Number(row.standardMonthlyFee || 0) > 0 &&
    Number(row.resolvedMonths || 0) > 0
  )
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

  /*
   * =====================================================
   * A. 原本系統使用的「寬格式／合併格式」交易明細
   * =====================================================
   *
   * 這類報表的交易資料落在固定位置：
   *
   * 3  停車場
   * 6  工作站
   * 8  資料月份
   * 26 序號
   * 27 票號
   * 28 入場時間
   * 29 出場時間
   * 30 車號
   * 31 費率
   * 37 應收
   * 38 折扣
   * 39 實收
   * 40 付款方式
   * 42 發票
   *
   * 不再限制費率名稱一定要是「月租續約」。
   */

  for (const row of matrix) {
    const vehiclePlate =
      text(row[30])
        .replace(/\s/g, '')
        .toUpperCase()

    const exitTime =
      text(row[29])

    const paymentDate =
      toDate(exitTime)

    if (
      !vehiclePlate ||
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

      rateName:
        text(row[31]),

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

  /*
   * =====================================================
   * B. 一般「標準表頭格式」交易明細
   * =====================================================
   *
   * 例如：
   *
   * 序號,票號,入場時間,出場時間,車號,費率,...
   * 應收金額,折扣金額,實收金額,統一編號,發票編號,...
   *
   * 這種格式不需要停車場名稱。
   * 後續會用「車牌」去現有月租名單尋找所屬停車場。
   */

  const headerIndex =
    matrix.findIndex(
      (row) => {
        const headers =
          row.map(
            (item) =>
              text(item)
          )

        return (
          headers.includes(
            '序號'
          ) &&
          headers.includes(
            '票號'
          ) &&
          headers.includes(
            '入場時間'
          ) &&
          headers.includes(
            '出場時間'
          ) &&
          headers.includes(
            '車號'
          ) &&
          headers.some(
            (item) =>
              item.includes(
                '實收金額'
              )
          )
        )
      }
    )

  if (
    headerIndex >= 0
  ) {
    const header =
      matrix[
        headerIndex
      ].map(
        (item) =>
          text(item)
      )

    function column(
      ...names: string[]
    ) {
      for (
        const name of
        names
      ) {
        const exact =
          header.findIndex(
            (item) =>
              item === name
          )

        if (
          exact >= 0
        ) {
          return exact
        }

        const fuzzy =
          header.findIndex(
            (item) =>
              item.includes(
                name
              )
          )

        if (
          fuzzy >= 0
        ) {
          return fuzzy
        }
      }

      return -1
    }

    const sequenceIndex =
      column('序號')

    const ticketIndex =
      column('票號')

    const entryIndex =
      column('入場時間')

    const exitIndex =
      column('出場時間')

    const plateIndex =
      column(
        '車號',
        '車牌'
      )

    const rateIndex =
      column('費率')

    const amountDueIndex =
      column(
        '應收金額',
        '應收'
      )

    const discountIndex =
      column(
        '折扣金額',
        '折扣'
      )

    const amountPaidIndex =
      column(
        '實收金額',
        '實收'
      )

    const paymentMethodIndex =
      column(
        '付款方式',
        '繳費方式'
      )

    const invoiceIndex =
      column(
        '發票編號',
        '發票號碼'
      )

    /*
     * 從表頭前面的說明列抓資料月份、工作站、停車場名稱。
     * 有就使用，沒有也沒關係。
     */
    let dataMonth = ''
    let workstation = ''
    let lotName = ''

    for (
      let i = 0;
      i < headerIndex;
      i++
    ) {
      const line =
        matrix[i]
          .map(
            (item) =>
              text(item)
          )
          .filter(Boolean)
          .join(' ')

      const monthMatch =
        line.match(
          /(?:資料日期|資料月份)\s*[:：]\s*(\d{4}[\/\-]\d{1,2})/
        )

      if (
        monthMatch
      ) {
        dataMonth =
          monthMatch[1]
      }

      const stationMatch =
        line.match(
          /(?:工作站點|工作站|機號)\s*[:：]\s*([^\s,]+)/
        )

      if (
        stationMatch
      ) {
        workstation =
          stationMatch[1]
      }

      const lotMatch =
        line.match(
          /(?:停車場名稱|停車場|場站)\s*[:：]\s*(.+)$/
        )

      if (
        lotMatch
      ) {
        lotName =
          text(
            lotMatch[1]
          )
      }
    }

    for (
      let i =
        headerIndex + 1;
      i < matrix.length;
      i++
    ) {
      const row =
        matrix[i]

      const vehiclePlate =
        plateIndex >= 0
          ? text(
              row[
                plateIndex
              ]
            )
              .replace(
                /\s/g,
                ''
              )
              .toUpperCase()
          : ''

      const exitTime =
        exitIndex >= 0
          ? text(
              row[
                exitIndex
              ]
            )
          : ''

      const paymentDate =
        toDate(
          exitTime
        )

      /*
       * 「總計」或空白列不會有有效車牌與日期，
       * 因此會自動略過。
       */
      if (
        !vehiclePlate ||
        !exitTime ||
        !paymentDate
      ) {
        continue
      }

      result.push({
        fileName,

        lotName,

        dataMonth,

        workstation,

        sequenceNo:
          sequenceIndex >= 0
            ? text(
                row[
                  sequenceIndex
                ]
              )
            : '',

        ticketNo:
          ticketIndex >= 0
            ? text(
                row[
                  ticketIndex
                ]
              )
            : '',

        entryTime:
          entryIndex >= 0
            ? text(
                row[
                  entryIndex
                ]
              )
            : '',

        exitTime,

        vehiclePlate,

        rateName:
          rateIndex >= 0
            ? text(
                row[
                  rateIndex
                ]
              )
            : '',

        amountDue:
          amountDueIndex >= 0
            ? numberValue(
                row[
                  amountDueIndex
                ]
              )
            : 0,

        discountAmount:
          discountIndex >= 0
            ? numberValue(
                row[
                  discountIndex
                ]
              )
            : 0,

        amountPaid:
          amountPaidIndex >= 0
            ? numberValue(
                row[
                  amountPaidIndex
                ]
              )
            : 0,

        paymentMethod:
          paymentMethodIndex >= 0
            ? text(
                row[
                  paymentMethodIndex
                ]
              )
            : '',

        invoiceNumber:
          invoiceIndex >= 0
            ? text(
                row[
                  invoiceIndex
                ]
              )
            : '',

        paymentDate,

        matched: false,
        duplicate: false,

        message: '',
      })
    }
  }

  /*
   * 同一筆資料若同時被兩種 parser 判斷到，
   * 只保留一次。
   */
  const unique =
    new Map<
      string,
      PaymentRow
    >()

  for (
    const row of
    result
  ) {
    const key = [
      row.fileName,
      row.sequenceNo,
      row.ticketNo,
      normalizePlate(
        row.vehiclePlate
      ),
      row.exitTime,
      row.invoiceNumber,
      String(
        row.amountPaid
      ),
    ].join('|')

    if (
      !unique.has(key)
    ) {
      unique.set(
        key,
        row
      )
    }
  }

  return Array.from(
    unique.values()
  )
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


async function extract408WorkbookTransactions(file: File): Promise<PaymentRow[]> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    raw: true,
  })

  const rows: PaymentRow[] = []
  const monthlySheets = workbook.SheetNames.filter(is408MonthlySheet)

  if (monthlySheets.length === 0) {
    throw new Error('這份 Excel 找不到 408巷月租工作表，例如「408巷115-09-10」。')
  }

  for (const sheetName of monthlySheets) {
    const sheet = workbook.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      raw: true,
      defval: '',
    }) as unknown[][]

    const parsed = parse408PaymentSheet(sheetName, matrix)

    for (const item of parsed) {
      const sourceReference = [
        '408_excel',
        item.sourceSheet,
        item.customerCode,
        normalizePlate(item.vehiclePlate),
        item.paymentDate,
        String(item.amountPaid || 0),
      ].join('|')

      rows.push({
        fileName: file.name,
        lotName: '408巷',
        dataMonth: item.reportMonth,
        workstation: '408巷人工月租表',
        sequenceNo: item.customerCode,
        ticketNo: `${item.sourceSheet}|${item.customerCode}`,
        entryTime: '',
        exitTime: `${item.paymentDate} 00:00:00`,
        vehiclePlate: item.vehiclePlate,
        rateName: item.rentalType,
        amountDue: item.amountPaid,
        discountAmount: 0,
        amountPaid: item.amountPaid,
        paymentMethod: item.paymentMethod,
        invoiceNumber: item.invoiceNumber,
        paymentDate: item.paymentDate,
        matched: false,
        duplicate: false,
        sourceReference,
        sourceKind: '408_excel',
        sourceSheet: item.sourceSheet,
        message: '408巷人工月租表付款',
      })
    }
  }

  return rows
}


const PAYMENT_FOLDER_DB =
  'parking-payment-folder-db'

const PAYMENT_FOLDER_STORE =
  'handles'

const PAYMENT_FOLDER_KEY =
  'monthly-payment-folder'

const PROCESSED_FILES_KEY =
  'monthly-payment-folder-processed-v1'

function openFolderDb() {
  return new Promise<IDBDatabase>(
    (
      resolve,
      reject
    ) => {
      const request =
        indexedDB.open(
          PAYMENT_FOLDER_DB,
          1
        )

      request.onupgradeneeded =
        () => {
          const db =
            request.result

          if (
            !db.objectStoreNames.contains(
              PAYMENT_FOLDER_STORE
            )
          ) {
            db.createObjectStore(
              PAYMENT_FOLDER_STORE
            )
          }
        }

      request.onsuccess =
        () =>
          resolve(
            request.result
          )

      request.onerror =
        () =>
          reject(
            request.error
          )
    }
  )
}

async function saveFolderHandle(
  handle: any
) {
  const db =
    await openFolderDb()

  await new Promise<void>(
    (
      resolve,
      reject
    ) => {
      const transaction =
        db.transaction(
          PAYMENT_FOLDER_STORE,
          'readwrite'
        )

      transaction
        .objectStore(
          PAYMENT_FOLDER_STORE
        )
        .put(
          handle,
          PAYMENT_FOLDER_KEY
        )

      transaction.oncomplete =
        () => resolve()

      transaction.onerror =
        () =>
          reject(
            transaction.error
          )
    }
  )

  db.close()
}

async function loadFolderHandle() {
  const db =
    await openFolderDb()

  const result =
    await new Promise<any>(
      (
        resolve,
        reject
      ) => {
        const transaction =
          db.transaction(
            PAYMENT_FOLDER_STORE,
            'readonly'
          )

        const request =
          transaction
            .objectStore(
              PAYMENT_FOLDER_STORE
            )
            .get(
              PAYMENT_FOLDER_KEY
            )

        request.onsuccess =
          () =>
            resolve(
              request.result ||
                null
            )

        request.onerror =
          () =>
            reject(
              request.error
            )
      }
    )

  db.close()

  return result
}

function fileSignature(
  file: File
) {
  return [
    file.name,
    file.size,
    file.lastModified,
  ].join('|')
}

function getProcessedFolderFiles() {
  try {
    const raw =
      window.localStorage.getItem(
        PROCESSED_FILES_KEY
      )

    const parsed =
      raw
        ? JSON.parse(raw)
        : []

    return new Set<string>(
      Array.isArray(parsed)
        ? parsed
        : []
    )
  } catch {
    return new Set<string>()
  }
}

function markFolderFilesProcessed(
  signatures: string[]
) {
  if (
    signatures.length ===
    0
  ) {
    return
  }

  const processed =
    getProcessedFolderFiles()

  signatures.forEach(
    (signature) =>
      processed.add(
        signature
      )
  )

  /*
   * 避免 localStorage 無限增長。
   * 保留最近 3000 個檔案識別碼已足夠現場長期使用。
   */
  const values =
    Array.from(
      processed
    ).slice(-3000)

  window.localStorage.setItem(
    PROCESSED_FILES_KEY,
    JSON.stringify(
      values
    )
  )
}


type FolderCsvKind =
  | 'monthly_master'
  | 'payment'
  | 'unknown'

function normalizeFileName(
  value: string
) {
  return String(
    value || ''
  )
    .toLowerCase()
    .replace(/\s+/g, '')
}

function classifyCsvByFileName(
  fileName: string
): FolderCsvKind {
  const name =
    normalizeFileName(
      fileName
    )

  /*
   * 檔名第一層判斷：
   * 繳費／交易類關鍵字優先，
   * 避免「月租繳費」被誤認為月租總表。
   */
  const paymentKeywords = [
    '繳費紀錄',
    '繳費記錄',
    '繳費明細',
    '交易明細',
    '自動繳費機',
    '繳費機',
    '付款紀錄',
    '付款記錄',
    'payment',
    'transaction',
  ]

  if (
    paymentKeywords.some(
      (keyword) =>
        name.includes(
          keyword
        )
    )
  ) {
    return 'payment'
  }

  const masterKeywords = [
    '月租總表',
    '月票總表',
    '月租名單',
    '月票名單',
    '月租資料',
    '月票資料',
    'monthlyrental',
    'monthlypass',
  ]

  if (
    masterKeywords.some(
      (keyword) =>
        name.includes(
          keyword
        )
    )
  ) {
    return 'monthly_master'
  }

  /*
   * 「月票_202608.csv」這類簡短檔名，
   * 只有在沒有交易／繳費關鍵字時才視為總表。
   */
  if (
    (
      name.startsWith(
        '月票_'
      ) ||
      name.startsWith(
        '月租_'
      ) ||
      name ===
        '月票.csv' ||
      name ===
        '月租.csv'
    )
  ) {
    return 'monthly_master'
  }

  return 'unknown'
}

function classifyCsvByMatrix(
  matrix: string[][]
): FolderCsvKind {
  const sample =
    matrix
      .slice(0, 25)
      .flat()
      .map(
        (item) =>
          text(item)
            .replace(/\s+/g, '')
      )
      .filter(Boolean)

  /*
   * 第二層：內容判斷。
   *
   * 月租總表常見欄位：
   * 姓名、電話、車號/車牌、開始日期、到期日、應收費用
   */
  const hasCustomer =
    sample.some(
      (item) =>
        item === '姓名' ||
        item.includes(
          '客戶編號'
        )
    )

  const hasRentalDates =
    sample.some(
      (item) =>
        item.includes(
          '開始日期'
        ) ||
        item.includes(
          '起租日'
        )
    ) &&
    sample.some(
      (item) =>
        item.includes(
          '到期日'
        ) ||
        item.includes(
          '結束日期'
        )
    )

  const hasRentalFee =
    sample.some(
      (item) =>
        item.includes(
          '應收費用'
        ) ||
        item.includes(
          '月租金額'
        )
    )

  if (
    hasCustomer &&
    hasRentalDates &&
    hasRentalFee
  ) {
    return 'monthly_master'
  }

  /*
   * 繳費交易常見欄位：
   * 票號、入場時間、出場時間、實收金額
   */
  const hasTicket =
    sample.some(
      (item) =>
        item === '票號' ||
        item.includes(
          '票號'
        )
    )

  const hasEntryExit =
    sample.some(
      (item) =>
        item.includes(
          '入場時間'
        )
    ) &&
    sample.some(
      (item) =>
        item.includes(
          '出場時間'
        ) ||
        item.includes(
          '離場時間'
        )
    )

  const hasPaidAmount =
    sample.some(
      (item) =>
        item.includes(
          '實收金額'
        ) ||
        item ===
          '實收'
    )

  if (
    hasTicket &&
    hasEntryExit &&
    hasPaidAmount
  ) {
    return 'payment'
  }

  /*
   * 原本繳費機特殊格式有「當月交易明細」字樣，
   * 即使表頭拆散也可辨識為繳費紀錄。
   */
  if (
    sample.some(
      (item) =>
        item.includes(
          '當月交易明細'
        )
    )
  ) {
    return 'payment'
  }

  return 'unknown'
}

async function classifyFolderCsv(
  file: File
) {
  const byName =
    classifyCsvByFileName(
      file.name
    )

  if (
    byName !==
    'unknown'
  ) {
    return byName
  }

  try {
    const csvText =
      await readCsvFile(
        file
      )

    const matrix =
      parseCsv(
        csvText
      )

    return classifyCsvByMatrix(
      matrix
    )
  } catch {
    return 'unknown'
  }
}

export default function CsvImportButton({
  parkingLots: parkingLotsProp = [],
}: {
  parkingLots?: ParkingLot[]
}) {
  const [
    loadedParkingLots,
    setLoadedParkingLots,
  ] = useState<ParkingLot[]>(
    parkingLotsProp
  )

  const parkingLots =
    parkingLotsProp.length > 0
      ? parkingLotsProp
      : loadedParkingLots

  useEffect(() => {
    if (
      parkingLotsProp.length > 0
    ) {
      setLoadedParkingLots(
        parkingLotsProp
      )
      return
    }

    async function loadParkingLots() {
      const supabase =
        createClient()

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

      if (error) {
        console.error(
          '停車場讀取失敗',
          error
        )
        return
      }

      setLoadedParkingLots(
        (data || []) as ParkingLot[]
      )
    }

    void loadParkingLots()
  }, [
    parkingLotsProp,
  ])

  const inputRef =
    useRef<HTMLInputElement>(
      null
    )

  const autoFolderCheckStarted =
    useRef(false)

  const [
    folderName,
    setFolderName,
  ] =
    useState('')

  const [
    folderChecking,
    setFolderChecking,
  ] =
    useState(false)

  const [
    folderStatus,
    setFolderStatus,
  ] =
    useState('')

  const [
    pendingFolderSignatures,
    setPendingFolderSignatures,
  ] =
    useState<string[]>([])

  const [
    detectedMonthlyMasterFiles,
    setDetectedMonthlyMasterFiles,
  ] =
    useState<string[]>([])

  const [
    detectedUnknownFiles,
    setDetectedUnknownFiles,
  ] =
    useState<string[]>([])

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

  async function scanPaymentFolder(
    handle: any,
    allowPermissionPrompt:
      boolean,
    askBeforeAnalyze:
      boolean
  ) {
    if (!handle) {
      return
    }

    setFolderChecking(true)
    setFolderStatus('')

    try {
      let permission =
        'prompt'

      if (
        typeof handle
          .queryPermission ===
        'function'
      ) {
        permission =
          await handle.queryPermission({
            mode: 'read',
          })
      }

      if (
        permission !==
          'granted' &&
        allowPermissionPrompt &&
        typeof handle
          .requestPermission ===
          'function'
      ) {
        permission =
          await handle.requestPermission({
            mode: 'read',
          })
      }

      if (
        permission !==
        'granted'
      ) {
        setFolderStatus(
          '已記住報表資料夾，但瀏覽器需要你按「檢查新報表」重新授權讀取。'
        )

        return
      }

      const processed =
        getProcessedFolderFiles()

      const paymentFiles:
        File[] = []

      const paymentSignatures:
        string[] = []

      const monthlyMasterNames:
        string[] = []

      const unknownNames:
        string[] = []

      for await (
        const entry of
        handle.values()
      ) {
        if (
          entry?.kind !==
          'file'
        ) {
          continue
        }

        if (
          !/\.csv$/i.test(
            String(
              entry.name ||
                ''
            )
          )
        ) {
          continue
        }

        const file =
          await entry.getFile()

        const signature =
          fileSignature(
            file
          )

        if (
          processed.has(
            signature
          )
        ) {
          continue
        }

        const kind =
          await classifyFolderCsv(
            file
          )

        if (
          kind ===
          'payment'
        ) {
          paymentFiles.push(
            file
          )

          paymentSignatures.push(
            signature
          )
        } else if (
          kind ===
          'monthly_master'
        ) {
          monthlyMasterNames.push(
            file.name
          )
        } else {
          unknownNames.push(
            file.name
          )
        }
      }

      paymentFiles.sort(
        (
          a,
          b
        ) =>
          a.lastModified -
          b.lastModified
      )

      setDetectedMonthlyMasterFiles(
        monthlyMasterNames
      )

      setDetectedUnknownFiles(
        unknownNames
      )

      const totalDetected =
        paymentFiles.length +
        monthlyMasterNames.length +
        unknownNames.length

      if (
        totalDetected ===
        0
      ) {
        setFolderStatus(
          '目前沒有新的 CSV 報表。'
        )

        return
      }

      setFolderStatus(
        `發現新 CSV ${totalDetected} 份：繳費紀錄 ${paymentFiles.length} 份、月租總表 ${monthlyMasterNames.length} 份、未分類 ${unknownNames.length} 份。`
      )

      if (
        paymentFiles.length ===
        0
      ) {
        if (
          monthlyMasterNames.length >
          0
        ) {
          window.alert(
            `發現 ${monthlyMasterNames.length} 份月租總表。\n\n這些檔案不會當成繳費紀錄匯入，避免誤更新付款狀態。\n請使用「匯入舊系統總表」功能處理。`
          )
        }

        return
      }

      if (
        askBeforeAnalyze
      ) {
        const confirmed =
          window.confirm(
            `發現新 CSV ${totalDetected} 份：\n` +
            `• 繳費紀錄 ${paymentFiles.length} 份\n` +
            `• 月租總表 ${monthlyMasterNames.length} 份\n` +
            `• 未分類 ${unknownNames.length} 份\n\n` +
            `現在只分析「繳費紀錄」並比對月租繳費嗎？\n\n` +
            `月租總表不會被當成繳費資料。`
          )

        if (!confirmed) {
          return
        }
      }

      setOpen(true)

      setFileNames(
        paymentFiles.map(
          (file) =>
            file.name
        )
      )

      setPendingFolderSignatures(
        paymentSignatures
      )

      await readFiles(
        paymentFiles
      )
    } catch (
      error: any
    ) {
      console.error(
        '報表資料夾讀取失敗',
        error
      )

      setFolderStatus(
        '報表資料夾讀取失敗：' +
          (
            error?.message ||
            '未知錯誤'
          )
      )
    } finally {
      setFolderChecking(false)
    }
  }

  async function choosePaymentFolder() {
    if (
      typeof window ===
        'undefined' ||
      !(
        'showDirectoryPicker' in
        window
      )
    ) {
      alert(
        '目前瀏覽器不支援指定資料夾功能。請使用最新版 Chrome 或 Edge；原本手動選擇 CSV 功能仍可使用。'
      )

      return
    }

    try {
      const handle =
        await (
          window as any
        ).showDirectoryPicker({
          mode: 'read',
        })

      await saveFolderHandle(
        handle
      )

      setFolderName(
        handle.name ||
          '已設定資料夾'
      )

      setFolderStatus(
        '報表資料夾設定完成。'
      )

      await scanPaymentFolder(
        handle,
        true,
        true
      )
    } catch (
      error: any
    ) {
      if (
        error?.name ===
        'AbortError'
      ) {
        return
      }

      alert(
        '設定報表資料夾失敗：' +
          (
            error?.message ||
            '未知錯誤'
          )
      )
    }
  }

  async function checkPaymentFolder() {
    try {
      const handle =
        await loadFolderHandle()

      if (!handle) {
        await choosePaymentFolder()
        return
      }

      setFolderName(
        handle.name ||
          '已設定資料夾'
      )

      await scanPaymentFolder(
        handle,
        true,
        true
      )
    } catch (
      error: any
    ) {
      alert(
        '檢查報表資料夾失敗：' +
          (
            error?.message ||
            '未知錯誤'
          )
      )
    }
  }
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
        if (/\.xlsx?$/i.test(file.name)) {
          const transactions = await extract408WorkbookTransactions(file)
          allRows = [
            ...allRows,
            ...transactions,
          ]
          continue
        }

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
          '沒有找到可辨識的交易明細。CSV 請確認包含車牌與交易資料；408巷 Excel 則需有 408巷XXX-XX-XX 月租工作表及繳費日期。'
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
       * 3. 抓取本系統月租類型設定
       * =================================================
       *
       * 預覽與正式同步必須使用同一套「金額主判斷」：
       * 同停車場 + 同車種 -> 逐一測試本系統月租類型單月費。
       * 每個月租類型可由主管設定允許繳費月份；舊月租類型／現場文字僅供參考。
       * 不再拿 monthly_rentals.monthly_fee 當作單月費。
       */

      const lotIds =
        parkingLots
          .map((lot) => lot.id)
          .filter(Boolean)

      let typeRules:
        MonthlyTypeRule[] = []

      if (lotIds.length > 0) {
        const {
          data: typeRuleRows,
          error: typeRuleError,
        } =
          await supabase
            .from(
              'monthly_rental_type_rules'
            )
            .select('*')
            .in(
              'parking_lot_id',
              lotIds
            )

        if (typeRuleError) {
          console.error(
            '月租類型設定讀取失敗',
            typeRuleError
          )

          setRows([])
          setMessage(
            `無法讀取本系統月租類型設定，已停止預覽付款月份（${typeRuleError.code || 'UNKNOWN'}：${typeRuleError.message}）。`
          )
          return
        }

        typeRules =
          (typeRuleRows || []) as MonthlyTypeRule[]
      }

      /*
       * =================================================
       * 4. 抓取目前所有停車場月租資料
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
              monthly_fee,
              rental_type,
              vehicle_type,

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
       * 5. 車牌及停車場比對
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

        const reportPlate =
          normalizePlate(
            row.vehiclePlate
          )

        /*
         * 若 CSV 本身有停車場名稱，優先使用停車場名稱。
         * 若沒有停車場名稱，就直接用車牌跨場搜尋。
         *
         * 只有「唯一找到一個停車場」才會自動匹配，
         * 避免同車牌若出現在多個場站時誤寫資料。
         */
        let lot =
          row.lotName
            ? findParkingLot(
                parkingLots,
                row.lotName
              )
            : undefined

        /*
         * 報表名稱與系統場站名稱可能不同。
         *
         * 例如報表：
         * 「汐止金龍停車場」
         *
         * 系統可能是：
         * 「汐止金龍市場地下停車場」
         *
         * 名稱模糊比對仍找不到時，不直接判定失敗；
         * 改用「車牌」跨所有可存取停車場尋找。
         *
         * 只有唯一找到一個場站才自動採用，
         * 避免同車牌跨場時誤寫繳費資料。
         */
        if (!lot) {
          const candidateLots =
            parkingLots.filter(
              (candidateLot) => {
                const candidateRentals =
                  rentalCache.get(
                    candidateLot.id
                  ) || []

                return candidateRentals.some(
                  (rental) =>
                    normalizePlate(
                      rental.vehicle_plate
                    ) ===
                    reportPlate
                )
              }
            )

          if (
            candidateLots.length ===
            1
          ) {
            lot =
              candidateLots[0]
          } else if (
            candidateLots.length >
            1
          ) {
            checked.push({
              ...row,

              matched: false,

              message:
                '同一車牌存在於多個停車場，請確認月租資料後再同步',
            })

            continue
          } else {
            checked.push({
              ...row,

              matched: false,

              message:
                row.lotName
                  ? `停車場名稱未匹配，且找不到對應月租車牌：${row.lotName}`
                  : '找不到對應月租車牌',
            })

            continue
          }
        }

        const rentals =
          rentalCache.get(
            lot.id
          ) || []

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

        const ruleResolution =
          resolvePaymentRuleByAmount(
            {
              parkingLotId: lot.id,
              vehicleType:
                rental.vehicle_type,
            },
            row.amountPaid,
            typeRules,
          )

        const standardMonthlyFee =
          ruleResolution.kind === 'matched'
            ? ruleResolution.standardMonthlyFee
            : 0

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

          monthlyFee:
            Number(rental.monthly_fee || 0),

          standardMonthlyFee,

          resolvedRentalType:
            ruleResolution.kind === 'matched'
              ? ruleResolution.matchedType
              : '',

          resolvedVehicleType:
            ruleResolution.kind === 'matched'
              ? ruleResolution.matchedVehicleType
              : '',

          resolvedMonths:
            ruleResolution.kind === 'matched'
              ? ruleResolution.months
              : 0,

          ruleMatchMethod:
            ruleResolution.method,

          ruleCandidateCount:
            ruleResolution.candidateCount,

          rentalStartDate:
            rental.start_date ||
            '',

          rentalEndDate:
            rental.end_date ||
            '',

          matched: true,

          message:
            ruleResolution.kind === 'matched'
              ? `可同步（${vehicleTypeLabel(ruleResolution.matchedVehicleType)}／${ruleResolution.matchedType}／單月 $${ruleResolution.standardMonthlyFee.toLocaleString()}／${ruleResolution.months} 個月）`
              : ruleResolution.kind === 'zero_amount'
                ? '0 元付款，待確認'
                : ruleResolution.kind === 'ambiguous'
                  ? `實收金額依主管設定的允許月份仍可對應 ${ruleResolution.candidateCount} 種月租條件，需人工確認`
                  : '同停車場中找不到符合實收金額＋主管允許月份的月租條件，待確認',
        }

        matchedRow.sourceReference =
          row.sourceReference ||
          buildSourceReference(
            matchedRow
          )

        checked.push(
          matchedRow
        )
      }

      /*
       * =================================================
       * 6. 檢查以前是否已經匯入過同一筆繳費
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
        new Map<string, string | null>()

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
              'source_reference,cycle_application_status'
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
            existingReferences.set(
              item.source_reference,
              item.cycle_application_status || null
            )
          }
        }
      }

      /*
       * 已存在於繳費歷史的資料仍標記為重複，
       * 但可再次送到 API 做安全修復：只回填既有付款結果，不重複加月份。
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
              const existingStatus =
                existingReferences.get(
                  row.sourceReference
                )

              // 資料修復時會把「歷史上已保存、但尚未套用新週期」的
              // payment_csv 標記為 failed。這種資料允許用同一份正式報表
              // 重新套用週期，但 API 會沿用既有 monthly_payments，不會新增重複歷史。
              if (
                existingStatus !==
                'failed'
              ) {
                return {
                  ...row,

                  duplicate: true,

                  message:
                    '此筆繳費已匯入過',
                }
              }

              return {
                ...row,
                duplicate: false,
                message:
                  '既有繳費紀錄待重新套用本系統週期',
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

      const review =
        finalRows.filter(
          (row) =>
            row.matched &&
            !row.duplicate &&
            paymentNeedsReview(row)
        ).length

      const duplicate =
        finalRows.filter(
          (row) =>
            row.duplicate
        ).length

      setMessage(
        `共找到 ${finalRows.length} 筆交易明細，新增同步 ${syncCount} 筆，既有資料可修復 ${duplicate} 筆，未匹配 ${unmatched} 筆，付款待確認 ${review} 筆`
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

    setPendingFolderSignatures(
      []
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
    // 已存在的付款也要送到後端做「安全修復」：
    // 只從既有 monthly_payments 回填繳費日期 / 已繳至 / 待確認狀態，
    // 絕不再次新增繳費歷史、也絕不重複延長月份。
    const syncRows = rows.filter(
      (row) => row.matched && row.rentalId && row.parkingLotId
    )

    const newSyncCount = syncRows.filter((row) => !row.duplicate).length
    const duplicateRepairCount = syncRows.filter((row) => row.duplicate).length

    // 同一批若只屬於一個停車場，成功後自動把該 UUID 設為目前工作停車場。
    // 若意外混入多場資料則不自動切換，避免亂跳場站。
    const syncLotIds = [
      ...new Set(
        syncRows
          .map((row) => String(row.parkingLotId || '').trim())
          .filter(Boolean)
      ),
    ]

    if (syncRows.length === 0) {
      alert('目前沒有可以同步的資料')
      return
    }

    const confirmed = window.confirm(
      `確定處理 ${syncRows.length} 筆繳費資料？\n` +
      `新增同步 ${newSyncCount} 筆；既有資料修復 ${duplicateRepairCount} 筆。\n\n` +
      `系統會：\n` +
      `1. 新交易永久保存正式繳費歷史\n` +
      `2. 正常金額依正式週期延長已繳至日期\n` +
      `3. 0 元或異常金額進入「付款待確認」\n` +
      `4. 已匯入過的交易只用既有歷史回填繳費日期／已繳至／待確認，不會重複加月份。`
    )

    if (!confirmed) return

    setSyncing(true)
    setMessage('正在更新月租繳費資料…')

    try {
      const payloadRows = syncRows.map((row) => ({
        rentalId: row.rentalId!,
        parkingLotId: row.parkingLotId!,
        customerCode: row.customerCode || null,
        customerName: row.customerName || null,
        phone: row.phone || null,
        vehiclePlate: row.vehiclePlate,
        paymentDate: row.paymentDate || toDate(row.exitTime),
        amountPaid: row.amountPaid,
        paymentMethod:
          row.paymentMethod || null,
        invoiceNumber: row.invoiceNumber || null,
        sourceReference: row.sourceReference || buildSourceReference(row),
        reportMonth: row.dataMonth || null,
        sourceKind: row.sourceKind || 'payment_csv',
        notes: [
          row.sourceSheet ? `408巷工作表：${row.sourceSheet}` : '',
          row.amountPaid <= 0 ? '0 元付款：待管理員確認是否因找零不足已完成繳費，或需退款後重繳' : '',
          row.fileName ? `匯入檔案：${row.fileName}` : '',
          row.ticketNo ? `票號：${row.ticketNo}` : '',
          row.workstation ? `工作站：${row.workstation}` : '',
          row.dataMonth ? `報表月份：${row.dataMonth}` : '',
        ].filter(Boolean).join('；'),
      }))

      const response = await fetch('/api/monthly-rentals/payment-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payloadRows }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        setMessage(`同步失敗：${result?.error || '伺服器更新失敗'}`)
        return
      }

      const success = Number(result?.success || 0)
      const failed = Number(result?.failed || 0)
      const historySuccess = Number(result?.historySuccess || 0)
      const historyDuplicate = Number(result?.historyDuplicate || 0)
      const historyFailed = Number(result?.historyFailed || 0)
      const pendingReview = Number(result?.pendingReview || 0)

      if (success > 0 && pendingFolderSignatures.length > 0) {
        markFolderFilesProcessed(pendingFolderSignatures)
        setPendingFolderSignatures([])
      }

      if (success > 0 && syncLotIds.length === 1) {
        setCurrentWorkParkingLot(syncLotIds[0])
      }

      if (failed === 0 && success > 0) {
        setMessage(
          `同步完成：處理 ${success} 筆，繳費歷史新增 ${historySuccess} 筆，已存在 ${historyDuplicate} 筆，待主管確認 ${pendingReview} 筆，即將返回月租管理…`
        )
        setTimeout(() => {
          window.location.href = '/dashboard/monthly-rentals'
        }, 1000)
        return
      }

      setMessage(
        `同步完成：處理 ${success} 筆、失敗 ${failed} 筆、繳費歷史新增 ${historySuccess} 筆、繳費歷史已存在 ${historyDuplicate} 筆、繳費歷史失敗 ${historyFailed} 筆、待主管確認 ${pendingReview} 筆` +
        (result?.errors?.length ? `；${result.errors.join('；')}` : '')
      )
    } catch (error: any) {
      console.error(error)
      setMessage(`同步失敗：${error?.message || '網路連線異常'}`)
    } finally {
      setSyncing(false)
    }
  }

  function clearAll() {
    setRows([])
    setFileNames([])
    setMessage('')
    setPendingFolderSignatures(
      []
    )
    setDetectedMonthlyMasterFiles(
      []
    )
    setDetectedUnknownFiles(
      []
    )

    if (
      inputRef.current
    ) {
      inputRef.current.value =
        ''
    }
  }

  const newSyncCount =
    rows.filter(
      (row) =>
        row.matched &&
        !row.duplicate
    ).length

  const duplicateRepairCount =
    rows.filter(
      (row) =>
        row.matched &&
        row.duplicate
    ).length

  const syncCount =
    newSyncCount +
    duplicateRepairCount

  const unmatchedCount =
    rows.filter(
      (row) =>
        !row.matched &&
        !row.duplicate
    ).length

  const reviewCount =
    rows.filter(
      (row) =>
        row.matched &&
        !row.duplicate &&
        paymentNeedsReview(row)
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
        accept=".csv,.CSV,.xlsx,.XLSX,.xls,.XLS"
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

      {folderName && (
        <button
          type="button"
          onClick={
            checkPaymentFolder
          }
          disabled={
            folderChecking
          }
          style={{
            marginLeft: 8,
            padding:
              '9px 14px',
            borderRadius: 8,
            border:
              '1px solid #cbd5e1',
            background:
              '#fff',
            cursor:
              folderChecking
                ? 'not-allowed'
                : 'pointer',
          }}
        >
          {folderChecking
            ? '檢查中…'
            : '檢查新報表'}
        </button>
      )}

      {folderStatus && (
        <span
          style={{
            marginLeft: 10,
            fontSize: 13,
            color:
              '#64748b',
          }}
        >
          {folderStatus}
        </span>
      )}

      {detectedMonthlyMasterFiles.length >
        0 && (
        <button
          type="button"
          onClick={() => {
            const names =
              detectedMonthlyMasterFiles.join(
                '\n'
              )

            const go =
              window.confirm(
                `已辨識為「月租總表」：\n\n${names}\n\n要前往「匯入舊系統總表」功能嗎？`
              )

            if (go) {
              window.location.href =
                '/dashboard/monthly-rentals/import-legacy'
            }
          }}
          style={{
            marginLeft: 8,
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
          月租總表 {
            detectedMonthlyMasterFiles.length
          } 份
        </button>
      )}

      {detectedUnknownFiles.length >
        0 && (
        <button
          type="button"
          onClick={() =>
            window.alert(
              `以下 CSV 無法自動分類：\n\n${detectedUnknownFiles.join(
                '\n'
              )}\n\n請確認檔名或內容格式。`
            )
          }
          style={{
            marginLeft: 8,
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
          未分類 {
            detectedUnknownFiles.length
          } 份
        </button>
      )}

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
                  可一次選擇多個交易明細 CSV，支援原本繳費機格式與一般「序號、票號、車號、實收金額」標準表頭格式。系統不限制交易名稱；有停車場名稱時使用「停車場＋車牌」比對，沒有停車場名稱時會用車牌自動尋找唯一所屬場站。只有成功匹配的月租車牌才可同步，並同時保存繳費歷史。
                </p>

                <p
                  style={{
                    color:
                      '#64748b',
                    fontSize: 13,
                    marginTop: 6,
                  }}
                >
                  也可設定固定的報表資料夾。月租總表與繳費紀錄可以放在同一個資料夾；系統會先看檔名，再用 CSV 欄位內容做第二層判斷，自動分類為「月租總表／繳費紀錄／未分類」。只有繳費紀錄會進入付款比對，月租總表不會被誤當成繳費資料。
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
                    可處理：
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
                    付款待確認：
                    <strong>
                      {reviewCount}
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
                                    : paymentNeedsReview(row)
                                      ? '#fffbeb'
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
                                  : paymentNeedsReview(row)
                                    ? '待確認'
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
