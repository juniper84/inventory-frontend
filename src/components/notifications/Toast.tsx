'use client';

import { useEffect, useRef, useState } from 'react';
import { SeverityIcon, CloseIcon } from './icons';
import type { ToastItem } from './types';

type Props = {
  toast: ToastItem;
  onDismiss: (id: string) => void;
};

/**
 * Toast — Individual toast card with icon, body, close button, progress bar.
 * Hover pauses the timer. Action button for optional Undo etc.
 */
export function Toast({ toast, onDismiss }: Props) {
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(100);
  const pausedRef = useRef(false);
  const remainingRef = useRef(toast.duration);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // Mark as assertive for errors (screen readers announce immediately)
  const liveRegion = toast.severity === 'error' ? 'assertive' : 'polite';

  useEffect(() => {
    if (toast.duration === 0) return; // sticky
    startRef.current = Date.now();
    remainingRef.current = toast.duration;

    const tick = () => {
      if (pausedRef.current) {
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, remainingRef.current - elapsed);
      const pct = (remaining / toast.duration) * 100;
      setProgress(pct);
      if (remaining <= 0) {
        setLeaving(true);
        window.setTimeout(() => onDismiss(toast.id), 220);
        return;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [toast.duration, toast.id, onDismiss]);

  const handleMouseEnter = () => {
    if (toast.duration === 0) return;
    pausedRef.current = true;
    remainingRef.current = Math.max(
      0,
      remainingRef.current - (Date.now() - startRef.current),
    );
  };

  const handleMouseLeave = () => {
    if (toast.duration === 0) return;
    pausedRef.current = false;
    startRef.current = Date.now();
  };

  const handleClose = () => {
    setLeaving(true);
    window.setTimeout(() => onDismiss(toast.id), 220);
  };

  const handleActionClick = () => {
    toast.action?.onClick();
    handleClose();
  };

  return (
    <div
      className={`nvi-toast nvi-toast--${toast.severity} ${leaving ? 'nvi-toast--leaving' : ''}`}
      role={toast.severity === 'error' ? 'alert' : 'status'}
      aria-live={liveRegion}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={`nvi-toast__icon nvi-toast__icon--${toast.severity}`}>
        <SeverityIcon severity={toast.severity} className="nvi-toast__icon-svg" />
      </div>
      <div className="nvi-toast__body">
        {toast.title ? <div className="nvi-toast__title">{toast.title}</div> : null}
        <div className="nvi-toast__message">{toast.message}</div>
        {toast.action ? (
          <button
            type="button"
            className="nvi-toast__action"
            onClick={(e) => {
              e.stopPropagation();
              handleActionClick();
            }}
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="nvi-toast__close"
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        aria-label="Dismiss notification"
      >
        <CloseIcon className="nvi-toast__close-svg" />
      </button>
      {toast.duration > 0 ? (
        <div
          className="nvi-toast__progress"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      ) : null}
    </div>
  );
}
