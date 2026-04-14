'use client';

type AnalogToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export function AnalogToggle({
  checked,
  onChange,
  disabled = false,
  className = '',
}: AnalogToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[28px] w-[52px] shrink-0 rounded-full transition-colors duration-300 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${
        checked ? 'bg-[#2a2210]' : 'bg-[#1a1714]'
      } shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
    >
      <span
        className={`absolute top-[3px] left-[3px] h-[22px] w-[22px] rounded-full transition-all duration-300 shadow-[0_2px_6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] ${
          checked
            ? 'translate-x-[24px] bg-gradient-to-br from-[color:var(--accent)] to-[#a08030]'
            : 'translate-x-0 bg-gradient-to-br from-[#555] to-[#333]'
        }`}
      />
    </button>
  );
}
