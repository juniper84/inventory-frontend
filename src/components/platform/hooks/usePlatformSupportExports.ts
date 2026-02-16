import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { buildCursorQuery, normalizePaginated, type PaginatedResponse } from '@/lib/pagination';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

type SupportRequest = {
  id: string;
  businessId: string;
  platformAdminId: string;
  reason: string;
  scope?: string[] | null;
  durationHours?: number | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: string;
  requestedAt: string;
  decidedAt?: string | null;
  expiresAt?: string | null;
  sessions?: {
    id: string;
    createdAt: string;
    expiresAt: string;
    revokedAt?: string | null;
  }[];
};

type SupportSession = {
  id: string;
  requestId: string;
  businessId: string;
  platformAdminId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  request?: {
    id: string;
    reason: string;
    status: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  } | null;
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

type ExportQueueStats = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, { total: number; byStatus: Record<string, number> }>;
};

type SupportForm = {
  businessId: string;
  reason: string;
  durationHours: string;
  severity: SupportRequest['severity'];
  priority: SupportRequest['priority'];
  scope: string[];
};

type SupportFilters = {
  status: string;
  businessId: string;
  platformAdminId: string;
  severity: string;
  priority: string;
  requestedFrom: string;
  requestedTo: string;
  activeOnly: string;
};

type ExportFilters = {
  businessId: string;
  status: string;
  type: string;
};

type ExportDeliveryForm = {
  exportJobId: string;
  reason: string;
};

