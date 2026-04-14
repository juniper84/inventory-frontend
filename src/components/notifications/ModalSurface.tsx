'use client';

import { ReactNode, useEffect } from 'react';
import { useBodyScrollLock, useFocusTrap } from './hooks';

type ModalSurfaceProps = {
  open: boolean;
  onClose: () => void;
  /** If true, clicking backdrop does NOT close. Use for destructive confirms. */
  disableBackdropClose?: boolean;
  labelledBy?: string;
  describedBy?: string;
  /** Additional class on the panel — useful for size variants like `nvi-modal-panel--wide`. */
  panelClassName?: string;
  children: ReactNode;
};

/**
 * ModalSurface — Host for all modals.
 * Handles backdrop, focus trap, scroll lock, escape key, click-outside.
 */
export function ModalSurface({
  open,
  onClose,
  disableBackdropClose = false,
  labelledBy,
  describedBy,
  panelClassName = '',
  children,
}: ModalSurfaceProps) {
  useBodyScrollLock(open);
  const containerRef = useFocusTrap<HTMLDivElement>(open, onClose);

  useEffect(() => {
    if (!open) return;
    // Play exit animation via CSS — mount state controls render
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (disableBackdropClose) return;
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="nvi-modal-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={`nvi-modal-panel ${panelClassName}`.trim()}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
