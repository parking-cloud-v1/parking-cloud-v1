'use client'

import {
  useEffect,
  useState,
} from 'react'

import { createClient } from '@/lib/supabase/client'

type Mode =
  | 'payment'
  | 'renew'
  | 'edit'

type Rental = {
  id: string

  parking_lot_id: string

  customer_code:
    | string
    | null

  customer_name: string
  phone: string | null

  vehicle_plate: string
  vehicle_type: string

  rental_type:
    | string
    | null

  start_date: string
  end_date: string

  monthly_fee: number

  payment_status: string

  payment_date:
    | string
    | null

  invoice_number:
    | string
    | null

  rental_status?: string

  notes:
    | string
    | null
}

function normalizePlate(
  value: string
) {
  return String(
    value || ''
  )
    .trim()
    .replace(/\s/g, '')
    .replace(/-/g, '')
    .toUpperCase()
}

/*
 * 手動收款唯一辨識碼
 *
 * 避免同一筆手動收款
 * 因為重新點擊或網路延遲
 * 重複寫入繳費歷史。
 */
function buildManualPaymentReference(
  rental: Rental,
  paymentDate: string,
  invoiceNumber: string
) {
  return [
    'manual',
    rental.id,
    normalizePlate(
      rental.vehicle_plate
    ),
    paymentDate,
    Number(
      rental.monthly_fee ||
      0
    ),
    invoiceNumber
      .trim()
      .toUpperCase(),
  ].join('|')
}

