'use client';

import { useEffect, useState } from 'react';

/**
 * FreshnessBadge — Live "Updated Xs ago" badge. Updates every 10s.
 */

export type FreshnessBadgeProps = {
  updatedAt: number | null;
  className?: string;
};

function formatAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function FreshnessBadge({ updatedAt, className = '' }: FreshnessBadgeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!updatedAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, [updatedAt]);

  if (!updatedAt) return null;

  const diff = now - updatedAt;
  return (
    <span
      className={`rpt-freshness ${className}`}
      title={new Date(updatedAt).toLocaleString()}
    >
      <span className="rpt-freshness__dot" aria-hidden />
      Updated {formatAgo(diff)}
    </span>
  );
}
