# Monthly Rental Cycle Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the parking system's own rental term and confirmed payment report the only sources of truth for due dates, renewal status, and the 15-day SMS reminder list; legacy roster imports may only maintain customer identity/contact/active membership.

**Architecture:** Introduce one pure monthly-cycle calculation module plus database fields/tables for system-managed paid-through dates and pending payment review. Legacy roster import will never write dates, fees, or payment status. Payment CSV sync will classify a payment against the system monthly fee, auto-apply exact multiples, and queue zero/non-multiple payments for manager review. Monthly list and SMS list will derive status from the same 15-day reminder function.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase/PostgreSQL, Node 22 built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-15-monthly-rental-cycle-redesign.md`

## Global Constraints

- Legacy roster start/end dates must never update the system rental term, paid-through date, payment status, or SMS list.
- Legacy roster sync may update customer identity/contact/vehicle fields, create new renters, and mark missing renters cancelled.
- Customer matching is customer code first; plate is fallback only when customer code is blank.
- Same customer code with name + phone + plate all changed means a new customer: old rental is cancelled and history stays with the old rental ID.
- New customers join the parking lot's current common rental cycle; they do not start a personal cycle from their join date.
- Confirmed payment report is the only automatic source that extends paid-through months.
- Exact positive multiples of configured monthly fee auto-apply; zero or non-multiple amounts require manager review.
- Reminder window is 15 days before the current paid-through/end-of-cycle date.
- Monthly-rental table and SMS list must use the same due-state calculation.
- Existing historical payment records must be preserved.

---

### Task 1: Shared cycle engine with tests

**Files:**
- Create: `lib/monthly-rental-cycle.ts`
- Create: `tests/monthly-rental-cycle.test.ts`

**Interfaces:**
- Produces: `classifyPaymentAmount(amount, monthlyFee)`, `addCalendarMonthsInclusive(date, months)`, `getRenewalState({ today, paidThroughDate, reminderDays })`, `nextPaidThroughDate({ currentPaidThroughDate, termStartDate, termEndDate, months })`.

- [ ] **Step 1: Write failing tests** for exact-multiple auto approval, zero/non-multiple manual review, 15-day reminder boundary, and month-end extension.
- [ ] **Step 2: Run** `node --test tests/monthly-rental-cycle.test.ts` and verify failures are because exports do not yet exist.
- [ ] **Step 3: Implement minimal pure functions** in `lib/monthly-rental-cycle.ts`.
- [ ] **Step 4: Re-run** `node --test tests/monthly-rental-cycle.test.ts` and verify all pass.
- [ ] **Step 5: Run** `npx tsc --noEmit` and fix type errors introduced by the new module.

### Task 2: Database migration for system cycle and payment review

**Files:**
- Create: `sql/migrations/06_monthly_rental_system_cycle.sql`

**Interfaces:**
- Produces columns on `monthly_rentals`: `system_term_id`, `system_cycle_start_date`, `system_cycle_end_date`, `paid_through_date`, `payment_review_status`.
- Produces table: `monthly_payment_reviews` with one row per imported payment requiring manual review.
- Preserves `monthly_payments` as immutable payment history.

- [ ] **Step 1: Write SQL assertions at the bottom of the migration** that select missing columns/tables as diagnostic rows.
- [ ] **Step 2: Implement additive schema only**; no destructive drops and no rewrite of historical payment rows.
- [ ] **Step 3: Add indexes and RLS policies** matching existing authenticated access style.
- [ ] **Step 4: Add a safe bootstrap update** that assigns active parking-lot term IDs/dates to active rentals only when the new system fields are null; never read legacy-import dates as the source.

### Task 3: Make legacy roster a roster-only sync

**Files:**
- Modify: `components/LegacyMonthlyImport.tsx`
- Remove usage from: `lib/monthly-rental-payment-state.ts` where legacy dates open payment cycles.

**Interfaces:**
- Consumes active term from `parking_lot_rental_terms`.
- Produces inserts/updates that never write `start_date`, `end_date`, `monthly_fee`, `payment_status`, `payment_date`, `invoice_number`, `last_paid_month`, or `last_payment_source` for an existing rental.

- [ ] **Step 1: Add focused pure matching helpers/tests** for customer-code-first matching and same-code/all-three-fields-changed => replacement customer.
- [ ] **Step 2: Verify tests fail** before helper implementation.
- [ ] **Step 3: Implement matching helper** and use it from the import flow.
- [ ] **Step 4: For new renters**, create system-cycle fields from the active parking-lot term; ignore imported start/end dates.
- [ ] **Step 5: For replacement renters**, cancel the old rental and insert a new rental ID without copying payment/paid-through fields.
- [ ] **Step 6: For normal updates**, only write roster fields and import metadata.
- [ ] **Step 7: Remove all legacy end-date difference/payment inference paths and UI wording that implies roster dates affect payment.
- [ ] **Step 8: Run** `npx tsc --noEmit`.

### Task 4: Payment CSV as the only cycle-extension input

**Files:**
- Modify: `app/api/monthly-rentals/payment-sync/route.ts`
- Modify: `components/CsvImportButton.tsx`
- Create: `app/dashboard/monthly-rentals/payment-reviews/page.tsx`
- Create: `components/MonthlyPaymentReviewClient.tsx`

**Interfaces:**
- Exact multiple: insert `monthly_payments`, calculate months, extend `paid_through_date`, set review status clear.
- Zero/non-multiple: insert `monthly_payments` as imported history plus `monthly_payment_reviews(status='pending')`; do not extend paid-through date.
- Manual manager approval supplies `approved_months`; refund/retry leaves paid-through unchanged.

- [ ] **Step 1: Add route-level unit tests around the pure amount classifier and date extension helper.**
- [ ] **Step 2: Update payment-sync route** to read `monthly_fee`, system term fields, and `paid_through_date`; stop trusting CSV rentalStartDate/rentalEndDate for cycle state.
- [ ] **Step 3: Auto-apply exact positive multiples** and persist months applied in payment notes/source metadata.
- [ ] **Step 4: Queue zero/non-multiple payments for review** and return `pendingReview` counts to the uploader.
- [ ] **Step 5: Add manager review page** with actions “確認已繳並指定月數” and “退款／需重繳”.
- [ ] **Step 6: Ensure approved review extends from the system cycle, not payment date.**
- [ ] **Step 7: Run** unit tests and `npx tsc --noEmit`.

### Task 5: Monthly-rental list derives due state from the 15-day window

**Files:**
- Modify: `app/dashboard/monthly-rentals/page.tsx`
- Modify only if needed: `components/MonthlyRentalModal.tsx`

**Interfaces:**
- Consumes `paid_through_date` and current system term/cycle fields.
- Displays “未繳” only when today is within 15 days of paid-through (or past due) and the next cycle is not covered.
- Does not use legacy import dates to determine status.

- [ ] **Step 1: Add test cases to shared cycle test file** for 16 days before = not due, 15 days before = due, after due = due.
- [ ] **Step 2: Update page query** to fetch new system-cycle fields.
- [ ] **Step 3: Replace stored `payment_status` as the display decision with `getRenewalState()` output.**
- [ ] **Step 4: Keep historical payment fields visible but label them as history, not the renewal source.**
- [ ] **Step 5: Run** shared tests and `npx tsc --noEmit`.

### Task 6: SMS list uses the identical 15-day due-state function

**Files:**
- Modify: `app/dashboard/monthly-rentals/sms-list/page.tsx`

**Interfaces:**
- Same source fields and same `getRenewalState()` rule as Task 5.
- Excludes cancelled renters.
- Never filters by legacy `start_date`, legacy `end_date`, or stored `payment_status`.

- [ ] **Step 1: Add shared-engine test** proving monthly list and SMS due-state inputs produce the same decision.
- [ ] **Step 2: Update SMS query** to fetch system-cycle fields and active renters only.
- [ ] **Step 3: Filter client rows using the shared 15-day renewal state.**
- [ ] **Step 4: Keep CSV export and original-file sharing behavior intact.**
- [ ] **Step 5: Run** shared tests and `npx tsc --noEmit`.

### Task 7: Final verification and delivery bundle

**Files:**
- Create: `README_月租架構重整_安裝順序.txt`
- Create delivery ZIP with only changed/new files.

**Interfaces:**
- SQL first, then file replacement, then build/deploy.

- [ ] **Step 1: Run** `node --test tests/monthly-rental-cycle.test.ts` and require exit 0.
- [ ] **Step 2: Run** `npx tsc --noEmit` and require exit 0.
- [ ] **Step 3: Run** `npm run build` and require exit 0 before claiming build success.
- [ ] **Step 4: Review diff/search** to ensure legacy import no longer writes cycle/payment fields and SMS no longer filters stored `payment_status`.
- [ ] **Step 5: Package only the SQL, changed source files, tests, and install README into a ZIP.
