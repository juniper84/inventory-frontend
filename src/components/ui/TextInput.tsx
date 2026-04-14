'use client';

import { forwardRef } from 'react';

type TextInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string;
  error?: string;
  type?: 'text' | 'email' | 'password' | 'tel' | 'url' | 'search' | 'number';
};

/**
 * Standard text input with optional label and error message.
 * Matches the gold/dark form styling used across the app.
 *
 * Usage:
 *   <TextInput label="Name" value={name} onChange={e => setName(e.target.value)} />
 *   <TextInput label="Email" error="Required" />
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, error, id, className = '', type = 'text', ...props }, ref) => {
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="grid gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold uppercase tracking-wide text-gold-300/80"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={[
            'rounded-xl border bg-black px-3 py-2 text-sm text-gold-100 outline-none transition-colors',
            'placeholder:text-gold-700/60',
            error
              ? 'border-red-500/60 focus:border-red-400'
              : 'border-gold-700/50 focus:border-gold-500/70',
            'disabled:cursor-not-allowed disabled:opacity-40',
            className,
          ].join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error && inputId ? `${inputId}-error` : undefined}
          {...props}
        />
        {error && (
          <p id={inputId ? `${inputId}-error` : undefined} className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

TextInput.displayName = 'TextInput';
