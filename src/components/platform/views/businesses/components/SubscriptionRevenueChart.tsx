'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { usePlatformChartTheme } from '@/components/platform/hooks/usePlatformChartTheme';

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTooltip, Legend);

export type RevenuePurchase = {
  id: string;
  tier: string;
  months: number;
  durationDays: number;
  startsAt: string;
  expiresAt: string;
  isPaid: boolean;
  amountDue: number;
  reason?: string | null;
  createdAt: string;
};

type Props = {
  purchases: RevenuePurchase[];
};

const TIER_COLORS: Record<string, string> = {
  STARTER: '#f59e0b',
  BUSINESS: '#3b82f6',
  ENTERPRISE: '#eab308',
};

/**
 * Per-business subscription payment timeline.
 * X-axis = chronological purchase events. Y-axis = amount paid.
 * Bars colored by tier. Complimentary purchases shown as striped (lighter opacity).
 * Gaps between consecutive payments highlighted in the meta footer.
 */
export function SubscriptionRevenueChart({ purchases }: Props) {
  const theme = usePlatformChartTheme();

  // Sort chronologically
  const sorted = useMemo(
    () => [...purchases].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [purchases],
  );

  // Compute biggest gap between consecutive payments (days)
  const maxGapDays = useMemo(() => {
    if (sorted.length < 2) return 0;
    let max = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].createdAt).getTime();
      const cur = new Date(sorted[i].createdAt).getTime();
      const gap = Math.floor((cur - prev) / (1000 * 60 * 60 * 24));
      if (gap > max) max = gap;
    }
    return max;
  }, [sorted]);

  const totalCollected = sorted
    .filter((p) => p.isPaid)
    .reduce((sum, p) => sum + p.amountDue, 0);
  const paidCount = sorted.filter((p) => p.isPaid).length;
  const compCount = sorted.length - paidCount;

  const chartData = useMemo(
    () => ({
      labels: sorted.map((p) => {
        const d = new Date(p.createdAt);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
      }),
      datasets: [
        {
          label: 'Payment',
          data: sorted.map((p) => (p.isPaid ? p.amountDue : 0)),
          backgroundColor: sorted.map((p) => {
            const color = TIER_COLORS[p.tier] ?? theme.series.primary;
            // Complimentary purchases: lighter opacity to visually distinguish
            return p.isPaid ? color : `${color}40`;
          }),
          borderColor: sorted.map((p) => TIER_COLORS[p.tier] ?? theme.series.primary),
          borderWidth: sorted.map((p) => (p.isPaid ? 0 : 2)),
          // Stripe pattern for complimentary via dashed border
          borderDash: sorted.map((p) => (p.isPaid ? [] : [3, 3])),
          borderRadius: 3,
        },
      ],
    }),
    [sorted, theme],
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          titleColor: theme.tooltipTitleColor,
          bodyColor: theme.tooltipBodyColor,
          padding: 8,
          cornerRadius: 8,
          callbacks: {
            label: (ctx: { dataIndex: number }) => {
              const p = sorted[ctx.dataIndex];
              const lines: string[] = [];
              lines.push(`${p.tier} · ${p.months} ${p.months === 1 ? 'month' : 'months'}`);
              if (p.isPaid) {
                lines.push(`${p.amountDue.toLocaleString()} TZS (paid)`);
              } else {
                lines.push('Complimentary');
              }
              return lines;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'transparent' },
          ticks: {
            color: theme.tickColor,
            font: { family: theme.fontFamily, size: 9 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: theme.gridColor },
          ticks: {
            color: theme.tickColor,
            font: { family: theme.fontFamily, size: 9 },
            callback: (v: number | string) => {
              const n = typeof v === 'string' ? parseFloat(v) : v;
              if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
              if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
              return String(n);
            },
          },
        },
      },
    }),
    [theme, sorted],
  );

  if (sorted.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-[var(--pt-text-muted)]">
        No purchase history to chart.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-[180px]">
        <Bar data={chartData} options={chartOptions} />
      </div>

      {/* Tier legend */}
      <div className="flex flex-wrap items-center gap-3 text-[9px] text-[var(--pt-text-muted)]">
        {Object.entries(TIER_COLORS).map(([tier, color]) => (
          <span key={tier} className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm" style={{ background: color }} />
            {tier}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm border border-dashed border-[var(--pt-text-muted)]" />
          Complimentary
        </span>
      </div>

      {/* Stats footer */}
      <div className="grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-2 text-center">
        <div>
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">Total collected</p>
          <p className="text-sm font-bold text-emerald-400 tabular-nums">
            {totalCollected.toLocaleString()} TZS
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">Payments</p>
          <p className="text-sm font-bold text-[var(--pt-text-1)] tabular-nums">
            {paidCount}
            {compCount > 0 && (
              <span className="text-[9px] text-blue-400 ml-1">+{compCount} comp</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">Largest gap</p>
          <p className={`text-sm font-bold tabular-nums ${maxGapDays > 90 ? 'text-red-400' : 'text-[var(--pt-text-1)]'}`}>
            {maxGapDays}d
          </p>
        </div>
      </div>
    </div>
  );
}
