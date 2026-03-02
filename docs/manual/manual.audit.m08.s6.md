# M-08-S6 Audit Report (Inventory + Transfers)

Date: 2026-02-17
Result: PASS

## Audited routes
- `/{locale}/stock`
- `/{locale}/stock/adjustments`
- `/{locale}/stock/counts`
- `/{locale}/stock/counts/wizard`
- `/{locale}/stock/movements`
- `/{locale}/transfers`
- `/{locale}/transfers/wizard`

## Findings (before fixes)
- Session 6 prerequisites were documented as write-only where actual behavior is read/view plus write/action split.
- Stock adjustments manual omitted backend-aligned errors for required variant, required loss reason, batch lookup, and negative stock policy.
- Stock counts + counts wizard omitted required and negative counted-quantity paths and had weak offline error guidance.
- Stock movements manual used generic context failure instead of branch-scope restriction as the practical failure path.
- Transfers + transfer wizard entries missed several deterministic create/receive errors.
- Session 6 Swahili still contained English prerequisite lines.

## Fixes applied
- Rewrote EN/SW Session 6 prerequisites to user-first permission guidance with explicit read/write split.
- Updated stock adjustments errors to backend-aligned outcomes.
- Updated stock counts and stock counts wizard errors for required quantity, negative quantity, offline restriction, and batch existence.
- Updated stock movements error guidance to branch-scope restriction.
- Expanded transfers and transfer wizard common errors to include key create/receive validations.
- Replaced remaining English prerequisite text in Session 6 Swahili entries.
- Synced docs manual files to frontend runtime files.

## Verification
- JSON parse: PASS
- EN/SW runtime sync hash match: PASS
- Frontend build: PASS
