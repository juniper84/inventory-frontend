'use client';

/**
 * MetricStrip — Compact horizontal metric row with mini sparklines.
 * Replaces the bulky 5-card KPI grid at the top of reports.
 */

export type MetricCell = {
  label: string;
  value: string;
  sub?: string;
  trend?: { pct: number; direction: 'up' | 'down' | 'flat' };
  spark?: number[];
  accent?: 'gold' | 'teal' | 'green' | 'red' | 'amber' | 'purple';
};

export type MetricStripProps = {
  metrics: MetricCell[];
  className?: string;
};

const ACCENT_COLORS = {
  gold: '#f6d37a',
  teal: '#2dd4bf',
  green: '#34d399',
  red: '#ef4444',
  amber: '#fbbf24',
  purple: '#a78bfa',
};

export function MetricStrip({ metrics, className = '' }: MetricStripProps) {
  return (
    <div className={`rpt-metric-strip ${className}`}>
      {metrics.map((m, i) => {
        const accent = m.accent ?? 'gold';
        const color = ACCENT_COLORS[accent];
        return (
          <div
            key={`${m.label}-${i}`}
            className="rpt-metric-cell"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="rpt-metric-cell__label">{m.label}</div>
            <div className="rpt-metric-cell__value" style={{ color }}>
              {m.value}
            </div>
            <div className="rpt-metric-cell__footer">
              {m.trend && m.trend.direction !== 'flat' && (
                <span
                  className={`rpt-metric-cell__trend rpt-metric-cell__trend--${m.trend.direction}`}
                >
                  {m.trend.direction === 'up' ? '▲' : '▼'} {Math.abs(m.trend.pct).toFixed(1)}%
                </span>
              )}
              {m.sub && <span className="rpt-metric-cell__sub">{m.sub}</span>}
            </div>
            {m.spark && m.spark.length > 1 && <MiniSpark points={m.spark} color={color} />}
          </div>
        );
      })}
    </div>
  );
}

function MiniSpark({ points, color }: { points: number[]; color: string }) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const path = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * 100;
      const y = 100 - ((p - min) / span) * 80 - 10;
      return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
    })
    .join(' ');
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="rpt-metric-cell__spark"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.7"
      />
    </svg>
  );
}
