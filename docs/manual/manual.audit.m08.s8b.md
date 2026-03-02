# M-08-S8B Audit Report (Missed Routes Catch-up)

Date: 2026-02-17
Result: PASS

## Scope
Catch-up verification for 4 in-scope routes that were present in manual corpus but omitted from explicit session route lists:
- `/{locale}/attachments`
- `/{locale}/audit-logs`
- `/{locale}/expenses`
- `/{locale}/invite`

## Findings (before fixes)
- `/{locale}/audit-logs`: prerequisites omitted explicit `audit.read`; common error mapping incorrectly included exports-domain acknowledgement error.
- `/{locale}/expenses`: prerequisites documented write-only permission and omitted read-vs-write split.
- `/{locale}/invite`: prerequisites incorrectly required authenticated in-app context even though invite accept flow is public token-driven.
- `/{locale}/invite`: common errors were not aligned to token-expiry/password-policy framing for this flow.

## Fixes applied
- Updated EN/SW `audit-compliance-audit-logs` prerequisites to explicit `audit.read` guidance.
- Replaced EN/SW `audit-compliance-audit-logs` common errors with access/scope-aligned outcomes (`BRANCH_SCOPED_ROLE_RESTRICTION`, `FORBIDDEN`).
- Updated EN/SW `purchases-suppliers-expenses` prerequisites to explicit `expenses.read` + `expenses.write` split.
- Updated EN/SW `purchases-suppliers-expenses` error causes/fixes for offline restriction to controller-grounded behavior.
- Updated EN/SW `auth-invite` prerequisites to public token-flow requirements.
- Updated EN/SW `auth-invite` common errors to token-expiry and password-policy outcomes.
- Synced docs manual files to frontend runtime manual files.

## Verification
- JSON parse: PASS
- EN/SW runtime sync hash match: PASS
- Frontend build: PASS
