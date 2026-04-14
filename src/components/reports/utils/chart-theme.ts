/**
 * Shared Chart.js theme for all report widgets.
 * Keeps colors, tooltips, grids, and fonts consistent.
 */

export const CHART_COLORS = {
  gold: '#f6d37a',
  goldDark: '#e6a23c',
  teal: '#2dd4bf',
  green: '#34d399',
  red: '#ef4444',
  amber: '#fbbf24',
  blue: '#60a5fa',
  purple: '#a78bfa',
  muted: 'rgba(167,163,160,0.4)',
} as const;

export const CHART_PALETTE: string[] = [
  CHART_COLORS.gold,
  CHART_COLORS.teal,
  CHART_COLORS.purple,
  CHART_COLORS.green,
  CHART_COLORS.amber,
  CHART_COLORS.blue,
  CHART_COLORS.red,
];

/** Create a vertical gradient for chart fills */
export function makeAreaGradient(
  ctx: CanvasRenderingContext2D,
  color: string,
  height: number,
) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, hexToRgba(color, 0.35));
  gradient.addColorStop(1, hexToRgba(color, 0));
  return gradient;
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Standard Chart.js options for line charts */
export const lineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 900, easing: 'easeOutCubic' as const },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(10,8,4,0.95)',
      borderColor: 'rgba(246,211,122,0.2)',
      borderWidth: 1,
      titleColor: '#f6d37a',
      bodyColor: '#e9e7e2',
      padding: 10,
      titleFont: { size: 11, weight: 600 as const },
      bodyFont: { size: 11 },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        color: 'rgba(167,163,160,0.35)',
        font: { size: 9 },
        maxRotation: 0,
      },
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: {
        color: 'rgba(167,163,160,0.35)',
        font: { size: 9 },
      },
    },
  },
};

/** Standard Chart.js options for bar charts */
export const barChartOptions = {
  ...lineChartOptions,
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        color: 'rgba(167,163,160,0.35)',
        font: { size: 9 },
      },
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: {
        color: 'rgba(167,163,160,0.35)',
        font: { size: 9 },
      },
    },
  },
};
