'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { promptAction, useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { decodeJwt, getPlatformAccessToken } from '@/lib/auth';
import { formatEntityLabel } from '@/lib/display';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { TypeaheadInput } from '@/components/TypeaheadInput';
import { DateTimePickerInput } from '@/components/DateTimePickerInput';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
);

type PlatformView =
  | 'overview'
  | 'health'
  | 'businesses'
  | 'support'
  | 'exports'
  | 'announcements'
  | 'audit'
  | 'incidents';

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

type SupportRequest = {
  id: string;
  businessId: string;
  reason: string;
  scope?: string[] | null;
  durationHours?: number | null;
  status: string;
  expiresAt?: string | null;
};

type SubscriptionRequest = {
  id: string;
  businessId: string;
  type: 'UPGRADE' | 'DOWNGRADE' | 'CANCEL';
  requestedTier?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  responseNote?: string | null;
  createdAt: string;
};

type ExportJob = {
  id: string;
  businessId: string;
  type: string;
  status: string;
  requestedByPlatformAdminId?: string | null;
  requestedByUserId?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  attempts: number;
  lastError?: string | null;
  metadata?: { reason?: string | null } | null;
  business?: { name: string };
};

type AuditLog = {
  id: string;
  action: string;
  outcome: string;
  resourceType: string;
  createdAt: string;
};

