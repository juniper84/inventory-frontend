'use client';

import { useEffect, useState } from 'react';

type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';

type Props = {
  labels: {
    connected: string;
    reconnecting: string;
    disconnected: string;
  };
};

/**
 * Platform SSE connection indicator.
 *
 * Listens for `nvi:platform:sse` custom events dispatched by whoever owns the
 * actual EventSource connection (e.g. usePlatformEventStream hook). The event
 * detail is one of: 'connected' | 'reconnecting' | 'disconnected'.
 *
 * This component purposefully doesn't create its own connection — it's a
 * passive observer so the shell can display status without duplicating the
 * stream. If no event has fired yet (initial mount) it shows 'connected' as
 * the optimistic default, since the stream hook fires on first connect.
 */
export function PlatformSseIndicator({ labels }: Props) {
  const [state, setState] = useState<ConnectionState>('connected');

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ state: ConnectionState }>).detail;
      if (detail?.state && ['connected', 'reconnecting', 'disconnected'].includes(detail.state)) {
        setState(detail.state);
      }
    };
    window.addEventListener('nvi:platform:sse', handler);
    return () => window.removeEventListener('nvi:platform:sse', handler);
  }, []);

  return (
    <div
      className="p-sse-indicator"
      data-state={state}
      title={labels[state]}
      aria-live="polite"
      aria-label={labels[state]}
    >
      <span className="p-sse-dot" />
      <span>{labels[state]}</span>
    </div>
  );
}
