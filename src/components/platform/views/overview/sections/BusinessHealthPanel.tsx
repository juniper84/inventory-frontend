'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import type { OverviewSnapshot } from '@/components/platform/types';

type Props = {
  distributions: OverviewSnapshot['distributions'] | null;
};

const TIER_COLORS: Record<string, string> = {
  STARTER: 'bg-amber-400',
  BUSINESS: 'bg-blue-400',
  ENTERPRISE: 'bg-yellow-300',
  UNKNOWN: 'bg-zinc-500',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-400',
  GRACE: 'bg-amber-400',
  EXPIRED: 'bg-red-400',
  SUSPENDED: 'bg-zinc-400',
};

function DistBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-20 shrink-0 text-[var(--pt-text-2)]">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-[var(--pt-text-muted)] tabular-nums">{count}</span>
      <span className="w-10 shrink-0 text-right text-[var(--pt-text-muted)] text-[10px]">{pct.toFixed(0)}%</span>
    </div>
  );
}

export function BusinessHealthPanel({ distributions }: Props) {
  const t = useTranslations('platformConsole');

  if (!distributions) return null;

  const tiers = distributions.tiers ?? [];
  const statuses = distributions.businessStatuses ?? [];
  const users = distributions.users;
  const underReview = distributions.underReview ?? 0;
  const totalBiz = tiers.reduce((s, t) => s + t.count, 0);
  const totalStatus = statuses.reduce((s, t) => s + t.count, 0);

  return (
    <Card padding="lg" className="nvi-slide-in-bottom">
      {/* Tier distribution */}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-muted)]">
        {t('overviewTierDistributionTitle')}
      </p>
      <div className="space-y-1.5 mb-4">
        {tiers.map((tier) => (
          <DistBar
            key={tier.tier}
            label={tier.tier}
            count={tier.count}
            total={totalBiz}
            color={TIER_COLORS[tier.tier] ?? 'bg-zinc-500'}
          />
        ))}
      </div>

      {/* Status distribution */}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-muted)]">
        {t('overviewStatusDistributionTitle')}
      </p>
      <div className="space-y-1.5 mb-3">
        {statuses.map((status) => (
          <DistBar
            key={status.status}
            label={status.status}
            count={status.count}
            total={totalStatus}
            color={STATUS_COLORS[status.status] ?? 'bg-zinc-500'}
          />
        ))}
      </div>

      {/* Under Review — separate indicator */}
      {underReview > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          {t('overviewUnderReviewCount', { count: underReview })}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-white/[0.06] my-3" />

      {/* User composition */}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-muted)]">
        {t('overviewUserCompositionTitle')}
      </p>
      {users && (
        <div className="grid grid-cols-2 gap-2">
          {([
            { label: 'Active', value: users.active, dot: 'bg-emerald-400' },
            { label: 'Inactive', value: users.inactive, dot: 'bg-zinc-400' },
            { label: 'Pending', value: users.pending, dot: 'bg-amber-400' },
            { label: 'Total', value: users.total, dot: 'bg-[var(--pt-accent)]' },
          ] as const).map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
              <span className="text-[var(--pt-text-muted)]">{item.label}</span>
              <span className="ml-auto font-semibold text-[var(--pt-text-1)] tabular-nums">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
