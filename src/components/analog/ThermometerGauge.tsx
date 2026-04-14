'use client';

import { useEffect, useRef, useState } from 'react';

type ThermometerGaugeProps = {
  value: number;
  max: number;
  label?: string;
  unit?: string;
  height?: number;
  className?: string;
};

export function ThermometerGauge({
  value,
  max,
  label,
  unit,
  height = 120,
  className = '',
}: ThermometerGaugeProps) {
  const [animatedFill, setAnimatedFill] = useState(0);
  const frameRef = useRef<number | null>(null);
  const prevFill = useRef(0);

  const targetFill = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  useEffect(() => {
    const start = prevFill.current;
    const diff = targetFill - start;
    const duration = 1200;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedFill(start + diff * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevFill.current = targetFill;
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [targetFill]);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="flex items-end gap-2" style={{ height }}>
        <div className="flex flex-col-reverse justify-between text-[9px] text-[#4a4035]" style={{ height }}>
          <span>0</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
        <div className="relative" style={{ width: 22, height }}>
          <div
            className="w-full rounded-[11px] shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)] overflow-hidden"
            style={{ height, background: '#1a1714' }}
          >
            <div
              className="absolute bottom-0 left-0 right-0 rounded-b-[11px]"
              style={{
                height: `${animatedFill}%`,
                background: 'linear-gradient(to top, var(--accent, #c9a84c), #e8c84c)',
              }}
            />
          </div>
          <div
            className="absolute -bottom-[14px] left-1/2 -translate-x-1/2 w-[30px] h-[30px] rounded-full shadow-[0_0_10px_rgba(201,168,76,0.4)]"
            style={{
              background: 'radial-gradient(circle at 40% 40%, #e8c84c, var(--accent, #c9a84c), #a08030)',
            }}
          />
        </div>
      </div>
      <div className="text-center mt-5">
        <span className="text-lg font-bold text-[color:var(--foreground)]">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit ? <span className="text-xs text-[color:var(--muted)] ml-1">{unit}</span> : null}
      </div>
      {label ? <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">{label}</span> : null}
    </div>
  );
}
