import { getGoogleServiceAccessToken } from '@/lib/google-calendar/google-service-auth'

type Vertex = { x?: number; y?: number }
type VisionWord = {
  text: string
  x: number
  y: number
  left: number
  right: number
  top: number
  bottom: number
}

export type RecognizedLeave = {
  staff_name: string
  parking_lot_name: string
  leave_date: string
  leave_shift: string
  leave_type: string
  notes: string
  confidence_note?: string
}

export type RecognitionProfile = {
  id?: string
  name?: string
  staff_name: string
  parking_lot_name: string
  leave_shift?: string
  match_keywords?: string[]
}

type RecognizeOptions = {
  imageBase64: string
  yearMonth: string
  staffName?: string
  parkingLotName?: string
  profiles?: RecognitionProfile[]
}

function textFromSymbols(word: any) {
  return (word?.symbols || []).map((symbol: any) => symbol?.text || '').join('').trim()
}

function bounds(vertices: Vertex[] = []) {
  const xs = vertices.map(v => Number(v.x ?? 0))
  const ys = vertices.map(v => Number(v.y ?? 0))
  if (xs.length === 0 || ys.length === 0) {
    return { left: 0, right: 0, top: 0, bottom: 0, x: 0, y: 0 }
  }
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  return { left, right, top, bottom, x: (left + right) / 2, y: (top + bottom) / 2 }
}

function collectWords(annotation: any): VisionWord[] {
  const words: VisionWord[] = []
  for (const page of annotation?.pages || []) {
    for (const block of page?.blocks || []) {
      for (const paragraph of block?.paragraphs || []) {
        for (const word of paragraph?.words || []) {
          const text = textFromSymbols(word)
          if (!text) continue
          words.push({ text, ...bounds(word?.boundingBox?.vertices || []) })
        }
      }
    }
  }
  return words
}

function groupByY(words: VisionWord[], tolerance = 18) {
  const groups: VisionWord[][] = []
  for (const word of [...words].sort((a, b) => a.y - b.y)) {
    const group = groups.find(g => Math.abs((g.reduce((s, w) => s + w.y, 0) / g.length) - word.y) <= tolerance)
    if (group) group.push(word)
    else groups.push([word])
  }
  return groups.map(g => g.sort((a, b) => a.x - b.x))
}

function normalizeChinese(s: string) {
  return String(s || '').replace(/[\s：:()（）\[\]【】]/g, '').trim()
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseYearMonth(yearMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth)
  if (!match) throw new Error('請先選擇正確的班表月份')
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) throw new Error('班表月份格式錯誤')
  return { year, month }
}

function guessLotFromText(fullText: string, fallback = '') {
  if (fallback.trim()) return fallback.trim()

  const lines = fullText
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, '').trim())
    .filter(Boolean)

  const blocked = /(班表|計薪表|姓名|加時數|備註|主管)/
  for (const line of lines) {
    if (blocked.test(line) && !/(?:站|停車場)/.test(line)) continue

    const matches = [...line.matchAll(/([\u4e00-\u9fff]{2,12}(?:停車場|站))/g)]
    for (const match of matches) {
      let candidate = String(match[1] || '')
        .replace(/^(?:年|月|月份)+/, '')
        .replace(/^(?:班表|計薪表)+/, '')
        .trim()

      // 常見 OCR 會把「115年10月份」黏在場站前面；
      // 數字不在這個 regex 內，但可能留下「月份」兩字。
      candidate = candidate.replace(/^月份?/, '')

      if (
        candidate.length >= 2 &&
        candidate.length <= 12 &&
        !blocked.test(candidate)
      ) {
        return candidate
      }
    }
  }

  const compact = fullText.replace(/\s+/g, '')
  const fallbackMatch = compact.match(/([\u4e00-\u9fff]{2,8}(?:停車場|站))/)
  return String(fallbackMatch?.[1] || fallback || '')
    .replace(/^月份?/, '')
    .trim()
}

