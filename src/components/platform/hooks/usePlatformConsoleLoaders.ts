import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { buildCursorQuery, normalizePaginated, type PaginatedResponse } from '@/lib/pagination';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

type BusinessSeed = {
  id: string;
  status?: string;
  underReview?: boolean | null;
  reviewReason?: string | null;
  reviewSeverity?: string | null;
  subscription?: {
    tier?: string | null;
    status?: string | null;
    trialEndsAt?: string | null;
    graceEndsAt?: string | null;
    expiresAt?: string | null;
  } | null;
  settings?: {
    readOnlyEnabled?: boolean;
    readOnlyReason?: string | null;
  } | null;
};

type PlatformAuditLog = {
  id: string;
  action: string;
  resourceType: string;
  platformAdminId?: string | null;
  resourceId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type AsyncTask = () => Promise<void>;

export function usePlatformConsoleLoaders<
  TBusiness extends BusinessSeed,
  TMetrics = unknown,
  TOverviewSnapshot = unknown,
  TQueuesSummary = unknown,
  THealthMatrix = unknown,
>({
  token,
  t,
  setMessage,
  metricsRange,
  metricsFrom,
  metricsTo,
  showSupport,
  showExports,
  showHealth,
  showIncidents,
  showOverview,
  setIsLoading,
  setIsLoadingOverview,
  setIsLoadingMoreBusinesses,
  setBusinesses,
  setNextBusinessCursor,
  setSubscriptionEdits,
  setReadOnlyEdits,
  setStatusEdits,
  setReviewEdits,
  setRateLimitEdits,
  setMetrics,
  setOverviewSnapshot,
  setQueuesSummary,
  setHealthMatrix,
  setActivityFeed,
  loadSupportRequests,
  loadSubscriptionRequests,
  loadAnnouncements,
  loadSupportSessions,
  loadExportJobs,
  loadExportQueueStats,
  loadIncidents,
}: {
  token: string | null;
  t: Translate;
  setMessage: (value: string | null) => void;
  metricsRange: string;
  metricsFrom: string;
  metricsTo: string;
  showSupport: boolean;
  showExports: boolean;
  showHealth: boolean;
  showIncidents: boolean;
  showOverview: boolean;
  setIsLoading: (value: boolean) => void;
  setIsLoadingOverview: (value: boolean) => void;
  setIsLoadingMoreBusinesses: (value: boolean) => void;
  setBusinesses: Dispatch<SetStateAction<TBusiness[]>>;
  setNextBusinessCursor: (value: string | null) => void;
  setSubscriptionEdits: Dispatch<
    SetStateAction<
      Record<
        string,
        {
          tier: string;
          status: string;
          reason: string;
          startsAt?: string;
          trialEndsAt: string;
          graceEndsAt: string;
          expiresAt: string;
          durationDays?: string;
        }
      >
    >
  >;
  setReadOnlyEdits: Dispatch<
    SetStateAction<Record<string, { enabled: boolean; reason: string }>>
  >;
  setStatusEdits: Dispatch<
    SetStateAction<Record<string, { status: string; reason: string }>>
  >;
  setReviewEdits: Dispatch<
    SetStateAction<Record<string, { underReview: boolean; reason: string; severity: string }>>
  >;
  setRateLimitEdits: Dispatch<
    SetStateAction<
      Record<string, { limit: string; ttlSeconds: string; expiresAt: string; reason: string }>
    >
  >;
  setMetrics: Dispatch<SetStateAction<TMetrics | null>>;
  setOverviewSnapshot: Dispatch<SetStateAction<TOverviewSnapshot | null>>;
  setQueuesSummary: Dispatch<SetStateAction<TQueuesSummary | null>>;
  setHealthMatrix: Dispatch<SetStateAction<THealthMatrix | null>>;
  setActivityFeed: (value: PlatformAuditLog[]) => void;
  loadSupportRequests: AsyncTask;
  loadSubscriptionRequests: AsyncTask;
  loadAnnouncements: AsyncTask;
  loadSupportSessions: AsyncTask;
  loadExportJobs: AsyncTask;
  loadExportQueueStats: AsyncTask;
  loadIncidents: AsyncTask;
}) {
  const loadBusinesses = useCallback(
    async (cursor?: string, append = false) => {
      if (!token) {
        return;
      }
      if (append) {
        setIsLoadingMoreBusinesses(true);
      }
      try {
        const query = buildCursorQuery({ limit: 20, cursor });
        const biz = await apiFetch<PaginatedResponse<TBusiness> | TBusiness[]>(
          `/platform/businesses${query}`,
          { token },
        );
        const result = normalizePaginated(biz);
        setBusinesses((prev) => (append ? [...prev, ...result.items] : result.items));
        setNextBusinessCursor(result.nextCursor);
        setSubscriptionEdits((prev) => {
          const next = append ? { ...prev } : {};
          result.items.forEach((item) => {
            if (!next[item.id]) {
              next[item.id] = {
                tier: item.subscription?.tier ?? 'BUSINESS',
                status: item.subscription?.status ?? 'TRIAL',
                reason: '',
                startsAt: '',
                trialEndsAt: item.subscription?.trialEndsAt ?? '',
                graceEndsAt: item.subscription?.graceEndsAt ?? '',
                expiresAt: item.subscription?.expiresAt ?? '',
                durationDays: '',
              };
            }
          });
          return next;
        });
        setReadOnlyEdits((prev) => {
          const next = append ? { ...prev } : {};
          result.items.forEach((item) => {
            if (!next[item.id]) {
              next[item.id] = {
                enabled: item.settings?.readOnlyEnabled ?? false,
                reason: item.settings?.readOnlyReason ?? '',
              };
            }
          });
          return next;
        });
        setStatusEdits((prev) => {
          const next = append ? { ...prev } : {};
          result.items.forEach((item) => {
            if (!next[item.id]) {
              next[item.id] = { status: item.status ?? 'ACTIVE', reason: '' };
            }
          });
          return next;
        });
        setReviewEdits((prev) => {
          const next = append ? { ...prev } : {};
          result.items.forEach((item) => {
            if (!next[item.id]) {
              next[item.id] = {
                underReview: item.underReview ?? false,
                reason: item.reviewReason ?? '',
                severity: item.reviewSeverity ?? 'MEDIUM',
              };
            }
          });
          return next;
        });
        setRateLimitEdits((prev) => {
          const next = append ? { ...prev } : {};
          result.items.forEach((item) => {
            if (!next[item.id]) {
              next[item.id] = {
                limit: '',
                ttlSeconds: '',
                expiresAt: '',
                reason: '',
              };
            }
          });
          return next;
        });
      } finally {
        if (append) {
          setIsLoadingMoreBusinesses(false);
        }
      }
    },
    [
      token,
      setIsLoadingMoreBusinesses,
      setBusinesses,
      setNextBusinessCursor,
      setSubscriptionEdits,
      setReadOnlyEdits,
      setStatusEdits,
      setReviewEdits,
      setRateLimitEdits,
    ],
  );

  const loadMetrics = useCallback(async () => {
    if (!token) {
      return;
    }
    const metricsResponse = await apiFetch<TMetrics>(
      `/platform/metrics?range=${metricsRange}${
        metricsRange === 'custom'
          ? `&from=${encodeURIComponent(metricsFrom)}&to=${encodeURIComponent(metricsTo)}`
          : ''
      }`,
      { token },
    );
    setMetrics(metricsResponse);
  }, [token, metricsRange, metricsFrom, metricsTo, setMetrics]);

  const loadOverviewSnapshot = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoadingOverview(true);
    try {
      const query =
        metricsRange === 'custom'
          ? `?range=${metricsRange}&from=${encodeURIComponent(metricsFrom)}&to=${encodeURIComponent(metricsTo)}`
          : `?range=${metricsRange}`;
      const snapshot = await apiFetch<TOverviewSnapshot>(`/platform/overview/snapshot${query}`, {
        token,
      });
      setOverviewSnapshot(snapshot);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadOverviewSnapshotFailed')));
    } finally {
      setIsLoadingOverview(false);
    }
  }, [
    token,
    metricsRange,
    metricsFrom,
    metricsTo,
    setIsLoadingOverview,
    setOverviewSnapshot,
    setMessage,
    t,
  ]);

  const loadQueuesSummary = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const summary = await apiFetch<TQueuesSummary>('/platform/queues/summary', { token });
      setQueuesSummary(summary);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadQueuesSummaryFailed')));
    }
  }, [token, setQueuesSummary, setMessage, t]);

  const loadHealthMatrix = useCallback(async () => {
    if (!token) {
      return;
    }
    const matrix = await apiFetch<THealthMatrix>('/platform/health/matrix', { token });
    setHealthMatrix(matrix);
  }, [token, setHealthMatrix]);

  const loadActivityFeed = useCallback(async () => {
    if (!token) {
      return;
    }
    const query = buildCursorQuery({ limit: 24 });
    const logs = await apiFetch<PaginatedResponse<PlatformAuditLog> | PlatformAuditLog[]>(
      `/platform/platform-audit-logs${query}`,
      { token },
    );
    const result = normalizePaginated(logs);
    setActivityFeed(result.items);
  }, [token, setActivityFeed]);

  const loadData = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const tasks: Promise<void>[] = [
        loadBusinesses(),
        loadSupportRequests(),
        loadSubscriptionRequests(),
        loadMetrics(),
        loadAnnouncements(),
        loadActivityFeed(),
      ];
      if (showSupport) {
        tasks.push(loadSupportSessions());
      }
      if (showExports) {
        tasks.push(loadExportJobs(), loadExportQueueStats());
      }
      if (showHealth) {
        tasks.push(loadHealthMatrix());
      }
      if (showIncidents) {
        tasks.push(loadIncidents());
      }
      if (showOverview) {
        tasks.push(loadOverviewSnapshot(), loadQueuesSummary());
      }
      await Promise.all(tasks);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadPlatformDataFailed')));
    } finally {
      setIsLoading(false);
    }
  }, [
    token,
    t,
    showSupport,
    showExports,
    showHealth,
    showIncidents,
    showOverview,
    setIsLoading,
    setMessage,
    loadBusinesses,
    loadSupportRequests,
    loadSubscriptionRequests,
    loadMetrics,
    loadAnnouncements,
    loadActivityFeed,
    loadSupportSessions,
    loadExportJobs,
    loadExportQueueStats,
    loadHealthMatrix,
    loadIncidents,
    loadOverviewSnapshot,
    loadQueuesSummary,
  ]);

  return {
    loadBusinesses,
    loadMetrics,
    loadOverviewSnapshot,
    loadQueuesSummary,
    loadHealthMatrix,
    loadActivityFeed,
    loadData,
  };
}