type PlatformAuditLog = {
  id: string;
  action: string;
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

export function PlatformConsole({
  view = 'overview',
  focusBusinessId,
}: {
  view?: PlatformView;
  focusBusinessId?: string;
}) {
  const t = useTranslations('platformConsole');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const params = useParams<{ locale?: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMoreBusinesses, setIsLoadingMoreBusinesses] = useState(false);
  const [isLoadingMoreSupport, setIsLoadingMoreSupport] = useState(false);
  const [isLoadingMoreAudit, setIsLoadingMoreAudit] = useState(false);
  const [creatingBusiness, setCreatingBusiness] = useState(false);
  const [requestingSupport, setRequestingSupport] = useState(false);
  const [activatingSupportId, setActivatingSupportId] = useState<string | null>(
    null,
  );
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState<
    SubscriptionRequest[]
  >([]);
  const [subscriptionResponseNotes, setSubscriptionResponseNotes] = useState<
    Record<string, string>
  >({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [platformAuditLogs, setPlatformAuditLogs] = useState<PlatformAuditLog[]>(
    [],
  );
  const [nextBusinessCursor, setNextBusinessCursor] = useState<string | null>(
    null,
  );
  const [nextSupportCursor, setNextSupportCursor] = useState<string | null>(null);
  const [nextAuditCursor, setNextAuditCursor] = useState<string | null>(null);
  const [nextPlatformAuditCursor, setNextPlatformAuditCursor] = useState<
    string | null
  >(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [auditBusinessId, setAuditBusinessId] = useState('');
  const [auditOutcome, setAuditOutcome] = useState('');
  const [auditAction, setAuditAction] = useState('');
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
        trialEndsAt: string;
        graceEndsAt: string;
        expiresAt: string;
        durationDays?: string;
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
  const [supportForm, setSupportForm] = useState({
    businessId: '',
    reason: '',
    durationHours: '',
    scope: [] as string[],
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
  const [announcementBusinessSearch, setAnnouncementBusinessSearch] =
    useState('');
  const [isCreatingAnnouncement, setIsCreatingAnnouncement] = useState(false);
  const [exportDeliveryForm, setExportDeliveryForm] = useState({
    exportJobId: '',
    reason: '',
  });
  const [isMarkingExportDelivered, setIsMarkingExportDelivered] =
    useState(false);
  const [exportDeliveryBusinessId, setExportDeliveryBusinessId] = useState('');
  const [businessSearch, setBusinessSearch] = useState('');
  const [businessStatusFilter, setBusinessStatusFilter] = useState<
    'ACTIVE' | 'UNDER_REVIEW' | 'ARCHIVED' | 'DELETED'
  >('ACTIVE');
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [openedBusinessId, setOpenedBusinessId] = useState(focusBusinessId ?? '');
  const [businessDrawerTab, setBusinessDrawerTab] = useState<
    'SUMMARY' | 'SUBSCRIPTION' | 'RISK_STATUS' | 'ACCESS' | 'DEVICES' | 'DANGER'
  >('SUMMARY');
  const [businessTrendRange, setBusinessTrendRange] = useState<'7d' | '30d'>('7d');
  const [businessActionModal, setBusinessActionModal] = useState<{
    businessId: string;
    action:
      | 'SUSPEND'
      | 'READ_ONLY'
      | 'FORCE_LOGOUT'
      | 'ARCHIVE'
      | 'DELETE_READY'
      | 'RESTORE'
      | 'PURGE';
    step: 1 | 2 | 3;
    reason: string;
    confirmBusinessId: string;
    confirmText: string;
  } | null>(null);
  const [pinnedBusinessIds, setPinnedBusinessIds] = useState<string[]>([]);
  const [supportNotes, setSupportNotes] = useState<Record<string, string>>({});
  const [revokeReasonTarget, setRevokeReasonTarget] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [isRevokingSessions, setIsRevokingSessions] = useState(false);
  const [activityFeed, setActivityFeed] = useState<PlatformAuditLog[]>([]);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [nextExportCursor, setNextExportCursor] = useState<string | null>(null);
  const [isLoadingMoreExports, setIsLoadingMoreExports] = useState(false);
  const [isLoadingExports, setIsLoadingExports] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    businessId: '',
    status: '',
    type: '',
  });
  const [healthBusinessId, setHealthBusinessId] = useState('');
  const [healthLoading, setHealthLoading] = useState(false);
  const [deviceFleetBusinessId, setDeviceFleetBusinessId] = useState('');
  const [deviceRevokeReason, setDeviceRevokeReason] = useState('');
  const [incidentForm, setIncidentForm] = useState({
    businessId: '',
    reason: '',
    severity: 'MEDIUM',
  });
  const [incidentNotes, setIncidentNotes] = useState<Record<string, string>>({});
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
  const showOverview = view === 'overview';
  const showHealth = view === 'health';
  const showBusinesses = view === 'businesses';
  const showSupport = view === 'support';
  const showExports = view === 'exports';
  const showAnnouncements = view === 'announcements';
  const showAudit = view === 'audit';
  const showIncidents = view === 'incidents';
  const showBusinessDetailPage = showBusinesses && Boolean(focusBusinessId);
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

  const supportScopeOptions = useMemo(
    () => [
      { value: 'business', label: t('supportScopeBusiness') },
      { value: 'users', label: t('supportScopeUsers') },
      { value: 'roles', label: t('supportScopeRoles') },
      { value: 'catalog', label: t('supportScopeCatalog') },
      { value: 'stock', label: t('supportScopeStock') },
      { value: 'transfers', label: t('supportScopeTransfers') },
      { value: 'sales', label: t('supportScopeSales') },
      { value: 'purchases', label: t('supportScopePurchases') },
      { value: 'suppliers', label: t('supportScopeSuppliers') },
      { value: 'reports', label: t('supportScopeReports') },
      { value: 'offline', label: t('supportScopeOffline') },
      { value: 'settings', label: t('supportScopeSettings') },
      { value: 'notifications', label: t('supportScopeNotifications') },
    ],
    [t],
  );

  const incidentSeverityOptions = useMemo(
    () => [
      { value: 'LOW', label: t('severityLow') },
      { value: 'MEDIUM', label: t('severityMedium') },
      { value: 'HIGH', label: t('severityHigh') },
      { value: 'CRITICAL', label: t('severityCritical') },
    ],
    [t],
  );

  const announcementTierOptions = useMemo(
    () => [
      { value: 'STARTER', label: t('tierStarter') },
      { value: 'BUSINESS', label: t('tierBusiness') },
      { value: 'ENTERPRISE', label: t('tierEnterprise') },
    ],
    [t],
  );

  const announcementStatusOptions = useMemo(
    () => [
      { value: 'TRIAL', label: t('statusTrial') },
      { value: 'ACTIVE', label: t('statusActive') },
      { value: 'GRACE', label: t('statusGrace') },
      { value: 'EXPIRED', label: t('statusExpired') },
      { value: 'SUSPENDED', label: t('statusSuspended') },
    ],
    [t],
  );

  const formatLocalDateTime = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(
      date.getMinutes(),
    ).padStart(2, '0')}`;

  const formatDateLabel = (value?: string | null) => {
    if (!value) {
      return t('notAvailable');
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return t('notAvailable');
    }
    return parsed.toLocaleDateString();
  };

  const getDaysRemaining = (value?: string | null) => {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    const diff = Math.ceil(
      (parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    return Math.max(0, diff);
  };

  const applyDefaultAnnouncementEnd = (startsAt: string, endsAt: string) => {
    if (!startsAt || endsAt) {
      return endsAt;
    }
    const parsed = new Date(startsAt);
    if (Number.isNaN(parsed.getTime())) {
      return endsAt;
    }
    const nextEnd = new Date(parsed.getTime() + 24 * 60 * 60 * 1000);
    return formatLocalDateTime(nextEnd);
  };

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

  const auditActionOptions = useMemo(() => {
    const unique = new Map<string, string>();
    auditLogs.forEach((log) => {
      if (log.action) {
        unique.set(log.action, log.action);
      }
    });
    return Array.from(unique.values()).map((action) => ({
      id: action,
      label: action,
    }));
  }, [auditLogs]);

  const businessOptions = useMemo(
    () =>
      businesses.map((biz) => ({
        id: biz.id,
        label: `${biz.name} · ${biz.id.slice(0, 6)}`,
      })),
    [businesses],
  );

  const businessLookup = useMemo(
    () => new Map(businesses.map((biz) => [biz.id, biz])),
    [businesses],
  );
  const resolvedBusinessId =
    showBusinessDetailPage && focusBusinessId ? focusBusinessId : openedBusinessId;
  const openedBusiness = resolvedBusinessId
    ? businessLookup.get(resolvedBusinessId) ?? null
    : null;

  const businessSelectOptions = useMemo(
    () =>
      businesses.map((biz) => ({
        value: biz.id,
        label: biz.name,
      })),
    [businesses],
  );

  const filteredBusinesses = useMemo(() => {
    const query = businessSearch.trim().toLowerCase();
    const pinned = new Set(pinnedBusinessIds);
    const byStatus =
      businessStatusFilter === 'ACTIVE'
        ? businesses.filter(
            (biz) =>
              !['ARCHIVED', 'DELETED'].includes(biz.status) &&
              biz.status !== 'SUSPENDED',
          )
        : businessStatusFilter === 'UNDER_REVIEW'
          ? businesses.filter((biz) => Boolean(biz.underReview))
        : businesses.filter((biz) => biz.status === businessStatusFilter);
    const base = query
      ? byStatus.filter((biz) =>
          `${biz.name} ${biz.id}`.toLowerCase().includes(query),
        )
      : byStatus;
    return [...base].sort((a, b) => {
      const aPinned = pinned.has(a.id);
      const bPinned = pinned.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [businessSearch, businesses, pinnedBusinessIds, businessStatusFilter]);
  const filteredBusinessIds = useMemo(
    () => new Set(filteredBusinesses.map((biz) => biz.id)),
    [filteredBusinesses],
  );

  useEffect(() => {
    if (
      !showBusinessDetailPage &&
      openedBusinessId &&
      !filteredBusinessIds.has(openedBusinessId)
    ) {
      setOpenedBusinessId('');
    }
  }, [openedBusinessId, filteredBusinessIds, showBusinessDetailPage]);
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
  const [announcements, setAnnouncements] = useState<
    {
      id: string;
      title: string;
      severity: string;
      startsAt: string;
      endsAt?: string | null;
      businessTargets: { businessId: string }[];
      segmentTargets: { type: 'TIER' | 'STATUS'; value: string }[];
    }[]
  >([]);
  const [endingAnnouncementId, setEndingAnnouncementId] = useState<string | null>(
    null,
  );

  const loadBusinesses = async (cursor?: string, append = false) => {
    if (!token) {
      return;
    }
    if (append) {
      setIsLoadingMoreBusinesses(true);
    }
    try {
      const query = buildCursorQuery({ limit: 20, cursor });
      const biz = await apiFetch<PaginatedResponse<Business> | Business[]>(
        `/platform/businesses${query}`,
        { token },
      );
      const result = normalizePaginated(biz);
      setBusinesses((prev) =>
        append ? [...prev, ...result.items] : result.items,
      );
      setNextBusinessCursor(result.nextCursor);
      setSubscriptionEdits((prev) => {
        const next = append ? { ...prev } : {};
        result.items.forEach((item) => {
          if (!next[item.id]) {
            next[item.id] = {
              tier: item.subscription?.tier ?? 'BUSINESS',
              status: item.subscription?.status ?? 'TRIAL',
              reason: '',
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
  };

  const loadSupportRequests = async (cursor?: string, append = false) => {
    if (!token) {
      return;
    }
    if (append) {
      setIsLoadingMoreSupport(true);
    }
    try {
      const query = buildCursorQuery({ limit: 20, cursor });
      const requests = await apiFetch<
        PaginatedResponse<SupportRequest> | SupportRequest[]
      >(`/platform/support-access/requests${query}`, { token });
      const result = normalizePaginated(requests);
      setSupportRequests((prev) =>
        append ? [...prev, ...result.items] : result.items,
      );
      setNextSupportCursor(result.nextCursor);
    } finally {
      if (append) {
        setIsLoadingMoreSupport(false);
      }
    }
  };

  const loadSubscriptionRequests = async () => {
    if (!token) {
      return;
    }
    try {
      const data = await apiFetch<
        PaginatedResponse<SubscriptionRequest> | SubscriptionRequest[]
      >('/platform/subscription-requests?limit=200', { token });
      const result = normalizePaginated(data);
      setSubscriptionRequests(result.items);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadSubscriptionRequestsFailed')));
    }
  };

  const loadExportJobs = async (cursor?: string, append = false) => {
    if (!token) {
      return;
    }
    if (append) {
      setIsLoadingMoreExports(true);
    } else {
      setIsLoadingExports(true);
    }
    try {
      const query = buildCursorQuery({
        limit: 20,
        cursor,
        businessId: exportFilters.businessId || undefined,
        status: exportFilters.status || undefined,
        type: exportFilters.type || undefined,
      });
      const jobs = await apiFetch<PaginatedResponse<ExportJob> | ExportJob[]>(
        `/platform/exports/jobs${query}`,
        { token },
      );
      const result = normalizePaginated(jobs);
      setExportJobs((prev) =>
        append ? [...prev, ...result.items] : result.items,
      );
      setNextExportCursor(result.nextCursor);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadExportJobsFailed')));
    } finally {
      if (append) {
        setIsLoadingMoreExports(false);
      } else {
        setIsLoadingExports(false);
      }
    }
  };

  const loadMetrics = async () => {
    if (!token) {
      return;
    }
    const metricsResponse = await apiFetch<Metrics>(
      `/platform/metrics?range=${metricsRange}${
        metricsRange === 'custom'
          ? `&from=${encodeURIComponent(metricsFrom)}&to=${encodeURIComponent(metricsTo)}`
          : ''
      }`,
      { token },
    );
    setMetrics(metricsResponse);
  };

  const loadAnnouncements = async () => {
    if (!token) {
      return;
    }
    const data = await apiFetch<
      {
        id: string;
        title: string;
        severity: string;
        startsAt: string;
        endsAt?: string | null;
        businessTargets: { businessId: string }[];
        segmentTargets: { type: 'TIER' | 'STATUS'; value: string }[];
      }[]
    >('/platform/announcements', { token });
    setAnnouncements(data);
  };

  const loadActivityFeed = async () => {
    if (!token) {
      return;
    }
    const query = buildCursorQuery({ limit: 8 });
    const logs = await apiFetch<
      PaginatedResponse<PlatformAuditLog> | PlatformAuditLog[]
    >(`/platform/platform-audit-logs${query}`, { token });
    const result = normalizePaginated(logs);
    setActivityFeed(result.items);
  };

  const loadData = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const tasks = [
        loadBusinesses(),
        loadSupportRequests(),
        loadSubscriptionRequests(),
        loadMetrics(),
        loadAnnouncements(),
        loadActivityFeed(),
      ];
      if (showExports) {
        tasks.push(loadExportJobs());
      }
      await Promise.all(tasks);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadPlatformDataFailed')));
    } finally {
      setIsLoading(false);
    }
  };

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const rawPins = window.localStorage.getItem('nvi.platformPinnedBusinesses');
    const rawNotes = window.localStorage.getItem('nvi.platformSupportNotes');
    if (rawPins) {
      try {
        setPinnedBusinessIds(JSON.parse(rawPins) as string[]);
      } catch (err) {
        console.warn('Failed to parse pinned businesses cache', err);
        setPinnedBusinessIds([]);
      }
    }
    if (rawNotes) {
      try {
        setSupportNotes(JSON.parse(rawNotes) as Record<string, string>);
      } catch (err) {
        console.warn('Failed to parse support notes cache', err);
        setSupportNotes({});
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      'nvi.platformPinnedBusinesses',
      JSON.stringify(pinnedBusinessIds),
    );
  }, [pinnedBusinessIds]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      'nvi.platformSupportNotes',
      JSON.stringify(supportNotes),
    );
  }, [supportNotes]);

  useEffect(() => {
    setRevokeReasonTarget('');
    setRevokeReason('');
  }, [openedBusinessId]);

  useEffect(() => {
    loadData();
  }, [token]);

  useEffect(() => {
    if (!token || metricsRange === 'custom') {
      return;
    }
    loadMetrics();
  }, [metricsRange, token]);

  const createBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }
    setMessage(null);
    setCreatingBusiness(true);
    try {
      const response = await apiFetch<{ verificationToken?: string }>(
        '/platform/businesses',
        {
          token,
          method: 'POST',
          body: JSON.stringify(createForm),
        },
      );
      setMessage(
        response.verificationToken
          ? t('businessCreatedToken', {
              token: response.verificationToken,
            })
          : t('businessCreated'),
      );
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

  const updateStatus = async (businessId: string) => {
    if (!token) {
      return;
    }
    const values = statusEdits[businessId];
    if (!values?.reason) {
      setMessage(t('statusReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/businesses/${businessId}/status`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ status: values.status, reason: values.reason }),
      });
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('updateStatusFailed')));
    }
  };

  const requestSupport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }
    setMessage(null);
    setRequestingSupport(true);
    try {
      const durationValue = supportForm.durationHours.trim();
      await apiFetch('/platform/support-access/requests', {
        token,
        method: 'POST',
        body: JSON.stringify({
          businessId: supportForm.businessId,
          reason: supportForm.reason,
          scope: supportForm.scope,
          durationHours: durationValue ? Number(durationValue) : undefined,
        }),
      });
      setSupportForm({ businessId: '', reason: '', durationHours: '', scope: [] });
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('createSupportRequestFailed')));
    } finally {
      setRequestingSupport(false);
    }
  };

  const activateSupport = async (requestId: string) => {
    if (!token) {
      return;
    }
    setActivatingSupportId(requestId);
    try {
      const response = await apiFetch<{ token: string; businessId: string }>(
        `/platform/support-access/requests/${requestId}/activate`,
        {
          token,
          method: 'POST',
        },
      );
      setMessage(
        t('supportTokenCreated', {
          businessId: response.businessId,
          token: response.token,
        }),
      );
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('activateSupportFailed')));
    } finally {
      setActivatingSupportId(null);
    }
  };

  const updateSubscriptionRequest = async (
    requestId: string,
    action: 'approve' | 'reject',
  ) => {
    if (!token) {
      return;
    }
    const note = subscriptionResponseNotes[requestId] ?? '';
    if (!note.trim()) {
      setMessage(t('subscriptionDecisionReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/subscription-requests/${requestId}/${action}`, {
        token,
        method: 'POST',
        body: JSON.stringify({ responseNote: note }),
      });
      await loadSubscriptionRequests();
      setSubscriptionResponseNotes((prev) => ({ ...prev, [requestId]: '' }));
      setMessage(
        action === 'approve'
          ? t('subscriptionRequestApproved')
          : t('subscriptionRequestRejected'),
      );
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('updateSubscriptionRequestFailed')));
    }
  };

  const exportOnExit = async (businessId: string) => {
    if (!token) {
      return;
    }
    try {
      await apiFetch('/platform/exports/on-exit', {
        token,
        method: 'POST',
        body: JSON.stringify({ businessId, reason: 'Platform export request' }),
      });
      setMessage(t('exportOnExitRequested'));
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('exportOnExitFailed')));
    }
  };

  const markExportDelivered = async () => {
    if (!token) {
      return;
    }
    if (!exportDeliveryForm.exportJobId || !exportDeliveryForm.reason) {
      setMessage(t('exportDeliveryRequiresFields'));
      return;
    }
    try {
      setIsMarkingExportDelivered(true);
      await apiFetch(`/platform/exports/${exportDeliveryForm.exportJobId}/delivered`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ reason: exportDeliveryForm.reason }),
      });
      setMessage(t('exportMarkedDelivered'));
      setExportDeliveryForm({ exportJobId: '', reason: '' });
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('exportMarkDeliveredFailed')));
    } finally {
      setIsMarkingExportDelivered(false);
    }
  };

  const updateSubscription = async (businessId: string) => {
    if (!token) {
      return;
    }
    const values = subscriptionEdits[businessId];
    if (!values?.reason) {
      setMessage(t('subscriptionReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/subscriptions/${businessId}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({
          tier: values.tier,
          status: values.status,
          reason: values.reason,
          trialEndsAt: values.trialEndsAt || null,
          graceEndsAt: values.graceEndsAt || null,
          expiresAt: values.expiresAt || null,
        }),
      });
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('updateSubscriptionFailed')));
    }
  };

  const applySubscriptionDuration = (businessId: string) => {
    const values = subscriptionEdits[businessId];
    if (!values) {
      return;
    }
    const days = Number(values.durationDays ?? '');
    if (!days || Number.isNaN(days) || days <= 0) {
      setMessage(t('subscriptionDurationInvalid'));
      return;
    }
    const nextExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    setSubscriptionEdits((prev) => ({
      ...prev,
      [businessId]: {
        ...(prev[businessId] ?? values),
        expiresAt: formatLocalDateTime(nextExpiry),
      },
    }));
  };

  const resetSubscriptionLimits = async (businessId: string) => {
    if (!token) {
      return;
    }
    const values = subscriptionEdits[businessId];
    if (!values?.reason) {
      setMessage(t('subscriptionReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/subscriptions/${businessId}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({
          limits: null,
          reason: values.reason,
        }),
      });
      setMessage(t('resetSubscriptionLimitsSuccess'));
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('resetSubscriptionLimitsFailed')));
    }
  };

  const updateReadOnly = async (businessId: string) => {
    if (!token) {
      return;
    }
    const values = readOnlyEdits[businessId];
    if (!values) {
      return;
    }
    if (values.enabled && !values.reason) {
      setMessage(t('readOnlyReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/businesses/${businessId}/read-only`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({
          enabled: values.enabled,
          reason: values.reason ? values.reason : undefined,
        }),
      });
      setMessage(
        values.enabled ? t('readOnlyEnabled') : t('readOnlyDisabled'),
      );
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('updateReadOnlyFailed')));
    }
  };

  const updateReview = async (
    businessId: string,
    override?: { underReview: boolean; reason: string; severity?: string },
  ) => {
    if (!token) {
      return;
    }
    const values = override ?? reviewEdits[businessId];
    if (!values?.reason) {
      setMessage(t('reviewReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/businesses/${businessId}/review`, {
        token,
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('updateReviewFailed')));
    }
  };

  const revokeBusinessSessions = async (businessId: string) => {
    if (!token) {
      return;
    }
    if (!revokeReason.trim()) {
      setMessage(t('forceLogoutReasonRequired'));
      return;
    }
    setIsRevokingSessions(true);
    try {
      const response = await apiFetch<{ revokedCount: number }>(
        `/platform/businesses/${businessId}/revoke-sessions`,
        {
          token,
          method: 'POST',
          body: JSON.stringify({ reason: revokeReason }),
        },
      );
      setMessage(
        t('forceLogoutSuccess', { value: response.revokedCount ?? 0 }),
      );
      setRevokeReason('');
      setRevokeReasonTarget('');
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('forceLogoutFailed')));
    } finally {
      setIsRevokingSessions(false);
    }
  };

  const updateRateLimits = async (businessId: string) => {
    if (!token) {
      return;
    }
    const values = rateLimitEdits[businessId];
    if (!values?.reason) {
      setMessage(t('rateLimitReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/businesses/${businessId}/rate-limits`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({
          limit: values.limit ? Number(values.limit) : null,
          ttlSeconds: values.ttlSeconds ? Number(values.ttlSeconds) : null,
          expiresAt: values.expiresAt || null,
          reason: values.reason,
        }),
      });
      setMessage(t('rateLimitApplied'));
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('rateLimitFailed')));
    }
  };

  const loadBusinessHealth = async (businessId: string) => {
    if (!token) {
      return;
    }
    const data = await apiFetch<{
      subscriptionStatus: string;
      offlineFailed: number;
      exportsPending: number;
      score: number;
    }>(`/platform/businesses/${businessId}/health`, { token });
    setHealthMap((prev) => ({ ...prev, [businessId]: data }));
  };

  const loadDevices = async (businessId: string) => {
    if (!token) {
      return;
    }
    setLoadingDevices((prev) => ({ ...prev, [businessId]: true }));
    try {
      const data = await apiFetch<
        { id: string; deviceName?: string | null; status: string }[]
      >(`/platform/businesses/${businessId}/devices`, { token });
      setDevicesMap((prev) => ({ ...prev, [businessId]: data }));
    } finally {
      setLoadingDevices((prev) => ({ ...prev, [businessId]: false }));
    }
  };

  const revokeDevice = async (
    deviceId: string,
    businessId: string,
    reason?: string,
  ) => {
    if (!token) {
      return;
    }
    try {
      await apiFetch(`/platform/devices/${deviceId}/revoke`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          reason: reason?.trim() || 'Support device revoke',
        }),
      });
      await loadDevices(businessId);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('revokeDeviceFailed')));
    }
  };

  const updateStatusOverride = async (
    businessId: string,
    status: string,
    reason?: string,
  ) => {
    if (!token) {
      return;
    }
    if (!reason?.trim()) {
      setMessage(t('statusReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/businesses/${businessId}/status`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      });
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('updateStatusFailed')));
    }
  };

  const updateReadOnlyOverride = async (
    businessId: string,
    enabled: boolean,
    reason?: string,
  ) => {
    if (!token) {
      return;
    }
    if (enabled && !reason?.trim()) {
      setMessage(t('readOnlyReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/businesses/${businessId}/read-only`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ enabled, reason }),
      });
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('updateReadOnlyFailed')));
    }
  };

  const purgeBusiness = async (businessId: string) => {
    if (!token) {
      return;
    }
    const reason = quickActions[businessId]?.reason?.trim();
    if (!reason) {
      setMessage(t('purgeReasonRequired'));
      return;
    }
    const confirmBusinessId = await promptAction({
      title: t('purgeConfirmTitle'),
      message: t('purgeConfirmBusinessIdMessage', { id: businessId }),
      placeholder: t('purgeBusinessIdPlaceholder'),
      confirmText: t('purgeContinue'),
    });
    if (!confirmBusinessId || confirmBusinessId.trim() !== businessId) {
      setMessage(t('purgeConfirmMismatch'));
      return;
    }
    const confirmText = await promptAction({
      title: t('purgeConfirmTitle'),
      message: t('purgeConfirmTextMessage'),
      placeholder: t('purgeConfirmPlaceholder'),
      confirmText: t('purgeNow'),
    });
    if (!confirmText || confirmText.trim() !== 'DELETE') {
      setMessage(t('purgeConfirmMismatch'));
      return;
    }
    setPurgingBusinessId(businessId);
    try {
      await apiFetch(`/platform/businesses/${businessId}/purge`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          reason,
          confirmBusinessId,
          confirmText,
        }),
      });
      setMessage(t('purgeSuccess'));
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('purgeFailed')));
    } finally {
      setPurgingBusinessId(null);
    }
  };

  const loadHealthForPinned = async () => {
    if (!pinnedBusinessIds.length) {
      setMessage(t('pinBusinessesHint'));
      return;
    }
    setHealthLoading(true);
    try {
      for (const businessId of pinnedBusinessIds) {
        await loadBusinessHealth(businessId);
      }
    } finally {
      setHealthLoading(false);
    }
  };

  const loadHealthForSelected = async () => {
    if (!healthBusinessId) {
      setMessage(t('selectBusinessLoadHealth'));
      return;
    }
    setHealthLoading(true);
    try {
      await loadBusinessHealth(healthBusinessId);
    } finally {
      setHealthLoading(false);
    }
  };

  const togglePinnedBusiness = (businessId: string) => {
    setPinnedBusinessIds((prev) =>
      prev.includes(businessId)
        ? prev.filter((id) => id !== businessId)
        : [...prev, businessId],
    );
  };

  const applySelectedBusiness = () => {
    if (!selectedBusinessId) {
      setMessage(t('selectBusinessApply'));
      return;
    }
    setSupportForm((prev) => ({ ...prev, businessId: selectedBusinessId }));
    setHistoryBusinessId(selectedBusinessId);
    setAuditBusinessId(selectedBusinessId);
    setExportDeliveryBusinessId(selectedBusinessId);
    setOpenedBusinessId(selectedBusinessId);
  };

  const runQuickStatus = async (businessId: string, status: string) => {
    if (!token) {
      return;
    }
    const reason = quickActions[businessId]?.reason?.trim();
    if (!reason) {
      setMessage(t('quickActionReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/businesses/${businessId}/status`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      });
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('applyQuickActionFailed')));
    }
  };

  const runQuickReadOnly = async (businessId: string) => {
    if (!token) {
      return;
    }
    const reason = quickActions[businessId]?.reason?.trim();
    if (!reason) {
      setMessage(t('quickActionReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/businesses/${businessId}/read-only`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ enabled: true, reason }),
      });
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('enableReadOnlyFailed')));
    }
  };

  const runQuickExtendTrial = async (businessId: string) => {
    if (!token) {
      return;
    }
    const reason = quickActions[businessId]?.reason?.trim();
    const days = Number(quickActions[businessId]?.trialDays ?? 7);
    if (!reason || !days || Number.isNaN(days)) {
      setMessage(t('trialExtensionRequirements'));
      return;
    }
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const tier =
      subscriptionEdits[businessId]?.tier ??
      businesses.find((biz) => biz.id === businessId)?.subscription?.tier ??
      'BUSINESS';
    try {
      await apiFetch(`/platform/subscriptions/${businessId}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({
          tier,
          status: 'TRIAL',
          reason,
          trialEndsAt: trialEndsAt.toISOString(),
        }),
      });
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('extendTrialFailed')));
    }
  };

  const openBusinessActionModal = (
    businessId: string,
    action:
      | 'SUSPEND'
      | 'READ_ONLY'
      | 'FORCE_LOGOUT'
      | 'ARCHIVE'
      | 'DELETE_READY'
      | 'RESTORE'
      | 'PURGE',
  ) => {
    setBusinessActionModal({
      businessId,
      action,
      step: 1,
      reason: '',
      confirmBusinessId: '',
      confirmText: '',
    });
  };

  const executeBusinessActionModal = async () => {
    if (!businessActionModal || !token) {
      return;
    }
    const { businessId, action, reason, confirmBusinessId, confirmText } =
      businessActionModal;
    if (!reason.trim()) {
      setMessage(t('quickActionReasonRequired'));
      return;
    }
    if (action === 'PURGE') {
      if (confirmBusinessId.trim() !== businessId || confirmText.trim() !== 'DELETE') {
        setMessage(t('purgeConfirmMismatch'));
        return;
      }
    }
    const actionKey = `business:modal:${action.toLowerCase()}:${businessId}`;
    await withAction(actionKey, async () => {
      if (action === 'SUSPEND') {
        await updateStatusOverride(businessId, 'SUSPENDED', reason);
      } else if (action === 'READ_ONLY') {
        await updateReadOnlyOverride(businessId, true, reason);
      } else if (action === 'FORCE_LOGOUT') {
        const response = await apiFetch<{ revokedCount: number }>(
          `/platform/businesses/${businessId}/revoke-sessions`,
          {
            token,
            method: 'POST',
            body: JSON.stringify({ reason }),
          },
        );
        setMessage(
          t('forceLogoutSuccess', { value: response.revokedCount ?? 0 }),
        );
      } else if (action === 'ARCHIVE') {
        await updateStatusOverride(businessId, 'ARCHIVED', reason);
      } else if (action === 'DELETE_READY') {
        await updateStatusOverride(businessId, 'DELETED', reason);
      } else if (action === 'RESTORE') {
        await updateStatusOverride(businessId, 'ACTIVE', reason);
      } else if (action === 'PURGE') {
        await apiFetch(`/platform/businesses/${businessId}/purge`, {
          token,
          method: 'POST',
          body: JSON.stringify({
            reason,
            confirmBusinessId,
            confirmText,
          }),
        });
        setMessage(t('purgeSuccess'));
        await loadData();
      }
    });
    setBusinessActionModal(null);
  };

  const getBusinessRiskScore = (business: Business) => {
    let score = 15;
    if (business.underReview) score += 35;
    if (business.status === 'SUSPENDED') score += 35;
    if (business.status === 'GRACE') score += 20;
    if (business.status === 'EXPIRED') score += 30;
    if (business.status === 'ARCHIVED') score += 10;
    if (business.status === 'DELETED') score += 20;
    return Math.min(100, score);
  };

  const businessTrendSeries = useMemo(() => {
    if (!metrics?.series?.length) {
      return [];
    }
    const points = businessTrendRange === '7d' ? 7 : 30;
    return metrics.series.slice(-points);
  }, [businessTrendRange, metrics]);

  const fetchAuditLogs = async (
    event?: React.FormEvent,
    cursor?: string,
    append = false,
  ) => {
    if (event) {
      event.preventDefault();
    }
    if (!token) {
      return;
    }
    if (append) {
      setIsLoadingMoreAudit(true);
    } else {
      setLoadingLogs(true);
    }
    try {
      const query = buildCursorQuery({
        limit: 20,
        cursor,
        businessId: auditBusinessId || undefined,
        outcome: auditOutcome || undefined,
        action: auditAction || undefined,
      });
      const logs = await apiFetch<PaginatedResponse<AuditLog> | AuditLog[]>(
        `/platform/audit-logs${query}`,
        { token },
      );
      const result = normalizePaginated(logs);
      setAuditLogs((prev) =>
        append ? [...prev, ...result.items] : result.items,
      );
      setNextAuditCursor(result.nextCursor);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadAuditLogsFailed')));
    } finally {
      if (append) {
        setIsLoadingMoreAudit(false);
      } else {
        setLoadingLogs(false);
      }
    }
  };

  const fetchPlatformAuditLogs = async (
    event?: React.FormEvent,
    cursor?: string,
    append = false,
  ) => {
    if (event) {
      event.preventDefault();
    }
    if (!token) {
      return;
    }
    try {
      const query = buildCursorQuery({
        limit: 20,
        cursor,
        platformAdminId: platformAdminId || undefined,
      });
      const logs = await apiFetch<
        PaginatedResponse<PlatformAuditLog> | PlatformAuditLog[]
      >(`/platform/platform-audit-logs${query}`, { token });
      const result = normalizePaginated(logs);
      setPlatformAuditLogs((prev) =>
        append ? [...prev, ...result.items] : result.items,
      );
      setNextPlatformAuditCursor(result.nextCursor);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadPlatformAuditFailed')));
    }
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

  const createAnnouncement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }
    const toIsoDateTime = (value: string) => {
      if (!value) {
        return undefined;
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return undefined;
      }
      return parsed.toISOString();
    };
    try {
      setIsCreatingAnnouncement(true);
      await apiFetch('/platform/announcements', {
        token,
        method: 'POST',
        body: JSON.stringify({
          ...announcementForm,
          startsAt: announcementForm.startsAt
            ? toIsoDateTime(announcementForm.startsAt)
            : undefined,
          endsAt: announcementForm.endsAt
            ? toIsoDateTime(announcementForm.endsAt)
            : null,
        }),
      });
      setAnnouncementForm({
        title: '',
        message: '',
        severity: 'INFO',
        startsAt: '',
        endsAt: '',
        reason: '',
        targetBusinessIds: [],
        targetTiers: [],
        targetStatuses: [],
      });
      setAnnouncementBusinessSearch('');
      await loadAnnouncements();
      setMessage(t('announcementCreated'));
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('announcementCreateFailed')));
    } finally {
      setIsCreatingAnnouncement(false);
    }
  };

  const endAnnouncement = async (announcementId: string) => {
    if (!token) {
      return;
    }
    setEndingAnnouncementId(announcementId);
    try {
      await apiFetch(`/platform/announcements/${announcementId}/end`, {
        token,
        method: 'PATCH',
      });
      await loadAnnouncements();
      setMessage(t('announcementEnded'));
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('announcementEndFailed')));
    } finally {
      setEndingAnnouncementId(null);
    }
  };

  const chartData = useMemo(() => {
    if (!metrics) {
      return null;
    }
    const labels = metrics.series.map((point) => point.label);
    return {
      labels,
      datasets: [
        {
          label: t('chartErrorRate'),
          data: metrics.series.map((point) => point.errorRate * 100),
          borderColor: '#d97706',
          backgroundColor: 'rgba(217, 119, 6, 0.3)',
          yAxisID: 'y',
        },
        {
          label: t('chartAvgLatency'),
          data: metrics.series.map((point) => point.avgLatency),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.2)',
          yAxisID: 'y1',
        },
      ],
    };
  }, [metrics]);

  const incidentBusinesses = useMemo(
    () => businesses.filter((business) => business.underReview),
    [businesses],
  );

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

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-10">
      <section className="space-y-1">
        <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
          {t('title')}
        </h2>
        <p className="text-sm text-[color:var(--muted)]">{t('subtitle')}</p>
        {message ? (
          <p className="text-sm text-[color:var(--muted)]">{message}</p>
        ) : null}
      </section>

      {showOverview || showHealth ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-xl font-semibold">{t('metricsTitle')}</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {['24h', '7d', '30d', 'custom'].map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setMetricsRange(range)}
                className={`rounded border px-3 py-1 ${
                  metricsRange === range
                    ? 'border-gold-500 bg-gold-500/20 text-gold-100'
                    : 'border-gold-700/50 text-gold-300'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        {metricsRange === 'custom' ? (
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={metricsFrom}
              onChange={(event) => setMetricsFrom(event.target.value)}
              placeholder={t('metricsFrom')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <input
              value={metricsTo}
              onChange={(event) => setMetricsTo(event.target.value)}
              placeholder={t('metricsTo')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <button
              type="button"
              onClick={() => withAction('metrics:apply', loadMetrics)}
              className="rounded bg-gold-500 px-3 py-2 font-semibold text-black"
            >
              <span className="inline-flex items-center gap-2">
                {actionLoading['metrics:apply'] ? (
                  <Spinner size="xs" variant="ring" />
                ) : null}
                {t('applyRange')}
              </span>
            </button>
          </div>
        ) : null}
        {metrics ? (
          <div className="space-y-4">
            <div className="grid gap-3 text-sm text-gold-200 md:grid-cols-3">
              <div className="rounded border border-gold-700/40 bg-black/40 p-3">
                <p className="text-xs uppercase tracking-[0.25em] text-gold-300">
                  {t('metricsBusinesses')}
                </p>
                <p className="mt-2 text-gold-100">
                  {t('metricsTotal', { value: metrics.totals.businesses })}
                </p>
                <p>{t('metricsActive', { value: metrics.totals.active })}</p>
                <p>{t('metricsGrace', { value: metrics.totals.grace })}</p>
                <p>{t('metricsExpired', { value: metrics.totals.expired })}</p>
                <p>{t('metricsSuspended', { value: metrics.totals.suspended })}</p>
                <p>{t('metricsUnderReview', { value: metrics.totals.underReview })}</p>
              </div>
              <div className="rounded border border-gold-700/40 bg-black/40 p-3">
                <p className="text-xs uppercase tracking-[0.25em] text-gold-300">
                  {t('metricsOfflineExports')}
                </p>
                <p className="mt-2 text-gold-100">
                  {t('metricsOfflineEnabled', {
                    value: metrics.totals.offlineEnabled,
                  })}
                </p>
                <p>{t('metricsOfflineFailures', { value: metrics.offlineFailures })}</p>
                <p>{t('metricsExportsPending', { value: metrics.exports.pending })}</p>
              </div>
              <div className="rounded border border-gold-700/40 bg-black/40 p-3">
                <p className="text-xs uppercase tracking-[0.25em] text-gold-300">
                  {t('metricsApiHealth')}
                </p>
                <p className="mt-2 text-gold-100">
                  {t('metricsErrorRate', {
                    value: (metrics.api.errorRate * 100).toFixed(1),
                  })}
                </p>
                <p>{t('metricsAvgLatency', { value: metrics.api.avgLatency })}</p>
              </div>
            </div>
            {chartData ? (
              <div className="rounded border border-gold-700/40 bg-black/40 p-4">
                <Line
                  data={chartData}
                  options={{
                    responsive: true,
                    scales: {
                      y: { position: 'left', ticks: { color: '#f6e4b5' } },
                      y1: {
                        position: 'right',
                        ticks: { color: '#f6e4b5' },
                        grid: { drawOnChartArea: false },
                      },
                      x: { ticks: { color: '#f6e4b5' } },
                    },
                    plugins: {
                      legend: { labels: { color: '#f6e4b5' } },
                    },
                  }}
                />
              </div>
            ) : null}
            <div className="grid gap-3 text-xs text-gold-300 md:grid-cols-2">
              <div className="rounded border border-gold-700/40 bg-black/40 p-3">
                <p className="text-gold-100">{t('metricsSlowEndpoints')}</p>
                {metrics.api.slowEndpoints.map((endpoint) => (
                  <p key={endpoint.path}>
                    {endpoint.path} • {endpoint.avgDurationMs}ms ({endpoint.count})
                  </p>
                ))}
              </div>
              <div className="rounded border border-gold-700/40 bg-black/40 p-3">
                <p className="text-gold-100">{t('metricsStorageLeaders')}</p>
                {metrics.storage.topBusinesses.map((row) => (
                  <p key={row.businessId}>
                    {row.name} • {row.sizeMb.toFixed(1)}MB
                  </p>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gold-300">{t('metricsUnavailable')}</p>
        )}
        </section>
      ) : null}

      {showOverview ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">{t('activityTitle')}</h3>
          <button
            type="button"
            onClick={() => withAction('activity:refresh', loadActivityFeed)}
            className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
          >
            <span className="inline-flex items-center gap-2">
              {actionLoading['activity:refresh'] ? (
                <Spinner size="xs" variant="bars" />
              ) : null}
              {t('refreshFeed')}
            </span>
          </button>
        </div>
        <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
          {activityFeed.map((log) => (
            <div
              key={log.id}
              className="rounded border border-gold-700/40 bg-black/40 p-3"
            >
              <p className="text-gold-100">
                {log.action} • {log.resourceType}
              </p>
              {log.reason ? <p>{t('reasonLabel', { reason: log.reason })}</p> : null}
              <p>{new Date(log.createdAt).toLocaleString()}</p>
            </div>
          ))}
          {!activityFeed.length ? (
            <p className="text-gold-400">{t('noActivity')}</p>
          ) : null}
        </div>
        </section>
      ) : null}

      {showOverview ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold">{t('securityTitle')}</h3>
            <span className="text-xs text-gold-300">
              {t('securityHint')}
            </span>
          </div>
          <div className="rounded border border-gold-700/40 bg-black/40 px-3 py-2 text-xs text-gold-100">
            <span className="text-gold-300">{t('platformAdminIdLabel')}</span>{' '}
            {platformAdminId || t('platformAdminIdUnknown')}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="relative">
              <input
                value={adminPasswordForm.current}
                onChange={(event) =>
                  setAdminPasswordForm((prev) => ({
                    ...prev,
                    current: event.target.value,
                  }))
                }
                type={adminPasswordVisible.current ? 'text' : 'password'}
                placeholder={t('currentPassword')}
                className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 pr-12 text-gold-100"
              />
              <button
                type="button"
                onClick={() =>
                  setAdminPasswordVisible((prev) => ({
                    ...prev,
                    current: !prev.current,
                  }))
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gold-300"
              >
                {adminPasswordVisible.current
                  ? t('hidePassword')
                  : t('showPassword')}
              </button>
            </div>
            <div className="relative">
              <input
                value={adminPasswordForm.next}
                onChange={(event) =>
                  setAdminPasswordForm((prev) => ({
                    ...prev,
                    next: event.target.value,
                  }))
                }
                type={adminPasswordVisible.next ? 'text' : 'password'}
                placeholder={t('newPassword')}
                className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 pr-12 text-gold-100"
              />
              <button
                type="button"
                onClick={() =>
                  setAdminPasswordVisible((prev) => ({
                    ...prev,
                    next: !prev.next,
                  }))
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gold-300"
              >
                {adminPasswordVisible.next
                  ? t('hidePassword')
                  : t('showPassword')}
              </button>
            </div>
            <div className="relative">
              <input
                value={adminPasswordForm.confirm}
                onChange={(event) =>
                  setAdminPasswordForm((prev) => ({
                    ...prev,
                    confirm: event.target.value,
                  }))
                }
                type={adminPasswordVisible.confirm ? 'text' : 'password'}
                placeholder={t('confirmPassword')}
                className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 pr-12 text-gold-100"
              />
              <button
                type="button"
                onClick={() =>
                  setAdminPasswordVisible((prev) => ({
                    ...prev,
                    confirm: !prev.confirm,
                  }))
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gold-300"
              >
                {adminPasswordVisible.confirm
                  ? t('hidePassword')
                  : t('showPassword')}
              </button>
            </div>
            <p className="text-xs text-gold-400 md:col-span-2">
              {t('passwordRequirements')}
            </p>
            <button
              type="button"
              onClick={updatePlatformPassword}
              disabled={adminPasswordBusy}
              className="rounded bg-gold-500 px-3 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="inline-flex items-center justify-center gap-2">
                {adminPasswordBusy ? <Spinner variant="dots" size="xs" /> : null}
                {adminPasswordBusy ? t('updating') : t('updatePassword')}
              </span>
            </button>
          </div>
        </section>
      ) : null}

      {showHealth ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold">{t('healthTitle')}</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={loadHealthForSelected}
                className="rounded border border-gold-700/60 px-3 py-1 text-gold-100"
                disabled={healthLoading}
              >
                <span className="inline-flex items-center gap-2">
                  {healthLoading ? <Spinner size="xs" variant="pulse" /> : null}
                  {healthLoading ? t('loading') : t('loadSelected')}
                </span>
              </button>
              <button
                type="button"
                onClick={loadHealthForPinned}
                className="rounded border border-gold-700/60 px-3 py-1 text-gold-100"
                disabled={healthLoading}
              >
                <span className="inline-flex items-center gap-2">
                  {healthLoading ? <Spinner size="xs" variant="pulse" /> : null}
                  {t('loadPinned')}
                </span>
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SmartSelect
              value={healthBusinessId}
              onChange={setHealthBusinessId}
              options={businessSelectOptions}
              placeholder={t('selectBusiness')}
            />
          </div>
          <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
            {Object.entries(healthMap).map(([businessId, health]) => {
              const business = businessLookup.get(businessId);
              return (
                <div
                  key={businessId}
                  className="rounded border border-gold-700/40 bg-black/40 p-3"
                >
                  <p className="text-gold-100">
                    {business?.name ?? t('businessLabel')} • {businessId}
                  </p>
                  <p>
                    {t('subscriptionLabel', {
                      status: health.subscriptionStatus,
                      score: health.score,
                    })}
                  </p>
                  <p>
                    {t('healthOfflineFailures', {
                      value: health.offlineFailed,
                      backlog: health.exportsPending,
                    })}
                  </p>
                </div>
              );
            })}
            {!Object.keys(healthMap).length ? (
              <p className="text-gold-400">{t('noHealthChecks')}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {showHealth ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold">{t('deviceFleetTitle')}</h3>
            <button
              type="button"
              onClick={() => {
                if (!deviceFleetBusinessId) {
                  setMessage(t('selectBusinessLoadDevices'));
                  return;
                }
                loadDevices(deviceFleetBusinessId);
              }}
              className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
            >
              {t('loadDevices')}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-[2fr_2fr_auto]">
            <SmartSelect
              value={deviceFleetBusinessId}
              onChange={setDeviceFleetBusinessId}
              options={businessSelectOptions}
              placeholder={t('selectBusiness')}
            />
            <input
              value={deviceRevokeReason}
              onChange={(event) => setDeviceRevokeReason(event.target.value)}
              placeholder={t('revokeReasonPlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <button
              type="button"
              onClick={() => {
                if (!deviceFleetBusinessId) {
                  setMessage(t('selectBusinessLoadDevices'));
                  return;
                }
                withAction(`devices:refresh:${deviceFleetBusinessId}`, () =>
                  loadDevices(deviceFleetBusinessId),
                );
              }}
              className="rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black"
            >
              <span className="inline-flex items-center gap-2">
                {actionLoading[`devices:refresh:${deviceFleetBusinessId}`] ? (
                  <Spinner size="xs" variant="grid" />
                ) : null}
                {t('refresh')}
              </span>
            </button>
          </div>
          <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
            {(devicesMap[deviceFleetBusinessId] ?? []).map((device) => (
              <div
                key={device.id}
                className="rounded border border-gold-700/40 bg-black/40 p-3"
              >
                <p className="text-gold-100">
                  {device.deviceName ?? t('unnamedDevice')} • {device.status}
                </p>
                {device.status !== 'REVOKED' ? (
                  <button
                    type="button"
                    onClick={() =>
                      deviceRevokeReason.trim()
                        ? withAction(`device:revoke:${device.id}`, () =>
                            revokeDevice(
                              device.id,
                              deviceFleetBusinessId,
                              deviceRevokeReason,
                            ),
                          )
                        : setMessage(t('revokeReasonRequired'))
                    }
                    className="mt-2 rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
                  >
                    <span className="inline-flex items-center gap-2">
                      {actionLoading[`device:revoke:${device.id}`] ? (
                        <Spinner size="xs" variant="dots" />
                      ) : null}
                      {t('revokeDevice')}
                    </span>
                  </button>
                ) : null}
              </div>
            ))}
            {loadingDevices[deviceFleetBusinessId] ? (
              <div className="flex items-center gap-2 text-xs text-gold-300">
                <Spinner size="xs" variant="grid" /> {t('loadingDevices')}
              </div>
            ) : null}
            {!loadingDevices[deviceFleetBusinessId] &&
            (devicesMap[deviceFleetBusinessId] ?? []).length === 0 ? (
              <p className="text-gold-400">{t('noDevices')}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {showIncidents ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold">{t('incidentsTitle')}</h3>
            <button
              type="button"
              onClick={() => withAction('businesses:refresh', () => loadBusinesses())}
              className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
            >
              <span className="inline-flex items-center gap-2">
                {actionLoading['businesses:refresh'] ? (
                  <Spinner size="xs" variant="orbit" />
                ) : null}
                {t('refresh')}
              </span>
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_2fr_auto]">
            <SmartSelect
              value={incidentForm.businessId}
              onChange={(value) =>
                setIncidentForm((prev) => ({ ...prev, businessId: value }))
              }
              options={businessSelectOptions}
              placeholder={t('selectBusinessToFlag')}
            />
            <SmartSelect
              value={incidentForm.severity}
              onChange={(value) =>
                setIncidentForm((prev) => ({ ...prev, severity: value }))
              }
              options={incidentSeverityOptions}
              placeholder={t('incidentSeverityPlaceholder')}
            />
            <input
              value={incidentForm.reason}
              onChange={(event) =>
                setIncidentForm((prev) => ({ ...prev, reason: event.target.value }))
              }
              placeholder={t('reviewFlagReasonPlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <button
              type="button"
              onClick={() => {
                if (!incidentForm.businessId || !incidentForm.reason.trim()) {
                  setMessage(t('reviewFlagRequirements'));
                  return;
                }
                updateReview(incidentForm.businessId, {
                  underReview: true,
                  reason: incidentForm.reason,
                  severity: incidentForm.severity,
                }).then(() =>
                  setIncidentForm({ businessId: '', reason: '', severity: 'MEDIUM' }),
                );
              }}
              className="rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black"
            >
              {t('flagForReview')}
            </button>
          </div>
          <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
            {incidentBusinesses.map((business) => (
              <div
                key={business.id}
                className="rounded border border-gold-700/40 bg-black/40 p-3"
              >
                <p className="text-gold-100">
                  {business.name} • {business.id}
                </p>
                <p className="text-gold-400">
                  {t('statusTier', {
                    status: business.status,
                    tier: business.subscription?.tier ?? t('notAvailable'),
                  })}
                </p>
                {business.reviewSeverity ? (
                  <p className="text-gold-400">
                    {t('incidentSeverityLabel', { value: business.reviewSeverity })}
                  </p>
                ) : null}
                <p className="text-amber-200">
                  {t('riskFlagged', {
                    reason: business.reviewReason ?? t('underReview'),
                  })}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={incidentNotes[business.id] ?? ''}
                    onChange={(event) =>
                      setIncidentNotes((prev) => ({
                        ...prev,
                        [business.id]: event.target.value,
                      }))
                    }
                    placeholder={t('actionReasonPlaceholder')}
                    className="rounded border border-gold-700/50 bg-black px-3 py-1 text-xs text-gold-100"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      withAction(`incident:clear:${business.id}`, () =>
                        updateReview(business.id, {
                          underReview: false,
                          reason: incidentNotes[business.id] ?? '',
                        }),
                      )
                    }
                    className="rounded bg-gold-500 px-3 py-1 text-xs font-semibold text-black"
                  >
                    <span className="inline-flex items-center gap-2">
                      {actionLoading[`incident:clear:${business.id}`] ? (
                        <Spinner size="xs" variant="dots" />
                      ) : null}
                      {t('clearFlag')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      withAction(`incident:freeze:${business.id}`, () =>
                        updateStatusOverride(
                          business.id,
                          'SUSPENDED',
                          incidentNotes[business.id],
                        ),
                      )
                    }
                    className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
                  >
                    <span className="inline-flex items-center gap-2">
                      {actionLoading[`incident:freeze:${business.id}`] ? (
                        <Spinner size="xs" variant="bars" />
                      ) : null}
                      {t('freeze')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      withAction(`incident:unfreeze:${business.id}`, () =>
                        updateStatusOverride(
                          business.id,
                          'ACTIVE',
                          incidentNotes[business.id],
                        ),
                      )
                    }
                    className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
                  >
                    <span className="inline-flex items-center gap-2">
                      {actionLoading[`incident:unfreeze:${business.id}`] ? (
                        <Spinner size="xs" variant="orbit" />
                      ) : null}
                      {t('unfreeze')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      withAction(`incident:readonly:${business.id}`, () =>
                        updateReadOnlyOverride(
                          business.id,
                          true,
                          incidentNotes[business.id],
                        ),
                      )
                    }
                    className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
                  >
                    <span className="inline-flex items-center gap-2">
                      {actionLoading[`incident:readonly:${business.id}`] ? (
                        <Spinner size="xs" variant="pulse" />
                      ) : null}
                      {t('readOnly')}
                    </span>
                  </button>
                </div>
              </div>
            ))}
            {!incidentBusinesses.length ? (
              <p className="text-gold-400">{t('noIncidents')}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {showBusinesses ? (
        <section className="command-card p-6 space-y-5 nvi-reveal">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gold-400">
                {showBusinessDetailPage ? 'Business workspace' : 'Business command center'}
              </p>
              <h3 className="text-xl font-semibold text-gold-100">
                {showBusinessDetailPage ? (openedBusiness?.name ?? t('businessRegistryTitle')) : t('businessRegistryTitle')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => withAction('businesses:load', () => loadBusinesses())}
              className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
            >
              <span className="inline-flex items-center gap-2">
                {actionLoading['businesses:load'] ? (
                  <Spinner size="xs" variant="grid" />
                ) : null}
                {t('loadBusinesses')}
              </span>
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="nvi-tile p-3">
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">
                Total
              </p>
              <p className="mt-1 text-2xl font-semibold text-gold-100">{businesses.length}</p>
            </div>
            <div className="nvi-tile p-3">
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">
                Active
              </p>
              <p className="mt-1 text-2xl font-semibold text-gold-100">
                {businesses.filter((business) => business.status === 'ACTIVE').length}
              </p>
            </div>
            <div className="nvi-tile p-3">
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">
                Under review
              </p>
              <p className="mt-1 text-2xl font-semibold text-amber-200">
                {businesses.filter((business) => business.underReview).length}
              </p>
            </div>
            <div className="nvi-tile p-3">
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">
                Archived
              </p>
              <p className="mt-1 text-2xl font-semibold text-gold-100">
                {businesses.filter((business) => business.status === 'ARCHIVED').length}
              </p>
            </div>
            <div className="nvi-tile p-3">
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">
                Deleted-ready
              </p>
              <p className="mt-1 text-2xl font-semibold text-red-200">
                {businesses.filter((business) => business.status === 'DELETED').length}
              </p>
            </div>
            <div className="nvi-tile p-3">
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">
                High risk
              </p>
              <p className="mt-1 text-2xl font-semibold text-amber-200">
                {businesses.filter((business) => getBusinessRiskScore(business) >= 60).length}
              </p>
            </div>
          </div>

          <div
            className={`grid gap-4 ${
              showBusinessDetailPage ? 'grid-cols-1' : 'xl:grid-cols-1'
            }`}
          >
            {!showBusinessDetailPage ? (
              <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
                <TypeaheadInput
                  value={businessSearch}
                  onChange={setBusinessSearch}
                  onSelect={(option) => {
                    setBusinessSearch(option.label);
                    setSelectedBusinessId(option.id);
                  }}
                  options={businessOptions}
                  placeholder={t('searchBusinesses')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                <SmartSelect
                  value={selectedBusinessId}
                  onChange={setSelectedBusinessId}
                  options={businessSelectOptions}
                  placeholder={t('selectBusiness')}
                />
                <button
                  type="button"
                  onClick={() =>
                    withAction('businesses:apply', async () => applySelectedBusiness())
                  }
                  className="rounded bg-gold-500 px-3 py-2 text-xs font-semibold text-black"
                >
                  <span className="inline-flex items-center gap-2">
                    {actionLoading['businesses:apply'] ? (
                      <Spinner size="xs" variant="dots" />
                    ) : null}
                    {t('useSelectedBusiness')}
                  </span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {[
                    { value: 'ACTIVE', label: t('statusActive') },
                    { value: 'UNDER_REVIEW', label: t('underReview') },
                    { value: 'ARCHIVED', label: t('statusArchived') },
                    { value: 'DELETED', label: t('statusDeletedReady') },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setBusinessStatusFilter(
                          option.value as 'ACTIVE' | 'UNDER_REVIEW' | 'ARCHIVED' | 'DELETED',
                        )
                      }
                      className={`rounded border px-3 py-1 text-[10px] uppercase tracking-[0.25em] transition ${
                        businessStatusFilter === option.value
                          ? 'border-gold-500 bg-gold-500/15 text-gold-100'
                          : 'border-gold-800/60 text-gold-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gold-500">
                  Showing {filteredBusinesses.length} of {businesses.length} businesses
                </p>
              </div>

              <div className="overflow-x-auto rounded border border-gold-700/30 bg-black/40">
                <table className="min-w-full text-[13px] text-gold-200">
                  <thead>
                    <tr className="border-b border-gold-700/40 text-left text-xs uppercase tracking-[0.22em] text-gold-400">
                      <th className="px-3 py-2">{t('tableBusiness')}</th>
                      <th className="px-3 py-2">{t('tableStatus')}</th>
                      <th className="px-3 py-2">{t('tableTier')}</th>
                      <th className="px-3 py-2">Risk</th>
                      <th className="px-3 py-2">{t('tableLastActivity')}</th>
                      <th className="px-3 py-2">{t('tableActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBusinesses.map((business) => {
                      const riskScore = getBusinessRiskScore(business);
                      return (
                        <tr
                          key={`${business.id}-row`}
                          className="border-b border-gold-800/40 last:border-0 hover:bg-gold-500/5"
                        >
                          <td className="px-3 py-2">
                            <p className="text-base text-gold-100">{business.name}</p>
                            <p className="text-xs text-gold-500">{business.id}</p>
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded-full border border-gold-700/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-gold-200">
                              {business.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {business.subscription?.tier ?? t('notAvailable')}
                          </td>
                          <td className="px-3 py-2">{riskScore}</td>
                          <td className="px-3 py-2">
                            {business.lastActivityAt
                              ? new Date(business.lastActivityAt).toLocaleDateString()
                              : t('notAvailable')}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1">
                              <Link
                                href={`/${locale}/platform/businesses/${business.id}`}
                                className="rounded border border-gold-700/60 px-2 py-1 text-xs text-gold-200"
                              >
                                {t('open')}
                              </Link>
                              <button
                                type="button"
                                onClick={() => togglePinnedBusiness(business.id)}
                                className="rounded border border-gold-700/60 px-2 py-1 text-xs text-gold-200"
                              >
                                {pinnedBusinessIds.includes(business.id) ? t('pinned') : t('pin')}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  withAction(`review:flag:${business.id}`, async () => {
                                    await updateReview(business.id, {
                                      underReview: true,
                                      reason: 'Flagged from registry command center',
                                      severity: 'MEDIUM',
                                    });
                                  })
                                }
                                className="rounded border border-amber-500/60 px-2 py-1 text-xs text-amber-200"
                              >
                                Mark risk
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredBusinesses.length ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-gold-400">
                          {t('noBusinesses')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {nextBusinessCursor ? (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      withAction('businesses:loadMore', () =>
                        loadBusinesses(nextBusinessCursor, true),
                      )
                    }
                    className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-4 py-2 text-sm text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={isLoadingMoreBusinesses}
                  >
                    {isLoadingMoreBusinesses ? (
                      <Spinner size="xs" variant="grid" />
                    ) : actionLoading['businesses:loadMore'] ? (
                      <Spinner size="xs" variant="grid" />
                    ) : null}
                    {isLoadingMoreBusinesses ? t('loading') : t('loadMoreBusinesses')}
                  </button>
                </div>
              ) : null}
              </div>
            ) : null}

            {showBusinessDetailPage ? (
              <aside className="rounded border border-gold-700/40 bg-black/40 p-4 space-y-4">
              {!openedBusiness ? (
                <p className="text-sm text-gold-400">{t('selectBusinessDetails')}</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-gold-100">
                        {openedBusiness.name}
                      </p>
                      <p className="text-xs text-gold-500">{openedBusiness.id}</p>
                    </div>
                    <Link
                      href={`/${locale}/platform/businesses`}
                      className="rounded border border-gold-700/60 px-2 py-1 text-xs text-gold-100"
                    >
                      Back to registry
                    </Link>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    {[
                      { value: 'SUMMARY', label: 'Summary' },
                      { value: 'SUBSCRIPTION', label: 'Subscription' },
                      { value: 'RISK_STATUS', label: 'Risk & Status' },
                      { value: 'ACCESS', label: 'Access' },
                      { value: 'DEVICES', label: 'Devices' },
                      { value: 'DANGER', label: 'Danger zone' },
                    ].map((tab) => (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() =>
                          setBusinessDrawerTab(
                            tab.value as
                              | 'SUMMARY'
                              | 'SUBSCRIPTION'
                              | 'RISK_STATUS'
                              | 'ACCESS'
                              | 'DEVICES'
                              | 'DANGER',
                          )
                        }
                        className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.2em] transition ${
                          businessDrawerTab === tab.value
                            ? 'border-gold-500 bg-gold-500/15 text-gold-100'
                            : 'border-gold-700/50 text-gold-400'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {businessDrawerTab === 'SUMMARY' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="nvi-tile p-3">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">Status</p>
                          <p className="mt-1 text-sm text-gold-100">{openedBusiness.status}</p>
                        </div>
                        <div className="nvi-tile p-3">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">Tier</p>
                          <p className="mt-1 text-sm text-gold-100">
                            {openedBusiness.subscription?.tier ?? t('notAvailable')}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded border border-gold-700/40 bg-black/30 p-3">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">Health score</p>
                          <div className="mt-2 flex items-center gap-3">
                            <div
                              className="h-14 w-14 rounded-full"
                              style={{
                                background: `conic-gradient(#f59e0b ${
                                  Math.max(0, Math.min(100, healthMap[openedBusiness.id]?.score ?? 0))
                                }%, rgba(245,158,11,0.15) 0)`,
                              }}
                            >
                              <div className="m-[4px] flex h-[48px] w-[48px] items-center justify-center rounded-full bg-black text-xs text-gold-100">
                                {Math.max(0, Math.min(100, healthMap[openedBusiness.id]?.score ?? 0))}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                withAction(`business:health:${openedBusiness.id}`, () =>
                                  loadBusinessHealth(openedBusiness.id),
                                )
                              }
                              className="rounded border border-gold-700/60 px-2 py-1 text-xs text-gold-100"
                            >
                              {t('loadHealth')}
                            </button>
                          </div>
                        </div>
                        <div className="rounded border border-gold-700/40 bg-black/30 p-3">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">Risk score</p>
                          <div className="mt-2 flex items-center gap-3">
                            <div
                              className="h-14 w-14 rounded-full"
                              style={{
                                background: `conic-gradient(#f97316 ${getBusinessRiskScore(
                                  openedBusiness,
                                )}%, rgba(249,115,22,0.15) 0)`,
                              }}
                            >
                              <div className="m-[4px] flex h-[48px] w-[48px] items-center justify-center rounded-full bg-black text-xs text-gold-100">
                                {getBusinessRiskScore(openedBusiness)}
                              </div>
                            </div>
                            <p className="text-xs text-gold-300">
                              {openedBusiness.underReview ? 'Flagged for review' : 'No current risk flag'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="rounded border border-gold-700/40 bg-black/30 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
                          Operational composition
                        </p>
                        <div className="mt-2 max-w-[260px]">
                          <Doughnut
                            data={{
                              labels: ['Branches', 'Users', 'Offline devices'],
                              datasets: [
                                {
                                  data: [
                                    openedBusiness.counts?.branches ?? 0,
                                    openedBusiness.counts?.users ?? 0,
                                    openedBusiness.counts?.offlineDevices ?? 0,
                                  ],
                                  backgroundColor: ['#f59e0b', '#f97316', '#78350f'],
                                  borderColor: ['#f59e0b', '#f97316', '#78350f'],
                                },
                              ],
                            }}
                            options={{
                              plugins: { legend: { labels: { color: '#fcd34d' } } },
                            }}
                          />
                        </div>
                      </div>
                      <div className="rounded border border-gold-700/40 bg-black/30 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">Activity trend</p>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setBusinessTrendRange('7d')}
                              className={`rounded border px-2 py-0.5 text-[10px] ${
                                businessTrendRange === '7d'
                                  ? 'border-gold-500 text-gold-100'
                                  : 'border-gold-700/50 text-gold-400'
                              }`}
                            >
                              7d
                            </button>
                            <button
                              type="button"
                              onClick={() => setBusinessTrendRange('30d')}
                              className={`rounded border px-2 py-0.5 text-[10px] ${
                                businessTrendRange === '30d'
                                  ? 'border-gold-500 text-gold-100'
                                  : 'border-gold-700/50 text-gold-400'
                              }`}
                            >
                              30d
                            </button>
                          </div>
                        </div>
                        {businessTrendSeries.length ? (
                          <Line
                            data={{
                              labels: businessTrendSeries.map((point) => point.label),
                              datasets: [
                                {
                                  label: 'Offline failures',
                                  data: businessTrendSeries.map((point) => point.offlineFailed),
                                  borderColor: '#f97316',
                                  backgroundColor: 'rgba(249, 115, 22, 0.25)',
                                  fill: true,
                                  tension: 0.3,
                                },
                                {
                                  label: 'Pending exports',
                                  data: businessTrendSeries.map((point) => point.exportsPending),
                                  borderColor: '#f59e0b',
                                  backgroundColor: 'rgba(245, 158, 11, 0.2)',
                                  tension: 0.3,
                                },
                              ],
                            }}
                            options={{
                              plugins: { legend: { labels: { color: '#facc15' } } },
                              scales: {
                                x: { ticks: { color: '#fcd34d' }, grid: { color: 'rgba(234,179,8,0.1)' } },
                                y: { ticks: { color: '#fcd34d' }, grid: { color: 'rgba(234,179,8,0.1)' } },
                              },
                            }}
                          />
                        ) : (
                          <p className="text-xs text-gold-500">No trend data available for this period.</p>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {businessDrawerTab === 'SUBSCRIPTION' ? (
                    <div className="space-y-3">
                      <div className="grid gap-2 text-xs text-gold-300 md:grid-cols-2">
                        <div>
                          <p className="uppercase tracking-[0.2em] text-gold-500">{t('trialEndsLabel')}</p>
                          <p>{formatDateLabel(openedBusiness.subscription?.trialEndsAt)}</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-[0.2em] text-gold-500">{t('graceEndsLabel')}</p>
                          <p>{formatDateLabel(openedBusiness.subscription?.graceEndsAt)}</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-[0.2em] text-gold-500">{t('expiresAtLabel')}</p>
                          <p>{formatDateLabel(openedBusiness.subscription?.expiresAt)}</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-[0.2em] text-gold-500">{t('daysRemainingLabel')}</p>
                          <p>
                            {(() => {
                              const endDate =
                                openedBusiness.subscription?.expiresAt ??
                                openedBusiness.subscription?.graceEndsAt ??
                                openedBusiness.subscription?.trialEndsAt ??
                                null;
                              const daysRemaining = getDaysRemaining(endDate);
                              return daysRemaining !== null
                                ? t('daysRemainingValue', { value: daysRemaining })
                                : t('notAvailable');
                            })()}
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <SmartSelect
                          value={subscriptionEdits[openedBusiness.id]?.tier ?? 'BUSINESS'}
                          onChange={(value) =>
                            setSubscriptionEdits((prev) => ({
                              ...prev,
                              [openedBusiness.id]: {
                                ...(prev[openedBusiness.id] ?? {
                                  tier: 'BUSINESS',
                                  status: 'TRIAL',
                                  reason: '',
                                  trialEndsAt: '',
                                  graceEndsAt: '',
                                  expiresAt: '',
                                  durationDays: '',
                                }),
                                tier: value,
                              },
                            }))
                          }
                          options={[
                            { value: 'STARTER', label: t('tierStarter') },
                            { value: 'BUSINESS', label: t('tierBusiness') },
                            { value: 'ENTERPRISE', label: t('tierEnterprise') },
                          ]}
                        />
                        <SmartSelect
                          value={subscriptionEdits[openedBusiness.id]?.status ?? 'TRIAL'}
                          onChange={(value) =>
                            setSubscriptionEdits((prev) => ({
                              ...prev,
                              [openedBusiness.id]: {
                                ...(prev[openedBusiness.id] ?? {
                                  tier: 'BUSINESS',
                                  status: 'TRIAL',
                                  reason: '',
                                  trialEndsAt: '',
                                  graceEndsAt: '',
                                  expiresAt: '',
                                  durationDays: '',
                                }),
                                status: value,
                              },
                            }))
                          }
                          options={[
                            { value: 'TRIAL', label: t('statusTrial') },
                            { value: 'ACTIVE', label: t('statusActive') },
                            { value: 'GRACE', label: t('statusGrace') },
                            { value: 'EXPIRED', label: t('statusExpired') },
                            { value: 'SUSPENDED', label: t('statusSuspended') },
                          ]}
                        />
                        <input
                          value={subscriptionEdits[openedBusiness.id]?.reason ?? ''}
                          onChange={(event) =>
                            setSubscriptionEdits((prev) => ({
                              ...prev,
                              [openedBusiness.id]: {
                                ...(prev[openedBusiness.id] ?? {
                                  tier: 'BUSINESS',
                                  status: 'TRIAL',
                                  reason: '',
                                  trialEndsAt: '',
                                  graceEndsAt: '',
                                  expiresAt: '',
                                  durationDays: '',
                                }),
                                reason: event.target.value,
                              },
                            }))
                          }
                          placeholder={t('subscriptionReasonPlaceholder')}
                          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              withAction(`subscription:update:${openedBusiness.id}`, () =>
                                updateSubscription(openedBusiness.id),
                              )
                            }
                            className="flex-1 rounded bg-gold-500 px-3 py-2 text-xs font-semibold text-black"
                          >
                            {t('updateSubscription')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              withAction(`subscription:reset:${openedBusiness.id}`, () =>
                                resetSubscriptionLimits(openedBusiness.id),
                              )
                            }
                            className="rounded border border-gold-700/60 px-3 py-2 text-xs text-gold-100"
                          >
                            {t('resetSubscriptionLimits')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {businessDrawerTab === 'RISK_STATUS' ? (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <SmartSelect
                          value={statusEdits[openedBusiness.id]?.status ?? openedBusiness.status}
                          onChange={(value) =>
                            setStatusEdits((prev) => ({
                              ...prev,
                              [openedBusiness.id]: {
                                ...(prev[openedBusiness.id] ?? {
                                  status: openedBusiness.status,
                                  reason: '',
                                }),
                                status: value,
                              },
                            }))
                          }
                          options={[
                            { value: 'ACTIVE', label: t('statusActive') },
                            { value: 'GRACE', label: t('statusGrace') },
                            { value: 'EXPIRED', label: t('statusExpired') },
                            { value: 'SUSPENDED', label: t('statusSuspended') },
                            { value: 'ARCHIVED', label: t('statusArchived') },
                            { value: 'DELETED', label: t('statusDeleted') },
                          ]}
                        />
                        <input
                          value={statusEdits[openedBusiness.id]?.reason ?? ''}
                          onChange={(event) =>
                            setStatusEdits((prev) => ({
                              ...prev,
                              [openedBusiness.id]: {
                                ...(prev[openedBusiness.id] ?? {
                                  status: openedBusiness.status,
                                  reason: '',
                                }),
                                reason: event.target.value,
                              },
                            }))
                          }
                          placeholder={t('statusReasonPlaceholder')}
                          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                        />
                        <div className="flex items-center gap-2 text-xs text-gold-300">
                          <input
                            type="checkbox"
                            checked={reviewEdits[openedBusiness.id]?.underReview ?? false}
                            onChange={(event) =>
                              setReviewEdits((prev) => ({
                                ...prev,
                                [openedBusiness.id]: {
                                  ...(prev[openedBusiness.id] ?? {
                                    underReview: false,
                                    reason: '',
                                    severity: 'MEDIUM',
                                  }),
                                  underReview: event.target.checked,
                                },
                              }))
                            }
                          />
                          {t('underReview')}
                        </div>
                        <SmartSelect
                          value={reviewEdits[openedBusiness.id]?.severity ?? 'MEDIUM'}
                          onChange={(value) =>
                            setReviewEdits((prev) => ({
                              ...prev,
                              [openedBusiness.id]: {
                                ...(prev[openedBusiness.id] ?? {
                                  underReview: false,
                                  reason: '',
                                  severity: 'MEDIUM',
                                }),
                                severity: value,
                              },
                            }))
                          }
                          options={incidentSeverityOptions}
                        />
                        <input
                          value={reviewEdits[openedBusiness.id]?.reason ?? ''}
                          onChange={(event) =>
                            setReviewEdits((prev) => ({
                              ...prev,
                              [openedBusiness.id]: {
                                ...(prev[openedBusiness.id] ?? {
                                  underReview: false,
                                  reason: '',
                                  severity: 'MEDIUM',
                                }),
                                reason: event.target.value,
                              },
                            }))
                          }
                          placeholder={t('reviewReasonPlaceholder')}
                          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 md:col-span-2"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            withAction(`status:update:${openedBusiness.id}`, () =>
                              updateStatus(openedBusiness.id),
                            )
                          }
                          className="rounded bg-gold-500 px-3 py-2 text-xs font-semibold text-black"
                        >
                          {t('updateStatus')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            withAction(`review:update:${openedBusiness.id}`, () =>
                              updateReview(openedBusiness.id),
                            )
                          }
                          className="rounded border border-gold-700/60 px-3 py-2 text-xs text-gold-100"
                        >
                          {t('saveReviewFlag')}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {businessDrawerTab === 'ACCESS' ? (
                    <div className="space-y-3">
                      <textarea
                        value={supportNotes[openedBusiness.id] ?? ''}
                        onChange={(event) =>
                          setSupportNotes((prev) => ({
                            ...prev,
                            [openedBusiness.id]: event.target.value,
                          }))
                        }
                        placeholder={t('supportNotesPlaceholder')}
                        className="min-h-[100px] w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                      />
                      <div className="grid gap-2 md:grid-cols-2">
                        <label className="flex items-center gap-2 text-xs text-gold-300">
                          <input
                            type="checkbox"
                            checked={readOnlyEdits[openedBusiness.id]?.enabled ?? false}
                            onChange={(event) =>
                              setReadOnlyEdits((prev) => ({
                                ...prev,
                                [openedBusiness.id]: {
                                  ...(prev[openedBusiness.id] ?? {
                                    enabled: false,
                                    reason: '',
                                  }),
                                  enabled: event.target.checked,
                                },
                              }))
                            }
                          />
                          {t('enableReadOnly')}
                        </label>
                        <input
                          value={readOnlyEdits[openedBusiness.id]?.reason ?? ''}
                          onChange={(event) =>
                            setReadOnlyEdits((prev) => ({
                              ...prev,
                              [openedBusiness.id]: {
                                ...(prev[openedBusiness.id] ?? {
                                  enabled: false,
                                  reason: '',
                                }),
                                reason: event.target.value,
                              },
                            }))
                          }
                          placeholder={t('readOnlyReasonPlaceholder')}
                          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            withAction(`readonly:update:${openedBusiness.id}`, () =>
                              updateReadOnly(openedBusiness.id),
                            )
                          }
                          className="rounded border border-gold-700/60 px-3 py-2 text-xs text-gold-100"
                        >
                          {t('applyReadOnly')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            openBusinessActionModal(openedBusiness.id, 'FORCE_LOGOUT')
                          }
                          className="rounded border border-gold-700/60 px-3 py-2 text-xs text-gold-100"
                        >
                          {t('forceLogout')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            withAction(`business:export:${openedBusiness.id}`, () =>
                              exportOnExit(openedBusiness.id),
                            )
                          }
                          className="rounded border border-gold-700/60 px-3 py-2 text-xs text-gold-100"
                        >
                          {t('exportOnExit')}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {businessDrawerTab === 'DEVICES' ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          value={deviceRevokeReason}
                          onChange={(event) => setDeviceRevokeReason(event.target.value)}
                          placeholder={t('actionReasonPlaceholder')}
                          className="flex-1 rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            withAction(`business:devices:${openedBusiness.id}`, () =>
                              loadDevices(openedBusiness.id),
                            )
                          }
                          className="rounded border border-gold-700/60 px-3 py-2 text-xs text-gold-100"
                        >
                          {t('loadDevices')}
                        </button>
                      </div>
                      {(devicesMap[openedBusiness.id] ?? []).length ? (
                        <div className="space-y-2">
                          {(devicesMap[openedBusiness.id] ?? []).map((device) => (
                            <div
                              key={device.id}
                              className="flex items-center justify-between rounded border border-gold-700/40 bg-black/30 px-3 py-2 text-xs"
                            >
                              <span className="text-gold-200">
                                {device.deviceName ?? t('unnamedDeviceShort')} - {device.status}
                              </span>
                              {device.status !== 'REVOKED' ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    withAction(`business:device:${device.id}`, () =>
                                      revokeDevice(
                                        device.id,
                                        openedBusiness.id,
                                        deviceRevokeReason,
                                      ),
                                    )
                                  }
                                  className="rounded border border-gold-700/60 px-2 py-1 text-xs text-gold-100"
                                >
                                  {t('revoke')}
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : loadingDevices[openedBusiness.id] ? (
                        <div className="flex items-center gap-2 text-xs text-gold-300">
                          <Spinner size="xs" variant="grid" /> {t('loadingDevices')}
                        </div>
                      ) : (
                        <p className="text-xs text-gold-500">No devices loaded yet.</p>
                      )}
                    </div>
                  ) : null}

                  {businessDrawerTab === 'DANGER' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-gold-400">
                        Sensitive actions are guarded with a 3-step confirmation.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openBusinessActionModal(openedBusiness.id, 'SUSPEND')}
                          className="rounded border border-amber-500/60 px-3 py-2 text-xs text-amber-200"
                        >
                          {t('suspend')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openBusinessActionModal(openedBusiness.id, 'ARCHIVE')}
                          className="rounded border border-red-500/60 px-3 py-2 text-xs text-red-200"
                        >
                          {t('archive')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            openBusinessActionModal(openedBusiness.id, 'DELETE_READY')
                          }
                          className="rounded border border-red-500/60 px-3 py-2 text-xs text-red-200"
                        >
                          Mark delete-ready
                        </button>
                        <button
                          type="button"
                          onClick={() => openBusinessActionModal(openedBusiness.id, 'RESTORE')}
                          className="rounded border border-gold-700/60 px-3 py-2 text-xs text-gold-100"
                        >
                          {t('restore')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openBusinessActionModal(openedBusiness.id, 'PURGE')}
                          className="rounded border border-red-500/60 px-3 py-2 text-xs text-red-200"
                        >
                          {t('purge')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </aside>
            ) : null}
          </div>

          {businessActionModal ? (
            <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 p-4">
              <div className="w-full max-w-lg rounded border border-gold-700/60 bg-[#080b10] p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-gold-100">
                    Action guard: {businessActionModal.action}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setBusinessActionModal(null)}
                    className="rounded border border-gold-700/60 px-2 py-1 text-xs text-gold-100"
                  >
                    Close
                  </button>
                </div>

                {businessActionModal.step === 1 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gold-300">
                      Review impact before continuing. This action is audited and may affect access, billing, or data retention.
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-gold-400">
                      <li>Business: {businessActionModal.businessId}</li>
                      <li>Action: {businessActionModal.action}</li>
                      <li>Immediate effect will be visible to business users.</li>
                    </ul>
                  </div>
                ) : null}

                {businessActionModal.step >= 2 ? (
                  <div className="space-y-3">
                    <label className="block text-xs uppercase tracking-[0.2em] text-gold-400">
                      Reason (required)
                    </label>
                    <textarea
                      value={businessActionModal.reason}
                      onChange={(event) =>
                        setBusinessActionModal((prev) =>
                          prev ? { ...prev, reason: event.target.value } : prev,
                        )
                      }
                      className="min-h-[90px] w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                      placeholder={t('actionReasonPlaceholder')}
                    />
                  </div>
                ) : null}

                {businessActionModal.step === 3 && businessActionModal.action === 'PURGE' ? (
                  <div className="mt-3 grid gap-2">
                    <input
                      value={businessActionModal.confirmBusinessId}
                      onChange={(event) =>
                        setBusinessActionModal((prev) =>
                          prev ? { ...prev, confirmBusinessId: event.target.value } : prev,
                        )
                      }
                      placeholder={t('purgeBusinessIdPlaceholder')}
                      className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                    />
                    <input
                      value={businessActionModal.confirmText}
                      onChange={(event) =>
                        setBusinessActionModal((prev) =>
                          prev ? { ...prev, confirmText: event.target.value } : prev,
                        )
                      }
                      placeholder={t('purgeConfirmPlaceholder')}
                      className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                    />
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      setBusinessActionModal((prev) =>
                        prev
                          ? { ...prev, step: (Math.max(1, prev.step - 1) as 1 | 2 | 3) }
                          : prev,
                      )
                    }
                    disabled={businessActionModal.step === 1}
                    className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100 disabled:opacity-50"
                  >
                    Back
                  </button>
                  {businessActionModal.step < 3 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setBusinessActionModal((prev) =>
                          prev
                            ? { ...prev, step: (Math.min(3, prev.step + 1) as 1 | 2 | 3) }
                            : prev,
                        )
                      }
                      className="rounded bg-gold-500 px-3 py-1 text-xs font-semibold text-black"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={executeBusinessActionModal}
                      className="rounded border border-red-500/60 px-3 py-1 text-xs text-red-200"
                    >
                      Confirm {businessActionModal.action}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {showBusinesses && !showBusinessDetailPage ? (
        <section className="command-card p-6 space-y-5 nvi-reveal">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gold-400">
                Business onboarding
              </p>
              <h3 className="text-xl font-semibold text-gold-100">{t('provisionTitle')}</h3>
              <p className="text-xs text-gold-400">
                Create a new tenant with clear ownership and subscription tier.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="nvi-tile p-2 text-center">
                <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">Starter</p>
                <p className="mt-1 text-sm text-gold-100">
                  {businesses.filter((business) => business.subscription?.tier === 'STARTER').length}
                </p>
              </div>
              <div className="nvi-tile p-2 text-center">
                <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">Business</p>
                <p className="mt-1 text-sm text-gold-100">
                  {businesses.filter((business) => business.subscription?.tier === 'BUSINESS').length}
                </p>
              </div>
              <div className="nvi-tile p-2 text-center">
                <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">Enterprise</p>
                <p className="mt-1 text-sm text-gold-100">
                  {businesses.filter((business) => business.subscription?.tier === 'ENTERPRISE').length}
                </p>
              </div>
            </div>
          </div>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={createBusiness}>
            <input
              value={createForm.businessName}
              onChange={(event) =>
                setCreateForm({ ...createForm, businessName: event.target.value })
              }
              placeholder={t('businessNamePlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <input
              value={createForm.ownerName}
              onChange={(event) =>
                setCreateForm({ ...createForm, ownerName: event.target.value })
              }
              placeholder={t('ownerNamePlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <input
              value={createForm.ownerEmail}
              onChange={(event) =>
                setCreateForm({ ...createForm, ownerEmail: event.target.value })
              }
              placeholder={t('ownerEmailPlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <input
              value={createForm.ownerTempPassword}
              onChange={(event) =>
                setCreateForm({
                  ...createForm,
                  ownerTempPassword: event.target.value,
                })
              }
              placeholder={t('tempPasswordPlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <SmartSelect
              value={createForm.tier}
              onChange={(value) =>
                setCreateForm({ ...createForm, tier: value })
              }
              options={[
                { value: 'STARTER', label: t('tierStarter') },
                { value: 'BUSINESS', label: t('tierBusiness') },
                { value: 'ENTERPRISE', label: t('tierEnterprise') },
              ]}
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
              disabled={creatingBusiness}
            >
              {creatingBusiness ? <Spinner size="xs" variant="orbit" /> : null}
              {creatingBusiness ? t('creating') : t('createBusiness')}
            </button>
          </form>
        </section>
      ) : null}

      {showSupport ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
        <h3 className="text-xl font-semibold">{t('supportAccessTitle')}</h3>
        <form className="space-y-3" onSubmit={requestSupport}>
          <div className="grid gap-3 md:grid-cols-3">
            <SmartSelect
              value={supportForm.businessId}
              onChange={(value) =>
                setSupportForm({ ...supportForm, businessId: value })
              }
              options={businessSelectOptions}
              placeholder={t('selectBusiness')}
            />
            <input
              value={supportForm.reason}
              onChange={(event) =>
                setSupportForm({ ...supportForm, reason: event.target.value })
              }
              placeholder={t('reasonPlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <input
              value={supportForm.durationHours}
              onChange={(event) =>
                setSupportForm({ ...supportForm, durationHours: event.target.value })
              }
              placeholder={t('supportDurationPlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
          </div>
          <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
            <span className="text-gold-400">{t('supportScopeLabel')}</span>
            <div className="flex flex-wrap gap-3">
              {supportScopeOptions.map((option) => (
                <label key={option.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={supportForm.scope.includes(option.value)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...supportForm.scope, option.value]
                        : supportForm.scope.filter((value) => value !== option.value);
                      setSupportForm({ ...supportForm, scope: next });
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-gold-500">
              {t('supportScopeHint')}
            </p>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={requestingSupport}
          >
            {requestingSupport ? <Spinner size="xs" variant="orbit" /> : null}
            {requestingSupport ? t('requesting') : t('createSupportRequest')}
          </button>
        </form>
        <div className="space-y-2">
          {supportRequests.map((request) => (
            <div
              key={request.id}
              className="rounded border border-gold-700/40 bg-black/40 p-3 text-xs text-gold-300"
            >
              <p className="text-gold-100">
                {request.businessId} • {request.status}
              </p>
              <p>{request.reason}</p>
              <p className="text-[11px] text-gold-400">
                {t('supportScopeSummary', {
                  value: request.scope?.length
                    ? request.scope.join(', ')
                    : t('supportScopeAll'),
                })}
              </p>
              {request.durationHours ? (
                <p className="text-[11px] text-gold-400">
                  {t('supportDurationSummary', { value: request.durationHours })}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => activateSupport(request.id)}
                className="mt-2 inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:opacity-70"
                disabled={activatingSupportId === request.id}
              >
                {activatingSupportId === request.id ? (
                  <Spinner size="xs" variant="grid" />
                ) : null}
                {t('activate')}
              </button>
            </div>
          ))}
          {nextSupportCursor ? (
            <button
              type="button"
              onClick={() => loadSupportRequests(nextSupportCursor, true)}
              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:opacity-70"
              disabled={isLoadingMoreSupport}
            >
              {isLoadingMoreSupport ? <Spinner size="xs" variant="grid" /> : null}
              {t('loadMore')}
            </button>
          ) : null}
        </div>
        </section>
      ) : null}

      {showSupport ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
        <h3 className="text-xl font-semibold">{t('subscriptionRequestsTitle')}</h3>
        <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
          {subscriptionRequests.map((request) => (
            <div
              key={request.id}
              className="rounded border border-gold-700/40 bg-black/40 p-3"
            >
              <p className="text-gold-100">
                {request.businessId} • {request.type}
                {request.requestedTier ? ` (${request.requestedTier})` : ''}
              </p>
              <p>{t('statusLabel', { status: request.status })}</p>
              {request.reason ? (
                <p>{t('reasonLabel', { reason: request.reason })}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={subscriptionResponseNotes[request.id] ?? ''}
                  onChange={(event) =>
                    setSubscriptionResponseNotes((prev) => ({
                      ...prev,
                      [request.id]: event.target.value,
                    }))
                  }
                  placeholder={t('responseNotePlaceholder')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-1 text-xs text-gold-100"
                />
                <button
                  type="button"
                  onClick={() =>
                    withAction(`subscription:approve:${request.id}`, () =>
                      updateSubscriptionRequest(request.id, 'approve'),
                    )
                  }
                  className="rounded bg-gold-500 px-3 py-1 text-xs font-semibold text-black"
                >
                  <span className="inline-flex items-center gap-2">
                    {actionLoading[`subscription:approve:${request.id}`] ? (
                      <Spinner size="xs" variant="dots" />
                    ) : null}
                    {actions('approve')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    withAction(`subscription:reject:${request.id}`, () =>
                      updateSubscriptionRequest(request.id, 'reject'),
                    )
                  }
                  className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
                >
                  <span className="inline-flex items-center gap-2">
                    {actionLoading[`subscription:reject:${request.id}`] ? (
                      <Spinner size="xs" variant="bars" />
                    ) : null}
                    {actions('reject')}
                  </span>
                </button>
              </div>
            </div>
          ))}
          {!subscriptionRequests.length ? (
            <p className="text-gold-400">{t('noSubscriptionRequests')}</p>
          ) : null}
        </div>
        </section>
      ) : null}

      {showBusinesses && !showBusinessDetailPage ? (
        <section className="command-card p-6 space-y-5 nvi-reveal">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-400">
              Subscription intelligence
            </p>
            <h3 className="text-xl font-semibold text-gold-100">{t('subscriptionHistoryTitle')}</h3>
          </div>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <SmartSelect
                  value={historyBusinessId}
                  onChange={setHistoryBusinessId}
                  options={businessSelectOptions}
                  placeholder={t('selectBusiness')}
                />
                <input
                  value={historyBusinessId}
                  onChange={(event) => setHistoryBusinessId(event.target.value)}
                  placeholder="Or paste business ID (supports purged lookups)"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                <button
                  type="button"
                  onClick={() =>
                    withAction('subscription:history', loadSubscriptionHistory)
                  }
                  className="rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black"
                >
                  <span className="inline-flex items-center gap-2">
                    {loadingHistory ? <Spinner size="xs" variant="ring" /> : null}
                    {loadingHistory ? t('loading') : t('loadHistory')}
                  </span>
                </button>
              </div>
              <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
                {subscriptionHistory.map((entry, index) => (
                  <div
                    key={`${entry.createdAt}-${index}`}
                    className="rounded border border-gold-700/40 bg-black/40 p-3"
                  >
                    <p className="text-gold-100">
                      {entry.previousStatus ?? t('notAvailable')} →{' '}
                      {entry.newStatus ?? t('notAvailable')} •{' '}
                      {entry.previousTier ?? t('notAvailable')} →{' '}
                      {entry.newTier ?? t('notAvailable')}
                    </p>
                    <p>{new Date(entry.createdAt).toLocaleString()}</p>
                    {entry.changedByPlatformAdminId ? (
                      <p>
                        {t('adminLabel', { admin: entry.changedByPlatformAdminId })}
                      </p>
                    ) : null}
                    {entry.reason ? (
                      <p>{t('reasonLabel', { reason: entry.reason })}</p>
                    ) : null}
                  </div>
                ))}
                {!subscriptionHistory.length ? (
                  <p className="text-gold-400">{t('noHistory')}</p>
                ) : null}
              </div>
            </div>
            <div className="rounded border border-gold-700/40 bg-black/30 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-gold-500">Change mix</p>
              <p className="mt-1 text-xs text-gold-400">
                This chart explains what kind of subscription edits happened in the loaded history.
              </p>
              <div className="mt-3">
                <Doughnut
                  data={{
                    labels: ['Status changes', 'Tier changes', 'Other'],
                    datasets: [
                      {
                        data: [
                          subscriptionHistoryStats.statusChanges,
                          subscriptionHistoryStats.tierChanges,
                          subscriptionHistoryStats.unchanged,
                        ],
                        backgroundColor: ['#f59e0b', '#f97316', '#78350f'],
                        borderColor: ['#f59e0b', '#f97316', '#78350f'],
                      },
                    ],
                  }}
                  options={{
                    plugins: { legend: { labels: { color: '#fcd34d' } } },
                  }}
                />
              </div>
              <div className="mt-3 space-y-1 text-xs text-gold-300">
                <p>
                  Status changes: {subscriptionHistoryStats.statusChanges} (
                  {subscriptionHistoryStats.statusPct}%)
                </p>
                <p>
                  Tier changes: {subscriptionHistoryStats.tierChanges} (
                  {subscriptionHistoryStats.tierPct}%)
                </p>
                <p>
                  Other/no-diff events: {subscriptionHistoryStats.unchanged} (
                  {subscriptionHistoryStats.unchangedPct}%)
                </p>
                <p className="text-gold-500">
                  Total events analyzed: {subscriptionHistory.length}
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {showExports ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold">{t('exportQueueTitle')}</h3>
            <button
              type="button"
              onClick={() =>
                withAction('exports:refresh', () => loadExportJobs())
              }
              className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
              disabled={isLoadingExports}
            >
              <span className="inline-flex items-center gap-2">
                {isLoadingExports ? <Spinner size="xs" variant="orbit" /> : null}
                {isLoadingExports ? t('loading') : t('refresh')}
              </span>
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
            <SmartSelect
              value={exportFilters.businessId}
              onChange={(value) =>
                setExportFilters((prev) => ({ ...prev, businessId: value }))
              }
              options={businessSelectOptions}
              placeholder={t('filterByBusiness')}
            />
            <SmartSelect
              value={exportFilters.status}
              onChange={(value) =>
                setExportFilters((prev) => ({ ...prev, status: value }))
              }
              options={[
                { value: '', label: t('allStatuses') },
                { value: 'PENDING', label: t('statusPending') },
                { value: 'RUNNING', label: t('statusRunning') },
                { value: 'COMPLETED', label: t('statusCompleted') },
                { value: 'FAILED', label: t('statusFailed') },
              ]}
            />
            <SmartSelect
              value={exportFilters.type}
              onChange={(value) =>
                setExportFilters((prev) => ({ ...prev, type: value }))
              }
              options={[
                { value: '', label: t('allTypes') },
                { value: 'STOCK', label: t('exportTypeStock') },
                { value: 'PRODUCTS', label: t('exportTypeProducts') },
                { value: 'OPENING_STOCK', label: t('exportTypeOpeningStock') },
                { value: 'PRICE_UPDATES', label: t('exportTypePriceUpdates') },
                { value: 'SUPPLIERS', label: t('exportTypeSuppliers') },
                { value: 'BRANCHES', label: t('exportTypeBranches') },
                { value: 'USERS', label: t('exportTypeUsers') },
                { value: 'AUDIT_LOGS', label: t('exportTypeAuditLogs') },
                { value: 'CUSTOMER_REPORTS', label: t('exportTypeCustomerReports') },
                { value: 'EXPORT_ON_EXIT', label: t('exportTypeExit') },
              ]}
            />
            <button
              type="button"
              onClick={() =>
                withAction('exports:apply', () => loadExportJobs())
              }
              className="rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black"
            >
              <span className="inline-flex items-center gap-2">
                {actionLoading['exports:apply'] ? (
                  <Spinner size="xs" variant="ring" />
                ) : null}
                {t('applyFilters')}
              </span>
            </button>
          </div>
          <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
            {exportJobs.map((job) => (
              <div
                key={job.id}
                className="rounded border border-gold-700/40 bg-black/40 p-3"
              >
                <p className="text-gold-100">
                  {job.business?.name ?? t('businessLabel')} • {job.businessId}
                </p>
                <p>
                  {t('exportJobSummary', {
                    type: job.type,
                    status: job.status,
                    attempts: job.attempts,
                  })}
                </p>
                <p>
                  {t('exportCreated', {
                    value: new Date(job.createdAt).toLocaleString(),
                  })}
                  {job.startedAt
                    ? ` • ${t('exportStarted', {
                        value: new Date(job.startedAt).toLocaleString(),
                      })}`
                    : ''}
                  {job.completedAt
                    ? ` • ${t('exportCompleted', {
                        value: new Date(job.completedAt).toLocaleString(),
                      })}`
                    : ''}
                  {job.deliveredAt
                    ? ` • ${t('exportDelivered', {
                        value: new Date(job.deliveredAt).toLocaleString(),
                      })}`
                    : ''}
                </p>
                {job.metadata?.reason ? (
                  <p>{t('reasonLabel', { reason: job.metadata.reason })}</p>
                ) : null}
                {job.lastError ? (
                  <p className="text-amber-200">
                    {t('lastErrorLabel', { error: job.lastError })}
                  </p>
                ) : null}
              </div>
            ))}
            {!exportJobs.length ? (
              <p className="text-gold-400">{t('noExportJobs')}</p>
            ) : null}
            {nextExportCursor ? (
              <button
                type="button"
                onClick={() =>
                  withAction('exports:loadMore', () =>
                    loadExportJobs(nextExportCursor, true),
                  )
                }
                className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:opacity-70"
                disabled={isLoadingMoreExports}
              >
                {isLoadingMoreExports ? (
                  <Spinner size="xs" variant="grid" />
                ) : actionLoading['exports:loadMore'] ? (
                  <Spinner size="xs" variant="grid" />
                ) : null}
                {t('loadMore')}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {showExports ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
        <h3 className="text-xl font-semibold">{t('exportDeliveryTitle')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            value={exportDeliveryBusinessId}
            onChange={setExportDeliveryBusinessId}
            options={businessSelectOptions}
            placeholder={t('selectBusiness')}
          />
          <button
            type="button"
            onClick={() => {
              if (!exportDeliveryBusinessId) {
                setMessage(t('selectBusinessRequestExport'));
                return;
              }
              withAction(`exports:request:${exportDeliveryBusinessId}`, () =>
                exportOnExit(exportDeliveryBusinessId),
              );
            }}
            className="rounded border border-gold-700/50 px-3 py-2 text-sm font-semibold text-gold-100"
          >
            <span className="inline-flex items-center gap-2">
              {actionLoading[`exports:request:${exportDeliveryBusinessId}`] ? (
                <Spinner size="xs" variant="pulse" />
              ) : null}
              {t('requestExportOnExit')}
            </span>
          </button>
          <input
            value={exportDeliveryForm.exportJobId}
            onChange={(event) =>
              setExportDeliveryForm({
                ...exportDeliveryForm,
                exportJobId: event.target.value,
              })
            }
            placeholder={t('exportJobIdPlaceholder')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={exportDeliveryForm.reason}
            onChange={(event) =>
              setExportDeliveryForm({
                ...exportDeliveryForm,
                reason: event.target.value,
              })
            }
            placeholder={t('deliveryReasonPlaceholder')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <button
            type="button"
            onClick={markExportDelivered}
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isMarkingExportDelivered}
          >
            {isMarkingExportDelivered ? <Spinner size="xs" variant="orbit" /> : null}
            {isMarkingExportDelivered ? t('markingDelivered') : t('markDelivered')}
          </button>
        </div>
        </section>
      ) : null}

      {showAnnouncements ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
        <h3 className="text-xl font-semibold">{t('announcementsTitle')}</h3>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={createAnnouncement}>
          <input
            value={announcementForm.title}
            onChange={(event) =>
              setAnnouncementForm({ ...announcementForm, title: event.target.value })
            }
            placeholder={t('titlePlaceholder')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <SmartSelect
            value={announcementForm.severity}
            onChange={(value) =>
              setAnnouncementForm({ ...announcementForm, severity: value })
            }
            options={[
              { value: 'INFO', label: t('severityInfo') },
              { value: 'WARNING', label: t('severityWarning') },
              { value: 'SECURITY', label: t('severitySecurity') },
            ]}
          />
          <DateTimePickerInput
            value={announcementForm.startsAt}
            onChange={(value) =>
              setAnnouncementForm({
                ...announcementForm,
                startsAt: value,
                endsAt: applyDefaultAnnouncementEnd(value, announcementForm.endsAt),
              })
            }
            placeholder={t('startsAtPlaceholder')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <DateTimePickerInput
            value={announcementForm.endsAt}
            onChange={(value) =>
              setAnnouncementForm({ ...announcementForm, endsAt: value })
            }
            placeholder={t('endsAtPlaceholder')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <div className="space-y-3 rounded border border-gold-700/40 bg-black/40 p-3 md:col-span-2">
            <p className="text-xs uppercase tracking-[0.3em] text-gold-400">
              {t('announcementTargeting')}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs text-gold-300">{t('targetBusinesses')}</p>
                <TypeaheadInput
                  value={announcementBusinessSearch}
                  onChange={setAnnouncementBusinessSearch}
                  onSelect={(option) => {
                    if (announcementForm.targetBusinessIds.includes(option.id)) {
                      return;
                    }
                    setAnnouncementForm({
                      ...announcementForm,
                      targetBusinessIds: [
                        ...announcementForm.targetBusinessIds,
                        option.id,
                      ],
                    });
                    setAnnouncementBusinessSearch('');
                  }}
                  options={businessOptions}
                  placeholder={t('businessSearchPlaceholder')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                {announcementForm.targetBusinessIds.length ? (
                  <div className="flex flex-wrap gap-2">
                    {announcementForm.targetBusinessIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-2 rounded-full border border-gold-700/40 bg-black/60 px-3 py-1 text-xs text-gold-200"
                      >
                        {businessLookup.get(id)?.name ?? id.slice(0, 6)}
                        <button
                          type="button"
                          onClick={() =>
                            setAnnouncementForm({
                              ...announcementForm,
                              targetBusinessIds: announcementForm.targetBusinessIds.filter(
                                (value) => value !== id,
                              ),
                            })
                          }
                          className="text-gold-400 hover:text-gold-100"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gold-500">{t('allBusinesses')}</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs text-gold-300">{t('targetTiers')}</p>
                <div className="flex flex-wrap gap-2">
                  {announcementTierOptions.map((option) => {
                    const checked = announcementForm.targetTiers.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...announcementForm.targetTiers, option.value]
                              : announcementForm.targetTiers.filter(
                                  (value) => value !== option.value,
                                );
                            setAnnouncementForm({
                              ...announcementForm,
                              targetTiers: next,
                            });
                          }}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
                {!announcementForm.targetTiers.length ? (
                  <p className="text-xs text-gold-500">{t('allTiers')}</p>
                ) : null}
              </div>
              <div className="space-y-2 md:col-span-2">
                <p className="text-xs text-gold-300">{t('targetStatuses')}</p>
                <div className="flex flex-wrap gap-2">
                  {announcementStatusOptions.map((option) => {
                    const checked = announcementForm.targetStatuses.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...announcementForm.targetStatuses, option.value]
                              : announcementForm.targetStatuses.filter(
                                  (value) => value !== option.value,
                                );
                            setAnnouncementForm({
                              ...announcementForm,
                              targetStatuses: next,
                            });
                          }}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
                {!announcementForm.targetStatuses.length ? (
                  <p className="text-xs text-gold-500">{t('allStatuses')}</p>
                ) : null}
              </div>
            </div>
          </div>
          <input
            value={announcementForm.reason}
            onChange={(event) =>
              setAnnouncementForm({ ...announcementForm, reason: event.target.value })
            }
            placeholder={t('reasonPlaceholder')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <textarea
            value={announcementForm.message}
            onChange={(event) =>
              setAnnouncementForm({ ...announcementForm, message: event.target.value })
            }
            placeholder={t('messagePlaceholder')}
            className="min-h-[120px] rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 md:col-span-2"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isCreatingAnnouncement}
          >
            {isCreatingAnnouncement ? <Spinner size="xs" variant="orbit" /> : null}
            {isCreatingAnnouncement ? t('publishing') : t('publishAnnouncement')}
          </button>
        </form>
        <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              className="rounded border border-gold-700/40 bg-black/40 p-3"
            >
              <p className="text-gold-100">
                {announcement.title} • {announcement.severity}
              </p>
              <p>
                {new Date(announcement.startsAt).toLocaleString()} →{' '}
                {announcement.endsAt
                  ? new Date(announcement.endsAt).toLocaleString()
                  : t('openEnded')}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => endAnnouncement(announcement.id)}
                  disabled={endingAnnouncementId === announcement.id}
                  className="inline-flex items-center gap-2 rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {endingAnnouncementId === announcement.id ? (
                    <Spinner size="xs" variant="orbit" />
                  ) : null}
                  {endingAnnouncementId === announcement.id
                    ? t('endingAnnouncement')
                    : t('endAnnouncement')}
                </button>
              </div>
              <p className="text-gold-400">
                {t('targetBusinessesLabel')}:{' '}
                {announcement.businessTargets.length
                  ? announcement.businessTargets
                      .map((target) => {
                        const business = businessLookup.get(target.businessId);
                        return business?.name ?? target.businessId.slice(0, 6);
                      })
                      .filter(Boolean)
                      .join(', ')
                  : t('allBusinesses')}
                {' · '}
                {t('targetTiersLabel')}:{' '}
                {announcement.segmentTargets.some((target) => target.type === 'TIER')
                  ? announcement.segmentTargets
                      .filter((target) => target.type === 'TIER')
                      .map((target) => target.value)
                      .join(', ')
                  : t('allTiers')}
                {' · '}
                {t('targetStatusesLabel')}:{' '}
                {announcement.segmentTargets.some((target) => target.type === 'STATUS')
                  ? announcement.segmentTargets
                      .filter((target) => target.type === 'STATUS')
                      .map((target) => target.value)
                      .join(', ')
                  : t('allStatuses')}
              </p>
            </div>
          ))}
          {!announcements.length ? (
            <p className="text-gold-400">{t('noAnnouncements')}</p>
          ) : null}
        </div>
        </section>
      ) : null}

      {showAudit ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
        <h3 className="text-xl font-semibold">{t('platformAuditTitle')}</h3>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={fetchAuditLogs}>
          <SmartSelect
            value={auditBusinessId}
            onChange={setAuditBusinessId}
            options={businessSelectOptions}
            placeholder={t('selectBusiness')}
          />
          <TypeaheadInput
            value={auditAction}
            onChange={setAuditAction}
            onSelect={(option) => setAuditAction(option.label)}
            options={auditActionOptions}
            placeholder={t('actionFilter')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <SmartSelect
            value={auditOutcome}
            onChange={(value) => setAuditOutcome(value)}
            placeholder={t('allOutcomes')}
            options={[
              { value: '', label: t('allOutcomes') },
              { value: 'SUCCESS', label: t('success') },
              { value: 'FAILURE', label: t('failure') },
            ]}
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black"
          >
            {loadingLogs ? <Spinner size="xs" variant="orbit" /> : null}
            {loadingLogs ? t('loading') : t('loadLogs')}
          </button>
        </form>
        <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="rounded border border-gold-700/40 bg-black/40 p-3"
            >
              <p className="text-gold-100">
                {log.action} • {log.outcome}
              </p>
              <p>
                {log.resourceType} • {new Date(log.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
          {nextAuditCursor ? (
            <button
              type="button"
              onClick={() =>
                withAction('audit:loadMore', () =>
                  fetchAuditLogs(undefined, nextAuditCursor, true),
                )
              }
              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
              disabled={isLoadingMoreAudit}
            >
              {isLoadingMoreAudit ? (
                <Spinner size="xs" variant="grid" />
              ) : actionLoading['audit:loadMore'] ? (
                <Spinner size="xs" variant="grid" />
              ) : null}
              {t('loadMoreLogs')}
            </button>
          ) : null}
        </div>
        </section>
      ) : null}

      {showAudit ? (
        <section className="command-card p-6 space-y-4 nvi-reveal">
        <h3 className="text-xl font-semibold">{t('adminActionsTitle')}</h3>
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event) =>
            withAction('audit:platform', () =>
              fetchPlatformAuditLogs(event, undefined, false),
            )
          }
        >
          <input
            value={platformAdminId}
            onChange={(event) => setPlatformAdminId(event.target.value)}
            placeholder={t('platformAdminIdPlaceholder')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black"
          >
            <span className="inline-flex items-center gap-2">
              {actionLoading['audit:platform'] ? (
                <Spinner size="xs" variant="ring" />
              ) : null}
              {t('loadAdminActions')}
            </span>
          </button>
        </form>
        <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
          {platformAuditLogs.map((log) => (
            <div
              key={log.id}
              className="rounded border border-gold-700/40 bg-black/40 p-3"
            >
              <p className="text-gold-100">
                {log.action} • {log.resourceType}
              </p>
              {log.resourceId ? (
                <p className="text-gold-400">
                  {t('resourceLabel', {
                    resource: formatEntityLabel(
                      {
                        name:
                          typeof log.metadata?.resourceName === 'string'
                            ? log.metadata.resourceName
                            : null,
                        id: log.resourceId,
                      },
                      log.resourceId,
                    ),
                  })}
                </p>
              ) : null}
              {log.reason ? <p>{t('reasonLabel', { reason: log.reason })}</p> : null}
              <p>{new Date(log.createdAt).toLocaleString()}</p>
            </div>
          ))}
          {nextPlatformAuditCursor ? (
            <button
              type="button"
              onClick={() =>
                withAction('audit:platformMore', () =>
                  fetchPlatformAuditLogs(undefined, nextPlatformAuditCursor, true),
                )
              }
              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
            >
              <span className="inline-flex items-center gap-2">
                {actionLoading['audit:platformMore'] ? (
                  <Spinner size="xs" variant="grid" />
                ) : null}
                {t('loadMoreActions')}
              </span>
            </button>
          ) : null}
        </div>
        </section>
      ) : null}
    </div>
  );
}
