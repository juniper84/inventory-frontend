'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type ReportFilters = {
  branchId: string;
  startDate: string;
  endDate: string;
};

const EMPTY_FILTERS: ReportFilters = { branchId: '', startDate: '', endDate: '' };

/**
 * URL-driven filter state for the reports page.
 * Syncs filters to URL with debouncing and scroll preservation.
 */
export function useReportFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<ReportFilters>(() => ({
    branchId: searchParams.get('branchId') ?? '',
    startDate: searchParams.get('startDate') ?? '',
    endDate: searchParams.get('endDate') ?? '',
  }));

  // Sync URL -> state on navigation
  useEffect(() => {
    setFilters({
      branchId: searchParams.get('branchId') ?? '',
      startDate: searchParams.get('startDate') ?? '',
      endDate: searchParams.get('endDate') ?? '',
    });
  }, [searchParams]);

  // Sync state -> URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ['branchId', 'startDate', 'endDate'] as const) {
      if (filters[key]) params.set(key, filters[key]);
      else params.delete(key);
    }
    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ''}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.branchId, filters.startDate, filters.endDate]);

  const updateFilter = useCallback(
    <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
  }, []);

  /** Build URLSearchParams for API calls */
  const toSearchParams = useCallback(
    (extra?: Record<string, string>): URLSearchParams => {
      const params = new URLSearchParams();
      if (filters.branchId) params.set('branchId', filters.branchId);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (extra) {
        for (const [k, v] of Object.entries(extra)) params.set(k, v);
      }
      return params;
    },
    [filters],
  );

  return { filters, updateFilter, resetFilters, toSearchParams };
}
