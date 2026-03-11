'use client';

import { useEffect, useMemo, useState } from 'react';
import { ZERO_DECIMAL_CURRENCIES } from './currencies';
import {
  formatDateWithTz,
  formatDateTimeWithTz,
  formatTimeWithTz,
} from './date-format';

const CURRENCY_KEY = 'nvi.locale.currency';
const CURRENCY_EVENT = 'nvi-currency-change';

export function getStoredCurrency(): string {
  if (typeof window === 'undefined') return 'TZS';
  return window.localStorage.getItem(CURRENCY_KEY) ?? 'TZS';
}

export function setStoredCurrency(currency: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CURRENCY_KEY, currency);
  window.dispatchEvent(new CustomEvent(CURRENCY_EVENT, { detail: currency }));
}

export function useCurrency(): string {
  const [currency, setCurrencyState] = useState<string>(() => getStoredCurrency());

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>;
      setCurrencyState(custom.detail ?? 'TZS');
    };
    window.addEventListener(CURRENCY_EVENT, handler);
    return () => window.removeEventListener(CURRENCY_EVENT, handler);
  }, []);

  return currency;
}

// ─── Timezone ────────────────────────────────────────────────────────────────

const TIMEZONE_KEY = 'nvi.locale.timezone';
const TIMEZONE_EVENT = 'nvi-timezone-change';
const DEFAULT_TIMEZONE = 'Africa/Dar_es_Salaam';

export function getStoredTimezone(): string {
  if (typeof window === 'undefined') return DEFAULT_TIMEZONE;
  return window.localStorage.getItem(TIMEZONE_KEY) ?? DEFAULT_TIMEZONE;
}

export function setStoredTimezone(timezone: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TIMEZONE_KEY, timezone);
  window.dispatchEvent(new CustomEvent(TIMEZONE_EVENT, { detail: timezone }));
}

export function useTimezone(): string {
  const [timezone, setTimezoneState] = useState<string>(() => getStoredTimezone());

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>;
      setTimezoneState(custom.detail ?? DEFAULT_TIMEZONE);
    };
    window.addEventListener(TIMEZONE_EVENT, handler);
    return () => window.removeEventListener(TIMEZONE_EVENT, handler);
  }, []);

  return timezone;
}

// ─── Date format ─────────────────────────────────────────────────────────────

const DATE_FORMAT_KEY = 'nvi.locale.dateFormat';
const DATE_FORMAT_EVENT = 'nvi-dateformat-change';
const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY';

export function getStoredDateFormat(): string {
  if (typeof window === 'undefined') return DEFAULT_DATE_FORMAT;
  return window.localStorage.getItem(DATE_FORMAT_KEY) ?? DEFAULT_DATE_FORMAT;
}

export function setStoredDateFormat(dateFormat: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DATE_FORMAT_KEY, dateFormat);
  window.dispatchEvent(new CustomEvent(DATE_FORMAT_EVENT, { detail: dateFormat }));
}

export function useDateFormat(): string {
  const [dateFormat, setDateFormatState] = useState<string>(() => getStoredDateFormat());

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>;
      setDateFormatState(custom.detail ?? DEFAULT_DATE_FORMAT);
    };
    window.addEventListener(DATE_FORMAT_EVENT, handler);
    return () => window.removeEventListener(DATE_FORMAT_EVENT, handler);
  }, []);

  return dateFormat;
}

/**
 * Returns pre-bound formatDate / formatDateTime / formatTime functions that
 * automatically use the business's stored timezone and dateFormat.
 * Use this hook in any React component that displays dates.
 */
export function useFormatDate() {
  const timezone = useTimezone();
  const dateFormat = useDateFormat();

  return useMemo(
    () => ({
      formatDate: (date: Date | string | null | undefined) =>
        formatDateWithTz(date, timezone, dateFormat),
      formatDateTime: (date: Date | string | null | undefined) =>
        formatDateTimeWithTz(date, timezone, dateFormat),
      formatTime: (date: Date | string | null | undefined) =>
        formatTimeWithTz(date, timezone),
    }),
    [timezone, dateFormat],
  );
}

// ─── Currency ─────────────────────────────────────────────────────────────────

export function formatCurrency(amount: number, currency: string, locale?: string): string {
  try {
    const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
    return new Intl.NumberFormat(locale ?? 'en', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
    return `${currency} ${amount.toFixed(fractionDigits)}`;
  }
}
