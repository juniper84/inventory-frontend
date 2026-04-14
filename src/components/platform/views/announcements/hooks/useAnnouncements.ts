'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';

export type AnnouncementSeverity = 'INFO' | 'WARNING' | 'SECURITY';

export type Announcement = {
  id: string;
  title: string;
  message: string;
  severity: AnnouncementSeverity;
  reason?: string | null;
  startsAt: string;
  endsAt?: string | null;
  createdByPlatformAdminId?: string | null;
  createdAt: string;
  updatedAt: string;
  businessTargets: { businessId: string }[];
  segmentTargets: { type: 'TIER' | 'STATUS'; value: string }[];
};

export type AnnouncementForm = {
  title: string;
  message: string;
  severity: AnnouncementSeverity;
  reason: string;
  publishImmediately: boolean;
  startsAt: string; // ISO local string when scheduled
  endMode: 'never' | 'duration' | 'date';
  endDurationHours: number | null;
  endsAt: string;
  scope: 'broadcast' | 'segment' | 'specific';
  targetBusinessIds: string[];
  targetTiers: string[];
  targetStatuses: string[];
};

export type AudiencePreview = {
  estimatedReach: {
    total: number;
    explicit: number;
    segment: number;
  };
  filters: {
    hasBroadcastScope: boolean;
    targetBusinessIds: string[];
    targetTiers: string[];
    targetStatuses: string[];
  };
  sampleBusinesses: {
    id: string;
    name: string;
    businessStatus: string;
    subscriptionTier?: string | null;
    subscriptionStatus?: string | null;
  }[];
};

export type AnnouncementsFilters = {
  status: 'ALL' | 'active' | 'upcoming' | 'ended';
  severity: '' | AnnouncementSeverity;
};

export const INITIAL_FORM: AnnouncementForm = {
  title: '',
  message: '',
  severity: 'INFO',
  reason: '',
  publishImmediately: true,
  startsAt: '',
  endMode: 'never',
  endDurationHours: null,
  endsAt: '',
  scope: 'broadcast',
  targetBusinessIds: [],
  targetTiers: [],
  targetStatuses: [],
};

const PAGE_SIZE = 20;

const INITIAL_FILTERS: AnnouncementsFilters = {
  status: 'ALL',
  severity: '',
};

type ListResponse = {
  items: Announcement[];
  nextCursor?: string | null;
};

function computeTargetSignature(form: AnnouncementForm): string {
  if (form.scope === 'broadcast') return 'broadcast';
  const ids = [...form.targetBusinessIds].sort().join(',');
  const tiers = [...form.targetTiers].sort().join(',');
  const statuses = [...form.targetStatuses].sort().join(',');
  return `${form.scope}|${ids}|${tiers}|${statuses}`;
}

function computeStartsEnd(form: AnnouncementForm): {
  startsAt?: Date;
  endsAt: Date | null;
} {
  const startsAt = form.publishImmediately
    ? undefined
    : form.startsAt
      ? new Date(form.startsAt)
      : undefined;

  let endsAt: Date | null = null;
  if (form.endMode === 'duration' && form.endDurationHours) {
    const base = startsAt ?? new Date();
    endsAt = new Date(base.getTime() + form.endDurationHours * 60 * 60 * 1000);
  } else if (form.endMode === 'date' && form.endsAt) {
    endsAt = new Date(form.endsAt);
  }
  return { startsAt, endsAt };
}

