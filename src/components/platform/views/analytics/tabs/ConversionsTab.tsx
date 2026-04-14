'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  UserPlus,
  Clock,
  BarChart3,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePlatformChartTheme } from '@/components/platform/hooks/usePlatformChartTheme';
import { ConversionFunnel } from '../components/ConversionFunnel';
import type { ConversionsData } from '../hooks/useAnalytics';

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTooltip, Legend);

type Props = {
  data: ConversionsData | null;
  isLoading: boolean;
};

export function ConversionsTab({ data, isLoading }: Props) {
  const t = useTranslations('platformConsole');
  const theme = usePlatformChartTheme();

  const monthlyChartData = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.monthlyConversions.map((m) => m.month),
      datasets: [
        {
          label: t('conversionsMonthlyTrialsLabel'),
          data: data.monthlyConversions.map((m) => m.trialsStarted),
          backgroundColor: theme.series.blueFill,
          borderColor: theme.series.blue,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: t('conversionsMonthlyConvertedLabel'),
          data: data.monthlyConversions.map((m) => m.conversions),
          backgroundColor: theme.series.emeraldFill,
          borderColor: theme.series.emerald,
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    };
  }, [data, theme, t]);

  const monthlyOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: theme.fontColor,
            font: { family: theme.fontFamily, size: 11 },
          },
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          titleColor: theme.tooltipTitleColor,
          bodyColor: theme.tooltipBodyColor,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: theme.tickColor, font: { size: 10 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: theme.gridColor },
          ticks: { color: theme.tickColor, font: { size: 10 } },
        },
      },
    }),
    [theme],
  );

  // Trial duration histogram buckets
  const histogramBuckets = useMemo(() => {
    if (!data?.trialDurationDistribution) return [];
    const buckets = [
      { label: '0-7', min: 0, max: 7, count: 0 },
      { label: '8-14', min: 8, max: 14, count: 0 },
      { label: '15-21', min: 15, max: 21, count: 0 },
      { label: '22-30', min: 22, max: 30, count: 0 },
      { label: '31+', min: 31, max: Infinity, count: 0 },
    ];
    for (const d of data.trialDurationDistribution) {
      const b = buckets.find((x) => d >= x.min && d <= x.max);
      if (b) b.count++;
    }
    return buckets;
  }, [data]);

  if (isLoading && !data) {
    return (
      <div className="space-y-3 nvi-stagger">
        <div className="h-48 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
        <div className="h-64 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={<UserPlus size={28} className="text-[var(--pt-text-muted)]" />}
        title={t('conversionsEmptyTitle')}
        description={t('conversionsEmptyHint')}
      />
    );
  }

  const maxHistCount = Math.max(1, ...histogramBuckets.map((b) => b.count));

  return (
    <div className="space-y-4 nvi-stagger">
      {/* Stats grid */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card padding="md" className="nvi-slide-in-bottom">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
            {t('conversionsRate')}
          </p>
          <p className="mt-1 text-xl font-bold text-emerald-400">
            {data.conversionRate}%
          </p>
        </Card>
        <Card padding="md" className="nvi-slide-in-bottom">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
            {t('conversionsTotal')}
          </p>
          <p className="mt-1 text-xl font-bold text-[var(--pt-text-1)]">
            {data.totalConversions}
          </p>
        </Card>
        <Card padding="md" className="nvi-slide-in-bottom">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
            {t('conversionsAvgTrial')}
          </p>
          <p className="mt-1 text-xl font-bold text-[var(--pt-text-1)]">
            {data.avgTrialDays ?? '—'}
            {data.avgTrialDays ? (
              <span className="text-[10px] ml-1 text-[var(--pt-text-muted)]">
                {t('conversionsDaysUnit')}
              </span>
            ) : null}
          </p>
        </Card>
        <Card padding="md" className="nvi-slide-in-bottom">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
            {t('conversionsMedianTrial')}
          </p>
          <p className="mt-1 text-xl font-bold text-[var(--pt-text-1)]">
            {data.medianTrialDays ?? '—'}
            {data.medianTrialDays ? (
              <span className="text-[10px] ml-1 text-[var(--pt-text-muted)]">
                {t('conversionsDaysUnit')}
              </span>
            ) : null}
          </p>
        </Card>
      </div>

      {/* Funnel */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <UserPlus size={14} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
              {t('conversionsFunnelTitle')}
            </h3>
            <p className="text-[10px] text-[var(--pt-text-muted)]">
              {t('conversionsFunnelHint')}
            </p>
          </div>
        </div>
        <ConversionFunnel
          funnel={data.funnel}
          t={(key, values) => t(key, values)}
        />
      </Card>

      {/* Monthly trend */}
      {monthlyChartData && (
        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <BarChart3 size={14} className="text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
              {t('conversionsMonthlyTitle')}
            </h3>
          </div>
          <div className="h-64 w-full">
            <Bar data={monthlyChartData} options={monthlyOptions} />
          </div>
        </Card>
      )}

      {/* Trial duration histogram */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
            <Clock size={14} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
              {t('conversionsDurationTitle')}
            </h3>
            <p className="text-[10px] text-[var(--pt-text-muted)]">
              {t('conversionsDurationHint')}
            </p>
          </div>
        </div>
        {histogramBuckets.every((b) => b.count === 0) ? (
          <p className="text-xs text-[var(--pt-text-muted)] italic">
            {t('conversionsDurationEmpty')}
          </p>
        ) : (
          <div className="space-y-1.5">
            {histogramBuckets.map((b) => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="w-12 text-[10px] text-[var(--pt-text-muted)] tabular-nums">
                  {b.label}d
                </span>
                <div className="h-4 flex-1 rounded-md bg-white/[0.03]">
                  <div
                    className="h-4 rounded-md bg-amber-500/70 transition-[width]"
                    style={{ width: `${(b.count / maxHistCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-[10px] font-semibold text-[var(--pt-text-1)] tabular-nums">
                  {b.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
