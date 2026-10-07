import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGoogleServiceAccessToken } from '@/lib/google-calendar/google-service-auth'
import {
  consumePublicRateLimit,
  publicFailure,
  rateLimitResponse,
  secureJson,
} from '@/lib/security/publicSecurity'
import {
  createDocumentVerificationToken,
  normalizeVerificationPlate,
  normalizeVerificationText,
  type VerifiedDocumentType,
} from '@/lib/online-contracts/documentVerification'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

function debugOcrText(fullText: string) {
  if (String(process.env.OTP_DEV_MODE || '').toLowerCase() !== 'true') return undefined
  return fullText.slice(0, 5000)
}

function cleanLine(value: unknown) {
  return String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
}

function linesFromText(fullText: string) {
  return fullText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)
}


// OCR 常把中文欄位名稱拆成「車 主」「地 址」「牌 照 號 碼」。
// 只拿來做欄位比對，不直接改寫原始 OCR 內容。
function compactOcrLine(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/[﹕﹔]/g, '：')
    .trim()
}

const TAIWAN_REGION = '(?:臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)'
const TAIWAN_REGION_RE = new RegExp(TAIWAN_REGION)

function normalizeTaiwanAddress(value: string) {
  let text = String(value || '')
    .normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/^(?:車主住址|通訊地址|地址變更|住址|地址|地|址)[：:]*/i, '')

  // 若 OCR 在縣市前多讀到雜字（例如「世新北市」），從真正行政區起點開始。
  const region = text.match(TAIWAN_REGION_RE)
  if (region && typeof region.index === 'number') text = text.slice(region.index)

  // 常見欄位碎片被黏進地址數字前，例如「厂址66號」「戶址66號」。
  text = text
    .replace(/(?:厂址|戶址|ㄏ址|广址|住址|地址)(?=\d)/g, '')
    .replace(/[|｜]/g, '')

  // 有完整門牌時，以第一個門牌號為主，避免後方廠牌／型式欄位被黏進來。
  const door = text.match(new RegExp(`(${TAIWAN_REGION}[\\u3400-\\u9fff0-9A-Za-z－\\-之]{2,120}?號(?:之\\d+)?(?:\\d+樓(?:之\\d+)?)?)`))
  if (door?.[1]) return door[1].slice(0, 200)

  // 沒有「號」時仍保留像地址的行政區段，但遇到下一個行照欄位即停止。
  text = text.split(/(?:原發照日期|發照日期|有效日期|檢驗日期|廠牌|型式|車型|車種|出廠|排氣|引擎|車身|燃料|顏色|總重|載重|座位)/i)[0]
  return text.slice(0, 200)
}

function valueAfterLabel(lines: string[], labels: RegExp[]) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    for (const label of labels) {
      if (!label.test(line)) continue
      const sameLine = cleanLine(line.replace(label, '').replace(/^[：:\-]/, ''))
      if (sameLine && sameLine.length > 1) return sameLine
      const next = cleanLine(lines[i + 1] || '')
      if (next) return next
    }
  }
  return ''
}

const VEHICLE_FIELD_LABEL = /^(?:車牌|牌照|車號|車主|姓名|名稱|住址|地址|廠牌|型式|車型|車種|出廠|發照|排氣|引擎|車身|燃料|顏色|有效|檢驗|總重|載重|座位|統一編號|身分證)/i

function multiLineValueAfterLabel(lines: string[], labels: RegExp[], maxLines = 3) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const matchedLabel = labels.find((label) => label.test(line))
    if (!matchedLabel) continue

    const parts: string[] = []
    const sameLine = cleanLine(line.replace(matchedLabel, '').replace(/^[：:\-]/, ''))
    if (sameLine) parts.push(sameLine)

    for (let j = i + 1; j < Math.min(lines.length, i + maxLines + 1); j += 1) {
      const next = cleanLine(lines[j])
      if (!next) continue
      if (VEHICLE_FIELD_LABEL.test(next) && parts.length) break
      if (VEHICLE_FIELD_LABEL.test(next) && !parts.length) continue
      parts.push(next)
    }

    const value = cleanLine(parts.join(' '))
    if (value) return value
  }
  return ''
}

