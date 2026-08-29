import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MonthlyRentalForm from '@/components/MonthlyRentalForm'

type SearchParams = {
  waiting_id?: string
  parking_lot_id?: string
  customer_name?: string
  phone?: string
  vehicle_plate?: string
  vehicle_type?: string
  notes?: string
}

export default async function NewMonthlyRentalPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
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

  if (!user) {
    redirect(
      '/login'
    )
  }

  const params =
    await searchParams

  const {
    data:
      parkingLots,
    error,
  } =
    await supabase
      .from(
        'parking_lots'
      )
      .select(
        'id, name, status'
      )
      .eq(
        'status',
        'active'
      )
      .order(
        'name'
      )

  const rawVehicleType =
    params.vehicle_type

  const vehicleType:
    | 'car'
    | 'motorcycle'
    | 'heavy_motorcycle' =
      rawVehicleType ===
        'motorcycle' ||
      rawVehicleType ===
        'heavy_motorcycle'
        ? rawVehicleType
        : 'car'

  const initialData = {
    waitingId:
      params.waiting_id ||
      undefined,

    parkingLotId:
      params.parking_lot_id ||
      undefined,

    customerName:
      params.customer_name ||
      undefined,

    phone:
      params.phone ||
      undefined,

    vehiclePlate:
      params.vehicle_plate ||
      undefined,

    vehicleType,

    notes:
      params.notes ||
      undefined,
  }

  return (
    <div>
      <h1>
        {initialData.waitingId
          ? '候補轉正式月租'
          : '新增月租'}
      </h1>

      <p
        className="muted"
      >
        {initialData.waitingId
          ? '確認候補資料並補上月租條件後，即可轉為正式月租。'
          : '建立新的月租車輛與付款資料'}
      </p>

      {error && (
        <div
          style={{
            marginTop:
              20,
            color:
              '#b91c1c',
          }}
        >
          停車場讀取失敗：
          {
            error.message
          }
        </div>
      )}

      <div
        className="card"
        style={{
          marginTop:
            24,
        }}
      >
        <MonthlyRentalForm
          parkingLots={
            parkingLots ||
            []
          }
          initialData={
            initialData
          }
        />
      </div>
    </div>
  )
}
