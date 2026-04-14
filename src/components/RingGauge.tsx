'use client';

export function RingGauge({
  value,
  max = 100,
  size = 72,
  stroke = 6,
  color = 'var(--gold, #f6d37a)',
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value / Math.max(max, 1), 0), 1);
  const offset = circumference * (1 - pct);
  const displayPct = Math.round(pct * 100);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={stroke}
      />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
        style={{
          transition: 'stroke-dashoffset 1.2s ease-out',
        }}
      />
      <text
        x={center}
        y={center}
        textAnchor="middle"
        dominantBaseline="central"
        fill="rgba(233,231,226,0.9)"
        fontSize={size * 0.18}
        fontWeight={700}
      >
        {label ?? `${displayPct}%`}
      </text>
    </svg>
  );
}
