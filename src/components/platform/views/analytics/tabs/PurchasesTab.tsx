'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ShoppingCart,
  Filter as FilterIcon,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Gift,
  ExternalLink,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SmartSelect } from '@/components/SmartSelect';
import { DateTimePickerInput } from '@/components/DateTimePickerInput';
import { useFormatDate } from '@/lib/business-context';
import { PurchaseTimeline } from '../components/PurchaseTimeline';
import type { useAnalytics } from '../hooks/useAnalytics';

type Props = {
  ana: ReturnType<typeof useAnalytics>;
};

const TIER_COLORS: Record<string, string> = {
  STARTER: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  BUSINESS: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  ENTERPRISE: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/30',
};

function formatTzs(amount: number): string {
  return `TZS ${amount.toLocaleString()}`;
}

export function PurchasesTab({ ana }: Props) {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const { formatDateTime } = useFormatDate();

  const paidOptions = [
    { value: 'all', label: t('purchaseFilterPaidAll') },
    { value: 'paid', label: t('purchaseFilterPaidOnly') },
    { value: 'complimentary', label: t('purchaseFilterCompOnly') },
  ];
  const tierOptions = [
    { value: '', label: t('purchaseFilterTierAll') },
    { value: 'STARTER', label: 'STARTER' },
    { value: 'BUSINESS', label: 'BUSINESS' },
    { value: 'ENTERPRISE', label: 'ENTERPRISE' },
  ];

  return (
    <div className="space-y-4 nvi-stagger">
      {/* Summary cards */}
      {ana.purchaseSummary && (
        <div className="grid gap-3 md:grid-cols-4">
          <Card padding="md" className="nvi-slide-in-bottom">
            <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
              {t('purchaseSummaryTotal')}
            </p>
            <p className="mt-1 text-xl font-bold text-[var(--pt-text-1)]">
              {ana.purchaseSummary.totalPurchases}
            </p>
          </Card>
          <Card padding="md" className="nvi-slide-in-bottom">
            <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
              {t('purchaseSummaryCollected')}
            </p>
            <p className="mt-1 text-xl font-bold text-[var(--pt-accent)]">
              {formatTzs(ana.purchaseSummary.totalCollected)}
            </p>
          </Card>
          <Card padding="md" className="nvi-slide-in-bottom">
            <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
              {t('purchaseSummaryPaid')}
            </p>
            <p className="mt-1 text-xl font-bold text-emerald-400">
              {ana.purchaseSummary.paidCount}
            </p>
          </Card>
          <Card padding="md" className="nvi-slide-in-bottom">
            <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
              {t('purchaseSummaryComp')}
            </p>
            <p className="mt-1 text-xl font-bold text-blue-400">
              {ana.purchaseSummary.complimentaryCount}
            </p>
          </Card>
        </div>
      )}

      {/* Monthly timeline chart */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
            <ShoppingCart size={14} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
              {t('purchaseTimelineTitle')}
            </h3>
            <p className="text-[10px] text-[var(--pt-text-muted)]">
              {t('purchaseTimelineHint')}
            </p>
          </div>
        </div>
        <PurchaseTimeline
          purchases={ana.purchases}
          labels={{
            volume: t('purchaseTimelineVolume'),
            revenue: t('purchaseTimelineRevenue'),
          }}
        />
      </Card>

      {/* Filter bar */}
      <Card padding="md">
        <div className="mb-2 flex items-center gap-2">
          <FilterIcon size={12} className="text-[var(--pt-text-muted)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-2)]">
            {t('purchaseFiltersTitle')}
          </h3>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('purchaseFilterPaid')}
            </label>
            <SmartSelect
              instanceId="purchase-filter-paid"
              value={ana.purchaseFilters.isPaid}
              onChange={(value) =>
                ana.setPurchaseFilters((f) => ({
                  ...f,
                  isPaid: value as typeof f.isPaid,
                }))
              }
              options={paidOptions}
            />
          </div>
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('purchaseFilterTier')}
            </label>
            <SmartSelect
              instanceId="purchase-filter-tier"
              value={ana.purchaseFilters.tier}
              onChange={(value) =>
                ana.setPurchaseFilters((f) => ({ ...f, tier: value }))
              }
              options={tierOptions}
              isClearable
            />
          </div>
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('purchaseFilterFrom')}
            </label>
            <DateTimePickerInput
              value={ana.purchaseFilters.from}
              onChange={(value) =>
                ana.setPurchaseFilters((f) => ({ ...f, from: value }))
              }
            />
          </div>
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('purchaseFilterTo')}
            </label>
            <DateTimePickerInput
              value={ana.purchaseFilters.to}
              onChange={(value) =>
                ana.setPurchaseFilters((f) => ({ ...f, to: value }))
              }
            />
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={ana.resetPurchaseFilters}
            className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[10px] text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)] nvi-press"
          >
            {t('purchaseFilterReset')}
          </button>
          <button
            type="button"
            onClick={ana.applyPurchaseFilters}
            className="rounded-lg bg-[var(--pt-accent)] px-3 py-1.5 text-[10px] font-semibold text-black nvi-press"
          >
            {t('purchaseFilterApply')}
          </button>
        </div>
      </Card>

      {/* Purchase table */}
      {ana.isLoadingPurchases ? (
        <div className="space-y-2 nvi-stagger">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]"
            />
          ))}
        </div>
      ) : ana.purchases.length === 0 ? (
        <EmptyState
          icon={
            <ShoppingCart size={28} className="text-[var(--pt-text-muted)]" />
          }
          title={t('purchaseEmptyTitle')}
          description={t('purchaseEmptyHint')}
        />
      ) : (
        <Card padding="sm">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                  <th className="px-2 py-1.5">{t('purchaseColDate')}</th>
                  <th className="px-2 py-1.5">{t('purchaseColBusiness')}</th>
                  <th className="px-2 py-1.5">{t('purchaseColTier')}</th>
                  <th className="px-2 py-1.5">{t('purchaseColDuration')}</th>
                  <th className="px-2 py-1.5">{t('purchaseColAmount')}</th>
                  <th className="px-2 py-1.5">{t('purchaseColType')}</th>
                  <th className="px-2 py-1.5">{t('purchaseColAdmin')}</th>
                </tr>
              </thead>
              <tbody>
                {ana.purchases.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition"
                  >
                    <td
                      className="px-2 py-2 text-[var(--pt-text-2)] whitespace-nowrap"
                      title={formatDateTime(p.createdAt)}
                    >
                      {formatDateTime(p.createdAt)}
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/${locale}/platform/businesses/${p.businessId}`}
                        className="inline-flex items-center gap-0.5 text-[var(--pt-text-1)] hover:text-[var(--pt-accent)] transition"
                      >
                        {p.business?.name ?? p.businessId.slice(0, 8)}
                        <ExternalLink size={9} className="opacity-60" />
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${TIER_COLORS[p.tier] ?? ''}`}
                      >
                        {p.tier}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-[var(--pt-text-2)]">
                      {p.months}mo
                    </td>
                    <td className="px-2 py-2 font-semibold text-[var(--pt-text-1)]">
                      {formatTzs(p.amountDue)}
                    </td>
                    <td className="px-2 py-2">
                      {p.isPaid ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                          <CreditCard size={9} />
                          {t('purchasePaid')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-blue-300">
                          <Gift size={9} />
                          {t('purchaseComp')}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[10px] text-[var(--pt-text-muted)]">
                      {p.platformAdmin?.email?.split('@')[0] ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {(ana.hasNextPurchasePage || ana.hasPrevPurchasePage) && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={ana.prevPurchasePage}
            disabled={!ana.hasPrevPurchasePage}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] disabled:opacity-30 nvi-press"
          >
            <ChevronLeft size={11} />
            {t('prevPage')}
          </button>
          <span className="text-[10px] text-[var(--pt-text-muted)]">
            {t('pageLabel', { page: ana.purchasePage })}
          </span>
          <button
            type="button"
            onClick={ana.nextPurchasePage}
            disabled={!ana.hasNextPurchasePage}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] disabled:opacity-30 nvi-press"
          >
            {t('nextPage')}
            <ChevronRight size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
