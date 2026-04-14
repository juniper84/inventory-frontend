'use client';

import { useEffect, useRef, useState } from 'react';

type FlipCounterProps = {
  value: number;
  digits?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export function FlipCounter({
  value,
  digits = 6,
  decimals = 0,
  prefix,
  suffix,
  size = 'md',
  className = '',
}: FlipCounterProps) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    const diff = end - start;
    if (Math.abs(diff) < 0.01) {
      setDisplayed(end);
      prevRef.current = end;
      return;
    }
    const duration = 900;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(start + diff * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevRef.current = end;
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value]);

  const formatted = decimals > 0
    ? displayed.toFixed(decimals)
    : Math.round(displayed).toString();

  const padded = formatted.replace(/^-/, '').padStart(digits + (decimals > 0 ? decimals + 1 : 0), '0');
  const isNegative = displayed < 0;
  const chars = (isNegative ? '-' : '') + padded;

  const digitSize = size === 'lg' ? 'w-[28px] h-[40px] text-[22px]' : size === 'sm' ? 'w-[16px] h-[24px] text-[13px]' : 'w-[20px] h-[32px] text-[17px]';
  const gapSize = size === 'lg' ? 'gap-[3px]' : size === 'sm' ? 'gap-[1px]' : 'gap-[2px]';

  return (
    <div className={`inline-flex items-center ${gapSize} ${className}`}>
      {prefix ? <span className="text-[color:var(--muted)] text-xs mr-1">{prefix}</span> : null}
      {chars.split('').map((char, i) => (
        char === '.' || char === ',' ? (
          <span key={i} className="text-[color:var(--muted)] font-bold self-end pb-[2px]">.</span>
        ) : char === '-' ? (
          <span key={i} className="text-[color:var(--accent)] font-bold self-center">-</span>
        ) : (
          <span
            key={i}
            className={`${digitSize} inline-flex items-center justify-center rounded-md bg-[#1a1714] font-mono font-bold text-[color:var(--accent)] shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.04)] relative`}
          >
            <span className="absolute inset-x-0 top-1/2 h-[1px] bg-black/40" />
            {char}
          </span>
        )
      ))}
      {suffix ? <span className="text-[color:var(--muted)] text-xs ml-1">{suffix}</span> : null}
    </div>
  );
}
