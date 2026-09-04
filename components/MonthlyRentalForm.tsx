'use client'

import {
  FormEvent,
  useMemo,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'

type ParkingLot = {
  id: string
  name: string
  status: string
}

type InitialData = {
  waitingId?: string
  parkingLotId?: string
  customerCode?: string
  customerName?: string
  phone?: string
  vehiclePlate?: string
  vehicleType?:
    | 'car'
    | 'motorcycle'
    | 'heavy_motorcycle'
  notes?: string
}

export default function MonthlyRentalForm({
  parkingLots,
  initialData,
}: {
  parkingLots: ParkingLot[]
  initialData?: InitialData
}) {
  const defaultLotId =
    initialData?.parkingLotId &&
    parkingLots.some(
      (lot) =>
        lot.id ===
        initialData.parkingLotId
    )
      ? initialData.parkingLotId
      : parkingLots.length > 0
        ? parkingLots[0].id
        : ''

  const [parkingLotId, setParkingLotId] =
    useState(defaultLotId)

  const [customerCode, setCustomerCode] =
    useState(
      initialData?.customerCode || ''
    )

  const [customerName, setCustomerName] =
    useState(
      initialData?.customerName || ''
    )

  const [phone, setPhone] = useState(
    initialData?.phone || ''
  )

  const [vehiclePlate, setVehiclePlate] =
    useState(
      initialData?.vehiclePlate || ''
    )

  const [vehicleType, setVehicleType] =
    useState<
      'car' | 'motorcycle' | 'heavy_motorcycle'
    >(
      initialData?.vehicleType || 'car'
    )

  const [rentalType, setRentalType] =
    useState('')

  const [startDate, setStartDate] =
    useState('')

  const [endDate, setEndDate] =
    useState('')

  const [monthlyFee, setMonthlyFee] =
    useState('')

  const [paymentStatus, setPaymentStatus] =
    useState<'unpaid' | 'paid'>('unpaid')

  const [paymentDate, setPaymentDate] =
    useState('')

  const [invoiceNumber, setInvoiceNumber] =
    useState('')

  const [notes, setNotes] = useState(
    initialData?.notes || ''
  )

  const [loading, setLoading] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const [success, setSuccess] =
    useState(false)

  const selectedParkingLot =
    useMemo(
      () =>
        parkingLots.find(
          (lot) =>
            lot.id ===
            parkingLotId
        ),
      [
        parkingLots,
        parkingLotId,
      ]
    )

  async function submit(
    e: FormEvent
  ) {
    e.preventDefault()

    if (loading) return

    setLoading(true)
    setMessage('')
    setSuccess(false)

    try {
      if (!parkingLotId) {
        setMessage(
          '請選擇停車場'
        )
        return
      }

      if (
        !customerCode.trim()
      ) {
        setMessage(
          '請輸入客戶編號'
        )
        return
      }

      if (
        !customerName.trim()
      ) {
        setMessage(
          '請輸入姓名'
        )
        return
      }

      if (
        !vehiclePlate.trim()
      ) {
        setMessage(
          '請輸入車牌'
        )
        return
      }

      if (!startDate) {
        setMessage(
          '請選擇起租日'
        )
        return
      }

      if (!endDate) {
        setMessage(
          '請選擇到期日'
        )
        return
      }

      if (
        endDate <
        startDate
      ) {
        setMessage(
          '到期日不可早於起租日'
        )
        return
      }

      if (
        paymentStatus ===
          'paid' &&
        !paymentDate
      ) {
        setMessage(
          '已選擇「已繳」，請填寫收款日期'
        )
        return
      }

      const fee =
        monthlyFee.trim() === ''
          ? 0
          : Number(
              monthlyFee
            )

      if (
        Number.isNaN(
          fee
        ) ||
        fee < 0
      ) {
        setMessage(
          '月租金額格式不正確'
        )
        return
      }

      const supabase =
        createClient()

      const {
        data: {
          user,
        },
        error:
          userError,
      } =
        await supabase
          .auth
          .getUser()

      if (
        userError ||
        !user
      ) {
        setMessage(
          '登入狀態失效，請重新登入'
        )
        return
      }

      /*
       * 客戶編號是後續月租總表同步的重要識別值。
       * 手動新增時先檢查同一停車場是否已有使用中的相同客戶編號，
       * 避免之後 CSV / Excel 同步時誤認成同一筆。
       */
      const {
        data:
          duplicateCustomer,
        error:
          duplicateCustomerError,
      } =
        await supabase
          .from(
            'monthly_rentals'
          )
          .select(
            'id, customer_name, vehicle_plate'
          )
          .eq(
            'parking_lot_id',
            parkingLotId
          )
          .eq(
            'customer_code',
            customerCode.trim()
          )
          .neq(
            'rental_status',
            'cancelled'
          )
          .limit(1)
          .maybeSingle()

      if (
        duplicateCustomerError
      ) {
        setMessage(
          '客戶編號檢查失敗：' +
            duplicateCustomerError.message
        )
        return
      }

      if (
        duplicateCustomer
      ) {
        setMessage(
          `客戶編號 ${customerCode.trim()} 已存在，目前為 ${duplicateCustomer.customer_name || '未填姓名'}／${duplicateCustomer.vehicle_plate || '未填車牌'}，請確認是否重複新增。`
        )
        return
      }

      const {
        data:
          createdRental,
        error:
          insertError,
      } =
        await supabase
          .from(
            'monthly_rentals'
          )
          .insert({
            parking_lot_id:
              parkingLotId,

            customer_code:
              customerCode.trim(),

            customer_name:
              customerName.trim(),

            phone:
              phone.trim() ||
              null,

            vehicle_plate:
              vehiclePlate
                .trim()
                .toUpperCase(),

            vehicle_type:
              vehicleType,

            rental_type:
              rentalType.trim() ||
              null,

            start_date:
              startDate,

            end_date:
              endDate,

            monthly_fee:
              fee,

            payment_status:
              paymentStatus,

            rental_status:
              'active',

            payment_date:
              paymentStatus ===
              'paid'
                ? paymentDate ||
                  null
                : null,

            invoice_number:
              paymentStatus ===
              'paid'
                ? invoiceNumber.trim() ||
                  null
                : null,

            notes:
              notes.trim() ||
              null,

            created_by:
              user.id,

            updated_at:
              new Date()
                .toISOString(),
          })
          .select(
            'id'
          )
          .single()

      if (
        insertError
      ) {
        setMessage(
          '新增失敗：' +
            insertError.message
        )
        return
      }

      /*
       * 如果這筆資料是從候補名單轉入，
       * 月租建立成功後才將候補狀態改成 converted。
       *
       * 這樣可以避免月租新增失敗，
       * 但候補卻先被移除。
       */
      if (
        initialData?.waitingId
      ) {
        const {
          error:
            waitingError,
        } =
          await supabase
            .from(
              'monthly_waiting_list'
            )
            .update({
              status:
                'converted',

              converted_at:
                new Date()
                  .toISOString(),

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              'id',
              initialData.waitingId
            )
            .eq(
              'parking_lot_id',
              parkingLotId
            )
            .eq(
              'status',
              'waiting'
            )

        if (
          waitingError
        ) {
          setSuccess(
            true
          )

          setMessage(
            '月租已新增成功，但候補狀態更新失敗：' +
              waitingError.message
          )

          return
        }
      }

      setSuccess(true)

      setMessage(
        initialData?.waitingId
          ? '已成功轉為正式月租'
          : '月租資料新增成功'
      )

      setTimeout(
        () => {
          window.location.href =
            '/dashboard/monthly-rentals'
        },
        700
      )
    } catch (
      error: any
    ) {
      setMessage(
        '新增失敗：' +
          (error?.message ||
            '未知錯誤')
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  return (
    <form
      onSubmit={
        submit
      }
    >
      <div
        style={{
          marginBottom:
            22,
        }}
      >
        <h2
          style={{
            marginTop:
              0,
          }}
        >
          月租資料
        </h2>

        {initialData?.waitingId && (
          <div
            style={{
              marginBottom:
                12,
              padding:
                '10px 12px',
              borderRadius:
                8,
              background:
                '#eff6ff',
              color:
                '#1d4ed8',
              fontWeight:
                600,
            }}
          >
            此筆資料由月租候補名單轉入
          </div>
        )}

        {selectedParkingLot && (
          <p
            className="muted"
            style={{
              marginBottom:
                0,
            }}
          >
            目前停車場：
            {
              selectedParkingLot.name
            }
          </p>
        )}
      </div>

      <div
        style={{
          display:
            'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 18,
        }}
      >
        <div
          className="field"
        >
          <label>
            停車場 *
          </label>

          <select
            value={
              parkingLotId
            }
            onChange={(
              e
            ) =>
              setParkingLotId(
                e.target
                  .value
              )
            }
            required
          >
            <option value="">
              請選擇停車場
            </option>

            {parkingLots.map(
              (lot) => (
                <option
                  key={
                    lot.id
                  }
                  value={
                    lot.id
                  }
                >
                  {
                    lot.name
                  }
                </option>
              )
            )}
          </select>
        </div>

        <div
          className="field"
        >
          <label>
            客戶編號 *
          </label>

          <input
            type="text"
            value={
              customerCode
            }
            onChange={(
              e
            ) =>
              setCustomerCode(
                e.target
                  .value
              )
            }
            placeholder="例如：3506"
            required
          />

          <small
            className="muted"
          >
            後續月租總表同步會優先使用客戶編號辨識，請與原停車系統一致。
          </small>
        </div>

        <div
          className="field"
        >
          <label>
            姓名 *
          </label>

          <input
            type="text"
            value={
              customerName
            }
            onChange={(
              e
            ) =>
              setCustomerName(
                e.target
                  .value
              )
            }
            placeholder="請輸入姓名"
            required
          />
        </div>

        <div
          className="field"
        >
          <label>
            電話
          </label>

          <input
            type="text"
            value={
              phone
            }
            onChange={(
              e
            ) =>
              setPhone(
                e.target
                  .value
              )
            }
            placeholder="例如：0912345678"
          />
        </div>

        <div
          className="field"
        >
          <label>
            車牌 *
          </label>

          <input
            type="text"
            value={
              vehiclePlate
            }
            onChange={(
              e
            ) =>
              setVehiclePlate(
                e.target
                  .value
              )
            }
            placeholder="例如：ABC-1234"
            required
          />
        </div>

        <div
          className="field"
        >
          <label>
            車種 *
          </label>

          <select
            value={
              vehicleType
            }
            onChange={(
              e
            ) =>
              setVehicleType(
                e.target
                  .value as
                  | 'car'
                  | 'motorcycle'
                  | 'heavy_motorcycle'
              )
            }
          >
            <option value="car">
              汽車
            </option>

            <option value="motorcycle">
              機車
            </option>

            <option value="heavy_motorcycle">
              重機
            </option>
          </select>
        </div>

        <div
          className="field"
        >
          <label>
            月租類型
          </label>

          <input
            type="text"
            value={
              rentalType
            }
            onChange={(
              e
            ) =>
              setRentalType(
                e.target
                  .value
              )
            }
            placeholder="例如：一般、里民、身障"
          />
        </div>

        <div
          className="field"
        >
          <label>
            起租日 *
          </label>

          <input
            type="date"
            value={
              startDate
            }
            onChange={(
              e
            ) =>
              setStartDate(
                e.target
                  .value
              )
            }
            required
          />
        </div>

        <div
          className="field"
        >
          <label>
            到期日 *
          </label>

          <input
            type="date"
            value={
              endDate
            }
            min={
              startDate ||
              undefined
            }
            onChange={(
              e
            ) =>
              setEndDate(
                e.target
                  .value
              )
            }
            required
          />
        </div>

        <div
          className="field"
        >
          <label>
            月租金額
          </label>

          <input
            type="number"
            min="0"
            step="1"
            value={
              monthlyFee
            }
            onChange={(
              e
            ) =>
              setMonthlyFee(
                e.target
                  .value
              )
            }
            placeholder="例如：3000"
          />
        </div>

        <div
          className="field"
        >
          <label>
            付款狀態 *
          </label>

          <select
            value={
              paymentStatus
            }
            onChange={(
              e
            ) =>
              setPaymentStatus(
                e.target
                  .value as
                  | 'unpaid'
                  | 'paid'
              )
            }
            required
          >
            <option value="unpaid">
              未繳
            </option>

            <option value="paid">
              已繳
            </option>
          </select>
        </div>

        {paymentStatus ===
          'paid' && (
          <>
            <div
              className="field"
            >
              <label>
                收款日期
              </label>

              <input
                type="date"
                value={
                  paymentDate
                }
                required
                onChange={(
                  e
                ) =>
                  setPaymentDate(
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
            >
              <label>
                發票號碼
              </label>

              <input
                type="text"
                value={
                  invoiceNumber
                }
                onChange={(
                  e
                ) =>
                  setInvoiceNumber(
                    e.target
                      .value
                  )
                }
                placeholder="可留空"
              />
            </div>
          </>
        )}
      </div>

      <div
        className="field"
        style={{
          marginTop:
            18,
        }}
      >
        <label>
          備註
        </label>

        <textarea
          value={
            notes
          }
          onChange={(
            e
          ) =>
            setNotes(
              e.target
                .value
            )
          }
          rows={
            4
          }
          placeholder="其他備註"
          style={{
            width:
              '100%',
            padding:
              10,
            boxSizing:
              'border-box',
            border:
              '1px solid #cbd5e1',
            borderRadius:
              8,
          }}
        />
      </div>

      {message && (
        <div
          style={{
            marginTop:
              18,
            padding:
              12,
            borderRadius:
              8,
            background:
              success
                ? '#dcfce7'
                : '#fee2e2',
            color:
              success
                ? '#166534'
                : '#b91c1c',
          }}
        >
          {
            message
          }
        </div>
      )}

      <div
        style={{
          display:
            'flex',
          gap: 12,
          alignItems:
            'center',
          marginTop:
            22,
        }}
      >
        <button
          className="btn"
          type="submit"
          disabled={
            loading
          }
        >
          {loading
            ? initialData?.waitingId
              ? '轉正式中…'
              : '新增中…'
            : initialData?.waitingId
              ? '確認轉正式月租'
              : '新增月租'}
        </button>

        <a
          href={
            initialData?.waitingId
              ? '/dashboard/monthly-rentals/waiting-list'
              : '/dashboard/monthly-rentals'
          }
          style={{
            color:
              '#475569',
            textDecoration:
              'none',
          }}
        >
          取消
        </a>
      </div>
    </form>
  )
}
