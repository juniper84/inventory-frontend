'use client';

import { useEffect, useRef, useState } from 'react';

type TapeMeterProps = {
  value: number;
  max: number;
  label?: string;
  showValue?: boolean;
  formatValue?: (v: number) => string;
  color?: string;
  height?: number;
  className?: string;
};

export function TapeMeter({
  value,
  max,
  label,
  showValue = true,
  formatValue,
  color = 'var(--accent, #c9a84c)',
  height = 32,
  className = '',
}: TapeMeterProps) {
  const [animatedWidth, setAnimatedWidth] = useState(0);
  const frameRef = useRef<number | null>(null);
  const prevWidth = useRef(0);

  const targetWidth = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  useEffect(() => {
    const start = prevWidth.current;
    const diff = targetWidth - start;
    const duration = 1200;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedWidth(start + diff * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevWidth.current = targetWidth;
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [targetWidth]);

  const displayValue = formatValue ? formatValue(value) : value.toLocaleString();

  return (
    <div className={className}>
      {label ? (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-[color:var(--muted)]">{label}</span>
          {showValue ? <span className="text-xs font-semibold text-[color:var(--foreground)]">{displayValue}</span> : null}
        </div>
      ) : null}
      <div
        className="relative w-full rounded-lg overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
        style={{ height, background: '#1a1714' }}
      >
        <div
          className="h-full rounded-lg transition-none"
          style={{
            width: `${animatedWidth}%`,
            background: `repeating-linear-gradient(90deg, ${color} 0px, ${color} 2px, transparent 2px, transparent 6px)`,
            opacity: 0.7,
          }}
        />
        <div
          className="absolute top-0 h-full w-[2px] shadow-[0_0_4px_rgba(232,220,200,0.4)]"
          style={{
            left: `${animatedWidth}%`,
            background: 'var(--foreground, #e8dcc8)',
          }}
        />
      </div>
    </div>
  );
}
