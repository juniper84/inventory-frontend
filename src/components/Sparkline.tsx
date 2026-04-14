'use client';

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  className?: string;
};

/**
 * Tiny SVG sparkline chart — no axes, no labels, just a visual trend line.
 * Used for inline KPI trends (e.g., API error rate heartbeat).
 */
export function Sparkline({
  data,
  width = 80,
  height = 24,
  color = 'currentColor',
  fillOpacity = 0.15,
  strokeWidth = 1.5,
  className = '',
}: SparklineProps) {
  if (!data.length) return null;

  const max = Math.max(...data, 0.001);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const padding = 1;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const points = data.map((value, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * innerW;
    const y = padding + innerH - ((value - min) / range) * innerH;
    return `${x},${y}`;
  });

  const linePath = `M${points.join('L')}`;
  const fillPath = `${linePath}L${padding + innerW},${padding + innerH}L${padding},${padding + innerH}Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <path d={fillPath} fill={color} opacity={fillOpacity} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