function isLikelyName(text: string) {
  const t = normalizeChinese(text)
  if (!/^[\u4e00-\u9fff]{2,5}$/.test(t)) return false
  const blocked = new Set(['姓名', '加時數', '班表', '計薪表', '備註', '主管', '星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '國慶日', '光復節'])
  return !blocked.has(t) && t !== '休'
}


function matchRecognitionProfile(fullText: string, profiles: RecognitionProfile[] = []) {
  const compact = normalizeChinese(fullText).toLowerCase()
  let best: { profile: RecognitionProfile; score: number } | null = null

  for (const profile of profiles) {
    const keywords = (profile.match_keywords || [])
      .map(value => normalizeChinese(String(value || '')).toLowerCase())
      .filter(Boolean)

    if (keywords.length === 0) continue
    const score = keywords.reduce((count, keyword) => count + (compact.includes(keyword) ? 1 : 0), 0)

    if (score > 0 && (!best || score > best.score)) {
      best = { profile, score }
    }
  }

  return best?.profile || null
}

function parseEmployeeTable(words: VisionWord[], fullText: string, year: number, month: number, defaultLot: string) {
  const numeric = words.filter(w => /^\d{1,2}$/.test(w.text) && Number(w.text) >= 1 && Number(w.text) <= 31)
  const groups = groupByY(numeric, 12)
    .map(g => ({ words: g, score: new Set(g.map(w => Number(w.text))).size }))
    .sort((a, b) => b.score - a.score)
  const dateHeader = groups[0]?.words || []
  if (dateHeader.length < 10) return [] as RecognizedLeave[]

  const headerY = dateHeader.reduce((sum, w) => sum + w.y, 0) / dateHeader.length
  const minDateX = Math.min(...dateHeader.map(w => w.x))
  const maxDateX = Math.max(...dateHeader.map(w => w.x))
  const dateMap = new Map<number, VisionWord>()
  for (const word of dateHeader) {
    const day = Number(word.text)
    if (!dateMap.has(day)) dateMap.set(day, word)
  }

  const nameCandidates = words
    .filter(w => w.y > headerY + 20 && w.x < minDateX - 10 && isLikelyName(w.text))
    .sort((a, b) => a.y - b.y)

  const names: VisionWord[] = []
  for (const word of nameCandidates) {
    if (!names.some(n => Math.abs(n.y - word.y) < 12)) names.push(word)
  }
  names.sort((a, b) => a.y - b.y)

  const lot = guessLotFromText(fullText, defaultLot)
  const leaveWords = words.filter(
    w =>
      normalizeChinese(w.text) === '休' &&
      w.y > headerY &&
      w.x >= minDateX - 10 &&
      w.x <= maxDateX + 20
  )
  const result: RecognizedLeave[] = []

  // 用相鄰姓名的中點建立每位員工的列範圍。
  // 這樣第二列的「休」不會被錯配到第一列姓名。
  const rowBands = names.map((name, index) => {
    const previous = names[index - 1]
    const next = names[index + 1]

    const top = previous
      ? (previous.y + name.y) / 2
      : name.y - (next ? (next.y - name.y) / 2 : 24)

    const bottom = next
      ? (name.y + next.y) / 2
      : name.y + (previous ? (name.y - previous.y) / 2 : 24)

    return { name, top, bottom }
  })

  for (const leave of leaveWords) {
    let nearestDay: number | null = null
    let bestDx = Infinity

    for (const [day, pos] of dateMap) {
      const dx = Math.abs(pos.x - leave.x)
      if (dx < bestDx) {
        bestDx = dx
        nearestDay = day
      }
    }

    if (!nearestDay || nearestDay > daysInMonth(year, month)) continue

    const row = rowBands.find(
      band => leave.y >= band.top && leave.y < band.bottom
    )
    if (!row) continue

    result.push({
      staff_name: normalizeChinese(row.name.text),
      parking_lot_name: lot,
      leave_date: isoDate(year, month, nearestDay),
      leave_shift: '全天',
      leave_type: '排休',
      notes: '由班表照片辨識；匯入前請主管確認',
      confidence_note: '班表「休」欄位依姓名列與日期欄定位',
    })
  }

  return result
}

function calendarDateRows(words: VisionWord[]) {
  const numeric = words.filter(w => /^\d{1,2}$/.test(w.text) && Number(w.text) >= 1 && Number(w.text) <= 31)
  const groups = groupByY(numeric, 16)
    .filter(g => g.length >= 3)
    .filter(g => {
      const xs = g.map(w => w.x)
      return Math.max(...xs) - Math.min(...xs) > 250
    })
    .sort((a, b) => a[0].y - b[0].y)

  // Keep up to six calendar week rows and discard duplicated phone/status-bar number groups.
  const unique: VisionWord[][] = []
  for (const g of groups) {
    const days = new Set(g.map(w => Number(w.text)))
    if (days.size < 3) continue
    if (unique.some(existing => Math.abs(existing[0].y - g[0].y) < 25)) continue
    unique.push(g)
  }
  return unique.slice(-6)
}

function parsePersonalCalendar(words: VisionWord[], year: number, month: number, staffName: string, defaultLot: string, defaultShift = '全天') {
  if (!staffName.trim()) throw new Error('這種個人月曆／TimeTree 截圖沒有姓名，請先輸入「管理員姓名」再辨識')
  if (!defaultLot.trim()) throw new Error('這種個人月曆的休假日沒有場站文字，請先輸入「預設停車場」再辨識')

  const rows = calendarDateRows(words)
  if (rows.length < 3) return [] as RecognizedLeave[]

  const positions: Array<{ day: number; word: VisionWord; rowIndex: number }> = []
  rows.forEach((row, rowIndex) => {
    for (const word of row) {
      const day = Number(word.text)
      if (day >= 1 && day <= daysInMonth(year, month)) positions.push({ day, word, rowIndex })
    }
  })

  const uniqueDays = new Map<number, { day: number; word: VisionWord; rowIndex: number }>()
  for (const p of positions) {
    if (!uniqueDays.has(p.day)) uniqueDays.set(p.day, p)
  }
  if (uniqueDays.size < Math.min(20, daysInMonth(year, month))) return []

  const allXs = [...uniqueDays.values()].map(p => p.word.x).sort((a, b) => a - b)
  const dxs = allXs.slice(1).map((x, i) => x - allXs[i]).filter(v => v > 30)
  const colWidth = dxs.length ? dxs.sort((a, b) => a - b)[Math.floor(dxs.length / 2)] : 150

  const rowYs = rows.map(r => r.reduce((s, w) => s + w.y, 0) / r.length)
  const rowDiffs = rowYs.slice(1).map((y, i) => y - rowYs[i]).filter(v => v > 25)
  const rowHeight = rowDiffs.length ? rowDiffs.sort((a, b) => a - b)[Math.floor(rowDiffs.length / 2)] : 120

  const excluded = /^(星期[日一二三四五六]|[日一二三四五六]|月|年|行事曆|報告|班次|更多)$/
  const result: RecognizedLeave[] = []

  for (const p of [...uniqueDays.values()].sort((a, b) => a.day - b.day)) {
    const x1 = p.word.x - colWidth * 0.45
    const x2 = p.word.x + colWidth * 0.45
    const y1 = p.word.bottom + 2
    const nextRowY = rowYs[p.rowIndex + 1]
    const y2 = nextRowY ? nextRowY - 12 : p.word.y + rowHeight * 0.82

    const cellTokens = words.filter(w => {
      if (w === p.word) return false
      if (w.x < x1 || w.x > x2 || w.y < y1 || w.y > y2) return false
      const t = normalizeChinese(w.text)
      if (!t || excluded.test(t)) return false
      if (/^\d{1,2}$/.test(t)) return false
      return true
    })

    // Personal schedule calendar: a blank date cell means no assigned shift = day off.
    if (cellTokens.length === 0) {
      result.push({
        staff_name: staffName.trim(),
        parking_lot_name: defaultLot.trim(),
        leave_date: isoDate(year, month, p.day),
        leave_shift: defaultShift || '全天',
        leave_type: '排休',
        notes: '由個人班表空白日期推定為排休；匯入前請主管確認',
        confidence_note: '空白日期推定',
      })
    }
  }

  return result
}

function dedupe(rows: RecognizedLeave[]) {
  const map = new Map<string, RecognizedLeave>()
  for (const row of rows) {
    const key = `${row.staff_name}|${row.parking_lot_name}|${row.leave_date}`
    if (!map.has(key)) map.set(key, row)
  }
  return [...map.values()].sort((a, b) => a.leave_date.localeCompare(b.leave_date) || a.staff_name.localeCompare(b.staff_name))
}

export async function recognizeScheduleImage(options: RecognizeOptions) {
  const { year, month } = parseYearMonth(options.yearMonth)
  const accessToken = await getGoogleServiceAccessToken('https://www.googleapis.com/auth/cloud-platform')

  const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        image: { content: options.imageBase64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
        imageContext: { languageHints: ['zh-TW', 'zh'] },
      }],
    }),
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Google Cloud Vision ${response.status}`)
  }

  const first = payload?.responses?.[0]
  if (first?.error?.message) throw new Error(first.error.message)
  const annotation = first?.fullTextAnnotation
  const fullText = String(annotation?.text || '')
  const words = collectWords(annotation)
  if (!fullText || words.length === 0) throw new Error('照片沒有辨識到可用文字，請改用較清楚的原圖或截圖')

  const compact = fullText.replace(/\s+/g, '')
  const looksLikeEmployeeTable = compact.includes('姓名') && words.some(w => normalizeChinese(w.text) === '休')
  const matchedProfile = matchRecognitionProfile(fullText, options.profiles || [])

  const resolvedStaffName =
    String(options.staffName || '').trim() ||
    String(matchedProfile?.staff_name || '').trim()

  const resolvedParkingLotName =
    String(options.parkingLotName || '').trim() ||
    String(matchedProfile?.parking_lot_name || '').trim()

  const resolvedLeaveShift =
    String(matchedProfile?.leave_shift || '').trim() ||
    '全天'

  let rows: RecognizedLeave[] = []
  let format = 'personal_calendar'
  if (looksLikeEmployeeTable) {
    format = 'employee_table'
    rows = parseEmployeeTable(words, fullText, year, month, resolvedParkingLotName)
  } else {
    rows = parsePersonalCalendar(
      words,
      year,
      month,
      resolvedStaffName,
      resolvedParkingLotName,
      resolvedLeaveShift
    )
  }

  rows = dedupe(rows)
  if (rows.length === 0) {
    throw new Error('有讀到文字，但沒有找到可確認的休假日期。請確認月份是否正確，或改用清楚的完整班表截圖。')
  }

  return {
    format,
    rows,
    matched_profile: matchedProfile ? {
      id: matchedProfile.id || '',
      name: matchedProfile.name || '',
      staff_name: matchedProfile.staff_name,
      parking_lot_name: matchedProfile.parking_lot_name,
      leave_shift: matchedProfile.leave_shift || '全天',
    } : null,
    detected_text_preview: fullText.slice(0, 1000),
  }
}
