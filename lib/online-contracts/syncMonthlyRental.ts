export type MonthlySyncResult = {
  ok: boolean
  status: 'synced' | 'conflict' | 'error'
  monthlyRentalId?: string
  message?: string
}

function normalizePlate(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

function plateKey(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function normalizeCustomerCode(value: string | null | undefined) {
  return String(value || '').trim().toUpperCase()
}

function minDate(a: string | null | undefined, b: string) {
  if (!a) return b
  return a <= b ? a : b
}

function maxDate(a: string | null | undefined, b: string) {
  if (!a) return b
  return a >= b ? a : b
}

async function writeAudit(
  admin: any,
  contract: any,
  action: string,
  detail: Record<string, any>
) {
  try {
    await admin.from('online_audit_logs').insert({
      actor_user_id: null,
      parking_lot_id: contract.parking_lot_id,
      application_id: contract.application_id,
      contract_id: contract.id,
      action,
      detail,
    })
  } catch {
    // 稽核失敗不應反向造成契約簽署失敗；主流程仍保留 sync 狀態。
  }
}

async function markSyncFailure(
  admin: any,
  contract: any,
  status: 'conflict' | 'error',
  message: string,
  auditAction: string,
  detail: Record<string, any> = {}
): Promise<MonthlySyncResult> {
  const now = new Date().toISOString()

  await admin
    .from('contracts')
    .update({
      monthly_sync_status: status,
      monthly_sync_error: message,
      updated_at: now,
    })
    .eq('id', contract.id)

  await writeAudit(admin, contract, auditAction, {
    message,
    ...detail,
  })

  return {
    ok: false,
    status,
    message,
  }
}

async function markSynced(
  admin: any,
  contract: any,
  monthlyRentalId: string,
  auditAction: string,
  auditDetail: Record<string, any>
): Promise<MonthlySyncResult> {
  const now = new Date().toISOString()

  await admin
    .from('contracts')
    .update({
      monthly_rental_id: monthlyRentalId,
      monthly_sync_status: 'synced',
      monthly_sync_error: null,
      monthly_synced_at: now,
      updated_at: now,
    })
    .eq('id', contract.id)

  await writeAudit(admin, contract, auditAction, auditDetail)

  return {
    ok: true,
    status: 'synced',
    monthlyRentalId,
  }
}

export async function syncSignedContractToMonthlyRental(
  admin: any,
  contractId: string
): Promise<MonthlySyncResult> {
  try {
    const { data: contract, error: contractError } = await admin
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .maybeSingle()

    if (contractError || !contract) {
      return {
        ok: false,
        status: 'error',
        message: contractError?.message || '找不到契約資料。',
      }
    }

    if (contract.status !== 'signed') {
      return {
        ok: false,
        status: 'error',
        message: '只有已簽署契約才能同步月租。',
      }
    }

    // 已成功同步過：API 重複呼叫時直接回傳，不重複新增或續租。
    if (
      contract.monthly_sync_status === 'synced' &&
      contract.monthly_rental_id
    ) {
      return {
        ok: true,
        status: 'synced',
        monthlyRentalId: contract.monthly_rental_id,
      }
    }

    // 新增型契約可以用 online_contract_id 反查，避免同時請求重複新增。
    const { data: linkedRental } = await admin
      .from('monthly_rentals')
      .select('id')
      .eq('online_contract_id', contract.id)
      .maybeSingle()

    if (linkedRental?.id) {
      return markSynced(
        admin,
        contract,
        linkedRental.id,
        'MONTHLY_RENTAL_SYNC_RECOVERED',
        {
          monthly_rental_id: linkedRental.id,
          source: 'online_contract_id',
        }
      )
    }

    const plate = normalizePlate(contract.vehicle_plate)
    const currentPlateKey = plateKey(contract.vehicle_plate)
    const customerCode = normalizeCustomerCode(contract.customer_code)

    if (
      !plate ||
      !currentPlateKey ||
      !customerCode ||
      !contract.start_date ||
      !contract.end_date
    ) {
      const missing: string[] = []
      if (!customerCode) missing.push('客戶編號')
      if (!currentPlateKey) missing.push('車牌')
      if (!contract.start_date || !contract.end_date) missing.push('租期')

      return markSyncFailure(
        admin,
        contract,
        'error',
        `契約缺少${missing.join('、')}，無法建立月租資料。`,
        'MONTHLY_RENTAL_SYNC_ERROR'
      )
    }

    /*
     * 第八階段：先依原系統的 customer_code 找目前未退租資料。
     *
     * 若「同停車場 + 同 customer_code + 同車牌」已存在，代表這不是
     * 新增第二位月租戶，而是既有月租戶的線上續約／重新簽約。
     * 此時沿用原 monthly_rentals 那一筆，按照既有續租邏輯延長到期日，
     * 不新增重複資料。
     *
     * 若 customer_code 已被不同車牌使用，則判定為衝突，禁止覆蓋。
     */
    const { data: sameCodeRows, error: sameCodeError } = await admin
      .from('monthly_rentals')
      .select(
        'id,customer_code,customer_name,phone,vehicle_plate,vehicle_type,rental_type,start_date,end_date,monthly_fee,payment_status,payment_date,invoice_number,rental_status,notes'
      )
      .eq('parking_lot_id', contract.parking_lot_id)
      .eq('customer_code', customerCode)
      .neq('rental_status', 'cancelled')
      .limit(20)

    if (sameCodeError) {
      return markSyncFailure(
        admin,
        contract,
        'error',
        `客戶編號檢查失敗：${sameCodeError.message}`,
        'MONTHLY_RENTAL_SYNC_ERROR'
      )
    }

    if (sameCodeRows && sameCodeRows.length > 0) {
      const sameCustomerRental = sameCodeRows.find(
        (row: any) => plateKey(row.vehicle_plate) === currentPlateKey
      )

      if (!sameCustomerRental) {
        const first = sameCodeRows[0]
        const message =
          `客戶編號 ${customerCode} 已被其他車牌使用：` +
          `${first.customer_name || '-'} / ${first.vehicle_plate || '-'}`

        return markSyncFailure(
          admin,
          contract,
          'conflict',
          message,
          'MONTHLY_RENTAL_SYNC_CONFLICT',
          {
            conflict_type: 'customer_code_different_vehicle',
            duplicate_monthly_rental_id: first.id,
          }
        )
      }

      const now = new Date().toISOString()
      const isExtension =
        !sameCustomerRental.end_date ||
        String(contract.end_date) > String(sameCustomerRental.end_date)

      const oldNotes = String(sameCustomerRental.notes || '').trim()
      const renewalNote = `線上契約 ${contract.contract_no} 完成${
        isExtension ? '續租' : '重新簽署'
      }`
      const notes = oldNotes
        ? `${oldNotes}｜${renewalNote}`
        : renewalNote

      const updatePayload: Record<string, any> = {
        customer_name: String(contract.customer_name || '').trim(),
        phone: String(contract.phone || '').trim() || null,
        vehicle_plate: plate,
        vehicle_type: contract.vehicle_type || sameCustomerRental.vehicle_type || 'car',
        rental_type: contract.rental_type || sameCustomerRental.rental_type || null,
        start_date: minDate(sameCustomerRental.start_date, contract.start_date),
        end_date: maxDate(sameCustomerRental.end_date, contract.end_date),
        monthly_fee: Number(contract.monthly_fee || 0),
        rental_status: 'active',
        notes,
        online_contract_id: contract.id,
        rental_term_locked: true,
        updated_at: now,
      }

      /*
       * 第 23 階段：正式租期與繳費月份已分離。
       * 線上續租只延長正式租期，不再清空 payment_status / payment_date / invoice_number，
       * 也不刪除 monthly_rental_payment_months。新一期實際繳費時再另外記錄月份。
       */

      const { error: renewError } = await admin
        .from('monthly_rentals')
        .update(updatePayload)
        .eq('id', sameCustomerRental.id)

      if (renewError) {
        return markSyncFailure(
          admin,
          contract,
          'error',
          `既有月租續約同步失敗：${renewError.message}`,
          'MONTHLY_RENTAL_SYNC_ERROR',
          {
            monthly_rental_id: sameCustomerRental.id,
            sync_type: isExtension ? 'renew' : 'resign',
          }
        )
      }

      return markSynced(
        admin,
        contract,
        sameCustomerRental.id,
        isExtension
          ? 'MONTHLY_RENTAL_RENEWED_FROM_CONTRACT'
          : 'MONTHLY_RENTAL_RESIGNED_FROM_CONTRACT',
        {
          customer_code: customerCode,
          monthly_rental_id: sameCustomerRental.id,
          contract_no: contract.contract_no,
          previous_end_date: sameCustomerRental.end_date,
          new_end_date: maxDate(sameCustomerRental.end_date, contract.end_date),
          payment_status: sameCustomerRental.payment_status,
          payment_months_preserved: true,
          source: 'online_contract',
        }
      )
    }

    /*
     * 沒有同 customer_code 的有效資料時，再檢查同場站、同車牌、租期重疊。
     * 車牌比對會忽略「-、空白」等格式差異，例如 ABC-1234 與 ABC1234
     * 視為同一車牌。
     */
    const { data: overlappingRows, error: overlappingError } = await admin
      .from('monthly_rentals')
      .select(
        'id,customer_code,customer_name,vehicle_plate,start_date,end_date,rental_status'
      )
      .eq('parking_lot_id', contract.parking_lot_id)
      .neq('rental_status', 'cancelled')
      .lte('start_date', contract.end_date)
      .gte('end_date', contract.start_date)
      .limit(1000)

    if (overlappingError) {
      return markSyncFailure(
        admin,
        contract,
        'error',
        `重複月租檢查失敗：${overlappingError.message}`,
        'MONTHLY_RENTAL_SYNC_ERROR'
      )
    }

    const duplicatePlateRow = (overlappingRows || []).find(
      (row: any) => plateKey(row.vehicle_plate) === currentPlateKey
    )

    if (duplicatePlateRow) {
      const message =
        `同一停車場已有相同車牌且租期重疊的月租資料：` +
        `${duplicatePlateRow.customer_name || '-'} / ` +
        `${duplicatePlateRow.vehicle_plate || plate} / ` +
        `${duplicatePlateRow.start_date || '-'}～${duplicatePlateRow.end_date || '-'}`

      return markSyncFailure(
        admin,
        contract,
        'conflict',
        message,
        'MONTHLY_RENTAL_SYNC_CONFLICT',
        {
          conflict_type: 'vehicle_plate',
          duplicate_monthly_rental_id: duplicatePlateRow.id,
        }
      )
    }

    // 若合約租期剛好對應主管設定的抽籤／年度期別，就把期別一起綁定。
    const { data: matchedRentalTerm } = await admin
      .from('parking_lot_rental_terms')
      .select('id')
      .eq('parking_lot_id', contract.parking_lot_id)
      .eq('start_date', contract.start_date)
      .eq('end_date', contract.end_date)
      .limit(1)
      .maybeSingle()

    // 用原申請的審核人當作月租 created_by；公開簽署者不是系統帳號。
    let createdBy: string | null = null

    if (contract.application_id) {
      const { data: application } = await admin
        .from('rental_applications')
        .select('reviewed_by')
        .eq('id', contract.application_id)
        .maybeSingle()

      createdBy = application?.reviewed_by || null
    }

    const notes = [
      '線上簽約自動建立',
      `客戶編號：${customerCode}`,
      `契約編號：${contract.contract_no}`,
    ].join('｜')

    const now = new Date().toISOString()

    const { data: createdRental, error: insertError } = await admin
      .from('monthly_rentals')
      .insert({
        parking_lot_id: contract.parking_lot_id,

        // 第八階段：使用該停車場原月租系統配置／沿用的 customer_code。
        customer_code: customerCode,

        customer_name: String(contract.customer_name || '').trim(),
        phone: String(contract.phone || '').trim() || null,
        vehicle_plate: plate,
        vehicle_type: contract.vehicle_type || 'car',
        rental_type: contract.rental_type || null,
        start_date: contract.start_date,
        end_date: contract.end_date,
        rental_term_id: matchedRentalTerm?.id || null,
        rental_term_locked: true,
        data_source: 'online_contract',
        monthly_fee: Number(contract.monthly_fee || 0),

        // 簽署完成 ≠ 已付款。付款仍交由既有月租/CSV 流程處理。
        payment_status: 'unpaid',
        rental_status: 'active',
        payment_date: null,
        invoice_number: null,
        notes,
        created_by: createdBy,
        online_contract_id: contract.id,
        updated_at: now,
      })
      .select('id')
      .single()

    if (insertError || !createdRental) {
      // unique online_contract_id 被其他同時請求先建立時，再回查一次即可。
      const { data: raceRental } = await admin
        .from('monthly_rentals')
        .select('id')
        .eq('online_contract_id', contract.id)
        .maybeSingle()

      if (raceRental?.id) {
        return markSynced(
          admin,
          contract,
          raceRental.id,
          'MONTHLY_RENTAL_SYNC_RECOVERED',
          {
            monthly_rental_id: raceRental.id,
            source: 'race_recovery',
          }
        )
      }

      return markSyncFailure(
        admin,
        contract,
        'error',
        `月租建立失敗：${insertError?.message || '未知錯誤'}`,
        'MONTHLY_RENTAL_SYNC_ERROR'
      )
    }

    return markSynced(
      admin,
      contract,
      createdRental.id,
      'MONTHLY_RENTAL_SYNCED',
      {
        customer_code: customerCode,
        monthly_rental_id: createdRental.id,
        payment_status: 'unpaid',
        source: 'online_contract',
      }
    )
  } catch (error: any) {
    return {
      ok: false,
      status: 'error',
      message: error?.message || '月租同步發生未知錯誤。',
    }
  }
}
