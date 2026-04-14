'use client';

import { Toast } from './Toast';
import type { ToastItem } from './types';

type Props = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

const MAX_VISIBLE = 4;

/**
 * ToastSurface — Floating container in the bottom-right.
 * Renders up to MAX_VISIBLE stacked toasts.
 */
export function ToastSurface({ toasts, onDismiss }: Props) {
  const visible = toasts.slice(-MAX_VISIBLE);
  if (visible.length === 0) return null;
  return (
    <div className="nvi-toast-surface" aria-label="Notifications">
      {visible.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