export function useAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<AnnouncementForm>(INITIAL_FORM);
  const [filters, setFilters] = useState<AnnouncementsFilters>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<AnnouncementsFilters>(INITIAL_FILTERS);

  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(1);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [audience, setAudience] = useState<AudiencePreview | null>(null);
  const [previewSignature, setPreviewSignature] = useState<string>('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const targetSignature = computeTargetSignature(form);

  const loadAnnouncements = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      if (appliedFilters.status !== 'ALL')
        params.set('status', appliedFilters.status);
      if (appliedFilters.severity)
        params.set('severity', appliedFilters.severity);
      const data = await apiFetch<ListResponse>(
        `/platform/announcements?${params.toString()}`,
        { token },
      );
      if (!mountedRef.current) return;
      setItems(data.items ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(getApiErrorMessage(err, 'Failed to load announcements.'));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [cursor, appliedFilters]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  // Auto-refresh every 60s to update timeline bucketing
  useEffect(() => {
    const id = setInterval(loadAnnouncements, 60_000);
    return () => clearInterval(id);
  }, [loadAnnouncements]);

  const previewAudience = useCallback(async (): Promise<boolean> => {
    setIsPreviewing(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return false;
      const data = await apiFetch<AudiencePreview>(
        '/platform/announcements/preview',
        {
          token,
          method: 'POST',
          body: JSON.stringify({
            targetBusinessIds:
              form.scope === 'specific' ? form.targetBusinessIds : [],
            targetTiers: form.scope === 'segment' ? form.targetTiers : [],
            targetStatuses: form.scope === 'segment' ? form.targetStatuses : [],
          }),
        },
      );
      setAudience(data);
      setPreviewSignature(targetSignature);
      return true;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to preview audience.'));
      return false;
    } finally {
      setIsPreviewing(false);
    }
  }, [form, targetSignature]);

  const createAnnouncement = useCallback(async (): Promise<boolean> => {
    if (!form.title.trim() || !form.message.trim()) return false;
    if (previewSignature !== targetSignature) return false;
    setIsCreating(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return false;
      const { startsAt, endsAt } = computeStartsEnd(form);
      await apiFetch('/platform/announcements', {
        token,
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          message: form.message.trim(),
          severity: form.severity,
          reason: form.reason.trim() || undefined,
          startsAt: startsAt ? startsAt.toISOString() : undefined,
          endsAt: endsAt ? endsAt.toISOString() : null,
          targetBusinessIds:
            form.scope === 'specific' ? form.targetBusinessIds : [],
          targetTiers: form.scope === 'segment' ? form.targetTiers : [],
          targetStatuses: form.scope === 'segment' ? form.targetStatuses : [],
        }),
      });
      setForm(INITIAL_FORM);
      setAudience(null);
      setPreviewSignature('');
      await loadAnnouncements();
      return true;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create announcement.'));
      return false;
    } finally {
      setIsCreating(false);
    }
  }, [form, previewSignature, targetSignature, loadAnnouncements]);

  const updateAnnouncement = useCallback(
    async (
      id: string,
      patch: {
        title?: string;
        message?: string;
        severity?: AnnouncementSeverity;
        reason?: string | null;
        startsAt?: Date | null;
        endsAt?: Date | null;
        targetBusinessIds?: string[];
        targetTiers?: string[];
        targetStatuses?: string[];
      },
    ): Promise<boolean> => {
      setSavingEditId(id);
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/announcements/${id}`, {
          token,
          method: 'PATCH',
          body: JSON.stringify({
            ...patch,
            startsAt: patch.startsAt ? patch.startsAt.toISOString() : patch.startsAt,
            endsAt:
              patch.endsAt === undefined
                ? undefined
                : patch.endsAt === null
                  ? null
                  : patch.endsAt.toISOString(),
          }),
        });
        await loadAnnouncements();
        setEditingId(null);
        return true;
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to update announcement.'));
        return false;
      } finally {
        setSavingEditId(null);
      }
    },
    [loadAnnouncements],
  );

  const endAnnouncement = useCallback(
    async (id: string): Promise<boolean> => {
      setEndingId(id);
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/announcements/${id}/end`, {
          token,
          method: 'PATCH',
        });
        await loadAnnouncements();
        return true;
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to end announcement.'));
        return false;
      } finally {
        setEndingId(null);
      }
    },
    [loadAnnouncements],
  );

  const deleteAnnouncement = useCallback(
    async (id: string): Promise<boolean> => {
      setDeletingId(id);
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/announcements/${id}`, {
          token,
          method: 'DELETE',
        });
        await loadAnnouncements();
        return true;
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to delete announcement.'));
        return false;
      } finally {
        setDeletingId(null);
      }
    },
    [loadAnnouncements],
  );

  const duplicateFromAnnouncement = useCallback((announcement: Announcement) => {
    const tierTargets = announcement.segmentTargets
      .filter((s) => s.type === 'TIER')
      .map((s) => s.value);
    const statusTargets = announcement.segmentTargets
      .filter((s) => s.type === 'STATUS')
      .map((s) => s.value);
    const businessIds = announcement.businessTargets.map((b) => b.businessId);
    const scope: AnnouncementForm['scope'] =
      businessIds.length > 0
        ? 'specific'
        : tierTargets.length > 0 || statusTargets.length > 0
          ? 'segment'
          : 'broadcast';
    setForm({
      title: announcement.title,
      message: announcement.message,
      severity: announcement.severity,
      reason: announcement.reason ?? '',
      publishImmediately: true,
      startsAt: '',
      endMode: 'never',
      endDurationHours: null,
      endsAt: '',
      scope,
      targetBusinessIds: businessIds,
      targetTiers: tierTargets,
      targetStatuses: statusTargets,
    });
    setAudience(null);
    setPreviewSignature('');
  }, []);

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

  // ── Computed lifecycle stats for KPIs ──
  const now = Date.now();
  const activeCount = items.filter(
    (a) =>
      new Date(a.startsAt).getTime() <= now &&
      (a.endsAt === null ||
        a.endsAt === undefined ||
        new Date(a.endsAt).getTime() > now),
  ).length;
  const upcomingCount = items.filter(
    (a) => new Date(a.startsAt).getTime() > now,
  ).length;
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const endedThisMonth = items.filter(
    (a) =>
      a.endsAt &&
      new Date(a.endsAt).getTime() < now &&
      new Date(a.endsAt).getTime() >= startOfMonth.getTime(),
  ).length;

  const targetingChanged =
    audience !== null && previewSignature !== targetSignature;

  return {
    items,
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
    audience,
    isPreviewing,
    previewAudience,
    targetingChanged,
    isCreating,
    createAnnouncement,
    editingId,
    setEditingId,
    savingEditId,
    updateAnnouncement,
    endingId,
    endAnnouncement,
    deletingId,
    deleteAnnouncement,
    duplicateFromAnnouncement,
    refresh: loadAnnouncements,
    activeCount,
    upcomingCount,
    endedThisMonth,
  };
}
