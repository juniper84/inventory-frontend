'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';

export type AuditAction = {
  id: string;
  action: string;
  outcome: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
};

export type Investigation = {
  id: string;
  key: string;
  groupType: 'correlation' | 'request' | 'session' | 'entry';
  businessId: string;
  businessName?: string;
  startedAt: string;
  latestAt: string;
  count: number;
  outcomes: Record<string, number>;
  actions: AuditAction[];
  resourceSummary?: Record<string, number>;
  linkedAdminActions?: AuditAction[];
};

export type InvestigationsResponse = {
  items: Investigation[];
  nextCursor?: string | null;
};

export type AuditFilters = {
  businessId: string;
  action: string;
  outcome: 'ALL' | 'SUCCESS' | 'FAILURE';
  from: string;
  to: string;
};

const INITIAL_FILTERS: AuditFilters = {
  businessId: '',
  action: '',
  outcome: 'ALL',
  from: '',
  to: '',
};

const PAGE_SIZE = 20;

export function useAuditInvestigations() {
  const [items, setItems] = useState<Investigation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<AuditFilters>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<AuditFilters>(INITIAL_FILTERS);

  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(1);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cursor = cursorStack[cursorStack.length - 1] ?? null;

  const loadInvestigations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      if (appliedFilters.businessId)
        params.set('businessId', appliedFilters.businessId);
      if (appliedFilters.action) params.set('action', appliedFilters.action);
      if (appliedFilters.outcome !== 'ALL')
        params.set('outcome', appliedFilters.outcome);
      if (appliedFilters.from) params.set('from', appliedFilters.from);
      if (appliedFilters.to) params.set('to', appliedFilters.to);
      const data = await apiFetch<InvestigationsResponse>(
        `/platform/audit-logs/timeline?${params.toString()}`,
        { token },
      );
      if (!mountedRef.current) return;
      setItems(data.items ?? []);
      setNextCursor(data.nextCursor ?? null);
      // Bug fix: previously triggered infinite loop when length===0 drove
      // re-fetches. We only load on filter/cursor changes now — not on
      // items.length change. The length-check in the old code is gone.
    } catch (err) {
      if (!mountedRef.current) return;
      setError(getApiErrorMessage(err, 'Failed to load investigations'));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [cursor, appliedFilters]);

  useEffect(() => {
    loadInvestigations();
  }, [loadInvestigations]);

  const applyFilters = useCallback(() => {
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
    items,
    isLoading,
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
    refresh: loadInvestigations,
  };
}

// ── Admin activity (platform admin's own action log) ─────────────────────
export type AdminActivityEntry = {
  id: string;
  action: string;
  platformAdminId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  businessId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type AdminActivityResponse = {
  items: AdminActivityEntry[];
  nextCursor?: string | null;
};

export function useAdminActivity() {
  const [items, setItems] = useState<AdminActivityEntry[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const params = new URLSearchParams({ limit: '50' });
      if (search.trim()) params.set('action', search.trim());
      const data = await apiFetch<AdminActivityResponse>(
        `/platform/platform-audit-logs?${params.toString()}`,
        { token },
      );
      setItems(data.items ?? []);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load admin activity'));
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  return {
    items,
    isLoading,
    error,
    search,
    setSearch,
    refresh: loadActivity,
  };
}
