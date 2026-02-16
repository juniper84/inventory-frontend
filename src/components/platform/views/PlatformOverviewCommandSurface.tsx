import Link from 'next/link';
import { Spinner } from '@/components/Spinner';

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
}) {
  if (!show) {
    return null;
  }

  return (
    <section className="command-card p-6 space-y-4 nvi-reveal">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold-500">
            {t('overviewSurfaceTag')}
          </p>
          <h3 className="text-xl font-semibold text-gold-100">
            {t('overviewSurfaceTitle')}
          </h3>
          <p className="text-xs text-gold-400">
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
              Promise.all([loadOverviewSnapshot(), loadQueuesSummary()]).then(
                () => undefined,
              ),
            )
          }
          className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100 disabled:opacity-70"
          disabled={isLoadingOverview}
        >
          <span className="inline-flex items-center gap-2">
            {isLoadingOverview ? <Spinner size="xs" variant="grid" /> : null}
            {isLoadingOverview ? t('loading') : t('refresh')}
          </span>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="nvi-tile p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">
            {t('overviewKpiBusinesses')}
          </p>
          <p className="mt-1 text-2xl font-semibold text-gold-100">
            {overviewSnapshot?.kpis.businesses ?? 0}
          </p>
        </div>
        <div className="nvi-tile p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">
            {t('overviewKpiActive')}
          </p>
          <p className="mt-1 text-2xl font-semibold text-gold-100">
            {overviewSnapshot?.kpis.activeBusinesses ?? 0}
          </p>
        </div>
        <div className="nvi-tile p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">
            {t('overviewKpiReview')}
          </p>
          <p className="mt-1 text-2xl font-semibold text-amber-200">
            {overviewSnapshot?.kpis.underReview ?? 0}
          </p>
        </div>
        <div className="nvi-tile p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">
            {t('overviewKpiOffline')}
          </p>
          <p className="mt-1 text-2xl font-semibold text-gold-100">
            {overviewSnapshot?.kpis.offlineEnabled ?? 0}
          </p>
        </div>
        <div className="nvi-tile p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">
            {t('overviewKpiStorage')}
          </p>
          <p className="mt-1 text-2xl font-semibold text-gold-100">
            {(overviewSnapshot?.kpis.totalStorageMb ?? 0).toFixed(1)}
          </p>
        </div>
        <div className="nvi-tile p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">
            {t('overviewKpiUsersActive')}
          </p>
          <p className="mt-1 text-2xl font-semibold text-gold-100">
            {overviewSnapshot?.kpis.activeUsers ?? 0}
          </p>
          <p className="text-[11px] text-gold-400">
            {t('overviewKpiUsersTotal', { value: overviewSnapshot?.kpis.totalUsers ?? 0 })}
          </p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {[
          {
            key: 'queue',
            glyph: 'Q',
            title: t('overviewSignalQueuePressure'),
            value: overviewSnapshot?.signals?.queuePressureTotal ?? 0,
            sub: t('overviewSignalQueuePressureHint'),
          },
          {
            key: 'exports',
            glyph: 'E',
            title: t('overviewSignalExportsFailed'),
            value: overviewSnapshot?.signals?.exportsFailed ?? 0,
            sub: t('overviewSignalExportsFailedHint'),
          },
          {
            key: 'traffic',
            glyph: 'A',
            title: t('overviewSignalApiTraffic'),
            value: overviewSnapshot?.signals?.apiTotalRequests ?? 0,
            sub: t('overviewSignalApiTrafficHint'),
          },
        ].map((signal) => (
          <div key={signal.key} className="rounded border border-gold-700/40 bg-black/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-gold-700/50 bg-gold-500/10 text-[11px] font-semibold text-gold-100">
                  {signal.glyph}
                </span>
                <p className="text-xs uppercase tracking-[0.2em] text-gold-500">{signal.title}</p>
              </div>
              <p className="text-lg font-semibold text-gold-100">{signal.value}</p>
            </div>
            <p className="mt-2 text-[11px] text-gold-400">{signal.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded border border-gold-700/40 bg-black/30 p-3 text-xs text-gold-300">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-gold-700/50 bg-gold-500/10 text-[11px] font-semibold text-gold-100">
              T
            </span>
            <p className="text-sm font-semibold text-gold-100">{t('overviewTierDistributionTitle')}</p>
          </div>
          <div className="space-y-2">
            {(overviewSnapshot?.distributions?.tiers ?? []).map((entry) => {
              const total = overviewSnapshot?.kpis.businesses ?? 0;
              const percent = clampPercent(total > 0 ? (entry.count / total) * 100 : 0);
              return (
                <div key={`tier:${entry.tier}`} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <p className="text-gold-300">{t('overviewTierLabel', { value: entry.tier })}</p>
                    <p className="text-gold-100">{entry.count}</p>
                  </div>
                  <div className="h-2 rounded bg-gold-900/40">
                    <div
                      className="h-2 rounded bg-gradient-to-r from-gold-500 to-amber-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded border border-gold-700/40 bg-black/30 p-3 text-xs text-gold-300">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-gold-700/50 bg-gold-500/10 text-[11px] font-semibold text-gold-100">
              S
            </span>
            <p className="text-sm font-semibold text-gold-100">{t('overviewStatusDistributionTitle')}</p>
          </div>
          <div className="space-y-2">
            {(overviewSnapshot?.distributions?.businessStatuses ?? []).map((entry) => {
              const total = overviewSnapshot?.kpis.businesses ?? 0;
              const percent = clampPercent(total > 0 ? (entry.count / total) * 100 : 0);
              return (
                <div key={`status:${entry.status}`} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <p className="text-gold-300">{t('overviewStatusLabel', { value: entry.status })}</p>
                    <p className="text-gold-100">{entry.count}</p>
                  </div>
                  <div className="h-2 rounded bg-gold-900/40">
                    <div
                      className="h-2 rounded bg-gradient-to-r from-amber-400 to-yellow-200"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded border border-gold-700/40 bg-black/30 p-3 text-xs text-gold-300">
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-gold-700/50 bg-gold-500/10 text-[11px] font-semibold text-gold-100">
            U
          </span>
          <p className="text-sm font-semibold text-gold-100">{t('overviewUserCompositionTitle')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded border border-gold-700/50 bg-black/40 p-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">{t('overviewUserActive')}</p>
            <p className="mt-1 text-lg font-semibold text-gold-100">
              {overviewSnapshot?.distributions?.users?.active ?? 0}
            </p>
          </div>
          <div className="rounded border border-gold-700/50 bg-black/40 p-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">{t('overviewUserInactive')}</p>
            <p className="mt-1 text-lg font-semibold text-gold-100">
              {overviewSnapshot?.distributions?.users?.inactive ?? 0}
            </p>
          </div>
          <div className="rounded border border-gold-700/50 bg-black/40 p-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">{t('overviewUserPending')}</p>
            <p className="mt-1 text-lg font-semibold text-gold-100">
              {overviewSnapshot?.distributions?.users?.pending ?? 0}
            </p>
          </div>
          <div className="rounded border border-gold-700/50 bg-black/40 p-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">{t('overviewUserTotal')}</p>
            <p className="mt-1 text-lg font-semibold text-gold-100">
              {overviewSnapshot?.distributions?.users?.total ?? 0}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-gold-700/40 bg-black/30 p-3 text-xs text-gold-300">
          <p className="mb-2 text-sm font-semibold text-gold-100">
            {t('overviewAnomaliesTitle')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <p>{t('overviewAnomalyOffline', { value: overviewSnapshot?.anomalies.offlineFailures ?? 0 })}</p>
            <p>{t('overviewAnomalyExports', { value: overviewSnapshot?.anomalies.exportsPending ?? 0 })}</p>
            <p>
              {t('overviewAnomalyErrorRate', {
                value: ((overviewSnapshot?.anomalies.apiErrorRate ?? 0) * 100).toFixed(2),
              })}
            </p>
            <p>{t('overviewAnomalyLatency', { value: Math.round(overviewSnapshot?.anomalies.apiAvgLatencyMs ?? 0) })}</p>
            <p>
              {t('overviewAnomalyAnnouncements', {
                value: overviewSnapshot?.anomalies.activeAnnouncements ?? 0,
              })}
            </p>
          </div>
        </div>

        <div className="rounded border border-gold-700/40 bg-black/30 p-3 text-xs text-gold-300">
          <p className="mb-2 text-sm font-semibold text-gold-100">
            {t('overviewCommandsTitle')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              href={`/${locale}/platform/businesses`}
              className="rounded border border-gold-700/50 px-3 py-2 text-gold-100 hover:bg-gold-500/10"
            >
              {t('overviewCommandBusinesses')}
            </Link>
            <Link
              href={`/${locale}/platform/support`}
              className="rounded border border-gold-700/50 px-3 py-2 text-gold-100 hover:bg-gold-500/10"
            >
              {t('overviewCommandSupport')}
            </Link>
            <Link
              href={`/${locale}/platform/exports`}
              className="rounded border border-gold-700/50 px-3 py-2 text-gold-100 hover:bg-gold-500/10"
            >
              {t('overviewCommandExports')}
            </Link>
            <Link
              href={`/${locale}/platform/incidents`}
              className="rounded border border-gold-700/50 px-3 py-2 text-gold-100 hover:bg-gold-500/10"
            >
              {t('overviewCommandIncidents')}
            </Link>
            <Link
              href={`/${locale}/platform/health`}
              className="rounded border border-gold-700/50 px-3 py-2 text-gold-100 hover:bg-gold-500/10"
            >
              {t('overviewCommandHealth')}
            </Link>
            <Link
              href={`/${locale}/platform/audit`}
              className="rounded border border-gold-700/50 px-3 py-2 text-gold-100 hover:bg-gold-500/10"
            >
              {t('overviewCommandAudit')}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {[
          {
            key: 'support',
            label: t('overviewQueueSupport'),
            lane: overviewQueues?.support,
          },
          {
            key: 'exports',
            label: t('overviewQueueExports'),
            lane: overviewQueues?.exports,
          },
          {
            key: 'subscriptions',
            label: t('overviewQueueSubscriptions'),
            lane: overviewQueues?.subscriptions,
          },
        ].map((block) => (
          <div
            key={block.key}
            className="rounded border border-gold-700/40 bg-black/30 p-3 text-xs text-gold-300"
          >
            <p className="text-sm font-semibold text-gold-100">
              {block.label} ({block.lane?.total ?? 0})
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(block.lane?.byStatus ?? {}).map(([status, count]) => (
                <span
                  key={`${block.key}:${status}`}
                  className="rounded border border-gold-700/50 px-2 py-1 text-[11px]"
                >
                  {queueStatusLabel(status)}: {count}
                </span>
              ))}
              {!Object.keys(block.lane?.byStatus ?? {}).length ? (
                <p className="text-[11px] text-gold-500">{t('laneEmpty')}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded border border-gold-700/40 bg-black/30 p-3 text-xs text-gold-300">
        <p className="mb-2 text-sm font-semibold text-gold-100">
          {t('overviewRecentPlatformActions')}
        </p>
        {overviewSnapshot?.activity?.length ? (
          <div className="space-y-1">
            {overviewSnapshot.activity.slice(0, 8).map((entry) => (
              <p key={entry.id}>
                {entry.action} • {entry.resourceType}
                {entry.resourceId ? ` • ${entry.resourceId}` : ''} •{' '}
                {new Date(entry.createdAt).toLocaleString(locale)}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-gold-500">{t('overviewNoRecentActions')}</p>
        )}
      </div>
    </section>
  );
}
