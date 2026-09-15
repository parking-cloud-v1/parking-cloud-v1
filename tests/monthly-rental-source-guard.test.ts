import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

function source(path: string) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('legacy roster import does not gate membership on zero amount or old payment fields', () => {
  const text = source('components/LegacyMonthlyImport.tsx')
  assert.doesNotMatch(text, /isPendingZeroRow\(/)
  assert.doesNotMatch(text, /isZeroCancelledRow\(/)
  assert.doesNotMatch(text, /isPaidShortRow\(/)
  assert.doesNotMatch(text, /isOfficialVehicleRow\(/)
  assert.doesNotMatch(text, /applySupervisorTypeRules\(/)
})

test('sms list never reads legacy term dates or stored payment status', () => {
  const text = source('app/dashboard/monthly-rentals/sms-list/page.tsx')
  assert.doesNotMatch(text, /\bstart_date\b/)
  assert.doesNotMatch(text, /\bend_date\b/)
  assert.doesNotMatch(text, /\bpayment_status\b/)
  assert.match(text, /getMonthlyBillingState/)
  assert.match(text, /paid_through_date/)
})


test('monthly list and sms list do not read legacy payment-month inference table', () => {
  const monthly = source('app/dashboard/monthly-rentals/page.tsx')
  const sms = source('app/dashboard/monthly-rentals/sms-list/page.tsx')
  assert.doesNotMatch(monthly, /monthly_rental_payment_months/)
  assert.doesNotMatch(sms, /monthly_rental_payment_months/)
})

test('formal payment sync requires source reference and uses system cycle', () => {
  const text = source('app/api/monthly-rentals/payment-sync/route.ts')
  assert.match(text, /sourceReference/)
  assert.match(text, /system_cycle_start_date/)
  assert.match(text, /paid_through_date/)
  assert.doesNotMatch(text, /legacy_roster_diff/)
})


test('legacy roster allows reused customer codes and only treats name phone plate as roster differences', () => {
  const text = source('components/LegacyMonthlyImport.tsx')
  assert.doesNotMatch(text, /cancelledCustomerCodes/)
  assert.doesNotMatch(text, /cancelledPlates/)

  const start = text.indexOf('function createChangeDetails(')
  const end = text.indexOf('export default function LegacyMonthlyImport', start)
  assert.ok(start >= 0 && end > start)
  const changeHelper = text.slice(start, end)
  assert.doesNotMatch(changeHelper, /oldRow\.monthly_fee/)
  assert.doesNotMatch(changeHelper, /oldRow\.rental_type/)
  assert.doesNotMatch(changeHelper, /oldRow\.vehicle_type/)
  assert.match(changeHelper, /oldRow\.customer_name/)
  assert.match(changeHelper, /oldRow\.phone/)
  assert.match(changeHelper, /oldRow\.vehicle_plate/)
})

test('basic rental edit cannot override the system monthly fee', () => {
  const text = source('components/MonthlyRentalModal.tsx')
  const start = text.indexOf('async function saveEdit()')
  const end = text.indexOf('\n  async function submit()', start)
  assert.ok(start >= 0 && end > start)
  const saveEdit = text.slice(start, end)
  assert.doesNotMatch(saveEdit, /monthly_fee\s*:/)
  assert.doesNotMatch(text, /setMonthlyFee\(/)
  assert.match(text, /月租類型設定/)
})

test('manual payment review is resolved through one transactional database function', () => {
  const route = source('app/api/monthly-rentals/payment-review/route.ts')
  const migration = source('sql/migrations/06_monthly_rental_system_cycle.sql')
  assert.match(route, /\.rpc\(\s*['\"]resolve_monthly_payment_review['\"]/)
  assert.match(migration, /create or replace function public\.resolve_monthly_payment_review/)
  assert.doesNotMatch(route, /\.from\(['\"]monthly_rentals['\"]\)[\s\S]{0,250}\.update\(\{[\s\S]{0,250}paid_through_date/)
})

test('multiple payment rows for the same renter continue from the just-applied paid-through date', () => {
  const route = source('app/api/monthly-rentals/payment-sync/route.ts')
  assert.match(route, /rental\.paid_through_date\s*=\s*newPaidThroughDate/)
})
