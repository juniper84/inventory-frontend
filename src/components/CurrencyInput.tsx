'use client';

import { useState } from 'react';

interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Raw numeric value – string, number, null, or undefined are all accepted. */
  value: string | number | null | undefined;
  /** Called with the raw numeric string (no commas) whenever the input changes. */
  onChange: (value: string) => void;
}

function formatWithCommas(raw: string): string {
  if (!raw) return '';
  const stripped = raw.replace(/,/g, '');
  const num = Number(stripped);
  if (!stripped || isNaN(num)) return raw;
  const dotIdx = stripped.indexOf('.');
  if (dotIdx !== -1) {
    const intPart = Math.floor(Math.abs(num));
    const sign = num < 0 ? '-' : '';
    return `${sign}${intPart.toLocaleString('en')}.${stripped.slice(dotIdx + 1)}`;
  }
  return num.toLocaleString('en');
}

export function CurrencyInput({
  value,
  onChange,
  onFocus,
  onBlur,
  ...props
}: CurrencyInputProps) {
  const [focused, setFocused] = useState(false);
  const raw = value == null ? '' : String(value);
  const displayValue = focused ? raw : formatWithCommas(raw);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={(e) => {
        // Strip anything that isn't a digit, decimal point, or leading minus
        const cleaned = e.target.value.replace(/[^0-9.-]/g, '');
        onChange(cleaned);
      }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      {...props}
    />
  );
}
