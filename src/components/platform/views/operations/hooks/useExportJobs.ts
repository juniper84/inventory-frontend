'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';

export type ExportJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export type ExportJob = {
  id: string;
  businessId: string;
  type: string;
  status: ExportJobStatus;
  requestedByPlatformAdminId?: string | null;
  requestedByUserId?: string | null;
  deliveredAt?: string | null;
  deliveredByPlatformAdminId?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  attempts: number;
  lastError?: string | null;
  metadata?: { reason?: string | null } | null;
  business?: { name: string } | null;
};

export type ExportFilters = {
  status: 'ALL' | ExportJobStatus;
  businessId: string;
  type: string;
};

export type ExportStats = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, { total: number; byStatus: Record<string, number> }>;
};

const PAGE_SIZE = 20;

const INITIAL_FILTERS: ExportFilters = {
  status: 'ALL',
  businessId: '',
  type: '',
};

type ListResponse = {
  items: ExportJob[];
  nextCursor?: string | null;
};

export function useExportJobs() {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [stats, setStats] = useState<ExportStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<ExportFilters>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<ExportFilters>(INITIAL_FILTERS);

  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(1);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Per-job action loading state — fixes bug #8 (no loading spinners)
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<
    'retry' | 'requeue' | 'cancel' | 'delivered' | null
  >(null);
  const [exportingOnExit, setExportingOnExit] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cursor = cursorStack[cursorStack.length - 1] ?? null;

  const loadJobs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      if (appliedFilters.status !== 'ALL')
        params.set('status', appliedFilters.status);
      if (appliedFilters.businessId)
        params.set('businessId', appliedFilters.businessId);
      if (appliedFilters.type) params.set('type', appliedFilters.type);
      const data = await apiFetch<ListResponse>(
        `/platform/exports/jobs?${params.toString()}`,
        { token },
      );
      if (!mountedRef.current) return;
      setJobs(data.items ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(getApiErrorMessage(err, 'Failed to load export jobs.'));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [cursor, appliedFilters]);

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (appliedFilters.businessId)
        params.set('businessId', appliedFilters.businessId);
      if (appliedFilters.type) params.set('type', appliedFilters.type);
      const data = await apiFetch<ExportStats>(
        `/platform/exports/stats${params.toString() ? `?${params.toString()}` : ''}`,
        { token },
      );
      if (mountedRef.current) setStats(data);
    } catch {
      // non-critical
    } finally {
      if (mountedRef.current) setIsLoadingStats(false);
    }
  }, [appliedFilters.businessId, appliedFilters.type]);

  useEffect(() => {
    loadJobs();
    loadStats();
  }, [loadJobs, loadStats]);

  const performAction = useCallback(
    async (
      jobId: string,
      action: 'retry' | 'requeue' | 'cancel',
      reason: string,
    ): Promise<boolean> => {
      if (!reason.trim()) return false;
      setActioningId(jobId);
      setActionType(action);
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/exports/${jobId}/${action}`, {
          token,
          method: 'POST',
          body: JSON.stringify({ reason: reason.trim() }),
        });
        await Promise.all([loadJobs(), loadStats()]);
        return true;
      } catch (err) {
        setError(getApiErrorMessage(err, `Failed to ${action} export job.`));
        return false;
      } finally {
        setActioningId(null);
        setActionType(null);
      }
    },
    [loadJobs, loadStats],
  );

  const markDelivered = useCallback(
    async (jobId: string, reason: string): Promise<boolean> => {
      if (!reason.trim()) return false;
      setActioningId(jobId);
      setActionType('delivered');
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/exports/${jobId}/delivered`, {
          token,
          method: 'PATCH',
          body: JSON.stringify({ reason: reason.trim() }),
        });
        await Promise.all([loadJobs(), loadStats()]);
        return true;
      } catch (err) {
        setError(
          getApiErrorMessage(err, 'Failed to mark export job as delivered.'),
        );
        return false;
      } finally {
        setActioningId(null);
        setActionType(null);
      }
    },
    [loadJobs, loadStats],
  );

  const requestExportOnExit = useCallback(
    async (businessId: string, reason: string): Promise<boolean> => {
      // Bug fix: previously hardcoded reason='Platform export request',
      // ignoring user input.
      if (!businessId || !reason.trim()) return false;
      setExportingOnExit(true);
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch('/platform/exports/on-exit', {
          token,
          method: 'POST',
          body: JSON.stringify({ businessId, reason: reason.trim() }),
        });
        await Promise.all([loadJobs(), loadStats()]);
        return true;
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to request export on exit.'));
        return false;
      } finally {
        setExportingOnExit(false);
      }
    },
    [loadJobs, loadStats],
  );

  const applyFilters = useCallback(() => {
    // Bug fix: previously didn't reset pagination on filter apply
    setCursorStack([null]);
    setPage(1);
    setAppliedFilters(filters);
  }, [filters]);

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
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

  return {
    jobs,
    stats,
    isLoading,
    isLoadingStats,
    error,
    filters,
    setFilters,
    applyFilters,
    resetFilters,
    page,
    hasNextPage: Boolean(nextCursor),
    hasPrevPage: page > 1,
    nextPage,
    prevPage,
    actioningId,
    actionType,
    performAction,
    markDelivered,
    exportingOnExit,
    requestExportOnExit,
    refresh: loadJobs,
    refreshStats: loadStats,
  };
}
