'use client';

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  COMPLETED: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  APPROVED: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  OPEN: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },

  PENDING: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  REQUESTED: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  DRAFT: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  PENDING_APPROVAL: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  SCHEDULED: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },

  IN_TRANSIT: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
  RUNNING: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
  PROCESSING: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },

  INACTIVE: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
  ARCHIVED: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
  RECEIVED: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  PARTIALLY_RECEIVED: { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-400' },
  CLOSED: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
  EXPIRED: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
  REMOVED: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },

  CANCELLED: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  REJECTED: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  FAILED: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  REFUNDED: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  SUSPENDED: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  DEACTIVATED: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },

  POSITIVE: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  NEGATIVE: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  SHORTAGE: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  SURPLUS: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },

  // Notification priorities
  ACTION_REQUIRED: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  WARNING: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  INFO: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
  SECURITY: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },

  // Stock movement types
  OPENING_BALANCE: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  PURCHASE_IN: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  RETURN_IN: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  TRANSFER_IN: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  ADJUSTMENT_POSITIVE: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  SALE_OUT: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  RETURN_OUT: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  TRANSFER_OUT: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  ADJUSTMENT_NEGATIVE: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  STOCK_COUNT_VARIANCE: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },

  // Audit read status
  SUCCESS: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  FAILURE: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  UNREAD: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  READ: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
};

const DEFAULT_STYLE = { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' };

type StatusBadgeProps = {
  status: string;
  label?: string;
  size?: 'xs' | 'sm' | 'md';
  showDot?: boolean;
  className?: string;
};

export function StatusBadge({
  status,
  label,
  size = 'sm',
  showDot = true,
  className = '',
}: StatusBadgeProps) {
  const normalized = status.toUpperCase().replace(/[\s-]/g, '_');
  const style = STATUS_STYLES[normalized] ?? DEFAULT_STYLE;
  const displayLabel = label ?? status.replace(/_/g, ' ');

  const sizeClasses =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px]'
      : size === 'md'
        ? 'px-3 py-1 text-xs'
        : 'px-2 py-0.5 text-[11px]';

  const dotSize = size === 'xs' ? 'h-1.5 w-1.5' : 'h-2 w-2';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${style.bg} ${style.text} ${sizeClasses} ${className}`}
    >
      {showDot ? <span className={`${dotSize} shrink-0 rounded-full ${style.dot}`} /> : null}
      {displayLabel}
    </span>
  );
}
