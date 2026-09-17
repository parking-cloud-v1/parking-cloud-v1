export type Payment408Row = {
  sourceSheet: string
  customerCode: string
  vehiclePlate: string
  customerName: string
  phone: string
  amountPaid: number
  rentalType: string
  paymentDate: string
  invoiceNumber: string
  paymentMethod: string
  notes: string
  reportMonth: string
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function numberValue(value: unknown) {
  const normalized = text(value).replace(/,/g, '').replace(/\$/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizePhone(value: unknown) {
  const digits = text(value).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 9 && digits.startsWith('9')) return `0${digits}`
  return digits
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function endYearFromRoc(rocYear: number) {
  return rocYear + 1911
}

export function is408MonthlySheet(sheetName: string) {
  return /^408巷\d{3}-\d{2}-\d{2}$/.test(text(sheetName))
}

export function parse408SheetPeriod(sheetName: string) {
  const match = text(sheetName).match(/^408巷(\d{3})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const rocYear = Number(match[1])
  const startMonth = Number(match[2])
  const endMonth = Number(match[3])
  if (!rocYear || startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12) {
    return null
  }

  return {
    rocYear,
    adYear: endYearFromRoc(rocYear),
    startMonth,
    endMonth,
  }
}

export function normalize408PaymentDate(
  value: unknown,
  adYear: number,
  startMonth: number,
) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date (1900 date system). Avoid timezone conversion surprises.
    const epoch = Date.UTC(1899, 11, 30)
    const date = new Date(epoch + Math.round(value) * 86400000)
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  }

  const source = text(value)
  if (!source) return ''

  const iso = source.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/)
  if (iso) {
    return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`
  }

  const roc = source.match(/^(\d{3})[\/-](\d{1,2})[\/-](\d{1,2})/)
  if (roc) {
    return `${Number(roc[1]) + 1911}-${pad(Number(roc[2]))}-${pad(Number(roc[3]))}`
  }

  const zh = source.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/)
  if (zh) {
    const year = zh[1] ? Number(zh[1]) : adYear
    return `${year}-${pad(Number(zh[2]))}-${pad(Number(zh[3]))}`
  }

  const md = source.match(/^(\d{1,2})[\/-](\d{1,2})$/)
  if (md) {
    return `${adYear}-${pad(Number(md[1]))}-${pad(Number(md[2]))}`
  }

  const dayOnly = source.match(/^(\d{1,2})$/)
  if (dayOnly) {
    return `${adYear}-${pad(startMonth)}-${pad(Number(dayOnly[1]))}`
  }

  return ''
}

export function parse408PaymentSheet(sheetName: string, matrix: unknown[][]) {
  const period = parse408SheetPeriod(sheetName)
  if (!period || !Array.isArray(matrix) || matrix.length < 2) return [] as Payment408Row[]

  const header = (matrix[0] || []).map((value) => text(value).replace(/\s+/g, ''))
  const findColumn = (...names: string[]) => {
    for (const name of names) {
      const index = header.findIndex((item) => item === name)
      if (index >= 0) return index
    }
    return -1
  }

  const paymentIndex = findColumn('繳費狀態', '繳費日期', '收款日期')
  const customerCodeIndex = findColumn('客戶編號')
  const plateIndex = findColumn('車牌', '車號')
  const customerNameIndex = findColumn('姓名')
  const phoneIndex = findColumn('電話', '手機')
  const feeIndex = findColumn('金額', '應收費用', '月租金額', '實收金額')
  const typeIndex = findColumn('類別', '類型')
  const invoiceIndex = findColumn('發票號碼', '發票編號')
  const notesIndex = findColumn('備註')

  if (paymentIndex < 0 || plateIndex < 0 || feeIndex < 0) return [] as Payment408Row[]

  const rows: Payment408Row[] = []

  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex++) {
    const row = matrix[rowIndex] || []
    const vehiclePlate = text(row[plateIndex]).toUpperCase()
    const paymentDate = normalize408PaymentDate(
      row[paymentIndex],
      period.adYear,
      period.startMonth,
    )

    // 408 人工表：只有「繳費狀態」欄真的有日期才是付款資料。
    if (!vehiclePlate || !paymentDate) continue

    const notes = notesIndex >= 0 ? text(row[notesIndex]) : ''
    const rawAmount = numberValue(row[feeIndex])
    // 明確標示免費/免錢者不自動當正常收款，交由付款待確認。
    const amountPaid = /免費|免錢|免收/.test(notes) ? 0 : rawAmount

    rows.push({
      sourceSheet: sheetName,
      customerCode: customerCodeIndex >= 0 ? text(row[customerCodeIndex]) : '',
      vehiclePlate,
      customerName: customerNameIndex >= 0 ? text(row[customerNameIndex]) : '',
      phone: phoneIndex >= 0 ? normalizePhone(row[phoneIndex]) : '',
      amountPaid,
      rentalType: typeIndex >= 0 ? text(row[typeIndex]) : '',
      paymentDate,
      invoiceNumber: invoiceIndex >= 0 ? text(row[invoiceIndex]).toUpperCase() : '',
      paymentMethod: notes,
      notes,
      reportMonth: `${period.adYear}-${pad(period.startMonth)}`,
    })
  }

  return rows
}
