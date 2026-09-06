export type SendSmsResult = {
  ok: boolean
  provider: string
  debugCode?: string
  error?: string
}

/**
 * SMS 發送介面。
 *
 * 正式上線：
 * 1. 設 SMS_API_URL
 * 2. 設 SMS_API_TOKEN
 * 3. 對方 API 接收 JSON：{ to, message }
 *
 * 開發測試：
 * OTP_DEV_MODE=true 時不發真正簡訊，API 會回傳 debugCode。
 */
export async function sendSms(
  to: string,
  message: string,
  debugCode: string
): Promise<SendSmsResult> {
  if (process.env.OTP_DEV_MODE === 'true') {
    console.log(`[OTP DEV] ${to}: ${message}`)
    return {
      ok: true,
      provider: 'development',
      debugCode,
    }
  }

  const url = process.env.SMS_API_URL
  const token = process.env.SMS_API_TOKEN

  if (!url || !token) {
    return {
      ok: false,
      provider: 'unconfigured',
      error: '尚未設定 SMS_API_URL / SMS_API_TOKEN',
    }
  }

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
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      return {
        ok: false,
        provider: 'http',
        error: `SMS API 回應 ${response.status}`,
      }
    }

    return {
      ok: true,
      provider: 'http',
    }
  } catch (error: any) {
    return {
      ok: false,
      provider: 'http',
      error: error?.message || 'SMS 發送失敗',
    }
  }
}
