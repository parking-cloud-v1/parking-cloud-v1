import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { syncSignedContractToMonthlyRental } from '@/lib/online-contracts/syncMonthlyRental'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: '未登入。' },
        { status: 401 }
      )
    }

    const actorUserId = user.id

    const body = await request.json()
    const contractId = String(body?.contract_id || '').trim()

    if (!contractId) {
      return NextResponse.json(
        { error: '缺少契約 ID。' },
        { status: 400 }
      )
    }

    // 透過使用者 session + RLS 先確認此帳號有權查看這張契約。
    const { data: contract, error: contractError } =
      await supabase
        .from('contracts')
        .select('id,status,parking_lot_id,contract_no')
        .eq('id', contractId)
        .maybeSingle()

    if (contractError || !contract) {
      return NextResponse.json(
        { error: '找不到契約或沒有場站權限。' },
        { status: 404 }
      )
    }

    if (contract.status !== 'signed') {
      return NextResponse.json(
        { error: '只有已簽署契約可以重新同步。' },
        { status: 400 }
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

    const result = await syncSignedContractToMonthlyRental(
      admin,
      contractId
    )

    await admin.from('online_audit_logs').insert({
      actor_user_id: actorUserId,
      parking_lot_id: contract.parking_lot_id,
      contract_id: contract.id,
      action: 'MONTHLY_RENTAL_SYNC_RETRY',
      detail: {
        contract_no: contract.contract_no,
        result_status: result.status,
        result_message: result.message || null,
        monthly_rental_id:
          result.monthlyRentalId || null,
      },
    })

    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      monthly_rental_id:
        result.monthlyRentalId || null,
      message: result.message || null,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '重新同步失敗。' },
      { status: 500 }
    )
  }
}
