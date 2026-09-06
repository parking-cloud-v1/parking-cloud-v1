import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getLotApplicationAvailability,
  listOpenApplicationLots,
} from '@/lib/online-contracts/applicationAvailability'
import {
  getCapacitySnapshot,
  getCapacitySnapshots,
} from '@/lib/online-contracts/capacity'
import {
  consumePublicRateLimit,
  publicFailure,
  rateLimitResponse,
  secureJson,
} from '@/lib/security/publicSecurity'

function publicCapacityView(snapshot: any) {
  if (!snapshot) return null

  const item = (value: any) => ({
    limit: value?.limit ?? null,
    remaining: value?.remaining ?? null,
    full: Boolean(value?.full),
    waiting: Number(value?.waiting || 0),
  })

  return {
    auto_waitlist_when_full: snapshot.auto_waitlist_when_full !== false,
    car: item(snapshot.car),
    motorcycle: item(snapshot.motorcycle),
    heavy_motorcycle: item(snapshot.heavy_motorcycle),
  }
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('伺服器環境變數未設定完整。')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

export async function GET(request: NextRequest) {
  try {
    const id = String(request.nextUrl.searchParams.get('id') || '').trim()
    const admin = adminClient()
    const viewLimit = await consumePublicRateLimit(admin, request, {
      scope: 'public_parking_lots_ip',
      subject: id || 'list',
      limit: 180,
      windowSeconds: 600,
    })
    if (!viewLimit.allowed) return rateLimitResponse(viewLimit)

    if (id) {
      const availability = await getLotApplicationAvailability(admin, id)

      if (!availability.open || !availability.lot) {
        return secureJson(
          {
            error: availability.reason || '此停車場目前未開放。',
            open: false,
          },
          403
        )
      }

      const capacity = await getCapacitySnapshot(admin, id)

      return secureJson({
        ok: true,
        open: true,
        lot: {
          ...availability.lot,
          allowed_rental_types:
            availability.setting?.allowed_rental_types || ['一般'],
          public_note: availability.setting?.public_note || null,
          starts_at: availability.setting?.starts_at || null,
          ends_at: availability.setting?.ends_at || null,
          auto_waitlist_when_full:
            availability.setting?.auto_waitlist_when_full !== false,
          capacity: publicCapacityView(capacity),
        },
      })
    }

    const lots = await listOpenApplicationLots(admin)
    const capacityMap = await getCapacitySnapshots(
      admin,
      lots.map((lot: any) => lot.id)
    )
    const withCapacity = lots.map((lot: any) => {
      const {
        monthly_capacity_car: _car,
        monthly_capacity_motorcycle: _motorcycle,
        monthly_capacity_heavy_motorcycle: _heavy,
        auto_waitlist_when_full: _auto,
        ...publicLot
      } = lot

      return {
        ...publicLot,
        capacity: publicCapacityView(capacityMap[lot.id] || null),
      }
    })

    return secureJson({ ok: true, lots: withCapacity })
  } catch (error: any) {
    return publicFailure(
      'public-parking-lots',
      error,
      '停車場資料暫時無法載入，請稍後再試。',
      503
    )
  }
}
