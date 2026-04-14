'use client';

import { ReactNode } from 'react';

/**
 * TrendCard — Sparkline line chart with a label and optional value overlay.
 * Self-contained SVG (no Chart.js) for performance.
 */

export type TrendCardProps = {
  title: string;
  badge?: string;
  points: number[];
  color?: string;
  height?: number;
  children?: ReactNode; // extra content below chart
  className?: string;
};

export function TrendCard({
  title,
  badge,
  points,
  color = '#f6d37a',
  height = 140,
  children,
  className = '',
}: TrendCardProps) {
  const safe = points.length ? points : [0, 0, 0, 0, 0];
  const max = Math.max(...safe, 1);
  const min = Math.min(...safe, 0);
  const span = Math.max(max - min, 1);
  const coords = safe.map((p, i) => ({
    x: (i / Math.max(safe.length - 1, 1)) * 100,
    y: 100 - ((p - min) / span) * 100,
  }));
  const linePath = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const last = coords[coords.length - 1];
  const first = coords[0];
  const areaPath = `${linePath} L ${last.x},100 L ${first.x},100 Z`;
  const gradientId = `trend-grad-${color.replace('#', '')}`;

  const titleId = `rpt-trend-${title.replace(/\s+/g, '-').toLowerCase()}`;
  const startVal = safe[0] ?? 0;
  const endVal = safe[safe.length - 1] ?? 0;
  const direction =
    endVal > startVal ? 'rising' : endVal < startVal ? 'falling' : 'flat';
  const summary = `${title} sparkline, ${safe.length} data points, ${direction} from ${startVal} to ${endVal}`;
  return (
    <section className={`rpt-trend ${className}`} aria-labelledby={titleId}>
      <div className="rpt-trend__header">
        <h3 id={titleId} className="rpt-trend__title">{title}</h3>
        {badge && <span className="rpt-trend__badge" aria-hidden="true">{badge}</span>}
      </div>
      <div className="rpt-trend__chart" style={{ height }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="rpt-trend__svg"
          role="img"
          aria-label={summary}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="rpt-trend__line"
          />
          {/* End dot */}
          <circle
            cx={last.x}
            cy={last.y}
            r="1.2"
            fill={color}
            className="rpt-trend__dot"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      {children}
    </section>
  );
}
