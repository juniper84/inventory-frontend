'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { decodeJwt, getPlatformAccessToken } from '@/lib/auth';
import { formatEntityLabel } from '@/lib/display';
import { localToUtcIso } from '@/lib/date-format';
import { usePlatformConsoleStorage } from '@/components/platform/hooks/usePlatformConsoleStorage';
import { usePlatformBusinessDerived } from '@/components/platform/hooks/usePlatformBusinessDerived';
import { usePlatformAnnouncements } from '@/components/platform/hooks/usePlatformAnnouncements';
import { usePlatformAuditSubscription } from '@/components/platform/hooks/usePlatformAuditSubscription';
import { usePlatformBusinessActions } from '@/components/platform/hooks/usePlatformBusinessActions';
import { usePlatformConsoleLoaders } from '@/components/platform/hooks/usePlatformConsoleLoaders';
import { usePlatformConsoleOptionSets } from '@/components/platform/hooks/usePlatformConsoleOptionSets';
import { usePlatformConsolePresentation } from '@/components/platform/hooks/usePlatformConsolePresentation';
import { usePlatformIncidents } from '@/components/platform/hooks/usePlatformIncidents';
import { usePlatformSupportExports } from '@/components/platform/hooks/usePlatformSupportExports';
import { usePlatformEventStream } from '@/components/platform/hooks/usePlatformEventStream';
import type { PlatformView } from '@/components/platform/types';
import { PlatformConsoleHeader } from '@/components/platform/views/PlatformConsoleHeader';
import { PlatformHealthCommandSurface } from '@/components/platform/views/PlatformHealthCommandSurface';
import { PlatformIncidentsCommandSurface } from '@/components/platform/views/PlatformIncidentsCommandSurface';
import { PlatformMetricsSection } from '@/components/platform/views/PlatformMetricsSection';
import { PlatformOverviewCommandSurface } from '@/components/platform/views/PlatformOverviewCommandSurface';
import { PlatformAnnouncementsCommandSurface } from '@/components/platform/views/PlatformAnnouncementsCommandSurface';
import { PlatformAnalyticsCommandSurface } from '@/components/platform/views/PlatformAnalyticsCommandSurface';
import { PlatformAuditCommandSurface } from '@/components/platform/views/PlatformAuditCommandSurface';
import { PlatformBusinessesCommandSurface } from '@/components/platform/views/PlatformBusinessesCommandSurface';
import { PlatformBusinessProvisionSurface } from '@/components/platform/views/PlatformBusinessProvisionSurface';
import { PlatformExportsCommandSurface } from '@/components/platform/views/PlatformExportsCommandSurface';
import { PlatformSecuritySection } from '@/components/platform/views/PlatformSecuritySection';
import { PlatformSubscriptionIntelligenceSurface } from '@/components/platform/views/PlatformSubscriptionIntelligenceSurface';
import { PlatformSupportCommandSurface } from '@/components/platform/views/PlatformSupportCommandSurface';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
);

type Business = {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  lastActivityAt?: string | null;
  underReview?: boolean | null;
  reviewReason?: string | null;
  reviewSeverity?: string | null;
  subscription?: {
    tier: string;
    status: string;
    trialEndsAt?: string | null;
    graceEndsAt?: string | null;
    expiresAt?: string | null;
  } | null;
  settings?: {
    readOnlyEnabled?: boolean;
    readOnlyReason?: string | null;
  } | null;
  counts?: { branches: number; users: number; offlineDevices: number };
};

type AuditLog = {
  id: string;
  action: string;
  outcome: string;
  resourceType: string;
  createdAt: string;
};

type AuditInvestigation = {
  id: string;
  key: string;
  groupType: 'correlation' | 'request' | 'session' | 'entry';
  businessId: string;
  startedAt: string;
  latestAt: string;
  count: number;
  outcomes: Record<string, number>;
  actions: {
    id: string;
    action: string;
    outcome: string;
    resourceType: string;
    resourceId?: string | null;
    createdAt: string;
  }[];
  resourceSummary: {
    resourceType: string;
    resourceId?: string | null;
    count: number;
  }[];
  relatedPlatformActions: {
    id: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    reason?: string | null;
    createdAt: string;
    metadata?: Record<string, unknown> | null;
  }[];
};

