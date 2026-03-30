import { useState } from 'react';
import { Spinner } from '@/components/Spinner';

type RevenueData = {
  mrr: number;
  arr: number;
  byTier: Record<string, number>;
  monthly: { month: string; revenue: number; collected: number }[];
  totalPaidSubscribers: number;
  paidCount: number;
  complimentaryCount: number;
  totalCollected: number;
  generatedAt: string;
};

type CohortEntry = {
  month: string;
  count: number;
  byTier: Record<string, number>;
  active: number;
};

type CohortsData = {
  cohorts: CohortEntry[];
  generatedAt: string;
};

type ChurnData = {
  range: string;
  churnRate: number;
  churnedCount: number;
  recentlyChurned: {
    businessId: string;
    name: string;
    status: string;
    tier: string;
    churnedAt: string;
  }[];
  generatedAt: string;
};

type ConversionsData = {
  conversionRate: number;
  totalConversions: number;
  totalTrialBusinesses: number;
  avgTrialDays: number | null;
  monthlyConversions: { month: string; conversions: number }[];
  generatedAt: string;
};

type AnalyticsTab = 'revenue' | 'cohorts' | 'churn' | 'conversions';

const TIER_BADGE: Record<string, string> = {
  STARTER: 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-2)]',
  BUSINESS: 'border-sky-500/40 text-sky-300',
  ENTERPRISE: 'border-violet-500/40 text-violet-300',
  NONE: 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)]',
};

const CHURN_RANGE_OPTIONS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[color:var(--pt-text-1)]">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-[color:var(--pt-text-muted)]">{sub}</p>}
    </div>
  );
}

function MiniBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-20 truncate text-[color:var(--pt-text-2)]">{label}</span>
      <div className="flex-1 rounded-full p-bg-card" style={{ height: '6px' }}>
        <div
          className="rounded-full bg-[var(--pt-accent)]"
          style={{ width: `${pct}%`, height: '6px' }}
        />
      </div>
      <span className="w-8 text-right tabular-nums text-[color:var(--pt-text-2)]">{value}</span>
    </div>
  );
}

