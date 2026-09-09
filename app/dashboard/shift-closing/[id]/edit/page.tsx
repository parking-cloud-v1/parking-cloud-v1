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

  if (
    report.remittance_status !==
    'remitted'
  ) {
    const { data: otherPending } =
      await supabase
        .from('shift_closing_reports')
        .select('id, remittance_total')
        .eq(
          'parking_lot_id',
          report.parking_lot_id
        )
        .neq('id', report.id)
        .or(
          'remittance_status.eq.accumulating,remittance_status.is.null'
        )

    priorAccumulatedAmount = (
      otherPending || []
    ).reduce(
      (total: number, item: any) =>
        total +
        num(item.remittance_total),
      0
    )

    priorAccumulatedCount =
      (otherPending || []).length
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
              ? '查看已匯款結班報表'
              : '修改當日結班報表'}
          </h1>

          <p
            className="muted"
            style={{
              marginTop: 0,
            }}
          >
            {report.remittance_status ===
            'remitted'
              ? '此筆已併入匯款批次，保留歷史資料供查詢。'
              : priorAccumulatedCount > 0
                ? `同場另有 ${priorAccumulatedCount} 班尚未匯款，前班累積 NT$ ${priorAccumulatedAmount.toLocaleString()}；本班會與它們一起結清。`
                : '已儲存的結班資料可再次修改；未匯款時會自動與下一班接續累積。'}
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
        />
      </div>
    </div>
  )
}
