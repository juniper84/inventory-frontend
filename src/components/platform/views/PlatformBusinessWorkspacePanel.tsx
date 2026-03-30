import type { Dispatch, SetStateAction } from 'react';
import Link from 'next/link';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';
import { formatEnum } from '@/lib/format-enum';

type WorkspaceTab =
  | 'OVERVIEW'
  | 'MANAGE'
  | 'NOTES'
  | 'DEVICES'
  | 'ACTIONS';

type BusinessNote = {
  id: string;
  body: string;
  createdAt: string;
  platformAdmin: { id: string; email: string };
};

type ScheduledAction = {
  id: string;
  actionType: string;
  payload: Record<string, unknown>;
  scheduledFor: string;
  createdAt: string;
  platformAdmin: { id: string; email: string };
};

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
  systemOwner?: { name: string; email: string; phone: string | null } | null;
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
  months?: string;
  isPaid?: boolean;
  amountDue?: string;
};

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

type ReadOnlyEdit = { enabled: boolean; reason: string };
type StatusEdit = { status: string; reason: string };
type ReviewEdit = { underReview: boolean; reason: string; severity: string };

type SeverityOption = { value: string; label: string };

type TrendPoint = { label: string; offlineFailed: number; exportsPending: number };

type Device = { id: string; deviceName?: string | null; status: string };

