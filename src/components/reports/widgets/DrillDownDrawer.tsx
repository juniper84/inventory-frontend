'use client';

import { ReactNode, useState } from 'react';

/**
 * DrillDownDrawer — Collapsible section for operational tables + drill-downs.
 * Starts closed; click header to expand.
 */

export type DrillDownDrawerProps = {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
};

export function DrillDownDrawer({
  title,
  badge,
  defaultOpen = false,
  children,
  className = '',
}: DrillDownDrawerProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rpt-drawer ${open ? 'rpt-drawer--open' : ''} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rpt-drawer__toggle"
        aria-expanded={open}
      >
        <span className="rpt-drawer__title">{title}</span>
        {badge && <span className="rpt-drawer__badge">{badge}</span>}
        <span className="rpt-drawer__chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open && <div className="rpt-drawer__body">{children}</div>}
    </div>
  );
}
