import { redirect } from 'next/navigation'
import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import ShiftClosingForm from '@/components/ShiftClosingForm'

function num(value: unknown) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

export default async function EditShiftClosingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [
    { data: report, error },
    { data: details },
    { data: parkingLots },
  ] = await Promise.all([
    supabase
      .from('shift_closing_reports')
      .select('*')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('shift_closing_details')
      .select('*')
      .eq('report_id', id)
      .order('sort_order'),
    supabase
      .from('parking_lots')
      .select('id,name')
      .eq('status', 'active')
      .order('name'),
  ])

  if (error || !report) {
    return (
      <div className="card">
        <h1>找不到結班報表</h1>
        <p>
          {error?.message ||
            '這筆資料不存在或您沒有權限。'}
        </p>
        <Link href="/dashboard/shift-closing">
          返回結班報表
        </Link>
      </div>
    )
  }

  let priorAccumulatedAmount = 0
  let priorAccumulatedCount = 0
  let accumulatedReports: any[] = []

  if (
    report.remittance_status ===
    'remitted'
  ) {
    if (report.remittance_batch_id) {
      const { data } = await supabase
        .from('shift_closing_reports')
        .select(`
          id,
          closing_date,
          shift_start_at,
          shift_end_at,
          closing_status,
          operator_name,
          amount_paid,
          remittance_total,
          remittance_status
        `)
        .eq(
          'parking_lot_id',
          report.parking_lot_id
        )
        .eq(
          'remittance_batch_id',
          report.remittance_batch_id
        )
        .order('shift_end_at', {
          ascending: true,
        })

      accumulatedReports = data || []
    } else {
      accumulatedReports = [report]
    }
  } else {
    const { data: pendingRows } =
      await supabase
        .from('shift_closing_reports')
        .select(`
          id,
          closing_date,
          shift_start_at,
          shift_end_at,
          closing_status,
          operator_name,
          amount_paid,
          remittance_total,
          remittance_status
        `)
        .eq(
          'parking_lot_id',
          report.parking_lot_id
        )
        .or(
          'remittance_status.eq.accumulating,remittance_status.is.null'
        )
        .order('shift_end_at', {
          ascending: true,
        })

    accumulatedReports =
      pendingRows || []

    const otherPending =
      accumulatedReports.filter(
        (item: any) =>
          item.id !== report.id
      )

    priorAccumulatedAmount =
      otherPending.reduce(
        (total: number, item: any) =>
          total +
          num(item.remittance_total),
        0
      )

    priorAccumulatedCount =
      otherPending.length
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <h1
            style={{
              marginBottom: 6,
            }}
          >
            {report.remittance_status ===
            'remitted'
              ? '查看已匯款留底'
              : '修改累積中結班報表'}
          </h1>

          <p
            className="muted"
            style={{
              marginTop: 0,
            }}
          >
            {report.remittance_status ===
            'remitted'
              ? `此筆為已完成匯款批次，這一批共 ${accumulatedReports.length || 1} 班；下方保留本批每次結班明細。`
              : priorAccumulatedCount > 0
                ? `目前同場共 ${priorAccumulatedCount + 1} 班累積中，待匯總額會連續累加；下方可查看每一班明細。`
                : '目前只有這一班累積中；後續結班會繼續加入同一輪待匯款。'}
          </p>
        </div>

        <Link
          href="/dashboard/shift-closing"
          style={{
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          返回列表
        </Link>
      </div>

      <div style={{ marginTop: 20 }}>
        <ShiftClosingForm
          parkingLots={(parkingLots || []).map(
            (x: any) => ({
              id: x.id,
              name: x.name,
            })
          )}
          initialReport={report as any}
          initialDetails={
            (details || []) as any
          }
          priorAccumulatedAmount={
            priorAccumulatedAmount
          }
          priorAccumulatedCount={
            priorAccumulatedCount
          }
          accumulatedReports={
            accumulatedReports as any
          }
        />
      </div>
    </div>
  )
}
