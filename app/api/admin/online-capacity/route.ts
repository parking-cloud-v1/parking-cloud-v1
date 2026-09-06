import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getCapacitySnapshot } from '@/lib/online-contracts/capacity'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '未登入。' }, { status: 401 })
    }

    const parkingLotId = String(
      request.nextUrl.searchParams.get('parking_lot_id') || ''
    ).trim()

    if (!parkingLotId) {
      return NextResponse.json(
        { error: '缺少停車場資料。' },
        { status: 400 }
      )
    }

    const { data: lot, error: lotError } = await supabase
      .from('parking_lots')
      .select('id,name,status')
      .eq('id', parkingLotId)
      .maybeSingle()

    if (lotError || !lot) {
      return NextResponse.json(
        { error: '找不到停車場或沒有此場站權限。' },
        { status: 403 }
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: '伺服器環境變數未設定完整。' },
        { status: 500 }
      )
    }

    const admin = createAdminClient(url, serviceKey, {
      auth: { persistSession: false },
    })

    const snapshot = await getCapacitySnapshot(admin, parkingLotId)

    return NextResponse.json({
      ok: true,
      lot,
      capacity: snapshot,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '月租名額讀取失敗。' },
      { status: 500 }
    )
  }
}
