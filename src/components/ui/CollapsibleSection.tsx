'use client';

import { useCallback, useEffect, useState } from 'react';

type CollapsibleSectionProps = {
  title: string;
  defaultOpen?: boolean;
  /** Controlled open state — when provided, overrides internal state */
  isOpen?: boolean;
  /** Called when open state changes (for controlled mode) */
  onToggle?: (open: boolean) => void;
  /** Session storage key — if provided, remembers open/closed state across page navigations */
  storageKey?: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
};

export function CollapsibleSection({
  title,
  defaultOpen = false,
  isOpen,
  onToggle,
  storageKey,
  children,
  badge,
  className = '',
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(() => {
    if (storageKey && typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(storageKey);
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    }
    return defaultOpen;
  });

  const open = isOpen !== undefined ? isOpen : internalOpen;

  const toggle = useCallback(() => {
    const next = !open;
    if (onToggle) {
      onToggle(next);
    } else {
      setInternalOpen(next);
    }
    if (storageKey && typeof window !== 'undefined') {
      sessionStorage.setItem(storageKey, String(next));
    }
  }, [open, onToggle, storageKey]);

  // Sync controlled state to session storage
  useEffect(() => {
    if (storageKey && isOpen !== undefined && typeof window !== 'undefined') {
      sessionStorage.setItem(storageKey, String(isOpen));
    }
  }, [storageKey, isOpen]);

  return (
    <div className={`nvi-card nvi-card--glow nvi-reveal ${className}`}>
      <div className="flex w-full items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-2 text-left"
          >
            <h3 className="text-lg font-semibold text-nvi-text-primary">{title}</h3>
            <span
              className={`text-nvi-text-tertiary transition-transform duration-200 ${
                open ? 'rotate-180' : ''
              }`}
            >
              ▾
            </span>
          </button>
          {badge ?? null}
        </div>
      </div>
      {open ? <div className="px-4 pb-4 pt-0 space-y-3">{children}</div> : null}
    </div>
  );
}
