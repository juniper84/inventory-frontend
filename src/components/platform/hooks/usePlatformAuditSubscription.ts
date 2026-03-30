import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { buildCursorQuery, normalizePaginated, type PaginatedResponse } from '@/lib/pagination';
import type { ToastInput } from '@/lib/app-notifications';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

type AuditInvestigation = {
  id: string;
  groupType: string;
  businessId: string;
  startedAt: string;
  latestAt: string;
  count: number;
  outcomes: Record<string, number>;
  resourceSummary: { resourceType: string; resourceId?: string | null; count: number }[];
  actions: {
    id: string;
    action: string;
    outcome: string;
    resourceType: string;
    resourceId?: string | null;
    createdAt: string;
  }[];
  relatedPlatformActions: {
    id: string;
    action: string;
    resourceType: string;
    reason?: string | null;
    createdAt: string;
    metadata?: Record<string, unknown> | null;
  }[];
};

type AuditLog = {
  id: string;
  action: string;
  outcome: string;
  resourceType: string;
  createdAt: string;
};

export function usePlatformAuditSubscription({
  token,
  t,
  setMessage,
}: {
  token: string | null;
  t: Translate;
  setMessage: (value: ToastInput | null) => void;
}) {
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditInvestigations, setAuditInvestigations] = useState<AuditInvestigation[]>([]);
  const [nextAuditInvestigationCursor, setNextAuditInvestigationCursor] =
    useState<string | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditCursorStack, setAuditCursorStack] = useState<(string | null)[]>([null]);
  const [auditBusinessId, setAuditBusinessId] = useState('');
  const [auditOutcome, setAuditOutcome] = useState('');
  const [auditAction, setAuditAction] = useState('');

  const [subscriptionHistory, setSubscriptionHistory] = useState<
    {
      previousStatus?: string | null;
      newStatus?: string | null;
      previousTier?: string | null;
      newTier?: string | null;
      changedByPlatformAdminId?: string | null;
      reason?: string | null;
      createdAt: string;
    }[]
  >([]);
  const [historyBusinessId, setHistoryBusinessId] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchAuditLogs = async (
    event?: FormEvent,
    cursor?: string,
  ) => {
    if (event) {
      event.preventDefault();
    }
    if (!token) {
      return;
    }
    if (cursor === undefined) {
      setAuditPage(1);
      setAuditCursorStack([null]);
    }
    setLoadingLogs(true);
    try {
      const query = buildCursorQuery({
        limit: 20,
        cursor,
        businessId: auditBusinessId || undefined,
        outcome: auditOutcome || undefined,
        action: auditAction || undefined,
      });
      const investigations = await apiFetch<
        PaginatedResponse<AuditInvestigation> | AuditInvestigation[]
      >(`/platform/audit-logs/timeline${query}`, {
        token,
      });
      const result = normalizePaginated(investigations);
      setAuditInvestigations(result.items);
      setNextAuditInvestigationCursor(result.nextCursor);
      setAuditLogs(
        result.items.flatMap((item) =>
          item.actions.map((action) => ({
            id: action.id,
            action: action.action,
            outcome: action.outcome,
            resourceType: action.resourceType,
            createdAt: action.createdAt,
          })),
        ),
      );
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadAuditLogsFailed')));
    } finally {
      setLoadingLogs(false);
    }
  };

  const goToNextAuditPage = async () => {
    if (!nextAuditInvestigationCursor) return;
    const cursor = nextAuditInvestigationCursor;
    setAuditPage((p) => p + 1);
    setAuditCursorStack((prev) => [...prev, cursor]);
    await fetchAuditLogs(undefined, cursor);
  };

  const goToPrevAuditPage = async () => {
    if (auditPage <= 1) return;
    const newPage = auditPage - 1;
    const cursor = auditCursorStack[newPage - 1];
    setAuditPage(newPage);
    setAuditCursorStack((prev) => prev.slice(0, newPage));
    await fetchAuditLogs(undefined, cursor ?? undefined);
  };

  const loadSubscriptionHistory = async () => {
    if (!token || !historyBusinessId) {
      return;
    }
    setLoadingHistory(true);
    try {
      const data = await apiFetch<
        {
          previousStatus?: string | null;
          newStatus?: string | null;
          previousTier?: string | null;
          newTier?: string | null;
          changedByPlatformAdminId?: string | null;
          reason?: string | null;
          createdAt: string;
        }[]
      >(`/platform/subscriptions/${historyBusinessId}/history`, { token });
      setSubscriptionHistory(data);
    } finally {
      setLoadingHistory(false);
    }
  };

  const auditActionOptions = useMemo(() => {
    const unique = new Map<string, string>();
    auditInvestigations.forEach((group) => {
      group.actions.forEach((entry) => {
        if (entry.action) {
          unique.set(entry.action, entry.action);
        }
      });
    });
    return Array.from(unique.values()).map((action) => ({
      id: action,
      label: action,
    }));
  }, [auditInvestigations]);

  const subscriptionHistoryStats = useMemo(() => {
    const statusChanges = subscriptionHistory.filter(
      (entry) => entry.previousStatus !== entry.newStatus,
    ).length;
    const tierChanges = subscriptionHistory.filter(
      (entry) => entry.previousTier !== entry.newTier,
    ).length;
    const unchanged = subscriptionHistory.filter(
      (entry) =>
        entry.previousStatus === entry.newStatus &&
        entry.previousTier === entry.newTier,
    ).length;
    const total = Math.max(1, statusChanges + tierChanges + unchanged);
    return {
      statusChanges,
      tierChanges,
      unchanged,
      total,
      statusPct: Math.round((statusChanges / total) * 100),
      tierPct: Math.round((tierChanges / total) * 100),
      unchangedPct: Math.round((unchanged / total) * 100),
    };
  }, [subscriptionHistory]);

  return {
    loadingLogs,
    auditLogs,
    auditInvestigations,
    auditPage,
    hasNextAuditPage: nextAuditInvestigationCursor !== null,
    auditBusinessId,
    setAuditBusinessId,
    auditOutcome,
    setAuditOutcome,
    auditAction,
    setAuditAction,
    fetchAuditLogs,
    goToNextAuditPage,
    goToPrevAuditPage,
    historyBusinessId,
    setHistoryBusinessId,
    loadingHistory,
    subscriptionHistory,
    loadSubscriptionHistory,
    auditActionOptions,
    subscriptionHistoryStats,
  };
}
