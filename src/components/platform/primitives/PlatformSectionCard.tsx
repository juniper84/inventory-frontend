import type { ReactNode } from 'react';

export function PlatformSectionCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded border border-gold-700/40 bg-black/60 px-6 py-4 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
