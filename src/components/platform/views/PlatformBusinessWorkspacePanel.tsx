import type { Dispatch, SetStateAction } from 'react';
import Link from 'next/link';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';
import { Doughnut, Line } from 'react-chartjs-2';

type WorkspaceTab =
  | 'SUMMARY'
  | 'SUBSCRIPTION'
  | 'RISK_STATUS'
  | 'ACCESS'
  | 'DEVICES'
  | 'DANGER';

type Business = {
  id: string;
  name: string;
  status: string;
  underReview?: boolean | null;
  subscription?: {
    tier: string;
    status: string;
    trialEndsAt?: string | null;
    graceEndsAt?: string | null;
    expiresAt?: string | null;
  } | null;
  counts?: { branches: number; users: number; offlineDevices: number };
};

type BusinessWorkspace = {
  business: { status: string };
  subscription?: { tier?: string | null } | null;
  counts?: { branches: number; users: number; offlineDevices: number };
  risk?: { score?: number } | null;
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
    createdAt: string;
  }[];
  generatedAt?: string;
};

type SubscriptionEdit = {
  tier: string;
  status: string;
  reason: string;
  startsAt?: string;
  trialEndsAt: string;
  graceEndsAt: string;
  expiresAt: string;
  durationDays?: string;
};

type ReadOnlyEdit = { enabled: boolean; reason: string };
type StatusEdit = { status: string; reason: string };
type ReviewEdit = { underReview: boolean; reason: string; severity: string };

type SeverityOption = { value: string; label: string };

type TrendPoint = { label: string; offlineFailed: number; exportsPending: number };

type Device = { id: string; deviceName?: string | null; status: string };
type BusinessAction =
  | 'SUSPEND'
  | 'READ_ONLY'
  | 'FORCE_LOGOUT'
  | 'ARCHIVE'
  | 'DELETE_READY'
  | 'RESTORE'
  | 'PURGE';

function defaultSubscriptionEdit(): SubscriptionEdit {
  return {
    tier: 'BUSINESS',
    status: 'TRIAL',
    reason: '',
    startsAt: '',
    trialEndsAt: '',
    graceEndsAt: '',
    expiresAt: '',
    durationDays: '',
  };
}

function defaultStatusEdit(status: string): StatusEdit {
  return { status, reason: '' };
}

function defaultReviewEdit(): ReviewEdit {
  return { underReview: false, reason: '', severity: 'MEDIUM' };
}

function defaultReadOnlyEdit(): ReadOnlyEdit {
  return { enabled: false, reason: '' };
}

