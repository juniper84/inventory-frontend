'use client';

import { Skeleton } from '@/components/Skeleton';

export function PageSkeleton({
  title = 'Loading',
  lines = 3,
  blocks = 2,
}: {
  title?: string;
  lines?: number;
  blocks?: number;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.4em] text-gold-400">
          {title}
        </p>
        <Skeleton className="h-7 w-1/3" />
      </div>
      <div className="space-y-3 rounded border border-gold-700/40 bg-black/50 p-6">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: blocks }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    </section>
  );
}
