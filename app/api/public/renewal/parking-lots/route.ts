import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  consumePublicRateLimit,
  publicFailure,
  rateLimitResponse,
  secureJson,
} from '@/lib/security/publicSecurity'

export async function GET(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      throw new Error('SERVER_ENV_NOT_READY')
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    })

    const viewLimit = await consumePublicRateLimit(admin, request, {
      scope: 'renewal_parking_lots_ip',
      subject: 'list',
      limit: 120,
      windowSeconds: 600,
    })
    if (!viewLimit.allowed) return rateLimitResponse(viewLimit)

    const { data: settings, error: settingError } = await admin
      .from('online_application_settings')
      .select('parking_lot_id,renewal_enabled')
      .eq('renewal_enabled', true)

    if (settingError) {
      throw settingError
    }

    const lotIds = (settings || [])
      .map((item: any) => String(item.parking_lot_id || '').trim())
      .filter(Boolean)

    if (!lotIds.length) {
      return secureJson({ ok: true, lots: [] })
    }

    const { data: lots, error: lotError } = await admin
      .from('parking_lots')
      .select('id,name,status')
      .in('id', lotIds)
      .eq('status', 'active')
      .order('name')

    if (lotError) {
      throw lotError
    }

    return secureJson({
      ok: true,
      lots: (lots || []).map((lot: any) => ({
        id: lot.id,
        name: lot.name,
      })),
    })
  } catch (error: any) {
    return publicFailure(
      'renewal-parking-lots',
      error,
      '續租停車場資料暫時無法載入，請稍後再試。',
      503
    )
  }
}
