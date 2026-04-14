'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';
import type { Business, BusinessesCounts } from '@/components/platform/types';
import { useBusinessWorkspaceContext } from '../context/BusinessWorkspaceContext';

type StatusFilter = 'ALL' | 'TRIAL' | 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'SUSPENDED' | 'ARCHIVED';
type TierFilter = 'ALL' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
type SortMode = 'pinnedFirst' | 'name' | 'lastActivity' | 'expiry' | 'health';

type ListResponse = {
  items: Business[];
  nextCursor?: string | null;
  total?: number;
};

const PAGE_SIZE = 20;

/**
 * Manages all data, search, filter, sort, pagination, and pin state for the
 * business registry page. Replaces parts of the 494-line usePlatformConsoleLoaders
 * with a focused, registry-only hook.
 */
export function useBusinessRegistry() {
  const { pinnedIds, togglePin, isPinned } = useBusinessWorkspaceContext();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [counts, setCounts] = useState<BusinessesCounts | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [tierFilter, setTierFilter] = useState<TierFilter>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('pinnedFirst');

  // Pagination
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(1);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadBusinesses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;

      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const data = await apiFetch<ListResponse>(`/platform/businesses?${params.toString()}`, { token });

      if (!mountedRef.current) return;
      setBusinesses(data.items ?? []);
      setNextCursor(data.nextCursor ?? null);
      setTotal(data.total ?? 0);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load businesses');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [cursor, statusFilter, search]);

  const loadCounts = useCallback(async () => {
    setIsLoadingCounts(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const data = await apiFetch<BusinessesCounts>('/platform/businesses/counts', { token });
      if (mountedRef.current) setCounts(data);
    } catch {
      // Counts are non-critical — silently fail
    } finally {
      if (mountedRef.current) setIsLoadingCounts(false);
    }
  }, []);

  // Reload list when filters/cursor change
  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  // Load counts once on mount
  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // Reset pagination + selection when search/filters change
  useEffect(() => {
    setCursor(null);
    setCursorStack([null]);
    setPage(1);
    setSelectedIds(new Set());
  }, [search, statusFilter]);

  // Client-side tier filter + sort (filter is server-side except tier)
  const visibleBusinesses = useMemo(() => {
    let result = [...businesses];

    // Tier filter (client-side because backend doesn't support tier filter yet)
    if (tierFilter !== 'ALL') {
      result = result.filter((b) => b.subscription?.tier === tierFilter);
    }

    // Sort
    const compareName = (a: Business, b: Business) => a.name.localeCompare(b.name);
    const compareLastActivity = (a: Business, b: Business) => {
      const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return bTime - aTime;
    };
    const compareExpiry = (a: Business, b: Business) => {
      const aExp = a.subscription?.expiresAt ?? a.subscription?.trialEndsAt;
      const bExp = b.subscription?.expiresAt ?? b.subscription?.trialEndsAt;
      const aTime = aExp ? new Date(aExp).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = bExp ? new Date(bExp).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    };
    const compareHealth = (a: Business, b: Business) => (a.healthScore ?? 100) - (b.healthScore ?? 100);

    switch (sortMode) {
      case 'name':
        result.sort(compareName);
        break;
      case 'lastActivity':
        result.sort(compareLastActivity);
        break;
      case 'expiry':
        result.sort(compareExpiry);
        break;
      case 'health':
        result.sort(compareHealth);
        break;
      case 'pinnedFirst':
      default:
        // Pinned first, then by last activity desc
        result.sort((a, b) => {
          const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
          const bPinned = pinnedIds.includes(b.id) ? 1 : 0;
          if (aPinned !== bPinned) return bPinned - aPinned;
          return compareLastActivity(a, b);
        });
        break;
    }

    return result;
  }, [businesses, tierFilter, sortMode, pinnedIds]);

  // Pagination handlers
  const goNext = useCallback(() => {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev, nextCursor]);
    setCursor(nextCursor);
    setPage((p) => p + 1);
  }, [nextCursor]);

  const goPrev = useCallback(() => {
    if (page <= 1) return;
    setCursorStack((prev) => {
      const next = [...prev];
      next.pop();
      const target = next[next.length - 1] ?? null;
      setCursor(target);
      return next;
    });
    setPage((p) => Math.max(1, p - 1));
  }, [page]);

  const refresh = useCallback(() => {
    loadBusinesses();
    loadCounts();
  }, [loadBusinesses, loadCounts]);

  // Bulk selection helpers
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectAllOnPage = useCallback(() => {
    setSelectedIds(new Set(visibleBusinesses.map((b) => b.id)));
  }, [visibleBusinesses]);

  const allOnPageSelected = useMemo(
    () => visibleBusinesses.length > 0 && visibleBusinesses.every((b) => selectedIds.has(b.id)),
    [visibleBusinesses, selectedIds],
  );

  return {
    // Data
    businesses,
    visibleBusinesses,
    counts,
    total,
    page,
    pageSize: PAGE_SIZE,
    hasNext: !!nextCursor,
    hasPrev: page > 1,
    isLoading,
    isLoadingCounts,
    error,
    // Filters
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    tierFilter,
    setTierFilter,
    sortMode,
    setSortMode,
    // Pagination
    goNext,
    goPrev,
    // Pinning
    pinnedIds,
    togglePin,
    isPinned,
    // Bulk selection
    selectedIds: Array.from(selectedIds),
    selectedCount: selectedIds.size,
    isSelected,
    toggleSelected,
    clearSelection,
    selectAllOnPage,
    allOnPageSelected,
    // Actions
    refresh,
  };
}

export type { StatusFilter, TierFilter, SortMode };
