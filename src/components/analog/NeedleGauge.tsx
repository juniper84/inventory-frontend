'use client';

import { useEffect, useRef, useState } from 'react';

type NeedleGaugeProps = {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
  size?: number;
  colorStops?: { offset: number; color: string }[];
  className?: string;
};

export function NeedleGauge({
  value,
  min = 0,
  max = 100,
  label,
  unit,
  size = 160,
  colorStops,
  className = '',
}: NeedleGaugeProps) {
  const [animatedAngle, setAnimatedAngle] = useState(-90);
  const frameRef = useRef<number | null>(null);
  const prevAngle = useRef(-90);

  const clampedValue = Math.max(min, Math.min(max, value));
  const ratio = (clampedValue - min) / (max - min || 1);
  const targetAngle = -90 + ratio * 180;

  useEffect(() => {
    const start = prevAngle.current;
    const diff = targetAngle - start;
    const duration = 1200;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + diff * eased;
      setAnimatedAngle(current);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevAngle.current = targetAngle;
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [targetAngle]);

  const half = size / 2;
  const trackRadius = half - 16;
  const needleLength = trackRadius - 8;

  const defaultStops = [
    { offset: 0, color: '#c35151' },
    { offset: 0.5, color: '#c9a84c' },
    { offset: 1, color: '#4caf82' },
  ];
  const stops = colorStops ?? defaultStops;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg width={size} height={half + 16} viewBox={`0 0 ${size} ${half + 16}`}>
        <defs>
          <linearGradient id={`gauge-grad-${size}`} x1="0" y1="0" x2="1" y2="0">
            {stops.map((s, i) => (
              <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
        {/* Track background */}
        <path
          d={describeArc(half, half + 4, trackRadius, -180, 0)}
          fill="none"
          stroke="#1a1714"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Colored track */}
        <path
          d={describeArc(half, half + 4, trackRadius, -180, 0)}
          fill="none"
          stroke={`url(#gauge-grad-${size})`}
          strokeWidth={10}
          strokeLinecap="round"
          opacity={0.6}
        />
        {/* Tick marks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const angle = -180 + t * 180;
          const rad = (angle * Math.PI) / 180;
          const x1 = half + (trackRadius + 8) * Math.cos(rad);
          const y1 = half + 4 + (trackRadius + 8) * Math.sin(rad);
          const x2 = half + (trackRadius - 2) * Math.cos(rad);
          const y2 = half + 4 + (trackRadius - 2) * Math.sin(rad);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4a4035" strokeWidth={1.5} />;
        })}
        {/* Needle */}
        <line
          x1={half}
          y1={half + 4}
          x2={half + needleLength * Math.cos((animatedAngle * Math.PI) / 180)}
          y2={half + 4 + needleLength * Math.sin((animatedAngle * Math.PI) / 180)}
          stroke="var(--accent, #c9a84c)"
          strokeWidth={2.5}
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 4px rgba(201,168,76,0.4))' }}
        />
        {/* Center dot */}
        <circle cx={half} cy={half + 4} r={5} fill="var(--accent, #c9a84c)" style={{ filter: 'drop-shadow(0 0 6px rgba(201,168,76,0.5))' }} />
        {/* Min/Max labels */}
        <text x={12} y={half + 14} fontSize={9} fill="#4a4035" textAnchor="start">{min}</text>
        <text x={size - 12} y={half + 14} fontSize={9} fill="#4a4035" textAnchor="end">{max}</text>
      </svg>
      <div className="text-center -mt-1">
        <span className="text-lg font-bold text-[color:var(--foreground)]">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit ? <span className="text-xs text-[color:var(--muted)] ml-1">{unit}</span> : null}
      </div>
      {label ? <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">{label}</span> : null}
    </div>
  );
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}
