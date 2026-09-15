'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  hasOpenedNewPaymentCycle,
  nextPaymentStatusAfterRosterImport,
} from '@/lib/monthly-rental-payment-state'


type ParkingLot = {
  id: string
  name: string
}


type LegacyComparisonItem = {
  type:
    | 'joined'
    | 'recreated'
    | 'retired_protected'
    | 'cancelled'
    | 'updated'
    | 'date_only'
  customer_code: string
  customer_name: string
  vehicle_plate: string
  detail: string
}

type LegacyComparisonResult = {
  hasPreviousBatch: boolean
  baselineCount: number
  joinedCount: number
  recreatedCount: number
  retiredProtectedCount: number
  cancelledCount: number
  updatedCount: number
  dateOnlyCount: number
  unchangedCount: number
  items: LegacyComparisonItem[]
}

function LegacyImportComparison({ result }: { result: LegacyComparisonResult | null }) {
  if (!result) return null

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h3 style={{ marginTop: 0 }}>與上一份總表比對</h3>
      {!result.hasPreviousBatch ? (
        <p className="muted">目前沒有上一份總表，本次資料會建立為新的比對基準。</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <span>新增 {result.joinedCount}</span>
            <span>刪除後待重新匯入 {result.recreatedCount}</span>
            <span>正式退租保護 {result.retiredProtectedCount}</span>
            <span>退租 {result.cancelledCount}</span>
            <span>資料異動 {result.updatedCount}</span>
            <span>租期差異 {result.dateOnlyCount}（主表已保護）</span>
            <span>未異動 {result.unchangedCount}</span>
          </div>
          {result.items.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th>類型</th><th>客戶</th><th>車牌</th><th>差異</th></tr></thead>
                <tbody>
                  {result.items.slice(0, 200).map((item, index) => (
                    <tr key={`${item.vehicle_plate}-${index}`}>
                      <td>{item.type === 'joined' ? '新增' : item.type === 'recreated' ? '刪除後重匯' : item.type === 'retired_protected' ? '退租保護' : item.type === 'cancelled' ? '退租' : item.type === 'updated' ? '資料異動' : '租期差異'}</td>
                      <td>{item.customer_code ? `${item.customer_code}／` : ''}{item.customer_name || '-'}</td>
                      <td>{item.vehicle_plate || '-'}</td>
                      <td>{item.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

type MonthlyRentalTypeRule = {
  id: string
  parking_lot_id: string
  type_name: string
  vehicle_type:
    | 'car'
    | 'motorcycle'
    | 'heavy_motorcycle'
  match_amounts: string
  keywords: string
  keyword_mode:
    | 'any'
    | 'all'
  priority: number
  is_active: boolean
}

type ZeroAction =
  | 'not_applicable'
  | 'pending'
  | 'paid_short'
  | 'official_vehicle'
  | 'cancelled'

type PreviewRow = {
  customer_code: string
  vehicle_plate: string
  customer_name: string
  phone: string

  vehicle_type:
    | 'car'
    | 'motorcycle'
    | 'heavy_motorcycle'

  rental_type: string

  start_date: string
  end_date: string

  monthly_fee: number
  zero_action: ZeroAction

  transaction_no: string
  notes: string

  payment_status?:
    | 'paid'
    | 'unpaid'

  payment_date?: string
  invoice_number?: string
  source_sheet?: string

  valid: boolean
  error: string
}

/*
 * 舊系統月租總表匯入保留期限。
 * 到期日早於「今天往前 4 個月」的資料，不進入預覽、比對或正式匯入。
 */
const IMPORT_EXPIRY_RETENTION_MONTHS = 4

function importExpiryCutoffDateText() {
  const now = new Date()

  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth() -
      IMPORT_EXPIRY_RETENTION_MONTHS,
    now.getDate()
  )

  return `${cutoff.getFullYear()}-${String(
    cutoff.getMonth() + 1
  ).padStart(2, '0')}-${String(
    cutoff.getDate()
  ).padStart(2, '0')}`
}

function filterExpiredImportRows(
  sourceRows: PreviewRow[]
) {
  const cutoff =
    importExpiryCutoffDateText()

  const rows =
    sourceRows.filter(
      (row) =>
        !row.end_date ||
        row.end_date >= cutoff
    )

  return {
    rows,
    excludedCount:
      sourceRows.length -
      rows.length,
    cutoff,
  }
}

const TYPE_KEYWORDS = [
  '里民',
  '身障',
  '一般',
  '老師汽車單月',
  '老師 機車',
  '老師機車',
  '重機',
  '機車',
]

function normalizeDate(value: string) {
  const source = value.trim()

  if (!source) {
    return ''
  }

  const match = source.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/
  )

  if (!match) {
    return ''
  }

  return `${match[1]}-${match[2].padStart(
    2,
    '0'
  )}-${match[3].padStart(2, '0')}`
}


function legacyEndDateDiffSummary(
  previousEndDate?: string | null,
  currentEndDate?: string | null
) {
  const previous = normalizeDate(
    String(previousEndDate || '')
  )

  const current = normalizeDate(
    String(currentEndDate || '')
  )

  if (!previous || !current) {
    return '結束日期格式不足，不變更繳費狀態'
  }

  const previousTime = Date.parse(
    `${previous}T00:00:00Z`
  )
  const currentTime = Date.parse(
    `${current}T00:00:00Z`
  )
  const addedDays = Math.round(
    (currentTime - previousTime) / 86400000
  )

  if (addedDays === 0) {
    return '結束日期未變更，保留目前付款狀態'
  }

  if (addedDays < 0) {
    return `本期結束日期較上期提早 ${Math.abs(addedDays)} 天，不會自動改成已繳`
  }

  return `結束日期增加 ${addedDays} 天，視為開放下一期繳費並切回未繳；不代表已繳`
}

function normalizePlate(value: string) {
  return String(value || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/-/g, '')
    .toUpperCase()
}


function normalizeCustomerCode(
  value?: string | null
) {
  return String(
    value || ''
  )
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
}

function importIdentityKeys(
  row: {
    customer_code?: string | null
    vehicle_plate?: string | null
  }
) {
  const keys: string[] = []

  const customerCode =
    normalizeCustomerCode(
      row.customer_code
    )

  if (customerCode) {
    keys.push(
      `customer:${customerCode}`
    )
  }

  const plate =
    normalizePlate(
      row.vehicle_plate ||
        ''
    )

  if (plate) {
    keys.push(
      `plate:${plate}`
    )
  }

  return keys
}

function setImportIdentity<T>(
  map: Map<string, T>,
  row: {
    customer_code?: string | null
    vehicle_plate?: string | null
  },
  value: T
) {
  for (
    const key of
    importIdentityKeys(row)
  ) {
    if (!map.has(key)) {
      map.set(key, value)
    }
  }
}

function getImportIdentity<T>(
  map: Map<string, T>,
  row: {
    customer_code?: string | null
    vehicle_plate?: string | null
  }
) {
  for (
    const key of
    importIdentityKeys(row)
  ) {
    const value = map.get(key)

    if (value) {
      return value
    }
  }

  return undefined
}

function hasImportIdentity<T>(
  map: Map<string, T>,
  row: {
    customer_code?: string | null
    vehicle_plate?: string | null
  }
) {
  return importIdentityKeys(row)
    .some((key) => map.has(key))
}

function extractPhone(value: string) {
  const source =
    String(value || '')

  /*
   * 自動從備註中抓取手機號碼。
   * 支援：
   * 0912345678
   * 0912-345-678
   * 0912 345 678
   * 手機：0912345678
   */
  const mobileMatch =
    source.match(
      /09\d{2}[\s\-]?\d{3}[\s\-]?\d{3}/
    )

  if (mobileMatch) {
    return mobileMatch[0]
      .replace(/\s/g, '')
      .replace(/\-/g, '')
  }

  /*
   * 也支援少了開頭 0 的手機號碼。
   * 例如：
   * 912345678
   * 912-345-678
   * 912 345 678
   *
   * 系統會自動補成：
   * 0912345678
   */
  const mobileMissingZeroMatch =
    source.match(
      /(?:^|[^0-9])9\d{2}[\s\-]?\d{3}[\s\-]?\d{3}(?!\d)/
    )

  if (mobileMissingZeroMatch) {
    const digits =
      mobileMissingZeroMatch[0]
        .replace(/\D/g, '')

    if (digits.length === 9) {
      return `0${digits}`
    }
  }

  /*
   * 再嘗試抓取市話。
   * 支援：
   * 02-23456789
   * 02 23456789
   * 0223456789
   * 03-1234567
   */
  const landlineMatch =
    source.match(
      /0\d{1,2}[\s\-]?\d{6,8}/
    )

  if (landlineMatch) {
    return landlineMatch[0]
      .replace(/\s/g, '')
      .replace(/\-/g, '')
  }

  return ''
}

function looksLikePhone(value: string) {
  return Boolean(
    extractPhone(value)
  )
}

function removePhoneFromNote(
  value: string
) {
  const phone =
    extractPhone(value)

  if (!phone) {
    return String(value || '')
      .trim()
  }

  const source =
    String(value || '')

  /*
   * 允許備註中的電話有空格或破折號，
   * 將抓到的電話從備註中移除，
   * 其餘文字保留。
   */
  const normalizedPhonePattern =
    phone
      .split('')
      .map((char) =>
        /\d/.test(char)
          ? `${char}[\\s\\-]*`
          : char
      )
      .join('')

  return source
    .replace(
      new RegExp(
        normalizedPhonePattern,
        'i'
      ),
      ''
    )
    .replace(
      /手機|電話|聯絡電話|聯絡方式|TEL|Tel|tel/g,
      ''
    )
    .replace(
      /[:：]/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}

function detectVehicleType(
  rentalType: string,
  legacyType: string
):
  | 'car'
  | 'motorcycle'
  | 'heavy_motorcycle' {
  const source =
    `${rentalType} ${legacyType}`

  if (source.includes('重機')) {
    return 'heavy_motorcycle'
  }

  if (source.includes('機車')) {
    return 'motorcycle'
  }

  return 'car'
}

function cleanRentalType(value: string) {
  const source = String(value || '')
    .replace(/,+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (source.includes('老師汽車單月')) return '老師汽車單月'
  if (source.includes('老師') && source.includes('機車')) return '老師機車'
  if (source.includes('重機')) return '重機'
  if (source.includes('身障')) return '身障'
  if (source.includes('里民')) return '里民'
  if (source.includes('一般')) return '一般'
  if (source.includes('機車')) return '機車'
  return source
}

function splitRuleValues(
  value?: string | null
) {
  return String(
    value || ''
  )
    .split(
      /[,，、;；\n]+/
    )
    .map(
      (
        item
      ) =>
        item
          .trim()
    )
    .filter(
      Boolean
    )
}

function parseRuleAmounts(
  value?: string | null
) {
  return splitRuleValues(
    value
  )
    .map(
      (
        item
      ) =>
        Number(
          item
            .replace(
              /,/g,
              ''
            )
            .replace(
              /\$/g,
              ''
            )
        )
    )
    .filter(
      (
        amount
      ) =>
        Number.isFinite(
          amount
        )
    )
}

function rowRuleText(
  row: PreviewRow
) {
  return [
    row.rental_type ||
      '',
    row.notes ||
      '',
    row.customer_name ||
      '',
    row.vehicle_plate ||
      '',
    row.source_sheet ||
      '',
  ]
    .join(' ')
    .replace(
      /\s+/g,
      ' '
    )
    .toLowerCase()
}

function applyTypeRulesToRows(
  rows: PreviewRow[],
  rules:
    MonthlyRentalTypeRule[]
) {
  if (
    rules.length ===
    0
  ) {
    return {
      rows,
      matchedCount:
        0,
    }
  }

  let matchedCount =
    0

  const sortedRules =
    [...rules]
      .filter(
        (
          rule
        ) =>
          rule.is_active
      )
      .sort(
        (
          a,
          b
        ) =>
          Number(
            a.priority ||
              100
          ) -
          Number(
            b.priority ||
              100
          )
      )

  const nextRows =
    rows.map(
      (
        row
      ) => {
        const source =
          rowRuleText(
            row
          )

        /*
         * 新規則：
         *
         * 1. 金額是主要判斷條件。
         * 2. 只有一條金額符合 → 直接套用。
         * 3. 同一金額有多條規則 → 才用關鍵字協助挑選。
         * 4. 關鍵字都沒有命中 → 依優先順序挑第一條。
         *
         * 因此關鍵字是「輔助條件」，不是必要條件。
         */
        const amountMatchedRules =
          sortedRules.filter(
            (
              rule
            ) => {
              const amounts =
                parseRuleAmounts(
                  rule.match_amounts
                )

              /*
               * 沒有設定金額的規則不自動套用，
               * 避免單靠文字誤判整批月租資料。
               */
              if (
                amounts.length ===
                0
              ) {
                return false
              }

              return amounts.some(
                (
                  amount
                ) =>
                  Math.abs(
                    Number(
                      row.monthly_fee ||
                        0
                    ) -
                      amount
                  ) <
                  0.001
              )
            }
          )

        let matchedRule:
          MonthlyRentalTypeRule |
          undefined

        if (
          amountMatchedRules.length ===
          1
        ) {
          matchedRule =
            amountMatchedRules[0]
        } else if (
          amountMatchedRules.length >
          1
        ) {
          const keywordMatchedRules =
            amountMatchedRules.filter(
              (
                rule
              ) => {
                const keywords =
                  splitRuleValues(
                    rule.keywords
                  )
                    .map(
                      (
                        keyword
                      ) =>
                        keyword
                          .toLowerCase()
                    )

                if (
                  keywords.length ===
                  0
                ) {
                  return false
                }

                return rule.keyword_mode ===
                'all'
                  ? keywords.every(
                      (
                        keyword
                      ) =>
                        source.includes(
                          keyword
                        )
                    )
                  : keywords.some(
                      (
                        keyword
                      ) =>
                        source.includes(
                          keyword
                        )
                    )
              }
            )

          /*
           * keywordMatchedRules 本身已沿用
           * sortedRules 的優先順序。
           */
          matchedRule =
            keywordMatchedRules[0] ||
            amountMatchedRules[0]
        }

        if (
          !matchedRule
        ) {
          return row
        }

        matchedCount++

        return {
          ...row,

          rental_type:
            matchedRule.type_name,

          vehicle_type:
            matchedRule.vehicle_type,

          notes: [
            row.notes ||
              '',
            `主管類型規則：${matchedRule.type_name}`,
          ]
            .filter(
              Boolean
            )
            .join(
              ' / '
            ),
        }
      }
    )

  return {
    rows:
      nextRows,
    matchedCount,
  }
}

async function applySupervisorTypeRules(
  rows: PreviewRow[],
  parkingLotId: string
) {
  if (
    !parkingLotId ||
    rows.length ===
      0
  ) {
    return {
      rows,
      matchedCount:
        0,
      ruleCount:
        0,
    }
  }

  const supabase =
    createClient()

  const {
    data,
    error,
  } =
    await supabase
      .from(
        'monthly_rental_type_rules'
      )
      .select(`
        id,
        parking_lot_id,
        type_name,
        vehicle_type,
        match_amounts,
        keywords,
        keyword_mode,
        priority,
        is_active
      `)
      .eq(
        'parking_lot_id',
        parkingLotId
      )
      .eq(
        'is_active',
        true
      )
      .order(
        'priority',
        {
          ascending:
            true,
        }
      )

  if (
    error
  ) {
    /*
     * 若資料表尚未建立或讀取失敗，
     * 不破壞原本匯入功能。
     */
    console.error(
      '月租類型規則讀取失敗',
      error
    )

    return {
      rows,
      matchedCount:
        0,
      ruleCount:
        0,
    }
  }

  const rules =
    (data ||
      []) as MonthlyRentalTypeRule[]

  const applied =
    applyTypeRulesToRows(
      rows,
      rules
    )

  return {
    ...applied,
    ruleCount:
      rules.length,
  }
}

function isZeroRow(row: PreviewRow) {
  return Number(row.monthly_fee || 0) === 0
}

function isPendingZeroRow(row: PreviewRow) {
  return row.valid && isZeroRow(row) && row.zero_action === 'pending'
}

function isZeroCancelledRow(row: PreviewRow) {
  return row.valid && isZeroRow(row) && row.zero_action === 'cancelled'
}

function isPaidShortRow(row: PreviewRow) {
  return row.valid && isZeroRow(row) && row.zero_action === 'paid_short'
}

function isOfficialVehicleRow(row: PreviewRow) {
  return row.valid && isZeroRow(row) && row.zero_action === 'official_vehicle'
}

function isActiveImportRow(row: PreviewRow) {
  return row.valid && !isPendingZeroRow(row) && !isZeroCancelledRow(row)
}

function splitCsvLine(line: string) {
  const result: string[] = []

  let field = ''
  let quoted = false

  for (
    let i = 0;
    i < line.length;
    i++
  ) {
    const char = line[i]

    if (char === '"') {
      if (
        quoted &&
        line[i + 1] === '"'
      ) {
        field += '"'
        i++
      } else {
        quoted = !quoted
      }

      continue
    }

    if (
      char === ',' &&
      !quoted
    ) {
      result.push(field.trim())
      field = ''
      continue
    }

    field += char
  }

  result.push(field.trim())

  return result
}

async function decodeFile(file: File) {
  const buffer =
    await file.arrayBuffer()

  let result = ''

  try {
    result =
      new TextDecoder('big5').decode(
        buffer
      )
  } catch {
    result =
      new TextDecoder('utf-8').decode(
        buffer
      )
  }

  const badCount =
    (result.match(/�/g) || [])
      .length

  if (badCount > 5) {
    try {
      result =
        new TextDecoder(
          'utf-8'
        ).decode(buffer)
    } catch {
      //
    }
  }

  return result
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}


function excelSerialToDate(
  value: number
) {
  if (
    !Number.isFinite(
      value
    ) ||
    value <= 0
  ) {
    return ''
  }

  const excelEpoch =
    Date.UTC(
      1899,
      11,
      30
    )

  const date =
    new Date(
      excelEpoch +
        Math.round(
          value
        ) *
          86400000
    )

  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1
  ).padStart(
    2,
    '0'
  )}-${String(
    date.getUTCDate()
  ).padStart(
    2,
    '0'
  )}`
}

function rocYearToAd(
  rocYear: number
) {
  return rocYear + 1911
}

function endOfMonthText(
  year: number,
  month: number
) {
  const date =
    new Date(
      year,
      month,
      0
    )

  return `${year}-${String(
    month
  ).padStart(
    2,
    '0'
  )}-${String(
    date.getDate()
  ).padStart(
    2,
    '0'
  )}`
}

function normalize408Phone(
  value: any
) {
  const digits =
    String(
      value ?? ''
    )
      .replace(
        /\D/g,
        ''
      )

  if (
    digits.length === 9 &&
    digits.startsWith(
      '9'
    )
  ) {
    return `0${digits}`
  }

  return digits
}

function paymentDateFrom408Cell(
  value: any,
  periodYear: number,
  periodStartMonth: number
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return ''
  }

  if (
    typeof value ===
      'number' &&
    Number.isFinite(
      value
    )
  ) {
    return excelSerialToDate(
      value
    )
  }

  const source =
    String(
      value
    ).trim()

  if (!source) {
    return ''
  }

  const normal =
    normalizeDate(
      source
    )

  if (normal) {
    return normal
  }

  const md =
    source.match(
      /(\d{1,2})\s*月\s*(\d{1,2})\s*日/
    )

  if (md) {
    const month =
      Number(
        md[1]
      )

    const day =
      Number(
        md[2]
      )

    let year =
      periodYear

    /*
     * 例如 1-2 月期別，
     * 若繳費日在前一年的 12 月，
     * 自動往前一年。
     */
    if (
      periodStartMonth <= 2 &&
      month >= 11
    ) {
      year--
    }

    return `${year}-${String(
      month
    ).padStart(
      2,
      '0'
    )}-${String(
      day
    ).padStart(
      2,
      '0'
    )}`
  }

  return ''
}

async function parse408Workbook(
  file: File
) {
  const XLSX =
    await import(
      'xlsx'
    )

  const buffer =
    await file.arrayBuffer()

  const workbook =
    XLSX.read(
      buffer,
      {
        type:
          'array',

        cellDates:
          false,

        raw:
          true,
      }
    )

  const candidates =
    workbook.SheetNames
      .map(
        (
          sheetName
        ) => {
          const match =
            sheetName.match(
              /^408巷(\d{3})-(\d{2})-(\d{2})$/
            )

          if (!match) {
            return null
          }

          return {
            sheetName,

            rocYear:
              Number(
                match[1]
              ),

            startMonth:
              Number(
                match[2]
              ),

            endMonth:
              Number(
                match[3]
              ),
          }
        }
      )
      .filter(
        Boolean
      ) as {
        sheetName:
          string
        rocYear:
          number
        startMonth:
          number
        endMonth:
          number
      }[]

  if (
    candidates.length ===
    0
  ) {
    throw new Error(
      '這份 Excel 找不到 408巷月租工作表，例如「408巷115-09-10」。'
    )
  }

  const now =
    new Date()

  const currentRocYear =
    now.getFullYear() -
    1911

  const currentMonth =
    now.getMonth() + 1

  /*
   * 優先抓「目前月份所屬期別」。
   * 例如 2026/09 → 408巷115-09-10。
   *
   * 若沒有目前期別，才選擇日期最近且不晚於今天的期別；
   * 再沒有才退回最新期別。
   */
  let selected =
    candidates.find(
      (
        item
      ) =>
        item.rocYear ===
          currentRocYear &&
        currentMonth >=
          item.startMonth &&
        currentMonth <=
          item.endMonth
    )

  if (!selected) {
    const sortable =
      [...candidates].sort(
        (
          a,
          b
        ) =>
          (
            b.rocYear *
              100 +
            b.startMonth
          ) -
          (
            a.rocYear *
              100 +
            a.startMonth
          )
      )

    selected =
      sortable.find(
        (
          item
        ) =>
          item.rocYear <
            currentRocYear ||
          (
            item.rocYear ===
              currentRocYear &&
            item.startMonth <=
              currentMonth
          )
      ) ||
      sortable[0]
  }

  const sheet =
    workbook.Sheets[
      selected.sheetName
    ]

  const matrix =
    XLSX.utils.sheet_to_json<
      any[]
    >(
      sheet,
      {
        header:
          1,

        raw:
          true,

        defval:
          '',
      }
    )

  if (
    matrix.length <
    2
  ) {
    throw new Error(
      `${selected.sheetName} 沒有可匯入資料。`
    )
  }

  const header =
    (
      matrix[0] ||
      []
    ).map(
      (
        value
      ) =>
        String(
          value ?? ''
        )
          .replace(
            /\s+/g,
            ''
          )
          .trim()
    )

  function findColumn(
    ...names: string[]
  ) {
    for (
      const name of names
    ) {
      const index =
        header.findIndex(
          (
            item
          ) =>
            item ===
            name
        )

      if (
        index >= 0
      ) {
        return index
      }
    }

    return -1
  }

  const paymentIndex =
    findColumn(
      '繳費狀態'
    )

  const customerCodeIndex =
    findColumn(
      '客戶編號'
    )

  const plateIndex =
    findColumn(
      '車牌',
      '車號'
    )

  const customerNameIndex =
    findColumn(
      '姓名'
    )

  const phoneIndex =
    findColumn(
      '電話',
      '手機'
    )

  const feeIndex =
    findColumn(
      '金額',
      '應收費用',
      '月租金額'
    )

  const invoiceIndex =
    findColumn(
      '發票號碼',
      '發票編號'
    )

  const notesIndex =
    findColumn(
      '備註'
    )

  if (
    customerCodeIndex <
      0 ||
    plateIndex <
      0 ||
    customerNameIndex <
      0 ||
    feeIndex <
      0
  ) {
    throw new Error(
      `${selected.sheetName} 缺少必要欄位：客戶編號、車牌、姓名或金額。`
    )
  }

  const adYear =
    rocYearToAd(
      selected.rocYear
    )

  const startDate =
    `${adYear}-${String(
      selected.startMonth
    ).padStart(
      2,
      '0'
    )}-01`

  const endDate =
    endOfMonthText(
      adYear,
      selected.endMonth
    )

  const result:
    PreviewRow[] =
      []

  for (
    let rowIndex = 1;
    rowIndex <
    matrix.length;
    rowIndex++
  ) {
    const row =
      matrix[
        rowIndex
      ] ||
      []

    const customerCode =
      String(
        row[
          customerCodeIndex
        ] ??
          ''
      ).trim()

    const plate =
      String(
        row[
          plateIndex
        ] ??
          ''
      )
        .trim()
        .toUpperCase()

    const customerName =
      String(
        row[
          customerNameIndex
        ] ??
          ''
      ).trim()

    /*
     * 排除底部統計、空白列或非月租戶列。
     */
    if (
      !customerCode ||
      !plate ||
      !customerName
    ) {
      continue
    }

    const fee =
      Number(
        String(
          row[
            feeIndex
          ] ??
            0
        )
          .replace(
            /,/g,
            ''
          )
          .trim()
      ) || 0

    const paymentCell =
      paymentIndex >= 0
        ? row[
            paymentIndex
          ]
        : ''

    const paymentDate =
      paymentDateFrom408Cell(
        paymentCell,
        adYear,
        selected.startMonth
      )

    const invoiceNumber =
      invoiceIndex >= 0
        ? String(
            row[
              invoiceIndex
            ] ??
              ''
          ).trim()
        : ''

    const note =
      notesIndex >= 0
        ? String(
            row[
              notesIndex
            ] ??
              ''
          ).trim()
        : ''

    const phone =
      phoneIndex >= 0
        ? normalize408Phone(
            row[
              phoneIndex
            ]
          )
        : ''

    const typeSource =
      `${note} ${customerName}`

    result.push({
      customer_code:
        customerCode,

      vehicle_plate:
        plate,

      customer_name:
        customerName,

      phone,

      vehicle_type:
        detectVehicleType(
          typeSource,
          typeSource
        ),

      rental_type:
        cleanRentalType(
          typeSource
        ) || '',

      start_date:
        startDate,

      end_date:
        endDate,

      monthly_fee:
        fee,

      zero_action:
        fee === 0
          ? 'pending'
          : 'not_applicable',

      transaction_no:
        '',

      notes:
        [
          note,
          `408巷來源：${selected.sheetName}`,
        ]
          .filter(
            Boolean
          )
          .join(
            ' / '
          ),

      payment_status:
        paymentDate
          ? 'paid'
          : 'unpaid',

      payment_date:
        paymentDate,

      invoice_number:
        invoiceNumber,

      source_sheet:
        selected.sheetName,

      valid:
        true,

      error:
        '',
    })
  }

  return {
    rows:
      result,

    sheetName:
      selected.sheetName,

    period:
      `${startDate} 到 ${endDate}`,
  }
}

async function parseLegacyFile(
  file: File
) {
  const content =
    await decodeFile(file)

  const lines =
    content.split('\n')

  const result:
    PreviewRow[] = []

  let current:
    PreviewRow | null = null

  function finishCurrent() {
    if (!current) {
      return
    }

    if (!current.vehicle_plate) {
      current.valid = false
      current.error = '缺少車牌'
    } else if (
      !current.customer_name
    ) {
      current.valid = false
      current.error = '缺少姓名'
    } else if (
      !current.start_date
    ) {
      current.valid = false
      current.error =
        '開始日期錯誤'
    } else if (
      !current.end_date
    ) {
      current.valid = false
      current.error =
        '結束日期錯誤'
    }

    result.push(current)
    current = null
  }

  for (const rawLine of lines) {
    const line =
      rawLine.trim()

    if (!line) {
      continue
    }

    if (
      line.includes('客戶編號') &&
      line.includes('姓名')
    ) {
      continue
    }

    const columns =
      splitCsvLine(rawLine)

    const customerCode =
      String(
        columns[0] || ''
      ).trim()

    const isMainRow =
      columns.length >= 8 &&
      /^\d+$/.test(
        customerCode
      ) &&
      Boolean(columns[1]) &&
      Boolean(columns[2])

    if (isMainRow) {
      finishCurrent()

      const [
        code,
        vehiclePlate,
        customerName,
        startDateRaw,
        endDateRaw,
        monthlyFeeRaw,
        transactionNo,
        legacyType,
        ...noteParts
      ] = columns

      const originalNote =
        noteParts
          .join(',')
          .trim()

      /*
       * 舊系統的「月票種類」有些版本不在固定欄位，
       * 可能落在 legacyType 後面的延伸欄位／備註欄。
       *
       * 因此車種辨識不能只看 legacyType，
       * 要把該筆主列後半段全部一起判斷。
       *
       * 例如：
       * 時段 = 月租24H
       * 月票種類 = 機車
       * 備註 = 0939886158 里民
       *
       * 必須辨識為：
       * vehicle_type = motorcycle
       * rental_type = 里民
       */
      const typeSource =
        [
          legacyType || '',
          ...noteParts,
        ]
          .join(' ')
          .replace(/,+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

      const detectedRentalType =
        cleanRentalType(
          typeSource
        )

      const parsedMonthlyFee =
        Number(
          String(monthlyFeeRaw || '')
            .replace(/,/g, '')
            .trim()
        ) || 0

      current = {
        customer_code:
          code || '',

        vehicle_plate:
          (
            vehiclePlate ||
            ''
          )
            .trim()
            .toUpperCase(),

        customer_name:
          (
            customerName ||
            ''
          ).trim(),

        phone:
          extractPhone(
            originalNote
          ),

        vehicle_type:
          detectVehicleType(
            detectedRentalType,
            typeSource
          ),

        rental_type:
          TYPE_KEYWORDS.some(
            (keyword) =>
              typeSource.includes(
                keyword
              )
          )
            ? detectedRentalType
            : '',

        start_date:
          normalizeDate(
            startDateRaw || ''
          ),

        end_date:
          normalizeDate(
            endDateRaw || ''
          ),

        monthly_fee:
          parsedMonthlyFee,

        zero_action:
          parsedMonthlyFee === 0
            ? 'pending'
            : 'not_applicable',

        transaction_no:
          transactionNo || '',

        notes:
          removePhoneFromNote(
            originalNote
          ),

        valid: true,
        error: '',
      }

      continue
    }

    if (!current) {
      continue
    }

    const type =
      TYPE_KEYWORDS.find(
        (keyword) =>
          line === keyword ||
          line.includes(keyword)
      )

    if (type) {
      const cleanedType =
        cleanRentalType(line)

      current.rental_type =
        cleanedType

      current.vehicle_type =
        detectVehicleType(
          cleanedType,
          ''
        )

      continue
    }

    if (
      looksLikePhone(line)
    ) {
      const extractedPhone =
        extractPhone(line)

      if (
        extractedPhone &&
        !current.phone
      ) {
        current.phone =
          extractedPhone
      }

      const remainingNote =
        removePhoneFromNote(
          line
        )

      if (remainingNote) {
        current.notes = [
          current.notes,
          remainingNote,
        ]
          .filter(Boolean)
          .join(' / ')
      }

      continue
    }

    current.notes = [
      current.notes,
      line,
    ]
      .filter(Boolean)
      .join(' / ')
  }

  finishCurrent()

  /*
   * 月租總表金額為 0 元：
   * 直接略過，不進入預覽、不建立基準名單、不寫入月租主表。
   */
  return result.filter(
    (item) =>
      Number(item.monthly_fee || 0) > 0
  )
}

function sameValue(
  a: any,
  b: any
) {
  return String(
    a ?? ''
  ).trim() ===
    String(
      b ?? ''
    ).trim()
}

function createChangeDetails(
  oldRow: any,
  newRow: any
) {
  const details:
    string[] = []

  if (
    !sameValue(
      oldRow.customer_code,
      newRow.customer_code
    )
  ) {
    details.push(
      `客戶編號：${oldRow.customer_code || '-'} → ${newRow.customer_code || '-'}`
    )
  }

  if (
    !sameValue(
      oldRow.customer_name,
      newRow.customer_name
    )
  ) {
    details.push(
      `姓名：${oldRow.customer_name || '-'} → ${newRow.customer_name || '-'}`
    )
  }

  if (
    !sameValue(
      oldRow.phone,
      newRow.phone
    )
  ) {
    details.push(
      `電話：${oldRow.phone || '-'} → ${newRow.phone || '-'}`
    )
  }

  if (
    !sameValue(
      oldRow.vehicle_type,
      newRow.vehicle_type
    )
  ) {
    details.push(
      `車種：${oldRow.vehicle_type || '-'} → ${newRow.vehicle_type || '-'}`
    )
  }

  if (
    !sameValue(
      oldRow.rental_type,
      newRow.rental_type
    )
  ) {
    details.push(
      `月租類型：${oldRow.rental_type || '-'} → ${newRow.rental_type || '-'}`
    )
  }

  if (
    Number(
      oldRow.monthly_fee || 0
    ) !==
    Number(
      newRow.monthly_fee || 0
    )
  ) {
    details.push(
      `月租金額：$${Number(
        oldRow.monthly_fee || 0
      ).toLocaleString()} → $${Number(
        newRow.monthly_fee || 0
      ).toLocaleString()}`
    )
  }

  return details
}

export default function LegacyMonthlyImport({
  parkingLots,
}: {
  parkingLots: ParkingLot[]
}) {
  const inputRef =
    useRef<HTMLInputElement>(
      null
    )

  const [
    parkingLotId,
    setParkingLotId,
  ] = useState(parkingLots.length === 1 ? parkingLots[0].id : '')

  const [
    fileName,
    setFileName,
  ] = useState('')

  const [
    rows,
    setRows,
  ] =
    useState<
      PreviewRow[]
    >([])

  const [
    loading,
    setLoading,
  ] =
    useState(false)

  const [
    importing,
    setImporting,
  ] =
    useState(false)

  const [
    comparing,
    setComparing,
  ] =
    useState(false)

  const [
    comparison,
    setComparison,
  ] =
    useState<LegacyComparisonResult | null>(
      null
    )

  const [
    message,
    setMessage,
  ] =
    useState('')

  async function chooseFile(
    event:
      React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target
        .files?.[0]

    if (!file) {
      return
    }

    setLoading(true)
    setRows([])
    setComparison(null)
    setMessage('')
    setFileName(
      file.name
    )

    try {
      const is408Excel =
        /\.xlsx?$/i.test(
          file.name
        )

      if (
        is408Excel
      ) {
        const parsed408 =
          await parse408Workbook(
            file
          )

        const expiryFiltered408 =
          filterExpiredImportRows(
            parsed408.rows
          )

        const ruled408 =
          await applySupervisorTypeRules(
            expiryFiltered408.rows,
            parkingLotId
          )

        const rosterRows408 =
          ruled408.rows.map((row) => ({
            ...row,
            payment_status: 'unpaid' as const,
          }))

        setRows(rosterRows408)

        setMessage(
          `408巷 Excel 已辨識：使用工作表「${parsed408.sheetName}」，租期 ${parsed408.period}；月租 ${rosterRows408.length} 筆；名單匯入只負責更新名單／開放繳費，不會直接判定已繳。到期超過 ${IMPORT_EXPIRY_RETENTION_MONTHS} 個月排除 ${expiryFiltered408.excludedCount} 筆（門檻 ${expiryFiltered408.cutoff}）；主管類型規則 ${ruled408.ruleCount} 條，本次自動分類 ${ruled408.matchedCount} 筆。`
        )

        return
      }

      const parsed =
        await parseLegacyFile(
          file
        )

      const expiryFiltered =
        filterExpiredImportRows(
          parsed
        )

      const ruled =
        await applySupervisorTypeRules(
          expiryFiltered.rows,
          parkingLotId
        )

      const rosterRows =
        ruled.rows.map((row) => ({
          ...row,
          payment_status: 'unpaid' as const,
        }))

      setRows(rosterRows)

      const valid =
        rosterRows.filter(
          (item) => item.valid
        ).length

      const invalid =
        rosterRows.length - valid

      setMessage(
        `已辨識 ${rosterRows.length} 筆，可匯入 ${valid} 筆，格式異常 ${invalid} 筆；名單匯入只負責更新名單／開放繳費，不會直接判定已繳；到期超過 ${IMPORT_EXPIRY_RETENTION_MONTHS} 個月排除 ${expiryFiltered.excludedCount} 筆（門檻 ${expiryFiltered.cutoff}）；主管類型規則 ${ruled.ruleCount} 條，本次自動分類 ${ruled.matchedCount} 筆。`
      )
    } catch (
      error: any
    ) {
      console.error(
        error
      )

      setMessage(
        `讀取失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setLoading(false)
    }
  }

  async function compareBeforeImport() {
    if (!parkingLotId) {
      alert(
        '請先選擇停車場'
      )
      return
    }

    const unresolvedZeroRows =
      rows.filter((item) =>
        isPendingZeroRow(item)
      )

    if (unresolvedZeroRows.length > 0) {
      alert(
        `還有 ${unresolvedZeroRows.length} 筆 0 元資料尚未選擇處理方式。\n\n請先選擇「找零不足（保留名單）」或「退租」。`
      )
      return
    }

    const validRows =
      rows.filter((item) =>
        isActiveImportRow(item)
      )

    const zeroCancelledRows =
      rows.filter((item) =>
        isZeroCancelledRow(item)
      )

    if (!validRows.length && !zeroCancelledRows.length) {
      alert('沒有可以比較的資料')
      return
    }

    setComparing(true)
    setComparison(null)

    setMessage(
      '正在與上一次總表比較…'
    )

    try {
      const supabase =
        createClient()

      const {
        data:
          previousBatch,

        error:
          previousBatchError,
      } =
        await supabase
          .from(
            'monthly_import_batches'
          )
          .select(
            'id, imported_at'
          )
          .eq(
            'parking_lot_id',
            parkingLotId
          )
          .eq(
            'import_type',
            'legacy_roster'
          )
          .eq(
            'status',
            'completed'
          )
          .order(
            'imported_at',
            {
              ascending:
                false,
            }
          )
          .limit(1)
          .maybeSingle()

      if (
        previousBatchError
      ) {
        setMessage(
          `讀取上一份總表失敗：${previousBatchError.message}`
        )
        return
      }

      if (
        !previousBatch?.id
      ) {
        setComparison({
          hasPreviousBatch:
            false,

          baselineCount:
            validRows.length,

          joinedCount: 0,
          recreatedCount: 0,
          retiredProtectedCount: 0,
          cancelledCount: 0,
          updatedCount: 0,
          dateOnlyCount: 0,
          unchangedCount: 0,

          items: [],
        })

        setMessage(
          `目前沒有上一份總表，本次 ${validRows.length} 筆將建立為基準名單；人工選擇退租 ${zeroCancelledRows.length} 筆不會加入基準名單。`
        )

        return
      }

      const {
        data:
          previousMembers,

        error:
          previousError,
      } =
        await supabase
          .from(
            'monthly_import_members'
          )
          .select(`
            customer_code,
            customer_name,
            phone,
            vehicle_plate,
            vehicle_type,
            rental_type,
            start_date,
            end_date,
            monthly_fee
          `)
          .eq(
            'batch_id',
            previousBatch.id
          )

      if (
        previousError
      ) {
        setMessage(
          `讀取上一份完整總表失敗：${previousError.message}`
        )
        return
      }

      /*
       * 除了比較兩份匯入檔，也必須核對目前 monthly_rentals 主檔。
       * 否則主檔被永久刪除、但新舊 Excel 完全相同時，會被誤判為
       * 「完全未異動」，使用者看不到可重新匯入的資料。
       */
      const {
        data:
          currentRentalRows,

        error:
          currentRentalRowsError,
      } =
        await supabase
          .from(
            'monthly_rentals'
          )
          .select(`
            id,
            customer_code,
            vehicle_plate,
            rental_status
          `)
          .eq(
            'parking_lot_id',
            parkingLotId
          )

      if (
        currentRentalRowsError
      ) {
        setMessage(
          `讀取目前月租主檔失敗：${currentRentalRowsError.message}`
        )
        return
      }

      const activeRentalMap =
        new Map<
          string,
          any
        >()

      const cancelledCustomerCodes =
        new Set<string>()

      const cancelledPlates =
        new Set<string>()

      for (
        const rental of
        currentRentalRows || []
      ) {
        if (
          rental.rental_status ===
          'cancelled'
        ) {
          const cancelledCode =
            normalizeCustomerCode(
              rental.customer_code
            )

          const cancelledPlate =
            normalizePlate(
              rental.vehicle_plate
            )

          if (cancelledCode) {
            cancelledCustomerCodes.add(
              cancelledCode
            )
          }

          if (cancelledPlate) {
            cancelledPlates.add(
              cancelledPlate
            )
          }

          continue
        }

        setImportIdentity(
          activeRentalMap,
          rental,
          rental
        )
      }

      function isProtectedRetiredRow(
        row: {
          customer_code?: string | null
          vehicle_plate?: string | null
        }
      ) {
        const customerCode =
          normalizeCustomerCode(
            row.customer_code
          )

        if (customerCode) {
          return cancelledCustomerCodes.has(
            customerCode
          )
        }

        const plate =
          normalizePlate(
            row.vehicle_plate ||
              ''
          )

        return Boolean(
          plate &&
          cancelledPlates.has(plate)
        )
      }

      const previousMap =
        new Map<
          string,
          any
        >()

      for (
        const item of
        previousMembers || []
      ) {
        setImportIdentity(
          previousMap,
          item,
          item
        )
      }

      const currentMap =
        new Map<
          string,
          PreviewRow
        >()

      for (
        const item of
        validRows
      ) {
        setImportIdentity(
          currentMap,
          item,
          item
        )
      }

      let joinedCount = 0
      let recreatedCount = 0
      let retiredProtectedCount = 0
      let cancelledCount = 0
      let updatedCount = 0
      let dateOnlyCount = 0
      let unchangedCount = 0

      const items:
        LegacyComparisonResult['items'] =
          []

      for (
        const newRow of
        validRows
      ) {
        const oldRow =
          getImportIdentity(
            previousMap,
            newRow
          )

        if (
          isProtectedRetiredRow(
            newRow
          )
        ) {
          retiredProtectedCount++

          items.push({
            type:
              'retired_protected',

            customer_code:
              newRow.customer_code,

            customer_name:
              newRow.customer_name,

            vehicle_plate:
              newRow.vehicle_plate,

            detail:
              '此客戶已有正式退租紀錄，重新匯入時仍會略過',
          })

          continue
        }

        const currentRental =
          getImportIdentity(
            activeRentalMap,
            newRow
          )

        if (
          oldRow &&
          !currentRental
        ) {
          recreatedCount++

          items.push({
            type:
              'recreated',

            customer_code:
              newRow.customer_code,

            customer_name:
              newRow.customer_name,

            vehicle_plate:
              newRow.vehicle_plate,

            detail:
              '上一份匯入檔有此客戶，但目前月租主檔已被刪除；本次可重新建立',
          })

          continue
        }

        if (!oldRow) {
          joinedCount++

          items.push({
            type: 'joined',

            customer_code:
              newRow.customer_code,

            customer_name:
              newRow.customer_name,

            vehicle_plate:
              newRow.vehicle_plate,

            detail:
              '上一次總表沒有，本次新增',
          })

          continue
        }

        const contractChanges =
          createChangeDetails(
            oldRow,
            newRow
          )

        const dateChanged =
          !sameValue(
            oldRow.start_date,
            newRow.start_date
          ) ||
          !sameValue(
            oldRow.end_date,
            newRow.end_date
          )

        if (
          contractChanges.length >
          0
        ) {
          updatedCount++

          items.push({
            type: 'updated',

            customer_code:
              newRow.customer_code,

            customer_name:
              newRow.customer_name,

            vehicle_plate:
              newRow.vehicle_plate,

            detail:
              [
                ...contractChanges,
                dateChanged
                  ? legacyEndDateDiffSummary(
                      oldRow.end_date,
                      newRow.end_date
                    )
                  : '',
              ]
                .filter(Boolean)
                .join('；'),
          })

          continue
        }

        if (
          dateChanged
        ) {
          dateOnlyCount++

          items.push({
            type:
              'date_only',

            customer_code:
              newRow.customer_code,

            customer_name:
              newRow.customer_name,

            vehicle_plate:
              newRow.vehicle_plate,

            detail:
              `${oldRow.start_date || '-'} 到 ${oldRow.end_date || '-'} → ${newRow.start_date || '-'} 到 ${newRow.end_date || '-'}；${legacyEndDateDiffSummary(
                oldRow.end_date,
                newRow.end_date
              )}`,
          })

          continue
        }

        unchangedCount++
      }

      for (
        const oldRow of
        previousMembers || []
      ) {
        const oldPlateKey =
          normalizePlate(
            oldRow.vehicle_plate
          )

        if (
          hasImportIdentity(
            currentMap,
            oldRow
          )
        ) {
          continue
        }

        const explicitZeroCancel =
          zeroCancelledRows.some(
            (item) =>
              normalizePlate(item.vehicle_plate) === oldPlateKey
          )

        cancelledCount++

        items.push({
          type: 'cancelled',

          customer_code:
            oldRow.customer_code ||
            '',

          customer_name:
            oldRow.customer_name ||
            '',

          vehicle_plate:
            oldRow.vehicle_plate ||
            '',

          detail:
            explicitZeroCancel
              ? '本次總表金額為 0，人工選擇「退租」'
              : '上一次總表有，本次總表已不存在',
        })
      }

      setComparison({
        hasPreviousBatch:
          true,

        baselineCount: 0,

        joinedCount,
        recreatedCount,
        retiredProtectedCount,
        cancelledCount,
        updatedCount,
        dateOnlyCount,
        unchangedCount,

        items,
      })

      setMessage(
        `比對完成：新增 ${joinedCount} 筆、刪除後待重新匯入 ${recreatedCount} 筆、正式退租保護 ${retiredProtectedCount} 筆、退租 ${cancelledCount} 筆、簽約資料異動 ${updatedCount} 筆、總表租期不同 ${dateOnlyCount} 筆（主表不覆蓋）、完全未異動 ${unchangedCount} 筆；0 元「找零不足（待繳費紀錄）」 ${validRows.filter((item) => isPaidShortRow(item)).length} 筆；公務車 ${validRows.filter((item) => isOfficialVehicleRow(item)).length} 筆。`
      )
    } catch (
      error: any
    ) {
      console.error(
        error
      )

      setMessage(
        `比對失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setComparing(false)
    }
  }

  async function confirmImport() {
    if (!parkingLotId) {
      alert(
        '請先選擇停車場'
      )
      return
    }

    const unresolvedZeroRows =
      rows.filter((item) =>
        isPendingZeroRow(item)
      )

    if (unresolvedZeroRows.length > 0) {
      alert(
        `還有 ${unresolvedZeroRows.length} 筆 0 元資料尚未選擇處理方式。\n\n請先選擇「找零不足（保留名單）」或「退租」。`
      )
      return
    }

    const validRows =
      rows.filter((item) =>
        isActiveImportRow(item)
      )

    const zeroCancelledRows =
      rows.filter((item) =>
        isZeroCancelledRow(item)
      )

    if (!validRows.length && !zeroCancelledRows.length) {
      alert('沒有可以匯入的資料')
      return
    }

    const selectedLot =
      parkingLots.find(
        (lot) =>
          lot.id ===
          parkingLotId
      )

    const confirmed =
      window.confirm(
        `請再次確認：\n\n` +
          `停車場：${selectedLot?.name || '-'}\n` +
          `檔案：${fileName}\n` +
          `有效月租：${validRows.length} 筆\n` +
          `0 元人工退租：${zeroCancelledRows.length} 筆\n` +
          `0 元找零不足（保留名單，仍需繳費紀錄）：${validRows.filter((item) => isPaidShortRow(item)).length} 筆\n` +
          `0 元公務車：${validRows.filter((item) => isOfficialVehicleRow(item)).length} 筆\n\n` +
          `既有月租的正式租期不會被本次總表覆蓋；新戶優先套用目前場站租期。\n\n` +
          `確定正式匯入嗎？`
      )

    if (!confirmed) {
      return
    }

    setImporting(true)

    setMessage(
      '正在正式匯入…'
    )

    const supabase =
      createClient()

    let batchId = ''

    try {
      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser()

      if (!user) {
        setMessage(
          '登入狀態失效，請重新登入'
        )
        return
      }

      /*
       * 第 23 階段：匯入總表不得決定既有月租的正式租期。
       * 新加入的月租戶，優先使用主管為該場設定的目前抽籤／年度租期；
       * 若尚未設定，才以舊檔內日期做第一次建立。
       */
      const { data: activeRentalTerm, error: activeRentalTermError } =
        await supabase
          .from('parking_lot_rental_terms')
          .select('id,start_date,end_date,term_name')
          .eq('parking_lot_id', parkingLotId)
          .eq('is_active', true)
          .maybeSingle()

      if (activeRentalTermError) {
        setMessage(`讀取目前場站租期失敗：${activeRentalTermError.message}`)
        return
      }

      const {
        data:
          previousBatch,

        error:
          previousBatchError,
      } =
        await supabase
          .from(
            'monthly_import_batches'
          )
          .select(
            'id, imported_at'
          )
          .eq(
            'parking_lot_id',
            parkingLotId
          )
          .eq(
            'import_type',
            'legacy_roster'
          )
          .eq(
            'status',
            'completed'
          )
          .order(
            'imported_at',
            {
              ascending:
                false,
            }
          )
          .limit(1)
          .maybeSingle()

      if (
        previousBatchError
      ) {
        setMessage(
          `讀取上一份總表失敗：${previousBatchError.message}`
        )
        return
      }

      const {
        data:
          newBatch,

        error:
          batchError,
      } =
        await supabase
          .from(
            'monthly_import_batches'
          )
          .insert({
            parking_lot_id:
              parkingLotId,

            import_type:
              'legacy_roster',

            file_name:
              fileName,

            total_rows:
              validRows.length,

            status:
              'processing',

            imported_by:
              user.id,
          })
          .select('id')
          .single()

      if (
        batchError ||
        !newBatch
      ) {
        setMessage(
          `建立匯入批次失敗：${
            batchError?.message ||
            '未知錯誤'
          }`
        )
        return
      }

      batchId =
        newBatch.id

      const importMembers =
        validRows.map(
          (row) => ({
            batch_id:
              batchId,

            parking_lot_id:
              parkingLotId,

            customer_code:
              row.customer_code ||
              null,

            customer_name:
              row.customer_name,

            phone:
              row.phone ||
              null,

            vehicle_plate:
              row.vehicle_plate,

            vehicle_type:
              row.vehicle_type,

            rental_type:
              row.rental_type ||
              null,

            start_date:
              row.start_date ||
              null,

            end_date:
              row.end_date ||
              null,

            monthly_fee:
              row.monthly_fee,

            transaction_no:
              row.transaction_no ||
              null,

            notes:
              row.notes ||
              null,
          })
        )

      for (
        let index = 0;
        index <
        importMembers.length;
        index += 200
      ) {
        const chunk =
          importMembers.slice(
            index,
            index + 200
          )

        const {
          error:
            memberInsertError,
        } =
          await supabase
            .from(
              'monthly_import_members'
            )
            .insert(chunk)

        if (
          memberInsertError
        ) {
          await supabase
            .from(
              'monthly_import_batches'
            )
            .update({
              status:
                'failed',

              notes:
                memberInsertError.message,
            })
            .eq(
              'id',
              batchId
            )

          setMessage(
            `保存本次總表失敗：${memberInsertError.message}`
          )

          return
        }
      }

      let previousMembers:
        any[] = []

      if (
        previousBatch?.id
      ) {
        const {
          data,
          error,
        } =
          await supabase
            .from(
              'monthly_import_members'
            )
            .select('*')
            .eq(
              'batch_id',
              previousBatch.id
            )

        if (error) {
          setMessage(
            `讀取上一份總表失敗：${error.message}`
          )
          return
        }

        previousMembers =
          data || []
      }

      const previousMap =
        new Map<
          string,
          any
        >()

      for (
        const row of
        previousMembers
      ) {
        setImportIdentity(
          previousMap,
          row,
          row
        )
      }

      const newMap =
        new Map<
          string,
          PreviewRow
        >()

      for (
        const row of
        validRows
      ) {
        setImportIdentity(
          newMap,
          row,
          row
        )
      }

      const {
        data:
          currentRentals,

        error:
          currentRentalError,
      } =
        await supabase
          .from(
            'monthly_rentals'
          )
          .select('*')
          .eq(
            'parking_lot_id',
            parkingLotId
          )

      if (
        currentRentalError
      ) {
        setMessage(
          `月租資料讀取失敗：${currentRentalError.message}`
        )
        return
      }

      /*
       * 已退租保護：
       * - 有客戶編號時，以「同停車場 + 客戶編號」優先判斷。
       * - 沒有客戶編號時，才改用「同停車場 + 車牌」判斷。
       *
       * 只要 monthly_rentals 內已存在 cancelled 歷史，
       * 之後重新匯入舊總表時都不會把它改回 active，
       * 也不會重新新增回月租總表。
       */
      const cancelledCustomerCodes =
        new Set<string>()

      const cancelledPlates =
        new Set<string>()

      for (
        const rental of
        currentRentals ||
        []
      ) {
        if (
          rental.rental_status !==
          'cancelled'
        ) {
          continue
        }

        const code =
          normalizeCustomerCode(
            rental.customer_code
          )

        const plate =
          normalizePlate(
            rental.vehicle_plate
          )

        if (code) {
          cancelledCustomerCodes.add(
            code
          )
        }

        if (plate) {
          cancelledPlates.add(
            plate
          )
        }
      }

      function isRetiredImportRow(
        row: {
          customer_code?: string | null
          vehicle_plate?: string | null
        }
      ) {
        const code =
          normalizeCustomerCode(
            row.customer_code
          )

        if (code) {
          return cancelledCustomerCodes.has(
            code
          )
        }

        const plate =
          normalizePlate(
            row.vehicle_plate ||
              ''
          )

        return Boolean(
          plate &&
            cancelledPlates.has(
              plate
            )
        )
      }

      const effectiveRows =
        validRows.filter(
          (row) =>
            !isRetiredImportRow(
              row
            )
        )

      const retiredSkipped =
        validRows.length -
        effectiveRows.length

      /*
       * 重建本次有效名單。
       * 已退租資料即使再次出現在匯入檔，
       * 也不視為目前有效月租戶。
       */
      newMap.clear()

      for (
        const row of
        effectiveRows
      ) {
        setImportIdentity(
          newMap,
          row,
          row
        )
      }

      const rentalMapByPlate =
        new Map<
          string,
          any
        >()

      const rentalMapByCustomerCode =
        new Map<
          string,
          any
        >()

      for (
        const rental of
        currentRentals ||
        []
      ) {
        /*
         * cancelled 只作為歷史保護資料，
         * 絕對不拿來做「重新啟用」更新。
         */
        if (
          rental.rental_status ===
          'cancelled'
        ) {
          continue
        }

        const plateKey =
          normalizePlate(
            rental.vehicle_plate
          )

        const customerCodeKey =
          normalizeCustomerCode(
            rental.customer_code
          )

        if (
          customerCodeKey &&
          !rentalMapByCustomerCode.has(
            customerCodeKey
          )
        ) {
          rentalMapByCustomerCode.set(
            customerCodeKey,
            rental
          )
        }

        if (
          plateKey &&
          !rentalMapByPlate.has(
            plateKey
          )
        ) {
          rentalMapByPlate.set(
            plateKey,
            rental
          )
        }
      }

      /*
       * 月租主檔比對規則：
       * 1. 同停車場 + 客戶編號優先（車牌日後可能更換）。
       * 2. 匯入列沒有客戶編號，或找不到編號時，才以車牌備援。
       *
       * 永久刪除的資料不會出現在這兩張 Map；若仍存在上一批
       * 匯入名單，本次會在下方走「重新建立」而不是匯入失敗。
       */
      function findCurrentRental(
        row: {
          customer_code?: string | null
          vehicle_plate?: string | null
        }
      ) {
        const customerCodeKey =
          normalizeCustomerCode(
            row.customer_code
          )

        if (customerCodeKey) {
          const byCustomerCode =
            rentalMapByCustomerCode.get(
              customerCodeKey
            )

          if (byCustomerCode) {
            return byCustomerCode
          }
        }

        const plateKey =
          normalizePlate(
            row.vehicle_plate ||
              ''
          )

        return plateKey
          ? rentalMapByPlate.get(
              plateKey
            )
          : undefined
      }

      let inserted = 0
      let updated = 0
      let cancelled = 0
      let unchanged = 0
      let dateOnlyChanged = 0
      let paidShortUpdated = 0
      let officialVehicleUpdated = 0
      let paymentCycleOpenedCount = 0
      let recreatedAfterDelete = 0
      let failed = 0

      for (
        const newRow of
        effectiveRows
      ) {
        const previous =
          getImportIdentity(
            previousMap,
            newRow
          )

        const currentRental =
          findCurrentRental(
            newRow
          )

        const paymentCycleOpened =
          Boolean(
            previous &&
              hasOpenedNewPaymentCycle(
                previous.end_date,
                newRow.end_date
              )
          )

        /*
         * 名單匯入與繳費紀錄完全分開：
         * - 新資料：未繳
         * - 舊系統到期日往後：只代表開放下一期繳費，因此改成未繳
         * - 同一週期重匯／更新姓名電話車牌：保留目前付款狀態
         * - 名單內的日期、付款日期、發票欄位都不能直接把人改成已繳
         *
         * 真正的「已繳」只由收款／繳費報表先建立繳費紀錄後設定。
         */
        const nextPaymentStatus =
          nextPaymentStatusAfterRosterImport({
            currentStatus:
              currentRental?.payment_status,
            cycleOpened:
              paymentCycleOpened,
            isNewRental:
              !currentRental,
          })

        const importedNotes =
          [
            newRow.notes,

            newRow.transaction_no
              ? `交易序號：${newRow.transaction_no}`
              : '',

            isPaidShortRow(newRow)
              ? '0元處理：找零不足（保留名單，仍需繳費紀錄）'
              : isOfficialVehicleRow(newRow)
                ? '0元處理：公務車'
                : '',
          ]
            .filter(Boolean)
            .join(' / ')

        if (
          !previous ||
          !currentRental
        ) {
          if (!currentRental) {
            const {
              data:
                createdRental,

              error:
                createError,
            } =
              await supabase
                .from(
                  'monthly_rentals'
                )
                .insert({
                  parking_lot_id:
                    parkingLotId,

                  customer_code:
                    newRow.customer_code ||
                    null,

                  customer_name:
                    newRow.customer_name,

                  phone:
                    newRow.phone ||
                    null,

                  vehicle_plate:
                    newRow.vehicle_plate,

                  vehicle_type:
                    newRow.vehicle_type,

                  rental_type:
                    newRow.rental_type ||
                    null,

                  start_date:
                    activeRentalTerm?.start_date || newRow.start_date,

                  end_date:
                    activeRentalTerm?.end_date || newRow.end_date,

                  rental_term_id:
                    activeRentalTerm?.id || null,

                  rental_term_locked:
                    Boolean(activeRentalTerm?.id),

                  data_source:
                    'legacy_import',

                  monthly_fee:
                    newRow.monthly_fee,

                  payment_status:
                    nextPaymentStatus,

                  rental_status:
                    'active',

                  payment_date: null,

                  invoice_number: null,

                  last_payment_source: null,

                  notes:
                    importedNotes ||
                    null,

                  created_by:
                    user.id,

                  last_import_batch_id:
                    batchId,
                })
                .select('id')
                .single()

            if (
              createError ||
              !createdRental
            ) {
              console.error(
                createError
              )

              failed++
              continue
            }

            await supabase
              .from(
                'monthly_import_snapshots'
              )
              .insert({
                batch_id:
                  batchId,

                parking_lot_id:
                  parkingLotId,

                monthly_rental_id:
                  createdRental.id,

                action_type:
                  'insert',

                customer_code:
                  newRow.customer_code ||
                  null,

                customer_name:
                  newRow.customer_name,

                phone:
                  newRow.phone ||
                  null,

                vehicle_plate:
                  newRow.vehicle_plate,

                vehicle_type:
                  newRow.vehicle_type,

                rental_type:
                  newRow.rental_type ||
                  null,

                /*
                 * 正式租期保護：既有資料的 start_date / end_date
                 * 不由匯入總表更新。
                 */

                monthly_fee:
                  newRow.monthly_fee,

                payment_status:
                  nextPaymentStatus,

                rental_status:
                  'active',

                payment_date:
                  null,

                invoice_number:
                  null,

                notes:
                  importedNotes ||
                  null,
              })

            if (
              previousBatch?.id
            ) {
              const {
                error:
                  joinedChangeError,
              } =
                await supabase
                  .from(
                    'monthly_rental_changes'
                  )
                  .insert({
                    parking_lot_id:
                      parkingLotId,

                    monthly_rental_id:
                      createdRental.id,

                    customer_code:
                      newRow.customer_code ||
                      null,

                    customer_name:
                      newRow.customer_name,

                    phone:
                      newRow.phone ||
                      null,

                    vehicle_plate:
                      newRow.vehicle_plate,

                    vehicle_type:
                      newRow.vehicle_type,

                    rental_type:
                      newRow.rental_type ||
                      null,

                    change_type:
                      'joined',

                    effective_date:
                      new Date()
                        .toISOString()
                        .slice(
                          0,
                          10
                        ),

                    reason:
                      '與上一次總表比較',

                    change_detail:
                      previous
                        ? '月租主檔曾被永久刪除，本次匯入已自動重新建立'
                        : '上一次總表無此月租戶，本次總表新增',

                    source:
                      'legacy_import',

                    import_batch_id:
                      batchId,

                    created_by:
                      user.id,
                  })

              if (
                joinedChangeError
              ) {
                console.error(
                  joinedChangeError
                )
              }
            }

            inserted++

            if (previous) {
              recreatedAfterDelete++
            }

            continue
          }

          await supabase
            .from(
              'monthly_import_snapshots'
            )
            .insert({
              batch_id:
                batchId,

              parking_lot_id:
                parkingLotId,

              monthly_rental_id:
                currentRental.id,

              action_type:
                'update',

              customer_code:
                currentRental.customer_code,

              customer_name:
                currentRental.customer_name,

              phone:
                currentRental.phone,

              vehicle_plate:
                currentRental.vehicle_plate,

              vehicle_type:
                currentRental.vehicle_type,

              rental_type:
                currentRental.rental_type,

              start_date:
                currentRental.start_date,

              end_date:
                currentRental.end_date,

              monthly_fee:
                currentRental.monthly_fee,

              payment_status:
                currentRental.payment_status,

              rental_status:
                currentRental.rental_status,

              payment_date:
                currentRental.payment_date,

              invoice_number:
                currentRental.invoice_number,

              notes:
                currentRental.notes,
            })

          const {
            error:
              updateExistingError,
          } =
            await supabase
              .from(
                'monthly_rentals'
              )
              .update({
                customer_code:
                  newRow.customer_code ||
                  null,

                customer_name:
                  newRow.customer_name,

                phone:
                  newRow.phone ||
                  null,

                vehicle_plate:
                  newRow.vehicle_plate,

                vehicle_type:
                  newRow.vehicle_type,

                rental_type:
                  newRow.rental_type ||
                  null,

                /*
                 * 第 23 階段正式租期保護：既有月租不接受總表覆蓋日期。
                 */

                monthly_fee:
                  newRow.monthly_fee,

                rental_status:
                  'active',

                // 重匯同一週期保留付款；開新週期則回到未繳。
                payment_status:
                  nextPaymentStatus,

                notes:
                  importedNotes ||
                  null,

                last_import_batch_id:
                  batchId,

                updated_at:
                  new Date()
                    .toISOString(),
              })
              .eq(
                'id',
                currentRental.id
              )

          if (
            updateExistingError
          ) {
            failed++
            continue
          }

          if (
            previousBatch?.id
          ) {
            await supabase
              .from(
                'monthly_rental_changes'
              )
              .insert({
                parking_lot_id:
                  parkingLotId,

                monthly_rental_id:
                  currentRental.id,

                customer_code:
                  newRow.customer_code ||
                  null,

                customer_name:
                  newRow.customer_name,

                phone:
                  newRow.phone ||
                  null,

                vehicle_plate:
                  newRow.vehicle_plate,

                vehicle_type:
                  newRow.vehicle_type,

                rental_type:
                  newRow.rental_type ||
                  null,

                change_type:
                  'joined',

                effective_date:
                  new Date()
                    .toISOString()
                    .slice(
                      0,
                      10
                    ),

                reason:
                  '與上一次總表比較',

                change_detail:
                  '上一次總表無此資料，本次總表出現',

                source:
                  'legacy_import',

                import_batch_id:
                  batchId,

                created_by:
                  user.id,
              })
          }

          inserted++
          continue
        }

        const contractChanges =
          createChangeDetails(
            previous,
            newRow
          )

        const dateChanged =
          !sameValue(
            previous.start_date,
            newRow.start_date
          ) ||
          !sameValue(
            previous.end_date,
            newRow.end_date
          )

        const paymentChanged =
          !sameValue(
            currentRental?.payment_status,
            nextPaymentStatus
          )

        const anyMainDataChanged =
          contractChanges.length >
            0 ||
          dateChanged ||
          isPaidShortRow(newRow) ||
          paymentChanged

        if (
          !anyMainDataChanged
        ) {
          unchanged++
          continue
        }

        if (!currentRental) {
          failed++
          continue
        }

        const {
          error:
            snapshotError,
        } =
          await supabase
            .from(
              'monthly_import_snapshots'
            )
            .insert({
              batch_id:
                batchId,

              parking_lot_id:
                parkingLotId,

              monthly_rental_id:
                currentRental.id,

              action_type:
                'update',

              customer_code:
                currentRental.customer_code,

              customer_name:
                currentRental.customer_name,

              phone:
                currentRental.phone,

              vehicle_plate:
                currentRental.vehicle_plate,

              vehicle_type:
                currentRental.vehicle_type,

              rental_type:
                currentRental.rental_type,

              start_date:
                currentRental.start_date,

              end_date:
                currentRental.end_date,

              monthly_fee:
                currentRental.monthly_fee,

              payment_status:
                currentRental.payment_status,

              rental_status:
                currentRental.rental_status,

              payment_date:
                currentRental.payment_date,

              invoice_number:
                currentRental.invoice_number,

              notes:
                currentRental.notes,
            })

        if (
          snapshotError
        ) {
          failed++
          continue
        }

        const {
          error:
            updateError,
        } =
          await supabase
            .from(
              'monthly_rentals'
            )
            .update({
              customer_code:
                newRow.customer_code ||
                null,

              customer_name:
                newRow.customer_name,

              phone:
                newRow.phone ||
                null,

              vehicle_plate:
                newRow.vehicle_plate,

              vehicle_type:
                newRow.vehicle_type,

              rental_type:
                newRow.rental_type ||
                null,

              /*
               * 正式租期保護：即使新總表日期不同，也保留既有租期。
               */

              monthly_fee:
                newRow.monthly_fee,

              rental_status:
                'active',

              /*
               * 付款狀態規則：
               * - 到期日延長 = 開放下一期繳費，狀態改為未繳
               * - 同一份名單重匯／基本資料更新 = 保留目前付款狀態
               * - 名單匯入永遠不會直接標成已繳
               */
              payment_status:
                nextPaymentStatus,

              notes:
                importedNotes ||
                null,

              last_import_batch_id:
                batchId,

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              'id',
              currentRental.id
            )

        if (
          updateError
        ) {
          failed++
          continue
        }

        /*
         * 舊系統總表日期延長只用來「開放下一期繳費」。
         * 不再依日期差異自動建立任何繳費月份，也不改寫付款歷史。
         */
        if (paymentCycleOpened) {
          paymentCycleOpenedCount++
        }

        if (
          contractChanges.length >
          0
        ) {
          const {
            error:
              changeError,
          } =
            await supabase
              .from(
                'monthly_rental_changes'
              )
              .insert({
                parking_lot_id:
                  parkingLotId,

                monthly_rental_id:
                  currentRental.id,

                customer_code:
                  newRow.customer_code ||
                  null,

                customer_name:
                  newRow.customer_name,

                phone:
                  newRow.phone ||
                  null,

                vehicle_plate:
                  newRow.vehicle_plate,

                vehicle_type:
                  newRow.vehicle_type,

                rental_type:
                  newRow.rental_type ||
                  null,

                change_type:
                  'updated',

                effective_date:
                  new Date()
                    .toISOString()
                    .slice(
                      0,
                      10
                    ),

                reason:
                  '與上一次總表比較',

                change_detail:
                  contractChanges.join(
                    '；'
                  ),

                source:
                  'legacy_import',

                import_batch_id:
                  batchId,

                created_by:
                  user.id,
              })

          if (
            changeError
          ) {
            failed++
            continue
          }

          updated++
        } else if (dateChanged) {
          dateOnlyChanged++
        } else if (paymentChanged) {
          updated++
        } else if (isPaidShortRow(newRow)) {
          paidShortUpdated++
        } else if (isOfficialVehicleRow(newRow)) {
          officialVehicleUpdated++
        }
      }

      if (
        previousBatch?.id
      ) {
        for (
          const oldRow of
          previousMembers
        ) {
          /*
           * 已經是退租歷史的資料不要重複建立退租紀錄。
           */
          if (
            isRetiredImportRow(
              oldRow
            )
          ) {
            continue
          }

          const oldPlateKey =
            normalizePlate(
              oldRow.vehicle_plate
            )

          if (
            hasImportIdentity(
              newMap,
              oldRow
            )
          ) {
            continue
          }

          const currentRental =
            findCurrentRental(
              oldRow
            )

          if (currentRental) {
            const {
              error:
                cancelSnapshotError,
            } =
              await supabase
                .from(
                  'monthly_import_snapshots'
                )
                .insert({
                  batch_id:
                    batchId,

                  parking_lot_id:
                    parkingLotId,

                  monthly_rental_id:
                    currentRental.id,

                  action_type:
                    'cancel',

                  customer_code:
                    currentRental.customer_code,

                  customer_name:
                    currentRental.customer_name,

                  phone:
                    currentRental.phone,

                  vehicle_plate:
                    currentRental.vehicle_plate,

                  vehicle_type:
                    currentRental.vehicle_type,

                  rental_type:
                    currentRental.rental_type,

                  start_date:
                    currentRental.start_date,

                  end_date:
                    currentRental.end_date,

                  monthly_fee:
                    currentRental.monthly_fee,

                  payment_status:
                    currentRental.payment_status,

                  rental_status:
                    currentRental.rental_status,

                  payment_date:
                    currentRental.payment_date,

                  invoice_number:
                    currentRental.invoice_number,

                  notes:
                    currentRental.notes,
                })

            if (
              cancelSnapshotError
            ) {
              failed++
              continue
            }

            const {
              error:
                cancelError,
            } =
              await supabase
                .from(
                  'monthly_rentals'
                )
                .update({
                  rental_status:
                    'cancelled',

                  last_import_batch_id:
                    batchId,

                  updated_at:
                    new Date()
                      .toISOString(),
                })
                .eq(
                  'id',
                  currentRental.id
                )

            if (
              cancelError
            ) {
              failed++
              continue
            }

            const {
              data:
                autoChange,
            } =
              await supabase
                .from(
                  'monthly_rental_changes'
                )
                .select('id')
                .eq(
                  'monthly_rental_id',
                  currentRental.id
                )
                .eq(
                  'change_type',
                  'cancelled'
                )
                .order(
                  'created_at',
                  {
                    ascending:
                      false,
                  }
                )
                .limit(1)
                .maybeSingle()

            if (
              autoChange?.id
            ) {
              await supabase
                .from(
                  'monthly_rental_changes'
                )
                .update({
                  import_batch_id:
                    batchId,

                  source:
                    'legacy_import',

                  reason:
                    '與上一次總表比較',

                  change_detail:
                    zeroCancelledRows.some(
                      (item) =>
                        normalizePlate(item.vehicle_plate) === oldPlateKey
                    )
                      ? '本次總表金額為 0，人工選擇「退租」'
                      : '上一次總表有此月租戶，本次總表已不存在',
                })
                .eq(
                  'id',
                  autoChange.id
                )
            }
          } else {
            const {
              error:
                directCancelError,
            } =
              await supabase
                .from(
                  'monthly_rental_changes'
                )
                .insert({
                  parking_lot_id:
                    parkingLotId,

                  monthly_rental_id:
                    null,

                  customer_code:
                    oldRow.customer_code ||
                    null,

                  customer_name:
                    oldRow.customer_name,

                  phone:
                    oldRow.phone ||
                    null,

                  vehicle_plate:
                    oldRow.vehicle_plate,

                  vehicle_type:
                    oldRow.vehicle_type,

                  rental_type:
                    oldRow.rental_type ||
                    null,

                  change_type:
                    'cancelled',

                  effective_date:
                    new Date()
                      .toISOString()
                      .slice(
                        0,
                        10
                      ),

                  reason:
                    '與上一次總表比較',

                  change_detail:
                    zeroCancelledRows.some(
                      (item) =>
                        normalizePlate(item.vehicle_plate) === oldPlateKey
                    )
                      ? '本次總表金額為 0，人工選擇「退租」'
                      : '上一次總表有此月租戶，本次總表已不存在',

                  source:
                    'legacy_import',

                  import_batch_id:
                    batchId,

                  created_by:
                    user.id,
                })

            if (
              directCancelError
            ) {
              failed++
              continue
            }
          }

          cancelled++
        }
      }

      const finalStatus =
        failed === 0
          ? 'completed'
          : 'failed'

      await supabase
        .from(
          'monthly_import_batches'
        )
        .update({
          inserted_rows:
            inserted,

          updated_rows:
            updated,

          cancelled_rows:
            cancelled,

          status:
            finalStatus,

          notes:
            `新加入 ${inserted} 筆（其中刪除後重新匯入 ${recreatedAfterDelete} 筆）；簽約資料異動 ${updated} 筆；退租 ${cancelled} 筆；已退租保護略過 ${retiredSkipped} 筆；總表租期不同但已保護 ${dateOnlyChanged} 筆；開放新繳費週期 ${paymentCycleOpenedCount} 筆；0元找零不足保留名單 ${paidShortUpdated} 筆；公務車 ${officialVehicleUpdated} 筆；完全未異動 ${unchanged} 筆；失敗 ${failed} 筆`,
        })
        .eq(
          'id',
          batchId
        )

      setMessage(
        `匯入完成：
新增 ${inserted} 筆、
其中刪除後重新匯入 ${recreatedAfterDelete} 筆、
簽約資料異動 ${updated} 筆、
退租 ${cancelled} 筆、
已退租保護略過 ${retiredSkipped} 筆、
總表租期不同但已保護 ${dateOnlyChanged} 筆、
開放新繳費週期 ${paymentCycleOpenedCount} 筆、
0元找零不足保留名單 ${paidShortUpdated} 筆、
公務車 ${officialVehicleUpdated} 筆、
完全未異動 ${unchanged} 筆、
失敗 ${failed} 筆。`
      )

      if (
        failed === 0
      ) {
        setTimeout(() => {
          window.location.href =
            '/dashboard/monthly-rentals'
        }, 1200)
      }
    } catch (
      error: any
    ) {
      console.error(error)

      if (batchId) {
        await supabase
          .from(
            'monthly_import_batches'
          )
          .update({
            status:
              'failed',

            notes:
              error?.message ||
              '未知錯誤',
          })
          .eq(
            'id',
            batchId
          )
      }

      setMessage(
        `匯入失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setImporting(false)
    }
  }

  function clearFile() {
    setRows([])
    setFileName('')
    setMessage('')
    setComparison(null)

    if (
      inputRef.current
    ) {
      inputRef.current.value =
        ''
    }
  }

  const validCount =
    rows.filter(
      (item) =>
        item.valid
    ).length

  const invalidCount =
    rows.length -
    validCount

  const unresolvedZeroCount =
    rows.filter((item) =>
      isPendingZeroRow(item)
    ).length

  const zeroCancelledCount =
    rows.filter((item) =>
      isZeroCancelledRow(item)
    ).length

  const paidShortCount =
    rows.filter((item) =>
      isPaidShortRow(item)
    ).length

  const activeImportCount =
    rows.filter((item) =>
      isActiveImportRow(item)
    ).length

  return (
    <div>
      <div className="card">
        <h2
          style={{
            marginTop: 0,
          }}
        >
          匯入舊系統月租總表
        </h2>

        <p className="muted">
          先分析與上一份舊系統總表的差異，確認後才正式匯入。固定匯入參數：到期日超過 {IMPORT_EXPIRY_RETENTION_MONTHS} 個月的資料不列入名單；辨識完成後會顯示本次排除筆數與門檻日期。正式租期仍以主管設定為準，不會被舊系統日期覆蓋。舊系統到期日若比上一份總表往後，只代表「開放下一期繳費」，會把本期狀態設為未繳；同一份名單重匯或只更新姓名、電話、車牌等資料，不會改動既有付款狀態。只有「收款」或「繳費紀錄上傳」成功建立真正繳費紀錄後才會成為已繳；總表本身不再建立繳費月份，也不會直接判定已繳。月租總表內金額為 0 元的資料會依 0 元處理規則決定是否匯入。備註內若含手機或市話，系統會自動辨識電話號碼，不需要特殊格式；手機若少了開頭 0（例如 912345678），也會自動補成 0912345678。
        </p>

        <div
          className="field"
          style={{
            maxWidth: 520,
          }}
        >
          <label>
            停車場
          </label>

          <select
            value={
              parkingLotId
            }
            onChange={(
              event
            ) => {
              setParkingLotId(
                event.target
                  .value
              )

              setRows([])
              setFileName('')
              setMessage('')
              setComparison(null)

              if (
                inputRef.current
              ) {
                inputRef.current.value =
                  ''
              }
            }}
          >
            <option value="">
              請選擇停車場
            </option>

            {parkingLots.map(
              (lot) => (
                <option
                  key={lot.id}
                  value={lot.id}
                >
                  {lot.name}
                </option>
              )
            )}
          </select>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.CSV,.xlsx,.XLSX,.xls,.XLS"
          onChange={
            chooseFile
          }
          style={{
            display: 'none',
          }}
        />

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 16,
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            className="btn"
            disabled={
              loading ||
              importing ||
              comparing ||
              !parkingLotId
            }
            onClick={() =>
              inputRef.current?.click()
            }
          >
            {loading
              ? '讀取中…'
              : '選擇月票 CSV'}
          </button>

          {rows.length >
            0 && (
            <button
              type="button"
              disabled={
                comparing ||
                importing ||
                validCount === 0 ||
                unresolvedZeroCount > 0
              }
              onClick={
                compareBeforeImport
              }
              style={{
                padding:
                  '9px 14px',

                border:
                  '1px solid #cbd5e1',

                borderRadius: 8,

                background:
                  '#fff',

                color:
                  '#0f172a',

                fontWeight: 700,

                cursor:
                  comparing
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {comparing
                ? '正在比對…'
                : '先分析異動'}
            </button>
          )}

          {rows.length >
            0 && (
            <button
              type="button"
              className="btn"
              disabled={
                importing ||
                comparing ||
                activeImportCount === 0
              }
              onClick={
                confirmImport
              }
            >
              {importing
                ? '正式匯入中…'
                : `確認匯入 ${activeImportCount} 筆`}
            </button>
          )}

          {fileName && (
            <button
              type="button"
              disabled={
                loading ||
                importing ||
                comparing
              }
              onClick={
                clearFile
              }
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
              清除
            </button>
          )}
        </div>

        {fileName && (
          <p
            style={{
              marginBottom: 0,
            }}
          >
            已選擇：
            <strong>
              {fileName}
            </strong>
          </p>
        )}

        {message && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background:
                '#f8fafc',
              borderRadius: 8,
              whiteSpace:
                'pre-line',
            }}
          >
            {message}
          </div>
        )}
      </div>

      {rows.length >
        0 && (
        <div
          className="card"
          style={{
            marginTop: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent:
                'space-between',
              alignItems:
                'center',
              gap: 12,
              flexWrap:
                'wrap',
            }}
          >
            <h2
              style={{
                margin: 0,
              }}
            >
              匯入預覽
            </h2>

            <span className="muted">
              共 {rows.length} 筆 / 可匯入 {activeImportCount} 筆 / 格式異常 {invalidCount} 筆
            </span>
          </div>

          <div
            style={{
              overflowX:
                'auto',

              marginTop:
                16,
            }}
          >
            <table
              style={{
                width:
                  '100%',

                minWidth:
                  1700,

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
                  <th>狀態</th>
                  <th>客戶編號</th>
                  <th>姓名</th>
                  <th>電話</th>
                  <th>車牌</th>
                  <th>車種</th>
                  <th>類型</th>
                  <th>租用期間</th>
                  <th>金額</th>
                  <th>繳費判定</th>
                  <th>繳費日期</th>
                  <th>發票號碼</th>
                </tr>
              </thead>

              <tbody>
                {rows
                  .slice(
                    0,
                    200
                  )
                  .map(
                    (
                      row,
                      index
                    ) => (
                      <tr
                        key={index}
                        style={{
                          borderTop:
                            '1px solid #e5e7eb',

                          background:
                            !row.valid
                              ? '#fef2f2'
                              : isPendingZeroRow(row)
                                ? '#fffbeb'
                                : isZeroCancelledRow(row)
                                  ? '#fef2f2'
                                  : isPaidShortRow(row)
                                    ? '#f0fdf4'
                                    : isOfficialVehicleRow(row)
                                      ? '#eff6ff'
                                      : undefined,
                        }}
                      >
                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          {!row.valid
                            ? row.error
                            : isPendingZeroRow(row)
                              ? '0 元待選'
                              : isZeroCancelledRow(row)
                                ? '退租'
                                : isPaidShortRow(row)
                                  ? '找零不足（待繳費紀錄）'
                                  : isOfficialVehicleRow(row)
                                    ? '公務車'
                                    : '正常'}
                        </td>

                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          {
                            row.customer_code
                          }
                        </td>

                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          {
                            row.customer_name
                          }
                        </td>

                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          {row.phone ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding: 8,
                            fontWeight: 700,
                          }}
                        >
                          {
                            row.vehicle_plate
                          }
                        </td>

                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          {row.vehicle_type ===
                          'car'
                            ? '汽車'
                            : row.vehicle_type ===
                                'motorcycle'
                              ? '機車'
                              : '重機'}
                        </td>

                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          {row.rental_type ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding: 8,

                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {row.start_date} 到 {row.end_date}
                        </td>

                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          $
                          {row.monthly_fee.toLocaleString()}
                        </td>

                        <td
                          style={{
                            padding: 8,
                            fontWeight:
                              700,
                            color: '#64748b',
                          }}
                        >
                          不由名單判定
                        </td>

                        <td
                          style={{
                            padding: 8,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {row.payment_date ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          {row.invoice_number ||
                            '-'}
                        </td>
                      </tr>
                    )
                  )}
              </tbody>
            </table>
          </div>

          {rows.length >
            200 && (
            <p className="muted">
              預覽只顯示前 200 筆，正式匯入仍會處理全部 {rows.length} 筆。
            </p>
          )}
        </div>
      )}

      <LegacyImportComparison
        result={comparison}
      />
    </div>
  )
}
