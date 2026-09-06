export type SendSmsResult = {
  ok: boolean
  provider: string
  debugCode?: string
  error?: string
  attempts?: number
  statusCode?: number
}

function intEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name])
  if (!Number.isFinite(raw)) return fallback
  return Math.min(max, Math.max(min, Math.round(raw)))
}

function shouldRetry(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 共用 SMS 發送介面。
 *
 * 開發測試：
 * OTP_DEV_MODE=true 時不發真正簡訊，只寫入 console。
 * OTP 流程可額外傳入 debugCode，供前端測試顯示。
 *
 * 正式上線：
 * 1. 設 SMS_API_URL
 * 2. 設 SMS_API_TOKEN
 * 3. 對方 API 接收 JSON：{ to, message, from? }
 *
 * 可選設定：
 * SMS_API_FROM=品牌/來源名稱
 * SMS_API_TIMEOUT_MS=10000
 * SMS_API_RETRIES=1   // 0~3
 *
 * 只有網路錯誤、429、5xx 等可重試錯誤才會自動重試，
 * 4xx 參數錯誤不重試，避免造成重複發送。
 */
export async function sendSms(
  to: string,
  message: string,
  debugCode = ''
): Promise<SendSmsResult> {
  if (process.env.OTP_DEV_MODE === 'true') {
    console.log(`[SMS DEV] ${to}: ${message}`)
    return {
      ok: true,
      provider: 'development',
      attempts: 1,
      ...(debugCode ? { debugCode } : {}),
    }
  }

  const url = process.env.SMS_API_URL
  const token = process.env.SMS_API_TOKEN
  const from = String(process.env.SMS_API_FROM || '').trim()

  if (!url || !token) {
    return {
      ok: false,
      provider: 'unconfigured',
      attempts: 0,
      error: '尚未設定 SMS_API_URL / SMS_API_TOKEN',
    }
  }

  const timeoutMs = intEnv('SMS_API_TIMEOUT_MS', 10_000, 2_000, 30_000)
  const retries = intEnv('SMS_API_RETRIES', 1, 0, 3)
  const maxAttempts = retries + 1

  let lastError = 'SMS 發送失敗'
  let lastStatus: number | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to,
          message,
          ...(from ? { from } : {}),
        }),
        cache: 'no-store',
        signal: controller.signal,
      })

      clearTimeout(timer)
      lastStatus = response.status

      if (response.ok) {
        return {
          ok: true,
          provider: 'http',
          attempts: attempt,
          statusCode: response.status,
        }
      }

      let detail = ''
      try {
        detail = (await response.text()).trim().slice(0, 240)
      } catch {
        detail = ''
      }

      lastError = `SMS API 回應 ${response.status}${detail ? `：${detail}` : ''}`

      if (!shouldRetry(response.status) || attempt >= maxAttempts) {
        return {
          ok: false,
          provider: 'http',
          attempts: attempt,
          statusCode: response.status,
          error: lastError,
        }
      }
    } catch (error: any) {
      clearTimeout(timer)
      lastError =
        error?.name === 'AbortError'
          ? `SMS API 逾時（${timeoutMs}ms）`
          : error?.message || 'SMS 發送失敗'

      if (attempt >= maxAttempts) {
        return {
          ok: false,
          provider: 'http',
          attempts: attempt,
          statusCode: lastStatus,
          error: lastError,
        }
      }
    }

    await wait(Math.min(1500, 300 * attempt))
  }

  return {
    ok: false,
    provider: 'http',
    attempts: maxAttempts,
    statusCode: lastStatus,
    error: lastError,
  }
}
