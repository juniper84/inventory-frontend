import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { buildCursorQuery, normalizePaginated, type PaginatedResponse } from '@/lib/pagination';
import { confirmAction, type ToastInput } from '@/lib/app-notifications';
import { setSession } from '@/lib/auth';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

type SupportRequest = {
  id: string;
  businessId: string;
  business?: { name: string } | null;
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
  business?: { name: string } | null;
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
  type: 'UPGRADE' | 'DOWNGRADE' | 'CANCEL' | 'SUBSCRIBE';
  requestedTier?: string | null;
  requestedDurationMonths?: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  responseNote?: string | null;
  approvedDurationMonths?: number | null;
  approvedTier?: string | null;
  isPaid?: boolean | null;
  amountDue?: number | null;
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
  setMessage: (value: ToastInput | null) => void;
}) {
  const [supportPage, setSupportPage] = useState(1);
  const [supportCursorStack, setSupportCursorStack] = useState<(string | null)[]>([null]);
  const [supportSessionPage, setSupportSessionPage] = useState(1);
  const [supportSessionCursorStack, setSupportSessionCursorStack] = useState<(string | null)[]>([null]);
  const [requestingSupport, setRequestingSupport] = useState(false);
  const [activatingSupportId, setActivatingSupportId] = useState<string | null>(null);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [supportSessions, setSupportSessions] = useState<SupportSession[]>([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState<SubscriptionRequest[]>([]);
  const [subscriptionResponseNotes, setSubscriptionResponseNotes] = useState<Record<string, string>>({});
  const [subscriptionApprovalForms, setSubscriptionApprovalForms] = useState<Record<string, {
    durationMonths: string;
    isPaid: boolean;
    amountDue: string;
    tier: string;
  }>>({});
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
  const [pendingSupportLogin, setPendingSupportLogin] = useState<{
    token: string;
    businessId: string;
    expiresAt: string;
  } | null>(null);
  const [loggingInAsSupport, setLoggingInAsSupport] = useState(false);
  const [exportDeliveryForm, setExportDeliveryForm] = useState<ExportDeliveryForm>({
    exportJobId: '',
    reason: '',
  });
  const [isMarkingExportDelivered, setIsMarkingExportDelivered] = useState(false);
  const [exportDeliveryBusinessId, setExportDeliveryBusinessId] = useState('');
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [exportQueueStats, setExportQueueStats] = useState<ExportQueueStats | null>(null);
  const [nextExportCursor, setNextExportCursor] = useState<string | null>(null);
  const [exportPage, setExportPage] = useState(1);
  const [exportCursorStack, setExportCursorStack] = useState<(string | null)[]>([null]);
  const [isLoadingExports, setIsLoadingExports] = useState(false);
  const [isLoadingExportStats, setIsLoadingExportStats] = useState(false);
  const [exportFilters, setExportFilters] = useState<ExportFilters>({
    businessId: '',
    status: '',
    type: '',
  });

  const loadSupportRequests = useCallback(async (cursor?: string) => {
    if (!token) return;
    if (cursor === undefined) {
      setSupportPage(1);
      setSupportCursorStack([null]);
    }
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
      setSupportRequests(result.items);
      setNextSupportCursor(result.nextCursor);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadSupportRequestsFailed')));
    }
  }, [
    token,
    supportFilters.status,
    supportFilters.businessId,
    supportFilters.platformAdminId,
    supportFilters.severity,
    supportFilters.priority,
    supportFilters.requestedFrom,
    supportFilters.requestedTo,
    setMessage,
    t,
  ]);

  const goToNextSupportPage = async () => {
    if (!nextSupportCursor) return;
    const cursor = nextSupportCursor;
    setSupportPage((p) => p + 1);
    setSupportCursorStack((prev) => [...prev, cursor]);
    await loadSupportRequests(cursor);
  };

  const goToPrevSupportPage = async () => {
    if (supportPage <= 1) return;
    const newPage = supportPage - 1;
    const cursor = supportCursorStack[newPage - 1];
    setSupportPage(newPage);
    setSupportCursorStack((prev) => prev.slice(0, newPage));
    await loadSupportRequests(cursor ?? undefined);
  };

  const loadSupportSessions = useCallback(async (cursor?: string) => {
    if (!token) return;
    if (cursor === undefined) {
      setSupportSessionPage(1);
      setSupportSessionCursorStack([null]);
    }
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
      setSupportSessions(result.items);
      setNextSupportSessionCursor(result.nextCursor);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadSupportSessionsFailed')));
    }
  }, [
    token,
    supportFilters.businessId,
    supportFilters.platformAdminId,
    supportFilters.activeOnly,
    setMessage,
    t,
  ]);

  const goToNextSupportSessionPage = async () => {
    if (!nextSupportSessionCursor) return;
    const cursor = nextSupportSessionCursor;
    setSupportSessionPage((p) => p + 1);
    setSupportSessionCursorStack((prev) => [...prev, cursor]);
    await loadSupportSessions(cursor);
  };

  const goToPrevSupportSessionPage = async () => {
    if (supportSessionPage <= 1) return;
    const newPage = supportSessionPage - 1;
    const cursor = supportSessionCursorStack[newPage - 1];
    setSupportSessionPage(newPage);
    setSupportSessionCursorStack((prev) => prev.slice(0, newPage));
    await loadSupportSessions(cursor ?? undefined);
  };

  const loadSubscriptionRequests = useCallback(async () => {
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
  }, [token, setMessage, t]);

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
          scope: supportForm.scope.length ? supportForm.scope : undefined,
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
      const response = await apiFetch<{ businessId: string; token: string; expiresAt: string }>(
        `/platform/support-access/requests/${requestId}/activate`,
        {
          token,
          method: 'POST',
        },
      );
      setPendingSupportLogin({
        token: response.token,
        businessId: response.businessId,
        expiresAt: response.expiresAt,
      });
      await Promise.all([loadSupportRequests(), loadSupportSessions(), loadSubscriptionRequests()]);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('activateSupportFailed')));
    } finally {
      setActivatingSupportId(null);
    }
  };

  const loginAsSupport = async (locale: string) => {
    if (!token || !pendingSupportLogin) return;
    setLoggingInAsSupport(true);
    try {
      const loginResponse = await apiFetch<{
        accessToken: string;
        businessId: string;
        expiresAt: string;
      }>('/platform/support-access/login', {
        token,
        method: 'POST',
        body: JSON.stringify({ token: pendingSupportLogin.token }),
      });
      setSession(loginResponse.accessToken, '', {
        id: 'support',
        email: 'support-access',
        name: `Support: ${loginResponse.businessId}`,
      });
      setPendingSupportLogin(null);
      window.open(`/${locale}`, '_blank');
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('activateSupportFailed')));
    } finally {
      setLoggingInAsSupport(false);
    }
  };

  const clearPendingSupportLogin = () => setPendingSupportLogin(null);

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
      const approvalForm = subscriptionApprovalForms[requestId];
      const body: Record<string, unknown> = { responseNote: note };
      if (action === 'approve' && approvalForm) {
        const duration = parseInt(approvalForm.durationMonths, 10);
        if (duration > 0) body.durationMonths = duration;
        body.isPaid = approvalForm.isPaid;
        const amount = parseFloat(approvalForm.amountDue);
        if (!isNaN(amount) && amount >= 0) body.amountDue = amount;
      }
      await apiFetch(`/platform/subscription-requests/${requestId}/${action}`, {
        token,
        method: 'POST',
        body: JSON.stringify(body),
      });
      await loadSubscriptionRequests();
      setSubscriptionResponseNotes((prev) => ({ ...prev, [requestId]: '' }));
      setSubscriptionApprovalForms((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      setMessage(
        action === 'approve'
          ? t('subscriptionRequestApproved')
          : t('subscriptionRequestRejected'),
      );
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('updateSubscriptionRequestFailed')));
    }
  };

  const loadExportJobs = useCallback(async (cursor?: string) => {
    if (!token) return;
    setIsLoadingExports(true);
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
      setExportJobs(result.items);
      setNextExportCursor(result.nextCursor);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadExportJobsFailed')));
    } finally {
      setIsLoadingExports(false);
    }
  }, [
    token,
    exportFilters.businessId,
    exportFilters.status,
    exportFilters.type,
    setMessage,
    t,
  ]);

  const goToNextExportPage = useCallback(async () => {
    if (!nextExportCursor) return;
    const cursor = nextExportCursor;
    setExportPage((p) => p + 1);
    setExportCursorStack((prev) => [...prev, cursor]);
    await loadExportJobs(cursor);
  }, [nextExportCursor, loadExportJobs]);

  const goToPrevExportPage = useCallback(async () => {
    if (exportPage <= 1) return;
    const newPage = exportPage - 1;
    const cursor = exportCursorStack[newPage - 1];
    setExportPage(newPage);
    setExportCursorStack((prev) => prev.slice(0, newPage));
    await loadExportJobs(cursor ?? undefined);
  }, [exportPage, exportCursorStack, loadExportJobs]);

  const loadExportQueueStats = useCallback(async () => {
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
  }, [
    token,
    exportFilters.businessId,
    exportFilters.type,
    setMessage,
    t,
  ]);

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
    const ok = await confirmAction({
      title: t('exportRetryConfirmTitle'),
      message: t('exportRetryConfirmMessage'),
      confirmText: t('exportRetrySuccess'),
    });
    if (!ok) return;
    try {
      await apiFetch(`/platform/exports/${jobId}/retry`, {
        token,
        method: 'POST',
        body: JSON.stringify({ reason: 'Platform retry from queue board' }),
      });
      setMessage(t('exportRetrySuccess'));
      setExportPage(1);
      setExportCursorStack([null]);
      await Promise.all([loadExportJobs(), loadExportQueueStats()]);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('exportRetryFailed')));
    }
  };

  const requeueExportJob = async (jobId: string) => {
    if (!token) return;
    const ok = await confirmAction({
      title: t('exportRequeueConfirmTitle'),
      message: t('exportRequeueConfirmMessage'),
      confirmText: t('exportRequeueSuccess'),
    });
    if (!ok) return;
    try {
      await apiFetch(`/platform/exports/${jobId}/requeue`, {
        token,
        method: 'POST',
        body: JSON.stringify({ reason: 'Platform requeue from queue board' }),
      });
      setMessage(t('exportRequeueSuccess'));
      setExportPage(1);
      setExportCursorStack([null]);
      await Promise.all([loadExportJobs(), loadExportQueueStats()]);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('exportRequeueFailed')));
    }
  };

  const cancelExportJob = async (jobId: string) => {
    if (!token) return;
    const ok = await confirmAction({
      title: t('exportCancelConfirmTitle'),
      message: t('exportCancelConfirmMessage'),
      confirmText: t('exportCancelSuccess'),
    });
    if (!ok) return;
    try {
      await apiFetch(`/platform/exports/${jobId}/cancel`, {
        token,
        method: 'POST',
        body: JSON.stringify({ reason: 'Platform cancel from queue board' }),
      });
      setMessage(t('exportCancelSuccess'));
      setExportPage(1);
      setExportCursorStack([null]);
      await Promise.all([loadExportJobs(), loadExportQueueStats()]);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('exportCancelFailed')));
    }
  };

  return {
    supportPage,
    hasNextSupportPage: nextSupportCursor !== null,
    supportSessionPage,
    hasNextSupportSessionPage: nextSupportSessionCursor !== null,
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
    nextExportCursor,
    exportPage,
    hasNextExportPage: nextExportCursor !== null,
    isLoadingExports,
    isLoadingExportStats,
    exportFilters,
    setExportFilters,
    pendingSupportLogin,
    loggingInAsSupport,
    loginAsSupport,
    clearPendingSupportLogin,
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
    goToNextSupportPage,
    goToPrevSupportPage,
    goToNextSupportSessionPage,
    goToPrevSupportSessionPage,
  };
}
