'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { clearSession, getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { Skeleton } from '@/components/Skeleton';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { buildUnitLabel, loadUnits, Unit, UNIT_TYPES } from '@/lib/units';
import { getPermissionSet } from '@/lib/permissions';
import {
  NotificationSettings,
  NotificationRecipientConfig,
  NotificationGroupKey,
  NOTIFICATION_GROUPS,
  normalizeNotificationSettings,
} from '@/lib/notification-settings';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

type Business = { id: string; name: string; defaultLanguage: string };
type Role = { id: string; name: string };
type User = { id: string; name: string; email: string };
type BusinessSettings = {
  approvalDefaults: {
    stockAdjust: boolean;
    stockAdjustThresholdAmount: number | null;
    refund: boolean;
    refundThresholdAmount: number | null;
    purchase: boolean;
    purchaseThresholdAmount: number | null;
    transfer: boolean;
    transferThresholdAmount: number | null;
    expense: boolean;
    expenseThresholdAmount: number | null;
    discountThresholdPercent: number;
    discountThresholdAmount: number | null;
  };
  notificationDefaults: NotificationSettings;
  stockPolicies: {
    negativeStockAllowed: boolean;
    fifoMode: 'FIFO' | 'FEFO';
    valuationMethod: 'FIFO' | 'LIFO' | 'AVERAGE';
    expiryPolicy: 'ALLOW' | 'WARN' | 'BLOCK';
    expiryAlertDays: number;
    batchTrackingEnabled: boolean;
    transferBatchPolicy: 'PRESERVE' | 'RECREATE';
    lowStockThreshold: number;
  };
  posPolicies: {
    receiptTemplate: 'THERMAL' | 'A4';
    receiptHeader: string;
    receiptFooter: string;
    showBranchContact: boolean;
    creditEnabled: boolean;
    shiftTrackingEnabled: boolean;
    shiftVarianceThreshold: number;
    discountThresholdPercent: number;
    discountThresholdAmount: number;
    refundReturnToStockDefault: boolean;
    offlinePriceVariancePercent: number;
    offlineLimits: {
      maxDurationHours: number;
      maxSalesCount: number;
      maxTotalValue: number;
    };
  };
  localeSettings: {
    currency: string;
    timezone: string;
    dateFormat: string;
  };
};
type SupportRequest = {
  id: string;
  platformAdminId: string;
  reason: string;
  status: string;
  scope?: string[] | null;
  durationHours?: number | null;
  requestedAt: string;
};
type SubscriptionSummary = {
  status: string;
  tier: string;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  expiresAt: string | null;
  limits: Record<string, number | string | boolean | null>;
  usage: {
    users: number;
    branches: number;
    products: number;
    devices: number;
  };
  warnings: { type: string; message: string }[];
};

type SubscriptionRequest = {
  id: string;
  type: 'UPGRADE' | 'DOWNGRADE' | 'CANCEL';
  requestedTier?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  responseNote?: string | null;
  createdAt: string;
  decidedAt?: string | null;
};

