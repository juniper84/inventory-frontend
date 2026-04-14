'use client';

import { forwardRef } from 'react';

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
};

/**
 * Standard textarea with optional label and error message.
 * Matches TextInput gold/dark styling — multiline variant.
 *
 * Usage:
 *   <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
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
        <textarea
          ref={ref}
          id={inputId}
          className={[
            'rounded-xl border bg-black px-3 py-2 text-sm text-gold-100 outline-none transition-colors resize-y',
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

Textarea.displayName = 'Textarea';
