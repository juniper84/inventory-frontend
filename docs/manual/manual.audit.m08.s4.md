# M-08 Session 4 Audit (Sales Operations)

Date: 2026-02-17
Status: PASS
Blocking mismatches remaining: 0

## Audited Routes
- /{locale}/pos
- /{locale}/receipts
- /{locale}/customers
- /{locale}/shifts

## Findings Summary
- Total mismatches identified: 8
- Total blocking mismatches after fixes: 0

## Key Corrections Applied
- Added `customers.read` prerequisite to Customers and removed misleading `USER_NOT_FOUND` error guidance.
- Updated POS prerequisites to include conditional `sales.credit.create` and tightened payment/credit/shift error guidance.
- Expanded Receipts permissions into action-level permissions (`sales.read`, `sales.write`, `sales.credit.settle`, `sales.return.without-receipt`).
- Added `SETTLEMENT_AMOUNT_MUST_BE_POSITIVE` to Receipts error guidance.
- Split Shifts prerequisites by action (`shifts.open` for list/open, `shifts.close` for close).
- Replaced Shifts POS-centric error with `BRANCH_SCOPED_ROLE_RESTRICTION` and retained `SESSION_NOT_FOUND`.
- Corrected Swahili parity issues in Receipts prerequisites.

## Non-Blocking Follow-up
- Receipts UI uses `sales.write` for action button gating while backend uses finer-grained permissions for settlement and return-without-receipt.

## Artifacts Updated
- frontend/docs/manual/manual.en.json
- frontend/docs/manual/manual.sw.json
- frontend/src/data/manual/manual.en.json
- frontend/src/data/manual/manual.sw.json

## Confidence
- All four Session 4 entries updated with high confidence after FE+BE behavior checks.
