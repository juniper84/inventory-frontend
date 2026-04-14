'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';
import type { Business, BusinessWorkspace, PlatformBusinessNote } from '@/components/platform/types';
import { useBusinessWorkspaceContext } from '../context/BusinessWorkspaceContext';

export type ProvisionForm = {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerTempPassword: string;
  tier: 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
};

type PaginatedNotes = { items: PlatformBusinessNote[]; nextCursor?: string | null };

/**
 * Workspace hook — handles all data loading and mutations for a single business
 * workspace page. Per-tab loaders auto-fire when their tab mounts.
 */
export function useBusinessWorkspace(businessId?: string | null) {
  const ctx = useBusinessWorkspaceContext();
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    if (!businessId) return;
    setIsLoadingWorkspace(true);
    setWorkspaceError(null);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const data = await apiFetch<BusinessWorkspace>(`/platform/businesses/${businessId}/workspace`, { token });
      ctx.setWorkspaceData(data);
    } catch (err) {
      setWorkspaceError(getApiErrorMessage(err, 'Failed to load workspace'));
    } finally {
      setIsLoadingWorkspace(false);
    }
  }, [businessId, ctx]);

  // Auto-load workspace when businessId changes
  useEffect(() => {
    if (businessId && ctx.selectedBusinessId !== businessId) {
      ctx.setSelectedBusinessId(businessId);
    }
    if (businessId) {
      loadWorkspace();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // ── Mutations ──

  const provisionBusiness = useCallback(
    async (form: ProvisionForm): Promise<Business | null> => {
      setIsProvisioning(true);
      try {
        const token = getPlatformAccessToken();
        if (!token) return null;
        const created = await apiFetch<Business>('/platform/businesses', {
          token,
          method: 'POST',
          body: JSON.stringify(form),
        });
        ctx.setBanner({
          text: `Business "${created.name}" created successfully`,
          severity: 'success',
        });
        return created;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to create business'),
          severity: 'error',
        });
        return null;
      } finally {
        setIsProvisioning(false);
      }
    },
    [ctx],
  );

  const forceLogout = useCallback(
    async (reason: string): Promise<boolean> => {
      if (!businessId) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/businesses/${businessId}/revoke-sessions`, {
          token,
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
        ctx.setBanner({ text: 'All sessions revoked', severity: 'success' });
        loadWorkspace();
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to revoke sessions'),
          severity: 'error',
        });
        return false;
      }
    },
    [businessId, ctx, loadWorkspace],
  );

  const toggleReadOnly = useCallback(
    async (enabled: boolean, reason?: string): Promise<boolean> => {
      if (!businessId) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/businesses/${businessId}/read-only`, {
          token,
          method: 'PATCH',
          body: JSON.stringify({ enabled, reason }),
        });
        ctx.setBanner({
          text: enabled ? 'Read-only mode enabled' : 'Read-only mode disabled',
          severity: 'success',
        });
        loadWorkspace();
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to update read-only mode'),
          severity: 'error',
        });
        return false;
      }
    },
    [businessId, ctx, loadWorkspace],
  );

  // ── Notes ──

  const [notes, setNotes] = useState<PlatformBusinessNote[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!businessId) return;
    setIsLoadingNotes(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const data = await apiFetch<PaginatedNotes>(`/platform/businesses/${businessId}/notes`, { token });
      setNotes(data.items ?? []);
    } catch {
      // silent — banner shown only on mutation errors
    } finally {
      setIsLoadingNotes(false);
    }
  }, [businessId]);

  const createNote = useCallback(
    async (body: string): Promise<boolean> => {
      if (!businessId || !body.trim()) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/businesses/${businessId}/notes`, {
          token,
          method: 'POST',
          body: JSON.stringify({ body: body.trim() }),
        });
        await loadNotes();
        ctx.setBanner({ text: 'Note added', severity: 'success' });
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to add note'),
          severity: 'error',
        });
        return false;
      }
    },
    [businessId, ctx, loadNotes],
  );

  const deleteNote = useCallback(
    async (noteId: string): Promise<boolean> => {
      if (!businessId) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/businesses/${businessId}/notes/${noteId}`, {
          token,
          method: 'DELETE',
        });
        await loadNotes();
        ctx.setBanner({ text: 'Note deleted', severity: 'success' });
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to delete note'),
          severity: 'error',
        });
        return false;
      }
    },
    [businessId, ctx, loadNotes],
  );

  // ── Devices ──

  const [devices, setDevices] = useState<NonNullable<BusinessWorkspace['devices']>>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  const loadDevices = useCallback(async () => {
    if (!businessId) return;
    setIsLoadingDevices(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const data = await apiFetch<NonNullable<BusinessWorkspace['devices']>>(
        `/platform/businesses/${businessId}/devices`,
        { token },
      );
      setDevices(data ?? []);
    } catch {
      // silent
    } finally {
      setIsLoadingDevices(false);
    }
  }, [businessId]);

  const revokeDevice = useCallback(
    async (deviceId: string, reason: string): Promise<boolean> => {
      if (!reason.trim()) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/devices/${deviceId}/revoke`, {
          token,
          method: 'POST',
          body: JSON.stringify({ reason: reason.trim() }),
        });
        await loadDevices();
        ctx.setBanner({ text: 'Device revoked', severity: 'success' });
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to revoke device'),
          severity: 'error',
        });
        return false;
      }
    },
    [ctx, loadDevices],
  );

  // ── Subscription purchases ──

  type SubscriptionPurchase = {
    id: string;
    tier: string;
    months: number;
    durationDays: number;
    startsAt: string;
    expiresAt: string;
    isPaid: boolean;
    amountDue: number;
    reason?: string | null;
    createdAt: string;
  };

  type SubscriptionHistoryEntry = {
    id: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    previousTier?: string | null;
    newTier?: string | null;
    reason?: string | null;
    createdAt: string;
  };

  type SubscriptionRequest = {
    id: string;
    type: 'SUBSCRIBE' | 'UPGRADE' | 'CANCEL';
    requestedTier?: string | null;
    requestedDurationMonths?: number | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reason?: string | null;
    responseNote?: string | null;
    createdAt: string;
    decidedAt?: string | null;
  };

  const [purchases, setPurchases] = useState<SubscriptionPurchase[]>([]);
  const [subscriptionHistory, setSubscriptionHistory] = useState<SubscriptionHistoryEntry[]>([]);
  const [pendingRequests, setPendingRequests] = useState<SubscriptionRequest[]>([]);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);

  const loadSubscriptionData = useCallback(async () => {
    if (!businessId) return;
    setIsLoadingSubscription(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const [purchasesData, historyData, requestsData] = await Promise.all([
        apiFetch<{ items: SubscriptionPurchase[] } | SubscriptionPurchase[]>(`/platform/subscriptions/${businessId}/purchases`, { token }).catch(() => ({ items: [] })),
        apiFetch<SubscriptionHistoryEntry[]>(`/platform/subscriptions/${businessId}/history`, { token }).catch(() => []),
        apiFetch<{ items: SubscriptionRequest[] } | SubscriptionRequest[]>(`/platform/subscription-requests?businessId=${businessId}&status=PENDING`, { token }).catch(() => ({ items: [] })),
      ]);
      const pItems = Array.isArray(purchasesData) ? purchasesData : (purchasesData?.items ?? []);
      const rItems = Array.isArray(requestsData) ? requestsData : (requestsData?.items ?? []);
      setPurchases(pItems);
      setSubscriptionHistory(Array.isArray(historyData) ? historyData : []);
      setPendingRequests(rItems.filter((r) => r.status === 'PENDING'));
    } catch {
      // silent
    } finally {
      setIsLoadingSubscription(false);
    }
  }, [businessId]);

  const recordPurchase = useCallback(
    async (data: {
      tier: 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
      months: number;
      isPaid: boolean;
      amountDue?: number;
      reason: string;
    }): Promise<boolean> => {
      if (!businessId || !data.reason.trim()) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/subscriptions/${businessId}/purchase`, {
          token,
          method: 'POST',
          body: JSON.stringify({
            tier: data.tier,
            months: data.months,
            isPaid: data.isPaid,
            amountDue: data.amountDue ?? 0,
            reason: data.reason,
          }),
        });
        ctx.setBanner({ text: 'Subscription purchase recorded', severity: 'success' });
        await Promise.all([loadWorkspace(), loadSubscriptionData()]);
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to record purchase'),
          severity: 'error',
        });
        return false;
      }
    },
    [businessId, ctx, loadWorkspace, loadSubscriptionData],
  );

  const decideSubscriptionRequest = useCallback(
    async (
      requestId: string,
      decision: 'approve' | 'reject',
      data: { responseNote?: string; durationMonths?: number; isPaid?: boolean; amountDue?: number },
    ): Promise<boolean> => {
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/subscription-requests/${requestId}/${decision}`, {
          token,
          method: 'POST',
          body: JSON.stringify(data),
        });
        ctx.setBanner({
          text: decision === 'approve' ? 'Request approved' : 'Request rejected',
          severity: 'success',
        });
        await Promise.all([loadWorkspace(), loadSubscriptionData()]);
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to decide request'),
          severity: 'error',
        });
        return false;
      }
    },
    [ctx, loadWorkspace, loadSubscriptionData],
  );

  // ── Status / review / rate limits ──

  const updateStatus = useCallback(
    async (status: string, reason: string): Promise<boolean> => {
      if (!businessId || !reason.trim()) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/businesses/${businessId}/status`, {
          token,
          method: 'PATCH',
          body: JSON.stringify({ status, reason: reason.trim() }),
        });
        ctx.setBanner({ text: `Status changed to ${status}`, severity: 'success' });
        await loadWorkspace();
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to change status'),
          severity: 'error',
        });
        return false;
      }
    },
    [businessId, ctx, loadWorkspace],
  );

  const updateReview = useCallback(
    async (data: { underReview: boolean; reason: string; severity?: string }): Promise<boolean> => {
      if (!businessId || !data.reason.trim()) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/businesses/${businessId}/review`, {
          token,
          method: 'PATCH',
          body: JSON.stringify(data),
        });
        ctx.setBanner({
          text: data.underReview ? 'Review flag enabled' : 'Review flag cleared',
          severity: 'success',
        });
        await loadWorkspace();
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to update review flag'),
          severity: 'error',
        });
        return false;
      }
    },
    [businessId, ctx, loadWorkspace],
  );

  const updateRateLimits = useCallback(
    async (data: {
      limit?: number | null;
      ttlSeconds?: number | null;
      expiresAt?: string | null;
      reason: string;
    }): Promise<boolean> => {
      if (!businessId || !data.reason.trim()) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/businesses/${businessId}/rate-limits`, {
          token,
          method: 'PATCH',
          body: JSON.stringify(data),
        });
        ctx.setBanner({ text: 'Rate limits updated', severity: 'success' });
        await loadWorkspace();
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to update rate limits'),
          severity: 'error',
        });
        return false;
      }
    },
    [businessId, ctx, loadWorkspace],
  );

  // ── Scheduled actions ──

  type ScheduledAction = {
    id: string;
    actionType: string;
    payload: Record<string, unknown>;
    scheduledFor: string;
    executedAt?: string | null;
    cancelledAt?: string | null;
    createdAt: string;
  };

  const [scheduledActions, setScheduledActions] = useState<ScheduledAction[]>([]);
  const [isLoadingScheduled, setIsLoadingScheduled] = useState(false);

  const loadScheduledActions = useCallback(async () => {
    if (!businessId) return;
    setIsLoadingScheduled(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const data = await apiFetch<ScheduledAction[]>(`/platform/businesses/${businessId}/scheduled-actions`, { token });
      setScheduledActions(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setIsLoadingScheduled(false);
    }
  }, [businessId]);

  const createScheduledAction = useCallback(
    async (data: {
      actionType: 'STATUS_CHANGE' | 'SUBSCRIPTION_CHANGE';
      payload: Record<string, unknown>;
      scheduledFor: string;
    }): Promise<boolean> => {
      if (!businessId) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/businesses/${businessId}/scheduled-actions`, {
          token,
          method: 'POST',
          body: JSON.stringify(data),
        });
        ctx.setBanner({ text: 'Scheduled action created', severity: 'success' });
        await loadScheduledActions();
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to create scheduled action'),
          severity: 'error',
        });
        return false;
      }
    },
    [businessId, ctx, loadScheduledActions],
  );

  const cancelScheduledAction = useCallback(
    async (actionId: string): Promise<boolean> => {
      if (!businessId) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/businesses/${businessId}/scheduled-actions/${actionId}`, {
          token,
          method: 'DELETE',
        });
        ctx.setBanner({ text: 'Scheduled action cancelled', severity: 'success' });
        await loadScheduledActions();
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to cancel scheduled action'),
          severity: 'error',
        });
        return false;
      }
    },
    [businessId, ctx, loadScheduledActions],
  );

  // ── Action preflight + destructive actions ──

  type Preflight = {
    action: string;
    business: { id: string; name: string; status: string; updatedAt: string };
    impact: {
      users: number;
      pendingExports: number;
      activeDevices: number;
      failedOfflineActions: number;
      currentStatus: string;
      readOnlyEnabled: boolean;
      subscriptionStatus?: string | null;
    };
    preconditions: { code: string; ok: boolean; message: string }[];
    ready: boolean;
    generatedAt: string;
  };

  const loadPreflight = useCallback(
    async (action: string): Promise<Preflight | null> => {
      if (!businessId) return null;
      try {
        const token = getPlatformAccessToken();
        if (!token) return null;
        const data = await apiFetch<Preflight>(
          `/platform/businesses/${businessId}/actions/${action}/preflight`,
          { token },
        );
        return data;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to load preflight'),
          severity: 'error',
        });
        return null;
      }
    },
    [businessId, ctx],
  );

  const purgeBusiness = useCallback(
    async (data: { reason: string; confirmBusinessId: string; confirmText: string }): Promise<boolean> => {
      if (!businessId) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/businesses/${businessId}/purge`, {
          token,
          method: 'POST',
          body: JSON.stringify(data),
        });
        ctx.setBanner({ text: 'Business purged', severity: 'success' });
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to purge business'),
          severity: 'error',
        });
        return false;
      }
    },
    [businessId, ctx],
  );

  // ── Exports ──

  type ExportJob = {
    id: string;
    type: string;
    status: string;
    createdAt: string;
    completedAt?: string | null;
    deliveredAt?: string | null;
    startedAt?: string | null;
    attempts?: number;
    lastError?: string | null;
    metadata?: Record<string, unknown> | null;
  };

  const [exports, setExports] = useState<ExportJob[]>([]);
  const [isLoadingExports, setIsLoadingExports] = useState(false);

  const loadExports = useCallback(async () => {
    if (!businessId) return;
    setIsLoadingExports(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const data = await apiFetch<{ items: ExportJob[] } | ExportJob[]>(
        `/platform/businesses/${businessId}/exports`,
        { token },
      );
      const items = Array.isArray(data) ? data : (data?.items ?? []);
      setExports(items);
    } catch {
      // silent
    } finally {
      setIsLoadingExports(false);
    }
  }, [businessId]);

  const exportOnExit = useCallback(
    async (reason: string): Promise<boolean> => {
      if (!businessId) return false;
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/exports/on-exit`, {
          token,
          method: 'POST',
          body: JSON.stringify({ businessId, reason }),
        });
        ctx.setBanner({ text: 'Export-on-exit queued', severity: 'success' });
        await loadExports();
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, 'Failed to queue export'),
          severity: 'error',
        });
        return false;
      }
    },
    [businessId, ctx, loadExports],
  );

  const exportAction = useCallback(
    async (jobId: string, action: 'retry' | 'requeue' | 'cancel', reason?: string): Promise<boolean> => {
      try {
        const token = getPlatformAccessToken();
        if (!token) return false;
        await apiFetch(`/platform/exports/${jobId}/${action}`, {
          token,
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
        ctx.setBanner({ text: `Export ${action} queued`, severity: 'success' });
        await loadExports();
        return true;
      } catch (err) {
        ctx.setBanner({
          text: getApiErrorMessage(err, `Failed to ${action} export`),
          severity: 'error',
        });
        return false;
      }
    },
    [ctx, loadExports],
  );

  // ── Activity heatmap ──

  type HeatmapData = {
    businessId: string;
    days: number;
    generatedAt: string;
    totalActivity: number;
    peakDay: { date: string; count: number };
    data: { date: string; count: number }[];
  };

  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [isLoadingHeatmap, setIsLoadingHeatmap] = useState(false);

  const loadHeatmap = useCallback(
    async (days = 90) => {
      if (!businessId) return;
      setIsLoadingHeatmap(true);
      try {
        const token = getPlatformAccessToken();
        if (!token) return;
        const data = await apiFetch<HeatmapData>(
          `/platform/businesses/${businessId}/activity-heatmap?days=${days}`,
          { token },
        );
        setHeatmap(data);
      } catch {
        // silent
      } finally {
        setIsLoadingHeatmap(false);
      }
    },
    [businessId],
  );

  return {
    // Workspace data
    workspace: ctx.workspaceData,
    isLoadingWorkspace,
    workspaceError,
    loadWorkspace,
    // Provision
    isProvisioning,
    provisionBusiness,
    // Quick actions
    forceLogout,
    toggleReadOnly,
    // Notes
    notes,
    isLoadingNotes,
    loadNotes,
    createNote,
    deleteNote,
    // Devices
    devices,
    isLoadingDevices,
    loadDevices,
    revokeDevice,
    // Subscription
    purchases,
    subscriptionHistory,
    pendingRequests,
    isLoadingSubscription,
    loadSubscriptionData,
    recordPurchase,
    decideSubscriptionRequest,
    // Status / review / rate limits
    updateStatus,
    updateReview,
    updateRateLimits,
    // Scheduled actions
    scheduledActions,
    isLoadingScheduled,
    loadScheduledActions,
    createScheduledAction,
    cancelScheduledAction,
    // Action preflight + purge
    loadPreflight,
    purgeBusiness,
    // Exports
    exports,
    isLoadingExports,
    loadExports,
    exportOnExit,
    exportAction,
    // Heatmap
    heatmap,
    isLoadingHeatmap,
    loadHeatmap,
    // Context
    selectedBusinessId: ctx.selectedBusinessId,
    setSelectedBusinessId: ctx.setSelectedBusinessId,
    banner: ctx.banner,
    setBanner: ctx.setBanner,
  };
}
