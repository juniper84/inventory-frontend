'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DollarSign,
  TrendingUp,
  Building2,
  UserMinus,
  UserPlus,
  RefreshCw,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/notifications/Banner';
import { FlipCounter } from '@/components/analog/FlipCounter';
import { Sparkline } from '@/components/Sparkline';
import { useAnalytics, type RangeKey } from './hooks/useAnalytics';
import { RevenueTab } from './tabs/RevenueTab';
import { PurchasesTab } from './tabs/PurchasesTab';
import { CohortsTab } from './tabs/CohortsTab';
import { ChurnTab } from './tabs/ChurnTab';
import { ConversionsTab } from './tabs/ConversionsTab';

type TabKey = 'revenue' | 'purchases' | 'cohorts' | 'churn' | 'conversions';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: '12m', label: '12m' },
];

function formatTzsCompact(amount: number): string {
  if (amount >= 1_000_000_000)
    return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return String(amount);
}

function churnClass(rate: number): string {
  if (rate >= 5) return 'text-red-400';
  if (rate >= 2) return 'text-amber-400';
  return 'text-emerald-400';
}

export function AnalyticsView() {
  const t = useTranslations('platformConsole');
  const ana = useAnalytics();
  const [activeTab, setActiveTab] = useState<TabKey>('revenue');

  const totalActive = ana.revenue?.totalSubscribers ?? 0;
  const mrr = ana.revenue?.mrr ?? 0;
  const arr = ana.revenue?.arr ?? 0;
  const churnRate = ana.churn?.churnRate ?? 0;
  const conversionRate = ana.conversions?.conversionRate ?? 0;

  const tierSparkData = ana.revenue
    ? [
        ana.revenue.byTier.STARTER ?? 0,
        ana.revenue.byTier.BUSINESS ?? 0,
        ana.revenue.byTier.ENTERPRISE ?? 0,
      ]
    : [0, 0, 0];

  return (
    <div className="space-y-4 nvi-stagger">
      <PageHeader
        title={t('analyticsTitle')}
        subtitle={t('analyticsSubtitle')}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => ana.setRange(r.key)}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold transition nvi-press ${
                    ana.range === r.key
                      ? 'bg-[var(--pt-accent)] text-black'
                      : 'text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={ana.refreshAll}
              className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)] nvi-press"
            >
              <RefreshCw size={11} />
              {t('analyticsRefresh')}
            </button>
          </div>
        }
      />

      {ana.error && (
        <Banner
          severity="error"
          message={ana.error}
          onDismiss={() => ana.setError(null)}
        />
      )}

      {/* KPI hero strip (5 cards) */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5 nvi-stagger">
        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--pt-accent)]/10">
              <DollarSign size={14} className="text-[var(--pt-accent)]" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('analyticsKpiMrr')}
              </p>
              <p className="text-lg font-bold text-[var(--pt-accent)]">
                {formatTzsCompact(mrr)}
              </p>
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
              <TrendingUp size={14} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('analyticsKpiArr')}
              </p>
              <p className="text-lg font-bold text-emerald-400">
                {formatTzsCompact(arr)}
              </p>
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <Building2 size={14} className="text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('analyticsKpiActiveBusinesses')}
              </p>
              <div className="flex items-baseline gap-2">
                <FlipCounter value={totalActive} size="md" digits={3} />
                <Sparkline data={tierSparkData} width={40} height={14} />
              </div>
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                churnRate >= 5
                  ? 'bg-red-500/10'
                  : churnRate >= 2
                    ? 'bg-amber-500/10'
                    : 'bg-emerald-500/10'
              }`}
            >
              <UserMinus size={14} className={churnClass(churnRate)} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('analyticsKpiChurn')}
              </p>
              <p className={`text-lg font-bold ${churnClass(churnRate)}`}>
                {churnRate}%
              </p>
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
              <UserPlus size={14} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('analyticsKpiConversion')}
              </p>
              <p className="text-lg font-bold text-emerald-400">
                {conversionRate}%
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tab nav */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 w-fit">
        {(
          [
            { key: 'revenue' as const, label: t('analyticsTabRevenue'), icon: DollarSign },
            {
              key: 'purchases' as const,
              label: t('analyticsTabPurchases'),
              icon: ShoppingCart,
            },
            { key: 'cohorts' as const, label: t('analyticsTabCohorts'), icon: Users },
            { key: 'churn' as const, label: t('analyticsTabChurn'), icon: UserMinus },
            {
              key: 'conversions' as const,
              label: t('analyticsTabConversions'),
              icon: UserPlus,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? 'bg-[var(--pt-accent)] text-black'
                  : 'text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)]'
              }`}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'revenue' && (
        <RevenueTab data={ana.revenue} isLoading={ana.isLoadingRevenue} />
      )}
      {activeTab === 'purchases' && <PurchasesTab ana={ana} />}
      {activeTab === 'cohorts' && (
        <CohortsTab data={ana.cohorts} isLoading={ana.isLoadingCohorts} />
      )}
      {activeTab === 'churn' && (
        <ChurnTab data={ana.churn} isLoading={ana.isLoadingChurn} />
      )}
      {activeTab === 'conversions' && (
        <ConversionsTab
          data={ana.conversions}
          isLoading={ana.isLoadingConversions}
        />
      )}
    </div>
  );
}
