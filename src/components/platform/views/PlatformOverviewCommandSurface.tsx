import Link from 'next/link';
import { Spinner } from '@/components/Spinner';
import { PlatformActivitySection } from './PlatformActivitySection';

type PlatformAuditLog = {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  platformAdminId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type OverviewSnapshot = {
  generatedAt?: string;
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
  activity?: {
    id: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    createdAt: string;
  }[];
};

type QueueLane = {
  total: number;
  byStatus: Record<string, number>;
};

type OverviewQueues = {
  support: QueueLane;
  exports: QueueLane;
  subscriptions: QueueLane;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

const TONE_DOT: Record<string, string> = {
  critical: 'bg-red-400',
  warning: 'bg-amber-400',
  positive: 'bg-emerald-400',
  neutral: 'bg-[var(--pt-text-muted)]',
};

const TONE_ROW: Record<string, string> = {
  critical: 'border-red-500/30 bg-red-500/[0.06]',
  warning: 'border-amber-500/30 bg-amber-500/[0.06]',
};

const ARROW = (
  <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3 flex-shrink-0 text-[color:var(--pt-text-muted)]">
    <path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function PlatformOverviewCommandSurface({
  show,
  t,
  locale,
  overviewSnapshot,
  overviewQueues,
  isLoadingOverview,
  withAction,
  loadOverviewSnapshot,
  loadQueuesSummary,
  queueStatusLabel,
  activityFeed,
  loadActivityFeed,
  actionLoading,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  locale: string;
  overviewSnapshot: OverviewSnapshot | null;
  overviewQueues: OverviewQueues | null;
  isLoadingOverview: boolean;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  loadOverviewSnapshot: () => Promise<void>;
  loadQueuesSummary: () => Promise<void>;
  queueStatusLabel: (status: string) => string;
  activityFeed: PlatformAuditLog[];
  loadActivityFeed: () => Promise<void>;
  actionLoading: Record<string, boolean>;
}) {
  if (!show) {
    return null;
  }

  const kpis = overviewSnapshot?.kpis;
  const anomalies = overviewSnapshot?.anomalies;
  const signals = overviewSnapshot?.signals;
  const tiers = overviewSnapshot?.distributions?.tiers ?? [];
  const statuses = overviewSnapshot?.distributions?.businessStatuses ?? [];
  const users = overviewSnapshot?.distributions?.users;
  const totalBusinesses = kpis?.businesses ?? 0;

  const flags = [
    {
      id: 'review',
      active: (kpis?.underReview ?? 0) > 0,
      label: `${kpis?.underReview ?? 0} ${t('overviewFlagUnderReview')}`,
      href: `/${locale}/platform/businesses`,
      tone: 'warning',
    },
    {
      id: 'offline',
      active: (anomalies?.offlineFailures ?? 0) > 0,
      label: `${anomalies?.offlineFailures ?? 0} ${t('overviewFlagOfflineFailures')}`,
      href: `/${locale}/platform/intelligence`,
      tone: 'critical',
    },
    {
      id: 'exports',
      active: (anomalies?.exportsPending ?? 0) > 0,
      label: `${anomalies?.exportsPending ?? 0} ${t('overviewFlagExportsPending')}`,
      href: `/${locale}/platform/operations`,
      tone: 'warning',
    },
    {
      id: 'errrate',
      active: (anomalies?.apiErrorRate ?? 0) > 0.05,
      label: `${((anomalies?.apiErrorRate ?? 0) * 100).toFixed(2)}% ${t('overviewFlagErrorRate')}`,
      href: `/${locale}/platform/intelligence`,
      tone: 'critical',
    },
    {
      id: 'queue',
      active: (signals?.queuePressureTotal ?? 0) > 5,
      label: `${signals?.queuePressureTotal ?? 0} ${t('overviewFlagQueuedItems')}`,
      href: `/${locale}/platform/access`,
      tone: 'warning',
    },
    {
      id: 'exportsfailed',
      active: (signals?.exportsFailed ?? 0) > 0,
      label: `${signals?.exportsFailed ?? 0} ${t('overviewFlagExportsFailed')}`,
      href: `/${locale}/platform/operations`,
      tone: 'critical',
    },
  ];

  const queues = [
    {
      key: 'support',
      label: t('overviewQueueSupport'),
      lane: overviewQueues?.support,
      href: `/${locale}/platform/access`,
    },
    {
      key: 'exports',
      label: t('overviewQueueExports'),
      lane: overviewQueues?.exports,
      href: `/${locale}/platform/operations`,
    },
    {
      key: 'subscriptions',
      label: t('overviewQueueSubscriptions'),
      lane: overviewQueues?.subscriptions,
      href: `/${locale}/platform/access`,
    },
  ];

  const navLinks = [
    { label: t('overviewCommandBusinesses'), href: `/${locale}/platform/businesses` },
    { label: t('overviewCommandOperations'), href: `/${locale}/platform/operations` },
    { label: t('overviewCommandAccess'), href: `/${locale}/platform/access` },
    { label: t('overviewCommandIntelligence'), href: `/${locale}/platform/intelligence` },
    { label: t('overviewCommandAnnouncements'), href: `/${locale}/platform/announcements` },
    { label: t('overviewCommandAnalytics'), href: `/${locale}/platform/analytics` },
  ];

  return (
    <section className="command-card p-6 space-y-5 nvi-reveal">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">
            {t('overviewSurfaceTag')}
          </p>
          <h3 className="text-xl font-semibold text-[color:var(--pt-text-1)]">{t('overviewSurfaceTitle')}</h3>
          <p className="mt-0.5 text-[11px] text-[color:var(--pt-text-muted)]">
            {t('overviewSurfaceGeneratedAt', {
              value: overviewSnapshot?.generatedAt
                ? new Date(overviewSnapshot.generatedAt).toLocaleString(locale)
                : t('notAvailable'),
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            withAction('overview:refresh', () =>
              Promise.all([loadOverviewSnapshot(), loadQueuesSummary()]).then(() => undefined),
            )
          }
          disabled={isLoadingOverview}
          className="rounded border border-[color:var(--pt-accent-border-hi)] px-3 py-1 text-xs text-[color:var(--pt-text-1)] disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-2">
            {isLoadingOverview ? <Spinner size="xs" variant="grid" /> : null}
            {isLoadingOverview ? t('loading') : t('refresh')}
          </span>
        </button>
      </div>

      {/* Two-column body */}
      <div className="grid gap-6 xl:grid-cols-[1fr_288px]">

        {/* ── Left: Needs Attention ── */}
        <div className="space-y-5">

          {/* Section label + badge */}
          <div className="flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">
              {t('overviewNeedsAttentionTitle')}
            </p>
            {flags.filter((f) => f.active).length > 0 && (
              <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-amber-500/50 bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-200">
                {flags.filter((f) => f.active).length}
              </span>
            )}
          </div>

          {/* Attention flags */}
          <div className="space-y-1.5">
              {flags.map((flag) => (
                <Link
                  key={flag.id}
                  href={flag.href}
                  className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs transition-colors hover:brightness-110 ${flag.active ? (TONE_ROW[flag.tone] ?? 'border-[color:var(--pt-accent-border)] p-bg-card') : 'border-[color:var(--pt-accent-border)] p-bg-card opacity-40'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${flag.active ? TONE_DOT[flag.tone] : 'bg-[var(--pt-text-muted)]'}`} />
                    <span className="text-[color:var(--pt-text-1)]">{flag.label}</span>
                  </div>
                  {ARROW}
                </Link>
              ))}
              {flags.every((f) => !f.active) && (
                <div className="flex items-center gap-2 rounded border border-emerald-700/30 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {t('overviewAllClear')}
                </div>
              )}
            </div>

          {/* Queue lanes */}
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">
              {t('overviewQueuesTitle')}
            </p>
            <div className="space-y-1.5">
              {queues.map((q) => (
                <Link
                  key={q.key}
                  href={q.href}
                  className="flex items-center justify-between gap-3 rounded border border-[color:var(--pt-accent-border)] p-bg-card px-3 py-2 text-xs transition-colors hover:bg-[var(--pt-accent-dim)]"
                >
                  <span className="text-[color:var(--pt-text-2)]">{q.label}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(q.lane?.byStatus ?? {}).slice(0, 3).map(([status, count]) => (
                        <span
                          key={status}
                          className="rounded border border-[color:var(--pt-accent-border)] px-1.5 py-0.5 text-[10px] text-[color:var(--pt-text-2)]"
                        >
                          {queueStatusLabel(status)}: {count}
                        </span>
                      ))}
                    </div>
                    <span className="font-semibold tabular-nums text-[color:var(--pt-text-1)]">
                      {q.lane?.total ?? 0}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* API pulse row */}
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">
              {t('overviewApiPulseTitle')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  label: t('overviewApiRequests'),
                  value: (signals?.apiTotalRequests ?? 0).toLocaleString(),
                  warn: false,
                },
                {
                  label: t('overviewApiErrorRate'),
                  value: `${((anomalies?.apiErrorRate ?? 0) * 100).toFixed(2)}%`,
                  warn: (anomalies?.apiErrorRate ?? 0) > 0.05,
                },
                {
                  label: t('overviewApiLatency'),
                  value: `${Math.round(anomalies?.apiAvgLatencyMs ?? 0)}ms`,
                  warn: (anomalies?.apiAvgLatencyMs ?? 0) > 500,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-2 text-center"
                >
                  <p className={`text-sm font-semibold tabular-nums ${item.warn ? 'text-amber-300' : 'text-[color:var(--pt-text-1)]'}`}>
                    {item.value}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[color:var(--pt-text-muted)]">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── Right: System Pulse ── */}
        <div className="space-y-5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">
            {t('overviewSystemPulseTitle')}
          </p>

          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: t('overviewKpiBusinesses'), value: kpis?.businesses ?? 0, amber: false },
              { label: t('overviewKpiActive'), value: kpis?.activeBusinesses ?? 0, amber: false },
              { label: t('overviewKpiReview'), value: kpis?.underReview ?? 0, amber: (kpis?.underReview ?? 0) > 0 },
              { label: t('overviewKpiOffline'), value: kpis?.offlineEnabled ?? 0, amber: false },
              {
                label: t('overviewKpiStorage'),
                value: `${(kpis?.totalStorageMb ?? 0).toFixed(1)}`,
                sub: 'MB',
                amber: false,
              },
              {
                label: t('overviewKpiUsersActive'),
                value: kpis?.activeUsers ?? 0,
                sub: `/ ${kpis?.totalUsers ?? 0}`,
                amber: false,
              },
            ].map((kpi) => (
              <div key={kpi.label} className="nvi-tile p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-2)]">{kpi.label}</p>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${kpi.amber ? 'text-amber-200' : 'text-[color:var(--pt-text-1)]'}`}>
                  {kpi.value}
                  {'sub' in kpi && kpi.sub && (
                    <span className="ml-1 text-xs font-normal text-[color:var(--pt-text-muted)]">{kpi.sub}</span>
                  )}
                </p>
              </div>
            ))}
          </div>

          {/* Tier distribution */}
          {tiers.length > 0 && (
            <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.25em] text-[color:var(--pt-text-2)]">
                {t('overviewTierDistributionTitle')}
              </p>
              {tiers.map((entry) => {
                const pct = clampPercent(
                  totalBusinesses > 0 ? (entry.count / totalBusinesses) * 100 : 0,
                );
                return (
                  <div key={entry.tier} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[color:var(--pt-text-2)]">{entry.tier}</span>
                      <span className="tabular-nums text-[color:var(--pt-text-1)]">{entry.count}</span>
                    </div>
                    <div className="h-1.5 rounded p-bg-card">
                      <div
                        className="h-1.5 rounded bg-[var(--pt-accent)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Status distribution */}
          {statuses.length > 0 && (
            <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.25em] text-[color:var(--pt-text-2)]">
                {t('overviewStatusDistributionTitle')}
              </p>
              {statuses.map((entry) => {
                const pct = clampPercent(
                  totalBusinesses > 0 ? (entry.count / totalBusinesses) * 100 : 0,
                );
                const isBad =
                  entry.status === 'SUSPENDED' || entry.status === 'DELETED';
                return (
                  <div key={entry.status} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[color:var(--pt-text-2)]">{entry.status}</span>
                      <span className={`tabular-nums ${isBad ? 'text-amber-200' : 'text-[color:var(--pt-text-1)]'}`}>
                        {entry.count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded p-bg-card">
                      <div
                        className={`h-1.5 rounded transition-all ${isBad ? 'bg-gradient-to-r from-amber-500 to-red-400' : 'bg-[var(--pt-accent)]'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* User composition */}
          {users && (
            <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.25em] text-[color:var(--pt-text-2)]">
                {t('overviewUserCompositionTitle')}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: t('overviewUserActive'), value: users.active },
                  { label: t('overviewUserInactive'), value: users.inactive },
                  { label: t('overviewUserPending'), value: users.pending },
                  { label: t('overviewUserTotal'), value: users.total },
                ].map((u) => (
                  <div
                    key={u.label}
                    className="rounded border border-[color:var(--pt-accent-border)] p-bg-card px-2 py-1.5"
                  >
                    <p className="text-[10px] text-[color:var(--pt-text-2)]">{u.label}</p>
                    <p className="text-base font-semibold tabular-nums text-[color:var(--pt-text-1)]">{u.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick nav */}
          <div className="space-y-1">
            <p className="mb-1.5 text-[10px] uppercase tracking-[0.25em] text-[color:var(--pt-text-2)]">
              {t('overviewCommandsTitle')}
            </p>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between gap-2 rounded border border-[color:var(--pt-accent-border)] p-bg-card px-3 py-2 text-xs text-[color:var(--pt-text-1)] transition-colors hover:bg-[var(--pt-accent-dim)]"
              >
                <span>{link.label}</span>
                {ARROW}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Activity feed — inline, not a separate card */}
      <div className="border-t border-[color:var(--pt-accent-border)] pt-5">
        <PlatformActivitySection
          t={t}
          show
          locale={locale}
          activityFeed={activityFeed}
          withAction={withAction}
          loadActivityFeed={loadActivityFeed}
          actionLoading={actionLoading}
          noCard
        />
      </div>
    </section>
  );
}
