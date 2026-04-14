'use client';

import { useState, useMemo } from 'react';

type Cohort = {
  month: string;
  count: number;
  byTier: Record<string, number>;
  active: number;
};

type Props = {
  cohorts: Cohort[];
  t: (key: string, values?: Record<string, string | number>) => string;
};

/**
 * Cohort retention heatmap. Rows = signup months (newest first).
 * Column is a single "retention %" cell (active / total signups).
 * Color intensity scales with retention — dark for low, bright amber for high.
 */
export function CohortHeatmap({ cohorts, t }: Props) {
  const [hovered, setHovered] = useState<Cohort | null>(null);

  const sorted = useMemo(
    () => [...cohorts].slice().reverse(), // oldest → newest for heatmap top-bottom
    [cohorts],
  );

  if (sorted.length === 0) {
    return (
      <p className="text-xs text-[var(--pt-text-muted)] italic">
        {t('cohortsEmptyHint')}
      </p>
    );
  }

  const cellWidth = 120;
  const cellHeight = 22;
  const maxCount = Math.max(...sorted.map((c) => c.count));

  return (
    <div className="space-y-2">
      <svg
        width="100%"
        height={sorted.length * (cellHeight + 2) + 20}
        viewBox={`0 0 ${cellWidth + 180} ${sorted.length * (cellHeight + 2) + 20}`}
        preserveAspectRatio="xMinYMin meet"
      >
        {/* Header row */}
        <text
          x="0"
          y="12"
          fontSize="10"
          fill="var(--pt-text-muted)"
          fontFamily="'Space Grotesk', system-ui, sans-serif"
          style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
        >
          {t('cohortsHeaderMonth')}
        </text>
        <text
          x="110"
          y="12"
          fontSize="10"
          fill="var(--pt-text-muted)"
          fontFamily="'Space Grotesk', system-ui, sans-serif"
          style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
        >
          {t('cohortsHeaderSignups')}
        </text>
        <text
          x="200"
          y="12"
          fontSize="10"
          fill="var(--pt-text-muted)"
          fontFamily="'Space Grotesk', system-ui, sans-serif"
          style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
        >
          {t('cohortsHeaderRetention')}
        </text>

        {sorted.map((cohort, i) => {
          const retention =
            cohort.count > 0 ? (cohort.active / cohort.count) * 100 : 0;
          const intensity = retention / 100;
          const fill = getColor(intensity);
          const y = 20 + i * (cellHeight + 2);
          const widthPct = Math.max(4, Math.round(retention));

          return (
            <g
              key={cohort.month}
              onMouseEnter={() => setHovered(cohort)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default' }}
            >
              <text
                x="0"
                y={y + 15}
                fontSize="11"
                fill="var(--pt-text-1)"
                fontFamily="'Space Grotesk', system-ui, sans-serif"
              >
                {cohort.month}
              </text>
              <text
                x="110"
                y={y + 15}
                fontSize="11"
                fill="var(--pt-text-2)"
                fontFamily="'Space Grotesk', system-ui, sans-serif"
              >
                {cohort.count}
              </text>
              <rect
                x="200"
                y={y + 4}
                width={widthPct}
                height={cellHeight - 8}
                rx="2"
                fill={fill}
              />
              <text
                x={200 + widthPct + 6}
                y={y + 15}
                fontSize="10"
                fill="var(--pt-text-muted)"
                fontFamily="'Space Grotesk', system-ui, sans-serif"
              >
                {retention.toFixed(0)}%
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hovered && (
        <div className="rounded-lg border border-[var(--pt-accent-border)] bg-[var(--pt-bg-surface)] p-2 text-[10px]">
          <p className="font-semibold text-[var(--pt-text-1)]">
            {hovered.month}
          </p>
          <p className="text-[var(--pt-text-2)]">
            {t('cohortsTooltipSignups', { count: hovered.count })} •{' '}
            {t('cohortsTooltipActive', { count: hovered.active })}
          </p>
          {Object.keys(hovered.byTier).length > 0 && (
            <p className="text-[var(--pt-text-muted)]">
              {Object.entries(hovered.byTier)
                .map(([tier, count]) => `${tier}: ${count}`)
                .join(' • ')}
            </p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-2 text-[10px] text-[var(--pt-text-muted)]">
        <span>{t('cohortsLegendLess')}</span>
        <div className="flex gap-px">
          {[0.1, 0.3, 0.5, 0.7, 1.0].map((v) => (
            <span
              key={v}
              className="inline-block h-2 w-4"
              style={{ background: getColor(v) }}
            />
          ))}
        </div>
        <span>{t('cohortsLegendMore')}</span>
      </div>
    </div>
  );
}

function getColor(intensity: number): string {
  // Gold/amber gradient from dim to bright
  if (intensity <= 0) return 'rgba(201,168,76,0.05)';
  if (intensity < 0.25) return 'rgba(201,168,76,0.25)';
  if (intensity < 0.5) return 'rgba(201,168,76,0.5)';
  if (intensity < 0.75) return 'rgba(201,168,76,0.75)';
  return 'rgba(201,168,76,1)';
}
