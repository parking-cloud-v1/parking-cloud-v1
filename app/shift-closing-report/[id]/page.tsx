import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ShiftClosingCompanyReport from '@/components/ShiftClosingCompanyReport'

export const dynamic = 'force-dynamic'

export default async function ShiftClosingCompanyReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: report, error } = await supabase
    .from('shift_closing_reports')
    .select(`
      id,parking_lot_id,closing_date,shift_start_at,shift_end_at,closing_status,
      amount_due,amount_paid,aps_monthly_count,aps_monthly_amount,
      electronic_payment_total,mobile_payment_total,cash_actual,
      temporary_cash,monthly_cash,daily_cash_total,remittance_total,
      operator_name,notes
    `)
    .eq('id', id)
    .maybeSingle()

  if (error || !report) notFound()

  const [{ data: lot }, { data: machines }, { data: details }] = await Promise.all([
    supabase.from('parking_lots').select('id,name').eq('id', report.parking_lot_id).maybeSingle(),
    supabase.from('shift_closing_machines').select(`
      machine_no,machine_name,invoice_start_no,invoice_end_no,amount_due,amount_paid,
      aps_monthly_count,aps_monthly_amount,electronic_payment_total,mobile_payment_total,cash_actual
    `).eq('report_id', id).order('machine_no'),
    supabase.from('shift_closing_details').select(`
      detail_start_date,detail_end_date,temporary_cash,monthly_cash,daily_cash_total,sort_order
    `).eq('report_id', id).order('sort_order'),
  ])

  return (
    <ShiftClosingCompanyReport
      companyName="智驛科技有限公司"
      parkingLotName={lot?.name || '停車場'}
      report={report as any}
      machines={(machines || []) as any}
      details={(details || []) as any}
    />
  )
}
