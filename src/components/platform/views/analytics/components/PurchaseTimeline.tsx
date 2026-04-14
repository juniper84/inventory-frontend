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
import type { PurchaseItem } from '../hooks/useAnalytics';

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTooltip, Legend);

type Props = {
  purchases: PurchaseItem[];
  labels: { volume: string; revenue: string };
};

/**
 * Monthly bar chart: purchase volume + collected revenue over the last 12 months.
 * Uses theme-aware colors from usePlatformChartTheme.
 */
export function PurchaseTimeline({ purchases, labels }: Props) {
  const theme = usePlatformChartTheme();

  const months = useMemo(() => {
    const now = new Date();
    const arr: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push(d.toISOString().slice(0, 7));
    }
    return arr;
  }, []);

  const { volumeByMonth, revenueByMonth } = useMemo(() => {
    const vol = new Map<string, number>();
    const rev = new Map<string, number>();
    for (const p of purchases) {
      const key = p.createdAt.slice(0, 7);
      vol.set(key, (vol.get(key) ?? 0) + 1);
      if (p.isPaid) {
        rev.set(key, (rev.get(key) ?? 0) + p.amountDue);
      }
    }
    return { volumeByMonth: vol, revenueByMonth: rev };
  }, [purchases]);

  const chartData = useMemo(
    () => ({
      labels: months,
      datasets: [
        {
          label: labels.volume,
          data: months.map((m) => volumeByMonth.get(m) ?? 0),
          backgroundColor: theme.series.blue,
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: labels.revenue,
          data: months.map((m) => revenueByMonth.get(m) ?? 0),
          backgroundColor: theme.series.primary,
          borderRadius: 4,
          yAxisID: 'y1',
        },
      ],
    }),
    [months, volumeByMonth, revenueByMonth, theme, labels],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
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
          position: 'left' as const,
          beginAtZero: true,
          grid: { color: theme.gridColor },
          ticks: { color: theme.tickColor, font: { size: 10 } },
        },
        y1: {
          position: 'right' as const,
          beginAtZero: true,
          grid: { display: false },
          ticks: {
            color: theme.tickColor,
            font: { size: 10 },
            callback: (value: string | number) => {
              const n = Number(value);
              if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
              if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
              return String(n);
            },
          },
        },
      },
    }),
    [theme],
  );

  return (
    <div className="h-64 w-full">
      <Bar data={chartData} options={options} />
    </div>
  );
}