type OnboardingResult = {
  businessId: string;
  milestones: { branches: boolean; products: boolean; sales: boolean; users: boolean; settings: boolean };
  completedCount: number;
  totalCount: number;
  percentComplete: number;
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

function defaultSubscriptionEdit(): SubscriptionEdit {
  return {
    tier: 'BUSINESS',
    status: 'TRIAL',
    reason: '',
    startsAt: '',
    trialEndsAt: '',
    graceEndsAt: '',
    expiresAt: '',
    months: '',
    isPaid: true,
    amountDue: '',
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
  formatDateLabel,
  getDaysRemaining,
  subscriptionEdits,
  setSubscriptionEdits,
  updateSubscription,
  recordSubscriptionPurchase,
  resetSubscriptionLimits,
  purchaseHistory,
  loadingPurchaseHistory,
  loadPurchaseHistory,
  statusEdits,
  setStatusEdits,
  updateStatus,
  saveStatusAndAccess,
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
  businessOnboarding,
  loadingOnboarding,
  loadBusinessOnboarding,
  businessNotes,
  loadingNotes,
  noteInput,
  setNoteInput,
  loadBusinessNotes,
  createBusinessNote,
  deleteBusinessNote,
  scheduledActions,
  loadingScheduledActions,
  scheduledActionForm,
  setScheduledActionForm,
  createScheduledAction,
  cancelScheduledAction,
  platformAdminId,
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
  purchaseHistory: Record<string, PurchaseHistoryItem[]>;
  loadingPurchaseHistory: Record<string, boolean>;
  loadPurchaseHistory: (businessId: string) => Promise<void>;
  statusEdits: Record<string, StatusEdit>;
  setStatusEdits: Dispatch<SetStateAction<Record<string, StatusEdit>>>;
  updateStatus: (businessId: string) => Promise<void>;
  saveStatusAndAccess: (businessId: string) => Promise<void>;
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
  businessOnboarding: Record<string, OnboardingResult>;
  loadingOnboarding: Record<string, boolean>;
  loadBusinessOnboarding: (businessId: string) => Promise<void>;
  businessNotes: Record<string, BusinessNote[]>;
  loadingNotes: Record<string, boolean>;
  noteInput: Record<string, string>;
  setNoteInput: Dispatch<SetStateAction<Record<string, string>>>;
  loadBusinessNotes: (businessId: string) => Promise<void>;
  createBusinessNote: (businessId: string) => Promise<void>;
  deleteBusinessNote: (noteId: string, businessId: string) => Promise<void>;
  scheduledActions: Record<string, ScheduledAction[]>;
  loadingScheduledActions: Record<string, boolean>;
  scheduledActionForm: Record<string, { actionType: string; payload: Record<string, unknown>; scheduledFor: string }>;
  setScheduledActionForm: Dispatch<SetStateAction<Record<string, { actionType: string; payload: Record<string, unknown>; scheduledFor: string }>>>;
  createScheduledAction: (businessId: string) => Promise<void>;
  cancelScheduledAction: (actionId: string, businessId: string) => Promise<void>;
  platformAdminId: string;
}) {
  const businessStatusLabels: Record<string, string> = {
    ACTIVE: t('statusActive'),
    GRACE: t('statusGrace'),
    EXPIRED: t('statusExpired'),
    SUSPENDED: t('statusSuspended'),
    ARCHIVED: t('statusArchived'),
    DELETED: t('statusDeleted'),
  };

  if (!show) {
    return null;
  }

  return (
    <aside className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-4 space-y-4">
      {!openedBusiness ? (
        <p className="text-sm text-[color:var(--pt-text-2)]">{t('selectBusinessDetails')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-[color:var(--pt-text-1)]">{openedBusiness.name}</p>
              <p className="text-xs text-[color:var(--pt-text-muted)]">{openedBusiness.id}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  withAction(`business:workspace:${openedBusiness.id}`, () =>
                    loadBusinessWorkspace(openedBusiness.id),
                  )
                }
                className="rounded border border-[color:var(--pt-accent-border-hi)] px-2 py-1 text-xs text-[color:var(--pt-text-1)]"
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
                className="rounded border border-[color:var(--pt-accent-border-hi)] px-2 py-1 text-xs text-[color:var(--pt-text-1)]"
              >
                {t('backToRegistry')}
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { value: 'OVERVIEW', label: t('workspaceTabOverview') },
              { value: 'MANAGE', label: t('workspaceTabManage') },
              { value: 'NOTES', label: t('workspaceTabNotes') },
              { value: 'DEVICES', label: t('workspaceTabDevices') },
              { value: 'ACTIONS', label: t('workspaceTabActions') },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setBusinessDrawerTab(tab.value as WorkspaceTab)}
                className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.2em] transition ${
                  businessDrawerTab === tab.value
                    ? 'border-[color:var(--pt-accent)] bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-1)]'
                    : 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-2)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {businessDrawerTab === 'OVERVIEW' ? (
            <div className="space-y-4">
              {/* Snapshot timestamp */}
              <div className="flex items-center justify-between text-[11px] text-[color:var(--pt-text-muted)]">
                <span>
                  {t('workspaceSnapshotAt', {
                    value: openedBusinessWorkspace?.generatedAt
                      ? new Date(openedBusinessWorkspace.generatedAt).toLocaleString(locale)
                      : t('notAvailable'),
                  })}
                </span>
                {loadingBusinessWorkspace[openedBusiness.id] ? (
                  <span className="inline-flex items-center gap-1">
                    <Spinner size="xs" variant="grid" />
                    {t('loading')}
                  </span>
                ) : null}
              </div>

              {/* Zone 1 — Identity bar */}
              <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] ${
                      ({
                        ACTIVE: 'border-emerald-600/60 text-emerald-400',
                        GRACE: 'border-amber-600/60 text-amber-400',
                        TRIAL: 'border-sky-600/60 text-sky-400',
                        SUSPENDED: 'border-orange-600/60 text-orange-400',
                        ARCHIVED: 'border-red-700/60 text-red-400',
                        DELETED: 'border-red-900/60 text-red-500',
                        EXPIRED: 'border-red-600/60 text-red-400',
                      } as Record<string, string>)[
                        openedBusinessWorkspace?.business?.status ?? openedBusiness.status
                      ] ?? 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-2)]'
                    }`}
                  >
                    {formatEnum(
                      businessStatusLabels,
                      openedBusinessWorkspace?.business?.status ?? openedBusiness.status,
                    )}
                  </span>
                  <span className="rounded border border-[color:var(--pt-accent-border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-[color:var(--pt-text-2)]">
                    {openedBusinessWorkspace?.subscription?.tier ??
                      openedBusiness.subscription?.tier ??
                      t('notAvailable')}
                  </span>
                  {openedBusiness.underReview ? (
                    <span className="rounded border border-amber-600/60 bg-amber-900/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-amber-400">
                      {t('underReview')}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-[color:var(--pt-text-2)]">
                  {(() => {
                    const endDate =
                      openedBusiness.subscription?.expiresAt ??
                      openedBusiness.subscription?.graceEndsAt ??
                      openedBusiness.subscription?.trialEndsAt ??
                      null;
                    if (!endDate) {
                      return (
                        <span className="text-[color:var(--pt-text-muted)]">{t('notAvailable')}</span>
                      );
                    }
                    const daysRemaining = getDaysRemaining(endDate);
                    const daysColor =
                      daysRemaining === null
                        ? ''
                        : daysRemaining <= 0
                        ? 'text-red-400'
                        : daysRemaining <= 14
                        ? 'text-amber-400'
                        : 'text-[color:var(--pt-text-2)]';
                    return (
                      <span>
                        {openedBusiness.subscription?.status && (
                          <span className="uppercase text-[color:var(--pt-text-muted)]">
                            {openedBusiness.subscription.status}
                            {' · '}
                          </span>
                        )}
                        {formatDateLabel(endDate)}
                        {daysRemaining !== null && (
                          <span className={`ml-1 ${daysColor}`}>
                            {'('}
                            {t('daysRemainingValue', { value: daysRemaining })}
                            {')'}
                          </span>
                        )}
                      </span>
                    );
                  })()}
                </div>
                {openedBusinessWorkspace?.recentAdminActions?.[0] ? (
                  <p className="text-[11px] text-[color:var(--pt-text-muted)]">
                    {t('workspaceLastActivity')}:{' '}
                    {new Date(
                      openedBusinessWorkspace.recentAdminActions[0].createdAt,
                    ).toLocaleString(locale)}
                  </p>
                ) : null}
                {openedBusiness.systemOwner ? (
                  <div className="mt-1 border-t border-[color:var(--pt-accent-border)] pt-2 space-y-0.5">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--pt-text-muted)]">
                      {t('systemOwner')}
                    </p>
                    <p className="text-xs font-medium text-[color:var(--pt-text-1)]">
                      {openedBusiness.systemOwner.name}
                    </p>
                    <p className="text-[11px] text-[color:var(--pt-text-2)]">
                      {openedBusiness.systemOwner.email}
                    </p>
                    {openedBusiness.systemOwner.phone ? (
                      <p className="text-[11px] text-[color:var(--pt-text-2)]">
                        {openedBusiness.systemOwner.phone}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Zone 2 — Signal cards (2×3 grid) */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {/* Health Score */}
                <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                    {t('businessHealthScoreTitle')}
                  </p>
                  <div className="mt-1.5 flex items-end justify-between gap-1">
                    {(() => {
                      const s = healthMap[openedBusiness.id]?.score;
                      const colorClass =
                        s === undefined
                          ? 'text-[color:var(--pt-text-muted)]'
                          : s >= 80
                          ? 'text-emerald-400'
                          : s >= 50
                          ? 'text-amber-400'
                          : 'text-red-400';
                      return (
                        <span className={`text-2xl font-semibold tabular-nums ${colorClass}`}>
                          {s ?? '—'}
                        </span>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() =>
                        withAction(`business:health:${openedBusiness.id}`, () =>
                          loadBusinessHealth(openedBusiness.id),
                        )
                      }
                      className="rounded border border-[color:var(--pt-accent-border)] px-1.5 py-0.5 text-[9px] text-[color:var(--pt-text-muted)]"
                    >
                      {actionLoading[`business:health:${openedBusiness.id}`] ? (
                        <Spinner size="xs" variant="orbit" />
                      ) : (
                        t('loadHealth')
                      )}
                    </button>
                  </div>
                </div>

                {/* Risk Score */}
                <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                    {t('businessRiskScoreTitle')}
                  </p>
                  <div className="mt-1.5">
                    {(() => {
                      const score =
                        openedBusinessWorkspace?.risk?.score ??
                        getBusinessRiskScore(openedBusiness);
                      const colorClass =
                        score >= 60
                          ? 'text-red-400'
                          : score >= 30
                          ? 'text-amber-400'
                          : 'text-emerald-400';
                      return (
                        <span className={`text-2xl font-semibold tabular-nums ${colorClass}`}>
                          {score}
                        </span>
                      );
                    })()}
                    {openedBusiness.underReview ? (
                      <p className="mt-0.5 text-[10px] text-amber-400">{t('businessRiskFlagged')}</p>
                    ) : null}
                  </div>
                </div>

                {/* Pending Support */}
                <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                    {t('workspaceQueueSupport')}
                  </p>
                  <p
                    className={`mt-1.5 text-2xl font-semibold tabular-nums ${
                      (openedBusinessWorkspace?.queues?.pendingSupport ?? 0) > 0
                        ? 'text-amber-400'
                        : 'text-[color:var(--pt-text-1)]'
                    }`}
                  >
                    {openedBusinessWorkspace?.queues?.pendingSupport ?? 0}
                  </p>
                </div>

                {/* Pending Exports */}
                <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                    {t('workspaceQueueExports')}
                  </p>
                  <p
                    className={`mt-1.5 text-2xl font-semibold tabular-nums ${
                      (openedBusinessWorkspace?.queues?.pendingExports ?? 0) > 0
                        ? 'text-amber-400'
                        : 'text-[color:var(--pt-text-1)]'
                    }`}
                  >
                    {openedBusinessWorkspace?.queues?.pendingExports ?? 0}
                  </p>
                </div>

                {/* Offline Devices */}
                <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                    {t('workspaceOfflineDevices')}
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[color:var(--pt-text-1)]">
                    {openedBusinessWorkspace?.counts?.offlineDevices ??
                      openedBusiness.counts?.offlineDevices ??
                      0}
                  </p>
                </div>

                {/* Onboarding Progress */}
                <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                    {t('workspaceOnboardingTitle')}
                  </p>
                  <div className="mt-1.5 flex items-end justify-between gap-1">
                    {businessOnboarding[openedBusiness.id] ? (
                      <span
                        className={`text-2xl font-semibold tabular-nums ${
                          businessOnboarding[openedBusiness.id].completedCount ===
                          businessOnboarding[openedBusiness.id].totalCount
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {businessOnboarding[openedBusiness.id].completedCount}/
                        {businessOnboarding[openedBusiness.id].totalCount}
                      </span>
                    ) : (
                      <span className="text-2xl font-semibold text-[color:var(--pt-text-muted)]">—</span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        withAction(`business:onboarding:${openedBusiness.id}`, () =>
                          loadBusinessOnboarding(openedBusiness.id),
                        )
                      }
                      className="rounded border border-[color:var(--pt-accent-border)] px-1.5 py-0.5 text-[9px] text-[color:var(--pt-text-muted)]"
                    >
                      {loadingOnboarding[openedBusiness.id] ? (
                        <Spinner size="xs" variant="orbit" />
                      ) : (
                        t('workspaceOnboardingLoad')
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Zone 3 — Activity feed */}
              <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-2)]">
                    {t('workspaceRecentAdminActions')}
                  </p>
                  <span className="text-[11px] text-[color:var(--pt-text-muted)]">
                    {Math.min(openedBusinessWorkspace?.recentAdminActions?.length ?? 0, 10)}
                  </span>
                </div>
                {openedBusinessWorkspace?.recentAdminActions?.length ? (
                  <div className="space-y-2">
                    {openedBusinessWorkspace.recentAdminActions.slice(0, 10).map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-wrap items-center gap-x-2 text-[11px]"
                      >
                        <span className="font-medium text-[color:var(--pt-text-1)]">
                          {entry.action}
                        </span>
                        <span className="text-[color:var(--pt-text-muted)]">·</span>
                        <span
                          className={
                            entry.outcome === 'SUCCESS'
                              ? 'text-emerald-400'
                              : entry.outcome === 'FAILURE'
                              ? 'text-red-400'
                              : 'text-[color:var(--pt-text-2)]'
                          }
                        >
                          {entry.outcome}
                        </span>
                        <span className="text-[color:var(--pt-text-muted)]">·</span>
                        <span className="text-[color:var(--pt-text-muted)]">
                          {new Date(entry.createdAt).toLocaleString(locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[color:var(--pt-text-muted)]">
                    {t('workspaceNoRecentActions')}
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {businessDrawerTab === 'MANAGE' ? (
            <div className="space-y-3">
              {/* Section: Subscription */}
              <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-2)]">
                {t('subscriptionCurrentState')}
              </p>
              <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                  {t('subscriptionCurrentState')}
                </p>
                <p className="mt-1 text-sm text-[color:var(--pt-text-1)]">
                  {t('subscriptionCurrentStateValue', {
                    tier: openedBusiness.subscription?.tier ?? t('notAvailable'),
                    status: openedBusiness.subscription?.status ?? t('notAvailable'),
                  })}
                </p>
              </div>
              <div className="grid gap-2 text-xs text-[color:var(--pt-text-2)] md:grid-cols-2">
                <div>
                  <p className="uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">{t('trialEndsLabel')}</p>
                  <p>{formatDateLabel(openedBusiness.subscription?.trialEndsAt)}</p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">{t('graceEndsLabel')}</p>
                  <p>{formatDateLabel(openedBusiness.subscription?.graceEndsAt)}</p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">{t('expiresAtLabel')}</p>
                  <p>{formatDateLabel(openedBusiness.subscription?.expiresAt)}</p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">{t('daysRemainingLabel')}</p>
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

              {/* Record Subscription Purchase */}
              <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3 space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                    {t('recordPurchaseTitle')}
                  </p>
                  <p className="text-xs text-[color:var(--pt-text-2)]">{t('recordPurchaseHint')}</p>
                </div>

                {/* Tier */}
                <SmartSelect
                  instanceId="platform-workspace-subscription-purchase-tier"
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

                {/* Duration pills */}
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                    {t('subscriptionDurationLabel')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['1', '2', '3', '6', '12'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() =>
                          setSubscriptionEdits((prev) => ({
                            ...prev,
                            [openedBusiness.id]: {
                              ...(prev[openedBusiness.id] ?? defaultSubscriptionEdit()),
                              months: m,
                            },
                          }))
                        }
                        className={`rounded border px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] transition-colors ${
                          subscriptionEdits[openedBusiness.id]?.months === m
                            ? 'border-[color:var(--pt-accent)] bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-1)]'
                            : 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-2)]'
                        }`}
                      >
                        {m} mo
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setSubscriptionEdits((prev) => ({
                          ...prev,
                          [openedBusiness.id]: {
                            ...(prev[openedBusiness.id] ?? defaultSubscriptionEdit()),
                            months: (['1','2','3','6','12'] as string[]).includes(
                              prev[openedBusiness.id]?.months ?? ''
                            ) ? '' : (prev[openedBusiness.id]?.months ?? ''),
                          },
                        }))
                      }
                      className={`rounded border px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] transition-colors ${
                        !(['1','2','3','6','12'] as string[]).includes(
                          subscriptionEdits[openedBusiness.id]?.months ?? ''
                        ) && subscriptionEdits[openedBusiness.id]?.months !== ''
                          ? 'border-[color:var(--pt-accent)] bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-1)]'
                          : 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-2)]'
                      }`}
                    >
                      {t('customMonths')}
                    </button>
                  </div>
                  {/* Custom months input — shown when not a preset */}
                  {!(['1','2','3','6','12'] as string[]).includes(
                    subscriptionEdits[openedBusiness.id]?.months ?? ''
                  ) && (
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={subscriptionEdits[openedBusiness.id]?.months ?? ''}
                      onChange={(event) =>
                        setSubscriptionEdits((prev) => ({
                          ...prev,
                          [openedBusiness.id]: {
                            ...(prev[openedBusiness.id] ?? defaultSubscriptionEdit()),
                            months: event.target.value,
                          },
                        }))
                      }
                      placeholder={t('customMonthsPlaceholder')}
                      className="mt-2 w-full rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
                    />
                  )}
                </div>

                {/* Start date + live expiry preview */}
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                      {t('purchaseStartsAtOptional')}
                    </p>
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
                      className="w-full rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                      {t('expiryPreviewLabel')}
                    </p>
                    <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-xs text-[color:var(--pt-text-2)]">
                      {(() => {
                        const mo = Number(subscriptionEdits[openedBusiness.id]?.months ?? '');
                        if (!mo || mo <= 0) return t('expiryPreviewEmpty');
                        const base = subscriptionEdits[openedBusiness.id]?.startsAt
                          ? new Date(subscriptionEdits[openedBusiness.id]!.startsAt!)
                          : new Date();
                        const exp = new Date(base);
                        exp.setMonth(exp.getMonth() + mo);
                        return exp.toLocaleDateString(locale);
                      })()}
                    </div>
                  </div>
                </div>

                {/* Paid / Complimentary toggle */}
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                    {t('purchaseTypeLabel')}
                  </p>
                  <div className="flex gap-1.5">
                    {[
                      { value: true, label: t('purchaseTypePaid') },
                      { value: false, label: t('purchaseTypeComplimentary') },
                    ].map((opt) => (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() =>
                          setSubscriptionEdits((prev) => ({
                            ...prev,
                            [openedBusiness.id]: {
                              ...(prev[openedBusiness.id] ?? defaultSubscriptionEdit()),
                              isPaid: opt.value,
                            },
                          }))
                        }
                        className={`rounded border px-3 py-1 text-[10px] uppercase tracking-[0.15em] transition-colors ${
                          (subscriptionEdits[openedBusiness.id]?.isPaid ?? true) === opt.value
                            ? 'border-[color:var(--pt-accent)] bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-1)]'
                            : 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-2)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {(subscriptionEdits[openedBusiness.id]?.isPaid ?? true) && (
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={subscriptionEdits[openedBusiness.id]?.amountDue ?? ''}
                      onChange={(event) =>
                        setSubscriptionEdits((prev) => ({
                          ...prev,
                          [openedBusiness.id]: {
                            ...(prev[openedBusiness.id] ?? defaultSubscriptionEdit()),
                            amountDue: event.target.value,
                          },
                        }))
                      }
                      placeholder={t('amountDuePlaceholder')}
                      className="mt-2 w-full rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
                    />
                  )}
                </div>

                {/* Reason + submit */}
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
                  className="w-full rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
                />
                <button
                  type="button"
                  onClick={() =>
                    withAction(`subscription:purchase:${openedBusiness.id}`, () =>
                      recordSubscriptionPurchase(openedBusiness.id),
                    )
                  }
                  disabled={actionLoading[`subscription:purchase:${openedBusiness.id}`]}
                  className="w-full rounded bg-[var(--pt-accent)] px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {actionLoading[`subscription:purchase:${openedBusiness.id}`] ? (
                      <Spinner size="xs" variant="bars" />
                    ) : null}
                    {t('recordPurchase')}
                  </span>
                </button>

                {/* Purchase history */}
                <div className="border-t border-[color:var(--pt-accent-border)] pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                      {t('purchaseHistoryTitle')}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        withAction(`subscription:history:${openedBusiness.id}`, () =>
                          loadPurchaseHistory(openedBusiness.id),
                        )
                      }
                      className="rounded border border-[color:var(--pt-accent-border)] px-2 py-0.5 text-[10px] text-[color:var(--pt-text-2)]"
                    >
                      {loadingPurchaseHistory[openedBusiness.id] ? (
                        <Spinner size="xs" variant="orbit" />
                      ) : (
                        t('purchaseHistoryLoad')
                      )}
                    </button>
                  </div>
                  {(purchaseHistory[openedBusiness.id] ?? []).length > 0 ? (
                    <div className="space-y-1.5">
                      {(purchaseHistory[openedBusiness.id] ?? []).map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded border border-[color:var(--pt-accent-border)] p-bg-card px-2.5 py-2 text-[11px]"
                        >
                          <div>
                            <p className="font-medium text-[color:var(--pt-text-1)]">
                              {p.tier} · {p.months} mo
                            </p>
                            <p className="text-[color:var(--pt-text-muted)]">
                              {new Date(p.createdAt).toLocaleDateString(locale)} · {p.platformAdmin.email}
                            </p>
                          </div>
                          <div className="text-right">
                            <span
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] ${
                                p.isPaid
                                  ? 'border-emerald-700/60 text-emerald-400'
                                  : 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)]'
                              }`}
                            >
                              {p.isPaid ? t('purchaseTypePaid') : t('purchaseTypeComplimentary')}
                            </span>
                            {p.isPaid && p.amountDue > 0 && (
                              <p className="mt-0.5 tabular-nums text-[color:var(--pt-text-2)]">
                                TSh {p.amountDue.toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : purchaseHistory[openedBusiness.id] !== undefined ? (
                    <p className="text-[11px] text-[color:var(--pt-text-muted)]">{t('purchaseHistoryEmpty')}</p>
                  ) : null}
                </div>
              </div>

              {/* Group 2 — Status & Access */}
              <div className="border-t border-[color:var(--pt-accent-border)] pt-3 space-y-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-2)]">
                  {t('statusAccessTitle')}
                </p>

                {/* Status pills */}
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                    {t('tableStatus')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { value: 'ACTIVE', label: t('statusActive'), active: 'border-emerald-600 bg-emerald-900/30 text-emerald-300', inactive: 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:border-emerald-700/60 hover:text-emerald-400' },
                      { value: 'GRACE', label: t('statusGrace'), active: 'border-amber-600 bg-amber-900/30 text-amber-300', inactive: 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:border-amber-700/60 hover:text-amber-400' },
                      { value: 'SUSPENDED', label: t('statusSuspended'), active: 'border-orange-600 bg-orange-900/30 text-orange-300', inactive: 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:border-orange-700/60 hover:text-orange-400' },
                      { value: 'ARCHIVED', label: t('statusArchived'), active: 'border-red-700 bg-red-900/30 text-red-300', inactive: 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:border-red-700/60 hover:text-red-400' },
                      { value: 'DELETED', label: t('statusDeleted'), active: 'border-red-900 bg-red-900/40 text-red-400', inactive: 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:border-red-800/60 hover:text-red-500' },
                    ] as { value: string; label: string; active: string; inactive: string }[]).map((opt) => {
                      const selected = (statusEdits[openedBusiness.id]?.status ?? openedBusiness.status) === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setStatusEdits((prev) => ({
                              ...prev,
                              [openedBusiness.id]: {
                                ...(prev[openedBusiness.id] ?? defaultStatusEdit(openedBusiness.status)),
                                status: opt.value,
                              },
                            }))
                          }
                          className={`rounded border px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] transition-colors ${selected ? opt.active : opt.inactive}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Status reason */}
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
                  className="w-full rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
                />

                {/* Under Review toggle */}
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[color:var(--pt-text-2)]">
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
                </label>

                {/* Review fields — only visible when Under Review is on */}
                {(reviewEdits[openedBusiness.id]?.underReview ?? false) && (
                  <div className="space-y-2 border-l-2 border-amber-700/40 pl-3">
                    <SmartSelect
                      instanceId="platform-workspace-review-severity"
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
                      className="w-full rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
                    />
                  </div>
                )}

                {/* Read-only toggle */}
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[color:var(--pt-text-2)]">
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

                {/* Read-only reason — only visible when enabled */}
                {(readOnlyEdits[openedBusiness.id]?.enabled ?? false) && (
                  <div className="border-l-2 border-orange-700/40 pl-3">
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
                      className="w-full rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
                    />
                  </div>
                )}

                {/* Support notes */}
                <textarea
                  value={supportNotes[openedBusiness.id] ?? ''}
                  onChange={(event) =>
                    setSupportNotes((prev) => ({
                      ...prev,
                      [openedBusiness.id]: event.target.value,
                    }))
                  }
                  placeholder={t('supportNotesPlaceholder')}
                  className="min-h-[80px] w-full rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
                />

                {/* Save Changes */}
                <button
                  type="button"
                  onClick={() =>
                    withAction(`status-access:save:${openedBusiness.id}`, () =>
                      saveStatusAndAccess(openedBusiness.id),
                    )
                  }
                  disabled={actionLoading[`status-access:save:${openedBusiness.id}`]}
                  className="w-full rounded bg-[var(--pt-accent)] px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {actionLoading[`status-access:save:${openedBusiness.id}`] ? (
                      <Spinner size="xs" variant="bars" />
                    ) : null}
                    {t('saveChanges')}
                  </span>
                </button>
              </div>

              {/* Scheduled Actions */}
              <div className="border-t border-[color:var(--pt-accent-border)] pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-2)]">
                    {t('scheduledActionsTitle')}
                  </p>
                  {loadingScheduledActions[openedBusiness.id] ? (
                    <Spinner size="xs" variant="orbit" />
                  ) : null}
                </div>
                {(scheduledActions[openedBusiness.id] ?? []).length ? (
                  <div className="space-y-2">
                    {(scheduledActions[openedBusiness.id] ?? []).map((action) => (
                      <div
                        key={action.id}
                        className="flex items-start justify-between gap-2 rounded border border-[color:var(--pt-accent-border)] p-bg-card px-2 py-1.5 text-[11px]"
                      >
                        <div>
                          <p className="font-medium text-[color:var(--pt-text-1)]">{action.actionType}</p>
                          <p className="text-[color:var(--pt-text-muted)]">
                            {new Date(action.scheduledFor).toLocaleString(locale)}
                          </p>
                          <p className="text-[color:var(--pt-text-muted)]">{action.platformAdmin.email}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            withAction(`action:cancel:${action.id}`, () =>
                              cancelScheduledAction(action.id, openedBusiness.id),
                            )
                          }
                          className="shrink-0 rounded border border-red-700/50 px-2 py-0.5 text-[10px] text-red-400"
                        >
                          {t('cancelAction')}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-[color:var(--pt-text-muted)]">{t('noScheduledActions')}</p>
                )}
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
                  className="flex-1 rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
                />
                <button
                  type="button"
                  onClick={() =>
                    withAction(`business:devices:${openedBusiness.id}`, () =>
                      loadDevices(openedBusiness.id),
                    )
                  }
                  className="rounded border border-[color:var(--pt-accent-border-hi)] px-3 py-2 text-xs text-[color:var(--pt-text-1)]"
                >
                  {t('loadDevices')}
                </button>
              </div>
              {(devicesMap[openedBusiness.id] ?? openedBusinessWorkspace?.devices ?? []).length ? (
                <div className="space-y-2">
                  {(devicesMap[openedBusiness.id] ?? openedBusinessWorkspace?.devices ?? []).map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between rounded border border-[color:var(--pt-accent-border)] p-bg-card px-3 py-2 text-xs"
                    >
                      <span className="text-[color:var(--pt-text-1)]">
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
                          className="rounded border border-[color:var(--pt-accent-border-hi)] px-2 py-1 text-xs text-[color:var(--pt-text-1)]"
                        >
                          {t('revoke')}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : loadingDevices[openedBusiness.id] ? (
                <div className="flex items-center gap-2 text-xs text-[color:var(--pt-text-2)]">
                  <Spinner size="xs" variant="grid" /> {t('loadingDevices')}
                </div>
              ) : (
                <p className="text-xs text-[color:var(--pt-text-muted)]">{t('workspaceNoDevicesLoaded')}</p>
              )}
            </div>
          ) : null}

          {businessDrawerTab === 'NOTES' ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <textarea
                  value={noteInput[openedBusiness.id] ?? ''}
                  onChange={(event) =>
                    setNoteInput((prev) => ({ ...prev, [openedBusiness.id]: event.target.value }))
                  }
                  placeholder={t('noteInputPlaceholder')}
                  rows={3}
                  className="flex-1 rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-xs text-[color:var(--pt-text-1)]"
                />
                <button
                  type="button"
                  onClick={() =>
                    withAction(`note:create:${openedBusiness.id}`, () =>
                      createBusinessNote(openedBusiness.id),
                    )
                  }
                  className="self-end rounded bg-[var(--pt-accent)] px-3 py-2 text-xs font-semibold text-black"
                >
                  <span className="inline-flex items-center gap-1">
                    {actionLoading[`note:create:${openedBusiness.id}`] ? (
                      <Spinner size="xs" variant="ring" />
                    ) : null}
                    {t('addNote')}
                  </span>
                </button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-2)]">
                  {t('notesListTitle')}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    withAction(`notes:load:${openedBusiness.id}`, () =>
                      loadBusinessNotes(openedBusiness.id),
                    )
                  }
                  className="text-[10px] text-[color:var(--pt-text-muted)] underline"
                >
                  {loadingNotes[openedBusiness.id] ? (
                    <Spinner size="xs" variant="orbit" />
                  ) : (
                    t('refresh')
                  )}
                </button>
              </div>
              {(businessNotes[openedBusiness.id] ?? []).length ? (
                <div className="space-y-2">
                  {(businessNotes[openedBusiness.id] ?? []).map((note) => (
                    <div
                      key={note.id}
                      className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3 text-xs"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-[color:var(--pt-text-muted)]">{note.platformAdmin.email}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[color:var(--pt-text-muted)]">
                            {new Date(note.createdAt).toLocaleString(locale)}
                          </span>
                          {note.platformAdmin.id === platformAdminId ? (
                            <button
                              type="button"
                              onClick={() =>
                                withAction(`note:delete:${note.id}`, () =>
                                  deleteBusinessNote(note.id, openedBusiness.id),
                                )
                              }
                              className="text-[10px] text-red-500 hover:text-red-300"
                            >
                              {t('deleteNote')}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-[color:var(--pt-text-1)]">{note.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[color:var(--pt-text-muted)]">{t('noNotes')}</p>
              )}
            </div>
          ) : null}

          {businessDrawerTab === 'ACTIONS' ? (
            <div className="space-y-2">
              <p className="text-xs text-[color:var(--pt-text-2)]">{t('dangerZoneHint')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    withAction(`business:export:${openedBusiness.id}`, () =>
                      exportOnExit(openedBusiness.id),
                    )
                  }
                  className="rounded border border-[color:var(--pt-accent-border-hi)] px-3 py-2 text-xs text-[color:var(--pt-text-1)]"
                >
                  {t('exportOnExit')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    withAction(`subscription:reset:${openedBusiness.id}`, () =>
                      resetSubscriptionLimits(openedBusiness.id),
                    )
                  }
                  className="rounded border border-[color:var(--pt-accent-border-hi)] px-3 py-2 text-xs text-[color:var(--pt-text-1)]"
                >
                  {t('resetSubscriptionLimits')}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openBusinessActionModal(openedBusiness.id, 'FORCE_LOGOUT')}
                  className="rounded border border-amber-500/60 px-3 py-2 text-xs text-amber-200"
                >
                  {t('forceLogout')}
                </button>
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
                  className="rounded border border-[color:var(--pt-accent-border-hi)] px-3 py-2 text-xs text-[color:var(--pt-text-1)]"
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
