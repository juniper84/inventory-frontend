'use client';

import { useState, useRef, useCallback, type ReactNode } from 'react';

type TooltipProps = {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
};

/**
 * Lightweight tooltip that appears on hover/focus.
 * CSS-only positioning — no external library.
 *
 * Usage:
 *   <Tooltip content="Delete this item">
 *     <button>🗑</button>
 *   </Tooltip>
 */
export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={[
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-lg px-2.5 py-1.5',
            'border border-[var(--nvi-border)] bg-[var(--nvi-surface-strong)]',
            'text-xs font-medium text-[var(--nvi-text)]',
            'shadow-[var(--nvi-shadow-soft)]',
            'animate-[nvi-fade-slide-up_0.15s_ease-out]',
            positionClasses[position],
          ].join(' ')}
        >
          {content}
        </span>
      )}
    </span>
  );
}
