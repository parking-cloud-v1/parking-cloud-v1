import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('伺服器環境變數未設定完整。')
  }

  return createAdminClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '未登入。' }, { status: 401 })
    }

    const actorUserId = user.id
    const actorLabel = user.email || actorUserId

    const body = await request.json()
    const contractId = String(body?.contract_id || '').trim()
    const action = String(body?.action || '').trim()
    const reason = String(body?.reason || '').trim()

    if (!contractId || action !== 'cancel_pending') {
      return NextResponse.json(
        { error: '契約處理參數錯誤。' },
        { status: 400 }
      )
    }

    if (!reason) {
      return NextResponse.json(
        { error: '請填寫取消原因。' },
        { status: 400 }
      )
    }

    // 先用登入者 client 讀取，讓既有 RLS 驗證場站權限。
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        id, contract_no, customer_code, application_id, parking_lot_id,
        status, sign_token_expires_at, monthly_rental_id
      `)
      .eq('id', contractId)
      .maybeSingle()

    if (contractError || !contract) {
      return NextResponse.json(
        { error: '找不到契約或沒有此停車場權限。' },
        { status: 404 }
      )
    }

    if (contract.status === 'signed') {
      return NextResponse.json(
        {
          error:
            '已簽署契約屬正式文件，不能使用「取消待簽」處理。請保留原契約並另走正式作廢流程。',
        },
        { status: 409 }
      )
    }

    if (!['draft', 'sent'].includes(String(contract.status || ''))) {
      return NextResponse.json(
        { error: '只有草稿或待簽約契約可以取消並退回審核。' },
        { status: 409 }
      )
    }

    const admin = adminClient()
    const now = new Date().toISOString()
    const previousStatus = String(contract.status || '')

    const { data: updatedContract, error: updateError } = await admin
      .from('contracts')
      .update({
        status: 'cancelled',
        cancelled_at: now,
        cancelled_by: actorUserId,
        cancel_reason: reason,
        sign_token_hash: null,
        sign_token_expires_at: null,
        sign_token_used_at: null,
        sign_invitation_status: 'cancelled',
        sign_invitation_error: null,
        updated_at: now,
      })
      .eq('id', contract.id)
      .in('status', ['draft', 'sent'])
      .select('id,status')
      .maybeSingle()

    if (updateError || !updatedContract) {
      return NextResponse.json(
        {
          error:
            updateError?.message ||
            '契約狀態已被其他人變更，請重新整理後再試。',
        },
        { status: 409 }
      )
    }

    if (contract.application_id) {
      await admin
        .from('rental_applications')
        .update({
          status: 'pending',
          review_note: reason,
          reviewed_by: actorUserId,
          reviewed_at: now,
          updated_at: now,
        })
        .eq('id', contract.application_id)
        .eq('status', 'contract_sent')

      await admin.from('online_application_reviews').insert({
        application_id: contract.application_id,
        parking_lot_id: contract.parking_lot_id,
        actor_user_id: actorUserId,
        actor_label: actorLabel,
        action: 'CONTRACT_CANCELLED_FOR_REVIEW',
        previous_status: 'contract_sent',
        new_status: 'pending',
        note: reason,
        metadata: {
          contract_id: contract.id,
          contract_no: contract.contract_no,
        },
      })
    }

    await admin.from('contract_lifecycle_events').insert({
      contract_id: contract.id,
      application_id: contract.application_id,
      parking_lot_id: contract.parking_lot_id,
      actor_user_id: actorUserId,
      event_type: 'CANCELLED_FOR_REVIEW',
      previous_status: previousStatus,
      new_status: 'cancelled',
      note: reason,
      metadata: {
        customer_code: contract.customer_code || null,
        contract_no: contract.contract_no,
      },
    })

    await admin.from('online_audit_logs').insert({
      actor_user_id: actorUserId,
      parking_lot_id: contract.parking_lot_id,
      application_id: contract.application_id,
      contract_id: contract.id,
      action: 'CONTRACT_CANCELLED_FOR_REVIEW',
      detail: {
        contract_no: contract.contract_no,
        customer_code: contract.customer_code || null,
        previous_status: previousStatus,
        reason,
      },
    })

    return NextResponse.json({
      ok: true,
      contract_id: contract.id,
      contract_no: contract.contract_no,
      status: 'cancelled',
      application_id: contract.application_id,
      message: contract.application_id
        ? '待簽契約已取消，原申請已退回待審核。'
        : '待簽契約已取消。',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '系統錯誤。' },
      { status: 500 }
    )
  }
}
