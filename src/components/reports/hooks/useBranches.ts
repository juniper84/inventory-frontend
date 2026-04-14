'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';

export type Branch = { id: string; name: string };

// Session-level cache — branches rarely change within a user session
let cachedBranches: Branch[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Cached branch list fetcher — avoids re-fetching on every report reload */
export function useBranches() {
  const [branches, setBranches] = useState<Branch[]>(cachedBranches ?? []);
  const [isLoading, setIsLoading] = useState(!cachedBranches);

  useEffect(() => {
    const isStale = Date.now() - cacheTimestamp > CACHE_TTL;
    if (cachedBranches && !isStale) {
      setBranches(cachedBranches);
      setIsLoading(false);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', { token })
      .then((data) => {
        if (cancelled) return;
        const items = normalizePaginated(data).items;
        cachedBranches = items;
        cacheTimestamp = Date.now();
        setBranches(items);
      })
      .catch(() => {
        /* keep existing branches on error */
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { branches, isLoading };
}
