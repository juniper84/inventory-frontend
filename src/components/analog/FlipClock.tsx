'use client';

import { useEffect, useState } from 'react';

type FlipClockProps = {
  startTime?: Date | string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

export function FlipClock({
  startTime,
  label,
  size = 'md',
  className = '',
}: FlipClockProps) {
  const [elapsed, setElapsed] = useState({ h: '00', m: '00', s: '00' });

  useEffect(() => {
    if (!startTime) return;
    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
    const tick = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed({ h: pad2(h), m: pad2(m), s: pad2(s) });
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const digitClass = size === 'lg'
    ? 'w-[36px] h-[48px] text-[24px]'
    : size === 'sm'
      ? 'w-[20px] h-[28px] text-[14px]'
      : 'w-[28px] h-[38px] text-[20px]';

  const sepClass = size === 'lg' ? 'text-[20px]' : size === 'sm' ? 'text-[12px]' : 'text-[16px]';

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="inline-flex items-center gap-[3px]">
        {elapsed.h.split('').map((d, i) => (
          <Digit key={`h${i}`} value={d} className={digitClass} />
        ))}
        <span className={`${sepClass} text-[#4a4035] font-bold self-center`}>:</span>
        {elapsed.m.split('').map((d, i) => (
          <Digit key={`m${i}`} value={d} className={digitClass} />
        ))}
        <span className={`${sepClass} text-[#4a4035] font-bold self-center`}>:</span>
        {elapsed.s.split('').map((d, i) => (
          <Digit key={`s${i}`} value={d} className={digitClass} />
        ))}
      </div>
      {label ? <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)] mt-1">{label}</span> : null}
    </div>
  );
}

function Digit({ value, className }: { value: string; className: string }) {
  return (
    <span
      className={`${className} inline-flex items-center justify-center rounded-md bg-[#1a1714] font-mono font-bold text-[color:var(--accent)] shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.04)] relative`}
    >
      <span className="absolute inset-x-0 top-1/2 h-[1px] bg-black/40" />
      {value}
    </span>
  );
}
