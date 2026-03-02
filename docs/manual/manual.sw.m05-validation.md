# M-05 SW Completion Validation

- version: 2026-02-17.sw.v4c-m05-full
- entries: 48
- expected_routes: 48
- missing_ids: 0
- route_mismatches: 0
- structure_mismatches: 0
- permissions_mismatches: 0
- entries_with_workflow_lt4: 0
- entries_with_common_errors_lt2: 0
- only_dashboard_related: 0
- empty_related_pages: 0
- english_template_hits: 0
- generic_cause_fallback_hits: 0
- generic_fix_fallback_hits: 0
- pass_core: true
- pass_quality: true

## Quality Notes
- SW corpus rewritten to match EN v6 depth while preserving structural parity.
- Related-page flow rebuilt from dependency chains (no dashboard-only defaults).
- Error causes/fixes are page-actionable in Swahili; fallback generic hits reduced to zero.
