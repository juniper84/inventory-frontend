'use client';

import { useState } from 'react';
import { SeverityIcon, CloseIcon } from './icons';
import type { NotifySeverity, BannerAction } from './types';

type BannerProps = {
  message: string;
  title?: string;
  severity?: NotifySeverity;
  action?: BannerAction;
  onDismiss?: () => void;
  sticky?: boolean;
  className?: string;
};

/**
 * Banner — Inline page-level status message with optional action + dismiss.
 */
export function Banner({
  message,
  title,
  severity = 'info',
  action,
  onDismiss,
  sticky = false,
  className = '',
}: BannerProps) {
  const [leaving, setLeaving] = useState(false);

  const handleDismiss = () => {
    if (!onDismiss) return;
    setLeaving(true);
    window.setTimeout(onDismiss, 180);
  };

  const role = severity === 'error' ? 'alert' : 'status';

  return (
    <div
      role={role}
      className={`nvi-banner nvi-banner--${severity} ${sticky ? 'nvi-banner--sticky' : ''} ${leaving ? 'nvi-banner--leaving' : ''} ${className}`}
    >
      <div className={`nvi-banner__icon nvi-banner__icon--${severity}`}>
        <SeverityIcon severity={severity} className="nvi-banner__icon-svg" />
      </div>
      <div className="nvi-banner__body">
        {title ? <div className="nvi-banner__title">{title}</div> : null}
        <div className="nvi-banner__message">{message}</div>
      </div>
      {action ? (
        <button
          type="button"
          className={`nvi-banner__action nvi-banner__action--${severity}`}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className="nvi-banner__close"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <CloseIcon className="nvi-banner__close-svg" />
        </button>
      ) : null}
    </div>
  );
}
