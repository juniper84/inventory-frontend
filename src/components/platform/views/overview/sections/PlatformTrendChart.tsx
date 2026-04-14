'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip as ChartTooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Card } from '@/components/ui/Card';
import { usePlatformChartTheme } from '@/components/platform/hooks/usePlatformChartTheme';
import { ArrowRight } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, ChartTooltip);

type SeriesPoint = {
  label: string;
  errorRate: number;
  avgLatency: number;
  offlineFailed: number;
  exportsPending: number;
};

type Props = {
  series: SeriesPoint[];
  totalRequests?: number;
};

export function PlatformTrendChart({ series, totalRequests }: Props) {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();
  const theme = usePlatformChartTheme();

  const chartData = useMemo(() => {
    const labels = series.map((s) => {
      const d = new Date(s.label);
      return `${d.getHours().toString().padStart(2, '0')}:00`;
    });

    return {
      labels,
      datasets: [
        {
          label: t('overviewTrendErrorRate'),
          data: series.map((s) => s.errorRate * 100),
          borderColor: theme.series.danger,
          backgroundColor: theme.series.dangerFill,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5,
          yAxisID: 'y',
        },
        {
          label: t('overviewTrendLatency'),
          data: series.map((s) => s.avgLatency),
          borderColor: theme.series.primary,
          backgroundColor: theme.series.primaryFill,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5,
          yAxisID: 'y1',
        },
      ],
    };
  }, [series, theme, t]);

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
          titleFont: { family: theme.fontFamily, size: 11 },
          bodyFont: { family: theme.fontFamily, size: 10 },
          padding: 8,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { color: 'transparent' },
          ticks: { color: theme.tickColor, font: { family: theme.fontFamily, size: 9 }, maxTicksLimit: 6 },
        },
        y: {
          position: 'left' as const,
          grid: { color: theme.gridColor },
          ticks: { color: theme.tickColor, font: { family: theme.fontFamily, size: 9 }, callback: (v: number | string) => `${v}%` },
          title: { display: false },
        },
        y1: {
          position: 'right' as const,
          grid: { drawOnChartArea: false },
          ticks: { color: theme.tickColor, font: { family: theme.fontFamily, size: 9 }, callback: (v: number | string) => `${v}ms` },
          title: { display: false },
        },
      },
    }),
    [theme],
  );

  // Derived stats
  const peakErrorRate = series.length ? Math.max(...series.map((s) => s.errorRate * 100)) : 0;
  const peakLatency = series.length ? Math.max(...series.map((s) => s.avgLatency)) : 0;
  const requestsTotal = totalRequests ?? 0;

  if (!series.length) return null;

  return (
    <Card padding="lg" className="nvi-slide-in-bottom">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-muted)]">
          {t('overviewTrendTitle')}
        </p>
        <div className="flex gap-3 text-[9px] text-[var(--pt-text-muted)]">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-3 rounded-full" style={{ background: theme.series.danger }} /> {t('overviewTrendErrorRate')}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-3 rounded-full" style={{ background: theme.series.primary }} /> {t('overviewTrendLatency')}
          </span>
        </div>
      </div>

      <div className="h-[160px]">
        <Line data={chartData} options={chartOptions} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-[10px] text-[var(--pt-text-muted)]">{t('overviewTrendPeakError')}</p>
          <p className="text-sm font-bold text-red-400">{peakErrorRate.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--pt-text-muted)]">{t('overviewTrendPeakLatency')}</p>
          <p className="text-sm font-bold text-[var(--pt-accent)]">{Math.round(peakLatency)}ms</p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--pt-text-muted)]">{t('overviewTrendTotalRequests')}</p>
          <p className="text-sm font-bold text-[var(--pt-text-1)]">{requestsTotal.toLocaleString()}</p>
        </div>
      </div>

      <Link
        href={`/${params.locale}/platform/intelligence`}
        className="mt-3 flex items-center justify-center gap-1 text-[10px] text-[var(--pt-accent)] hover:underline nvi-press"
      >
        {t('overviewTrendViewFull')} <ArrowRight size={10} />
      </Link>
    </Card>
  );
}
