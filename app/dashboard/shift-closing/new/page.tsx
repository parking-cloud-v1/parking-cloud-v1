import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'

import ShiftClosingForm from '@/components/ShiftClosingForm'

function num(value: unknown) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

export default async function NewShiftClosingPage({
  searchParams,
}: {
  searchParams?: Promise<{
    reset?: string
  }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const params = searchParams
    ? await searchParams
    : {}

  const workLotId =
    await getCurrentWorkParkingLotId()

  if (!workLotId) {
    redirect('/dashboard/shift-closing')
  }

  const [
    { data: parkingLots },
    { data: pendingReports },
  ] = await Promise.all([
    supabase
      .from('parking_lots')
      .select('id, name')
      .eq('id', workLotId)
      .eq('status', 'active'),
    supabase
      .from('shift_closing_reports')
      .select('id, remittance_total')
      .eq('parking_lot_id', workLotId)
      .or(
        'remittance_status.eq.accumulating,remittance_status.is.null'
      ),
  ])

  const options = (
    parkingLots || []
  ).map((item: any) => ({
    id: item.id,
    name: item.name,
  }))

  const priorAccumulatedAmount = (
    pendingReports || []
  ).reduce(
    (total: number, item: any) =>
      total +
      num(item.remittance_total),
    0
  )

  const priorAccumulatedCount =
    (pendingReports || []).length

  return (
    <div>
      <h1>新增當日結班</h1>

      <p className="muted">
        {params.reset === '1'
          ? '上一批未匯款已全部結清，現在開始新的結班／匯款週期。'
          : priorAccumulatedCount > 0
            ? `目前已有 ${priorAccumulatedCount} 班尚未匯款，累積 NT$ ${priorAccumulatedAmount.toLocaleString()}；本班儲存後會自動接續累積。`
            : '填寫目前工作停車場的結班資料；若未匯款，下一班會自動接續累積。'}
      </p>

      <ShiftClosingForm
        parkingLots={options}
        defaultParkingLotId={workLotId}
        priorAccumulatedAmount={
          priorAccumulatedAmount
        }
        priorAccumulatedCount={
          priorAccumulatedCount
        }
      />
    </div>
  )
}
