'use client';

type MetricComparisonProps = {
  oldValue: number | string;
  newValue: number | string;
  label?: string;
  format?: (value: number | string) => string;
  className?: string;
};

export function MetricComparison({
  oldValue,
  newValue,
  label,
  format,
  className = '',
}: MetricComparisonProps) {
  const display = (v: number | string) => (format ? format(v) : String(v));
  const oldNum = typeof oldValue === 'number' ? oldValue : parseFloat(oldValue) || 0;
  const newNum = typeof newValue === 'number' ? newValue : parseFloat(newValue) || 0;
  const diff = newNum - oldNum;
  const isUp = diff > 0;
  const isDown = diff < 0;
  const isEqual = diff === 0;

  return (
    <div className={`inline-flex items-center gap-2 text-sm ${className}`}>
      {label ? <span className="text-[color:var(--muted)] text-xs">{label}</span> : null}
      <span className="text-[color:var(--muted)] line-through opacity-60">{display(oldValue)}</span>
      <span className={`text-base ${isEqual ? 'text-[color:var(--muted)]' : ''}`}>→</span>
      <span
        className={`font-semibold ${
          isUp
            ? 'text-emerald-400'
            : isDown
              ? 'text-red-400'
              : 'text-[color:var(--foreground)]'
        }`}
      >
        {display(newValue)}
      </span>
      {!isEqual ? (
        <span
          className={`text-xs font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {isUp ? '▲' : '▼'} {format ? format(Math.abs(diff)) : Math.abs(diff).toLocaleString()}
        </span>
      ) : null}
    </div>
  );
}
