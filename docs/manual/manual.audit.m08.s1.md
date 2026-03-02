# M-08-S1 Session Audit (Auth + Onboarding)

- timestamp: 2026-02-17
- en_version: 2026-02-17.en.v6b-m08-s1
- sw_version: 2026-02-17.sw.v4d-m08-s1
- routes_audited: 6
- findings_total: 0
- blocking: 0
- pass: true

## Verified Correct
- Route coverage for all 6 Session-1 entries
- EN/SW structure parity on workflow/common_errors/permissions
- Runtime manual datasets synchronized with docs datasets

## Mismatches Found
- Auth pages used incorrect authenticated-session prerequisites in manual even though routes are public.
- Password reset confirm manual omitted PASSWORD_DOES_NOT_MEET_REQUIREMENTS path from backend reset validation.
- Onboarding manual did not include explicit permission guard failure path (PERMISSION_IS_REQUIRED).
- Session-1 workflow and related-page flow text required tightening to match actual code transitions.

## Fixes Applied
- Rewrote EN+SW prerequisites/workflow/common_errors/related_pages for /login, /signup, /verify-email, /password-reset, /password-reset/confirm, /onboarding based on frontend+backend behavior.
- Aligned onboarding permissions_required with setup actions (business.update, settings.write).
- Updated EN+SW manual versions and synchronized frontend runtime copies.
