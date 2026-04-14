'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import { usePlatformChartTheme } from '@/components/platform/hooks/usePlatformChartTheme';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  ChartTooltip,
  Legend,
);

type Props = {
  monthly: { month: string; collected: number; estimated: number }[];
  labels: { collected: string; estimated: string };
};

export function RevenueChart({ monthly, labels }: Props) {
  const theme = usePlatformChartTheme();

  const chartData = useMemo(
    () => ({
      labels: monthly.map((m) => m.month),
      datasets: [
        {
          label: labels.collected,
          data: monthly.map((m) => m.collected),
          borderColor: theme.series.primary,
          backgroundColor: theme.series.primaryFill,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: labels.estimated,
          data: monthly.map((m) => m.estimated),
          borderColor: theme.series.emerald,
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          fill: false,
          tension: 0.35,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
      ],
    }),
    [monthly, theme, labels],
  );

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          labels: {
            color: theme.fontColor,
            font: { family: theme.fontFamily, size: 11 },
            boxWidth: 12,
            boxHeight: 12,
          },
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          titleColor: theme.tooltipTitleColor,
          bodyColor: theme.tooltipBodyColor,
          padding: 8,
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label ?? ''}: ${formatTzs(ctx.parsed.y ?? 0)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: theme.gridColor, drawTicks: false },
          ticks: { color: theme.tickColor, font: { size: 10 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: theme.gridColor },
          ticks: {
            color: theme.tickColor,
            font: { size: 10 },
            callback: (value: string | number) =>
              formatTzsCompact(Number(value)),
          },
        },
      },
    }),
    [theme],
  );

  return (
    <div className="h-64 w-full">
      <Line data={chartData} options={options} />
    </div>
  );
}

function formatTzs(amount: number): string {
  return `TZS ${amount.toLocaleString()}`;
}

function formatTzsCompact(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return String(amount);
}
