# L2-10 Scenario QA (EN/SW) - Manual Logged-In Runbook

## Purpose
Validate Level 2 assistant behavior in real logged-in flows for:
- intent detection
- reasoning mode correctness (`playbook|dependency|fallback`)
- natural/simple response quality
- actionable next-step quality
- bilingual quality (EN/SW parity by meaning)

## Test Environment
- Frontend running and logged in as business user.
- Backend running with support chat enabled.
- Active branch selected where relevant.
- Language switch available (`/en` and `/sw`).

## Pass/Fail Rules
- `PASS`:
  - expected intent matches output behavior
  - expected reasoning mode is reflected by diagnosis style
  - no manual-dump response (raw unrelated fragments)
  - steps are concrete and in correct sequence
  - language is correct for active locale
- `FAIL`:
  - wrong diagnosis for the scenario
  - generic/manual-dump response
  - wrong route sequence recommendation
  - over-escalation with low evidence when local guidance exists
  - locale mismatch or hard-to-understand wording

## Execution Method
1. Open target page route.
2. Perform setup action (if scenario requires forcing an error).
3. Open assistant and ask exact prompt from JSON scenario.
4. Record observed output in `l2-reasoning.qa.en-sw.json`:
   - `observed.summary`
   - `observed.primary_issue`
   - `observed.steps_head` (first 3 steps)
   - `observed.confidence`
   - `observed.reasoning_mode_guess`
5. Set `status` to `pass` or `fail`.
6. If `fail`, fill `tuning_action`.

## Scenario Order (Run in this order)
1. `S01-EN-EXPLAIN-SETTINGS-BUSINESS`
2. `S02-SW-EXPLAIN-SETTINGS-BUSINESS`
3. `S03-EN-DEP-CATALOG-PRODUCTS-NO-CATEGORY`
4. `S04-SW-DEP-CATALOG-PRODUCTS-NO-CATEGORY`
5. `S05-EN-PLAYBOOK-VERIFY-TOKEN-EXPIRED`
6. `S06-SW-PLAYBOOK-VERIFY-TOKEN-EXPIRED`
7. `S07-EN-POS-SHIFT-BLOCK`
8. `S08-SW-POS-SHIFT-BLOCK`
9. `S09-EN-WHAT-NEXT-ONBOARDING`
10. `S10-SW-WHAT-NEXT-ONBOARDING`
11. `S11-EN-UNMAPPED-BACKEND-ERROR`
12. `S12-SW-UNMAPPED-BACKEND-ERROR`

## Immediate Session Plan (Now)
Run scenarios `S01` to `S06` first (first validation wave), then share pass/fail results.

