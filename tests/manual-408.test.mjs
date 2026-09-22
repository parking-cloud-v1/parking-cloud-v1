import test from 'node:test'
import assert from 'node:assert/strict'
import {
  is408MonthlySheet,
  parse408PaymentSheet,
} from '../lib/monthly-408-payment.ts'
import {
  prepareManualPayment,
  getManualPaymentOptions,
} from '../lib/monthly-manual-payment.ts'

test('408 only recognizes monthly roster sheets, not temporary parking sheets', () => {
  assert.equal(is408MonthlySheet('408巷115-09-10'), true)
  assert.equal(is408MonthlySheet('9月臨停費'), false)
  assert.equal(is408MonthlySheet('408巷月租簡訊名單'), false)
})

test('408 payment parser extracts only rows with payment dates and normalizes Chinese date text', () => {
  const matrix = [
    ['繳費狀態','客戶編號','車牌','姓名','電話','金額','類別','發票號碼','備註'],
    ['8月26日',9,'ATX7366','杜郁慧',909666136,5000,'一般','DP24802753','RD'],
    ['',10,'ABC1234','未付款',912345678,5000,'一般','',''],
  ]
  const rows = parse408PaymentSheet('408巷115-09-10', matrix)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].paymentDate, '2026-08-26')
  assert.equal(rows[0].vehiclePlate, 'ATX7366')
  assert.equal(rows[0].amountPaid, 5000)
  assert.equal(rows[0].invoiceNumber, 'DP24802753')
  assert.equal(rows[0].reportMonth, '2026-09')
})

test('408 parser accepts Excel Date values', () => {
  const matrix = [
    ['繳費狀態','客戶編號','車牌','姓名','電話','金額','類別','發票號碼','備註'],
    [new Date('2026-09-03T00:00:00Z'),4,'RBQ3317','王煒龍',989893441,4000,'里民','FR35753855','LINE PAY'],
  ]
  const rows = parse408PaymentSheet('408巷115-09-10', matrix)
  assert.equal(rows[0].paymentDate, '2026-09-03')
  assert.equal(rows[0].paymentMethod, 'LINE PAY')
})

test('manual payment uses exact rental type rule and allowed months', () => {
  const rental = {
    parkingLotId: 'lot-1',
    rentalType: '一般',
    vehicleType: 'car',
  }
  const rules = [{
    parking_lot_id: 'lot-1',
    type_name: '一般',
    vehicle_type: 'car',
    base_monthly_fee: 2500,
    allowed_payment_months: [1,2,3],
    priority: 1,
    is_active: true,
  }]
  const result = prepareManualPayment(rental, rules, 2)
  assert.equal(result.ok, true)
  assert.equal(result.monthlyFee, 2500)
  assert.equal(result.amountPaid, 5000)
  assert.deepEqual(result.allowedMonths, [1,2,3])
})

test('manual payment rejects months not enabled for the type', () => {
  const rental = {
    parkingLotId: 'lot-1',
    rentalType: '里民',
    vehicleType: 'car',
  }
  const rules = [{
    parking_lot_id: 'lot-1',
    type_name: '里民',
    vehicle_type: 'car',
    base_monthly_fee: 2000,
    allowed_payment_months: [1,2],
    priority: 1,
    is_active: true,
  }]
  const result = prepareManualPayment(rental, rules, 3)
  assert.equal(result.ok, false)
  assert.match(result.error, /允許/)
})


test('manual payment options expose configured months before submit', () => {
  const rental = { parkingLotId: 'lot-1', rentalType: '一般', vehicleType: 'car' }
  const rules = [{ parking_lot_id:'lot-1', type_name:'一般', vehicle_type:'car', base_monthly_fee:2500, allowed_payment_months:[1,3,6], priority:1, is_active:true }]
  const result = getManualPaymentOptions(rental, rules)
  assert.equal(result.ok, true)
  assert.equal(result.monthlyFee, 2500)
  assert.deepEqual(result.allowedMonths, [1,3,6])
})
