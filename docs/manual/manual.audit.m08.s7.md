# M-08-S7 Audit Report (Reporting + Support Modules)

Date: 2026-02-17
Result: PASS

## Audited routes
- `/{locale}`
- `/{locale}/reports`
- `/{locale}/reports/[section]`
- `/{locale}/exports`
- `/{locale}/search`
- `/{locale}/notes`
- `/{locale}/notifications`
- `/{locale}/offline`
- `/{locale}/offline/conflicts`

## Findings (before fixes)
- Reports and reports-section prerequisites mixed `reports.read` (view) with `customers.export` (customer CSV action), causing permission confusion.
- Reports entries used export-branch error mapping instead of report runtime branch-scope restriction behavior.
- Exports prerequisites were generic and omitted explicit `exports.write` and branch-scoped branch requirements.
- Search prerequisites omitted backend-enforced `search.read`.
- Notes prerequisites were write/manage-only and omitted `notes.read` required for page load/list/meta/reminders.
- Notes common error mapping used non-backend `NOTE_IS_REQUIRED` instead of route-reachable note validation failures.
- Notifications prerequisites omitted `notifications.read` and lacked stream-token failure guidance.
- Offline and offline-conflicts prerequisites were write-only and did not split read (`offline.read`) versus action (`offline.write`).
- Session 7 Swahili entries still contained English prerequisite lines.

## Fixes applied
- Rewrote reports and reports-section prerequisites to separate view (`reports.read`) from customer CSV export (`customers.export`).
- Replaced reports/report-section common error mappings with operationally reachable context and branch-scope restriction guidance.
- Rewrote exports prerequisites to explicit user-first `exports.write` guidance with branch-scope branch-selection requirement.
- Added `search.read` prerequisite to Search in EN/SW.
- Rewrote notes prerequisites to explicit read/write/manage split in EN/SW.
- Replaced notes error mapping with backend-aligned failures (`TITLE_AND_BODY_ARE_REQUIRED`, `NOT_ALLOWED_TO_EDIT_THIS_NOTE`, `INVALID_REMINDER_DATE`).
- Rewrote notifications prerequisites to include `notifications.read`, and aligned errors with permission/token stream failures.
- Rewrote offline and offline-conflicts prerequisites to explicit read-versus-write permission split in EN/SW.
- Removed remaining English prerequisite lines from Session 7 Swahili entries.
- Synced docs manual files to frontend runtime manual files.

## Verification
- JSON parse: PASS
- EN/SW runtime sync hash match: PASS
- Frontend build: PASS
