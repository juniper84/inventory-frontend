'use client';

import { useEffect, useState } from 'react';

export type SseState = 'connected' | 'reconnecting' | 'disconnected';

type Props = {
  labels: {
    connected: string;
    reconnecting: string;
    disconnected: string;
  };
  /** Hide the text label and only show the dot (compact mode for bell footer). */
  compact?: boolean;
};

/**
 * Business-side SSE connection indicator for the notification stream.
 *
 * Passive observer that listens for `nvi:business:sse` custom events with a
 * `detail.state` field. The actual EventSource lifecycle is owned by
 * NotificationSurface — this component just reflects it. Mirrors the pattern
 * used in the platform console PlatformSseIndicator.
 */
export function NotificationSseIndicator({ labels, compact = false }: Props) {
  const [state, setState] = useState<SseState>('connected');

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ state: SseState }>).detail;
      if (detail?.state && ['connected', 'reconnecting', 'disconnected'].includes(detail.state)) {
        setState(detail.state);
      }
    };
    window.addEventListener('nvi:business:sse', handler);
    return () => window.removeEventListener('nvi:business:sse', handler);
  }, []);

  return (
    <span
      className="nvi-sse-indicator"
      data-state={state}
      title={labels[state]}
      aria-live="polite"
      aria-label={labels[state]}
    >
      <span className="nvi-sse-dot" />
      {!compact && <span>{labels[state]}</span>}
    </span>
  );
}
