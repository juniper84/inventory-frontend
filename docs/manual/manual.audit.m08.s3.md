# M-08 Session 3 Audit (Catalog + Pricing)

Date: 2026-02-17
Status: PASS
Blocking mismatches remaining: 0

## Audited Routes
- /{locale}/catalog/categories
- /{locale}/catalog/products
- /{locale}/catalog/products/wizard
- /{locale}/catalog/variants
- /{locale}/price-lists
- /{locale}/price-lists/wizard

## Findings Summary
- Total mismatches identified: 8
- Total blocking mismatches after fixes: 0

## Key Corrections Applied
- Corrected categories error mapping by removing `CATEGORYID_IS_REQUIRED` and aligning to `NAME_IS_REQUIRED` + context handling.
- Split catalog page prerequisites into plain-language read (`catalog.read`) and write (`catalog.write`) requirements.
- Added missing product image constraints/errors: `PRIMARY_IMAGE_IS_REQUIRED`, `ADDITIONAL_IMAGES_ARE_NOT_ENABLED_FOR_THIS_SUBSCRIPTION`, and retained `IMAGE_EXCEEDS_20MB_LIMIT`.
- Updated product wizard prerequisites to include `catalog.write` and conditional `stock.write` for initial stock posting.
- Replaced wizard error set with reachable backend validations: `CATEGORYID_IS_REQUIRED`, `BASEUNITID_AND_SELLUNITID_ARE_REQUIRED`, `CONVERSION_FACTOR_IS_REQUIRED`.
- Added missing variants error: `REASON_IS_REQUIRED_FOR_SKU_REASSIGNMENT`.
- Re-aligned price list pages away from `UNIT_NOT_FOUND` emphasis to deterministic controller/context issues.
- Fixed remaining Swahili-English leakage in `catalog-catalog-products-wizard` prerequisites.

## Artifacts Updated
- frontend/docs/manual/manual.en.json
- frontend/docs/manual/manual.sw.json
- frontend/src/data/manual/manual.en.json
- frontend/src/data/manual/manual.sw.json

## Confidence
- All six Session 3 manual entries updated with high confidence after FE+BE route validation.
