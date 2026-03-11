type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
};

export function Checkbox({ checked, onChange, disabled = false, id }: CheckboxProps) {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        className={[
          'pointer-events-none flex h-4 w-4 items-center justify-center rounded transition-colors',
          checked
            ? 'border border-gold-500 bg-gold-500'
            : 'border border-gold-700/60 bg-black/60',
          disabled ? 'opacity-40' : 'peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-black',
        ].join(' ')}
      >
        {checked && (
          <svg viewBox="0 0 10 8" fill="none" className="h-2.5 w-2.5" aria-hidden>
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="black"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </span>
  );
}
