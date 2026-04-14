'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';

export type SupportSession = {
  id: string;
  requestId: string;
  businessId: string;
  business?: { name: string } | null;
  platformAdminId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  scope?: string[] | null;
  request?: {
    id: string;
    reason: string;
    status: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  } | null;
};

export type SessionFilters = {
  view: 'ACTIVE' | 'ALL' | 'REVOKED' | 'EXPIRED';
  businessId: string;
  requestId: string;
};

const PAGE_SIZE = 50;

const INITIAL_FILTERS: SessionFilters = {
  view: 'ACTIVE',
  businessId: '',
  requestId: '',
};

type ListResponse = {
  items: SupportSession[];
  nextCursor?: string | null;
};

export function useSupportSessions() {
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<SessionFilters>(INITIAL_FILTERS);

  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(1);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [extendingId, setExtendingId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cursor = cursorStack[cursorStack.length - 1] ?? null;

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      if (filters.businessId) params.set('businessId', filters.businessId);
      if (filters.requestId) params.set('requestId', filters.requestId);
      if (filters.view === 'ACTIVE') params.set('activeOnly', 'true');
      const data = await apiFetch<ListResponse>(
        `/platform/support-access/sessions?${params.toString()}`,
        { token },
      );
      if (!mountedRef.current) return;
      let items = data.items ?? [];
      const now = Date.now();
      if (filters.view === 'REVOKED') {
        items = items.filter((s) => Boolean(s.revokedAt));
      } else if (filters.view === 'EXPIRED') {
        items = items.filter(
          (s) => !s.revokedAt && new Date(s.expiresAt).getTime() <= now,
        );
      }
      setSessions(items);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(getApiErrorMessage(err, 'Failed to load sessions.'));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [cursor, filters]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Live-tick state — forces re-renders for countdown timers
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const revokeSession = useCallback(
    async (sessionId: string, reason: string): Promise<boolean> => {
      if (!reason.trim()) return false;
      setRevokingId(sessionId);
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(
          `/platform/support-access/sessions/${sessionId}/revoke`,
          {
            token,
            method: 'POST',
            body: JSON.stringify({ reason: reason.trim() }),
          },
        );
        await loadSessions();
        return true;
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to revoke session.'));
        return false;
      } finally {
        setRevokingId(null);
      }
    },
    [loadSessions],
  );

  const extendSession = useCallback(
    async (
      sessionId: string,
      additionalHours: number,
      reason: string,
    ): Promise<boolean> => {
      if (!reason.trim() || additionalHours <= 0) return false;
      setExtendingId(sessionId);
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(
          `/platform/support-access/sessions/${sessionId}/extend`,
          {
            token,
            method: 'POST',
            body: JSON.stringify({
              additionalHours,
              reason: reason.trim(),
            }),
          },
        );
        await loadSessions();
        return true;
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to extend session.'));
        return false;
      } finally {
        setExtendingId(null);
      }
    },
    [loadSessions],
  );

  const setView = useCallback((view: SessionFilters['view']) => {
    setFilters((f) => ({ ...f, view }));
    setCursorStack([null]);
    setPage(1);
  }, []);

  const setBusinessFilter = useCallback((businessId: string) => {
    setFilters((f) => ({ ...f, businessId }));
    setCursorStack([null]);
    setPage(1);
  }, []);

  const setRequestFilter = useCallback((requestId: string) => {
    setFilters((f) => ({ ...f, requestId }));
    setCursorStack([null]);
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    setCursorStack([null]);
    setPage(1);
  }, []);

  const nextPage = useCallback(() => {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev, nextCursor]);
    setPage((p) => p + 1);
  }, [nextCursor]);

  const prevPage = useCallback(() => {
    setCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    setPage((p) => Math.max(1, p - 1));
  }, []);

  // Computed: active session count + total hours remaining (for summary bar)
  const now = Date.now();
  const activeSessions = sessions.filter(
    (s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now,
  );
  const totalHoursRemaining = activeSessions.reduce((sum, s) => {
    const ms = new Date(s.expiresAt).getTime() - now;
    return sum + Math.max(0, ms / (1000 * 60 * 60));
  }, 0);
  const businessesCount = new Set(activeSessions.map((s) => s.businessId)).size;

  return {
    sessions,
    isLoading,
    error,
    filters,
    setView,
    setBusinessFilter,
    setRequestFilter,
    resetFilters,
    page,
    hasNextPage: Boolean(nextCursor),
    hasPrevPage: page > 1,
    nextPage,
    prevPage,
    revokingId,
    revokeSession,
    extendingId,
    extendSession,
    refresh: loadSessions,
    activeCount: activeSessions.length,
    totalHoursRemaining,
    businessesCount,
  };
}
