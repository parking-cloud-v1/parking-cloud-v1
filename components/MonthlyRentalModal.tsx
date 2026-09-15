'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { hasOpenedNewPaymentCycle } from '@/lib/monthly-rental-payment-state'

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

    try {
      const response = await fetch('/api/monthly-rentals/payment-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: [{
            rentalId: rental.id,
            parkingLotId: rental.parking_lot_id,
            customerCode: rental.customer_code,
            customerName: rental.customer_name,
            phone: rental.phone,
            vehiclePlate: rental.vehicle_plate,
            paymentDate,
            amountPaid: Number(rental.monthly_fee || 0),
            paymentMethod: '手動收款',
            invoiceNumber: invoiceNumber.trim() || null,
            rentalStartDate: rental.start_date,
            rentalEndDate: rental.end_date,
          }],
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok || Number(result?.success || 0) < 1) {
        setMessage(result?.error || result?.errors?.[0] || '收款失敗，請稍後再試。')
        return
      }

      window.location.reload()
    } catch (error: any) {
      setMessage('收款失敗：' + (error?.message || '網路連線異常'))
    } finally {
      setLoading(false)
    }
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
        // 續租／開新繳費週期只把「本期狀態」改為未繳；
        // 最近收款日期、發票與歷史繳費紀錄全部保留。
        payment_status: 'unpaid',
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

    setLoading(true)
    setMessage('')

    const supabase = createClient()
    const paymentCycleOpened =
      hasOpenedNewPaymentCycle(
        rental.end_date,
        endDate
      )

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

        /*
         * 編輯基本資料不可直接改成「已繳」。
         * 但如果到期日往後延長，代表開放下一期繳費，
         * 因此只會把目前這一期切回「未繳」。
         */
        ...(paymentCycleOpened
          ? { payment_status: 'unpaid' }
          : {}),

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
                續租完成後，本期付款狀態會改成「未繳」；既有繳費紀錄不會被刪除。
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

            <div
              style={{
                gridColumn: '1 / -1',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: 12,
                color: '#475569',
                fontSize: 14,
              }}
            >
              目前付款狀態：
              <strong
                style={{
                  marginLeft: 6,
                  color:
                    rental.payment_status === 'paid'
                      ? '#15803d'
                      : '#dc2626',
                }}
              >
                {rental.payment_status === 'paid'
                  ? '已繳'
                  : '未繳'}
              </strong>
              <span style={{ marginLeft: 8 }}>
                付款狀態不可在「編輯」直接修改；請使用「收款」或匯入繳費報表。
              </span>
            </div>

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