export default function BusinessSettingsPage() {
  const t = useTranslations('businessSettingsPage');
  const eventLabels = useTranslations('notificationsEvents');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('settings.write');
  const canDeleteBusiness = permissions.has('business.delete');
  const canRequestSubscription = permissions.has('subscription.request');
  const [business, setBusiness] = useState<Business | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<BusinessSettings | null>(
    null,
  );
  const [message, setMessage] = useToastState();
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(
    null,
  );
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState<
    SubscriptionRequest[]
  >([]);
  const [subscriptionRequestForm, setSubscriptionRequestForm] = useState({
    type: 'UPGRADE',
    requestedTier: 'BUSINESS',
    reason: '',
  });
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeletingBusiness, setIsDeletingBusiness] = useState(false);
  const [deleteForm, setDeleteForm] = useState({
    businessId: '',
    password: '',
    confirmText: '',
  });
  const [unitForm, setUnitForm] = useState({
    label: '',
    code: '',
    unitType: 'COUNT' as Unit['unitType'],
  });
  const [isCreatingUnit, setIsCreatingUnit] = useState(false);

  const normalizeNotificationDefaults = (
    value: NotificationSettings | null,
  ): NotificationSettings => normalizeNotificationSettings(value ?? null);

  const isDirty = useMemo(() => {
    if (!settings || !draftSettings) {
      return false;
    }
    return JSON.stringify(settings) !== JSON.stringify(draftSettings);
  }, [settings, draftSettings]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsLoading(true);
    Promise.all([
      apiFetch<Business>('/business', { token }),
      apiFetch<BusinessSettings>('/settings', { token }),
      apiFetch<PaginatedResponse<Role> | Role[]>('/roles?limit=200', { token }),
      apiFetch<PaginatedResponse<User> | User[]>('/users?limit=200', { token }),
      apiFetch<PaginatedResponse<SupportRequest> | SupportRequest[]>(
        '/support-access/requests?limit=200',
        { token },
      ),
      apiFetch<SubscriptionSummary>('/subscription', { token }),
      loadUnits(token),
    ])
      .then(async ([biz, config, roleData, userData, requests, sub, unitList]) => {
        setBusiness(biz);
        const rolesResult = normalizePaginated(roleData).items;
        const usersResult = normalizePaginated(userData).items;
        const normalized = {
          ...config,
          notificationDefaults: normalizeNotificationDefaults(
            config.notificationDefaults ?? null,
          ),
          stockPolicies: {
            ...config.stockPolicies,
            expiryAlertDays: config.stockPolicies.expiryAlertDays ?? 30,
          },
          posPolicies: {
            ...config.posPolicies,
            offlinePriceVariancePercent:
              config.posPolicies.offlinePriceVariancePercent ?? 3,
          },
        };
        setSettings(normalized);
        setDraftSettings(normalized);
        setRoles(rolesResult);
        setUsers(usersResult);
        setSupportRequests(normalizePaginated(requests).items);
        setSubscription(sub);
        setUnits(unitList);
        try {
          const subscriptionRequestsData = await apiFetch<
            SubscriptionRequest[] | PaginatedResponse<SubscriptionRequest>
          >('/subscription/requests', { token });
          setSubscriptionRequests(
            normalizePaginated(subscriptionRequestsData).items,
          );
        } catch (err) {
          setSubscriptionRequests([]);
          setMessage({
            action: 'save',
            outcome: 'info',
            message: getApiErrorMessage(err, t('subscriptionRequestsUnavailable')),
          });
        }
      })
      .catch((err) => setMessage(getApiErrorMessage(err, t('loadFailed'))))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (settings && !isEditing) {
      setDraftSettings(settings);
    }
  }, [settings, isEditing]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const renderUsageBar = (
    label: string,
    used: number,
    limit: number | string | boolean | null | undefined,
  ) => {
    const numericLimit =
      typeof limit === 'number' && limit >= 0 ? limit : null;
    const percent =
      numericLimit && numericLimit > 0
        ? Math.min(100, Math.round((used / numericLimit) * 100))
        : null;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-gold-300">
          <span>{label}</span>
          <span>
            {used}
            {numericLimit !== null
              ? ` / ${numericLimit}`
              : ` / ${t('unlimited')}`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-gold-900/40">
          <div
            className="h-2 rounded-full bg-gold-500"
            style={{ width: `${percent ?? 100}%` }}
          />
        </div>
      </div>
    );
  };

  const formatDateLabel = (value: string | null) => {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toLocaleDateString();
  };

  const getDaysRemaining = (value: string | null) => {
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

  const updateRecipientGroup = (
    key: 'global' | 'email' | 'whatsapp',
    next: NotificationRecipientConfig | null,
  ) => {
    if (!draftSettings) {
      return;
    }
    setDraftSettings({
      ...draftSettings,
      notificationDefaults: {
        ...draftSettings.notificationDefaults,
        recipients: {
          ...draftSettings.notificationDefaults.recipients,
          [key]: next,
        },
      },
    });
  };

  const getRecipientGroup = (
    key: 'global' | 'email' | 'whatsapp',
    settings: NotificationSettings,
  ) => {
    if (key === 'global') {
      return settings.recipients.global;
    }
    return settings.recipients[key] ?? settings.recipients.global;
  };

  const updateSettings = async () => {
    const token = getAccessToken();
    if (!token || !draftSettings) {
      return;
    }
    setMessage(null);
    setIsSaving(true);
    try {
      const updated = await apiFetch<BusinessSettings>('/settings', {
        token,
        method: 'PUT',
        body: JSON.stringify(draftSettings),
      });
      setSettings(updated);
      setDraftSettings(updated);
      setIsEditing(false);
      setMessage({ action: 'update', outcome: 'success', message: t('settingsSaved') });
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('settingsSaveFailed')),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteBusiness = async () => {
    if (!business) {
      return;
    }
    if (!canDeleteBusiness) {
      setMessage({ action: 'delete', outcome: 'failure', message: t('deleteNoAccess') });
      return;
    }
    if (
      deleteForm.businessId.trim() !== business.id ||
      deleteForm.confirmText.trim() !== 'DELETE' ||
      !deleteForm.password
    ) {
      setMessage({ action: 'delete', outcome: 'failure', message: t('deleteValidationFailed') });
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsDeletingBusiness(true);
    setMessage(null);
    try {
      await apiFetch('/business/delete', {
        token,
        method: 'POST',
        body: JSON.stringify({
          businessId: deleteForm.businessId.trim(),
          password: deleteForm.password,
          confirmText: deleteForm.confirmText.trim(),
        }),
      });
      clearSession();
      router.replace(`/${params.locale}/login`);
    } catch (err) {
      setMessage({
        action: 'delete',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('deleteFailed')),
      });
    } finally {
      setIsDeletingBusiness(false);
    }
  };

  const createUnit = async () => {
    const token = getAccessToken();
    if (!token || !unitForm.label || !unitForm.code) {
      return;
    }
    setMessage(null);
    setIsCreatingUnit(true);
    try {
      const created = await apiFetch<Unit>('/units', {
        token,
        method: 'POST',
        body: JSON.stringify({
          label: unitForm.label,
          code: unitForm.code,
          unitType: unitForm.unitType,
        }),
      });
      setUnits((prev) => [...prev, created]);
      setUnitForm({ label: '', code: '', unitType: 'COUNT' });
      setMessage({ action: 'create', outcome: 'success', message: t('unitCreated') });
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('unitCreateFailed')),
      });
    } finally {
      setIsCreatingUnit(false);
    }
  };

  const resolveSupportRequest = async (
    requestId: string,
    action: 'approve' | 'reject',
  ) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    try {
      await apiFetch(`/support-access/requests/${requestId}/${action}`, {
        token,
        method: 'POST',
      });
      const updated = await apiFetch<SupportRequest[]>(
        '/support-access/requests',
        { token },
      );
      setSupportRequests(updated);
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('supportRequestFailed')),
      });
    }
  };

  const submitSubscriptionRequest = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsSubmittingRequest(true);
    try {
      await apiFetch('/subscription/requests', {
        token,
        method: 'POST',
        body: JSON.stringify({
          type: subscriptionRequestForm.type,
          requestedTier:
            subscriptionRequestForm.type === 'CANCEL'
              ? undefined
              : subscriptionRequestForm.requestedTier,
          reason: subscriptionRequestForm.reason || undefined,
        }),
      });
      const updated = await apiFetch<
        SubscriptionRequest[] | PaginatedResponse<SubscriptionRequest>
      >('/subscription/requests', { token });
      setSubscriptionRequests(normalizePaginated(updated).items);
      setSubscriptionRequestForm({
        type: 'UPGRADE',
        requestedTier: 'BUSINESS',
        reason: '',
      });
      setMessage({ action: 'save', outcome: 'success', message: t('subscriptionRequestSent') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('subscriptionRequestFailed')),
      });
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  return (
    <section className="space-y-6">
      <PremiumPageHeader
        eyebrow="BUSINESS COMMAND"
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-badge">POLICY ENGINE</span>
            <span className="nvi-badge">SUBSCRIPTION WATCH</span>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">BUSINESS</p>
          <p className="mt-2 text-lg font-semibold text-gold-100">{business?.name ?? '—'}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">SUBSCRIPTION</p>
          <p className="mt-2 text-lg font-semibold text-gold-100">{subscription?.status ?? '—'}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">ROLES</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{roles.length}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">USERS</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{users.length}</p>
        </article>
      </div>
      <div className="command-card nvi-panel p-6 space-y-4 text-center nvi-reveal">
        {message ? <StatusBanner message={message} /> : null}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ) : business ? (
          <>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-400">
              {t('profileTitle')}
            </p>
            <p className="text-lg font-semibold text-gold-100">
              {business.name}
            </p>
            <p className="text-sm text-gold-200">
              {t('businessId', { id: business.id })}
            </p>
          </>
        ) : null}
      </div>

      {isLoading ? (
        <div className="command-card nvi-panel p-6 space-y-4 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        </div>
      ) : subscription ? (
        <div className="command-card nvi-panel p-6 space-y-4 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gold-100">
                {t('subscriptionTitle')}
              </h3>
              <p className="text-sm text-gold-300">
                {subscription.tier} / {subscription.status}
              </p>
            </div>
            {subscription.status === 'GRACE' ? (
              <span className="rounded-full border border-gold-500/50 px-3 py-1 text-xs text-gold-200">
                {t('gracePeriod')}
              </span>
            ) : null}
          </div>
          {subscription.warnings?.length ? (
            <div className="rounded border border-gold-700/40 bg-gold-900/20 p-3 text-sm text-gold-200">
              {subscription.warnings.map((warning) => (
                <p key={warning.type}>{warning.message}</p>
              ))}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {(() => {
              const endDate =
                subscription.expiresAt ??
                subscription.graceEndsAt ??
                subscription.trialEndsAt ??
                null;
              const endLabel = subscription.expiresAt
                ? t('expiresAtLabel')
                : subscription.status === 'GRACE'
                ? t('graceEndsLabel')
                : t('trialEndsLabel');
              const endDateLabel = formatDateLabel(endDate) ?? '—';
              const daysRemaining = getDaysRemaining(endDate);
              return (
                <>
                  <div className="rounded border border-gold-700/40 bg-black/40 p-3 text-sm text-gold-200">
                    <p className="text-xs uppercase tracking-[0.2em] text-gold-400">
                      {endLabel}
                    </p>
                    <p className="mt-1 text-base text-gold-100">{endDateLabel}</p>
                  </div>
                  <div className="rounded border border-gold-700/40 bg-black/40 p-3 text-sm text-gold-200">
                    <p className="text-xs uppercase tracking-[0.2em] text-gold-400">
                      {t('daysRemainingLabel')}
                    </p>
                    <p className="mt-1 text-base text-gold-100">
                      {daysRemaining !== null
                        ? t('daysRemainingValue', { value: daysRemaining })
                        : '—'}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {renderUsageBar(
              t('usageUsers'),
              subscription.usage.users,
              subscription.limits.users,
            )}
            {renderUsageBar(
              t('usageBranches'),
              subscription.usage.branches,
              subscription.limits.branches,
            )}
            {renderUsageBar(
              t('usageProducts'),
              subscription.usage.products,
              subscription.limits.products,
            )}
            {renderUsageBar(
              t('usageDevices'),
              subscription.usage.devices,
              subscription.limits.offlineDevices,
            )}
          </div>
        </div>
      ) : null}

      {!isLoading ? (
        <div className="command-card nvi-panel p-6 space-y-4 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gold-100">
                {t('subscriptionRequestsTitle')}
              </h3>
              <p className="text-xs text-gold-400">
                {t('subscriptionRequestsSubtitle')}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SmartSelect
              value={subscriptionRequestForm.type}
              onChange={(value) =>
                setSubscriptionRequestForm((prev) => ({
                  ...prev,
                  type: value as 'UPGRADE' | 'DOWNGRADE' | 'CANCEL',
                }))
              }
              options={[
                { value: 'UPGRADE', label: t('requestUpgrade') },
                { value: 'DOWNGRADE', label: t('requestDowngrade') },
                { value: 'CANCEL', label: t('requestCancel') },
              ]}
              className="nvi-select-container"
              isDisabled={!canRequestSubscription}
            />
            <SmartSelect
              value={subscriptionRequestForm.requestedTier}
              onChange={(value) =>
                setSubscriptionRequestForm((prev) => ({
                  ...prev,
                  requestedTier: value,
                }))
              }
              options={[
                { value: 'STARTER', label: t('tierStarter') },
                { value: 'BUSINESS', label: t('tierBusiness') },
                { value: 'ENTERPRISE', label: t('tierEnterprise') },
              ]}
              className="nvi-select-container"
              placeholder={t('selectTier')}
              isDisabled={
                subscriptionRequestForm.type === 'CANCEL' || !canRequestSubscription
              }
            />
            <input
              value={subscriptionRequestForm.reason}
              onChange={(event) =>
                setSubscriptionRequestForm((prev) => ({
                  ...prev,
                  reason: event.target.value,
                }))
              }
              placeholder={t('requestReason')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              disabled={!canRequestSubscription}
            />
          </div>
          <button
            type="button"
            onClick={submitSubscriptionRequest}
            disabled={isSubmittingRequest || !canRequestSubscription}
            title={!canRequestSubscription ? noAccess('title') : undefined}
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-70"
          >
            {isSubmittingRequest ? <Spinner size="xs" variant="orbit" /> : null}
            {isSubmittingRequest ? t('submitting') : t('sendRequest')}
          </button>
          <div className="space-y-2 text-xs text-gold-300">
            {subscriptionRequests.map((request) => (
              <div
                key={request.id}
                className="rounded border border-gold-700/40 bg-black/40 p-3"
              >
                <p className="text-gold-100">
                  {request.type}
                  {request.requestedTier ? ` • ${request.requestedTier}` : ''}
                </p>
                <p>{t('requestStatus', { value: request.status })}</p>
                {request.reason ? (
                  <p>{t('requestReasonLabel', { value: request.reason })}</p>
                ) : null}
                {request.responseNote ? (
                  <p>{t('requestResponse', { value: request.responseNote })}</p>
                ) : null}
                <p>{new Date(request.createdAt).toLocaleString()}</p>
              </div>
            ))}
            {!subscriptionRequests.length ? (
              <StatusBanner message={t('subscriptionRequestsEmpty')} />
            ) : null}
          </div>
        </div>
      ) : null}

      {!isLoading ? (
        <div className="command-card nvi-panel p-6 space-y-4 nvi-reveal">
          <div>
            <h3 className="text-lg font-semibold text-gold-100">
              {t('unitsTitle')}
            </h3>
            <p className="text-xs text-gold-400">
              {t('unitsSubtitle')}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input
              value={unitForm.label}
              onChange={(event) =>
                setUnitForm((prev) => ({ ...prev, label: event.target.value }))
              }
              placeholder={t('unitLabelPlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              disabled={!canWrite}
            />
            <input
              value={unitForm.code}
              onChange={(event) =>
                setUnitForm((prev) => ({
                  ...prev,
                  code: event.target.value.toUpperCase(),
                }))
              }
              placeholder={t('unitCodePlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              disabled={!canWrite}
            />
            <select
              value={unitForm.unitType}
              onChange={(event) =>
                setUnitForm((prev) => ({
                  ...prev,
                  unitType: event.target.value as Unit['unitType'],
                }))
              }
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              disabled={!canWrite}
            >
              {UNIT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={createUnit}
            disabled={
              isCreatingUnit || !unitForm.label || !unitForm.code || !canWrite
            }
            title={!canWrite ? noAccess('title') : undefined}
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-70"
          >
            {isCreatingUnit ? <Spinner size="xs" variant="orbit" /> : null}
            {isCreatingUnit ? t('creating') : t('addUnit')}
          </button>
          <div className="grid gap-2 text-xs text-gold-300">
            {units.length ? (
              units.map((unit) => (
                <div
                  key={unit.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-gold-700/40 bg-black/40 px-3 py-2"
                >
                  <span className="text-gold-100">{buildUnitLabel(unit)}</span>
                  <span>
                    {unit.unitType} •{' '}
                    {unit.businessId ? t('unitCustom') : t('unitGlobal')}
                  </span>
                </div>
              ))
            ) : (
              <StatusBanner message={t('unitsEmpty')} />
            )}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="command-card nvi-panel p-6 space-y-6 nvi-reveal">
          <Skeleton className="h-6 w-40" />
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
          <Skeleton className="h-6 w-44" />
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : draftSettings ? (
        <div className="command-card nvi-panel p-6 space-y-6 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gold-100">
                {t('defaultsTitle')}
              </h3>
              <p className="text-xs text-gold-400">
                {t('defaultsSubtitle')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isDirty ? (
                <span className="rounded-full border border-gold-500/60 px-3 py-1 text-xs text-gold-200">
                  {t('unsavedChanges')}
                </span>
              ) : null}
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftSettings(settings);
                      setIsEditing(false);
                      setMessage({ action: 'save', outcome: 'info', message: t('changesDiscarded') });
                    }}
                    disabled={!canWrite}
                    title={!canWrite ? noAccess('title') : undefined}
                    className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
                  >
                    {common('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={updateSettings}
                    disabled={isSaving || !isDirty || !canWrite}
                    title={!canWrite ? noAccess('title') : undefined}
                    className="nvi-cta rounded px-3 py-1 text-xs font-semibold text-black disabled:opacity-70"
                  >
                    <span className="inline-flex items-center gap-2">
                      {isSaving ? <Spinner variant="grid" size="xs" /> : null}
                      {isSaving ? t('saving') : t('saveSettings')}
                    </span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  disabled={!canWrite}
                  title={!canWrite ? noAccess('title') : undefined}
                  className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
                >
                  {t('editSettings')}
                </button>
              )}
            </div>
          </div>

          {!isEditing ? (
            <p className="text-xs text-gold-400">
              {t('readOnlyHint')}
            </p>
          ) : null}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gold-100">
              {t('approvalDefaultsTitle')}
            </h3>
            <div className="grid gap-3 text-sm text-gold-200">
              <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftSettings.approvalDefaults.stockAdjust}
                    disabled={!isEditing}
                    onChange={(event) =>
                      setDraftSettings({
                        ...draftSettings,
                        approvalDefaults: {
                          ...draftSettings.approvalDefaults,
                          stockAdjust: event.target.checked,
                        },
                      })
                    }
                  />
                  {t('approvalStockAdjust')}
                </label>
                <input
                  value={
                    draftSettings.approvalDefaults.stockAdjustThresholdAmount ??
                    ''
                  }
                  disabled={
                    !isEditing || !draftSettings.approvalDefaults.stockAdjust
                  }
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      approvalDefaults: {
                        ...draftSettings.approvalDefaults,
                        stockAdjustThresholdAmount: event.target.value
                          ? Number(event.target.value)
                          : null,
                      },
                    })
                  }
                  placeholder={t('stockAdjustThresholdAmount')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
              </div>
              <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftSettings.approvalDefaults.refund}
                    disabled={!isEditing}
                    onChange={(event) =>
                      setDraftSettings({
                        ...draftSettings,
                        approvalDefaults: {
                          ...draftSettings.approvalDefaults,
                          refund: event.target.checked,
                        },
                      })
                    }
                  />
                  {t('approvalRefund')}
                </label>
                <input
                  value={draftSettings.approvalDefaults.refundThresholdAmount ?? ''}
                  disabled={!isEditing || !draftSettings.approvalDefaults.refund}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      approvalDefaults: {
                        ...draftSettings.approvalDefaults,
                        refundThresholdAmount: event.target.value
                          ? Number(event.target.value)
                          : null,
                      },
                    })
                  }
                  placeholder={t('refundThresholdAmount')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
              </div>
              <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftSettings.approvalDefaults.purchase}
                    disabled={!isEditing}
                    onChange={(event) =>
                      setDraftSettings({
                        ...draftSettings,
                        approvalDefaults: {
                          ...draftSettings.approvalDefaults,
                          purchase: event.target.checked,
                        },
                      })
                    }
                  />
                  {t('approvalPurchase')}
                </label>
                <input
                  value={
                    draftSettings.approvalDefaults.purchaseThresholdAmount ?? ''
                  }
                  disabled={
                    !isEditing || !draftSettings.approvalDefaults.purchase
                  }
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      approvalDefaults: {
                        ...draftSettings.approvalDefaults,
                        purchaseThresholdAmount: event.target.value
                          ? Number(event.target.value)
                          : null,
                      },
                    })
                  }
                  placeholder={t('purchaseThresholdAmount')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
              </div>
              <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftSettings.approvalDefaults.transfer}
                    disabled={!isEditing}
                    onChange={(event) =>
                      setDraftSettings({
                        ...draftSettings,
                        approvalDefaults: {
                          ...draftSettings.approvalDefaults,
                          transfer: event.target.checked,
                        },
                      })
                    }
                  />
                  {t('approvalTransfer')}
                </label>
                <input
                  value={
                    draftSettings.approvalDefaults.transferThresholdAmount ?? ''
                  }
                  disabled={
                    !isEditing || !draftSettings.approvalDefaults.transfer
                  }
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      approvalDefaults: {
                        ...draftSettings.approvalDefaults,
                        transferThresholdAmount: event.target.value
                          ? Number(event.target.value)
                          : null,
                      },
                    })
                  }
                  placeholder={t('transferThresholdAmount')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
              </div>
              <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftSettings.approvalDefaults.expense}
                    disabled={!isEditing}
                    onChange={(event) =>
                      setDraftSettings({
                        ...draftSettings,
                        approvalDefaults: {
                          ...draftSettings.approvalDefaults,
                          expense: event.target.checked,
                        },
                      })
                    }
                  />
                  {t('approvalExpense')}
                </label>
                <input
                  value={
                    draftSettings.approvalDefaults.expenseThresholdAmount ?? ''
                  }
                  disabled={
                    !isEditing || !draftSettings.approvalDefaults.expense
                  }
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      approvalDefaults: {
                        ...draftSettings.approvalDefaults,
                        expenseThresholdAmount: event.target.value
                          ? Number(event.target.value)
                          : null,
                      },
                    })
                  }
                  placeholder={t('expenseThresholdAmount')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
              </div>
            </div>
            <div className="space-y-2 text-sm text-gold-200">
              <span className="text-xs uppercase tracking-[0.2em] text-gold-500">
                {t('discountThresholdsTitle')}
              </span>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={draftSettings.approvalDefaults.discountThresholdPercent}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      approvalDefaults: {
                        ...draftSettings.approvalDefaults,
                        discountThresholdPercent: Number(event.target.value),
                      },
                    })
                  }
                  placeholder={t('discountThresholdPercent')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                <input
                  value={
                    draftSettings.approvalDefaults.discountThresholdAmount ?? ''
                  }
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      approvalDefaults: {
                        ...draftSettings.approvalDefaults,
                        discountThresholdAmount: event.target.value
                          ? Number(event.target.value)
                          : null,
                      },
                    })
                  }
                  placeholder={t('discountThresholdAmount')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gold-100">
              {t('notificationChannelsTitle')}
            </h3>
            <p className="text-xs text-gold-400">{t('notificationChannelsHint')}</p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-gold-300">
              <span className="inline-flex items-center gap-2 rounded-full border border-gold-700/40 px-3 py-1">
                {t('inAppAlwaysOn')}
              </span>
              <span className="text-gold-500">{t('notificationPhoneRequired')}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-3 text-sm text-gold-200">
              {(['email', 'whatsapp'] as const).map((key) => {
                const isPremiumChannel = key !== 'email';
                const channelUnlocked =
                  !isPremiumChannel || subscription?.tier === 'ENTERPRISE';
                return (
                  <label key={key} className="flex items-center gap-2 capitalize">
                    <input
                      type="checkbox"
                      checked={draftSettings.notificationDefaults.channels[key]}
                      disabled={!isEditing || !channelUnlocked}
                      onChange={(event) =>
                        setDraftSettings({
                          ...draftSettings,
                          notificationDefaults: {
                            ...draftSettings.notificationDefaults,
                            channels: {
                              ...draftSettings.notificationDefaults.channels,
                              [key]: event.target.checked,
                            },
                          },
                        })
                      }
                    />
                    {t(`channel.${key}`)}
                    {!channelUnlocked ? (
                      <span className="text-xs text-gold-500">
                        {t('upgradeRequired')}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gold-100">
              {t('notificationRecipientsTitle')}
            </h3>
            <p className="text-xs text-gold-400">{t('notificationRecipientsHint')}</p>
            {(() => {
              const recipients = draftSettings.notificationDefaults.recipients;
              const globalRecipients = recipients.global;
              const emailUsesGlobal = recipients.email === null;
              const whatsappUsesGlobal = recipients.whatsapp === null;
              const isEnterprise = subscription?.tier === 'ENTERPRISE';

              const renderRecipientControls = (
                key: 'global' | 'email' | 'whatsapp',
                label: string,
                useGlobal?: boolean,
              ) => {
                const current = getRecipientGroup(key, draftSettings.notificationDefaults);
                const update = (patch: Partial<NotificationRecipientConfig>) => {
                  updateRecipientGroup(key, {
                    ...current,
                    ...patch,
                    branchScoped: globalRecipients.branchScoped,
                  });
                };
                return (
                  <div className="rounded border border-gold-700/30 bg-black/40 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gold-100">{label}</p>
                      {key !== 'global' ? (
                        <label className="flex items-center gap-2 text-xs text-gold-200">
                          <input
                            type="checkbox"
                            checked={useGlobal}
                            disabled={!isEditing}
                            onChange={(event) => {
                              if (event.target.checked) {
                                updateRecipientGroup(key, null);
                              } else {
                                updateRecipientGroup(key, {
                                  ...globalRecipients,
                                });
                              }
                            }}
                          />
                          {t('notificationRecipientsUseGlobal')}
                        </label>
                      ) : null}
                    </div>

                    {key === 'global' ? (
                      <div className="grid gap-2 md:grid-cols-3 text-xs text-gold-200">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={globalRecipients.branchScoped}
                            disabled={!isEditing}
                            onChange={(event) =>
                              setDraftSettings({
                                ...draftSettings,
                                notificationDefaults: {
                                  ...draftSettings.notificationDefaults,
                                  recipients: {
                                    ...recipients,
                                    global: {
                                      ...globalRecipients,
                                      branchScoped: event.target.checked,
                                    },
                                    email: recipients.email
                                      ? {
                                          ...recipients.email,
                                          branchScoped: event.target.checked,
                                        }
                                      : null,
                                    whatsapp: recipients.whatsapp
                                      ? {
                                          ...recipients.whatsapp,
                                          branchScoped: event.target.checked,
                                        }
                                      : null,
                                  },
                                },
                              })
                            }
                          />
                          {t('notificationBranchScoped')}
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={globalRecipients.includeOwners}
                            disabled={!isEditing}
                            onChange={(event) =>
                              updateRecipientGroup('global', {
                                ...globalRecipients,
                                includeOwners: event.target.checked,
                              })
                            }
                          />
                          {t('notificationIncludeOwners')}
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={globalRecipients.includeManagers}
                            disabled={!isEditing}
                            onChange={(event) =>
                              updateRecipientGroup('global', {
                                ...globalRecipients,
                                includeManagers: event.target.checked,
                              })
                            }
                          />
                          {t('notificationIncludeManagers')}
                        </label>
                      </div>
                    ) : null}

                    {(key === 'global' || !useGlobal) && (
                      <div className="grid gap-3 md:grid-cols-2 text-xs text-gold-300">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-gold-200">
                            {t('notificationRolesLabel')}
                          </p>
                          {roles.length === 0 ? (
                            <p className="text-gold-500">{t('notificationNoRoles')}</p>
                          ) : (
                            <div className="grid gap-2 md:grid-cols-2">
                              {roles
                                .filter((role) => role.name !== 'System Owner')
                                .map((role) => {
                                  const isChecked = current.roleIds.includes(role.id);
                                  return (
                                    <label
                                      key={`${key}-role-${role.id}`}
                                      className="flex items-center gap-2"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={!isEditing}
                                        onChange={(event) => {
                                          const nextRoles = event.target.checked
                                            ? [...current.roleIds, role.id]
                                            : current.roleIds.filter(
                                                (id) => id !== role.id,
                                              );
                                          update({
                                            roleIds: nextRoles,
                                          });
                                        }}
                                      />
                                      <span>{role.name}</span>
                                    </label>
                                  );
                                })}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-gold-200">
                            {t('notificationUsersLabel')}
                          </p>
                          {users.length === 0 ? (
                            <p className="text-gold-500">{t('notificationNoUsers')}</p>
                          ) : (
                            <div className="max-h-40 space-y-2 overflow-y-auto pr-2">
                              {users.map((user) => {
                                const isChecked = current.userIds.includes(user.id);
                                return (
                                  <label
                                    key={`${key}-user-${user.id}`}
                                    className="flex items-center gap-2"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      disabled={!isEditing}
                                      onChange={(event) => {
                                        const nextUsers = event.target.checked
                                          ? [...current.userIds, user.id]
                                          : current.userIds.filter(
                                              (id) => id !== user.id,
                                            );
                                        update({
                                          userIds: nextUsers,
                                        });
                                      }}
                                    />
                                    <span className="truncate">
                                      {user.name || user.email}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <div className="space-y-3">
                  {renderRecipientControls('global', t('notificationRecipientsGlobal'))}
                  {renderRecipientControls(
                    'email',
                    t('notificationRecipientsEmail'),
                    emailUsesGlobal,
                  )}
                  {isEnterprise ? (
                    renderRecipientControls(
                      'whatsapp',
                      t('notificationRecipientsWhatsapp'),
                      whatsappUsesGlobal,
                    )
                  ) : (
                    <div className="rounded border border-gold-700/30 bg-black/40 p-4 text-xs text-gold-500">
                      {t('notificationWhatsappEnterprise')}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gold-100">
              {t('notificationEventsTitle')}
            </h3>
            <p className="text-xs text-gold-400">{t('notificationEventsHint')}</p>
            <div className="space-y-3">
              {(Object.keys(NOTIFICATION_GROUPS) as NotificationGroupKey[]).map(
                (groupKey) => {
                  const groupEvents = NOTIFICATION_GROUPS[groupKey];
                  const groupChannels =
                    draftSettings.notificationDefaults.groups[groupKey].channels;
                  const isEnterprise = subscription?.tier === 'ENTERPRISE';
                  return (
                    <div
                      key={groupKey}
                      className="rounded border border-gold-700/30 bg-black/40 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gold-100">
                            {t(`notificationGroup.${groupKey}`)}
                          </p>
                          <p className="text-xs text-gold-400">
                            {t(`notificationGroupHint.${groupKey}`)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gold-200">
                          {(['email', 'whatsapp'] as const).map((channel) => {
                            const channelUnlocked =
                              channel === 'email' ? true : isEnterprise;
                            const globalEnabled =
                              draftSettings.notificationDefaults.channels[channel];
                            const isDisabled =
                              !isEditing || !channelUnlocked || !globalEnabled;
                            return (
                              <label
                                key={`${groupKey}-${channel}`}
                                className="flex items-center gap-2 capitalize"
                              >
                                <input
                                  type="checkbox"
                                  checked={groupChannels[channel]}
                                  disabled={isDisabled}
                                  onChange={(event) =>
                                    setDraftSettings({
                                      ...draftSettings,
                                      notificationDefaults: {
                                        ...draftSettings.notificationDefaults,
                                        groups: {
                                          ...draftSettings.notificationDefaults.groups,
                                          [groupKey]: {
                                            channels: {
                                              ...groupChannels,
                                              [channel]: event.target.checked,
                                            },
                                          },
                                        },
                                      },
                                    })
                                  }
                                />
                                {t(`channel.${channel}`)}
                                {!channelUnlocked ? (
                                  <span className="text-xs text-gold-500">
                                    {t('upgradeRequired')}
                                  </span>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 text-xs text-gold-200">
                        {groupEvents.map((eventKey) => {
                          const eventConfig =
                            draftSettings.notificationDefaults.events[eventKey];
                          return (
                            <label
                              key={`${groupKey}-${eventKey}`}
                              className="flex items-center justify-between gap-2 rounded border border-gold-700/30 bg-black/30 px-3 py-2"
                            >
                              <div>
                                <p className="text-sm text-gold-100">
                                  {eventLabels(eventKey)}
                                </p>
                                <p className="text-[10px] text-gold-500">
                                  {eventLabels(`${eventKey}Hint`)}
                                </p>
                              </div>
                              <input
                                type="checkbox"
                                checked={eventConfig.enabled}
                                disabled={!isEditing}
                                onChange={(event) =>
                                  setDraftSettings({
                                    ...draftSettings,
                                    notificationDefaults: {
                                      ...draftSettings.notificationDefaults,
                                      events: {
                                        ...draftSettings.notificationDefaults.events,
                                        [eventKey]: {
                                          ...eventConfig,
                                          enabled: event.target.checked,
                                        },
                                      },
                                    },
                                  })
                                }
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gold-100">
              {t('localizationTitle')}
            </h3>
            <div className="grid gap-3 md:grid-cols-3 text-sm text-gold-200">
              <label className="flex flex-col gap-1">
                {t('offlinePriceVariance')}
                <input
                  type="number"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.posPolicies.offlinePriceVariancePercent}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        offlinePriceVariancePercent: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('currencyCode')}
                <input
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.localeSettings.currency}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      localeSettings: {
                        ...draftSettings.localeSettings,
                        currency: event.target.value.toUpperCase(),
                      },
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('timezone')}
                <input
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.localeSettings.timezone}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      localeSettings: {
                        ...draftSettings.localeSettings,
                        timezone: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('dateFormat')}
                <input
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.localeSettings.dateFormat}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      localeSettings: {
                        ...draftSettings.localeSettings,
                        dateFormat: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <p className="text-xs text-gold-400">
              {t('localizationHint')}
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gold-100">
              {t('stockPoliciesTitle')}
            </h3>
            <div className="grid gap-3 md:grid-cols-2 text-sm text-gold-200">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftSettings.stockPolicies.negativeStockAllowed}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      stockPolicies: {
                        ...draftSettings.stockPolicies,
                        negativeStockAllowed: event.target.checked,
                      },
                    })
                  }
                />
                {t('allowNegativeStock')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftSettings.stockPolicies.batchTrackingEnabled}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      stockPolicies: {
                        ...draftSettings.stockPolicies,
                        batchTrackingEnabled: event.target.checked,
                      },
                    })
                  }
                />
                {t('enableBatchTracking')}
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3 text-sm text-gold-200">
              <label className="flex flex-col gap-1">
                {t('fifoFefo')}
                <SmartSelect
                  value={draftSettings.stockPolicies.fifoMode}
                  isDisabled={!isEditing}
                  onChange={(value) =>
                    setDraftSettings({
                      ...draftSettings,
                      stockPolicies: {
                        ...draftSettings.stockPolicies,
                        fifoMode: value as 'FIFO' | 'FEFO',
                      },
                    })
                  }
                  options={[
                    { value: 'FIFO', label: t('fifo') },
                    { value: 'FEFO', label: t('fefo') },
                  ]}
                  className="nvi-select-container"
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('valuationMethod')}
                <SmartSelect
                  value={draftSettings.stockPolicies.valuationMethod}
                  isDisabled={!isEditing}
                  onChange={(value) =>
                    setDraftSettings({
                      ...draftSettings,
                      stockPolicies: {
                        ...draftSettings.stockPolicies,
                        valuationMethod: value as 'FIFO' | 'LIFO' | 'AVERAGE',
                      },
                    })
                  }
                  options={[
                    { value: 'FIFO', label: t('valuationFifo') },
                    { value: 'LIFO', label: t('valuationLifo') },
                    { value: 'AVERAGE', label: t('valuationAverage') },
                  ]}
                  className="nvi-select-container"
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('expiryPolicy')}
                <SmartSelect
                  value={draftSettings.stockPolicies.expiryPolicy}
                  isDisabled={!isEditing}
                  onChange={(value) =>
                    setDraftSettings({
                      ...draftSettings,
                      stockPolicies: {
                        ...draftSettings.stockPolicies,
                        expiryPolicy: value as 'ALLOW' | 'WARN' | 'BLOCK',
                      },
                    })
                  }
                  options={[
                    { value: 'ALLOW', label: t('expiryAllow') },
                    { value: 'WARN', label: t('expiryWarn') },
                    { value: 'BLOCK', label: t('expiryBlock') },
                  ]}
                  className="nvi-select-container"
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('expiryAlertDays')}
                <input
                  type="number"
                  min={1}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.stockPolicies.expiryAlertDays}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      stockPolicies: {
                        ...draftSettings.stockPolicies,
                        expiryAlertDays: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('transferBatchPolicy')}
                <SmartSelect
                  value={draftSettings.stockPolicies.transferBatchPolicy}
                  isDisabled={!isEditing}
                  onChange={(value) =>
                    setDraftSettings({
                      ...draftSettings,
                      stockPolicies: {
                        ...draftSettings.stockPolicies,
                        transferBatchPolicy: value as 'PRESERVE' | 'RECREATE',
                      },
                    })
                  }
                  options={[
                    { value: 'PRESERVE', label: t('transferPreserve') },
                    { value: 'RECREATE', label: t('transferRecreate') },
                  ]}
                  className="nvi-select-container"
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('lowStockThreshold')}
                <input
                  type="number"
                  min={0}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.stockPolicies.lowStockThreshold}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      stockPolicies: {
                        ...draftSettings.stockPolicies,
                        lowStockThreshold: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
            <p className="text-xs text-gold-400">
              {t('stockPoliciesHint')}
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gold-100">
              {t('posPoliciesTitle')}
            </h3>
            <div className="grid gap-3 md:grid-cols-2 text-sm text-gold-200">
              <label className="flex flex-col gap-1">
                {t('receiptTemplate')}
                <SmartSelect
                  value={draftSettings.posPolicies.receiptTemplate}
                  isDisabled={!isEditing}
                  onChange={(value) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        receiptTemplate: value as 'THERMAL' | 'A4',
                      },
                    })
                  }
                  options={[
                    { value: 'THERMAL', label: t('receiptThermal') },
                    { value: 'A4', label: t('receiptA4') },
                  ]}
                  className="nvi-select-container"
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftSettings.posPolicies.showBranchContact}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        showBranchContact: event.target.checked,
                      },
                    })
                  }
                />
                {t('showBranchContact')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftSettings.posPolicies.creditEnabled}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        creditEnabled: event.target.checked,
                      },
                    })
                  }
                />
                {t('allowCredit')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftSettings.posPolicies.shiftTrackingEnabled}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        shiftTrackingEnabled: event.target.checked,
                      },
                    })
                  }
                />
                {t('requireShift')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftSettings.posPolicies.refundReturnToStockDefault}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        refundReturnToStockDefault: event.target.checked,
                      },
                    })
                  }
                />
                {t('refundReturnStock')}
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2 text-sm text-gold-200">
              <label className="flex flex-col gap-1 md:col-span-2">
                {t('receiptHeader')}
                <input
                  type="text"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.posPolicies.receiptHeader}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        receiptHeader: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                {t('receiptFooter')}
                <input
                  type="text"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.posPolicies.receiptFooter}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        receiptFooter: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('shiftVariance')}
                <input
                  type="number"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.posPolicies.shiftVarianceThreshold}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        shiftVarianceThreshold: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('discountThresholdPercent')}
                <input
                  type="number"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.posPolicies.discountThresholdPercent}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        discountThresholdPercent: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('discountThresholdAmount')}
                <input
                  type="number"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.posPolicies.discountThresholdAmount}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        discountThresholdAmount: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3 text-sm text-gold-200">
              <label className="flex flex-col gap-1">
                {t('offlineDuration')}
                <input
                  type="number"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.posPolicies.offlineLimits.maxDurationHours}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        offlineLimits: {
                          ...draftSettings.posPolicies.offlineLimits,
                          maxDurationHours: Number(event.target.value),
                        },
                      },
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('offlineMaxSales')}
                <input
                  type="number"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.posPolicies.offlineLimits.maxSalesCount}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        offlineLimits: {
                          ...draftSettings.posPolicies.offlineLimits,
                          maxSalesCount: Number(event.target.value),
                        },
                      },
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('offlineMaxTotal')}
                <input
                  type="number"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  value={draftSettings.posPolicies.offlineLimits.maxTotalValue}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      posPolicies: {
                        ...draftSettings.posPolicies,
                        offlineLimits: {
                          ...draftSettings.posPolicies.offlineLimits,
                          maxTotalValue: Number(event.target.value),
                        },
                      },
                    })
                  }
                />
              </label>
            </div>
          </div>
        </div>
      ) : null}

      <div className="command-card nvi-panel p-6 space-y-4 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">
          {t('supportRequestsTitle')}
        </h3>
        <div className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : supportRequests.length === 0 ? (
            <StatusBanner message={t('supportRequestsEmpty')} />
          ) : (
            supportRequests.map((request) => (
              <div
                key={request.id}
                className="flex flex-col gap-2 rounded border border-gold-700/40 bg-black/40 p-3 text-sm text-gold-200 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p>{t('requestReasonLabel', { value: request.reason })}</p>
                  <p className="text-xs text-gold-400">
                    {t('requestStatus', { value: request.status })}
                  </p>
                  <p className="text-xs text-gold-400">
                    {t('requestScope', {
                      value:
                        request.scope?.length
                          ? request.scope.join(', ')
                          : t('requestScopeAll'),
                    })}
                  </p>
                  {request.durationHours ? (
                    <p className="text-xs text-gold-400">
                      {t('requestDuration', { value: request.durationHours })}
                    </p>
                  ) : null}
                </div>
                {request.status === 'PENDING' ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        resolveSupportRequest(request.id, 'approve')
                      }
                      disabled={!canWrite}
                      title={!canWrite ? noAccess('title') : undefined}
                      className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                    >
                      {actions('approve')}
                    </button>
                    <button
                      onClick={() =>
                        resolveSupportRequest(request.id, 'reject')
                      }
                      disabled={!canWrite}
                      title={!canWrite ? noAccess('title') : undefined}
                      className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                    >
                      {actions('reject')}
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded border border-red-500/40 bg-black/50 p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-red-200">
            {t('deleteBusinessTitle')}
          </h3>
          <p className="text-sm text-red-300">{t('deleteBusinessSubtitle')}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3 text-sm text-gold-200">
          <input
            value={deleteForm.businessId}
            onChange={(event) =>
              setDeleteForm({ ...deleteForm, businessId: event.target.value })
            }
            placeholder={t('deleteBusinessIdPlaceholder')}
            className="rounded border border-red-500/40 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={deleteForm.password}
            onChange={(event) =>
              setDeleteForm({ ...deleteForm, password: event.target.value })
            }
            placeholder={t('deletePasswordPlaceholder')}
            type="password"
            className="rounded border border-red-500/40 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={deleteForm.confirmText}
            onChange={(event) =>
              setDeleteForm({ ...deleteForm, confirmText: event.target.value })
            }
            placeholder={t('deleteConfirmPlaceholder')}
            className="rounded border border-red-500/40 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        <p className="text-xs text-red-300">{t('deleteBusinessHint')}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={deleteBusiness}
            disabled={!canDeleteBusiness || isDeletingBusiness}
            title={!canDeleteBusiness ? noAccess('title') : undefined}
            className="rounded bg-red-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              {isDeletingBusiness ? <Spinner variant="dots" size="xs" /> : null}
              {isDeletingBusiness ? t('deleting') : t('deleteBusinessAction')}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
