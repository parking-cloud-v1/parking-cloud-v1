import { createHash, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  buildContractSnapshot,
  CONTRACT_VERSION,
} from '@/lib/online-contracts/contractTemplate'
import { sendSms } from '@/lib/sms/sendSms'

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function taipeiYearMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())

  const get = (type: string) =>
    parts.find((item) => item.type === type)?.value || ''

  return `${get('year')}${get('month')}`
}

function contractNo(customerCode: string) {
  return `${customerCode}-${taipeiYearMonth()}`
}

function relationName(value: any) {
  if (Array.isArray(value)) {
    return value[0]?.name || ''
  }
  return value?.name || ''
}

function plateKey(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
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

    const body = await request.json()
    const applicationId = String(body?.application_id || '').trim()
    const action = String(body?.action || '').trim()

    if (
      !applicationId ||
      !['approve', 'reject', 'waiting', 'needs_revision'].includes(action)
    ) {
      return NextResponse.json(
        { error: '審核參數錯誤。' },
        { status: 400 }
      )
    }

    // 這個查詢使用登入者 session + RLS，先確認操作人員真的有該場站權限。
    const { data: application, error: appError } = await supabase
      .from('rental_applications')
      .select('*, parking_lots(name)')
      .eq('id', applicationId)
      .maybeSingle()

    if (appError || !application) {
      return NextResponse.json(
        { error: '找不到申請資料或無權限。' },
        { status: 404 }
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

    const now = new Date().toISOString()
    const previousStatus = String(application.status || 'pending')
    // user 已在上方完成未登入判斷。先取出不可為 null 的固定值，
    // 避免 TypeScript 在內部 async function / closure 中重新視為可能 null。
    const actorUserId = user.id
    const actorLabel = user.email || actorUserId
    const qualificationStatus = String(
      body?.qualification_status ||
        application.qualification_status ||
        'not_required'
    )
    const reviewNote = body?.review_note
      ? String(body.review_note).trim()
      : null
    const isRenewal = application.application_kind === 'renewal'

    async function recordReview(
      reviewAction: string,
      newStatus: string,
      note: string | null,
      metadata: Record<string, any> = {}
    ) {
      await admin.from('online_application_reviews').insert({
        application_id: application.id,
        parking_lot_id: application.parking_lot_id,
        actor_user_id: actorUserId,
        actor_label: actorLabel,
        action: reviewAction,
        previous_status: previousStatus,
        new_status: newStatus,
        qualification_status: qualificationStatus,
        note,
        metadata,
      })
    }

    // -------------------------------------------------------
    // 要求補件：產生 72 小時 bearer token，原始 token 不寫入 DB。
    // -------------------------------------------------------
    if (action === 'needs_revision') {
      if (!['pending', 'needs_revision'].includes(previousStatus)) {
        return NextResponse.json(
          { error: '只有待審核／補件中的案件可以要求補件。' },
          { status: 400 }
        )
      }

      if (!reviewNote) {
        return NextResponse.json(
          { error: '請填寫需要民眾補正的內容。' },
          { status: 400 }
        )
      }

      const token = randomBytes(32).toString('base64url')
      const supplementTokenHash = tokenHash(token)
      const expiresAt = new Date(
        Date.now() + 72 * 60 * 60_000
      ).toISOString()

      const { error: updateError } = await admin
        .from('rental_applications')
        .update({
          status: 'needs_revision',
          supplement_token_hash: supplementTokenHash,
          supplement_expires_at: expiresAt,
          supplement_requested_at: now,
          supplement_completed_at: null,
          supplement_note: reviewNote,
          reviewed_by: actorUserId,
          reviewed_at: now,
          review_note: reviewNote,
          updated_at: now,
        })
        .eq('id', applicationId)

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        )
      }

      const supplementUrl = `${siteUrl()}/supplement/${token}`
      const parkingLotName =
        relationName(application.parking_lots) || '停車場'
      const smsMessage =
        `智驛科技月租申請補件通知：${parkingLotName}。` +
        `請於 72 小時內依通知補正資料：${supplementUrl}`

      const sms = await sendSms(application.phone, smsMessage)

      await recordReview('SUPPLEMENT_REQUESTED', 'needs_revision', reviewNote, {
        expires_at: expiresAt,
        sms_status: sms.ok ? 'sent' : 'failed',
        sms_provider: sms.provider,
        sms_error: sms.error || null,
      })

      await admin.from('online_audit_logs').insert({
        actor_user_id: actorUserId,
        parking_lot_id: application.parking_lot_id,
        application_id: application.id,
        action: 'APPLICATION_SUPPLEMENT_REQUESTED',
        detail: {
          review_note: reviewNote,
          expires_at: expiresAt,
          sms_status: sms.ok ? 'sent' : 'failed',
          sms_provider: sms.provider,
          sms_error: sms.error || null,
        },
      })

      return NextResponse.json({
        ok: true,
        status: 'needs_revision',
        supplement_url: supplementUrl,
        expires_at: expiresAt,
        sms_status: sms.ok ? 'sent' : 'failed',
        sms_provider: sms.provider,
        sms_error: sms.error || null,
        dev_mode: process.env.OTP_DEV_MODE === 'true',
      })
    }

    // -------------------------------------------------------
    // 轉候補：同步寫入原系統 monthly_waiting_list。
    // -------------------------------------------------------
    if (action === 'waiting') {
      if (previousStatus === 'needs_revision') {
        return NextResponse.json(
          { error: '案件正在等待民眾補件，補件完成後再轉候補。' },
          { status: 400 }
        )
      }

      if (['rejected', 'contract_sent', 'completed'].includes(previousStatus)) {
        return NextResponse.json(
          { error: '此案件目前狀態不可再轉候補。' },
          { status: 400 }
        )
      }

      const { data: waitingId, error: waitingError } = await admin.rpc(
        'move_online_application_to_waiting',
        {
          p_application_id: application.id,
          p_actor_user_id: actorUserId,
          p_review_note: reviewNote,
        }
      )

      if (waitingError || !waitingId) {
        return NextResponse.json(
          {
            error:
              '轉入候補失敗：' +
              (waitingError?.message || '無法建立候補資料'),
          },
          { status: 500 }
        )
      }

      await recordReview('WAITLISTED', 'waiting', reviewNote, {
        waiting_list_id: waitingId,
      })

      await admin.from('online_audit_logs').insert({
        actor_user_id: actorUserId,
        parking_lot_id: application.parking_lot_id,
        application_id: application.id,
        action: 'APPLICATION_WAITLISTED',
        detail: {
          review_note: reviewNote,
          waiting_list_id: waitingId,
        },
      })

      return NextResponse.json({
        ok: true,
        status: 'waiting',
        waiting_list_id: waitingId,
      })
    }

    // -------------------------------------------------------
    // 不通過
    // -------------------------------------------------------
    if (action === 'reject') {
      if (['contract_sent', 'completed'].includes(previousStatus)) {
        return NextResponse.json(
          { error: '已建立契約的案件不能從申請審核頁直接改為不通過。' },
          { status: 400 }
        )
      }

      const { error } = await admin
        .from('rental_applications')
        .update({
          qualification_status: qualificationStatus,
          status: 'rejected',
          reviewed_by: actorUserId,
          reviewed_at: now,
          review_note: reviewNote,
          supplement_token_hash: null,
          supplement_expires_at: null,
          updated_at: now,
        })
        .eq('id', applicationId)

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        )
      }

      if (application.waiting_list_id) {
        await admin
          .from('monthly_waiting_list')
          .update({ status: 'cancelled', updated_at: now })
          .eq('id', application.waiting_list_id)
          .eq('status', 'waiting')
      }

      await recordReview('REJECTED', 'rejected', reviewNote)

      await admin.from('online_audit_logs').insert({
        actor_user_id: actorUserId,
        parking_lot_id: application.parking_lot_id,
        application_id: application.id,
        action: 'APPLICATION_REJECTED',
        detail: { review_note: reviewNote },
      })

      return NextResponse.json({ ok: true, status: 'rejected' })
    }

    // -------------------------------------------------------
    // 核准／候補轉正式
    // -------------------------------------------------------
    if (previousStatus === 'needs_revision') {
      return NextResponse.json(
        { error: '此案件尚未完成補件，完成補件後才能核准。' },
        { status: 400 }
      )
    }

    if (['rejected', 'contract_sent', 'completed'].includes(previousStatus)) {
      return NextResponse.json(
        { error: '此案件目前狀態不可再次核准。' },
        { status: 400 }
      )
    }

    if (!application.otp_verified) {
      return NextResponse.json(
        { error: '此申請尚未完成手機 OTP 驗證。' },
        { status: 400 }
      )
    }

    const qualificationRequired =
      application.qualification_type &&
      application.qualification_type !== 'none'

    if (
      qualificationRequired &&
      qualificationStatus !== 'approved'
    ) {
      return NextResponse.json(
        { error: '此案件需要資格審核通過後才能核准。' },
        { status: 400 }
      )
    }

    const startDate = String(body?.start_date || '').trim()
    const endDate = String(body?.end_date || '').trim()
    const monthlyFee = Number(body?.monthly_fee)

    if (
      !startDate ||
      !endDate ||
      endDate < startDate ||
      !Number.isFinite(monthlyFee) ||
      monthlyFee < 0
    ) {
      return NextResponse.json(
        { error: '請填寫正確租期與月租金額。' },
        { status: 400 }
      )
    }

    let renewalRental: any = null

    if (isRenewal) {
      if (!application.existing_monthly_rental_id) {
        return NextResponse.json(
          { error: '此續租案件缺少原月租資料關聯，請勿直接核准。' },
          { status: 409 }
        )
      }

      const { data: originalRental, error: renewalRentalError } = await admin
        .from('monthly_rentals')
        .select(`
          id,parking_lot_id,customer_code,customer_name,phone,vehicle_plate,
          vehicle_type,rental_type,start_date,end_date,monthly_fee,rental_status
        `)
        .eq('id', application.existing_monthly_rental_id)
        .eq('parking_lot_id', application.parking_lot_id)
        .maybeSingle()

      if (renewalRentalError || !originalRental) {
        return NextResponse.json(
          { error: '找不到這筆續租申請所對應的原月租資料。' },
          { status: 409 }
        )
      }

      if (originalRental.rental_status === 'cancelled') {
        return NextResponse.json(
          { error: '原月租已退租，不能以續租方式直接建立契約。' },
          { status: 409 }
        )
      }

      if (
        plateKey(originalRental.vehicle_plate) !==
        plateKey(application.vehicle_plate)
      ) {
        return NextResponse.json(
          { error: '續租申請車牌與原月租資料不一致，請先確認資料。' },
          { status: 409 }
        )
      }

      if (!String(originalRental.customer_code || '').trim()) {
        return NextResponse.json(
          { error: '原月租沒有客戶編號，請先在月租總表補正後再核准續租。' },
          { status: 409 }
        )
      }

      if (
        originalRental.end_date &&
        startDate <= String(originalRental.end_date)
      ) {
        return NextResponse.json(
          {
            error:
              `續租開始日必須晚於原到期日 ${originalRental.end_date}。` +
              ' 系統已在畫面預帶建議日期，可依實際規定調整。',
          },
          { status: 400 }
        )
      }

      renewalRental = originalRental
    }

    const existingContract = await admin
      .from('contracts')
      .select('id,contract_no,status,customer_code,reissue_count')
      .eq('application_id', application.id)
      .maybeSingle()

    if (
      existingContract.data &&
      existingContract.data.status !== 'cancelled'
    ) {
      return NextResponse.json(
        {
          error: `此申請已建立契約：${existingContract.data.contract_no}`,
        },
        { status: 409 }
      )
    }

    const reusableContract =
      existingContract.data?.status === 'cancelled'
        ? existingContract.data
        : null

    if (reusableContract) {
      const { count: signatureCount } = await admin
        .from('contract_signatures')
        .select('id', { count: 'exact', head: true })
        .eq('contract_id', reusableContract.id)

      if ((signatureCount || 0) > 0) {
        return NextResponse.json(
          {
            error:
              '此取消契約已有簽署紀錄，不能直接重新建立，請由主管處理正式作廢流程。',
          },
          { status: 409 }
        )
      }
    }

    // -------------------------------------------------------
    // 第十八階段：若候補已經發出遞補通知，必須等民眾完成 OTP 回覆。
    // 舊候補／手動轉候補若沒有 offer_status='offered'，仍維持原流程可人工處理。
    // -------------------------------------------------------
    if (application.waiting_list_id) {
      const { data: waitingRow } = await admin
        .from('monthly_waiting_list')
        .select('id,status,offer_status,offer_expires_at')
        .eq('id', application.waiting_list_id)
        .maybeSingle()

      if (waitingRow?.status === 'waiting') {
        const offerExpiresAt = waitingRow.offer_expires_at
          ? new Date(waitingRow.offer_expires_at).getTime()
          : 0
        const offerExpired = offerExpiresAt > 0 && offerExpiresAt <= Date.now()

        if (offerExpired && ['offered', 'accepted'].includes(waitingRow.offer_status)) {
          await admin.rpc('expire_online_waitlist_offers', {
            p_parking_lot_id: application.parking_lot_id,
          })

          return NextResponse.json(
            {
              error:
                '此候補遞補保留已逾期，系統已釋放名額並保留候補資格。請重新整理名額控管後再處理。',
              code: 'WAITLIST_OFFER_EXPIRED',
            },
            { status: 409 }
          )
        }

        if (waitingRow.offer_status === 'offered') {
          return NextResponse.json(
            {
              error:
                '候補名額通知已發送，但民眾尚未完成手機 OTP 並確認接受遞補，現在不能建立契約。',
              code: 'WAITLIST_OFFER_PENDING',
            },
            { status: 409 }
          )
        }
      }
    }

    // -------------------------------------------------------
    // 第十七階段：建立契約前先原子保留該車種月租名額。
    // DB 會以「停車場 + 車種」 advisory lock 防止兩位人員同時核准超額。
    // reservation 有 15 分鐘 TTL；流程失敗會主動 release。
    // -------------------------------------------------------
    let capacityHeld = false
    let capacityReservation: any = null

    const { data: capacityResult, error: capacityError } = await admin.rpc(
      'reserve_online_application_capacity',
      {
        p_application_id: application.id,
        p_actor_user_id: actorUserId,
      }
    )

    if (capacityError) {
      return NextResponse.json(
        {
          error:
            '月租名額檢查失敗：' +
            (capacityError.message || '無法取得名額保留'),
        },
        { status: 500 }
      )
    }

    capacityReservation = capacityResult || null

    if (capacityResult?.full || capacityResult?.ok === false) {
      const limit = capacityResult?.limit
      const used = capacityResult?.used
      return NextResponse.json(
        {
          error:
            `此車種月租名額已滿` +
            (limit !== null && limit !== undefined
              ? `（上限 ${limit}，目前已占用 ${used ?? limit}）`
              : '') +
            '，請將案件轉候補或調整場站名額。',
          code: 'CAPACITY_FULL',
          capacity: capacityResult,
        },
        { status: 409 }
      )
    }

    capacityHeld = true

    async function releaseCapacity(reason: string) {
      if (!capacityHeld) return
      capacityHeld = false
      await admin.rpc('release_online_capacity_reservation', {
        p_application_id: application.id,
        p_reason: reason,
      })
    }

    let customerCode = isRenewal
      ? String(renewalRental?.customer_code || '').trim()
      : String(application.customer_code || '').trim()

    if (!customerCode) {
      const { data: allocatedCode, error: allocationError } = await admin.rpc(
        'assign_parking_lot_customer_code',
        { p_application_id: application.id }
      )

      if (allocationError || !allocatedCode) {
        await releaseCapacity('客戶編號產生失敗')
        return NextResponse.json(
          {
            error:
              '客戶編號產生失敗：' +
              (allocationError?.message ||
                '無法取得目前停車場下一個客戶編號'),
          },
          { status: 500 }
        )
      }

      customerCode = String(allocatedCode).trim()
    }

    const token = randomBytes(32).toString('base64url')
    const signTokenHash = tokenHash(token)
    const expiresAt = new Date(
      Date.now() + 72 * 60 * 60_000
    ).toISOString()

    const no = contractNo(customerCode)
    const parkingLotName =
      relationName(application.parking_lots) || '停車場'

    const snapshot = buildContractSnapshot({
      contractNo: no,
      customerCode,
      parkingLotName,
      customerName: application.applicant_name,
      phone: application.phone,
      address: application.address,
      emergencyContactName: application.emergency_contact_name,
      emergencyContactPhone: application.emergency_contact_phone,
      vehiclePlate: application.vehicle_plate,
      vehicleType: application.vehicle_type,
      rentalType: application.rental_type,
      startDate,
      endDate,
      monthlyFee,
    })

    const documentHash = createHash('sha256')
      .update(snapshot)
      .digest('hex')

    const contractPayload = {
      contract_no: no,
      customer_code: customerCode,
      application_id: application.id,
      parking_lot_id: application.parking_lot_id,
      customer_name: application.applicant_name,
      phone: application.phone,
      customer_address: application.address || null,
      emergency_contact_name:
        application.emergency_contact_name || null,
      emergency_contact_phone:
        application.emergency_contact_phone || null,
      vehicle_plate: application.vehicle_plate,
      vehicle_type: application.vehicle_type,
      rental_type: application.rental_type,
      start_date: startDate,
      end_date: endDate,
      monthly_fee: monthlyFee,
      contract_version: CONTRACT_VERSION,
      contract_snapshot: snapshot,
      document_hash: documentHash,
      status: 'sent',
      capacity_consumes_slot: capacityResult?.consumes_slot !== false,
      signed_at: null,
      sign_token_hash: signTokenHash,
      sign_token_expires_at: expiresAt,
      sign_token_used_at: null,
      signer_privacy_agreed_at: null,
      signer_electronic_agreed_at: null,
      signer_contract_read_at: null,
      signer_data_confirmed_at: null,
      signer_non_fixed_space_agreed_at: null,
      monthly_sync_status: 'pending',
      monthly_sync_error: null,
      monthly_rental_id: null,
      monthly_synced_at: null,
      sign_invitation_sent_at: null,
      sign_invitation_provider: null,
      sign_invitation_status: 'pending',
      sign_invitation_error: null,
      cancelled_at: null,
      cancelled_by: null,
      cancel_reason: null,
      updated_at: now,
    }

    let contract: any = null
    let contractError: any = null

    if (reusableContract) {
      const result = await admin
        .from('contracts')
        .update({
          ...contractPayload,
          reissue_count: Number(reusableContract.reissue_count || 0) + 1,
          reissued_at: now,
          reissued_by: actorUserId,
        })
        .eq('id', reusableContract.id)
        .eq('status', 'cancelled')
        .select('id,contract_no,customer_code')
        .maybeSingle()

      contract = result.data
      contractError = result.error
    } else {
      const result = await admin
        .from('contracts')
        .insert({
          ...contractPayload,
          reissue_count: 0,
        })
        .select('id,contract_no,customer_code')
        .single()

      contract = result.data
      contractError = result.error
    }

    if (contractError || !contract) {
      await releaseCapacity('契約建立失敗')
      return NextResponse.json(
        {
          error:
            contractError?.message ||
            '契約建立失敗，請重新整理後再試。',
        },
        { status: 500 }
      )
    }

    if (reusableContract) {
      await admin.from('contract_lifecycle_events').insert({
        contract_id: contract.id,
        application_id: application.id,
        parking_lot_id: application.parking_lot_id,
        actor_user_id: actorUserId,
        event_type: 'REISSUED_AFTER_REVIEW',
        previous_status: 'cancelled',
        new_status: 'sent',
        note: reviewNote || '重新審核後建立待簽契約',
        metadata: {
          contract_no: contract.contract_no,
          customer_code: customerCode,
          contract_version: CONTRACT_VERSION,
          document_hash: documentHash,
          expires_at: expiresAt,
        },
      })
    } else {
      await admin.from('contract_lifecycle_events').insert({
        contract_id: contract.id,
        application_id: application.id,
        parking_lot_id: application.parking_lot_id,
        actor_user_id: actorUserId,
        event_type: 'CREATED',
        previous_status: null,
        new_status: 'sent',
        note: reviewNote,
        metadata: {
          contract_no: contract.contract_no,
          customer_code: customerCode,
          contract_version: CONTRACT_VERSION,
          document_hash: documentHash,
          expires_at: expiresAt,
        },
      })
    }

    const { error: updateError } = await admin
      .from('rental_applications')
      .update({
        customer_code: customerCode,
        qualification_status: qualificationStatus,
        status: 'contract_sent',
        reviewed_by: actorUserId,
        reviewed_at: now,
        review_note: reviewNote,
        supplement_token_hash: null,
        supplement_expires_at: null,
        updated_at: now,
      })
      .eq('id', applicationId)

    if (updateError) {
      await releaseCapacity('申請狀態更新失敗')
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    const { error: finalizeCapacityError } = await admin.rpc(
      'finalize_online_capacity_reservation',
      {
        p_application_id: application.id,
        p_contract_id: contract.id,
      }
    )

    capacityHeld = false

    if (finalizeCapacityError) {
      // 契約本身已建立成功，contracts.status='sent' 仍會占用名額；
      // reservation 最多 15 分鐘後失效，因此不回滾合法核准流程。
      await admin.from('online_audit_logs').insert({
        actor_user_id: actorUserId,
        parking_lot_id: application.parking_lot_id,
        application_id: application.id,
        contract_id: contract.id,
        action: 'CAPACITY_RESERVATION_FINALIZE_FAILED',
        detail: { error: finalizeCapacityError.message },
      })
    }

    // 候補轉正式：建立契約成功後才將既有候補列標示 converted。
    if (application.waiting_list_id) {
      await admin
        .from('monthly_waiting_list')
        .update({
          status: 'converted',
          converted_at: now,
          updated_at: now,
        })
        .eq('id', application.waiting_list_id)
        .eq('status', 'waiting')
    }

    const signUrl = `${siteUrl()}/sign/${token}`
    const smsMessage =
      `智驛科技月租停車簽約通知：${parkingLotName}，` +
      `客戶編號 ${customerCode}，契約編號 ${contract.contract_no}。` +
      `請於 72 小時內完成電子簽約：${signUrl}`

    const sms = await sendSms(application.phone, smsMessage)

    await admin
      .from('contracts')
      .update({
        sign_invitation_sent_at: sms.ok ? now : null,
        sign_invitation_provider: sms.provider,
        sign_invitation_status: sms.ok ? 'sent' : 'failed',
        sign_invitation_error: sms.ok
          ? null
          : sms.error || '簡訊發送失敗',
        updated_at: now,
      })
      .eq('id', contract.id)

    await recordReview(
      reusableContract
        ? 'CONTRACT_REISSUED'
        : application.waiting_list_id
          ? 'WAITLIST_CONVERTED'
          : isRenewal
            ? 'RENEWAL_APPROVED'
            : 'APPROVED',
      'contract_sent',
      reviewNote,
      {
        customer_code: customerCode,
        contract_id: contract.id,
        contract_no: contract.contract_no,
        waiting_list_id: application.waiting_list_id || null,
        capacity: capacityReservation,
      }
    )

    await admin.from('online_audit_logs').insert({
      actor_user_id: actorUserId,
      parking_lot_id: application.parking_lot_id,
      application_id: application.id,
      contract_id: contract.id,
      action: reusableContract
        ? 'CONTRACT_REISSUED_AFTER_REVIEW'
        : application.waiting_list_id
          ? 'WAITLIST_CONVERTED_CONTRACT_CREATED'
          : isRenewal
            ? 'RENEWAL_APPLICATION_APPROVED_CONTRACT_CREATED'
            : 'APPLICATION_APPROVED_CONTRACT_CREATED',
      detail: {
        customer_code: customerCode,
        contract_no: contract.contract_no,
        contract_version: CONTRACT_VERSION,
        document_hash: documentHash,
        expires_at: expiresAt,
        waiting_list_id: application.waiting_list_id || null,
        application_kind: isRenewal ? 'renewal' : 'new',
        existing_monthly_rental_id: renewalRental?.id || null,
        sms_status: sms.ok ? 'sent' : 'failed',
        sms_provider: sms.provider,
        sms_error: sms.error || null,
        capacity: capacityReservation,
      },
    })

    return NextResponse.json({
      ok: true,
      customer_code: customerCode,
      contract_id: contract.id,
      contract_no: contract.contract_no,
      contract_version: CONTRACT_VERSION,
      sign_url: signUrl,
      expires_at: expiresAt,
      sms_status: sms.ok ? 'sent' : 'failed',
      sms_provider: sms.provider,
      sms_error: sms.error || null,
      dev_mode: process.env.OTP_DEV_MODE === 'true',
      converted_from_waiting: Boolean(application.waiting_list_id),
      reissued_contract: Boolean(reusableContract),
      renewal_application: isRenewal,
      existing_monthly_rental_id: renewalRental?.id || null,
      capacity: capacityReservation,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '系統錯誤。' },
      { status: 500 }
    )
  }
}