export function usePlatformSupportExports({
  token,
  t,
  setMessage,
}: {
  token: string | null;
  t: Translate;
  setMessage: (value: string | null) => void;
}) {
  const [isLoadingMoreSupport, setIsLoadingMoreSupport] = useState(false);
  const [isLoadingMoreSupportSessions, setIsLoadingMoreSupportSessions] = useState(false);
  const [requestingSupport, setRequestingSupport] = useState(false);
  const [activatingSupportId, setActivatingSupportId] = useState<string | null>(null);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [supportSessions, setSupportSessions] = useState<SupportSession[]>([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState<SubscriptionRequest[]>([]);
  const [subscriptionResponseNotes, setSubscriptionResponseNotes] = useState<Record<string, string>>({});
  const [nextSupportCursor, setNextSupportCursor] = useState<string | null>(null);
  const [nextSupportSessionCursor, setNextSupportSessionCursor] = useState<string | null>(null);
  const [supportForm, setSupportForm] = useState<SupportForm>({
    businessId: '',
    reason: '',
    durationHours: '',
    severity: 'MEDIUM',
    priority: 'MEDIUM',
    scope: [],
  });
  const [supportFilters, setSupportFilters] = useState<SupportFilters>({
    status: '',
    businessId: '',
    platformAdminId: '',
    severity: '',
    priority: '',
    requestedFrom: '',
    requestedTo: '',
    activeOnly: 'true',
  });
  const [supportSessionReasons, setSupportSessionReasons] = useState<Record<string, string>>({});
  const [revokingSupportSessionId, setRevokingSupportSessionId] = useState<string | null>(null);
  const [exportDeliveryForm, setExportDeliveryForm] = useState<ExportDeliveryForm>({
    exportJobId: '',
    reason: '',
  });
  const [isMarkingExportDelivered, setIsMarkingExportDelivered] = useState(false);
  const [exportDeliveryBusinessId, setExportDeliveryBusinessId] = useState('');
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [exportQueueStats, setExportQueueStats] = useState<ExportQueueStats | null>(null);
  const [nextExportCursor, setNextExportCursor] = useState<string | null>(null);
  const [isLoadingMoreExports, setIsLoadingMoreExports] = useState(false);
  const [isLoadingExports, setIsLoadingExports] = useState(false);
  const [isLoadingExportStats, setIsLoadingExportStats] = useState(false);
  const [exportFilters, setExportFilters] = useState<ExportFilters>({
    businessId: '',
    status: '',
    type: '',
  });

  const loadSupportRequests = async (cursor?: string, append = false) => {
    if (!token) return;
    if (append) setIsLoadingMoreSupport(true);
    try {
      const query = buildCursorQuery({
        limit: 20,
        cursor,
        status: supportFilters.status || undefined,
        businessId: supportFilters.businessId || undefined,
        platformAdminId: supportFilters.platformAdminId || undefined,
        severity: supportFilters.severity || undefined,
        priority: supportFilters.priority || undefined,
        requestedFrom: supportFilters.requestedFrom || undefined,
        requestedTo: supportFilters.requestedTo || undefined,
      });
      const requests = await apiFetch<PaginatedResponse<SupportRequest> | SupportRequest[]>(
        `/platform/support-access/requests${query}`,
        { token },
      );
      const result = normalizePaginated(requests);
      setSupportRequests((prev) => (append ? [...prev, ...result.items] : result.items));
      setNextSupportCursor(result.nextCursor);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadSupportRequestsFailed')));
    } finally {
      if (append) setIsLoadingMoreSupport(false);
    }
  };

  const loadSupportSessions = async (cursor?: string, append = false) => {
    if (!token) return;
    if (append) setIsLoadingMoreSupportSessions(true);
    try {
      const query = buildCursorQuery({
        limit: 20,
        cursor,
        businessId: supportFilters.businessId || undefined,
        platformAdminId: supportFilters.platformAdminId || undefined,
        activeOnly: supportFilters.activeOnly || undefined,
      });
      const sessions = await apiFetch<PaginatedResponse<SupportSession> | SupportSession[]>(
        `/platform/support-access/sessions${query}`,
        { token },
      );
      const result = normalizePaginated(sessions);
      setSupportSessions((prev) => (append ? [...prev, ...result.items] : result.items));
      setNextSupportSessionCursor(result.nextCursor);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadSupportSessionsFailed')));
    } finally {
      if (append) setIsLoadingMoreSupportSessions(false);
    }
  };

  const loadSubscriptionRequests = async () => {
    if (!token) return;
    try {
      const data = await apiFetch<PaginatedResponse<SubscriptionRequest> | SubscriptionRequest[]>(
        '/platform/subscription-requests?limit=200',
        { token },
      );
      const result = normalizePaginated(data);
      setSubscriptionRequests(result.items);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadSubscriptionRequestsFailed')));
    }
  };

  const requestSupport = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
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
          severity: supportForm.severity,
          priority: supportForm.priority,
        }),
      });
      setSupportForm({
        businessId: '',
        reason: '',
        durationHours: '',
        severity: 'MEDIUM',
        priority: 'MEDIUM',
        scope: [],
      });
      await Promise.all([loadSupportRequests(), loadSupportSessions(), loadSubscriptionRequests()]);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('createSupportRequestFailed')));
    } finally {
      setRequestingSupport(false);
    }
  };

  const activateSupport = async (requestId: string) => {
    if (!token) return;
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
      await Promise.all([loadSupportRequests(), loadSupportSessions(), loadSubscriptionRequests()]);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('activateSupportFailed')));
    } finally {
      setActivatingSupportId(null);
    }
  };

  const applySupportFilters = async () => {
    await Promise.all([loadSupportRequests(), loadSupportSessions()]);
  };

  const revokeSupportSession = async (sessionId: string) => {
    if (!token) return;
    const reason = (supportSessionReasons[sessionId] ?? '').trim();
    if (!reason) {
      setMessage(t('supportSessionRevokeReasonRequired'));
      return;
    }
    setRevokingSupportSessionId(sessionId);
    try {
      await apiFetch(`/platform/support-access/sessions/${sessionId}/revoke`, {
        token,
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setSupportSessionReasons((prev) => ({ ...prev, [sessionId]: '' }));
      setMessage(t('supportSessionRevoked'));
      await Promise.all([loadSupportRequests(), loadSupportSessions()]);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('supportSessionRevokeFailed')));
    } finally {
      setRevokingSupportSessionId(null);
    }
  };

  const updateSubscriptionRequest = async (
    requestId: string,
    action: 'approve' | 'reject',
  ) => {
    if (!token) return;
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

  const loadExportJobs = async (cursor?: string, append = false) => {
    if (!token) return;
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
      setExportJobs((prev) => (append ? [...prev, ...result.items] : result.items));
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

  const loadExportQueueStats = async () => {
    if (!token) return;
    setIsLoadingExportStats(true);
    try {
      const query = buildCursorQuery({
        businessId: exportFilters.businessId || undefined,
        type: exportFilters.type || undefined,
      });
      const data = await apiFetch<ExportQueueStats>(`/platform/exports/stats${query}`, {
        token,
      });
      setExportQueueStats(data);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadExportStatsFailed')));
    } finally {
      setIsLoadingExportStats(false);
    }
  };

  const exportOnExit = async (businessId: string) => {
    if (!token) return;
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
    if (!token) return;
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

  const retryExportJob = async (jobId: string) => {
    if (!token) return;
    try {
      await apiFetch(`/platform/exports/${jobId}/retry`, {
        token,
        method: 'POST',
        body: JSON.stringify({ reason: 'Platform retry from queue board' }),
      });
      setMessage(t('exportRetrySuccess'));
      await Promise.all([loadExportJobs(), loadExportQueueStats()]);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('exportRetryFailed')));
    }
  };

  const requeueExportJob = async (jobId: string) => {
    if (!token) return;
    try {
      await apiFetch(`/platform/exports/${jobId}/requeue`, {
        token,
        method: 'POST',
        body: JSON.stringify({ reason: 'Platform requeue from queue board' }),
      });
      setMessage(t('exportRequeueSuccess'));
      await Promise.all([loadExportJobs(), loadExportQueueStats()]);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('exportRequeueFailed')));
    }
  };

  const cancelExportJob = async (jobId: string) => {
    if (!token) return;
    try {
      await apiFetch(`/platform/exports/${jobId}/cancel`, {
        token,
        method: 'POST',
        body: JSON.stringify({ reason: 'Platform cancel from queue board' }),
      });
      setMessage(t('exportCancelSuccess'));
      await Promise.all([loadExportJobs(), loadExportQueueStats()]);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('exportCancelFailed')));
    }
  };

  return {
    isLoadingMoreSupport,
    isLoadingMoreSupportSessions,
    requestingSupport,
    activatingSupportId,
    supportRequests,
    supportSessions,
    subscriptionRequests,
    subscriptionResponseNotes,
    setSubscriptionResponseNotes,
    nextSupportCursor,
    nextSupportSessionCursor,
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
    nextExportCursor,
    isLoadingMoreExports,
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
  };
}
