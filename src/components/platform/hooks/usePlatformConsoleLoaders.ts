import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { buildCursorQuery, normalizePaginated, type PaginatedResponse } from '@/lib/pagination';
import type { ToastInput } from '@/lib/app-notifications';

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
  systemOwner?: {
    name: string;
    email: string;
    phone: string | null;
  } | null;
};

type PlatformAuditLog = {
  id: string;
  action: string;
  resourceType: string;
  platformAdminId?: string | null;
  adminEmail?: string | null;
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
  TAnalyticsRevenue = unknown,
  TAnalyticsCohorts = unknown,
  TAnalyticsChurn = unknown,
  TAnalyticsConversions = unknown,
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
  showAnalytics,
  analyticsChurnRange,
  setIsLoading,
  setIsLoadingOverview,
  setBusinesses,
  setNextBusinessCursor,
  setTotalBusinesses,
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
  setAnalyticsRevenue,
  setAnalyticsCohorts,
  setAnalyticsChurn,
  setAnalyticsConversions,
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
  setMessage: (value: ToastInput | null) => void;
  metricsRange: string;
  metricsFrom: string;
  metricsTo: string;
  showSupport: boolean;
  showExports: boolean;
  showHealth: boolean;
  showIncidents: boolean;
  showOverview: boolean;
  showAnalytics: boolean;
  analyticsChurnRange: string;
  setIsLoading: (value: boolean) => void;
  setIsLoadingOverview: (value: boolean) => void;
  setBusinesses: Dispatch<SetStateAction<TBusiness[]>>;
  setNextBusinessCursor: (value: string | null) => void;
  setTotalBusinesses: (value: number | null) => void;
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
          months?: string;
          isPaid?: boolean;
          amountDue?: string;
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
  setAnalyticsRevenue: Dispatch<SetStateAction<TAnalyticsRevenue | null>>;
  setAnalyticsCohorts: Dispatch<SetStateAction<TAnalyticsCohorts | null>>;
  setAnalyticsChurn: Dispatch<SetStateAction<TAnalyticsChurn | null>>;
  setAnalyticsConversions: Dispatch<SetStateAction<TAnalyticsConversions | null>>;
  loadSupportRequests: AsyncTask;
  loadSubscriptionRequests: AsyncTask;
  loadAnnouncements: AsyncTask;
  loadSupportSessions: AsyncTask;
  loadExportJobs: AsyncTask;
  loadExportQueueStats: AsyncTask;
  loadIncidents: AsyncTask;
}) {
  const loadBusinesses = useCallback(
    async (cursor?: string) => {
      if (!token) {
        return;
      }
      try {
        const query = buildCursorQuery({ limit: 20, cursor });
        const biz = await apiFetch<PaginatedResponse<TBusiness> | TBusiness[]>(
          `/platform/businesses${query}`,
          { token },
        );
        const result = normalizePaginated(biz);
        setBusinesses(result.items);
        setNextBusinessCursor(result.nextCursor);
        setTotalBusinesses(result.total ?? null);
        setSubscriptionEdits(() => {
          const next: Record<string, {
            tier: string;
            status: string;
            reason: string;
            startsAt?: string;
            trialEndsAt: string;
            graceEndsAt: string;
            expiresAt: string;
            months?: string;
            isPaid?: boolean;
            amountDue?: string;
          }> = {};
          result.items.forEach((item) => {
            next[item.id] = {
              tier: item.subscription?.tier ?? 'BUSINESS',
              status: item.subscription?.status ?? 'TRIAL',
              reason: '',
              startsAt: '',
              trialEndsAt: item.subscription?.trialEndsAt ?? '',
              graceEndsAt: item.subscription?.graceEndsAt ?? '',
              expiresAt: item.subscription?.expiresAt ?? '',
              months: '',
              isPaid: true,
              amountDue: '',
            };
          });
          return next;
        });
        setReadOnlyEdits(() => {
          const next: Record<string, { enabled: boolean; reason: string }> = {};
          result.items.forEach((item) => {
            next[item.id] = {
              enabled: item.settings?.readOnlyEnabled ?? false,
              reason: item.settings?.readOnlyReason ?? '',
            };
          });
          return next;
        });
        setStatusEdits(() => {
          const next: Record<string, { status: string; reason: string }> = {};
          result.items.forEach((item) => {
            next[item.id] = { status: item.status ?? 'ACTIVE', reason: '' };
          });
          return next;
        });
        setReviewEdits(() => {
          const next: Record<string, { underReview: boolean; reason: string; severity: string }> = {};
          result.items.forEach((item) => {
            next[item.id] = {
              underReview: item.underReview ?? false,
              reason: item.reviewReason ?? '',
              severity: item.reviewSeverity ?? 'MEDIUM',
            };
          });
          return next;
        });
        setRateLimitEdits(() => {
          const next: Record<string, { limit: string; ttlSeconds: string; expiresAt: string; reason: string }> = {};
          result.items.forEach((item) => {
            next[item.id] = {
              limit: '',
              ttlSeconds: '',
              expiresAt: '',
              reason: '',
            };
          });
          return next;
        });
      } catch (err) {
        setMessage(getApiErrorMessage(err, t('loadBusinessesFailed')));
      }
    },
    [
      token,
      t,
      setMessage,
      setBusinesses,
      setNextBusinessCursor,
      setTotalBusinesses,
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
    try {
      const metricsResponse = await apiFetch<TMetrics>(
        `/platform/metrics?range=${metricsRange}${
          metricsRange === 'custom'
            ? `&from=${encodeURIComponent(metricsFrom)}&to=${encodeURIComponent(metricsTo)}`
            : ''
        }`,
        { token },
      );
      setMetrics(metricsResponse);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadMetricsFailed')));
    }
  }, [token, metricsRange, metricsFrom, metricsTo, setMetrics, setMessage, t]);

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
    try {
      const matrix = await apiFetch<THealthMatrix>('/platform/health/matrix', { token });
      setHealthMatrix(matrix);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadHealthMatrixFailed')));
    }
  }, [token, setHealthMatrix, setMessage, t]);

  const loadActivityFeed = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const query = buildCursorQuery({ limit: 24 });
      const logs = await apiFetch<PaginatedResponse<PlatformAuditLog> | PlatformAuditLog[]>(
        `/platform/platform-audit-logs${query}`,
        { token },
      );
      const result = normalizePaginated(logs);
      setActivityFeed(result.items);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadActivityFeedFailed')));
    }
  }, [token, setActivityFeed, setMessage, t]);

  const loadAnalyticsRevenue = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch<TAnalyticsRevenue>('/platform/analytics/revenue', { token });
      setAnalyticsRevenue(data);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadAnalyticsFailed')));
    }
  }, [token, setAnalyticsRevenue, setMessage, t]);

  const loadAnalyticsCohorts = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch<TAnalyticsCohorts>('/platform/analytics/cohorts', { token });
      setAnalyticsCohorts(data);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadAnalyticsFailed')));
    }
  }, [token, setAnalyticsCohorts, setMessage, t]);

  const loadAnalyticsChurn = useCallback(
    async (range?: string) => {
      if (!token) return;
      try {
        const r = range ?? analyticsChurnRange;
        const data = await apiFetch<TAnalyticsChurn>(
          `/platform/analytics/churn?range=${encodeURIComponent(r)}`,
          { token },
        );
        setAnalyticsChurn(data);
      } catch (err) {
        setMessage(getApiErrorMessage(err, t('loadAnalyticsFailed')));
      }
    },
    [token, analyticsChurnRange, setAnalyticsChurn, setMessage, t],
  );

  const loadAnalyticsConversions = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch<TAnalyticsConversions>('/platform/analytics/conversions', {
        token,
      });
      setAnalyticsConversions(data);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadAnalyticsFailed')));
    }
  }, [token, setAnalyticsConversions, setMessage, t]);

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
      if (showAnalytics) {
        tasks.push(
          loadAnalyticsRevenue(),
          loadAnalyticsCohorts(),
          loadAnalyticsChurn(),
          loadAnalyticsConversions(),
        );
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
    showAnalytics,
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
    loadAnalyticsRevenue,
    loadAnalyticsCohorts,
    loadAnalyticsChurn,
    loadAnalyticsConversions,
  ]);

  return {
    loadBusinesses,
    loadMetrics,
    loadOverviewSnapshot,
    loadQueuesSummary,
    loadHealthMatrix,
    loadActivityFeed,
    loadAnalyticsRevenue,
    loadAnalyticsCohorts,
    loadAnalyticsChurn,
    loadAnalyticsConversions,
    loadData,
  };
}
