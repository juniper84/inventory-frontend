'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { FlipCounter } from '@/components/analog/FlipCounter';
import { RingGauge } from '@/components/RingGauge';
import { Sparkline } from '@/components/Sparkline';
import type { SystemStatus } from '../hooks/useOverviewDashboard';
import type { OverviewSnapshot } from '@/components/platform/types';

type Props = {
  kpis: OverviewSnapshot['kpis'] | null;
  distributions: OverviewSnapshot['distributions'] | null;
  systemStatus: SystemStatus;
  sparklineData: number[];
};

const STATUS_CONFIG: Record<SystemStatus, { color: string; bg: string; label: string }> = {
  HEALTHY: { color: 'text-emerald-400', bg: 'bg-emerald-400', label: 'statusHealthy' },
  WARNING: { color: 'text-amber-400', bg: 'bg-amber-400', label: 'statusWarning' },
  CRITICAL: { color: 'text-red-400', bg: 'bg-red-400', label: 'statusCritical' },
};

export function SystemPulseHero({ kpis, distributions, systemStatus, sparklineData }: Props) {
  const t = useTranslations('platformConsole');
  const cfg = STATUS_CONFIG[systemStatus];
  const tiers = distributions?.tiers ?? [];
  const tierBreakdown = tiers.filter((t) => t.tier !== 'UNKNOWN');

  return (
    <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-[var(--pt-accent)]">
      <div className="flex flex-wrap items-center gap-6 lg:flex-nowrap">
        {/* System status indicator */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="relative">
            <div className={`h-10 w-10 rounded-full ${cfg.bg} ${systemStatus !== 'HEALTHY' ? 'animate-pulse' : ''}`} style={{ boxShadow: `0 0 16px ${systemStatus === 'HEALTHY' ? 'rgba(52,211,153,0.3)' : systemStatus === 'WARNING' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}` }} />
          </div>
          <span className={`text-[10px] font-semibold uppercase tracking-widest ${cfg.color}`}>
            {t(cfg.label)}
          </span>
        </div>

        {/* KPI row */}
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {/* Businesses */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewKpiBusinesses')}</p>
            <FlipCounter value={kpis?.businesses ?? 0} size="md" digits={3} />
            {tierBreakdown.length > 0 && (
              <p className="text-[9px] text-[var(--pt-text-muted)]">
                {tierBreakdown.map((tier) => `${tier.tier[0]}: ${tier.count}`).join(' · ')}
              </p>
            )}
          </div>

          {/* Active */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewKpiActive')}</p>
            <div className="flex items-center gap-2">
              <FlipCounter value={kpis?.activeBusinesses ?? 0} size="md" digits={3} />
              <RingGauge
                value={kpis?.activeBusinesses ?? 0}
                max={kpis?.businesses || 1}
                size={32}
                stroke={3}
                color="var(--pt-accent)"
              />
            </div>
          </div>

          {/* Revenue (MRR) */}
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewKpiRevenue')}</p>
            <p className="text-lg font-bold text-[var(--pt-text-1)]">—</p>
            <p className="text-[9px] text-[var(--pt-text-muted)]">{t('overviewMrrUnavailable')}</p>
          </div>

          {/* Churn */}
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewKpiChurn')}</p>
            <p className="text-lg font-bold text-[var(--pt-text-1)]">—</p>
          </div>

          {/* Active Users */}
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewKpiUsersActive')}</p>
            <p className="text-lg font-bold text-[var(--pt-text-1)]">
              {kpis?.activeUsers ?? 0} <span className="text-xs font-normal text-[var(--pt-text-muted)]">/ {kpis?.totalUsers ?? 0}</span>
            </p>
          </div>

          {/* Storage */}
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewKpiStorage')}</p>
            <p className="text-lg font-bold text-[var(--pt-text-1)]">{kpis?.totalStorageMb ?? 0} <span className="text-xs font-normal text-[var(--pt-text-muted)]">MB</span></p>
          </div>
        </div>

        {/* Sparkline */}
        {sparklineData.length > 0 && (
          <div className="shrink-0 hidden lg:block">
            <p className="text-[9px] uppercase tracking-widest text-[var(--pt-text-muted)] mb-1">{t('overviewSparklineLabel')}</p>
            <Sparkline
              data={sparklineData}
              width={80}
              height={28}
              color="var(--pt-accent)"
              className="opacity-70"
            />
          </div>
        )}
      </div>
    </Card>
  );
}
