'use client';

import type { ReactNode } from 'react';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Empty-state placeholder for list pages with no data.
 * Replaces adhoc "no results" text and StatusBanner misuse.
 *
 * Usage:
 *   <EmptyState
 *     icon={<Icon name="Package" size={32} className="text-gold-500/40" />}
 *     title="No products yet"
 *     description="Create your first product to get started."
 *     action={<button className="...">Add Product</button>}
 *   />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3 py-12 text-center',
        className,
      ].join(' ')}
    >
      {icon && <div className="mb-1 opacity-60">{icon}</div>}
      <h3 className="text-sm font-semibold text-gold-100">{title}</h3>
      {description && (
        <p className="max-w-xs text-xs text-gold-400/70">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
