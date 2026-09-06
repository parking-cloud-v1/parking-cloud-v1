import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { consumePublicRateLimit, hashOtpCode, publicFailure, rateLimitResponse } from '@/lib/security/publicSecurity'

function relationName(value: any) {
  if (Array.isArray(value)) return value[0]?.name || ''
  return value?.name || ''
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: '待審核',
    needs_revision: '待補件',
    waiting: '候補中',
    approved: '已核准，契約建立中',
    contract_sent: '待電子簽約',
    completed: '已完成',
    rejected: '審核未通過',
  }

  return labels[status] || status || '處理中'
}

function qualificationLabel(status?: string | null) {
  const labels: Record<string, string> = {
    pending: '資格待確認',
    approved: '資格已通過',
    rejected: '資格未通過',
    not_required: '免資格審核',
  }
  return labels[String(status || '')] || '—'
}

function publicMessage(
  status: string,
  supplementExpiresAt?: string | null,
  contract?: any,
  applicationKind?: string | null
) {
  const renewal = applicationKind === 'renewal'

  if (status === 'pending') {
    return renewal
      ? '續租申請已收到，目前等待管理人員確認續租期間、費用與資格。'
      : '申請資料已收到，目前等待管理人員審核。'
  }

  if (status === 'needs_revision') {
    const expired =
      !!supplementExpiresAt &&
      new Date(supplementExpiresAt).getTime() < Date.now()

    return expired
      ? '案件需要補件，但原補件連結已逾期，請聯絡停車場管理人員重新發送。'
      : '案件需要補件，請依簡訊中的專屬補件連結完成資料補正。'
  }

  if (status === 'waiting') {
    return '目前已列入月租候補名單，順位仍可能因現場管理作業調整。'
  }

  if (status === 'approved') {
    return '申請已核准，系統正在建立電子契約。'
  }

  if (status === 'contract_sent') {
    const expired =
      !!contract?.sign_token_expires_at &&
      new Date(contract.sign_token_expires_at).getTime() < Date.now()

    if (expired) {
      return '申請已核准，但簽約連結已逾期，請聯絡停車場管理人員重新發送。'
    }

    return '申請已核准，請使用簡訊中的專屬連結完成電子簽約。'
  }

  if (status === 'completed') {
    return renewal
      ? '續租電子契約已完成簽署，系統將更新原月租資料。'
      : '電子契約已完成簽署，案件已完成。'
  }

  if (status === 'rejected') {
    return '此申請經審核後未通過。'
  }

  return '案件目前正在處理中。'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const applicationId = String(body?.application_id || '').trim()
    const challengeId = String(body?.challenge_id || '').trim()
    const code = String(body?.code || '').trim()

    if (!applicationId || !challengeId || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: '查詢驗證資料不完整。' },
        { status: 400 }
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: '服務暫時無法使用，請稍後再試。' },
        { status: 500 }
      )
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    })

    const verifyLimit = await consumePublicRateLimit(admin, request, {
      scope: 'status_verify_ip', subject: applicationId, limit: 30, windowSeconds: 600,
    })
    if (!verifyLimit.allowed) return rateLimitResponse(verifyLimit)

    const { data: challenge, error: challengeError } = await admin
      .from('public_otp_challenges')
      .select(
        'id,application_id,phone,code_hash,expires_at,verified_at,consumed_at,attempts,purpose'
      )
      .eq('id', challengeId)
      .maybeSingle()

    if (challengeError || !challenge) {
      return NextResponse.json(
        { error: '查詢驗證碼不存在或已失效。' },
        { status: 400 }
      )
    }

    if (
      challenge.purpose !== 'application_status' ||
      challenge.application_id !== applicationId ||
      challenge.consumed_at
    ) {
      return NextResponse.json(
        { error: '查詢驗證狀態無效，請重新取得驗證碼。' },
        { status: 400 }
      )
    }

    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: '驗證碼已過期，請重新取得。' },
        { status: 410 }
      )
    }

    if (Number(challenge.attempts || 0) >= 5) {
      return NextResponse.json(
        { error: '驗證錯誤次數過多，請重新取得驗證碼。' },
        { status: 429 }
      )
    }

    const correctHash = hashOtpCode(challenge.id, code)

    if (correctHash !== challenge.code_hash) {
      const nextAttempts = Number(challenge.attempts || 0) + 1

      await admin
        .from('public_otp_challenges')
        .update({
          attempts: nextAttempts,
          ...(nextAttempts >= 5
            ? { consumed_at: new Date().toISOString() }
            : {}),
        })
        .eq('id', challenge.id)

      return NextResponse.json(
        {
          error:
            nextAttempts >= 5
              ? '驗證錯誤次數過多，請重新取得驗證碼。'
              : `驗證碼錯誤，尚可嘗試 ${5 - nextAttempts} 次。`,
        },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    const { data: consumed, error: consumeError } = await admin
      .from('public_otp_challenges')
      .update({
        verified_at: now,
        consumed_at: now,
      })
      .eq('id', challenge.id)
      .is('consumed_at', null)
      .select('id')
      .maybeSingle()

    if (consumeError || !consumed) {
      return NextResponse.json(
        { error: '驗證碼已使用，請重新取得。' },
        { status: 409 }
      )
    }

    const { data: application, error: applicationError } = await admin
      .from('rental_applications')
      .select(`
        id,
        parking_lot_id,
        application_kind,
        renewal_requested_months,
        renewal_current_end_date,
        renewal_suggested_start_date,
        renewal_suggested_end_date,
        applicant_name,
        phone,
        vehicle_plate,
        vehicle_type,
        rental_type,
        qualification_status,
        status,
        review_note,
        supplement_note,
        supplement_expires_at,
        waiting_list_id,
        created_at,
        updated_at,
        parking_lots(name)
      `)
      .eq('id', applicationId)
      .eq('phone', challenge.phone)
      .maybeSingle()

    if (applicationError || !application) {
      return NextResponse.json(
        { error: '申請資料已不存在或無法讀取。' },
        { status: 404 }
      )
    }

    let waiting: any = null
    if (application.waiting_list_id) {
      const { data } = await admin
        .from('monthly_waiting_list')
        .select('id,wait_no,status,registered_date,offer_status,offer_expires_at,offer_notified_at,offer_responded_at')
        .eq('id', application.waiting_list_id)
        .maybeSingle()
      waiting = data || null
    }

    const { data: contract } = await admin
      .from('contracts')
      .select(`
        id,
        contract_no,
        customer_code,
        status,
        start_date,
        end_date,
        monthly_fee,
        signed_at,
        sign_token_expires_at,
        sign_invitation_status,
        cancelled_at
      `)
      .eq('application_id', application.id)
      .maybeSingle()

    let archivePdfAvailable = false

    if (contract?.id && contract.signed_at) {
      const { data: archive } = await admin
        .from('signed_contract_archives')
        .select('pdf_path')
        .eq('contract_id', contract.id)
        .maybeSingle()

      archivePdfAvailable = Boolean(archive?.pdf_path)
    }

    const status = String(application.status || '')

    return NextResponse.json({
      ok: true,
      application: {
        id: application.id,
        application_kind: application.application_kind || 'new',
        renewal_requested_months: application.renewal_requested_months || null,
        renewal_current_end_date: application.renewal_current_end_date || null,
        renewal_suggested_start_date:
          application.renewal_suggested_start_date || null,
        renewal_suggested_end_date:
          application.renewal_suggested_end_date || null,
        applicant_name: application.applicant_name,
        parking_lot_name:
          relationName(application.parking_lots) || '停車場',
        vehicle_plate: application.vehicle_plate,
        vehicle_type: application.vehicle_type,
        rental_type: application.rental_type || '一般',
        qualification_status: application.qualification_status,
        qualification_label: qualificationLabel(
          application.qualification_status
        ),
        status,
        status_label: statusLabel(status),
        status_message: publicMessage(
          status,
          application.supplement_expires_at,
          contract,
          application.application_kind
        ),
        created_at: application.created_at,
        updated_at: application.updated_at,
        supplement_note:
          status === 'needs_revision'
            ? application.supplement_note || application.review_note || null
            : null,
        supplement_expires_at:
          status === 'needs_revision'
            ? application.supplement_expires_at
            : null,
        rejection_note:
          status === 'rejected' ? application.review_note || null : null,
      },
      waiting:
        waiting &&
        waiting.status === 'waiting' &&
        ['waiting', 'pending'].includes(status)
          ? {
              wait_no: waiting.wait_no,
              registered_date: waiting.registered_date,
              status: waiting.status,
              offer_status: waiting.offer_status || 'none',
              offer_expires_at: waiting.offer_expires_at || null,
              offer_notified_at: waiting.offer_notified_at || null,
              offer_responded_at: waiting.offer_responded_at || null,
            }
          : null,
      contract:
        contract && ['contract_sent', 'completed'].includes(status)
          ? {
              id: contract.id,
              contract_no: contract.contract_no,
              customer_code: contract.customer_code,
              status: contract.status,
              start_date: contract.start_date,
              end_date: contract.end_date,
              monthly_fee: contract.monthly_fee,
              signed_at: contract.signed_at,
              sign_token_expires_at: contract.sign_token_expires_at,
              sign_invitation_status: contract.sign_invitation_status,
              archive_download_available: Boolean(contract.signed_at),
              archive_pdf_available: archivePdfAvailable,
            }
          : null,
    })
  } catch (error: any) {
    return publicFailure('application-status-verify', error, '進度查詢暫時無法使用，請稍後再試。', 503)
  }
}