export default function MonthlyRentalModal({
  open,
  mode,
  rental,
  onClose,
}: {
  open: boolean
  mode: Mode
  rental: Rental
  onClose: () => void
}) {
  const [
    customerName,
    setCustomerName,
  ] =
    useState('')

  const [
    phone,
    setPhone,
  ] =
    useState('')

  const [
    vehiclePlate,
    setVehiclePlate,
  ] =
    useState('')

  const [
    vehicleType,
    setVehicleType,
  ] =
    useState('car')

  const [
    rentalType,
    setRentalType,
  ] =
    useState('')

  const [
    startDate,
    setStartDate,
  ] =
    useState('')

  const [
    endDate,
    setEndDate,
  ] =
    useState('')

  const [
    monthlyFee,
    setMonthlyFee,
  ] =
    useState('')

  const [
    paymentDate,
    setPaymentDate,
  ] =
    useState('')

  const [
    invoiceNumber,
    setInvoiceNumber,
  ] =
    useState('')

  const [
    notes,
    setNotes,
  ] =
    useState('')

  const [
    loading,
    setLoading,
  ] =
    useState(false)

  const [
    message,
    setMessage,
  ] =
    useState('')

  useEffect(
    () => {
      if (!open) {
        return
      }

      setCustomerName(
        rental.customer_name ||
        ''
      )

      setPhone(
        rental.phone ||
        ''
      )

      setVehiclePlate(
        rental.vehicle_plate ||
        ''
      )

      setVehicleType(
        rental.vehicle_type ||
        'car'
      )

      setRentalType(
        rental.rental_type ||
        ''
      )

      setStartDate(
        rental.start_date ||
        ''
      )

      setEndDate(
        rental.end_date ||
        ''
      )

      setMonthlyFee(
        String(
          rental.monthly_fee ||
          ''
        )
      )

      setPaymentDate(
        rental.payment_date ||
          new Date()
            .toISOString()
            .slice(
              0,
              10
            )
      )

      setInvoiceNumber(
        rental.invoice_number ||
        ''
      )

      setNotes(
        rental.notes ||
        ''
      )

      setMessage('')
    },
    [
      open,
      rental,
    ]
  )

  if (!open) {
    return null
  }

  /*
   * =====================================================
   * 手動收款
   * =====================================================
   */

  async function savePayment() {
    if (!paymentDate) {
      setMessage(
        '請選擇收款日期'
      )

      return
    }

    const fee =
      Number(
        rental.monthly_fee ||
        0
      )

    if (
      Number.isNaN(fee) ||
      fee <= 0
    ) {
      setMessage(
        '本次收款金額必須大於 0'
      )

      return
    }

    if (
      !rental.parking_lot_id
    ) {
      setMessage(
        '找不到停車場資料，無法建立繳費紀錄'
      )

      return
    }

    setLoading(true)
    setMessage('')

    const supabase =
      createClient()

    try {
      /*
       * -----------------------------------------------
       * 1. 取得登入人員
       * -----------------------------------------------
       */

      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser()

      if (!user) {
        setMessage(
          '登入狀態失效，請重新登入'
        )

        return
      }

      /*
       * -----------------------------------------------
       * 2. 建立唯一識別碼
       * -----------------------------------------------
       */

      const sourceReference =
        buildManualPaymentReference(
          rental,
          paymentDate,
          invoiceNumber
        )

      /*
       * -----------------------------------------------
       * 3. 先確認是否已經存在這筆手動收款
       * -----------------------------------------------
       */

      const {
        data:
          existingPayment,

        error:
          existingError,
      } =
        await supabase
          .from(
            'monthly_payments'
          )
          .select(
            'id'
          )
          .eq(
            'source_reference',
            sourceReference
          )
          .limit(1)
          .maybeSingle()

      if (
        existingError
      ) {
        setMessage(
          '檢查繳費歷史失敗：' +
            existingError.message
        )

        return
      }

      /*
       * 如果歷史已存在，
       * 不再新增第二筆，
       * 但仍確認主表是已繳。
       */
      if (
        existingPayment?.id
      ) {
        const {
          error:
            updateExistingError,
        } =
          await supabase
            .from(
              'monthly_rentals'
            )
            .update({
              payment_status:
                'paid',

              payment_date:
                paymentDate,

              invoice_number:
                invoiceNumber
                  .trim() ||
                null,

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              'id',
              rental.id
            )

        if (
          updateExistingError
        ) {
          setMessage(
            '月租付款狀態更新失敗：' +
              updateExistingError.message
          )

          return
        }

        setMessage(
          '此筆繳費歷史已經存在，不會重複建立。'
        )

        setTimeout(
          () => {
            window.location.reload()
          },
          800
        )

        return
      }

      /*
       * -----------------------------------------------
       * 4. 更新月租主表
       * -----------------------------------------------
       */

      const {
        data:
          updatedRental,

        error:
          paymentError,
      } =
        await supabase
          .from(
            'monthly_rentals'
          )
          .update({
            payment_status:
              'paid',

            payment_date:
              paymentDate,

            invoice_number:
              invoiceNumber
                .trim() ||
              null,

            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            'id',
            rental.id
          )
          .select(
            'id'
          )

      if (
        paymentError ||
        !updatedRental ||
        updatedRental.length ===
          0
      ) {
        setMessage(
          '收款失敗：' +
            (
              paymentError
                ?.message ||
              '月租資料沒有更新'
            )
        )

        return
      }

      /*
       * -----------------------------------------------
       * 5. 新增永久繳費歷史
       * -----------------------------------------------
       */

      const {
        error:
          historyError,
      } =
        await supabase
          .from(
            'monthly_payments'
          )
          .insert({
            parking_lot_id:
              rental.parking_lot_id,

            monthly_rental_id:
              rental.id,

            customer_code:
              rental.customer_code ||
              null,

            customer_name:
              rental.customer_name ||
              null,

            phone:
              rental.phone ||
              null,

            vehicle_plate:
              rental.vehicle_plate,

            payment_date:
              paymentDate,

            amount:
              fee,

            payment_method:
              '手動收款',

            invoice_number:
              invoiceNumber
                .trim() ||
              null,

            rental_start_date:
              rental.start_date ||
              null,

            rental_end_date:
              rental.end_date ||
              null,

            source:
              'manual',

            source_reference:
              sourceReference,

            notes:
              '月租管理手動收款',

            created_by:
              user.id,
          })

      if (
        historyError
      ) {
        /*
         * 月租主表已經成功改成已繳，
         * 所以這裡不能說整筆收款失敗。
         */
        console.error(
          '繳費歷史新增失敗',
          historyError
        )

        setMessage(
          '月租已成功改成「已繳」，但繳費歷史建立失敗：' +
            historyError.message
        )

        return
      }

      /*
       * -----------------------------------------------
       * 6. 完成
       * -----------------------------------------------
       */

      setMessage(
        '收款成功，繳費歷史已保存。'
      )

      setTimeout(
        () => {
          window.location.reload()
        },
        700
      )
    } catch (
      error: any
    ) {
      console.error(
        error
      )

      setMessage(
        `收款失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setLoading(false)
    }
  }

  /*
   * =====================================================
   * 續租
   * =====================================================
   */

  async function saveRenew() {
    if (!endDate) {
      setMessage(
        '請輸入新的到期日'
      )

      return
    }

    if (
      endDate <=
      rental.end_date
    ) {
      setMessage(
        '新的到期日必須晚於目前到期日'
      )

      return
    }

    setLoading(true)
    setMessage('')

    const supabase =
      createClient()

    try {
      const {
        error,
      } =
        await supabase
          .from(
            'monthly_rentals'
          )
          .update({
            end_date:
              endDate,

            rental_status:
              'active',

            /*
             * 續租後重新等待下一期付款
             */
            payment_status:
              'unpaid',

            payment_date:
              null,

            invoice_number:
              null,

            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            'id',
            rental.id
          )

      if (error) {
        setMessage(
          '續租失敗：' +
            error.message
        )

        return
      }

      window.location.reload()
    } catch (
      error: any
    ) {
      setMessage(
        `續租失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setLoading(false)
    }
  }

  /*
   * =====================================================
   * 編輯
   * =====================================================
   */

  async function saveEdit() {
    if (
      !customerName.trim()
    ) {
      setMessage(
        '姓名不可空白'
      )

      return
    }

    if (
      !vehiclePlate.trim()
    ) {
      setMessage(
        '車牌不可空白'
      )

      return
    }

    if (
      !startDate ||
      !endDate
    ) {
      setMessage(
        '請輸入起租日與到期日'
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

    const fee =
      Number(
        monthlyFee ||
        0
      )

    if (
      Number.isNaN(
        fee
      ) ||
      fee < 0
    ) {
      setMessage(
        '月租金額格式錯誤'
      )

      return
    }

    setLoading(true)
    setMessage('')

    const supabase =
      createClient()

    try {
      const {
        error,
      } =
        await supabase
          .from(
            'monthly_rentals'
          )
          .update({
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
              rentalType
                .trim() ||
              null,

            start_date:
              startDate,

            end_date:
              endDate,

            monthly_fee:
              fee,

            notes:
              notes.trim() ||
              null,

            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            'id',
            rental.id
          )

      if (error) {
        setMessage(
          '修改失敗：' +
            error.message
        )

        return
      }

      window.location.reload()
    } catch (
      error: any
    ) {
      setMessage(
        `修改失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setLoading(false)
    }
  }

  /*
   * =====================================================
   * Submit
   * =====================================================
   */

  async function submit() {
    if (
      mode ===
      'payment'
    ) {
      await savePayment()
      return
    }

    if (
      mode ===
      'renew'
    ) {
      await saveRenew()
      return
    }

    await saveEdit()
  }

  const title =
    mode ===
    'payment'
      ? '月租收款'
      : mode ===
          'renew'
        ? '續租'
        : '編輯月租資料'

  return (
    <div
      onClick={
        onClose
      }
      style={{
        position:
          'fixed',

        inset: 0,

        background:
          'rgba(15, 23, 42, 0.55)',

        display:
          'flex',

        alignItems:
          'center',

        justifyContent:
          'center',

        zIndex:
          9999,

        padding:
          20,
      }}
    >
      <div
        onClick={(
          event
        ) =>
          event.stopPropagation()
        }
        style={{
          background:
            '#fff',

          width:
            '100%',

          maxWidth:
            mode ===
            'edit'
              ? 760
              : 520,

          maxHeight:
            '90vh',

          overflowY:
            'auto',

          borderRadius:
            16,

          padding:
            24,

          boxShadow:
            '0 20px 60px rgba(0,0,0,.25)',
        }}
      >
        {/* =================================================
            標題
        ================================================= */}

        <div
          style={{
            display:
              'flex',

            justifyContent:
              'space-between',

            alignItems:
              'center',

            gap: 16,

            marginBottom:
              20,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
              }}
            >
              {title}
            </h2>

            <div
              style={{
                marginTop:
                  5,

                color:
                  '#64748b',
              }}
            >
              {
                rental.customer_name
              }{' '}
              ・{' '}
              {
                rental.vehicle_plate
              }
            </div>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              loading
            }
            style={{
              border: 0,

              background:
                '#f1f5f9',

              borderRadius:
                8,

              width:
                36,

              height:
                36,

              cursor:
                loading
                  ? 'not-allowed'
                  : 'pointer',

              fontSize:
                18,
            }}
          >
            ×
          </button>
        </div>

        {/* =================================================
            收款
        ================================================= */}

        {mode ===
          'payment' && (
          <div
            style={{
              display:
                'grid',

              gap: 16,
            }}
          >
            <div className="field">
              <label>
                本次收款金額
              </label>

              <input
                type="text"
                value={`$${Number(
                  rental.monthly_fee ||
                    0
                ).toLocaleString()}`}
                disabled
              />
            </div>

            <div className="field">
              <label>
                收款日期 *
              </label>

              <input
                type="date"
                value={
                  paymentDate
                }
                onChange={(
                  event
                ) =>
                  setPaymentDate(
                    event.target
                      .value
                  )
                }
              />
            </div>

            <div className="field">
              <label>
                發票號碼
              </label>

              <input
                value={
                  invoiceNumber
                }
                onChange={(
                  event
                ) =>
                  setInvoiceNumber(
                    event.target
                      .value
                  )
                }
                placeholder="沒有可留空"
              />
            </div>

            <div
              style={{
                padding:
                  12,

                borderRadius:
                  10,

                background:
                  '#f8fafc',

                color:
                  '#64748b',

                fontSize:
                  13,

                lineHeight:
                  1.6,
              }}
            >
              收款完成後，系統會同時將月租狀態更新為「已繳」，並永久保存本次繳費歷史。
            </div>
          </div>
        )}

        {/* =================================================
            續租
        ================================================= */}

        {mode ===
          'renew' && (
          <div
            style={{
              display:
                'grid',

              gap: 16,
            }}
          >
            <div
              style={{
                background:
                  '#f8fafc',

                padding:
                  14,

                borderRadius:
                  10,
              }}
            >
              <div>
                目前到期日：
                <strong>
                  {
                    rental.end_date
                  }
                </strong>
              </div>

              <div
                style={{
                  marginTop:
                    6,

                  color:
                    '#64748b',
                }}
              >
                續租完成後，付款狀態會重新改成「未繳」。之前的繳費歷史仍會保留。
              </div>
            </div>

            <div className="field">
              <label>
                新的到期日 *
              </label>

              <input
                type="date"

                value={
                  endDate
                }

                min={
                  rental.end_date
                }

                onChange={(
                  event
                ) =>
                  setEndDate(
                    event.target
                      .value
                  )
                }
              />
            </div>
          </div>
        )}

        {/* =================================================
            編輯
        ================================================= */}

        {mode ===
          'edit' && (
          <div
            style={{
              display:
                'grid',

              gridTemplateColumns:
                'repeat(auto-fit, minmax(240px, 1fr))',

              gap: 16,
            }}
          >
            <div className="field">
              <label>
                姓名 *
              </label>

              <input
                value={
                  customerName
                }
                onChange={(
                  event
                ) =>
                  setCustomerName(
                    event.target
                      .value
                  )
                }
              />
            </div>

            <div className="field">
              <label>
                電話
              </label>

              <input
                value={
                  phone
                }
                onChange={(
                  event
                ) =>
                  setPhone(
                    event.target
                      .value
                  )
                }
              />
            </div>

            <div className="field">
              <label>
                車牌 *
              </label>

              <input
                value={
                  vehiclePlate
                }
                onChange={(
                  event
                ) =>
                  setVehiclePlate(
                    event.target
                      .value
                  )
                }
              />
            </div>

            <div className="field">
              <label>
                車種
              </label>

              <select
                value={
                  vehicleType
                }
                onChange={(
                  event
                ) =>
                  setVehicleType(
                    event.target
                      .value
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

            <div className="field">
              <label>
                月租類型
              </label>

              <input
                value={
                  rentalType
                }
                onChange={(
                  event
                ) =>
                  setRentalType(
                    event.target
                      .value
                  )
                }
                placeholder="例如：一般、里民、身障"
              />
            </div>

            <div className="field">
              <label>
                月租金額
              </label>

              <input
                type="number"
                min="0"

                value={
                  monthlyFee
                }

                onChange={(
                  event
                ) =>
                  setMonthlyFee(
                    event.target
                      .value
                  )
                }
              />
            </div>

            <div className="field">
              <label>
                起租日
              </label>

              <input
                type="date"

                value={
                  startDate
                }

                onChange={(
                  event
                ) =>
                  setStartDate(
                    event.target
                      .value
                  )
                }
              />
            </div>

            <div className="field">
              <label>
                到期日
              </label>

              <input
                type="date"

                value={
                  endDate
                }

                onChange={(
                  event
                ) =>
                  setEndDate(
                    event.target
                      .value
                  )
                }
              />
            </div>

            <div
              className="field"
              style={{
                gridColumn:
                  '1 / -1',
              }}
            >
              <label>
                備註
              </label>

              <textarea
                rows={4}

                value={
                  notes
                }

                onChange={(
                  event
                ) =>
                  setNotes(
                    event.target
                      .value
                  )
                }

                style={{
                  width:
                    '100%',

                  padding:
                    10,

                  border:
                    '1px solid #cbd5e1',

                  borderRadius:
                    8,
                }}
              />
            </div>
          </div>
        )}

        {/* =================================================
            訊息
        ================================================= */}

        {message && (
          <div
            style={{
              color:
                message.includes(
                  '成功'
                )
                  ? '#15803d'
                  : '#b91c1c',

              marginTop:
                16,

              padding:
                10,

              borderRadius:
                8,

              background:
                message.includes(
                  '成功'
                )
                  ? '#f0fdf4'
                  : '#fef2f2',
            }}
          >
            {message}
          </div>
        )}

        {/* =================================================
            按鈕
        ================================================= */}

        <div
          style={{
            display:
              'flex',

            justifyContent:
              'flex-end',

            gap: 10,

            marginTop:
              24,
          }}
        >
          <button
            type="button"

            onClick={
              onClose
            }

            disabled={
              loading
            }

            style={{
              padding:
                '9px 16px',

              borderRadius:
                8,

              border:
                '1px solid #cbd5e1',

              background:
                '#fff',

              cursor:
                loading
                  ? 'not-allowed'
                  : 'pointer',

              opacity:
                loading
                  ? 0.6
                  : 1,
            }}
          >
            取消
          </button>

          <button
            type="button"

            onClick={
              submit
            }

            disabled={
              loading
            }

            style={{
              padding:
                '9px 18px',

              borderRadius:
                8,

              border:
                0,

              background:
                '#0f172a',

              color:
                '#fff',

              cursor:
                loading
                  ? 'not-allowed'
                  : 'pointer',

              opacity:
                loading
                  ? 0.65
                  : 1,
            }}
          >
            {loading
              ? '儲存中…'
              : mode ===
                  'payment'
                ? '確認收款'
                : mode ===
                    'renew'
                  ? '確認續租'
                  : '儲存修改'}
          </button>
        </div>
      </div>
    </div>
  )
}