'use client';

type ProgressBarProps = {
  value: number;
  max: number;
  label?: string;
  showPercent?: boolean;
  showValue?: boolean;
  formatValue?: (value: number, max: number) => string;
  color?: 'accent' | 'green' | 'red' | 'amber' | 'blue';
  height?: number;
  className?: string;
};

const colorMap = {
  accent: 'bg-[color:var(--accent)]',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
};

export function ProgressBar({
  value,
  max,
  label,
  showPercent = false,
  showValue = false,
  formatValue,
  color = 'accent',
  height = 8,
  className = '',
}: ProgressBarProps) {
  const percent = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  const fillColor = colorMap[color];

  return (
    <div className={className}>
      {(label || showPercent || showValue) ? (
        <div className="flex items-center justify-between mb-1">
          {label ? <span className="text-xs text-[color:var(--muted)] truncate">{label}</span> : <span />}
          <span className="text-xs font-medium text-[color:var(--foreground)] shrink-0">
            {formatValue ? formatValue(value, max) : showValue ? `${value.toLocaleString()} / ${max.toLocaleString()}` : null}
            {showPercent ? `${percent}%` : null}
          </span>
        </div>
      ) : null}
      <div
        className="w-full rounded-full overflow-hidden bg-[color:var(--border)]"
        style={{ height }}
      >
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${fillColor}`}
          style={{ width: `${Math.max(percent, 1)}%` }}
        />
      </div>
    </div>
  );
}
