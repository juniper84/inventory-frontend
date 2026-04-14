'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';

export type IncidentStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'MITIGATED'
  | 'RESOLVED'
  | 'CLOSED';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentEvent = {
  id: string;
  eventType: string;
  note?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  createdAt: string;
  createdByAdminId?: string | null;
};

export type Incident = {
  id: string;
  businessId: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  title?: string | null;
  reason: string;
  source: string;
  ownerPlatformAdminId?: string | null;
  createdByPlatformAdminId?: string | null;
  openedAt: string;
  closedAt?: string | null;
  updatedAt: string;
  business?: { name: string } | null;
  events?: IncidentEvent[];
};

export type IncidentForm = {
  businessId: string;
  title: string;
  reason: string;
  severity: IncidentSeverity;
};

export type IncidentFilters = {
  status: 'ALL' | IncidentStatus;
  businessId: string;
  severity: '' | IncidentSeverity;
};

const PAGE_SIZE = 20;

const INITIAL_FORM: IncidentForm = {
  businessId: '',
  title: '',
  reason: '',
  severity: 'MEDIUM',
};

const INITIAL_FILTERS: IncidentFilters = {
  status: 'ALL',
  businessId: '',
  severity: '',
};

// Frontend mirror of the backend INCIDENT_STATUS_TRANSITIONS map
// Backend: backend/src/platform/platform.service.ts:128
export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  OPEN: ['INVESTIGATING', 'MITIGATED', 'RESOLVED', 'CLOSED'],
  INVESTIGATING: ['MITIGATED', 'RESOLVED', 'CLOSED'],
  MITIGATED: ['INVESTIGATING', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'INVESTIGATING'],
  CLOSED: ['INVESTIGATING'],
};

type ListResponse = {
  items: Incident[];
  nextCursor?: string | null;
};

export function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<IncidentForm>(INITIAL_FORM);
  const [filters, setFilters] = useState<IncidentFilters>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<IncidentFilters>(INITIAL_FILTERS);

  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(1);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [addingNoteId, setAddingNoteId] = useState<string | null>(null);
  const [savingSeverityId, setSavingSeverityId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cursor = cursorStack[cursorStack.length - 1] ?? null;

  const loadIncidents = useCallback(async () => {
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
      const data = await apiFetch<ListResponse>(
        `/platform/incidents?${params.toString()}`,
        { token },
      );
      if (!mountedRef.current) return;
      setIncidents(data.items ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(getApiErrorMessage(err, 'Failed to load incidents.'));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [cursor, appliedFilters]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const createIncident = useCallback(async (): Promise<boolean> => {
    if (!form.businessId || !form.reason.trim()) return false;
    setIsCreating(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return false;
      await apiFetch('/platform/incidents', {
        token,
        method: 'POST',
        body: JSON.stringify({
          businessId: form.businessId,
          title: form.title.trim() || undefined,
          reason: form.reason.trim(),
          severity: form.severity,
        }),
      });
      setForm(INITIAL_FORM);
      await loadIncidents();
      return true;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create incident.'));
      return false;
    } finally {
      setIsCreating(false);
    }
  }, [form, loadIncidents]);

  const transitionIncident = useCallback(
    async (
      incidentId: string,
      toStatus: IncidentStatus,
      reason: string,
      note?: string,
    ): Promise<boolean> => {
      // Bug fix: previously sent { toStatus, note } and never sent `reason`,
      // causing every transition call to fail with 400 "Reason is required."
      if (!reason.trim()) return false;
      setTransitioningId(incidentId);
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/incidents/${incidentId}/transition`, {
          token,
          method: 'POST',
          body: JSON.stringify({
            toStatus,
            reason: reason.trim(),
            note: note?.trim() || undefined,
          }),
        });
        await loadIncidents();
        return true;
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to transition incident.'));
        return false;
      } finally {
        setTransitioningId(null);
      }
    },
    [loadIncidents],
  );

  const addIncidentNote = useCallback(
    async (incidentId: string, note: string): Promise<boolean> => {
      if (!note.trim()) return false;
      setAddingNoteId(incidentId);
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/incidents/${incidentId}/note`, {
          token,
          method: 'POST',
          body: JSON.stringify({ note: note.trim() }),
        });
        await loadIncidents();
        return true;
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to add note.'));
        return false;
      } finally {
        setAddingNoteId(null);
      }
    },
    [loadIncidents],
  );

  const updateSeverity = useCallback(
    async (
      incidentId: string,
      severity: IncidentSeverity,
    ): Promise<boolean> => {
      setSavingSeverityId(incidentId);
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/incidents/${incidentId}`, {
          token,
          method: 'PATCH',
          body: JSON.stringify({ severity }),
        });
        await loadIncidents();
        return true;
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to update severity.'));
        return false;
      } finally {
        setSavingSeverityId(null);
      }
    },
    [loadIncidents],
  );

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
    incidents,
    isLoading,
    error,
    form,
    setForm,
    filters,
    setFilters,
    applyFilters,
    resetFilters,
    page,
    hasNextPage: Boolean(nextCursor),
    hasPrevPage: page > 1,
    nextPage,
    prevPage,
    isCreating,
    createIncident,
    transitioningId,
    transitionIncident,
    addingNoteId,
    addIncidentNote,
    savingSeverityId,
    updateSeverity,
    refresh: loadIncidents,
  };
}
