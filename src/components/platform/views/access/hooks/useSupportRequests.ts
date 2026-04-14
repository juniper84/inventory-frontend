'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getPlatformAccessToken, setSession } from '@/lib/auth';

export type SupportSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type SupportPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type SupportRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

export type SupportRequest = {
  id: string;
  businessId: string;
  business?: { name: string } | null;
  platformAdminId: string;
  reason: string;
  scope?: string[] | null;
  durationHours?: number | null;
  severity: SupportSeverity;
  priority: SupportPriority;
  status: SupportRequestStatus;
  requestedAt: string;
  decidedAt?: string | null;
  expiresAt?: string | null;
  decisionNote?: string | null;
  sessions?: {
    id: string;
    createdAt: string;
    expiresAt: string;
    revokedAt?: string | null;
  }[];
};

export type SupportRequestForm = {
  businessId: string;
  reason: string;
  durationHours: string;
  severity: SupportSeverity;
  priority: SupportPriority;
  scope: string[];
};

export type SupportRequestFilters = {
  status: 'ALL' | SupportRequestStatus | 'ACTIVATED';
  businessId: string;
  severity: string;
  requestedFrom: string;
  requestedTo: string;
};

const PAGE_SIZE = 20;
const SCOPE_OPTIONS = [
  'READ_PRODUCTS',
  'READ_SALES',
  'READ_CUSTOMERS',
  'READ_AUDIT_LOGS',
  'WRITE_NOTES',
];

const INITIAL_FORM: SupportRequestForm = {
  businessId: '',
  reason: '',
  durationHours: '4',
  severity: 'MEDIUM',
  priority: 'MEDIUM',
  scope: [],
};

const INITIAL_FILTERS: SupportRequestFilters = {
  status: 'ALL',
  businessId: '',
  severity: '',
  requestedFrom: '',
  requestedTo: '',
};

type ListResponse = {
  items: SupportRequest[];
  nextCursor?: string | null;
};

export function useSupportRequests() {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<SupportRequestForm>(INITIAL_FORM);
  const [filters, setFilters] = useState<SupportRequestFilters>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<SupportRequestFilters>(
    INITIAL_FILTERS,
  );

  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(1);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [pendingLogin, setPendingLogin] = useState<{
    requestId: string;
    token: string;
    businessId: string;
    expiresAt: string;
  } | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cursor = cursorStack[cursorStack.length - 1] ?? null;

  const loadRequests = useCallback(async () => {
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
      if (appliedFilters.severity)
        params.set('severity', appliedFilters.severity);
      if (appliedFilters.requestedFrom)
        params.set('requestedFrom', appliedFilters.requestedFrom);
      if (appliedFilters.requestedTo)
        params.set('requestedTo', appliedFilters.requestedTo);
      const data = await apiFetch<ListResponse>(
        `/platform/support-access/requests?${params.toString()}`,
        { token },
      );
      if (!mountedRef.current) return;
      setRequests(data.items ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(getApiErrorMessage(err, 'Failed to load support requests.'));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [cursor, appliedFilters]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const createRequest = useCallback(async (): Promise<boolean> => {
    if (!form.businessId || !form.reason.trim()) return false;
    setIsCreating(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return false;
      const durationHours = Number(form.durationHours);
      await apiFetch('/platform/support-access/requests', {
        token,
        method: 'POST',
        body: JSON.stringify({
          businessId: form.businessId,
          reason: form.reason.trim(),
          durationHours: Number.isFinite(durationHours)
            ? durationHours
            : undefined,
          severity: form.severity,
          priority: form.priority,
          scope: form.scope.length > 0 ? form.scope : undefined,
        }),
      });
      setForm(INITIAL_FORM);
      await loadRequests();
      return true;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create support request.'));
      return false;
    } finally {
      setIsCreating(false);
    }
  }, [form, loadRequests]);

  const activateRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      setActivatingId(requestId);
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        const data = await apiFetch<{
          token: string;
          businessId: string;
          expiresAt: string;
        }>(`/platform/support-access/requests/${requestId}/activate`, {
          token,
          method: 'POST',
        });
        setPendingLogin({
          requestId,
          token: data.token,
          businessId: data.businessId,
          expiresAt: data.expiresAt,
        });
        await loadRequests();
        return true;
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to activate request.'));
        return false;
      } finally {
        setActivatingId(null);
      }
    },
    [loadRequests],
  );

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const loginAsSupport = useCallback(
    async (locale: string): Promise<boolean> => {
      if (!pendingLogin) return false;
      setIsLoggingIn(true);
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        const loginResponse = await apiFetch<{
          accessToken: string;
          businessId: string;
          expiresAt: string;
        }>('/platform/support-access/login', {
          token,
          method: 'POST',
          body: JSON.stringify({ token: pendingLogin.token }),
        });
        setSession(loginResponse.accessToken, '', {
          id: 'support',
          email: 'support-access',
          name: `Support: ${loginResponse.businessId}`,
        });
        setPendingLogin(null);
        if (typeof window !== 'undefined') {
          window.open(`/${locale}`, '_blank');
        }
        return true;
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to start support session.'));
        return false;
      } finally {
        setIsLoggingIn(false);
      }
    },
    [pendingLogin],
  );

  const clearPendingLogin = useCallback(() => setPendingLogin(null), []);

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
    requests,
    isLoading,
    error,
    form,
    setForm,
    filters,
    setFilters,
    appliedFilters,
    applyFilters,
    resetFilters,
    page,
    hasNextPage: Boolean(nextCursor),
    hasPrevPage: page > 1,
    nextPage,
    prevPage,
    isCreating,
    createRequest,
    activatingId,
    activateRequest,
    pendingLogin,
    isLoggingIn,
    loginAsSupport,
    clearPendingLogin,
    refresh: loadRequests,
    scopeOptions: SCOPE_OPTIONS,
  };
}
