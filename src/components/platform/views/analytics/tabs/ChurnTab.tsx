'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { UserMinus, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFormatDate } from '@/lib/business-context';
import { ChurnTrendChart } from '../components/ChurnTrendChart';
import type { ChurnData } from '../hooks/useAnalytics';

type Props = {
  data: ChurnData | null;
  isLoading: boolean;
};

const TIER_COLORS: Record<string, string> = {
  STARTER: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  BUSINESS: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  ENTERPRISE: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/30',
  NONE: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

function churnColor(rate: number): string {
  if (rate >= 5) return 'text-red-400';
  if (rate >= 2) return 'text-amber-400';
  return 'text-emerald-400';
}

export function ChurnTab({ data, isLoading }: Props) {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const { formatDateTime } = useFormatDate();

  if (isLoading && !data) {
    return (
      <div className="space-y-3 nvi-stagger">
        <div className="h-64 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
        <div className="h-48 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={<UserMinus size={28} className="text-[var(--pt-text-muted)]" />}
        title={t('churnEmptyTitle')}
        description={t('churnEmptyHint')}
      />
    );
  }

  return (
    <div className="space-y-4 nvi-stagger">
      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card padding="md" className="nvi-slide-in-bottom">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
            {t('churnCurrentRate')}
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${churnColor(data.churnRate)}`}
          >
            {data.churnRate}%
          </p>
          <p className="text-[10px] text-[var(--pt-text-muted)]">
            {t('churnInRange', { range: data.range })}
          </p>
        </Card>
        <Card padding="md" className="nvi-slide-in-bottom">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
            {t('churnTotalCount')}
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--pt-text-1)]">
            {data.churnedCount}
          </p>
          <p className="text-[10px] text-[var(--pt-text-muted)]">
            {t('churnInRange', { range: data.range })}
          </p>
        </Card>
        <Card padding="md" className="nvi-slide-in-bottom">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
            {t('churnThresholds')}
          </p>
          <div className="mt-2 space-y-0.5 text-[10px]">
            <p className="text-emerald-400">
              {t('churnThresholdGreen')}
            </p>
            <p className="text-amber-400">{t('churnThresholdAmber')}</p>
            <p className="text-red-400">{t('churnThresholdRed')}</p>
          </div>
        </Card>
      </div>

      {/* Churn trend chart */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
            <UserMinus size={14} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
              {t('churnTrendTitle')}
            </h3>
            <p className="text-[10px] text-[var(--pt-text-muted)]">
              {t('churnTrendHint')}
            </p>
          </div>
        </div>
        <ChurnTrendChart
          monthlyChurn={data.monthlyChurn}
          label={t('churnTrendLabel')}
        />
      </Card>

      {/* Recently churned */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
            {t('churnRecentTitle')}
          </h3>
          <span className="text-[10px] text-[var(--pt-text-muted)]">
            ({data.recentlyChurned.length})
          </span>
        </div>
        {data.recentlyChurned.length === 0 ? (
          <p className="text-xs text-[var(--pt-text-muted)] italic">
            {t('churnRecentEmpty')}
          </p>
        ) : (
          <div className="space-y-1.5">
            {data.recentlyChurned.map((c) => (
              <div
                key={c.businessId}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-2 py-1.5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${TIER_COLORS[c.tier] ?? TIER_COLORS.NONE}`}
                  >
                    {c.tier}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[var(--pt-text-1)]">
                      {c.name}
                    </p>
                    <p className="text-[10px] text-[var(--pt-text-muted)]">
                      {c.status} • {formatDateTime(c.churnedAt)}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/${locale}/platform/businesses/${c.businessId}`}
                  className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)] nvi-press"
                >
                  {t('churnViewBusiness')}
                  <ExternalLink size={10} />
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
