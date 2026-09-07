import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PaymentRow = {
  rentalId: string
  parkingLotId?: string | null
  customerCode?: string | null
  customerName?: string | null
  phone?: string | null
  vehiclePlate?: string | null
  paymentDate?: string | null
  amountPaid?: number | null
  paymentMethod?: string | null
  invoiceNumber?: string | null
  rentalStartDate?: string | null
  rentalEndDate?: string | null
  sourceReference?: string | null
  notes?: string | null
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整。')
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

function validDate(value: unknown) {
  const text = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function safeText(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '登入狀態已失效，請重新登入。' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const rows: PaymentRow[] = Array.isArray(body?.rows) ? body.rows : []
    if (!rows.length || rows.length > 1000) {
      return NextResponse.json({ error: '沒有可更新的繳費資料。' }, { status: 400 })
    }

    const ids = [...new Set(rows.map((r) => safeText(r.rentalId, 80)).filter(Boolean))]

    // 先以登入者本身的 RLS 權限確認可讀取的月租資料，避免 service role 越權。
    const { data: allowedRows, error: accessError } = await supabase
      .from('monthly_rentals')
      .select('id,parking_lot_id,customer_code,customer_name,phone,vehicle_plate,start_date,end_date,monthly_fee')
      .in('id', ids)

    if (accessError) {
      console.error('[monthly-payment-sync] access check failed', accessError.message)
      return NextResponse.json({ error: '無法確認月租資料存取權限。' }, { status: 403 })
    }

    const allowed = new Map((allowedRows || []).map((r: any) => [String(r.id), r]))
    const admin = serviceClient()

    let success = 0
    let failed = 0
    let historySuccess = 0
    let historyDuplicate = 0
    let historyFailed = 0
    const errors: string[] = []

    for (const input of rows) {
      const rentalId = safeText(input.rentalId, 80)
      const rental: any = allowed.get(rentalId)
      if (!rental) {
        failed++
        errors.push(`${safeText(input.vehiclePlate, 30) || rentalId}：無存取權限或找不到月租資料`)
        continue
      }

      const paymentDate = validDate(input.paymentDate) || new Date().toISOString().slice(0, 10)
      const invoiceNumber = safeText(input.invoiceNumber, 100) || null

      const { data: updated, error: updateError } = await admin
        .from('monthly_rentals')
        .update({
          payment_status: 'paid',
          payment_date: paymentDate,
          invoice_number: invoiceNumber,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rentalId)
        .select('id')
        .maybeSingle()

      if (updateError || !updated?.id) {
        failed++
        console.error('[monthly-payment-sync] update failed', rentalId, updateError?.message)
        errors.push(`${safeText(input.vehiclePlate, 30) || rental.vehicle_plate || rentalId}：付款狀態更新失敗`)
        continue
      }

      success++

      // 有來源識別時才寫 monthly_payments，避免重複匯入同一筆交易。
      const sourceReference = safeText(input.sourceReference, 300)
      if (sourceReference) {
        const { data: existing } = await admin
          .from('monthly_payments')
          .select('id')
          .eq('source_reference', sourceReference)
          .limit(1)
          .maybeSingle()

        if (existing?.id) {
          historyDuplicate++
          continue
        }

        const { error: historyError } = await admin
          .from('monthly_payments')
          .insert({
            parking_lot_id: input.parkingLotId || rental.parking_lot_id || null,
            monthly_rental_id: rentalId,
            customer_code: input.customerCode || rental.customer_code || null,
            customer_name: input.customerName || rental.customer_name || null,
            phone: input.phone || rental.phone || null,
            vehicle_plate: input.vehiclePlate || rental.vehicle_plate || null,
            payment_date: paymentDate,
            amount: Number(input.amountPaid || 0),
            payment_method: safeText(input.paymentMethod, 100) || null,
            invoice_number: invoiceNumber,
            rental_start_date: input.rentalStartDate || rental.start_date || null,
            rental_end_date: input.rentalEndDate || rental.end_date || null,
            source: 'payment_csv',
            source_reference: sourceReference,
            notes: safeText(input.notes, 1000) || null,
            created_by: user.id,
          })

        if (historyError) {
          historyFailed++
          console.error('[monthly-payment-sync] history insert failed', rentalId, historyError.message)
        } else {
          historySuccess++
        }
      }
    }

    return NextResponse.json({
      ok: failed === 0,
      success,
      failed,
      historySuccess,
      historyDuplicate,
      historyFailed,
      errors: errors.slice(0, 10),
    })
  } catch (error: any) {
    console.error('[monthly-payment-sync] unexpected error', error)
    return NextResponse.json(
      { error: '繳費更新失敗，請稍後再試。' },
      { status: 500 }
    )
  }
}
