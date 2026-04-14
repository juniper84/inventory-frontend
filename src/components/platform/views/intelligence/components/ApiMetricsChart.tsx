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
import type { ChartOptions, ChartData } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { usePlatformChartTheme } from '@/components/platform/hooks/usePlatformChartTheme';
import type { MetricsSeriesPoint } from '../hooks/useHealthMatrix';

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
  series: MetricsSeriesPoint[];
  showOfflineFailed: boolean;
  showExportsPending: boolean;
  labels: {
    errorRate: string;
    avgLatency: string;
    offlineFailed: string;
    exportsPending: string;
  };
};

/**
 * Dual-axis Chart.js line: error rate (left, %) + latency (right, ms).
 * Optional third/fourth series: offline failures + exports pending.
 * Theme-aware via usePlatformChartTheme (bug fix #10 — replaces hardcoded
 * hex colors with CSS variables through the shared theme hook).
 */
export function ApiMetricsChart({
  series,
  showOfflineFailed,
  showExportsPending,
  labels,
}: Props) {
  const theme = usePlatformChartTheme();

  const chartData: ChartData<'line'> = useMemo(() => {
    const datasets: ChartData<'line'>['datasets'] = [
      {
        label: labels.errorRate,
        data: series.map((p) => p.errorRate * 100),
        borderColor: theme.series.danger,
        backgroundColor: theme.series.dangerFill,
        fill: true,
        tension: 0.3,
        yAxisID: 'yErr',
        pointRadius: 2,
        pointHoverRadius: 4,
      },
      {
        label: labels.avgLatency,
        data: series.map((p) => p.avgLatency),
        borderColor: theme.series.primary,
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.3,
        yAxisID: 'yLat',
        pointRadius: 2,
        pointHoverRadius: 4,
      },
    ];
    if (showOfflineFailed) {
      datasets.push({
        label: labels.offlineFailed,
        data: series.map((p) => p.offlineFailed),
        borderColor: theme.series.warning,
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        fill: false,
        tension: 0.3,
        yAxisID: 'yCount',
        pointRadius: 1,
        pointHoverRadius: 3,
      });
    }
    if (showExportsPending) {
      datasets.push({
        label: labels.exportsPending,
        data: series.map((p) => p.exportsPending),
        borderColor: theme.series.blue,
        backgroundColor: 'transparent',
        borderDash: [2, 3],
        fill: false,
        tension: 0.3,
        yAxisID: 'yCount',
        pointRadius: 1,
        pointHoverRadius: 3,
      });
    }
    return {
      labels: series.map((p) => p.label),
      datasets,
    };
  }, [series, theme, labels, showOfflineFailed, showExportsPending]);

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color: theme.fontColor,
            font: { family: theme.fontFamily, size: 11 },
            boxWidth: 10,
            boxHeight: 10,
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
        yErr: {
          position: 'left',
          beginAtZero: true,
          grid: { color: theme.gridColor },
          ticks: {
            color: theme.tickColor,
            font: { size: 10 },
            callback: (value) => `${Number(value).toFixed(1)}%`,
          },
        },
        yLat: {
          position: 'right',
          beginAtZero: true,
          grid: { display: false },
          ticks: {
            color: theme.tickColor,
            font: { size: 10 },
            callback: (value) => `${Number(value)}ms`,
          },
        },
        ...(showOfflineFailed || showExportsPending
          ? {
              yCount: {
                position: 'right' as const,
                display: false,
                beginAtZero: true,
              },
            }
          : {}),
      },
    }),
    [theme, showOfflineFailed, showExportsPending],
  );

  return (
    <div className="h-72 w-full">
      <Line data={chartData} options={options} />
    </div>
  );
}
