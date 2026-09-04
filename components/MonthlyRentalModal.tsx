'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'payment' | 'renew' | 'edit'

type Rental = {
  id: string
  parking_lot_id: string
  customer_code: string | null
  customer_name: string
  phone: string | null
  vehicle_plate: string
  vehicle_type: string
  rental_type: string | null
  start_date: string
  end_date: string
  monthly_fee: number
  payment_status: string
  payment_date: string | null
  invoice_number: string | null
  notes: string | null
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
  const [customerCode, setCustomerCode] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [vehicleType, setVehicleType] = useState('car')
  const [rentalType, setRentalType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [monthlyFee, setMonthlyFee] = useState('')
  const [paymentStatus, setPaymentStatus] =
    useState<'paid' | 'unpaid'>('unpaid')

  const [paymentDate, setPaymentDate] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return

    setCustomerCode(rental.customer_code || '')
    setCustomerName(rental.customer_name || '')
    setPhone(rental.phone || '')
    setVehiclePlate(rental.vehicle_plate || '')
    setVehicleType(rental.vehicle_type || 'car')
    setRentalType(rental.rental_type || '')
    setStartDate(rental.start_date || '')
    setEndDate(rental.end_date || '')
    setMonthlyFee(String(rental.monthly_fee || ''))

    setPaymentStatus(
      rental.payment_status === 'paid'
        ? 'paid'
        : 'unpaid'
    )

    setPaymentDate(
      rental.payment_date ||
        (
          rental.payment_status === 'paid'
            ? new Date().toISOString().slice(0, 10)
            : ''
        )
    )
    setInvoiceNumber(rental.invoice_number || '')
    setNotes(rental.notes || '')
    setMessage('')
  }, [open, rental])

  if (!open) return null

  async function savePayment() {
    if (!paymentDate) {
      setMessage('請選擇收款日期')
      return
    }

    setLoading(true)
    setMessage('')

    const supabase = createClient()

    /*
     * 客戶編號是月租總表匯入／同步的重要識別值。
     * 編輯時檢查同一停車場是否已有其他未退租資料使用相同編號。
     */
    const {
      data: duplicateCustomer,
      error: duplicateCustomerError,
    } = await supabase
      .from('monthly_rentals')
      .select('id, customer_name, vehicle_plate')
      .eq('parking_lot_id', rental.parking_lot_id)
      .eq('customer_code', customerCode.trim())
      .neq('id', rental.id)
      .neq('rental_status', 'cancelled')
      .limit(1)
      .maybeSingle()

    if (duplicateCustomerError) {
      setMessage(
        '客戶編號檢查失敗：' +
          duplicateCustomerError.message
      )
      setLoading(false)
      return
    }

    if (duplicateCustomer) {
      setMessage(
        `客戶編號 ${customerCode.trim()} 已被 ${duplicateCustomer.customer_name || '其他月租戶'}／${duplicateCustomer.vehicle_plate || '未填車牌'} 使用，請確認後再修改。`
      )
      setLoading(false)
      return
    }

    const { error } = await supabase
      .from('monthly_rentals')
      .update({
        payment_status: 'paid',
        payment_date: paymentDate,
        invoice_number: invoiceNumber.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rental.id)

    if (error) {
      setMessage('收款失敗：' + error.message)
      setLoading(false)
      return
    }

    window.location.reload()
  }

  async function saveRenew() {
    if (!endDate) {
      setMessage('請輸入新的到期日')
      return
    }

    if (endDate <= rental.end_date) {
      setMessage('新的到期日必須晚於目前到期日')
      return
    }

    setLoading(true)
    setMessage('')

    const supabase = createClient()

    const { error } = await supabase
      .from('monthly_rentals')
      .update({
        end_date: endDate,
        rental_status: 'active',
        payment_status: 'unpaid',
        payment_date: null,
        invoice_number: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rental.id)

    if (error) {
      setMessage('續租失敗：' + error.message)
      setLoading(false)
      return
    }

    window.location.reload()
  }

  async function saveEdit() {
    if (!customerCode.trim()) {
      setMessage('客戶編號不可空白')
      return
    }

    if (!customerName.trim()) {
      setMessage('姓名不可空白')
      return
    }

    if (!vehiclePlate.trim()) {
      setMessage('車牌不可空白')
      return
    }

    if (!startDate || !endDate) {
      setMessage('請輸入起租日與到期日')
      return
    }

    if (endDate < startDate) {
      setMessage('到期日不可早於起租日')
      return
    }

    const fee = Number(monthlyFee || 0)

    if (Number.isNaN(fee) || fee < 0) {
      setMessage('月租金額格式錯誤')
      return
    }

    if (
      paymentStatus === 'paid' &&
      !paymentDate
    ) {
      setMessage(
        '已選擇「已繳」，請填寫收款日期'
      )
      return
    }

    setLoading(true)
    setMessage('')

    const supabase = createClient()

    const { error } = await supabase
      .from('monthly_rentals')
      .update({
        customer_code: customerCode.trim(),
        customer_name: customerName.trim(),
        phone: phone.trim() || null,
        vehicle_plate: vehiclePlate.trim().toUpperCase(),
        vehicle_type: vehicleType,
        rental_type: rentalType.trim() || null,
        start_date: startDate,
        end_date: endDate,
        monthly_fee: fee,

        payment_status: paymentStatus,

        payment_date:
          paymentStatus === 'paid'
            ? paymentDate
            : null,

        invoice_number:
          paymentStatus === 'paid'
            ? invoiceNumber.trim() || null
            : null,

        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rental.id)

    if (error) {
      setMessage('修改失敗：' + error.message)
      setLoading(false)
      return
    }

    window.location.reload()
  }

  async function submit() {
    if (mode === 'payment') {
      await savePayment()
      return
    }

    if (mode === 'renew') {
      await saveRenew()
      return
    }

    await saveEdit()
  }

  const title =
    mode === 'payment'
      ? '月租收款'
      : mode === 'renew'
        ? '續租'
        : '編輯月租資料'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          width: '100%',
          maxWidth: mode === 'edit' ? 760 : 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>{title}</h2>

            <div
              style={{
                marginTop: 5,
                color: '#64748b',
              }}
            >
              {rental.customer_name} ・ {rental.vehicle_plate}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: 0,
              background: '#f1f5f9',
              borderRadius: 8,
              width: 36,
              height: 36,
              cursor: 'pointer',
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>

        {mode === 'payment' && (
          <div
            style={{
              display: 'grid',
              gap: 16,
            }}
          >
            <div className="field">
              <label>本次收款金額</label>

              <input
                type="text"
                value={`$${Number(
                  rental.monthly_fee || 0
                ).toLocaleString()}`}
                disabled
              />
            </div>

            <div className="field">
              <label>收款日期 *</label>

              <input
                type="date"
                value={paymentDate}
                onChange={(e) =>
                  setPaymentDate(e.target.value)
                }
              />
            </div>

            <div className="field">
              <label>發票號碼</label>

              <input
                value={invoiceNumber}
                onChange={(e) =>
                  setInvoiceNumber(e.target.value)
                }
                placeholder="沒有可留空"
              />
            </div>
          </div>
        )}

        {mode === 'renew' && (
          <div
            style={{
              display: 'grid',
              gap: 16,
            }}
          >
            <div
              style={{
                background: '#f8fafc',
                padding: 14,
                borderRadius: 10,
              }}
            >
              <div>
                目前到期日：
                <strong>{rental.end_date}</strong>
              </div>

              <div
                style={{
                  marginTop: 6,
                  color: '#64748b',
                }}
              >
                續租完成後，付款狀態會重新改成「未繳」。
              </div>
            </div>

            <div className="field">
              <label>新的到期日 *</label>

              <input
                type="date"
                value={endDate}
                min={rental.end_date}
                onChange={(e) =>
                  setEndDate(e.target.value)
                }
              />
            </div>
          </div>
        )}

        {mode === 'edit' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            <div className="field">
              <label>客戶編號 *</label>

              <input
                value={customerCode}
                onChange={(e) =>
                  setCustomerCode(e.target.value)
                }
                placeholder="例如：3506"
              />
            </div>

            <div className="field">
              <label>姓名 *</label>

              <input
                value={customerName}
                onChange={(e) =>
                  setCustomerName(e.target.value)
                }
              />
            </div>

            <div className="field">
              <label>電話</label>

              <input
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value)
                }
              />
            </div>

            <div className="field">
              <label>車牌 *</label>

              <input
                value={vehiclePlate}
                onChange={(e) =>
                  setVehiclePlate(e.target.value)
                }
              />
            </div>

            <div className="field">
              <label>車種</label>

              <select
                value={vehicleType}
                onChange={(e) =>
                  setVehicleType(e.target.value)
                }
              >
                <option value="car">汽車</option>
                <option value="motorcycle">機車</option>
                <option value="heavy_motorcycle">
                  重機
                </option>
              </select>
            </div>

            <div className="field">
              <label>月租類型</label>

              <input
                value={rentalType}
                onChange={(e) =>
                  setRentalType(e.target.value)
                }
                placeholder="例如：一般、里民、身障"
              />
            </div>

            <div className="field">
              <label>月租金額</label>

              <input
                type="number"
                min="0"
                value={monthlyFee}
                onChange={(e) =>
                  setMonthlyFee(e.target.value)
                }
              />
            </div>

            <div className="field">
              <label>起租日</label>

              <input
                type="date"
                value={startDate}
                onChange={(e) =>
                  setStartDate(e.target.value)
                }
              />
            </div>

            <div className="field">
              <label>到期日</label>

              <input
                type="date"
                value={endDate}
                onChange={(e) =>
                  setEndDate(e.target.value)
                }
              />
            </div>

            <div className="field">
              <label>付款狀態 *</label>

              <select
                value={paymentStatus}
                onChange={(e) =>
                  setPaymentStatus(
                    e.target.value as
                      | 'paid'
                      | 'unpaid'
                  )
                }
              >
                <option value="unpaid">
                  未繳
                </option>

                <option value="paid">
                  已繳
                </option>
              </select>
            </div>

            {paymentStatus === 'paid' && (
              <>
                <div className="field">
                  <label>收款日期 *</label>

                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) =>
                      setPaymentDate(e.target.value)
                    }
                  />
                </div>

                <div className="field">
                  <label>發票號碼</label>

                  <input
                    value={invoiceNumber}
                    onChange={(e) =>
                      setInvoiceNumber(
                        e.target.value.toUpperCase()
                      )
                    }
                    placeholder="沒有可留空"
                  />
                </div>
              </>
            )}

            <div
              className="field"
              style={{
                gridColumn: '1 / -1',
              }}
            >
              <label>備註</label>

              <textarea
                rows={4}
                value={notes}
                onChange={(e) =>
                  setNotes(e.target.value)
                }
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                }}
              />
            </div>
          </div>
        )}

        {message && (
          <div
            style={{
              color: '#b91c1c',
              marginTop: 16,
            }}
          >
            {message}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            marginTop: 24,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            取消
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={loading}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: 0,
              background: '#0f172a',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {loading
              ? '儲存中…'
              : mode === 'payment'
                ? '確認收款'
                : mode === 'renew'
                  ? '確認續租'
                  : '儲存修改'}
          </button>
        </div>
      </div>
    </div>
  )
}