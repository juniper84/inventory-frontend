import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';
import { promptAction } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

type Business = {
  id: string;
  subscription?: { tier?: string | null } | null;
};

type BusinessWorkspace = {
  business: {
    updatedAt?: string;
  };
};

type BusinessActionPreflight = {
  action: string;
  business: {
    id: string;
    name: string;
    status: string;
    updatedAt: string;
  };
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

type BusinessAction =
  | 'SUSPEND'
  | 'READ_ONLY'
  | 'FORCE_LOGOUT'
  | 'ARCHIVE'
  | 'DELETE_READY'
  | 'RESTORE'
  | 'PURGE';

type BusinessActionModalState = {
  businessId: string;
  action: BusinessAction;
  step: 1 | 2 | 3;
  reason: string;
  confirmBusinessId: string;
  confirmText: string;
  preflightLoading: boolean;
  preflightError: string | null;
  preflight: BusinessActionPreflight | null;
};

function formatLocalDateTime(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

export function usePlatformBusinessActions({
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
}: {
  token: string | null;
  t: Translate;
  setMessage: (value: string | null) => void;
  loadData: () => Promise<void>;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  showBusinessDetailPage: boolean;
  resolvedBusinessId?: string;
  loadBusinessWorkspace: (businessId: string) => Promise<void>;
  selectedBusinessId: string;
  setSupportForm: Dispatch<
    SetStateAction<{
      businessId: string;
      reason: string;
      durationHours: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      scope: string[];
    }>
  >;
  setHistoryBusinessId: Dispatch<SetStateAction<string>>;
  setAuditBusinessId: Dispatch<SetStateAction<string>>;
  setExportDeliveryBusinessId: Dispatch<SetStateAction<string>>;
  setOpenedBusinessId: Dispatch<SetStateAction<string>>;
  quickActions: Record<string, { reason: string; trialDays: string }>;
  subscriptionEdits: Record<
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
  >;
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
  businesses: Business[];
  statusEdits: Record<string, { status: string; reason: string }>;
  readOnlyEdits: Record<string, { enabled: boolean; reason: string }>;
  reviewEdits: Record<string, { underReview: boolean; reason: string; severity: string }>;
  rateLimitEdits: Record<
    string,
    { limit: string; ttlSeconds: string; expiresAt: string; reason: string }
  >;
  revokeReason: string;
  setRevokeReason: Dispatch<SetStateAction<string>>;
  setRevokeReasonTarget: Dispatch<SetStateAction<string>>;
  setIsRevokingSessions: Dispatch<SetStateAction<boolean>>;
  healthBusinessId: string;
  setHealthLoading: Dispatch<SetStateAction<boolean>>;
  pinnedBusinessIds: string[];
  setPinnedBusinessIds: Dispatch<SetStateAction<string[]>>;
  setHealthMap: Dispatch<
    SetStateAction<
      Record<
        string,
        {
          subscriptionStatus: string;
          offlineFailed: number;
          exportsPending: number;
          score: number;
        }
      >
    >
  >;
  setLoadingDevices: Dispatch<SetStateAction<Record<string, boolean>>>;
  setDevicesMap: Dispatch<
    SetStateAction<Record<string, { id: string; deviceName?: string | null; status: string }[]>>
  >;
  setPurgingBusinessId: Dispatch<SetStateAction<string | null>>;
}) {
  const [businessActionModal, setBusinessActionModal] = useState<BusinessActionModalState | null>(
    null,
  );

  const actionNeedsPreflight = (action: BusinessAction) =>
    ['ARCHIVE', 'DELETE_READY', 'PURGE'].includes(action);

  const preflightActionName = (action: BusinessAction) =>
    action === 'DELETE_READY' ? 'DELETE' : action;

  const updateStatus = async (businessId: string) => {
    if (!token) return;
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

  const updateSubscription = async (businessId: string) => {
    if (!token) return;
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
    if (!values) return;
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
    if (!token) return;
    const values = subscriptionEdits[businessId];
    if (!values?.reason) {
      setMessage(t('subscriptionReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/subscriptions/${businessId}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ limits: null, reason: values.reason }),
      });
      setMessage(t('resetSubscriptionLimitsSuccess'));
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('resetSubscriptionLimitsFailed')));
    }
  };

  const recordSubscriptionPurchase = async (businessId: string) => {
    if (!token) return;
    const values = subscriptionEdits[businessId];
    if (!values?.reason?.trim()) {
      setMessage(t('subscriptionReasonRequired'));
      return;
    }
    const durationDays = Number(values.durationDays ?? '');
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      setMessage(t('subscriptionDurationInvalid'));
      return;
    }
    const startsAt = values.startsAt?.trim();
    try {
      await apiFetch(`/platform/subscriptions/${businessId}/purchase`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          tier: values.tier,
          durationDays,
          startsAt: startsAt || null,
          reason: values.reason,
        }),
      });
      setMessage(t('recordPurchaseSuccess'));
      await loadData();
      if (showBusinessDetailPage && resolvedBusinessId === businessId) {
        await loadBusinessWorkspace(businessId);
      }
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('recordPurchaseFailed')));
    }
  };

  const updateReadOnly = async (businessId: string) => {
    if (!token) return;
    const values = readOnlyEdits[businessId];
    if (!values) return;
    if (values.enabled && !values.reason) {
      setMessage(t('readOnlyReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/businesses/${businessId}/read-only`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ enabled: values.enabled, reason: values.reason || undefined }),
      });
      setMessage(values.enabled ? t('readOnlyEnabled') : t('readOnlyDisabled'));
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('updateReadOnlyFailed')));
    }
  };

  const updateReview = async (
    businessId: string,
    override?: { underReview: boolean; reason: string; severity?: string },
  ) => {
    if (!token) return;
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
    if (!token) return;
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
      setMessage(t('forceLogoutSuccess', { value: response.revokedCount ?? 0 }));
      setRevokeReason('');
      setRevokeReasonTarget('');
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('forceLogoutFailed')));
    } finally {
      setIsRevokingSessions(false);
    }
  };

  const updateRateLimits = async (businessId: string) => {
    if (!token) return;
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
    if (!token) return;
    const data = await apiFetch<{
      subscriptionStatus: string;
      offlineFailed: number;
      exportsPending: number;
      score: number;
    }>(`/platform/businesses/${businessId}/health`, { token });
    setHealthMap((prev) => ({ ...prev, [businessId]: data }));
  };

  const loadDevices = async (businessId: string) => {
    if (!token) return;
    setLoadingDevices((prev) => ({ ...prev, [businessId]: true }));
    try {
      const data = await apiFetch<{ id: string; deviceName?: string | null; status: string }[]>(
        `/platform/businesses/${businessId}/devices`,
        { token },
      );
      setDevicesMap((prev) => ({ ...prev, [businessId]: data }));
    } finally {
      setLoadingDevices((prev) => ({ ...prev, [businessId]: false }));
    }
  };

  const revokeDevice = async (deviceId: string, businessId: string, reason?: string) => {
    if (!token) return;
    try {
      await apiFetch(`/platform/devices/${deviceId}/revoke`, {
        token,
        method: 'POST',
        body: JSON.stringify({ reason: reason?.trim() || 'Support device revoke' }),
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
    options?: { expectedUpdatedAt?: string; idempotencyKey?: string },
  ) => {
    if (!token) return;
    if (!reason?.trim()) {
      setMessage(t('statusReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/businesses/${businessId}/status`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({
          status,
          reason,
          expectedUpdatedAt: options?.expectedUpdatedAt,
          idempotencyKey: options?.idempotencyKey,
        }),
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
    options?: { expectedUpdatedAt?: string; idempotencyKey?: string },
  ) => {
    if (!token) return;
    if (enabled && !reason?.trim()) {
      setMessage(t('readOnlyReasonRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/businesses/${businessId}/read-only`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({
          enabled,
          reason,
          expectedUpdatedAt: options?.expectedUpdatedAt,
          idempotencyKey: options?.idempotencyKey,
        }),
      });
      await loadData();
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('updateReadOnlyFailed')));
    }
  };

  const purgeBusiness = async (businessId: string) => {
    if (!token) return;
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
        body: JSON.stringify({ reason, confirmBusinessId, confirmText }),
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
      prev.includes(businessId) ? prev.filter((id) => id !== businessId) : [...prev, businessId],
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
    if (!token) return;
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
    if (!token) return;
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
    if (!token) return;
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

  const openBusinessActionModal = (businessId: string, action: BusinessAction) => {
    setBusinessActionModal({
      businessId,
      action,
      step: 1,
      reason: '',
      confirmBusinessId: '',
      confirmText: '',
      preflightLoading: actionNeedsPreflight(action),
      preflightError: null,
      preflight: null,
    });
    if (token && actionNeedsPreflight(action)) {
      const normalized = preflightActionName(action);
      apiFetch<BusinessActionPreflight>(
        `/platform/businesses/${businessId}/actions/${normalized}/preflight`,
        { token },
      )
        .then((preflight) => {
          setBusinessActionModal((prev) => {
            if (!prev) return prev;
            if (prev.businessId !== businessId || prev.action !== action) return prev;
            return {
              ...prev,
              preflight,
              preflightLoading: false,
              preflightError: null,
            };
          });
        })
        .catch((err) => {
          const errorMessage = getApiErrorMessage(err, t('businessPreflightLoadFailed'));
          setBusinessActionModal((prev) => {
            if (!prev) return prev;
            if (prev.businessId !== businessId || prev.action !== action) return prev;
            return {
              ...prev,
              preflightLoading: false,
              preflightError: errorMessage,
            };
          });
        });
    }
  };

  const executeBusinessActionModal = async () => {
    if (!businessActionModal || !token) return;
    const {
      businessId,
      action,
      reason,
      confirmBusinessId,
      confirmText,
      preflight,
      preflightLoading,
    } = businessActionModal;

    if (actionNeedsPreflight(action)) {
      if (preflightLoading) {
        setMessage(t('businessPreflightStillLoading'));
        return;
      }
      if (!preflight?.ready) {
        setMessage(t('businessPreflightNotReady'));
        return;
      }
    }

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
    const expectedUpdatedAt = preflight?.business.updatedAt;
    const idempotencyKey = `${action.toLowerCase()}-${businessId}-${Date.now()}`;

    await withAction(actionKey, async () => {
      if (action === 'SUSPEND') {
        await updateStatusOverride(businessId, 'SUSPENDED', reason, {
          expectedUpdatedAt,
          idempotencyKey,
        });
      } else if (action === 'READ_ONLY') {
        await updateReadOnlyOverride(businessId, true, reason, {
          expectedUpdatedAt,
          idempotencyKey,
        });
      } else if (action === 'FORCE_LOGOUT') {
        const response = await apiFetch<{ revokedCount: number }>(
          `/platform/businesses/${businessId}/revoke-sessions`,
          {
            token,
            method: 'POST',
            body: JSON.stringify({ reason }),
          },
        );
        setMessage(t('forceLogoutSuccess', { value: response.revokedCount ?? 0 }));
      } else if (action === 'ARCHIVE') {
        await updateStatusOverride(businessId, 'ARCHIVED', reason, {
          expectedUpdatedAt,
          idempotencyKey,
        });
      } else if (action === 'DELETE_READY') {
        await updateStatusOverride(businessId, 'DELETED', reason, {
          expectedUpdatedAt,
          idempotencyKey,
        });
      } else if (action === 'RESTORE') {
        await updateStatusOverride(businessId, 'ACTIVE', reason, {
          expectedUpdatedAt,
          idempotencyKey,
        });
      } else if (action === 'PURGE') {
        await apiFetch(`/platform/businesses/${businessId}/purge`, {
          token,
          method: 'POST',
          body: JSON.stringify({
            reason,
            confirmBusinessId,
            confirmText,
            expectedUpdatedAt,
            idempotencyKey,
          }),
        });
        setMessage(t('purgeSuccess'));
        await loadData();
      }
      if (showBusinessDetailPage && resolvedBusinessId === businessId) {
        await loadBusinessWorkspace(businessId);
      }
    });

    setBusinessActionModal(null);
  };

  return {
    businessActionModal,
    setBusinessActionModal,
    actionNeedsPreflight,
    updateStatus,
    updateSubscription,
    recordSubscriptionPurchase,
    applySubscriptionDuration,
    resetSubscriptionLimits,
    updateReadOnly,
    updateReview,
    revokeBusinessSessions,
    updateRateLimits,
    loadBusinessHealth,
    loadDevices,
    revokeDevice,
    purgeBusiness,
    loadHealthForPinned,
    loadHealthForSelected,
    togglePinnedBusiness,
    applySelectedBusiness,
    runQuickStatus,
    runQuickReadOnly,
    runQuickExtendTrial,
    openBusinessActionModal,
    executeBusinessActionModal,
  };
}
