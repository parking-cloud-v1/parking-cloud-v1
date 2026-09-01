import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'

import ShiftClosingForm from '@/components/ShiftClosingForm'

export default async function NewShiftClosingPage({
  searchParams,
}: {
  searchParams?: Promise<{
    reset?: string
  }>
}) {
  const supabase =
    await createClient()

  const {
    data: {
      user,
    },
  } =
    await supabase
      .auth
      .getUser()

  if (
    !user
  ) {
    redirect(
      '/login'
    )
  }

  const params =
    searchParams
      ? await searchParams
      : {}

  const workLotId =
    await getCurrentWorkParkingLotId()

  if (
    !workLotId
  ) {
    redirect(
      '/dashboard/shift-closing'
    )
  }

  const {
    data:
      parkingLots,
  } =
    await supabase
      .from(
        'parking_lots'
      )
      .select(
        'id, name'
      )
      .eq(
        'id',
        workLotId
      )
      .eq(
        'status',
        'active'
      )

  const options =
    (
      parkingLots ||
      []
    ).map(
      (
        item: any
      ) => ({
        id:
          item.id,
        name:
          item.name,
      })
    )

  return (
    <div>
      <h1>
        新增當日結班
      </h1>

      <p
        className="muted"
      >
        {params.reset ===
        '1'
          ? '上一輪匯款已完成，現在開始新的結班／匯款週期。'
          : '填寫目前工作停車場的結班資料。'}
      </p>

      <ShiftClosingForm
        parkingLots={
          options
        }
        defaultParkingLotId={
          workLotId
        }
      />
    </div>
  )
}