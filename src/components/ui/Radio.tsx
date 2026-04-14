'use client';

type RadioOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type RadioProps = {
  name: string;
  value: string;
  options: RadioOption[];
  onChange: (value: string) => void;
  direction?: 'horizontal' | 'vertical';
  className?: string;
};

/**
 * Radio button group. Matches the Checkbox gold-accent style.
 *
 * Usage:
 *   <Radio
 *     name="payment"
 *     value={method}
 *     onChange={setMethod}
 *     options={[
 *       { value: 'cash', label: 'Cash' },
 *       { value: 'card', label: 'Card' },
 *     ]}
 *   />
 */
export function Radio({
  name,
  value,
  options,
  onChange,
  direction = 'vertical',
  className = '',
}: RadioProps) {
  return (
    <div
      role="radiogroup"
      className={[
        'flex',
        direction === 'vertical' ? 'flex-col gap-2' : 'flex-wrap gap-3',
        className,
      ].join(' ')}
    >
      {options.map((opt) => {
        const checked = opt.value === value;
        const disabled = opt.disabled ?? false;
        const id = `${name}-${opt.value}`;

        return (
          <label
            key={opt.value}
            htmlFor={id}
            className={[
              'inline-flex cursor-pointer items-center gap-2 text-sm',
              disabled ? 'cursor-not-allowed opacity-40' : '',
            ].join(' ')}
          >
            <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
              <input
                type="radio"
                id={id}
                name={name}
                value={opt.value}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(opt.value)}
                className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <span
                className={[
                  'pointer-events-none flex h-4 w-4 items-center justify-center rounded-full border transition-colors',
                  checked
                    ? 'border-gold-500 bg-gold-500'
                    : 'border-gold-700/60 bg-black/60',
                  disabled
                    ? ''
                    : 'peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-black',
                ].join(' ')}
              >
                {checked && (
                  <span className="h-1.5 w-1.5 rounded-full bg-black" />
                )}
              </span>
            </span>
            <span className="text-gold-100">{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}