type PlatformAuditLog = {
  id: string;
  action: string;
  platformAdminId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type Metrics = {
  totals: {
    businesses: number;
    active: number;
    grace: number;
    expired: number;
    suspended: number;
    underReview: number;
    offlineEnabled: number;
  };
  offlineFailures: number;
  exports: { pending: number };
  api: {
    errorRate: number;
    avgLatency: number;
    slowEndpoints: { path: string; avgDurationMs: number; count: number }[];
  };
  storage: {
    totalMb: number;
    topBusinesses: { businessId: string; name: string; sizeMb: number }[];
  };
  series: {
    label: string;
    errorRate: number;
    avgLatency: number;
    offlineFailed: number;
    exportsPending: number;
  }[];
  range: { start: string; end: string };
  timestamp: string;
};

type HealthMatrix = {
  generatedAt: string;
  window: { start: string; end: string };
  dependencies: {
    key: string;
    label: string;
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    detail: Record<string, unknown>;
  }[];
  rollups?: {
    healthy: number;
    warning: number;
    critical: number;
    overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  };
  telemetry?: {
    api?: {
      totalRequests: number;
      errorRate: number;
      avgLatencyMs: number;
      p95LatencyMs: number;
      p99LatencyMs: number;
      leaders: {
        path: string;
        avgDurationMs: number;
        p95DurationMs: number;
        p99DurationMs: number;
        count: number;
        errorRate: number;
      }[];
    };
    syncRisk?: {
      score: number;
      status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
      failedActions24h: number;
      failedActions7d: number;
      staleActiveDevices: number;
      revokedDevices: number;
    };
    queuePressure?: {
      score: number;
      status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
      totalPending: number;
      exportsPending: number;
      supportPending: number;
      subscriptionsPending: number;
      exportsFailed: number;
    };
  };
};

type QueueSummary = {
  total: number;
  byStatus: Record<string, number>;
};

type QueueSummaryPayload = {
  support: QueueSummary;
  exports: QueueSummary;
  subscriptions: QueueSummary;
};

type OverviewSnapshot = {
  generatedAt: string;
  range?: { start: string; end: string };
  kpis: {
    businesses: number;
    activeBusinesses: number;
    underReview: number;
    offlineEnabled: number;
    totalStorageMb: number;
    totalUsers: number;
    activeUsers: number;
  };
  anomalies: {
    offlineFailures: number;
    exportsPending: number;
    apiErrorRate: number;
    apiAvgLatencyMs: number;
    activeAnnouncements: number;
  };
  distributions?: {
    tiers?: { tier: string; count: number }[];
    businessStatuses?: { status: string; count: number }[];
    users?: {
      active: number;
      inactive: number;
      pending: number;
      total: number;
    };
  };
  signals?: {
    queuePressureTotal: number;
    exportsFailed: number;
    apiTotalRequests: number;
  };
  queues: QueueSummaryPayload;
  activity: {
    id: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    reason?: string | null;
    createdAt: string;
  }[];
};

type BusinessWorkspace = {
  business: {
    id: string;
    name: string;
    status: string;
    underReview?: boolean | null;
    reviewReason?: string | null;
    reviewSeverity?: string | null;
    createdAt?: string;
    updatedAt?: string;
    lastActivityAt?: string | null;
  };
  subscription?: {
    tier?: string | null;
    status?: string | null;
  } | null;
  settings?: {
    readOnlyEnabled?: boolean;
    readOnlyReason?: string | null;
    rateLimitOverride?: Record<string, unknown> | null;
  } | null;
  counts?: {
    branches: number;
    users: number;
    offlineDevices: number;
  };
  risk?: {
    subscriptionStatus?: string;
    offlineFailed?: number;
    exportsPending?: number;
    score?: number;
  } | null;
  queues?: {
    pendingSupport: number;
    pendingExports: number;
    pendingSubscriptionRequests: number;
  } | null;
  devices?: { id: string; deviceName?: string | null; status: string }[];
  recentAdminActions?: {
    id: string;
    action: string;
    outcome: string;
    resourceType: string;
    resourceId?: string | null;
    reason?: string | null;
    createdAt: string;
  }[];
  generatedAt?: string;
};

export function PlatformConsole({
  view,
  focusBusinessId,
}: {
  view: PlatformView;
  focusBusinessId?: string;
}) {
  const t = useTranslations('platformConsole');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const params = useParams<{ locale?: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [creatingBusiness, setCreatingBusiness] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [nextBusinessCursor, setNextBusinessCursor] = useState<string | null>(
    null,
  );
  const [businessPage, setBusinessPage] = useState(1);
  const [businessCursorStack, setBusinessCursorStack] = useState<(string | null)[]>([null]);
  const [totalBusinesses, setTotalBusinesses] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [healthMatrix, setHealthMatrix] = useState<HealthMatrix | null>(null);
  const [overviewSnapshot, setOverviewSnapshot] = useState<OverviewSnapshot | null>(
    null,
  );
  const [queuesSummary, setQueuesSummary] = useState<QueueSummaryPayload | null>(
    null,
  );
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [platformAdminId, setPlatformAdminId] = useState('');
  const [metricsRange, setMetricsRange] = useState('24h');
  const [metricsFrom, setMetricsFrom] = useState('');
  const [metricsTo, setMetricsTo] = useState('');
  const [subscriptionEdits, setSubscriptionEdits] = useState<
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
  >({});
  const [readOnlyEdits, setReadOnlyEdits] = useState<
    Record<string, { enabled: boolean; reason: string }>
  >({});
  const [statusEdits, setStatusEdits] = useState<
    Record<string, { status: string; reason: string }>
  >({});
  const [reviewEdits, setReviewEdits] = useState<
    Record<string, { underReview: boolean; reason: string; severity: string }>
  >({});
  const [rateLimitEdits, setRateLimitEdits] = useState<
    Record<
      string,
      { limit: string; ttlSeconds: string; expiresAt: string; reason: string }
    >
  >({});
  const [healthMap, setHealthMap] = useState<
    Record<
      string,
      {
        subscriptionStatus: string;
        offlineFailed: number;
        exportsPending: number;
        score: number;
      }
    >
  >({});
  const [devicesMap, setDevicesMap] = useState<
    Record<string, { id: string; deviceName?: string | null; status: string }[]>
  >({});
  const [loadingDevices, setLoadingDevices] = useState<Record<string, boolean>>(
    {},
  );
  const [message, setMessage] = useToastState();
  const [createForm, setCreateForm] = useState({
    businessName: '',
    ownerName: '',
    ownerEmail: '',
    ownerTempPassword: '',
    tier: 'BUSINESS',
  });
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    message: '',
    severity: 'INFO',
    startsAt: '',
    endsAt: '',
    reason: '',
    targetBusinessIds: [] as string[],
    targetTiers: [] as string[],
    targetStatuses: [] as string[],
  });
  const [businessSearch, setBusinessSearch] = useState('');
  const [businessStatusFilter, setBusinessStatusFilter] = useState<
    'ACTIVE' | 'UNDER_REVIEW' | 'SUSPENDED' | 'ARCHIVED' | 'DELETED'
  >('ACTIVE');
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [openedBusinessId, setOpenedBusinessId] = useState(focusBusinessId ?? '');
  const [businessDrawerTab, setBusinessDrawerTab] = useState<
    'OVERVIEW' | 'MANAGE' | 'NOTES' | 'DEVICES' | 'ACTIONS'
  >('OVERVIEW');
  const [intelligenceTab, setIntelligenceTab] = useState<'AUDIT' | 'HEALTH'>('AUDIT');
  const [operationsTab, setOperationsTab] = useState<'INCIDENTS' | 'EXPORTS'>('INCIDENTS');
  const [businessTrendRange, setBusinessTrendRange] = useState<'7d' | '30d'>('7d');
  const [businessWorkspaceMap, setBusinessWorkspaceMap] = useState<
    Record<string, BusinessWorkspace>
  >({});
  const [loadingBusinessWorkspace, setLoadingBusinessWorkspace] = useState<
    Record<string, boolean>
  >({});
  const [pinnedBusinessIds, setPinnedBusinessIds] = useState<string[]>([]);
  const [supportNotes, setSupportNotes] = useState<Record<string, string>>({});
  const [revokeReasonTarget, setRevokeReasonTarget] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [isRevokingSessions, setIsRevokingSessions] = useState(false);
  const [activityFeed, setActivityFeed] = useState<PlatformAuditLog[]>([]);
  const [healthBusinessId, setHealthBusinessId] = useState('');
  const [healthLoading, setHealthLoading] = useState(false);
  const [deviceFleetBusinessId, setDeviceFleetBusinessId] = useState('');
  const [deviceRevokeReason, setDeviceRevokeReason] = useState('');
  const [adminPasswordForm, setAdminPasswordForm] = useState({
    current: '',
    next: '',
    confirm: '',
  });
  const [adminPasswordVisible, setAdminPasswordVisible] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const [adminPasswordBusy, setAdminPasswordBusy] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {},
  );
  // Analytics state
  type AnalyticsRevenue = {
    mrr: number; arr: number; byTier: Record<string, number>;
    monthly: { month: string; revenue: number; collected: number }[];
    totalPaidSubscribers: number; paidCount: number; complimentaryCount: number;
    totalCollected: number; generatedAt: string;
  };
  type AnalyticsCohorts = {
    cohorts: { month: string; count: number; byTier: Record<string, number>; active: number }[];
    generatedAt: string;
  };
  type AnalyticsChurn = {
    range: string; churnRate: number; churnedCount: number;
    recentlyChurned: { businessId: string; name: string; status: string; tier: string; churnedAt: string }[];
    generatedAt: string;
  };
  type AnalyticsConversions = {
    conversionRate: number; totalConversions: number; totalTrialBusinesses: number;
    avgTrialDays: number | null; monthlyConversions: { month: string; conversions: number }[];
    generatedAt: string;
  };

  // Onboarding state
  type OnboardingResult = {
    businessId: string;
    milestones: { branches: boolean; products: boolean; sales: boolean; users: boolean; settings: boolean };
    completedCount: number; totalCount: number; percentComplete: number; generatedAt: string;
  };

  const [analyticsRevenue, setAnalyticsRevenue] = useState<AnalyticsRevenue | null>(null);
  const [analyticsCohorts, setAnalyticsCohorts] = useState<AnalyticsCohorts | null>(null);
  const [analyticsChurn, setAnalyticsChurn] = useState<AnalyticsChurn | null>(null);
  const [analyticsConversions, setAnalyticsConversions] = useState<AnalyticsConversions | null>(null);
  const [analyticsChurnRange, setAnalyticsChurnRange] = useState('30d');
  const [businessOnboarding, setBusinessOnboarding] = useState<Record<string, OnboardingResult>>({});
  const [loadingOnboarding, setLoadingOnboarding] = useState<Record<string, boolean>>({});

  // Phase 3 — Business Notes
  type BusinessNote = {
    id: string;
    body: string;
    createdAt: string;
    platformAdmin: { id: string; email: string };
  };
  const [businessNotes, setBusinessNotes] = useState<Record<string, BusinessNote[]>>({});
  const [loadingNotes, setLoadingNotes] = useState<Record<string, boolean>>({});
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});

  // Purchase History
  type PurchaseHistoryItem = {
    id: string;
    tier: string;
    months: number;
    durationDays: number;
    startsAt: string;
    expiresAt: string;
    isPaid: boolean;
    amountDue: number;
    reason: string;
    createdAt: string;
    platformAdmin: { id: string; email: string };
  };
  const [purchaseHistory, setPurchaseHistory] = useState<Record<string, PurchaseHistoryItem[]>>({});
  const [loadingPurchaseHistory, setLoadingPurchaseHistory] = useState<Record<string, boolean>>({});

  // Phase 3 — Scheduled Actions
  type ScheduledAction = {
    id: string;
    actionType: string;
    payload: Record<string, unknown>;
    scheduledFor: string;
    createdAt: string;
    platformAdmin: { id: string; email: string };
  };
  const [scheduledActions, setScheduledActions] = useState<Record<string, ScheduledAction[]>>({});
  const [loadingScheduledActions, setLoadingScheduledActions] = useState<Record<string, boolean>>({});
  const [scheduledActionForm, setScheduledActionForm] = useState<
    Record<string, { actionType: string; payload: Record<string, unknown>; scheduledFor: string }>
  >({});

  const showOverview = view === 'overview';
  const showBusinesses = view === 'businesses';
  const showAnnouncements = view === 'announcements';
  const showOperations = view === 'operations';
  const showAccess = view === 'access';
  const showIntelligence = view === 'intelligence';
  const showAnalytics = view === 'analytics';
  // These are sub-sections within their parent views (intelligence, access, operations)
  const showHealth = showIntelligence;
  const showSupport = showAccess;
  const showExports = showOperations;
  const showAudit = showIntelligence;
  const showIncidents = showOperations;
  const showBusinessDetailPage =
    showBusinesses && Boolean(focusBusinessId || openedBusinessId);
  const [quickActions, setQuickActions] = useState<
    Record<string, { reason: string; trialDays: string }>
  >({});
  const [purgingBusinessId, setPurgingBusinessId] = useState<string | null>(null);

  useEffect(() => {
    if (focusBusinessId) {
      setOpenedBusinessId(focusBusinessId);
    }
  }, [focusBusinessId]);

  const withAction = useCallback(
    async (key: string, task: () => void | Promise<void>) => {
      setActionLoading((prev) => ({ ...prev, [key]: true }));
      try {
        await task();
      } finally {
        setActionLoading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [],
  );

  const {
    loadingLogs,
    auditInvestigations,
    auditPage,
    hasNextAuditPage,
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
  } = usePlatformAuditSubscription({
    token,
    t,
    setMessage,
  });

  const {
    supportPage,
    hasNextSupportPage,
    supportSessionPage,
    hasNextSupportSessionPage,
    requestingSupport,
    activatingSupportId,
    supportRequests,
    supportSessions,
    subscriptionRequests,
    subscriptionResponseNotes,
    setSubscriptionResponseNotes,
    subscriptionApprovalForms,
    setSubscriptionApprovalForms,
    supportForm,
    setSupportForm,
    supportFilters,
    setSupportFilters,
    supportSessionReasons,
    setSupportSessionReasons,
    revokingSupportSessionId,
    exportDeliveryForm,
    setExportDeliveryForm,
    isMarkingExportDelivered,
    exportDeliveryBusinessId,
    setExportDeliveryBusinessId,
    exportJobs,
    exportQueueStats,
    exportPage,
    hasNextExportPage,
    isLoadingExports,
    isLoadingExportStats,
    exportFilters,
    setExportFilters,
    loadSupportRequests,
    loadSupportSessions,
    loadSubscriptionRequests,
    requestSupport,
    activateSupport,
    applySupportFilters,
    revokeSupportSession,
    updateSubscriptionRequest,
    loadExportJobs,
    loadExportQueueStats,
    exportOnExit,
    markExportDelivered,
    retryExportJob,
    requeueExportJob,
    cancelExportJob,
    goToNextExportPage,
    goToPrevExportPage,
    pendingSupportLogin,
    loggingInAsSupport,
    loginAsSupport,
    clearPendingSupportLogin,
    goToNextSupportPage,
    goToPrevSupportPage,
    goToNextSupportSessionPage,
    goToPrevSupportSessionPage,
  } = usePlatformSupportExports({
    token,
    t,
    setMessage,
  });

  const {
    supportScopeOptions,
    supportStatusOptions,
    supportSeverityOptions,
    supportPriorityOptions,
    incidentSeverityOptions,
    incidentStatusOptions,
    exportLaneDefs,
    exportLaneJobs,
    announcementTierOptions,
    announcementStatusOptions,
    announcementTargetSignature,
  } = usePlatformConsoleOptionSets({
    t,
    auditInvestigations,
    exportJobs,
    announcementForm,
  });

  const {
    announcementBusinessSearch,
    setAnnouncementBusinessSearch,
    isCreatingAnnouncement,
    isPreviewingAnnouncementAudience,
    announcementAudiencePreview,
    announcementPreviewSignature,
    endingAnnouncementId,
    applyDefaultAnnouncementEnd,
    loadAnnouncements,
    createAnnouncement,
    previewAnnouncementAudience,
    endAnnouncement,
    announcementTimeline,
  } = usePlatformAnnouncements({
    token,
    t,
    setMessage,
    announcementForm,
    setAnnouncementForm,
    announcementTargetSignature,
  });

  const {
    incidents,
    incidentPage,
    hasNextIncidentPage,
    isLoadingIncidents,
    incidentFilters,
    setIncidentFilters,
    incidentForm,
    setIncidentForm,
    incidentNotes,
    setIncidentNotes,
    incidentSeverityEdits,
    setIncidentSeverityEdits,
    loadIncidents,
    applyIncidentFilters,
    createIncidentRecord,
    transitionIncidentRecord,
    addIncidentNoteRecord,
    updateIncidentRecord,
    incidentLaneMap,
    goToNextIncidentPage,
    goToPrevIncidentPage,
  } = usePlatformIncidents({
    token,
    t,
    setMessage,
  });

  const updatePlatformPassword = async () => {
    if (!token) {
      setMessage(t('missingToken'));
      return;
    }
    if (!adminPasswordForm.current || !adminPasswordForm.next) {
      setMessage(t('passwordRequired'));
      return;
    }
    if (adminPasswordForm.next !== adminPasswordForm.confirm) {
      setMessage(t('passwordMismatch'));
      return;
    }
    setAdminPasswordBusy(true);
    try {
      await apiFetch('/platform/auth/password', {
        token,
        method: 'POST',
        body: JSON.stringify({
          currentPassword: adminPasswordForm.current,
          newPassword: adminPasswordForm.next,
        }),
      });
      setAdminPasswordForm({ current: '', next: '', confirm: '' });
      setMessage(t('passwordUpdated'));
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('passwordUpdateFailed')));
    } finally {
      setAdminPasswordBusy(false);
    }
  };

  const {
    businessOptions,
    businessLookup,
    resolvedBusinessId,
    openedBusiness,
    openedBusinessWorkspace,
    businessSelectOptions,
    filteredBusinesses,
    filteredBusinessIds,
  } = usePlatformBusinessDerived({
    businesses,
    businessSearch,
    pinnedBusinessIds,
    businessStatusFilter,
    showBusinessDetailPage,
    focusBusinessId,
    openedBusinessId,
    businessWorkspaceMap,
  });

  useEffect(() => {
    if (
      !showBusinessDetailPage &&
      openedBusinessId &&
      !filteredBusinessIds.has(openedBusinessId)
    ) {
      setOpenedBusinessId('');
    }
  }, [openedBusinessId, filteredBusinessIds, showBusinessDetailPage]);

  const {
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
  } = usePlatformConsoleLoaders({
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
  });

  const goToNextBusinessPage = useCallback(async () => {
    if (!nextBusinessCursor) return;
    const cursor = nextBusinessCursor;
    setBusinessPage((p) => p + 1);
    setBusinessCursorStack((prev) => [...prev, cursor]);
    await loadBusinesses(cursor);
  }, [nextBusinessCursor, loadBusinesses]);

  const goToPrevBusinessPage = useCallback(async () => {
    if (businessPage <= 1) return;
    const newPage = businessPage - 1;
    const cursor = businessCursorStack[newPage - 1];
    setBusinessPage(newPage);
    setBusinessCursorStack((prev) => prev.slice(0, newPage));
    await loadBusinesses(cursor ?? undefined);
  }, [businessPage, businessCursorStack, loadBusinesses]);

  useEffect(() => {
    setToken(getPlatformAccessToken());
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }
    const payload = decodeJwt<{ sub?: string }>(token);
    if (payload?.sub) {
      setPlatformAdminId(payload.sub);
    }
  }, [token]);

  usePlatformConsoleStorage({
    pinnedBusinessIds,
    supportNotes,
    setPinnedBusinessIds,
    setSupportNotes,
  });

  usePlatformEventStream({
    onSubscriptionRequestCreated: useCallback(() => {
      void loadSubscriptionRequests();
      setQueuesSummary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          subscriptions: {
            ...prev.subscriptions,
            total: prev.subscriptions.total + 1,
          },
        };
      });
    }, [loadSubscriptionRequests]),

    onIncidentCreated: useCallback((data: Record<string, unknown>) => {
      void loadIncidents();
      if (data.severity === 'CRITICAL') {
        setMessage(t('sseIncidentCritical'));
      }
    }, [loadIncidents, setMessage, t]),

    onIncidentTransitioned: useCallback(() => {
      void loadIncidents();
    }, [loadIncidents]),

    onExportFailed: useCallback(() => {
      setOverviewSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          signals: {
            ...(prev.signals ?? { queuePressureTotal: 0, exportsFailed: 0, apiTotalRequests: 0 }),
            exportsFailed: (prev.signals?.exportsFailed ?? 0) + 1,
          },
        };
      });
      setMessage(t('sseExportFailed'));
    }, [setMessage, t]),

    onBusinessReviewFlagged: useCallback(() => {
      setOverviewSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          kpis: {
            ...prev.kpis,
            underReview: prev.kpis.underReview + 1,
          },
        };
      });
    }, []),
  });

  useEffect(() => {
    setRevokeReasonTarget('');
    setRevokeReason('');
  }, [openedBusinessId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadBusinessOnboarding = useCallback(
    async (businessId: string) => {
      if (!token || !businessId) return;
      setLoadingOnboarding((prev) => ({ ...prev, [businessId]: true }));
      try {
        type OnboardingResult = {
          businessId: string;
          milestones: { branches: boolean; products: boolean; sales: boolean; users: boolean; settings: boolean };
          completedCount: number; totalCount: number; percentComplete: number; generatedAt: string;
        };
        const data = await apiFetch<OnboardingResult>(
          `/platform/businesses/${businessId}/onboarding`,
          { token },
        );
        setBusinessOnboarding((prev) => ({ ...prev, [businessId]: data }));
      } catch {
        // silent — onboarding load failures shouldn't block the workspace
      } finally {
        setLoadingOnboarding((prev) => ({ ...prev, [businessId]: false }));
      }
    },
    [token],
  );

  const loadBusinessNotes = useCallback(
    async (businessId: string) => {
      if (!token || !businessId) return;
      setLoadingNotes((prev) => ({ ...prev, [businessId]: true }));
      try {
        type NotesResponse = { items: BusinessNote[] };
        const data = await apiFetch<NotesResponse>(
          `/platform/businesses/${businessId}/notes?limit=50`,
          { token },
        );
        setBusinessNotes((prev) => ({ ...prev, [businessId]: data.items ?? [] }));
      } catch {
        // silent
      } finally {
        setLoadingNotes((prev) => ({ ...prev, [businessId]: false }));
      }
    },
    [token],
  );

  const createBusinessNote = useCallback(
    async (businessId: string) => {
      if (!token || !businessId) return;
      const body = noteInput[businessId]?.trim() ?? '';
      if (!body) return;
      try {
        await apiFetch(`/platform/businesses/${businessId}/notes`, {
          token,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        setNoteInput((prev) => ({ ...prev, [businessId]: '' }));
        await loadBusinessNotes(businessId);
      } catch (err) {
        setMessage(getApiErrorMessage(err, t('createNoteFailed')));
      }
    },
    [token, noteInput, loadBusinessNotes, setMessage, t],
  );

  const deleteBusinessNote = useCallback(
    async (noteId: string, businessId: string) => {
      if (!token) return;
      try {
        await apiFetch(`/platform/businesses/${businessId}/notes/${noteId}`, {
          token,
          method: 'DELETE',
        });
        setBusinessNotes((prev) => ({
          ...prev,
          [businessId]: (prev[businessId] ?? []).filter((n) => n.id !== noteId),
        }));
      } catch (err) {
        setMessage(getApiErrorMessage(err, t('deleteNoteFailed')));
      }
    },
    [token, setMessage, t],
  );

  const loadPurchaseHistory = useCallback(
    async (businessId: string) => {
      if (!token || !businessId) return;
      setLoadingPurchaseHistory((prev) => ({ ...prev, [businessId]: true }));
      try {
        type PHResponse = { items: PurchaseHistoryItem[]; nextCursor: string | null };
        const data = await apiFetch<PHResponse>(
          `/platform/subscriptions/${businessId}/purchases?limit=20`,
          { token },
        );
        setPurchaseHistory((prev) => ({ ...prev, [businessId]: data.items ?? [] }));
      } catch {
        // silent
      } finally {
        setLoadingPurchaseHistory((prev) => ({ ...prev, [businessId]: false }));
      }
    },
    [token],
  );

  const loadScheduledActions = useCallback(
    async (businessId: string) => {
      if (!token || !businessId) return;
      setLoadingScheduledActions((prev) => ({ ...prev, [businessId]: true }));
      try {
        type SA = ScheduledAction[];
        const data = await apiFetch<SA>(
          `/platform/businesses/${businessId}/scheduled-actions`,
          { token },
        );
        setScheduledActions((prev) => ({ ...prev, [businessId]: data }));
      } catch {
        // silent
      } finally {
        setLoadingScheduledActions((prev) => ({ ...prev, [businessId]: false }));
      }
    },
    [token],
  );

  const createScheduledAction = useCallback(
    async (businessId: string) => {
      if (!token || !businessId) return;
      const form = scheduledActionForm[businessId];
      if (!form?.actionType || !form?.scheduledFor) return;
      try {
        await apiFetch(`/platform/businesses/${businessId}/scheduled-actions`, {
          token,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: form.actionType,
            payload: form.payload ?? {},
            scheduledFor: localToUtcIso(form.scheduledFor, 'Africa/Dar_es_Salaam'),
          }),
        });
        setScheduledActionForm((prev) => ({
          ...prev,
          [businessId]: { actionType: '', payload: {}, scheduledFor: '' },
        }));
        await loadScheduledActions(businessId);
      } catch (err) {
        setMessage(getApiErrorMessage(err, t('createScheduledActionFailed')));
      }
    },
    [token, scheduledActionForm, loadScheduledActions, setMessage, t],
  );

  const cancelScheduledAction = useCallback(
    async (actionId: string, businessId: string) => {
      if (!token) return;
      try {
        await apiFetch(`/platform/businesses/${businessId}/scheduled-actions/${actionId}`, {
          token,
          method: 'DELETE',
        });
        setScheduledActions((prev) => ({
          ...prev,
          [businessId]: (prev[businessId] ?? []).filter((a) => a.id !== actionId),
        }));
      } catch (err) {
        setMessage(getApiErrorMessage(err, t('cancelScheduledActionFailed')));
      }
    },
    [token, setMessage, t],
  );

  const handleOpenSupportSession = useCallback(
    (businessId: string, severity: string, reason: string) => {
      const validSeverity = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)
        ? (severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')
        : 'MEDIUM';
      setSupportForm((prev) => ({
        ...prev,
        businessId,
        reason: reason || prev.reason,
        severity: validSeverity,
      }));
      router.push(`/${locale}/platform/access`);
    },
    [setSupportForm, router, locale],
  );

  const createBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }
    setMessage(null);
    setCreatingBusiness(true);
    try {
      await apiFetch('/platform/businesses', {
        token,
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setMessage(t('businessCreated'));
      setCreateForm({
        businessName: '',
        ownerName: '',
        ownerEmail: '',
        ownerTempPassword: '',
        tier: 'BUSINESS',
      });
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('createBusinessFailed')));
    } finally {
      setCreatingBusiness(false);
    }
  };

  const loadBusinessWorkspace = useCallback(
    async (businessId: string) => {
      if (!token || !businessId) {
        return;
      }
      setLoadingBusinessWorkspace((prev) => ({ ...prev, [businessId]: true }));
      try {
        const data = await apiFetch<BusinessWorkspace>(
          `/platform/businesses/${businessId}/workspace`,
          { token },
        );
        setBusinessWorkspaceMap((prev) => ({ ...prev, [businessId]: data }));
      } catch (err) {
        setMessage(getApiErrorMessage(err, t('businessWorkspaceLoadFailed')));
      } finally {
        setLoadingBusinessWorkspace((prev) => ({ ...prev, [businessId]: false }));
      }
    },
    [token, t, setMessage],
  );

  useEffect(() => {
    if (!showBusinessDetailPage || !resolvedBusinessId || !token) {
      return;
    }
    void loadBusinessWorkspace(resolvedBusinessId);
  }, [
    showBusinessDetailPage,
    resolvedBusinessId,
    token,
    loadBusinessWorkspace,
  ]);

  const {
    businessActionModal,
    setBusinessActionModal,
    actionNeedsPreflight,
    saveStatusAndAccess,
    updateStatus,
    updateSubscription,
    recordSubscriptionPurchase,
    resetSubscriptionLimits,
    updateReadOnly,
    updateReview,
    updateRateLimits,
    loadBusinessHealth,
    loadDevices,
    revokeDevice,
    loadHealthForPinned,
    loadHealthForSelected,
    togglePinnedBusiness,
    applySelectedBusiness,
    runQuickStatus,
    runQuickReadOnly,
    runQuickExtendTrial,
    openBusinessActionModal,
    executeBusinessActionModal,
  } = usePlatformBusinessActions({
    token,
    t,
    setMessage,
    loadData,
    withAction,
    showBusinessDetailPage,
    resolvedBusinessId,
    loadBusinessWorkspace,
    selectedBusinessId,
    setSupportForm,
    setHistoryBusinessId,
    setAuditBusinessId,
    setExportDeliveryBusinessId,
    setOpenedBusinessId,
    quickActions,
    subscriptionEdits,
    setSubscriptionEdits,
    businesses,
    statusEdits,
    readOnlyEdits,
    reviewEdits,
    rateLimitEdits,
    revokeReason,
    setRevokeReason,
    setRevokeReasonTarget,
    setIsRevokingSessions,
    healthBusinessId,
    setHealthLoading,
    pinnedBusinessIds,
    setPinnedBusinessIds,
    setHealthMap,
    setLoadingDevices,
    setDevicesMap,
    setPurgingBusinessId,
  });

  const {
    formatDateLabel,
    getDaysRemaining,
    getBusinessRiskScore,
    businessTrendSeries,
    chartData,
    healthStatusLabel,
    incidentLaneDefs,
    incidentStatusLabel,
    nextIncidentStatus,
    overviewQueues,
    queueStatusLabel,
  } = usePlatformConsolePresentation({
    t,
    metrics,
    businessTrendRange,
    queuesSummary,
    overviewSnapshot,
    locale,
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-10">
      <PlatformConsoleHeader t={t} message={message} />

      {showOperations && (
        <div className="nvi-reveal">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">{t('operationsViewTag')}</p>
          <h2 className="mt-0.5 text-2xl font-semibold text-[color:var(--pt-text-1)]">{t('operationsViewTitle')}</h2>
          <p className="mt-1 text-sm text-[color:var(--pt-text-muted)]">{t('operationsViewSubtitle')}</p>
          <div className="mt-4 flex items-center gap-1 rounded border border-[color:var(--pt-accent-border)] p-0.5 w-fit">
            {(['INCIDENTS', 'EXPORTS'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setOperationsTab(tab)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  operationsTab === tab
                    ? 'bg-[var(--pt-accent)] text-black'
                    : 'text-[color:var(--pt-text-2)] hover:text-[color:var(--pt-text-1)]'
                }`}
              >
                {tab === 'INCIDENTS' ? t('operationsTabIncidents') : t('operationsTabExports')}
              </button>
            ))}
          </div>
        </div>
      )}

      {showAccess && (
        <div className="nvi-reveal">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">{t('accessViewTag')}</p>
          <h2 className="mt-0.5 text-2xl font-semibold text-[color:var(--pt-text-1)]">{t('accessViewTitle')}</h2>
          <p className="mt-1 text-sm text-[color:var(--pt-text-muted)]">{t('accessViewSubtitle')}</p>
        </div>
      )}

      {showIntelligence && (
        <div className="nvi-reveal">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">{t('intelligenceViewTag')}</p>
          <h2 className="mt-0.5 text-2xl font-semibold text-[color:var(--pt-text-1)]">{t('intelligenceViewTitle')}</h2>
          <p className="mt-1 text-sm text-[color:var(--pt-text-muted)]">{t('intelligenceViewSubtitle')}</p>
          <div className="mt-4 flex items-center gap-1 rounded border border-[color:var(--pt-accent-border)] p-0.5 w-fit">
            {(['AUDIT', 'HEALTH'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setIntelligenceTab(tab)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  intelligenceTab === tab
                    ? 'bg-[var(--pt-accent)] text-black'
                    : 'text-[color:var(--pt-text-2)] hover:text-[color:var(--pt-text-1)]'
                }`}
              >
                {tab === 'AUDIT' ? t('intelligenceTabAudit') : t('intelligenceTabHealth')}
              </button>
            ))}
          </div>
        </div>
      )}

      <PlatformOverviewCommandSurface
        show={showOverview}
        t={t}
        locale={locale}
        overviewSnapshot={overviewSnapshot}
        overviewQueues={overviewQueues}
        isLoadingOverview={isLoadingOverview}
        withAction={withAction}
        loadOverviewSnapshot={loadOverviewSnapshot}
        loadQueuesSummary={loadQueuesSummary}
        queueStatusLabel={queueStatusLabel}
        activityFeed={activityFeed}
        loadActivityFeed={loadActivityFeed}
        actionLoading={actionLoading}
      />

      <PlatformSecuritySection
        t={t}
        show={showOverview}
        platformAdminId={platformAdminId}
        adminPasswordForm={adminPasswordForm}
        setAdminPasswordForm={setAdminPasswordForm}
        adminPasswordVisible={adminPasswordVisible}
        setAdminPasswordVisible={setAdminPasswordVisible}
        adminPasswordBusy={adminPasswordBusy}
        updatePlatformPassword={updatePlatformPassword}
      />

      <PlatformMetricsSection
        t={t}
        show={showOverview || (showHealth && (!showIntelligence || intelligenceTab === 'HEALTH'))}
        metricsRange={metricsRange}
        setMetricsRange={setMetricsRange}
        metricsFrom={metricsFrom}
        setMetricsFrom={setMetricsFrom}
        metricsTo={metricsTo}
        setMetricsTo={setMetricsTo}
        withAction={withAction}
        loadMetrics={loadMetrics}
        actionLoading={actionLoading}
        metrics={metrics}
        chartData={chartData}
      />

      <PlatformHealthCommandSurface
        show={showHealth && (!showIntelligence || intelligenceTab === 'HEALTH')}
        t={t}
        locale={locale}
        healthMatrix={healthMatrix}
        actionLoading={actionLoading}
        healthLoading={healthLoading}
        withAction={withAction}
        loadHealthMatrix={loadHealthMatrix}
        loadHealthForSelected={loadHealthForSelected}
        loadHealthForPinned={loadHealthForPinned}
        healthStatusLabel={healthStatusLabel}
        healthBusinessId={healthBusinessId}
        setHealthBusinessId={setHealthBusinessId}
        businessSelectOptions={businessSelectOptions}
        healthMap={healthMap}
        businessLookup={businessLookup}
        deviceFleetBusinessId={deviceFleetBusinessId}
        setDeviceFleetBusinessId={setDeviceFleetBusinessId}
        deviceRevokeReason={deviceRevokeReason}
        setDeviceRevokeReason={setDeviceRevokeReason}
        setMessage={setMessage}
        loadDevices={loadDevices}
        devicesMap={devicesMap}
        loadingDevices={loadingDevices}
        revokeDevice={revokeDevice}
      />

      <PlatformIncidentsCommandSurface
        show={showIncidents && !showOperations}
        t={t}
        locale={locale}
        withAction={withAction}
        loadIncidents={loadIncidents}
        isLoadingIncidents={isLoadingIncidents}
        incidentFilters={incidentFilters}
        setIncidentFilters={setIncidentFilters}
        businessSelectOptions={businessSelectOptions}
        incidentStatusOptions={incidentStatusOptions}
        incidentSeverityOptions={incidentSeverityOptions}
        actionLoading={actionLoading}
        applyIncidentFilters={applyIncidentFilters}
        incidentForm={incidentForm}
        setIncidentForm={setIncidentForm}
        createIncidentRecord={createIncidentRecord}
        incidentLaneDefs={incidentLaneDefs}
        incidentLaneMap={incidentLaneMap}
        nextIncidentStatus={nextIncidentStatus}
        incidentNotes={incidentNotes}
        setIncidentNotes={setIncidentNotes}
        incidentSeverityEdits={incidentSeverityEdits}
        setIncidentSeverityEdits={setIncidentSeverityEdits}
        updateIncidentRecord={updateIncidentRecord}
        addIncidentNoteRecord={addIncidentNoteRecord}
        transitionIncidentRecord={transitionIncidentRecord}
        incidentStatusLabel={incidentStatusLabel}
        incidents={incidents}
        incidentPage={incidentPage}
        hasNextIncidentPage={hasNextIncidentPage}
        onIncidentNextPage={goToNextIncidentPage}
        onIncidentPrevPage={goToPrevIncidentPage}
        onOpenSupportSession={handleOpenSupportSession}
      />

      {/* Operations view — tab-based (Incidents | Exports) */}
      <PlatformIncidentsCommandSurface
        show={showOperations && operationsTab === 'INCIDENTS'}
        t={t}
        locale={locale}
        withAction={withAction}
        loadIncidents={loadIncidents}
        isLoadingIncidents={isLoadingIncidents}
        incidentFilters={incidentFilters}
        setIncidentFilters={setIncidentFilters}
        businessSelectOptions={businessSelectOptions}
        incidentStatusOptions={incidentStatusOptions}
        incidentSeverityOptions={incidentSeverityOptions}
        actionLoading={actionLoading}
        applyIncidentFilters={applyIncidentFilters}
        incidentForm={incidentForm}
        setIncidentForm={setIncidentForm}
        createIncidentRecord={createIncidentRecord}
        incidentLaneDefs={incidentLaneDefs}
        incidentLaneMap={incidentLaneMap}
        nextIncidentStatus={nextIncidentStatus}
        incidentNotes={incidentNotes}
        setIncidentNotes={setIncidentNotes}
        incidentSeverityEdits={incidentSeverityEdits}
        setIncidentSeverityEdits={setIncidentSeverityEdits}
        updateIncidentRecord={updateIncidentRecord}
        addIncidentNoteRecord={addIncidentNoteRecord}
        transitionIncidentRecord={transitionIncidentRecord}
        incidentStatusLabel={incidentStatusLabel}
        incidents={incidents}
        incidentPage={incidentPage}
        hasNextIncidentPage={hasNextIncidentPage}
        onIncidentNextPage={goToNextIncidentPage}
        onIncidentPrevPage={goToPrevIncidentPage}
        onOpenSupportSession={handleOpenSupportSession}
      />
      <PlatformExportsCommandSurface
        show={showOperations && operationsTab === 'EXPORTS'}
        t={t}
        locale={locale}
        withAction={withAction}
        loadExportJobs={loadExportJobs}
        loadExportQueueStats={loadExportQueueStats}
        isLoadingExports={isLoadingExports}
        exportFilters={exportFilters}
        setExportFilters={setExportFilters}
        businessSelectOptions={businessSelectOptions}
        actionLoading={actionLoading}
        exportQueueStats={exportQueueStats}
        exportLaneDefs={exportLaneDefs}
        exportLaneJobs={exportLaneJobs}
        isLoadingExportStats={isLoadingExportStats}
        exportJobs={exportJobs}
        exportPage={exportPage}
        hasNextExportPage={hasNextExportPage}
        onExportNextPage={goToNextExportPage}
        onExportPrevPage={goToPrevExportPage}
        retryExportJob={retryExportJob}
        requeueExportJob={requeueExportJob}
        cancelExportJob={cancelExportJob}
        exportDeliveryBusinessId={exportDeliveryBusinessId}
        setExportDeliveryBusinessId={setExportDeliveryBusinessId}
        setMessage={setMessage}
        exportOnExit={exportOnExit}
        exportDeliveryForm={exportDeliveryForm}
        setExportDeliveryForm={setExportDeliveryForm}
        markExportDelivered={markExportDelivered}
        isMarkingExportDelivered={isMarkingExportDelivered}
        showDelivery={false}
      />

      <PlatformBusinessesCommandSurface
        show={showBusinesses}
        showBusinessDetailPage={showBusinessDetailPage}
        t={t}
        locale={locale}
        withAction={withAction}
        actionLoading={actionLoading}
        loadBusinesses={loadBusinesses}
        businesses={businesses}
        openedBusiness={openedBusiness}
        businessSearch={businessSearch}
        setBusinessSearch={setBusinessSearch}
        businessOptions={businessOptions}
        selectedBusinessId={selectedBusinessId}
        setSelectedBusinessId={setSelectedBusinessId}
        businessSelectOptions={businessSelectOptions}
        applySelectedBusiness={applySelectedBusiness}
        businessStatusFilter={businessStatusFilter}
        setBusinessStatusFilter={setBusinessStatusFilter}
        filteredBusinesses={filteredBusinesses}
        getBusinessRiskScore={getBusinessRiskScore}
        pinnedBusinessIds={pinnedBusinessIds}
        togglePinnedBusiness={togglePinnedBusiness}
        updateReview={updateReview}
        totalBusinesses={totalBusinesses}
        businessPage={businessPage}
        hasNextBusinessPage={nextBusinessCursor !== null}
        onBusinessNextPage={goToNextBusinessPage}
        onBusinessPrevPage={goToPrevBusinessPage}
        openedBusinessWorkspace={openedBusinessWorkspace}
        loadingBusinessWorkspace={loadingBusinessWorkspace}
        businessDrawerTab={businessDrawerTab}
        setBusinessDrawerTab={setBusinessDrawerTab}
        loadBusinessWorkspace={loadBusinessWorkspace}
        loadBusinessHealth={loadBusinessHealth}
        healthMap={healthMap}
        businessTrendRange={businessTrendRange}
        setBusinessTrendRange={setBusinessTrendRange}
        businessTrendSeries={businessTrendSeries}
        formatDateLabel={formatDateLabel}
        getDaysRemaining={getDaysRemaining}
        subscriptionEdits={subscriptionEdits}
        setSubscriptionEdits={setSubscriptionEdits}
        updateSubscription={updateSubscription}
        recordSubscriptionPurchase={recordSubscriptionPurchase}
        resetSubscriptionLimits={resetSubscriptionLimits}
        purchaseHistory={purchaseHistory}
        loadingPurchaseHistory={loadingPurchaseHistory}
        loadPurchaseHistory={loadPurchaseHistory}
        statusEdits={statusEdits}
        setStatusEdits={setStatusEdits}
        updateStatus={updateStatus}
        saveStatusAndAccess={saveStatusAndAccess}
        reviewEdits={reviewEdits}
        setReviewEdits={setReviewEdits}
        incidentSeverityOptions={incidentSeverityOptions}
        supportNotes={supportNotes}
        setSupportNotes={setSupportNotes}
        readOnlyEdits={readOnlyEdits}
        setReadOnlyEdits={setReadOnlyEdits}
        updateReadOnly={updateReadOnly}
        openBusinessActionModal={openBusinessActionModal}
        exportOnExit={exportOnExit}
        deviceRevokeReason={deviceRevokeReason}
        setDeviceRevokeReason={setDeviceRevokeReason}
        loadDevices={loadDevices}
        devicesMap={devicesMap}
        loadingDevices={loadingDevices}
        revokeDevice={revokeDevice}
        businessActionModal={businessActionModal}
        setBusinessActionModal={setBusinessActionModal}
        actionNeedsPreflight={actionNeedsPreflight}
        executeBusinessActionModal={executeBusinessActionModal}
        businessOnboarding={businessOnboarding}
        loadingOnboarding={loadingOnboarding}
        loadBusinessOnboarding={loadBusinessOnboarding}
        businessNotes={businessNotes}
        loadingNotes={loadingNotes}
        noteInput={noteInput}
        setNoteInput={setNoteInput}
        loadBusinessNotes={loadBusinessNotes}
        createBusinessNote={createBusinessNote}
        deleteBusinessNote={deleteBusinessNote}
        scheduledActions={scheduledActions}
        loadingScheduledActions={loadingScheduledActions}
        scheduledActionForm={scheduledActionForm}
        setScheduledActionForm={setScheduledActionForm}
        createScheduledAction={createScheduledAction}
        cancelScheduledAction={cancelScheduledAction}
        platformAdminId={platformAdminId}
      />

      <PlatformBusinessProvisionSurface
        show={showBusinesses && !showBusinessDetailPage}
        t={t}
        businesses={businesses}
        createForm={createForm}
        setCreateForm={setCreateForm}
        createBusiness={createBusiness}
        creatingBusiness={creatingBusiness}
      />

      <PlatformSupportCommandSurface
        show={showSupport}
        t={t}
        actions={actions}
        locale={locale}
        supportForm={supportForm}
        setSupportForm={setSupportForm}
        supportScopeOptions={supportScopeOptions}
        supportSeverityOptions={supportSeverityOptions}
        supportPriorityOptions={supportPriorityOptions}
        supportStatusOptions={supportStatusOptions}
        supportFilters={supportFilters}
        setSupportFilters={setSupportFilters}
        businessSelectOptions={businessSelectOptions}
        requestSupport={requestSupport}
        requestingSupport={requestingSupport}
        applySupportFilters={applySupportFilters}
        supportRequests={supportRequests}
        activateSupport={activateSupport}
        activatingSupportId={activatingSupportId}
        supportPage={supportPage}
        hasNextSupportPage={hasNextSupportPage}
        onSupportNextPage={goToNextSupportPage}
        onSupportPrevPage={goToPrevSupportPage}
        supportSessions={supportSessions}
        supportSessionReasons={supportSessionReasons}
        setSupportSessionReasons={setSupportSessionReasons}
        revokeSupportSession={revokeSupportSession}
        revokingSupportSessionId={revokingSupportSessionId}
        supportSessionPage={supportSessionPage}
        hasNextSupportSessionPage={hasNextSupportSessionPage}
        onSupportSessionNextPage={goToNextSupportSessionPage}
        onSupportSessionPrevPage={goToPrevSupportSessionPage}
        subscriptionRequests={subscriptionRequests}
        subscriptionResponseNotes={subscriptionResponseNotes}
        setSubscriptionResponseNotes={setSubscriptionResponseNotes}
        subscriptionApprovalForms={subscriptionApprovalForms}
        setSubscriptionApprovalForms={setSubscriptionApprovalForms}
        withAction={withAction}
        updateSubscriptionRequest={updateSubscriptionRequest}
        actionLoading={actionLoading}
        pendingSupportLogin={pendingSupportLogin}
        loggingInAsSupport={loggingInAsSupport}
        loginAsSupport={loginAsSupport}
        clearPendingSupportLogin={clearPendingSupportLogin}
      />

      <PlatformSubscriptionIntelligenceSurface
        show={showBusinesses && !showBusinessDetailPage}
        t={t}
        locale={locale}
        historyBusinessId={historyBusinessId}
        setHistoryBusinessId={setHistoryBusinessId}
        businessSelectOptions={businessSelectOptions}
        withAction={withAction}
        loadSubscriptionHistory={loadSubscriptionHistory}
        loadingHistory={loadingHistory}
        subscriptionHistory={subscriptionHistory}
        subscriptionHistoryStats={subscriptionHistoryStats}
      />

      <PlatformExportsCommandSurface
        show={showExports && !showOperations}
        t={t}
        locale={locale}
        withAction={withAction}
        loadExportJobs={loadExportJobs}
        loadExportQueueStats={loadExportQueueStats}
        isLoadingExports={isLoadingExports}
        exportFilters={exportFilters}
        setExportFilters={setExportFilters}
        businessSelectOptions={businessSelectOptions}
        actionLoading={actionLoading}
        exportQueueStats={exportQueueStats}
        exportLaneDefs={exportLaneDefs}
        exportLaneJobs={exportLaneJobs}
        isLoadingExportStats={isLoadingExportStats}
        exportJobs={exportJobs}
        exportPage={exportPage}
        hasNextExportPage={hasNextExportPage}
        onExportNextPage={goToNextExportPage}
        onExportPrevPage={goToPrevExportPage}
        retryExportJob={retryExportJob}
        requeueExportJob={requeueExportJob}
        cancelExportJob={cancelExportJob}
        exportDeliveryBusinessId={exportDeliveryBusinessId}
        setExportDeliveryBusinessId={setExportDeliveryBusinessId}
        setMessage={setMessage}
        exportOnExit={exportOnExit}
        exportDeliveryForm={exportDeliveryForm}
        setExportDeliveryForm={setExportDeliveryForm}
        markExportDelivered={markExportDelivered}
        isMarkingExportDelivered={isMarkingExportDelivered}
      />

      <PlatformAnnouncementsCommandSurface
        show={showAnnouncements}
        t={t}
        announcementForm={announcementForm}
        setAnnouncementForm={setAnnouncementForm}
        createAnnouncement={createAnnouncement}
        announcementBusinessSearch={announcementBusinessSearch}
        setAnnouncementBusinessSearch={setAnnouncementBusinessSearch}
        businessOptions={businessOptions}
        businessLookup={businessLookup}
        announcementTierOptions={announcementTierOptions}
        announcementStatusOptions={announcementStatusOptions}
        previewAnnouncementAudience={previewAnnouncementAudience}
        isPreviewingAnnouncementAudience={isPreviewingAnnouncementAudience}
        announcementAudiencePreview={announcementAudiencePreview}
        isCreatingAnnouncement={isCreatingAnnouncement}
        announcementPreviewSignature={announcementPreviewSignature}
        announcementTargetSignature={announcementTargetSignature}
        applyDefaultAnnouncementEnd={applyDefaultAnnouncementEnd}
        announcementTimeline={announcementTimeline}
        endingAnnouncementId={endingAnnouncementId}
        endAnnouncement={endAnnouncement}
      />

      <PlatformAuditCommandSurface
        show={showAudit && (!showIntelligence || intelligenceTab === 'AUDIT')}
        t={t}
        locale={locale}
        auditBusinessId={auditBusinessId}
        setAuditBusinessId={setAuditBusinessId}
        businessSelectOptions={businessSelectOptions}
        auditAction={auditAction}
        setAuditAction={setAuditAction}
        auditActionOptions={auditActionOptions}
        auditOutcome={auditOutcome}
        setAuditOutcome={setAuditOutcome}
        fetchAuditLogs={fetchAuditLogs}
        loadingLogs={loadingLogs}
        auditInvestigations={auditInvestigations}
        businessLookup={businessLookup}
        withAction={withAction}
        auditPage={auditPage}
        hasNextAuditPage={hasNextAuditPage}
        onAuditNextPage={goToNextAuditPage}
        onAuditPrevPage={goToPrevAuditPage}
        activityFeed={activityFeed}
        loadActivityFeed={loadActivityFeed}
      />

      <PlatformAnalyticsCommandSurface
        show={showAnalytics}
        t={t}
        locale={locale}
        withAction={withAction}
        actionLoading={actionLoading}
        analyticsRevenue={analyticsRevenue}
        analyticsCohorts={analyticsCohorts}
        analyticsChurn={analyticsChurn}
        analyticsConversions={analyticsConversions}
        loadAnalyticsRevenue={loadAnalyticsRevenue}
        loadAnalyticsCohorts={loadAnalyticsCohorts}
        loadAnalyticsChurn={loadAnalyticsChurn}
        loadAnalyticsConversions={loadAnalyticsConversions}
        analyticsChurnRange={analyticsChurnRange}
        setAnalyticsChurnRange={setAnalyticsChurnRange}
      />
    </div>
  );
}
