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
      className={`rounded border border-[color:var(--pt-accent-border)] p-bg-card px-6 py-4 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
