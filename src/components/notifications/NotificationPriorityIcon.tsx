'use client';

import { ShieldAlert, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import type { NotifySeverity } from './types';

export type NotificationPriority =
  | 'SECURITY'
  | 'ACTION_REQUIRED'
  | 'WARNING'
  | 'INFO';

/**
 * Map from server-side notification priority to notify-system severity.
 * Used when routing live server notifications through notify.*() so the
 * toast matches the severity palette of the rest of the app.
 */
export function priorityToSeverity(priority: NotificationPriority): NotifySeverity {
  switch (priority) {
    case 'SECURITY':
      return 'error';
    case 'ACTION_REQUIRED':
    case 'WARNING':
      return 'warning';
    case 'INFO':
    default:
      return 'info';
  }
}

type Props = {
  priority: NotificationPriority;
  size?: number;
  className?: string;
};

/**
 * Visual icon for a server-side notification priority. SECURITY pulses.
 */
export function NotificationPriorityIcon({ priority, size = 14, className = '' }: Props) {
  const common = { size, className };
  switch (priority) {
    case 'SECURITY':
      return <ShieldAlert {...common} />;
    case 'ACTION_REQUIRED':
      return <AlertTriangle {...common} />;
    case 'WARNING':
      return <AlertCircle {...common} />;
    case 'INFO':
    default:
      return <Info {...common} />;
  }
}
