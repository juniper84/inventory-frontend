'use client';

import type { SlowEndpoint } from '../hooks/useHealthMatrix';

type Props = {
  endpoint: SlowEndpoint;
  max: number;
  t: (key: string, values?: Record<string, string | number>) => string;
};

function latencyColor(ms: number): string {
  if (ms < 200) return 'bg-emerald-500/60';
  if (ms < 500) return 'bg-amber-500/60';
  return 'bg-red-500/60';
}

function latencyText(ms: number): string {
  if (ms < 200) return 'text-emerald-400';
  if (ms < 500) return 'text-amber-400';
  return 'text-red-400';
}

/**
 * Visual performance bar for slow endpoints — p95/p99/avg as colored bars.
 * Replaces the text-only leaderboard.
 */
export function LatencyBar({ endpoint, max, t }: Props) {
  const avgPct = Math.min(100, (endpoint.avgDurationMs / max) * 100);
  const p95Pct = Math.min(100, (endpoint.p95DurationMs / max) * 100);
  const p99Pct = Math.min(100, (endpoint.p99DurationMs / max) * 100);

  return (
    <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2">
      <div className="flex items-center justify-between text-[10px]">
        <span
          className="font-mono text-[var(--pt-text-1)] truncate"
          title={endpoint.path}
        >
          {endpoint.path}
        </span>
        <span className="text-[var(--pt-text-muted)]">
          {endpoint.count} {t('latencyRequests')}
        </span>
      </div>
      <div className="mt-1.5 space-y-1">
        {[
          { key: 'avg', ms: endpoint.avgDurationMs, pct: avgPct },
          { key: 'p95', ms: endpoint.p95DurationMs, pct: p95Pct },
          { key: 'p99', ms: endpoint.p99DurationMs, pct: p99Pct },
        ].map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span className="w-8 text-[9px] uppercase text-[var(--pt-text-muted)] tabular-nums">
              {row.key}
            </span>
            <div className="h-2 flex-1 rounded bg-white/[0.04]">
              <div
                className={`h-2 rounded ${latencyColor(row.ms)} transition-[width]`}
                style={{ width: `${row.pct}%` }}
              />
            </div>
            <span
              className={`w-14 text-right text-[10px] font-semibold tabular-nums ${latencyText(row.ms)}`}
            >
              {row.ms}ms
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
