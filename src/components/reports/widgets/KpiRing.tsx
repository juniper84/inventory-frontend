'use client';

/**
 * KpiRing — Large KPI card with an animated ring gauge, value, and trend.
 * Best for: Revenue, Profit, Stock Health, Cash Outstanding.
 */

export type KpiRingProps = {
  label: string;
  value: string;
  sub?: string;
  percent: number; // 0-100, drives the ring fill
  color?: string;
  trend?: { pct: number; direction: 'up' | 'down' | 'flat' };
  size?: number;
  className?: string;
};

export function KpiRing({
  label,
  value,
  sub,
  percent,
  color = '#f6d37a',
  trend,
  size = 96,
  className = '',
}: KpiRingProps) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - pct / 100);
  const center = size / 2;

  const trendLabel = trend && trend.direction !== 'flat'
    ? `, trending ${trend.direction} ${Math.abs(trend.pct).toFixed(1)} percent`
    : '';
  const ariaLabel = `${label}: ${value}${sub ? `, ${sub}` : ''}, ${Math.round(pct)} percent${trendLabel}`;

  return (
    <div
      className={`rpt-kpi-ring ${className}`}
      role="group"
      aria-label={ariaLabel}
    >
      <div className="rpt-kpi-ring__visual">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="rpt-kpi-ring__svg"
          role="img"
          aria-label={`${Math.round(pct)} percent`}
        >
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={stroke}
            aria-hidden="true"
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
            className="rpt-kpi-ring__arc"
            style={{ filter: `drop-shadow(0 0 8px ${color}44)` }}
          />
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(233,231,226,0.9)"
            fontSize={size * 0.22}
            fontWeight={800}
            fontFamily="inherit"
          >
            {Math.round(pct)}%
          </text>
        </svg>
      </div>
      <div className="rpt-kpi-ring__info">
        <span className="rpt-kpi-ring__label">{label}</span>
        <span className="rpt-kpi-ring__value">{value}</span>
        {sub && <span className="rpt-kpi-ring__sub">{sub}</span>}
        {trend && trend.direction !== 'flat' && (
          <span
            className={`rpt-kpi-ring__trend rpt-kpi-ring__trend--${trend.direction}`}
          >
            {trend.direction === 'up' ? '▲' : '▼'} {Math.abs(trend.pct).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
