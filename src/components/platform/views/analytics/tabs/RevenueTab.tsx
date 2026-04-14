'use client';

import { useTranslations } from 'next-intl';
import { DollarSign, TrendingUp, CreditCard, Gift } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { RingGauge } from '@/components/RingGauge';
import { RevenueChart } from '../components/RevenueChart';
import type { RevenueData } from '../hooks/useAnalytics';

type Props = {
  data: RevenueData | null;
  isLoading: boolean;
};

const TIER_COLORS: Record<string, string> = {
  STARTER: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  BUSINESS: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  ENTERPRISE: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/30',
};

function formatTzs(amount: number): string {
  return `TZS ${amount.toLocaleString()}`;
}

export function RevenueTab({ data, isLoading }: Props) {
  const t = useTranslations('platformConsole');

  if (isLoading && !data) {
    return (
      <div className="space-y-3 nvi-stagger">
        <div className="h-64 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={<DollarSign size={28} className="text-[var(--pt-text-muted)]" />}
        title={t('analyticsNoRevenueTitle')}
        description={t('analyticsNoRevenueHint')}
      />
    );
  }

  const totalMrr = data.mrr;
  const paidRatio =
    data.totalSubscribers > 0
      ? (data.paidCount / data.totalSubscribers) * 100
      : 0;

  return (
    <div className="space-y-4 nvi-stagger">
      {/* Revenue trend chart */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pt-accent)]/10">
            <TrendingUp size={14} className="text-[var(--pt-accent)]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
              {t('revenueTrendTitle')}
            </h3>
            <p className="text-[10px] text-[var(--pt-text-muted)]">
              {t('revenueTrendHint')}
            </p>
          </div>
        </div>
        <RevenueChart
          monthly={data.monthly}
          labels={{
            collected: t('revenueSeriesCollected'),
            estimated: t('revenueSeriesEstimated'),
          }}
        />
      </Card>

      {/* MRR by tier cards */}
      <div>
        <h3 className="mb-2 text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
          {t('revenueMrrByTier')}
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          {(['STARTER', 'BUSINESS', 'ENTERPRISE'] as const).map((tier) => {
            const tierMrr = data.byTier[tier] ?? 0;
            const pct =
              totalMrr > 0 ? ((tierMrr / totalMrr) * 100).toFixed(1) : '0.0';
            return (
              <Card
                key={tier}
                padding="md"
                className="nvi-slide-in-bottom"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${TIER_COLORS[tier]}`}
                  >
                    {tier}
                  </span>
                  <span className="text-[10px] text-[var(--pt-text-muted)]">
                    {pct}%
                  </span>
                </div>
                <p className="text-lg font-bold text-[var(--pt-text-1)]">
                  {formatTzs(tierMrr)}
                </p>
                <p className="text-[10px] text-[var(--pt-text-muted)]">
                  {t('revenueMrrPerMonth')}
                </p>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Paid vs Complimentary + Subscribers */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <CreditCard size={14} className="text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
              {t('revenuePaidVsCompTitle')}
            </h3>
          </div>
          <div className="flex items-center gap-4">
            <RingGauge
              value={data.paidCount}
              max={data.totalSubscribers || 1}
              size={80}
              color="var(--pt-accent, #c9a84c)"
              label={`${paidRatio.toFixed(0)}%`}
            />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--pt-text-muted)]">
                  <CreditCard size={10} className="inline mr-1" />
                  {t('revenuePaidLabel')}
                </span>
                <span className="text-sm font-bold text-emerald-400">
                  {data.paidCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--pt-text-muted)]">
                  <Gift size={10} className="inline mr-1" />
                  {t('revenueComplimentaryLabel')}
                </span>
                <span className="text-sm font-bold text-blue-400">
                  {data.complimentaryCount}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-white/[0.06] pt-1.5">
                <span className="text-[10px] text-[var(--pt-text-muted)]">
                  {t('revenueCollectedTotal')}
                </span>
                <span className="text-sm font-bold text-[var(--pt-accent)]">
                  {formatTzs(data.totalCollected)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <TrendingUp size={14} className="text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
              {t('revenueSubscribersTitle')}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-2">
              <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('revenueTotalSubscribers')}
              </p>
              <p className="mt-0.5 text-xl font-bold text-[var(--pt-text-1)]">
                {data.totalSubscribers}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-2">
              <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('revenuePaidSubscribers')}
              </p>
              <p className="mt-0.5 text-xl font-bold text-[var(--pt-accent)]">
                {data.paidSubscribers}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
