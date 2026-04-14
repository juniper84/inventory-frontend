'use client';

import type { ReactNode } from 'react';

type Action = {
  key: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger' | 'success';
};

type ActionButtonsProps = {
  actions: Action[];
  size?: 'xs' | 'sm';
  className?: string;
};

const variantStyles = {
  default: 'border-[color:var(--border)] text-[color:var(--foreground)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]',
  danger: 'border-red-500/30 text-red-400 hover:border-red-400 hover:text-red-300',
  success: 'border-emerald-500/30 text-emerald-400 hover:border-emerald-400 hover:text-emerald-300',
};

export function ActionButtons({
  actions,
  size = 'sm',
  className = '',
}: ActionButtonsProps) {
  const padding = size === 'xs' ? 'p-1' : 'p-1.5';
  const iconSize = size === 'xs' ? 'text-[12px]' : 'text-[14px]';

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.label}
          aria-label={action.label}
          className={`${padding} rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            variantStyles[action.variant ?? 'default']
          }`}
        >
          <span className={iconSize}>{action.icon}</span>
        </button>
      ))}
    </div>
  );
}
