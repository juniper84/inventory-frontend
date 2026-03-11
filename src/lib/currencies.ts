/**
 * Centralized currency list for the application.
 * All pages that display or allow selection of currencies must import from here.
 * To add a new currency, add one entry to this array — it will appear everywhere automatically.
 * All codes must be valid ISO 4217 codes so that Intl.NumberFormat formats them correctly.
 */
export const CURRENCIES: { code: string; label: string }[] = [
  { code: 'TZS', label: 'Tanzanian Shilling (TZS)' },
  { code: 'KES', label: 'Kenyan Shilling (KES)' },
  { code: 'UGX', label: 'Ugandan Shilling (UGX)' },
  { code: 'RWF', label: 'Rwandan Franc (RWF)' },
  { code: 'ETB', label: 'Ethiopian Birr (ETB)' },
  { code: 'ZAR', label: 'South African Rand (ZAR)' },
  { code: 'NGN', label: 'Nigerian Naira (NGN)' },
  { code: 'GHS', label: 'Ghanaian Cedi (GHS)' },
  { code: 'MZN', label: 'Mozambican Metical (MZN)' },
  { code: 'BWP', label: 'Botswana Pula (BWP)' },
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'AED', label: 'UAE Dirham (AED)' },
];

/** Set of valid currency codes for quick lookup / validation. */
export const VALID_CURRENCY_CODES: ReadonlySet<string> = new Set(
  CURRENCIES.map((c) => c.code),
);

/**
 * Currencies that have zero decimal places (no cents/fractional units in
 * practical use). Intl.NumberFormat often defaults these to 2 decimal places,
 * so we override that explicitly wherever we format currency amounts.
 */
export const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  'TZS', // Tanzanian Shilling
  'UGX', // Ugandan Shilling
  'RWF', // Rwandan Franc
]);
