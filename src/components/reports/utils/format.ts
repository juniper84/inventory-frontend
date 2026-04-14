import { ZERO_DECIMAL_CURRENCIES } from '@/lib/currencies';

/** Full currency formatter — e.g. "TZS 1,234,567" */
export function makeCurrencyFormatter(currency: string, locale: string) {
  const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Compact currency formatter — e.g. "TZS 1.2M", "TZS 14K" */
export function formatCompact(
  value: number,
  currency: string,
  locale: string,
): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${currency} ${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 100_000) {
    return `${currency} ${(value / 1_000).toFixed(1)}K`;
  }
  const formatter = makeCurrencyFormatter(currency, locale);
  return formatter.format(value);
}

/** Percent formatter with sign — e.g. "+23.4%", "-5.2%" */
export function formatPercentChange(value: number, digits = 1): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

/** Plain percent — e.g. "34%" */
export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

/** Integer with thousand separators */
export function makeIntegerFormatter(locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
}

/** Format "X days ago" / "X hours ago" relative time */
export function formatRelative(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Trend direction from two values — returns percent change and direction */
export function calcTrend(current: number, previous: number): {
  pct: number;
  direction: 'up' | 'down' | 'flat';
} {
  if (previous === 0) {
    return { pct: current > 0 ? 100 : 0, direction: current > 0 ? 'up' : 'flat' };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const direction = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  return { pct, direction };
}
