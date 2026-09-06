import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendSms } from '@/lib/sms/sendSms'

const DAY = 24 * 60 * 60 * 1000

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\s+/g, '').trim()
}

function taipeiToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function dateAtUtc(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function daysBetween(from: string, to: string) {
  return Math.round((dateAtUtc(to) - dateAtUtc(from)) / DAY)
}

function intValue(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function statusFromSms(result: { ok: boolean; provider: string }) {
  if (result.ok && result.provider === 'development') return 'development'
  return result.ok ? 'sent' : 'failed'
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

    const body = await request.json()
    const parkingLotId = String(body?.parking_lot_id || '').trim()
    const requestedIds = Array.from(
      new Set(
        (Array.isArray(body?.monthly_rental_ids) ? body.monthly_rental_ids : [])
          .map((value: unknown) => String(value || '').trim())
          .filter(Boolean)
      )
    )

    if (!parkingLotId || !requestedIds.length) {
      return NextResponse.json(
        { error: '請選擇要發送續租提醒的月租戶。' },
        { status: 400 }
      )
    }

    // 使用登入者自己的 session + RLS 驗證場站權限。
    const { data: lot, error: lotError } = await supabase
      .from('parking_lots')
      .select('id,name')
      .eq('id', parkingLotId)
      .maybeSingle()

    if (lotError || !lot) {
      return NextResponse.json(
        { error: '找不到停車場或沒有此場站權限。' },
        { status: 403 }
      )
    }

    // lot 已在上方完成不存在判斷。先把後續會在內部 async function
    // 使用的場站名稱固定成不可為 null 的字串，避免 TypeScript 在 closure
    // 中重新將 lot 視為可能 null。
    const parkingLotName = String(lot.name || '').trim() || '停車場'

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

    const [
      { data: applicationSetting },
      { data: reminderSetting },
      { data: activeTerm, error: termError },
    ] = await Promise.all([
      admin
        .from('online_application_settings')
        .select('renewal_enabled')
        .eq('parking_lot_id', parkingLotId)
        .maybeSingle(),
      admin
        .from('online_reminder_settings')
        .select(`
          enabled,renewal_reminder_days,renewal_repeat_days,
          renewal_expired_grace_days,renewal_batch_limit
        `)
        .eq('parking_lot_id', parkingLotId)
        .maybeSingle(),
      admin
        .from('parking_lot_rental_terms')
        .select('id,term_name,start_date,end_date,is_active')
        .eq('parking_lot_id', parkingLotId)
        .eq('is_active', true)
        .maybeSingle(),
    ])

    if (termError) {
      return NextResponse.json(
        { error: `正式租期讀取失敗：${termError.message}` },
        { status: 500 }
      )
    }

    if (!activeTerm?.end_date) {
      return NextResponse.json(
        { error: '此停車場尚未設定目前正式租期，無法發送續租提醒。' },
        { status: 409 }
      )
    }

    if (!applicationSetting?.renewal_enabled) {
      return NextResponse.json(
        { error: '此停車場目前未開放線上續租，請先到申請開放設定啟用。' },
        { status: 409 }
      )
    }

    if (reminderSetting?.enabled === false) {
      return NextResponse.json(
        { error: '此停車場目前已關閉線上提醒。' },
        { status: 409 }
      )
    }

    const reminderDays = intValue(
      reminderSetting?.renewal_reminder_days,
      20,
      1,
      180
    )
    const repeatDays = intValue(
      reminderSetting?.renewal_repeat_days,
      7,
      1,
      90
    )
    const graceDays = intValue(
      reminderSetting?.renewal_expired_grace_days,
      30,
      0,
      180
    )
    const batchLimit = intValue(
      reminderSetting?.renewal_batch_limit,
      100,
      1,
      500
    )

    if (requestedIds.length > batchLimit) {
      return NextResponse.json(
        { error: `單次最多可發送 ${batchLimit} 筆。` },
        { status: 400 }
      )
    }

    const { data: rentals, error: rentalError } = await admin
      .from('monthly_rentals')
      .select(`
        id,parking_lot_id,customer_code,customer_name,phone,vehicle_plate,
        vehicle_type,rental_type,rental_status
      `)
      .eq('parking_lot_id', parkingLotId)
      .in('id', requestedIds)
      .neq('rental_status', 'cancelled')

    if (rentalError) {
      return NextResponse.json({ error: rentalError.message }, { status: 500 })
    }

    const rentalIds = (rentals || []).map((row: any) => row.id)
    const foundRentalIds = new Set(rentalIds)
    const missingRequestedIds = requestedIds.filter((id) => !foundRentalIds.has(id))

    const [{ data: activeApplications }, { data: recentLogs }] =
      await Promise.all([
        rentalIds.length
          ? admin
              .from('rental_applications')
              .select('existing_monthly_rental_id,status')
              .eq('application_kind', 'renewal')
              .in('existing_monthly_rental_id', rentalIds)
              .in('status', [
                'pending',
                'needs_revision',
                'waiting',
                'approved',
                'contract_sent',
              ])
          : Promise.resolve({ data: [] as any[] } as any),
        rentalIds.length
          ? admin
              .from('online_reminder_logs')
              .select('monthly_rental_id,delivery_status,created_at')
              .eq('parking_lot_id', parkingLotId)
              .eq('reminder_type', 'renewal_invitation')
              .in('monthly_rental_id', rentalIds)
              .in('delivery_status', ['sent', 'development'])
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as any[] } as any),
      ])

    const activeSet = new Set(
      (activeApplications || [])
        .map((row: any) => row.existing_monthly_rental_id)
        .filter(Boolean)
    )

    const lastSentByRental = new Map<string, string>()
    for (const log of recentLogs || []) {
      if (
        log.monthly_rental_id &&
        !lastSentByRental.has(log.monthly_rental_id)
      ) {
        lastSentByRental.set(log.monthly_rental_id, log.created_at)
      }
    }

    // activeTerm 已在上方確認存在，但下方 processRental 是內部 async function。
    // TypeScript 可能在 closure 中失去 null narrowing，因此先固定成 primitive 值。
    const activeTermId = String(activeTerm.id || '').trim()
    const activeTermName = String(activeTerm.term_name || '').trim()
    const today = taipeiToday()
    const formalTermStart = String(activeTerm.start_date || '').trim()
    const formalTermEnd = String(activeTerm.end_date || '').trim()
    const formalTermDays = daysBetween(today, formalTermEnd)

    if (
      formalTermDays > reminderDays ||
      formalTermDays < -graceDays
    ) {
      return NextResponse.json(
        {
          error:
            formalTermDays > reminderDays
              ? `目前正式租期尚未進入續租提醒範圍，距到期還有 ${formalTermDays} 天。`
              : `目前正式租期已超過到期後 ${graceDays} 天的提醒範圍。`,
        },
        { status: 409 }
      )
    }

    const results: any[] = missingRequestedIds.map((id) => ({
      id,
      ok: false,
      skipped: true,
      reason: '找不到月租資料、已退租或不屬於目前停車場',
    }))

    async function processRental(rental: any) {
      const phone = normalizePhone(rental.phone)
      const endDate = formalTermEnd
      const remainingDays = formalTermDays

      if (!/^09\d{8}$/.test(phone)) {
        return {
          id: rental.id,
          ok: false,
          skipped: true,
          reason: '沒有可用的手機號碼',
        }
      }

      if (activeSet.has(rental.id)) {
        return {
          id: rental.id,
          ok: false,
          skipped: true,
          reason: '已有續租案件處理中',
        }
      }

      const lastSentAt = lastSentByRental.get(rental.id)
      if (
        lastSentAt &&
        Date.now() - new Date(lastSentAt).getTime() < repeatDays * DAY
      ) {
        return {
          id: rental.id,
          ok: false,
          skipped: true,
          reason: `距離上次成功提醒未滿 ${repeatDays} 天`,
        }
      }

      // 先建立同日唯一 pending log，再送簡訊；可阻擋兩個工作人員同時批次點擊造成重複發送。
      const reminderKey = `${rental.id}:renewal:${today}`
      const { data: pendingLog, error: pendingError } = await admin
        .from('online_reminder_logs')
        .insert({
          parking_lot_id: parkingLotId,
          monthly_rental_id: rental.id,
          reminder_type: 'renewal_invitation',
          channel: 'sms',
          delivery_status: 'pending',
          actor_user_id: actorUserId,
          reminder_key: reminderKey,
          metadata: {
            rental_term_id: activeTermId,
            rental_term_name: activeTermName || null,
            start_date: formalTermStart || null,
            end_date: endDate,
            customer_code: rental.customer_code || null,
            remaining_days: remainingDays,
          },
        })
        .select('id')
        .single()

      if (pendingError || !pendingLog) {
        const duplicate = String(pendingError?.message || '')
          .toLowerCase()
          .includes('unique')
        return {
          id: rental.id,
          ok: false,
          skipped: true,
          reason: duplicate ? '今天已經發送或正在發送' : pendingError?.message,
        }
      }

      const renewUrl = `${siteUrl()}/renew?parking_lot_id=${encodeURIComponent(
        parkingLotId
      )}`
      const dueText =
        remainingDays < 0
          ? `已於 ${endDate} 到期`
          : remainingDays === 0
            ? `將於今天（${endDate}）到期`
            : `將於 ${endDate} 到期`

      const message =
        `智驛科技月租續租提醒：${parkingLotName}，您的月租${dueText}。` +
        `如需續租，請使用原客戶編號、車牌與登記手機完成驗證：${renewUrl}。` +
        `如已辦理可忽略本訊息。`

      const sms = await sendSms(phone, message)
      const deliveryStatus = statusFromSms(sms)

      await admin
        .from('online_reminder_logs')
        .update({
          delivery_status: deliveryStatus,
          provider: sms.provider,
          error: sms.error || null,
          reminder_key: sms.ok ? reminderKey : null,
          metadata: {
            rental_term_id: activeTermId,
            rental_term_name: activeTermName || null,
            start_date: formalTermStart || null,
            end_date: endDate,
            customer_code: rental.customer_code || null,
            remaining_days: remainingDays,
            attempts: sms.attempts || 1,
            status_code: sms.statusCode || null,
          },
        })
        .eq('id', pendingLog.id)

      return {
        id: rental.id,
        ok: sms.ok,
        skipped: false,
        delivery_status: deliveryStatus,
        provider: sms.provider,
        error: sms.error || null,
      }
    }

    // 批次採小量並行，避免 100 筆逐筆等待造成 Server Route 逾時，
    // 同時不會一次把大量請求打向簡訊商。
    const concurrency = 5
    const rentalRows = rentals || []
    for (let index = 0; index < rentalRows.length; index += concurrency) {
      const chunk = rentalRows.slice(index, index + concurrency)
      const chunkResults = await Promise.all(chunk.map(processRental))
      results.push(...chunkResults)
    }

    const sentCount = results.filter(
      (row) => row.delivery_status === 'sent' || row.delivery_status === 'development'
    ).length
    const failedCount = results.filter(
      (row) => !row.skipped && row.delivery_status === 'failed'
    ).length
    const skippedCount = results.filter((row) => row.skipped).length

    await admin.from('online_audit_logs').insert({
      actor_user_id: actorUserId,
      parking_lot_id: parkingLotId,
      action: 'RENEWAL_INVITATION_BATCH_SENT',
      result: failedCount > 0 ? 'warning' : 'success',
      error_message:
        failedCount > 0 ? `${failedCount} 筆簡訊發送失敗` : null,
      detail: {
        requested_count: requestedIds.length,
        sent_count: sentCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
        monthly_rental_ids: requestedIds,
        rental_term_id: activeTermId,
        rental_term_name: activeTermName || null,
        rental_term_start: formalTermStart || null,
        rental_term_end: formalTermEnd,
      },
    })

    return NextResponse.json({
      ok: failedCount === 0,
      requested_count: requestedIds.length,
      sent_count: sentCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
      dev_mode: process.env.OTP_DEV_MODE === 'true',
      results,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '系統錯誤。' },
      { status: 500 }
    )
  }
}
