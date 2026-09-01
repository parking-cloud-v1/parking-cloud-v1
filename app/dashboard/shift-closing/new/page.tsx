import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ShiftClosingForm from '@/components/ShiftClosingForm'

export default async function NewShiftClosingPage({
  searchParams,
}: {
  searchParams?: Promise<{
    lot?: string
    reset?: string
  }>
}) {
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

  const params =
    searchParams
      ? await searchParams
      : {}

  const defaultLotId =
    params.lot || ''

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
        新增當日結班
      </h1>

      <p
        className="muted"
        style={{
          marginTop: 0,
        }}
      >
        {params.reset === '1'
          ? '上一輪匯款已完成，現在開始新的結班／匯款週期。'
          : '填寫本班結班資料與當日結班明細。'}
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
          defaultParkingLotId={
            defaultLotId
          }
        />
      </div>
    </div>
  )
}
