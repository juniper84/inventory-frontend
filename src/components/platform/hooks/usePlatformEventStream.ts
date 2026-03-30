'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getPlatformAccessToken } from '@/lib/auth';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';

const RECONNECT_DELAY_MS = 5000;

export type PlatformSseEventType =
  | 'subscription_request.created'
  | 'incident.created'
  | 'incident.transitioned'
  | 'export.failed'
  | 'business.review_flagged';

export type PlatformSseHandlers = {
  onSubscriptionRequestCreated?: (data: Record<string, unknown>) => void;
  onIncidentCreated?: (data: Record<string, unknown>) => void;
  onIncidentTransitioned?: (data: Record<string, unknown>) => void;
  onExportFailed?: (data: Record<string, unknown>) => void;
  onBusinessReviewFlagged?: (data: Record<string, unknown>) => void;
};

export function usePlatformEventStream(handlers: PlatformSseHandlers) {
  const handlersRef = useRef<PlatformSseHandlers>(handlers);
  handlersRef.current = handlers;

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const token = getPlatformAccessToken();
    if (!token) return;

    const url = `${API_BASE_URL}/platform/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    const handleEvent = (type: PlatformSseEventType, rawData: string) => {
      try {
        const data = JSON.parse(rawData) as Record<string, unknown>;
        const h = handlersRef.current;
        switch (type) {
          case 'subscription_request.created':
            h.onSubscriptionRequestCreated?.(data);
            break;
          case 'incident.created':
            h.onIncidentCreated?.(data);
            break;
          case 'incident.transitioned':
            h.onIncidentTransitioned?.(data);
            break;
          case 'export.failed':
            h.onExportFailed?.(data);
            break;
          case 'business.review_flagged':
            h.onBusinessReviewFlagged?.(data);
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    const eventTypes: PlatformSseEventType[] = [
      'subscription_request.created',
      'incident.created',
      'incident.transitioned',
      'export.failed',
      'business.review_flagged',
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, (e: MessageEvent<string>) => {
        handleEvent(type, e.data);
      });
    }

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (!unmountedRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY_MS);
      }
    };
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);
}