export function PlatformBusinessWorkspacePanel({
  show,
  t,
  locale,
  openedBusiness,
  openedBusinessWorkspace,
  loadingBusinessWorkspace,
  businessDrawerTab,
  setBusinessDrawerTab,
  withAction,
  actionLoading,
  loadBusinessWorkspace,
  loadBusinessHealth,
  healthMap,
  getBusinessRiskScore,
  businessTrendRange,
  setBusinessTrendRange,
  businessTrendSeries,
  formatDateLabel,
  getDaysRemaining,
  subscriptionEdits,
  setSubscriptionEdits,
  updateSubscription,
  recordSubscriptionPurchase,
  resetSubscriptionLimits,
  statusEdits,
  setStatusEdits,
  updateStatus,
  reviewEdits,
  setReviewEdits,
  incidentSeverityOptions,
  updateReview,
  supportNotes,
  setSupportNotes,
  readOnlyEdits,
  setReadOnlyEdits,
  updateReadOnly,
  openBusinessActionModal,
  exportOnExit,
  deviceRevokeReason,
  setDeviceRevokeReason,
  loadDevices,
  devicesMap,
  loadingDevices,
  revokeDevice,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  locale: string;
  openedBusiness: Business | null;
  openedBusinessWorkspace: BusinessWorkspace | null;
  loadingBusinessWorkspace: Record<string, boolean>;
  businessDrawerTab: WorkspaceTab;
  setBusinessDrawerTab: Dispatch<SetStateAction<WorkspaceTab>>;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  actionLoading: Record<string, boolean>;
  loadBusinessWorkspace: (businessId: string) => Promise<void>;
  loadBusinessHealth: (businessId: string) => Promise<void>;
  healthMap: Record<string, { score: number }>;
  getBusinessRiskScore: (business: Business) => number;
  businessTrendRange: '7d' | '30d';
  setBusinessTrendRange: Dispatch<SetStateAction<'7d' | '30d'>>;
  businessTrendSeries: TrendPoint[];
  formatDateLabel: (value?: string | null) => string;
  getDaysRemaining: (value?: string | null) => number | null;
  subscriptionEdits: Record<string, SubscriptionEdit>;
  setSubscriptionEdits: Dispatch<SetStateAction<Record<string, SubscriptionEdit>>>;
  updateSubscription: (businessId: string) => Promise<void>;
  recordSubscriptionPurchase: (businessId: string) => Promise<void>;
  resetSubscriptionLimits: (businessId: string) => Promise<void>;
  statusEdits: Record<string, StatusEdit>;
  setStatusEdits: Dispatch<SetStateAction<Record<string, StatusEdit>>>;
  updateStatus: (businessId: string) => Promise<void>;
  reviewEdits: Record<string, ReviewEdit>;
  setReviewEdits: Dispatch<SetStateAction<Record<string, ReviewEdit>>>;
  incidentSeverityOptions: SeverityOption[];
  updateReview: (
    businessId: string,
    options?: { underReview: boolean; reason: string; severity: string },
  ) => Promise<void>;
  supportNotes: Record<string, string>;
  setSupportNotes: Dispatch<SetStateAction<Record<string, string>>>;
  readOnlyEdits: Record<string, ReadOnlyEdit>;
  setReadOnlyEdits: Dispatch<SetStateAction<Record<string, ReadOnlyEdit>>>;
  updateReadOnly: (businessId: string) => Promise<void>;
  openBusinessActionModal: (businessId: string, action: BusinessAction) => void;
  exportOnExit: (businessId: string) => Promise<void>;
  deviceRevokeReason: string;
  setDeviceRevokeReason: Dispatch<SetStateAction<string>>;
  loadDevices: (businessId: string) => Promise<void>;
  devicesMap: Record<string, Device[]>;
  loadingDevices: Record<string, boolean>;
  revokeDevice: (deviceId: string, businessId: string, reason?: string) => Promise<void>;
}) {
  if (!show) {
    return null;
  }

  return (
    <aside className="rounded border border-gold-700/40 bg-black/40 p-4 space-y-4">
      {!openedBusiness ? (
        <p className="text-sm text-gold-400">{t('selectBusinessDetails')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-gold-100">{openedBusiness.name}</p>
              <p className="text-xs text-gold-500">{openedBusiness.id}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  withAction(`business:workspace:${openedBusiness.id}`, () =>
                    loadBusinessWorkspace(openedBusiness.id),
                  )
                }
                className="rounded border border-gold-700/60 px-2 py-1 text-xs text-gold-100"
              >
                <span className="inline-flex items-center gap-2">
                  {actionLoading[`business:workspace:${openedBusiness.id}`] ? (
                    <Spinner size="xs" variant="grid" />
                  ) : null}
                  {t('refreshWorkspace')}
                </span>
              </button>
              <Link
                href={`/${locale}/platform/businesses`}
                className="rounded border border-gold-700/60 px-2 py-1 text-xs text-gold-100"
              >
                {t('backToRegistry')}
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { value: 'SUMMARY', label: t('workspaceTabSummary') },
              { value: 'SUBSCRIPTION', label: t('workspaceTabSubscription') },
              { value: 'RISK_STATUS', label: t('workspaceTabRiskStatus') },
              { value: 'ACCESS', label: t('workspaceTabAccess') },
              { value: 'DEVICES', label: t('workspaceTabDevices') },
              { value: 'DANGER', label: t('workspaceTabDanger') },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setBusinessDrawerTab(tab.value as WorkspaceTab)}
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
              <div className="flex items-center justify-between rounded border border-gold-700/30 bg-black/20 px-3 py-2 text-[11px] text-gold-400">
                <span>
                  {t('workspaceSnapshotAt', {
                    value: openedBusinessWorkspace?.generatedAt
                      ? new Date(openedBusinessWorkspace.generatedAt).toLocaleString(
                          locale,
                        )
                      : t('notAvailable'),
                  })}
                </span>
                {loadingBusinessWorkspace[openedBusiness.id] ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size="xs" variant="grid" />
                    {t('loading')}
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="nvi-tile p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
                    {t('tableStatus')}
                  </p>
                  <p className="mt-1 text-sm text-gold-100">
                    {openedBusinessWorkspace?.business.status ?? openedBusiness.status}
                  </p>
                </div>
                <div className="nvi-tile p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
                    {t('tableTier')}
                  </p>
                  <p className="mt-1 text-sm text-gold-100">
                    {openedBusinessWorkspace?.subscription?.tier ??
                      openedBusiness.subscription?.tier ??
                      t('notAvailable')}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border border-gold-700/40 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
                    {t('businessHealthScoreTitle')}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div
                      className="h-14 w-14 rounded-full"
                      style={{
                        background: `conic-gradient(#f59e0b ${Math.max(
                          0,
                          Math.min(
                            100,
                            openedBusinessWorkspace?.risk?.score ??
                              healthMap[openedBusiness.id]?.score ??
                              0,
                          ),
                        )}%, rgba(245,158,11,0.15) 0)`,
                      }}
                    >
                      <div className="m-[4px] flex h-[48px] w-[48px] items-center justify-center rounded-full bg-black text-xs text-gold-100">
                        {Math.max(
                          0,
                          Math.min(
                            100,
                            openedBusinessWorkspace?.risk?.score ??
                              healthMap[openedBusiness.id]?.score ??
                              0,
                          ),
                        )}
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
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
                    {t('businessRiskScoreTitle')}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div
                      className="h-14 w-14 rounded-full"
                      style={{
                        background: `conic-gradient(#f97316 ${openedBusinessWorkspace?.risk?.score ?? getBusinessRiskScore(
                          openedBusiness,
                        )}%, rgba(249,115,22,0.15) 0)`,
                      }}
                    >
                      <div className="m-[4px] flex h-[48px] w-[48px] items-center justify-center rounded-full bg-black text-xs text-gold-100">
                        {openedBusinessWorkspace?.risk?.score ?? getBusinessRiskScore(openedBusiness)}
                      </div>
                    </div>
                    <p className="text-xs text-gold-300">
                      {openedBusiness.underReview ? t('businessRiskFlagged') : t('businessRiskClear')}
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded border border-gold-700/40 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
                    {t('workspaceQueueSupport')}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gold-100">
                    {openedBusinessWorkspace?.queues?.pendingSupport ?? 0}
                  </p>
                </div>
                <div className="rounded border border-gold-700/40 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
                    {t('workspaceQueueExports')}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gold-100">
                    {openedBusinessWorkspace?.queues?.pendingExports ?? 0}
                  </p>
                </div>
                <div className="rounded border border-gold-700/40 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
                    {t('workspaceQueueSubscriptions')}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gold-100">
                    {openedBusinessWorkspace?.queues?.pendingSubscriptionRequests ?? 0}
                  </p>
                </div>
              </div>
              <div className="rounded border border-gold-700/40 bg-black/30 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
                  {t('workspaceOperationalComposition')}
                </p>
                <div className="mt-2 max-w-[260px]">
                  <Doughnut
                    data={{
                      labels: [
                        t('workspaceBranches'),
                        t('workspaceUsers'),
                        t('workspaceOfflineDevices'),
                      ],
                      datasets: [
                        {
                          data: [
                            openedBusinessWorkspace?.counts?.branches ??
                              openedBusiness.counts?.branches ??
                              0,
                            openedBusinessWorkspace?.counts?.users ??
                              openedBusiness.counts?.users ??
                              0,
                            openedBusinessWorkspace?.counts?.offlineDevices ??
                              openedBusiness.counts?.offlineDevices ??
                              0,
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
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
                    {t('workspaceRecentAdminActions')}
                  </p>
                  <span className="text-[11px] text-gold-500">
                    {openedBusinessWorkspace?.recentAdminActions?.length ?? 0}
                  </span>
                </div>
                {openedBusinessWorkspace?.recentAdminActions?.length ? (
                  <div className="space-y-1">
                    {openedBusinessWorkspace.recentAdminActions.slice(0, 5).map((entry) => (
                      <p key={entry.id} className="text-[11px] text-gold-300">
                        {entry.action} • {entry.outcome} •{' '}
                        {new Date(entry.createdAt).toLocaleString(locale)}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gold-500">{t('workspaceNoRecentActions')}</p>
                )}
              </div>
              <div className="rounded border border-gold-700/40 bg-black/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
                    {t('workspaceActivityTrend')}
                  </p>
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
                          label: t('workspaceTrendOfflineFailures'),
                          data: businessTrendSeries.map((point) => point.offlineFailed),
                          borderColor: '#f97316',
                          backgroundColor: 'rgba(249, 115, 22, 0.25)',
                          fill: true,
                          tension: 0.3,
                        },
                        {
                          label: t('workspaceTrendPendingExports'),
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
                  <p className="text-xs text-gold-500">{t('workspaceNoTrendData')}</p>
                )}
              </div>
            </div>
          ) : null}

          {businessDrawerTab === 'SUBSCRIPTION' ? (
            <div className="space-y-3">
              <div className="rounded border border-gold-700/40 bg-black/30 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">
                  {t('subscriptionCurrentState')}
                </p>
                <p className="mt-1 text-sm text-gold-100">
                  {t('subscriptionCurrentStateValue', {
                    tier: openedBusiness.subscription?.tier ?? t('notAvailable'),
                    status: openedBusiness.subscription?.status ?? t('notAvailable'),
                  })}
                </p>
              </div>
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

              <div className="rounded border border-gold-700/40 bg-black/30 p-3 space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">
                    {t('recordPurchaseTitle')}
                  </p>
                  <p className="text-xs text-gold-300">{t('recordPurchaseHint')}</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <SmartSelect
                    value={subscriptionEdits[openedBusiness.id]?.tier ?? 'BUSINESS'}
                    onChange={(value) =>
                      setSubscriptionEdits((prev) => ({
                        ...prev,
                        [openedBusiness.id]: {
                          ...(prev[openedBusiness.id] ?? defaultSubscriptionEdit()),
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
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={subscriptionEdits[openedBusiness.id]?.durationDays ?? ''}
                    onChange={(event) =>
                      setSubscriptionEdits((prev) => ({
                        ...prev,
                        [openedBusiness.id]: {
                          ...(prev[openedBusiness.id] ?? defaultSubscriptionEdit()),
                          durationDays: event.target.value,
                        },
                      }))
                    }
                    placeholder={t('subscriptionDurationPlaceholder')}
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <input
                    type="datetime-local"
                    value={subscriptionEdits[openedBusiness.id]?.startsAt ?? ''}
                    onChange={(event) =>
                      setSubscriptionEdits((prev) => ({
                        ...prev,
                        [openedBusiness.id]: {
                          ...(prev[openedBusiness.id] ?? defaultSubscriptionEdit()),
                          startsAt: event.target.value,
                        },
                      }))
                    }
                    placeholder={t('purchaseStartsAtOptional')}
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <input
                    value={subscriptionEdits[openedBusiness.id]?.reason ?? ''}
                    onChange={(event) =>
                      setSubscriptionEdits((prev) => ({
                        ...prev,
                        [openedBusiness.id]: {
                          ...(prev[openedBusiness.id] ?? defaultSubscriptionEdit()),
                          reason: event.target.value,
                        },
                      }))
                    }
                    placeholder={t('subscriptionReasonPlaceholder')}
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    withAction(`subscription:purchase:${openedBusiness.id}`, () =>
                      recordSubscriptionPurchase(openedBusiness.id),
                    )
                  }
                  className="rounded bg-gold-500 px-3 py-2 text-xs font-semibold text-black"
                >
                  {t('recordPurchase')}
                </button>
              </div>

              <details className="rounded border border-gold-700/40 bg-black/20 p-3">
                <summary className="cursor-pointer text-xs uppercase tracking-[0.2em] text-gold-400">
                  {t('advancedSubscriptionControls')}
                </summary>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <SmartSelect
                    value={subscriptionEdits[openedBusiness.id]?.status ?? 'TRIAL'}
                    onChange={(value) =>
                      setSubscriptionEdits((prev) => ({
                        ...prev,
                        [openedBusiness.id]: {
                          ...(prev[openedBusiness.id] ?? defaultSubscriptionEdit()),
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
                          ...(prev[openedBusiness.id] ?? defaultSubscriptionEdit()),
                          reason: event.target.value,
                        },
                      }))
                    }
                    placeholder={t('subscriptionReasonPlaceholder')}
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <div className="flex gap-2 md:col-span-2">
                    <button
                      type="button"
                      onClick={() =>
                        withAction(`subscription:update:${openedBusiness.id}`, () =>
                          updateSubscription(openedBusiness.id),
                        )
                      }
                      className="flex-1 rounded border border-gold-700/60 px-3 py-2 text-xs text-gold-100"
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
              </details>
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
                        ...(prev[openedBusiness.id] ?? defaultStatusEdit(openedBusiness.status)),
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
                        ...(prev[openedBusiness.id] ?? defaultStatusEdit(openedBusiness.status)),
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
                          ...(prev[openedBusiness.id] ?? defaultReviewEdit()),
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
                        ...(prev[openedBusiness.id] ?? defaultReviewEdit()),
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
                        ...(prev[openedBusiness.id] ?? defaultReviewEdit()),
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
                          ...(prev[openedBusiness.id] ?? defaultReadOnlyEdit()),
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
                        ...(prev[openedBusiness.id] ?? defaultReadOnlyEdit()),
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
                  onClick={() => openBusinessActionModal(openedBusiness.id, 'FORCE_LOGOUT')}
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
              {(devicesMap[openedBusiness.id] ?? openedBusinessWorkspace?.devices ?? []).length ? (
                <div className="space-y-2">
                  {(devicesMap[openedBusiness.id] ?? openedBusinessWorkspace?.devices ?? []).map((device) => (
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
                              revokeDevice(device.id, openedBusiness.id, deviceRevokeReason),
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
                <p className="text-xs text-gold-500">{t('workspaceNoDevicesLoaded')}</p>
              )}
            </div>
          ) : null}

          {businessDrawerTab === 'DANGER' ? (
            <div className="space-y-2">
              <p className="text-xs text-gold-400">{t('dangerZoneHint')}</p>
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
                  onClick={() => openBusinessActionModal(openedBusiness.id, 'DELETE_READY')}
                  className="rounded border border-red-500/60 px-3 py-2 text-xs text-red-200"
                >
                  {t('markDeleteReady')}
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
  );
}
