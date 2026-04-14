'use client';

import { useMemo } from 'react';

/**
 * Reads --pt-* CSS variables from the platform shell and returns a Chart.js
 * compatible theme config. All platform charts should use this hook to stay
 * consistent with the active theme (obsidian/neon/midnight/forest/crimson/violet/charcoal).
 *
 * Usage:
 *   const theme = usePlatformChartTheme();
 *   <Line options={{ scales: { x: { grid: { color: theme.gridColor } } } }} />
 */
export function usePlatformChartTheme() {
  return useMemo(() => {
    const get = (prop: string, fallback: string) => {
      if (typeof window === 'undefined') return fallback;
      const shell = document.querySelector('.p-shell');
      if (!shell) return fallback;
      return getComputedStyle(shell).getPropertyValue(prop).trim() || fallback;
    };

    const accent = get('--pt-accent', '#c9a84c');
    const accentDim = get('--pt-accent-dim', 'rgba(201,168,76,0.13)');
    const accentBorder = get('--pt-accent-border', 'rgba(201,168,76,0.32)');
    const text1 = get('--pt-text-1', '#f0e8d0');
    const text2 = get('--pt-text-2', '#c4b78a');
    const textMuted = get('--pt-text-muted', '#7a6f56');
    const bgSurface = get('--pt-bg-surface', '#0c0f14');
    const danger = get('--pt-danger', '#e05252');
    const warning = get('--pt-warning', '#e09a2a');

    return {
      accent,
      accentDim,
      accentBorder,
      text1,
      text2,
      textMuted,
      bgSurface,
      danger,
      warning,
      // Chart.js ready values
      gridColor: accentBorder,
      tickColor: textMuted,
      fontColor: text2,
      fontFamily: "'Space Grotesk', 'Sora', system-ui, sans-serif",
      tooltipBg: bgSurface,
      tooltipBorder: accentBorder,
      tooltipTitleColor: text1,
      tooltipBodyColor: text2,
      // Common series colors
      series: {
        primary: accent,
        primaryFill: accentDim,
        danger,
        dangerFill: 'rgba(224,82,82,0.12)',
        warning,
        warningFill: 'rgba(224,154,42,0.12)',
        emerald: '#3dba6a',
        emeraldFill: 'rgba(61,186,106,0.12)',
        blue: '#4f8ef7',
        blueFill: 'rgba(79,142,247,0.12)',
      },
    };
  }, []);
}