export function PlatformAnalyticsCommandSurface({
  show,
  t,
  locale,
  withAction,
  actionLoading,
  analyticsRevenue,
  analyticsCohorts,
  analyticsChurn,
  analyticsConversions,
  loadAnalyticsRevenue,
  loadAnalyticsCohorts,
  loadAnalyticsChurn,
  loadAnalyticsConversions,
  analyticsChurnRange,
  setAnalyticsChurnRange,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: string;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  actionLoading: Record<string, boolean>;
  analyticsRevenue: RevenueData | null;
  analyticsCohorts: CohortsData | null;
  analyticsChurn: ChurnData | null;
  analyticsConversions: ConversionsData | null;
  loadAnalyticsRevenue: () => Promise<void>;
  loadAnalyticsCohorts: () => Promise<void>;
  loadAnalyticsChurn: (range?: string) => Promise<void>;
  loadAnalyticsConversions: () => Promise<void>;
  analyticsChurnRange: string;
  setAnalyticsChurnRange: (v: string) => void;
}) {
  const [tab, setTab] = useState<AnalyticsTab>('revenue');

  if (!show) return null;

  const TABS: { key: AnalyticsTab; label: string }[] = [
    { key: 'revenue', label: t('analyticsTabRevenue') },
    { key: 'cohorts', label: t('analyticsTabCohorts') },
    { key: 'churn', label: t('analyticsTabChurn') },
    { key: 'conversions', label: t('analyticsTabConversions') },
  ];

  const maxMonthlyRevenue = Math.max(...(analyticsRevenue?.monthly.map((m) => m.collected ?? m.revenue) ?? [0]), 1);
  const maxMonthlyConv = Math.max(
    ...(analyticsConversions?.monthlyConversions.map((m) => m.conversions) ?? [0]),
    1,
  );

  return (
    <section className="command-card p-6 space-y-5 nvi-reveal">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">
            {t('analyticsTag')}
          </p>
          <h3 className="text-xl font-semibold text-[color:var(--pt-text-1)]">{t('analyticsTitle')}</h3>
        </div>
        <button
          type="button"
          onClick={() =>
            withAction('analytics:refreshAll', async () => {
              await Promise.all([
                loadAnalyticsRevenue(),
                loadAnalyticsCohorts(),
                loadAnalyticsChurn(analyticsChurnRange),
                loadAnalyticsConversions(),
              ]);
            })
          }
          className="rounded border border-[color:var(--pt-accent-border-hi)] px-3 py-1 text-xs text-[color:var(--pt-text-1)]"
        >
          <span className="inline-flex items-center gap-2">
            {actionLoading['analytics:refreshAll'] ? <Spinner size="xs" variant="bars" /> : null}
            {t('refresh')}
          </span>
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={`rounded border px-3 py-1 text-[10px] uppercase tracking-[0.2em] transition-colors ${
              tab === tb.key
                ? 'border-[color:var(--pt-accent)] bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-1)]'
                : 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-2)]'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* ── Revenue tab ── */}
      {tab === 'revenue' && (
        <div className="space-y-5">
          {analyticsRevenue ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                  label={t('analyticsMRR')}
                  value={`TSh ${analyticsRevenue.mrr.toLocaleString()}`}
                  sub={t('analyticsMonthlyRecurring')}
                />
                <StatCard
                  label={t('analyticsARR')}
                  value={`TSh ${analyticsRevenue.arr.toLocaleString()}`}
                  sub={t('analyticsAnnualRecurring')}
                />
                <StatCard
                  label={t('analyticsPaidSubscribers')}
                  value={analyticsRevenue.totalPaidSubscribers}
                  sub={t('analyticsActiveAndGrace')}
                />
                <StatCard
                  label={t('analyticsPaidPurchases')}
                  value={analyticsRevenue.paidCount ?? 0}
                  sub={t('analyticsPaidPurchasesSub')}
                />
                <StatCard
                  label={t('analyticsComplimentaryPurchases')}
                  value={analyticsRevenue.complimentaryCount ?? 0}
                  sub={t('analyticsComplimentaryPurchasesSub')}
                />
                <StatCard
                  label={t('analyticsTotalCollected')}
                  value={`TSh ${(analyticsRevenue.totalCollected ?? 0).toLocaleString()}`}
                  sub={t('analyticsTotalCollectedSub')}
                />
              </div>

              {/* By tier */}
              <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep p-4">
                <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                  {t('analyticsByTier')}
                </p>
                <div className="space-y-2">
                  {Object.entries(analyticsRevenue.byTier).map(([tier, revenue]) => (
                    <div key={tier} className="flex items-center justify-between text-xs">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${TIER_BADGE[tier] ?? TIER_BADGE.NONE}`}
                      >
                        {tier}
                      </span>
                      <span className="tabular-nums text-[color:var(--pt-text-1)]">
                        TSh {revenue.toLocaleString()} / mo
                      </span>
                    </div>
                  ))}
                  {!Object.keys(analyticsRevenue.byTier).length && (
                    <p className="text-[11px] text-[color:var(--pt-text-muted)]">{t('analyticsNoRevenue')}</p>
                  )}
                </div>
              </div>

              {/* Monthly trend */}
              <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep p-4">
                <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                  {t('analyticsMonthlyTrend')}
                </p>
                <div className="space-y-2">
                  {analyticsRevenue.monthly.map((m) => (
                    <MiniBar
                      key={m.month}
                      label={m.month}
                      value={m.collected ?? m.revenue}
                      max={maxMonthlyRevenue}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-10">
              {actionLoading['analytics:refreshAll'] ? (
                <Spinner size="sm" variant="grid" />
              ) : (
                <p className="text-sm text-[color:var(--pt-text-muted)]">{t('analyticsNoData')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Cohorts tab ── */}
      {tab === 'cohorts' && (
        <div className="space-y-4">
          {analyticsCohorts ? (
            <>
              <div className="overflow-x-auto rounded border border-[color:var(--pt-accent-border)] p-bg-card">
                <table className="min-w-full text-[12px] text-[color:var(--pt-text-1)]">
                  <thead>
                    <tr className="border-b border-[color:var(--pt-accent-border)] text-left text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-2)]">
                      <th className="px-3 py-2.5">{t('analyticsCohortMonth')}</th>
                      <th className="px-3 py-2.5">{t('analyticsCohortTotal')}</th>
                      <th className="px-3 py-2.5">{t('analyticsCohortActive')}</th>
                      <th className="px-3 py-2.5">{t('analyticsCohortTiers')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--pt-accent-border)]">
                    {analyticsCohorts.cohorts.slice(0, 24).map((cohort) => (
                      <tr key={cohort.month} className="hover:bg-[var(--pt-accent-dim)]">
                        <td className="px-3 py-2 font-mono text-[color:var(--pt-text-2)]">{cohort.month}</td>
                        <td className="px-3 py-2 tabular-nums">{cohort.count}</td>
                        <td className="px-3 py-2 tabular-nums text-emerald-300">{cohort.active}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(cohort.byTier).map(([tier, cnt]) => (
                              <span
                                key={tier}
                                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] ${TIER_BADGE[tier] ?? TIER_BADGE.NONE}`}
                              >
                                {tier} {cnt}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!analyticsCohorts.cohorts.length && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-[color:var(--pt-text-muted)]">
                          {t('analyticsNoData')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-10">
              {actionLoading['analytics:refreshAll'] ? (
                <Spinner size="sm" variant="grid" />
              ) : (
                <p className="text-sm text-[color:var(--pt-text-muted)]">{t('analyticsNoData')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Churn tab ── */}
      {tab === 'churn' && (
        <div className="space-y-4">
          {/* Range picker */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[color:var(--pt-text-muted)]">{t('analyticsChurnRange')}</span>
            {CHURN_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setAnalyticsChurnRange(opt.value);
                  void withAction('analytics:churn', () => loadAnalyticsChurn(opt.value));
                }}
                className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] transition-colors ${
                  analyticsChurnRange === opt.value
                    ? 'border-[color:var(--pt-accent)] bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-1)]'
                    : 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:text-[color:var(--pt-text-2)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {actionLoading['analytics:churn'] ? <Spinner size="xs" variant="dots" /> : null}
          </div>

          {analyticsChurn ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard
                  label={t('analyticsChurnRate')}
                  value={`${analyticsChurn.churnRate}%`}
                  sub={t('analyticsChurnRatePeriod', { range: analyticsChurn.range })}
                />
                <StatCard
                  label={t('analyticsChurnedCount')}
                  value={analyticsChurn.churnedCount}
                  sub={t('analyticsArchivedOrDeleted')}
                />
              </div>

              {analyticsChurn.recentlyChurned.length > 0 && (
                <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card">
                  <p className="border-b border-[color:var(--pt-accent-border)] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                    {t('analyticsRecentlyChurned')}
                  </p>
                  <div className="divide-y divide-[color:var(--pt-accent-border)]">
                    {analyticsChurn.recentlyChurned.map((b) => (
                      <div
                        key={b.businessId}
                        className="flex items-center justify-between px-3 py-2 text-xs"
                      >
                        <div>
                          <p className="text-[color:var(--pt-text-1)]">{b.name}</p>
                          <p className="font-mono text-[11px] text-[color:var(--pt-text-muted)]">
                            {b.businessId.slice(0, 16)}…
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] uppercase ${TIER_BADGE[b.tier] ?? TIER_BADGE.NONE}`}
                          >
                            {b.tier}
                          </span>
                          <p className="mt-0.5 text-[11px] text-[color:var(--pt-text-muted)]">
                            {new Date(b.churnedAt).toLocaleDateString(locale)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-10">
              {actionLoading['analytics:refreshAll'] || actionLoading['analytics:churn'] ? (
                <Spinner size="sm" variant="grid" />
              ) : (
                <p className="text-sm text-[color:var(--pt-text-muted)]">{t('analyticsNoData')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Conversions tab ── */}
      {tab === 'conversions' && (
        <div className="space-y-5">
          {analyticsConversions ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label={t('analyticsConversionRate')}
                  value={`${analyticsConversions.conversionRate}%`}
                  sub={t('analyticsTrialToPaid')}
                />
                <StatCard
                  label={t('analyticsConversionsTotal')}
                  value={analyticsConversions.totalConversions}
                  sub={t('analyticsUniqueBusinesses')}
                />
                <StatCard
                  label={t('analyticsTrialBusinesses')}
                  value={analyticsConversions.totalTrialBusinesses}
                  sub={t('analyticsEverTrialed')}
                />
                <StatCard
                  label={t('analyticsAvgTrialDays')}
                  value={
                    analyticsConversions.avgTrialDays !== null
                      ? `${analyticsConversions.avgTrialDays}d`
                      : '—'
                  }
                  sub={t('analyticsAvgTrialSub')}
                />
              </div>

              <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep p-4">
                <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
                  {t('analyticsConversionTrend')}
                </p>
                <div className="space-y-2">
                  {analyticsConversions.monthlyConversions.map((m) => (
                    <MiniBar
                      key={m.month}
                      label={m.month}
                      value={m.conversions}
                      max={maxMonthlyConv}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-10">
              {actionLoading['analytics:refreshAll'] ? (
                <Spinner size="sm" variant="grid" />
              ) : (
                <p className="text-sm text-[color:var(--pt-text-muted)]">{t('analyticsNoData')}</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
