'use client';

import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useOverviewDashboard } from './hooks/useOverviewDashboard';
import { SystemPulseHero } from './sections/SystemPulseHero';
import { AttentionCenter } from './sections/AttentionCenter';
import { QueueMonitor } from './sections/QueueMonitor';
import { PlatformTrendChart } from './sections/PlatformTrendChart';
import { BusinessHealthPanel } from './sections/BusinessHealthPanel';
import { RecentActivityFeed } from './sections/RecentActivityFeed';
import { QuickActionsBar } from './sections/QuickActionsBar';

/**
 * Platform Overview Dashboard — the command center.
 * Answers: "Is everything OK, and if not, what needs my attention?"
 */
export function OverviewDashboardView() {
  const t = useTranslations('platformConsole');
  const dash = useOverviewDashboard();

  // Stale indicator color (green < 5min, amber < 15min, muted >= 15min)
  const staleColor =
    dash.staleMinutes === null
      ? 'text-[var(--pt-text-muted)]'
      : dash.staleMinutes < 5
        ? 'text-emerald-400'
        : dash.staleMinutes < 15
          ? 'text-amber-400'
          : 'text-[var(--pt-text-muted)]';

  // Loading skeleton
  if (dash.isLoading) {
    return (
      <section className="nvi-page space-y-4">
        <PageHeader
          eyebrow={t('overviewSurfaceTag')}
          title={t(dash.greeting)}
        />
        <div className="space-y-4 nvi-stagger">
          {/* Skeleton cards */}
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.03] border border-white/[0.04]" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="nvi-page space-y-4">
      {/* ── Page header ── */}
      <PageHeader
        eyebrow={t('overviewSurfaceTag')}
        title={t(dash.greeting)}
        badges={
          <>
            {dash.lastRefreshed && (
              <span className={`text-[10px] ${staleColor}`}>
                {t('overviewLastUpdated', { minutes: dash.staleMinutes ?? 0 })}
              </span>
            )}
            <button
              type="button"
              onClick={dash.loadSnapshot}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--pt-accent-border)] px-3 py-1 text-[10px] text-[var(--pt-accent)] hover:bg-[var(--pt-accent-dim)] transition nvi-press"
            >
              <RefreshCw size={10} />
              {t('overviewRefresh')}
            </button>
          </>
        }
      />

      {/* ── Row 1: System Pulse Hero ── */}
      <SystemPulseHero
        kpis={dash.kpis}
        distributions={dash.distributions}
        systemStatus={dash.systemStatus}
        sparklineData={dash.sparklineData}
      />

      {/* ── Row 2: Two-column layout ── */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Left column — Attention + Queues + Trend */}
        <div className="space-y-4">
          <AttentionCenter
            activeFlags={dash.activeFlags}
            inactiveCount={dash.inactiveCount}
          />
          <QueueMonitor queues={dash.queues} />
          <PlatformTrendChart series={dash.series} totalRequests={dash.signals?.apiTotalRequests} />
        </div>

        {/* Right column — Distributions + Activity */}
        <div className="space-y-4">
          <BusinessHealthPanel distributions={dash.distributions} />
          <RecentActivityFeed activity={dash.activity} />
        </div>
      </div>

      {/* ── Row 3: Quick Actions ── */}
      <QuickActionsBar />
    </section>
  );
}