function stripFollowingLabels(value: string) {
  return cleanLine(value).split(
    /(?:車牌號碼|牌照號碼|車號|車主姓名或名稱|車主姓名|姓名或名稱|車主住址|戶籍地址|戶籍地|住址|地址|廠牌|型式|車型|車種|出廠年月|發照日期|排氣量|引擎號碼|車身號碼|燃料種類|顏色|有效日期|檢驗日期|總重|載重)/i
  )[0]
}

function sanitizeName(value: string) {
  const cleaned = stripFollowingLabels(value)
    .replace(/^(?:車主姓名或名稱|車主姓名|姓名或名稱|姓名|車主|所有人)[：:\s]*/i, '')
    .replace(/[0-9A-ZＡ-Ｚa-z()（）]/g, ' ')
  const match = cleaned.match(/[\u3400-\u9fff·]{2,20}/)
  return cleanLine(match?.[0] || '')
}

function sanitizeAddress(value: string) {
  const cleaned = stripFollowingLabels(value)
    .replace(/^(?:車主住址|戶籍地址|戶籍地|住址|地址)[：:\s]*/i, '')
    .replace(/\s+/g, '')
  return cleanLine(cleaned).slice(0, 200)
}


function looksLikePlateLine(line: string) {
  return /[A-Z0-9]{2,4}[-－]?[A-Z0-9]{2,4}/i.test(line)
}

function isLikelyFieldOrNoise(line: string) {
  const value = cleanLine(line)
  if (!value) return true
  if (VEHICLE_FIELD_LABEL.test(value)) return true
  if (/^(?:普通重型|普通輕型|大型重型|自用|營業|小客車|大客車|小貨車|大貨車|機車|汽車)/.test(value)) return true
  if (/^(?:發照|原發照|有效|檢驗|出廠|排氣|引擎|車身|燃料|顏色|總重|載重|座位|廠牌|型式|型號|年月|日期)/.test(value)) return true
  if (/^[A-Z0-9*<>\\-－./ ]{5,}$/i.test(value)) return true
  return false
}

function isLikelyOwnerText(line: string) {
  const value = cleanLine(line)
  if (!value || isLikelyFieldOrNoise(value)) return false

  // 公司／商號名稱優先，避免後面的英數代碼被誤判成姓名。
  if (/(?:股份有限公司|有限公司|公司|商行|企業社|合作社|交通行|車行)/.test(value)) {
    return true
  }

  // 個人姓名只接受 2～6 個中文字（含「·」），不接受 TON、VIN 等英數代碼。
  return /^[\u3400-\u9fff·]{2,6}$/.test(value)
}

function sanitizeOwnerName(value: string) {
  const cleaned = stripFollowingLabels(value)
    .replace(/^(?:車主姓名或名稱|車主姓名|姓名或名稱|姓名|車主|所有人)[：:\s]*/i, '')
    .replace(/^[「『【\[\s]+/, '')
    .replace(/[」』】\]\s]+$/, '')
    .trim()

  if (/(?:股份有限公司|有限公司|公司|商行|企業社|合作社|交通行|車行)/.test(cleaned)) {
    const company = cleaned.match(/[\u3400-\u9fff·]{2,40}(?:股份有限公司|有限公司|公司|商行|企業社|合作社|交通行|車行)/)?.[0]
    return cleanLine(company || cleaned).slice(0, 80)
  }

  const person = cleaned.match(/[\u3400-\u9fff·]{2,6}/)?.[0] || ''
  return cleanLine(person)
}

