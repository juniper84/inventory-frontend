'use client';

import { ReactNode } from 'react';

/**
 * StatusCard — Single metric with an icon, title, value, and status chip.
 * Best for: Low Stock, Expiring Batches, Outstanding Balances, Open Shifts.
 */

export type StatusCardProps = {
  icon?: ReactNode;
  label: string;
  value: string;
  sub?: string;
  severity?: 'good' | 'warning' | 'critical' | 'neutral';
  className?: string;
};

export function StatusCard({
  icon,
  label,
  value,
  sub,
  severity = 'neutral',
  className = '',
}: StatusCardProps) {
  return (
    <div className={`rpt-status rpt-status--${severity} ${className}`}>
      {icon && <div className="rpt-status__icon">{icon}</div>}
      <div className="rpt-status__body">
        <span className="rpt-status__label">{label}</span>
        <span className="rpt-status__value">{value}</span>
        {sub && <span className="rpt-status__sub">{sub}</span>}
      </div>
    </div>
  );
}
