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
  monthlyChurn: { month: string; count: number; rate: number }[];
  label: string;
};

/**
 * Churn trend line with threshold color zones.
 * Green < 2%, amber 2-5%, red > 5%.
 * Point colors reflect the threshold for the given month.
 */
export function ChurnTrendChart({ monthlyChurn, label }: Props) {
  const theme = usePlatformChartTheme();

  const pointColors = useMemo(
    () =>
      monthlyChurn.map((m) =>
        m.rate >= 5
          ? theme.series.danger
          : m.rate >= 2
            ? theme.series.warning
            : theme.series.emerald,
      ),
    [monthlyChurn, theme],
  );

  const chartData = useMemo(
    () => ({
      labels: monthlyChurn.map((m) => m.month),
      datasets: [
        {
          label,
          data: monthlyChurn.map((m) => m.rate),
          borderColor: theme.series.warning,
          backgroundColor: theme.series.warningFill,
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
        },
      ],
    }),
    [monthlyChurn, pointColors, theme, label],
  );

  const options: ChartOptions<'line'> = useMemo(
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
          callbacks: {
            label: (ctx) => {
              const m = monthlyChurn[ctx.dataIndex];
              return m ? `${m.rate}% (${m.count} churned)` : '';
            },
          },
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
          ticks: {
            color: theme.tickColor,
            font: { size: 10 },
            callback: (value: string | number) => `${Number(value).toFixed(1)}%`,
          },
        },
      },
    }),
    [theme, monthlyChurn],
  );

  return (
    <div className="h-64 w-full">
      <Line data={chartData} options={options} />
    </div>
  );
}
