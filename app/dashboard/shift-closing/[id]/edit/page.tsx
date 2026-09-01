import {
  notFound,
  redirect,
} from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ShiftClosingForm from '@/components/ShiftClosingForm'

export default async function EditShiftClosingPage({
  params,
}: {
  params: Promise<{
    id: string
  }>
}) {
  const { id } =
    await params

  const supabase =
    await createClient()

  const {
    data: { user },
  } =
    await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const {
    data: profile,
  } =
    await supabase
      .from('profiles')
      .select(
        'id, is_active'
      )
      .eq('id', user.id)
      .maybeSingle()

  if (
    !profile ||
    !profile.is_active
  ) {
    redirect('/login')
  }

  const {
    data: parkingLots,
  } =
    await supabase
      .from(
        'parking_lots'
      )
      .select(
        'id, name'
      )
      .eq(
        'status',
        'active'
      )
      .order('name')

  const {
    data: report,
    error,
  } =
    await supabase
      .from(
        'shift_closing_reports'
      )
      .select(`
        id,
        parking_lot_id,
        closing_date,
        shift_start_at,
        shift_end_at,
        closing_status,
        invoice_start_no,
        invoice_end_no,
        amount_due,
        amount_paid,
        aps_monthly_count,
        aps_monthly_amount,
        electronic_payment_total,
        mobile_payment_total,
        operator_name,
        notes,
        remittance_status,
        remitted_at
      `)
      .eq('id', id)
      .maybeSingle()

  if (
    error ||
    !report
  ) {
    notFound()
  }

  const {
    data: details,
  } =
    await supabase
      .from(
        'shift_closing_details'
      )
      .select(`
        detail_start_date,
        detail_end_date,
        temporary_cash,
        monthly_cash,
        sort_order
      `)
      .eq(
        'report_id',
        id
      )
      .order('sort_order')

  const normalizedReport =
    {
      ...report,
      amount_due:
        Number(
          report.amount_due ||
            0
        ),
      amount_paid:
        Number(
          report.amount_paid ||
            0
        ),
      aps_monthly_count:
        Number(
          report.aps_monthly_count ||
            0
        ),
      aps_monthly_amount:
        Number(
          report.aps_monthly_amount ||
            0
        ),
      electronic_payment_total:
        Number(
          report.electronic_payment_total ||
            0
        ),
      mobile_payment_total:
        Number(
          report.mobile_payment_total ||
            0
        ),
    }

  const normalizedDetails =
    (
      details ||
      []
    ).map(
      (item: any) => ({
        detail_start_date:
          item.detail_start_date,
        detail_end_date:
          item.detail_end_date,
        temporary_cash:
          Number(
            item.temporary_cash ||
              0
          ),
        monthly_cash:
          Number(
            item.monthly_cash ||
              0
          ),
      })
    )

  const options =
    (
      parkingLots ||
      []
    ).map(
      (item: any) => ({
        id: item.id,
        name: item.name,
      })
    )

  return (
    <div>
      <h1
        style={{
          marginBottom: 6,
        }}
      >
        編輯當日結班
      </h1>

      <p
        className="muted"
        style={{
          marginTop: 0,
        }}
      >
        {report.remittance_status ===
        'remitted'
          ? '這一輪已完成匯款，資料保留為歷史紀錄。'
          : '修改已儲存的結班資料。'}
      </p>

      <div
        style={{
          marginTop: 20,
        }}
      >
        <ShiftClosingForm
          parkingLots={
            options
          }
          initialReport={
            normalizedReport as any
          }
          initialDetails={
            normalizedDetails
          }
        />
      </div>
    </div>
  )
}
