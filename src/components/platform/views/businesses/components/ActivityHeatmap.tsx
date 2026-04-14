'use client';

import { useMemo, useState } from 'react';

export type HeatmapDay = {
  date: string;
  count: number;
};

type Props = {
  data: HeatmapDay[];
  totalActivity?: number;
  peakDay?: { date: string; count: number };
};

/**
 * GitHub-style calendar heatmap.
 * 7 rows (days of week) × ~13 columns (weeks) for ~90 days.
 * Color intensity scales with activity volume.
 */
export function ActivityHeatmap({ data, totalActivity, peakDay }: Props) {
  const [hovered, setHovered] = useState<{ day: HeatmapDay; x: number; y: number } | null>(null);

  // Compute the color buckets — 5 levels using log scale for skewed distributions
  const maxCount = useMemo(() => {
    return data.reduce((max, d) => (d.count > max ? d.count : max), 0);
  }, [data]);

  const getLevel = (count: number): 0 | 1 | 2 | 3 | 4 => {
    if (count === 0) return 0;
    if (maxCount === 0) return 0;
    const ratio = count / maxCount;
    if (ratio <= 0.1) return 1;
    if (ratio <= 0.3) return 2;
    if (ratio <= 0.6) return 3;
    return 4;
  };

  // Build the grid: each column is a week (Sunday-Saturday)
  // Pad start of first week with empty cells if needed
  const grid = useMemo(() => {
    if (data.length === 0) return [];
    const firstDate = new Date(data[0].date + 'T00:00:00Z');
    const firstDow = firstDate.getUTCDay(); // 0=Sun .. 6=Sat
    const cells: (HeatmapDay | null)[] = [];
    // Pad with nulls to align first day with its weekday row
    for (let i = 0; i < firstDow; i++) cells.push(null);
    cells.push(...data);
    // Pad end so we end on Saturday
    while (cells.length % 7 !== 0) cells.push(null);

    // Reshape to columns of 7
    const weeks: (HeatmapDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }, [data]);

  const cellSize = 11;
  const cellGap = 2;
  const weekWidth = cellSize + cellGap;
  const totalWidth = grid.length * weekWidth;
  const totalHeight = 7 * weekWidth;

  // Color levels — gold/amber palette matching the platform theme
  const levelColors = [
    'rgba(255,255,255,0.04)', // 0 — empty
    'rgba(245,158,11,0.18)',  // 1 — low
    'rgba(245,158,11,0.40)',  // 2 — medium-low
    'rgba(245,158,11,0.65)',  // 3 — medium-high
    'rgba(245,158,11,0.95)',  // 4 — high
  ];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg
          width={totalWidth}
          height={totalHeight}
          viewBox={`0 0 ${totalWidth} ${totalHeight}`}
          className="overflow-visible"
          aria-label="Activity heatmap"
        >
          {grid.map((week, wIdx) =>
            week.map((day, dIdx) => {
              if (!day) return null;
              const level = getLevel(day.count);
              const x = wIdx * weekWidth;
              const y = dIdx * weekWidth;
              return (
                <rect
                  key={`${wIdx}-${dIdx}`}
                  x={x}
                  y={y}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  fill={levelColors[level]}
                  className="transition-opacity"
                  onMouseEnter={(e) => {
                    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
                    setHovered({ day, x: rect.left + rect.width / 2, y: rect.top });
                  }}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: 'pointer' }}
                />
              );
            }),
          )}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none fixed z-50 rounded-md border border-[var(--pt-accent-border)] bg-[var(--pt-bg-surface)] px-2 py-1 text-[10px] text-[var(--pt-text-1)] shadow-lg"
            style={{
              left: hovered.x,
              top: hovered.y - 28,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="font-semibold">{formatDate(hovered.day.date)}</div>
            <div className="text-[var(--pt-text-muted)]">
              {hovered.day.count} {hovered.day.count === 1 ? 'event' : 'events'}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[9px] text-[var(--pt-text-muted)]">
        <div className="flex items-center gap-3">
          {totalActivity !== undefined && (
            <span>
              <strong className="text-[var(--pt-text-2)]">{totalActivity.toLocaleString()}</strong> events
            </span>
          )}
          {peakDay && peakDay.count > 0 && (
            <span>
              Peak: <strong className="text-[var(--pt-text-2)]">{peakDay.count}</strong> on {formatDate(peakDay.date)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((lvl) => (
            <span
              key={lvl}
              className="inline-block h-[10px] w-[10px] rounded-sm"
              style={{ background: levelColors[lvl] }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
