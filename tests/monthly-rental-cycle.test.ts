import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyPaymentAmount,
  getInitialPaidThroughDate,
  getRenewalState,
  nextPaidThroughDate,
} from '../lib/monthly-rental-cycle.ts'

import {
  decideRosterIdentity,
} from '../lib/monthly-rental-roster.ts'

test('exact positive multiple auto applies months', () => {
  assert.deepEqual(classifyPaymentAmount(2400, 1200), {
    kind: 'auto_apply',
    months: 2,
  })
})

test('zero amount requires manager review', () => {
  assert.deepEqual(classifyPaymentAmount(0, 1200), {
    kind: 'manual_review',
    reason: 'zero_amount',
  })
})

test('non-multiple amount requires manager review', () => {
  assert.deepEqual(classifyPaymentAmount(2500, 1200), {
    kind: 'manual_review',
    reason: 'non_multiple',
  })
})

test('invalid monthly fee requires manager review', () => {
  assert.deepEqual(classifyPaymentAmount(1200, 0), {
    kind: 'manual_review',
    reason: 'invalid_monthly_fee',
  })
})

test('15 days before paid-through date starts renewal reminder', () => {
  assert.equal(getRenewalState({
    today: '2026-09-15',
    paidThroughDate: '2026-09-30',
    reminderDays: 15,
  }).isDue, true)
})

test('16 days before paid-through date is not due yet', () => {
  assert.equal(getRenewalState({
    today: '2026-09-14',
    paidThroughDate: '2026-09-30',
    reminderDays: 15,
  }).isDue, false)
})

test('past paid-through date remains due', () => {
  assert.equal(getRenewalState({
    today: '2026-10-01',
    paidThroughDate: '2026-09-30',
    reminderDays: 15,
  }).isDue, true)
})

test('two months from common October cycle ends at November month end', () => {
  assert.equal(nextPaidThroughDate({
    currentPaidThroughDate: null,
    termStartDate: '2026-10-01',
    termEndDate: '2027-03-31',
    months: 2,
  }), '2026-11-30')
})

test('additional month continues from current paid-through date', () => {
  assert.equal(nextPaidThroughDate({
    currentPaidThroughDate: '2026-11-30',
    termStartDate: '2026-10-01',
    termEndDate: '2027-03-31',
    months: 1,
  }), '2026-12-31')
})

test('payment can land exactly on the configured term end', () => {
  assert.equal(nextPaidThroughDate({
    currentPaidThroughDate: '2027-02-14',
    termStartDate: '2026-10-15',
    termEndDate: '2027-03-14',
    months: 1,
  }), '2027-03-14')
})

test('customer code match with all name phone plate changed is replacement customer', () => {
  assert.equal(decideRosterIdentity({
    incoming: { customerCode: '001', name: '新客', phone: '0911111111', plate: 'BBB-2222' },
    current: { customerCode: '001', name: '舊客', phone: '0922222222', plate: 'AAA-1111' },
  }), 'replacement')
})

test('customer code match with only phone changed is same customer update', () => {
  assert.equal(decideRosterIdentity({
    incoming: { customerCode: '001', name: '王小明', phone: '0911111111', plate: 'AAA-1111' },
    current: { customerCode: '001', name: '王小明', phone: '0922222222', plate: 'AAA-1111' },
  }), 'same')
})

test('blank customer code falls back to plate', () => {
  assert.equal(decideRosterIdentity({
    incoming: { customerCode: '', name: '王小明', phone: '0911111111', plate: 'AAA-1111' },
    current: { customerCode: '', name: '王小明', phone: '0922222222', plate: 'AAA1111' },
  }), 'same')
})


test('new customer joins the current shared month instead of term beginning', () => {
  assert.equal(getInitialPaidThroughDate({
    today: '2026-11-18',
    termStartDate: '2026-10-01',
    termEndDate: '2027-03-31',
  }), '2026-10-31')
})

test('shared cycle anchor works when term starts mid-month', () => {
  assert.equal(getInitialPaidThroughDate({
    today: '2026-11-18',
    termStartDate: '2026-10-15',
    termEndDate: '2027-03-14',
  }), '2026-11-14')
})

test('payment extension refuses to silently cross the configured term end', () => {
  assert.equal(nextPaidThroughDate({
    currentPaidThroughDate: '2027-02-14',
    termStartDate: '2026-10-15',
    termEndDate: '2027-03-14',
    months: 2,
  }), '')
})

test('billing state is paid before the 15-day reminder window', async () => {
  const { getMonthlyBillingState } = await import('../lib/monthly-rental-cycle.ts')
  assert.deepEqual(getMonthlyBillingState({
    today: '2026-09-14',
    paidThroughDate: '2026-09-30',
    paymentReviewStatus: 'clear',
  }), {
    status: 'paid',
    shouldRemind: false,
    reminderStartDate: '2026-09-15',
    daysUntilDue: 16,
  })
})

test('billing state becomes unpaid exactly 15 days before due', async () => {
  const { getMonthlyBillingState } = await import('../lib/monthly-rental-cycle.ts')
  assert.equal(getMonthlyBillingState({
    today: '2026-09-15',
    paidThroughDate: '2026-09-30',
    paymentReviewStatus: 'clear',
  }).status, 'unpaid')
})

test('pending review stays pending but only enters SMS when reminder window is due', async () => {
  const { getMonthlyBillingState } = await import('../lib/monthly-rental-cycle.ts')
  const state = getMonthlyBillingState({
    today: '2026-09-15',
    paidThroughDate: '2026-09-30',
    paymentReviewStatus: 'pending',
  })
  assert.equal(state.status, 'pending')
  assert.equal(state.shouldRemind, true)
})

test('operational list excludes paid-through dates older than four calendar months', async () => {
  const { isWithinOperationalWindow } = await import('../lib/monthly-rental-cycle.ts')
  assert.equal(isWithinOperationalWindow({
    today: '2026-09-15',
    paidThroughDate: '2026-05-14',
    months: 4,
  }), false)
  assert.equal(isWithinOperationalWindow({
    today: '2026-09-15',
    paidThroughDate: '2026-05-15',
    months: 4,
  }), true)
})

test('next coverage starts the day after current paid-through within the system term', async () => {
  const { getNextCoverageStartDate } = await import('../lib/monthly-rental-cycle.ts')
  assert.equal(getNextCoverageStartDate({
    currentPaidThroughDate: '2026-11-30',
    termStartDate: '2026-10-01',
  }), '2026-12-01')
})

test('month-end common cycle does not drift after February', () => {
  assert.equal(nextPaidThroughDate({
    currentPaidThroughDate: '2027-02-27',
    termStartDate: '2027-01-31',
    termEndDate: '2027-06-30',
    months: 1,
  }), '2027-03-30')
})

test('legacy roster end-date changes can never open a payment cycle', async () => {
  const { hasOpenedNewPaymentCycle } = await import('../lib/monthly-rental-payment-state.ts')
  assert.equal(hasOpenedNewPaymentCycle('2026-09-30', '2026-12-31'), false)
})

test('legacy roster re-import preserves existing payment compatibility state', async () => {
  const { nextPaymentStatusAfterRosterImport } = await import('../lib/monthly-rental-payment-state.ts')
  assert.equal(nextPaymentStatusAfterRosterImport({
    currentStatus: 'paid',
    cycleOpened: true,
    isNewRental: false,
  }), 'paid')
})