function normalizePlateForCompare(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

type ScoredCandidate = {
  value: string
  score: number
  reason: string
}

function normalizeCandidateText(value: string) {
  return cleanLine(value)
    .replace(/^[「『【\[\(（\s:：]+/, '')
    .replace(/[」』】\]\)）\s]+$/, '')
    .trim()
}

function isCompanyName(value: string) {
  return /(?:股份有限公司|有限公司|公司|商行|企業社|合作社|交通行|車行|商號)/.test(value)
}

function isVehicleNoise(value: string) {
  const line = normalizeCandidateText(value)
  if (!line) return true
  if (VEHICLE_FIELD_LABEL.test(line)) return true
  if (/^(?:普通重型|普通輕型|大型重型|自用|營業|小客車|大客車|小貨車|大貨車|機器腳踏車|機車|汽車)/.test(line)) return true
  if (/^(?:發照|原發照|有效|檢驗|出廠|排氣|引擎|車身|燃料|顏色|總重|載重|座位|廠牌|型式|型號|年月|日期)/.test(line)) return true
  if (/^[A-Z0-9*<>\\\-－./ ]{5,}$/i.test(line)) return true
  if (/\b[A-Z0-9]{7,}\b/i.test(line)) return true
  return false
}

function ownerCandidateScore(
  raw: string,
  index: number,
  plateIndex: number,
  labeled: boolean
): ScoredCandidate | null {
  const value = normalizeCandidateText(raw)
  if (!value || isVehicleNoise(value)) return null

  let score = 0
  const reasons: string[] = []

  if (labeled) {
    score += 70
    reasons.push('label')
  }

  if (plateIndex >= 0) {
    const distance = index - plateIndex
    if (distance === 1) {
      score += 45
      reasons.push('after-plate-1')
    } else if (distance === 2) {
      score += 28
      reasons.push('after-plate-2')
    } else if (distance > 2 && distance <= 5) {
      score += 10
      reasons.push('near-plate')
    }
  }

  if (isCompanyName(value)) {
    const company = value.match(/[\u3400-\u9fff·]{2,40}(?:股份有限公司|有限公司|公司|商行|企業社|合作社|交通行|車行|商號)/)?.[0]
    if (!company) return null
    score += 70
    reasons.push('company')
    return { value: company.slice(0, 80), score, reason: reasons.join(',') }
  }

  const chineseRuns = value.match(/[\u3400-\u9fff·]{2,8}/g) || []
  const person = chineseRuns.find((candidate) => {
    if (candidate.length < 2 || candidate.length > 6) return false
    if (/(?:高雄市|臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|基隆市|新竹市|嘉義市)/.test(candidate)) return false
    if (/(?:普通重型|普通輕型|大型重型|機車|汽車|營業|自用)/.test(candidate)) return false
    if (/(?:縣|市|區|鄉|鎮|路|街|道|巷|弄|號|段|里|村|樓)/.test(candidate)) return false
    return true
  })

  if (!person) return null
  score += person.length <= 4 ? 35 : 22
  reasons.push('person-shape')

  if (/^[\u3400-\u9fff·]{2,6}$/.test(value)) {
    score += 20
    reasons.push('pure-person')
  }

  if (/[A-Z0-9]{3,}/i.test(value)) {
    score -= 25
    reasons.push('alnum-penalty')
  }

  return { value: person, score, reason: reasons.join(',') }
}

function findOwnerName(fullText: string, lines: string[], vehiclePlate = '') {
  const targetPlate = normalizePlateForCompare(vehiclePlate)
  let plateIndex = -1
  if (targetPlate) {
    plateIndex = lines.findIndex((line) => normalizePlateForCompare(line).includes(targetPlate))
  }
  if (plateIndex < 0) plateIndex = lines.findIndex((line) => looksLikePlateLine(line))

  const candidates: ScoredCandidate[] = []

  // 0. 先處理台灣行照最常見的 OCR 斷字：車 主、車 主姓名、姓名 或 名稱。
  //    用無空白版本比對，但候選值仍交給既有評分器，避免誤抓廠牌或地址。
  for (let i = 0; i < Math.min(lines.length, 30); i += 1) {
    const compact = compactOcrLine(lines[i])
    const sameLine = compact.match(/(?:車主姓名或名稱|車主姓名|姓名或名稱|所有人|車主)[：:]?(.{2,80})/i)?.[1] || ''
    if (sameLine) {
      const candidate = ownerCandidateScore(sameLine, i, plateIndex, true)
      if (candidate) candidates.push({ ...candidate, score: candidate.score + 25, reason: `${candidate.reason},compact-label` })
    }

    // 欄位標籤單獨一行，值在下一行。
    if (/^(?:車主姓名或名稱|車主姓名|姓名或名稱|所有人|車主)[：:]?$/i.test(compact) && lines[i + 1]) {
      const candidate = ownerCandidateScore(lines[i + 1], i + 1, plateIndex, true)
      if (candidate) candidates.push({ ...candidate, score: candidate.score + 25, reason: `${candidate.reason},compact-label-next` })
    }
  }

  // 1. 固定欄位標籤來源。
  const ownerLabels = [/車\s*主\s*姓\s*名\s*或\s*名\s*稱/i, /車\s*主\s*姓\s*名/i, /姓\s*名\s*或\s*名\s*稱/i, /所\s*有\s*人/i, /車\s*主/i]
  for (let i = 0; i < lines.length; i += 1) {
    const label = ownerLabels.find((pattern) => pattern.test(lines[i]))
    if (!label) continue
    const sameLine = cleanLine(lines[i].replace(label, '').replace(/^[：:\-]/, ''))
    if (sameLine) {
      const candidate = ownerCandidateScore(sameLine, i, plateIndex, true)
      if (candidate) candidates.push(candidate)
    }
    if (lines[i + 1]) {
      const candidate = ownerCandidateScore(lines[i + 1], i + 1, plateIndex, true)
      if (candidate) candidates.push(candidate)
    }
  }

  // 2. 台灣汽車／機車行照通常在牌照號碼附近就會出現車主姓名或名稱。
  if (plateIndex >= 0) {
    for (let i = plateIndex + 1; i < Math.min(lines.length, plateIndex + 7); i += 1) {
      const candidate = ownerCandidateScore(lines[i], i, plateIndex, false)
      if (candidate) candidates.push({ ...candidate, score: candidate.score + 12, reason: `${candidate.reason},layout-near-plate` })
    }
  }

  // 3. 通用候選：掃描文件前段，依「與車牌距離、公司/姓名形態」評分。
  for (let i = 0; i < Math.min(lines.length, 30); i += 1) {
    const candidate = ownerCandidateScore(lines[i], i, plateIndex, false)
    if (candidate) candidates.push(candidate)
  }

  // 4. 最後再掃一次整份 OCR 的連續文字，專門容錯「車 主曹志意」這種結果。
  const compactText = compactOcrLine(fullText)
  const textOwner = compactText.match(
    /(?:車主姓名或名稱|車主姓名|姓名或名稱|所有人|車主)[：:]?([\u3400-\u9fff·]{2,40}?)(?=住址|地址|廠牌|型式|車型|車種|牌照|車牌|引擎|車身|原發照|發照|有效|檢驗|$)/i
  )?.[1]
  if (textOwner) {
    const candidate = ownerCandidateScore(textOwner, plateIndex >= 0 ? plateIndex + 1 : 0, plateIndex, true)
    if (candidate) candidates.push({ ...candidate, score: candidate.score + 20, reason: `${candidate.reason},compact-document` })
  }

  candidates.sort((a, b) => b.score - a.score || b.value.length - a.value.length)
  const best = candidates[0]

  // 高信心才自動填；若不夠可信，寧可讓使用者確認，不亂填姓名。
  return best && best.score >= 55 ? best.value : ''
}

function cleanAddressPiece(value: string) {
  return cleanLine(value)
    .replace(/^[「『【\[\(（\s]+/, '')
    .replace(/^(?:地\s*址|地址|住址|車主住址|通訊地址|地址變更|地|址)[：:\s]*/i, '')
    .replace(/[」』】\]\)）]+$/g, '')
    .trim()
}

function addressFeatureScore(value: string) {
  const line = cleanAddressPiece(value)
  if (!line || isVehicleNoise(line)) return -100
  if (/[A-Z]{2,}\d{2,}|\b[A-Z0-9]{7,}\b/i.test(line)) return -80

  let score = 0
  if (/(?:臺|台)?[\u3400-\u9fff]{1,4}(?:市|縣)/.test(line)) score += 35
  if (/(?:區|鄉|鎮|市)/.test(line)) score += 15
  if (/(?:路|街|道|大道)/.test(line)) score += 18
  if (/(?:段|巷|弄|號|樓|之)/.test(line)) score += 20
  if (/(?:村|里)/.test(line)) score += 8
  if (/\d/.test(line)) score += 8
  if (/^[\u3400-\u9fff0-9－\-之]+$/.test(line.replace(/臺|台/g, ''))) score += 8
  return score
}

function buildAddressCandidate(lines: string[], startIndex: number) {
  const parts: string[] = []
  let score = 0

  for (let i = startIndex; i < Math.min(lines.length, startIndex + 4); i += 1) {
    const raw = cleanLine(lines[i])
    if (!raw) continue
    if (/^(?:地|址)$/.test(raw.replace(/\s+/g, ''))) continue

    const part = cleanAddressPiece(raw)
    if (!part) continue
    if (isVehicleNoise(part)) break
    if (/[A-Z]{2,}\d{2,}|\b[A-Z0-9]{7,}\b/i.test(part)) break

    const partScore = addressFeatureScore(part)
    if (partScore < 0) break
    if (parts.length > 0 && partScore < 8) break

    parts.push(part)
    score += partScore
    if (/(?:號(?:之\d+)?|樓(?:之\d+)?)$/.test(part)) break
  }

  const value = parts.join('').replace(/\s+/g, '').slice(0, 200)
  return { value, score }
}

function findAddress(fullText: string, lines: string[]) {
  const candidates: ScoredCandidate[] = []

  // 0. 先抓任何含完整台灣縣市名稱的行。這可修正「世新北市...」等前綴 OCR 雜字。
  for (let i = 0; i < Math.min(lines.length, 40); i += 1) {
    const compact = compactOcrLine(lines[i])
    if (!TAIWAN_REGION_RE.test(compact)) continue
    const normalized = normalizeTaiwanAddress(compact)
    const score = addressFeatureScore(normalized) + (/(?:路|街|道|巷|弄|號)/.test(normalized) ? 35 : 10)
    if (normalized && score > 0) {
      candidates.push({ value: normalized, score, reason: 'taiwan-region-line' })
    }
  }

  // 1. 支援「地 址」「車 主 住 址」「地\n址」等斷字欄位。
  const addressLabels = [
    /車\s*主\s*住\s*址/i,
    /通\s*訊\s*地\s*址/i,
    /地\s*址\s*變\s*更/i,
    /住\s*址/i,
    /地\s*址/i,
  ]
  for (let i = 0; i < lines.length; i += 1) {
    const label = addressLabels.find((pattern) => pattern.test(lines[i]))
    const compact = compactOcrLine(lines[i])
    const compactHasLabel = /(?:車主住址|通訊地址|地址變更|住址|地址)/i.test(compact)
    if (!label && !compactHasLabel) continue

    let sameLine = ''
    if (label) sameLine = cleanLine(lines[i].replace(label, '').replace(/^[：:\-]/, ''))
    if (!sameLine && compactHasLabel) {
      sameLine = compact.replace(/^(?:車主住址|通訊地址|地址變更|住址|地址)[：:]*/i, '')
    }

    if (sameLine) {
      const normalized = normalizeTaiwanAddress(sameLine)
      const score = addressFeatureScore(normalized) + 70
      if (normalized && score > 0) candidates.push({ value: normalized, score, reason: 'label-same-line' })
    }

    const built = buildAddressCandidate(lines, i + 1)
    if (built.value) {
      const normalized = normalizeTaiwanAddress(built.value)
      candidates.push({ value: normalized, score: built.score + 65, reason: 'label-following-lines' })
    }
  }

  // 2. OCR 常把「地址」拆成「地」「址」，從「址」之後開始組候選。
  for (let i = 0; i < Math.min(lines.length, 32); i += 1) {
    const compact = compactOcrLine(lines[i])
    if (!/^(?:地|址)$/.test(compact)) continue
    const built = buildAddressCandidate(lines, i + 1)
    if (built.value) {
      candidates.push({ value: normalizeTaiwanAddress(built.value), score: built.score + 30, reason: 'split-label' })
    }
  }

  // 3. 無標籤時掃描所有像台灣地址的行，並嘗試合併最多 4 行。
  for (let i = 0; i < Math.min(lines.length, 40); i += 1) {
    const built = buildAddressCandidate(lines, i)
    if (built.value && built.score >= 25) {
      const normalized = normalizeTaiwanAddress(built.value)
      candidates.push({ value: normalized, score: built.score, reason: 'address-shape' })
    }
  }

  // 4. 連續文字 fallback：直接從縣市名開始抓，避免 OCR 換行破壞地址。
  const compactText = compactOcrLine(fullText)
  const regionStart = compactText.search(TAIWAN_REGION_RE)
  if (regionStart >= 0) {
    const tail = compactText.slice(regionStart, regionStart + 180)
    const normalized = normalizeTaiwanAddress(tail)
    const score = addressFeatureScore(normalized) + 20
    if (normalized && score > 0) candidates.push({ value: normalized, score, reason: 'compact-document-region' })
  }

  // 同一地址可能從多種策略抓到，去重後再排序。
  const unique = new Map<string, ScoredCandidate>()
  for (const item of candidates) {
    const value = normalizeTaiwanAddress(item.value)
    if (!value) continue
    const existing = unique.get(value)
    if (!existing || item.score > existing.score) unique.set(value, { ...item, value })
  }

  const sorted = [...unique.values()].sort((a, b) => b.score - a.score || b.value.length - a.value.length)
  const best = sorted[0]

  return best && best.score >= 45 ? best.value : ''
}

function guessVehicleType(fullText: string) {
  const compact = compactOcrLine(fullText)

  // 台灣行照有大型汽車、小型汽車、重型機車、輕型機車等證照類別；
  // 系統只需映射成目前既有的 car / motorcycle / heavy_motorcycle 三類。
  if (/(?:大型重型機車|550CC以上大型重型機車|550C\.C\.以上大型重型機車|重機)/i.test(compact)) {
    return 'heavy_motorcycle'
  }
  if (/(?:普通重型機車|普通輕型機車|輕型機車|機器腳踏車|機車)/i.test(compact)) {
    return 'motorcycle'
  }
  if (/(?:小型汽車|大型汽車|自用小客車|自用小貨車|營業小客車|營業小貨車|小客車|小貨車|大客車|大貨車|汽車)/i.test(compact)) {
    return 'car'
  }

  // 版面 OCR 若漏掉車種文字，不用硬猜機車類別；沿用既有保守預設汽車。
  return 'car'
}

function parseVehicleRegistration(fullText: string) {
  const lines = linesFromText(fullText)
  const compact = fullText.normalize('NFKC').replace(/[\s　]/g, '')

  const plateLabelValue = valueAfterLabel(lines, [
    /車牌號碼/i,
    /牌照號碼/i,
    /車號/i,
  ])
  const plateFromLabel = plateLabelValue.match(/[A-Z0-9]{2,4}[-－]?[A-Z0-9]{2,4}/i)?.[0] || ''
  const plateFallback = compact.match(/[A-Z]{2,4}[-－]?[0-9A-Z]{2,4}/i)?.[0] || ''
  const vehiclePlate = String(plateFromLabel || plateFallback)
    .toUpperCase()
    .replace(/－/g, '-')

  const ownerName = findOwnerName(fullText, lines, vehiclePlate)
  const address = findAddress(fullText, lines)

  return {
    applicant_name: ownerName,
    vehicle_plate: vehiclePlate,
    address,
    vehicle_type: guessVehicleType(fullText),
  }
}

function parseIdCard(fullText: string) {
  const lines = linesFromText(fullText)

  // 僅取姓名與戶籍地；刻意不回傳身分證字號、生日等欄位。
  const applicantName = sanitizeName(
    valueAfterLabel(lines, [/^姓名/i, /姓名/i])
  )
  const address = sanitizeAddress(
    valueAfterLabel(lines, [/戶籍地址/i, /戶籍地/i, /住址/i, /地址/i])
  )

  return {
    applicant_name: applicantName,
    address,
  }
}

async function runVision(imageBase64: string) {
  const accessToken = await getGoogleServiceAccessToken(
    'https://www.googleapis.com/auth/cloud-platform'
  )

  const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          imageContext: { languageHints: ['zh-TW', 'en'] },
        },
      ],
    }),
    cache: 'no-store',
  })

  const result = await response.json()
  if (!response.ok || result?.responses?.[0]?.error) {
    const message = result?.responses?.[0]?.error?.message || result?.error?.message || 'OCR_FAILED'
    throw new Error(message)
  }

  return String(result?.responses?.[0]?.fullTextAnnotation?.text || '').trim()
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const documentType = String(formData.get('document_type') || '') as VerifiedDocumentType
    const challengeId = String(formData.get('challenge_id') || '').trim()
    const parkingLotId = String(formData.get('parking_lot_id') || '').trim()
    const file = formData.get('file')

    if (!['vehicle_registration', 'id_card'].includes(documentType)) {
      return secureJson({ error: '證件類型不正確。' }, 400)
    }
    if (!challengeId || !parkingLotId) {
      return secureJson({ error: '請先完成手機驗證。' }, 400)
    }
    if (!(file instanceof File) || file.size <= 0) {
      return secureJson({ error: '請選擇要辨識的照片。' }, 400)
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return secureJson({ error: '照片過大，請使用 8MB 以下的照片。' }, 413)
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return secureJson({ error: '僅支援 JPG、PNG、WebP、HEIC/HEIF 圖片。' }, 415)
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return secureJson({ error: '服務暫時無法使用，請稍後再試。' }, 500)
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    const limit = await consumePublicRateLimit(admin, request, {
      scope: 'document_ocr',
      subject: challengeId,
      limit: 10,
      windowSeconds: 15 * 60,
    })
    if (!limit.allowed) return rateLimitResponse(limit)

    const { data: challenge } = await admin
      .from('public_otp_challenges')
      .select('id,parking_lot_id,verified_at,consumed_at,expires_at,purpose,contract_id')
      .eq('id', challengeId)
      .maybeSingle()

    if (
      !challenge ||
      !challenge.verified_at ||
      challenge.consumed_at ||
      challenge.parking_lot_id !== parkingLotId ||
      (challenge.purpose && challenge.purpose !== 'application') ||
      challenge.contract_id
    ) {
      return secureJson({ error: '手機驗證狀態無效，請重新驗證。' }, 400)
    }

    if (new Date(challenge.verified_at).getTime() < Date.now() - 15 * 60_000) {
      return secureJson({ error: '手機驗證已逾時，請重新驗證。' }, 410)
    }

    // 圖片僅存在這次 HTTP request 的記憶體中；不寫入 Supabase/Storage/Drive。
    const imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const fullText = await runVision(imageBase64)
    if (!fullText) {
      return secureJson({ error: '沒有辨識到文字，請重新拍攝清楚一點。' }, 422)
    }

    if (documentType === 'vehicle_registration') {
      const parsed = parseVehicleRegistration(fullText)
      if (!parsed.vehicle_plate) {
        return secureJson({ error: '無法辨識車牌號碼，請重新拍攝完整行照。' }, 422)
      }

      const token = createDocumentVerificationToken({
        document_type: documentType,
        challenge_id: challengeId,
        parking_lot_id: parkingLotId,
        applicant_name: normalizeVerificationText(parsed.applicant_name),
        vehicle_plate: normalizeVerificationPlate(parsed.vehicle_plate),
        address: normalizeVerificationText(parsed.address),
        vehicle_type: parsed.vehicle_type,
      })

      return secureJson({
        ok: true,
        document_type: documentType,
        token,
        data: parsed,
        image_stored: false,
        debug_ocr: debugOcrText(fullText),
        debug_parsed:
          String(process.env.OTP_DEV_MODE || '').toLowerCase() === 'true'
            ? parsed
            : undefined,
      })
    }

    const parsed = parseIdCard(fullText)
    if (!parsed.applicant_name || !parsed.address) {
      return secureJson({ error: '無法完整辨識姓名與戶籍地，請重新拍攝證件正面。' }, 422)
    }

    const token = createDocumentVerificationToken({
      document_type: documentType,
      challenge_id: challengeId,
      parking_lot_id: parkingLotId,
      applicant_name: normalizeVerificationText(parsed.applicant_name),
      address: normalizeVerificationText(parsed.address),
    })

    return secureJson({
      ok: true,
      document_type: documentType,
      token,
      data: parsed,
      image_stored: false,
    })
  } catch (error) {
    return publicFailure('document-ocr', error, '證件辨識暫時無法使用，請稍後再試。', 503)
  }
}
