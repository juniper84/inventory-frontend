'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Plus,
  Search,
  Star,
  Building2,
  Eye,
  Users,
  Package,
  Smartphone,
  AlertTriangle,
  Lock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Banner } from '@/components/notifications/Banner';
import { Spinner } from '@/components/Spinner';
import { FlipCounter } from '@/components/analog/FlipCounter';
import { RingGauge } from '@/components/RingGauge';
import { Sparkline } from '@/components/Sparkline';
import { useBusinessRegistry, type StatusFilter, type TierFilter, type SortMode } from './hooks/useBusinessRegistry';
import { useBusinessWorkspaceContext } from './context/BusinessWorkspaceContext';
import { BusinessProvisionPanel } from './BusinessProvisionPanel';
import { BulkActionBar } from './components/BulkActionBar';
import type { Business } from '@/components/platform/types';

const STATUS_TABS: StatusFilter[] = ['ALL', 'ACTIVE', 'TRIAL', 'GRACE', 'EXPIRED', 'SUSPENDED', 'ARCHIVED'];

const TIER_COLORS: Record<string, string> = {
  STARTER: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  BUSINESS: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
  ENTERPRISE: 'text-yellow-200 border-yellow-500/30 bg-yellow-500/10',
};

const STATUS_DOT_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-400',
  TRIAL: 'bg-blue-400',
  GRACE: 'bg-amber-400',
  EXPIRED: 'bg-red-400',
  SUSPENDED: 'bg-zinc-400',
  ARCHIVED: 'bg-zinc-500',
};

function daysRemaining(date?: string | null): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function expiryColor(days: number | null): string {
  if (days === null) return 'text-[var(--pt-text-muted)]';
  if (days < 0) return 'text-red-400 animate-pulse';
  if (days <= 7) return 'text-red-400';
  if (days <= 30) return 'text-amber-400';
  return 'text-emerald-400';
}

function healthColor(score?: number): string {
  if (score === undefined) return 'bg-zinc-500';
  if (score >= 80) return 'bg-emerald-400';
  if (score >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

function relativeTime(date?: string | null): string {
  if (!date) return '—';
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function BusinessRegistryView() {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();
  const reg = useBusinessRegistry();
  const { banner, setBanner } = useBusinessWorkspaceContext();
  const [provisionOpen, setProvisionOpen] = useState(false);

  // KPI strip computations
  const totalBusinesses = reg.counts?.total ?? 0;
  const activeCount = reg.counts?.byStatus.ACTIVE ?? 0;
  const expiredCount = reg.counts?.byStatus.EXPIRED ?? 0;
  const reviewCount = reg.counts?.underReview ?? 0;

  const tierBreakdown = useMemo(() => {
    if (!reg.businesses.length) return [0, 0, 0];
    const counts = { STARTER: 0, BUSINESS: 0, ENTERPRISE: 0 };
    reg.businesses.forEach((b) => {
      const tier = b.subscription?.tier;
      if (tier && tier in counts) counts[tier as keyof typeof counts]++;
    });
    return [counts.STARTER, counts.BUSINESS, counts.ENTERPRISE];
  }, [reg.businesses]);

  return (
    <section className="nvi-page space-y-4">
      {/* ── Page header ── */}
      <PageHeader
        eyebrow={t('businessesEyebrow')}
        title={t('businessesTitle')}
        subtitle={t('businessesSubtitle')}
        badges={
          <>
            <button
              type="button"
              onClick={reg.refresh}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--pt-accent-border)] px-3 py-1 text-[10px] text-[var(--pt-accent)] hover:bg-[var(--pt-accent-dim)] transition nvi-press"
            >
              <RefreshCw size={10} />
              {t('businessesRefresh')}
            </button>
            <button
              type="button"
              onClick={() => setProvisionOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--pt-accent)] px-3 py-1.5 text-[10px] font-semibold text-black hover:opacity-90 transition nvi-press"
            >
              <Plus size={12} />
              {t('businessesNew')}
            </button>
          </>
        }
      />

      {/* ── Banner ── */}
      {banner && (
        <Banner
          message={banner.text}
          severity={banner.severity}
          onDismiss={() => setBanner(null)}
        />
      )}

      {/* ── KPI strip — 4 cards ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        {/* Total businesses with sparkline */}
        <Card padding="md" className="nvi-card-hover">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('businessesKpiTotal')}</p>
              <FlipCounter value={totalBusinesses} size="md" digits={3} />
              <p className="text-[9px] text-[var(--pt-text-muted)] mt-1">
                S: {tierBreakdown[0]} · B: {tierBreakdown[1]} · E: {tierBreakdown[2]}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--pt-accent-dim)]">
              <Building2 size={16} className="text-[var(--pt-accent)]" />
            </div>
          </div>
        </Card>

        {/* Active vs total ratio */}
        <Card padding="md" className="nvi-card-hover">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('businessesKpiActive')}</p>
              <FlipCounter value={activeCount} size="md" digits={3} />
              <p className="text-[9px] text-[var(--pt-text-muted)] mt-1">
                {totalBusinesses > 0 ? `${Math.round((activeCount / totalBusinesses) * 100)}% of total` : '—'}
              </p>
            </div>
            <RingGauge
              value={activeCount}
              max={totalBusinesses || 1}
              size={44}
              stroke={4}
              color="rgb(52,211,153)"
            />
          </div>
        </Card>

        {/* Pending actions */}
        <Card padding="md" className="nvi-card-hover">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('businessesKpiNeedsReview')}</p>
              <FlipCounter value={reviewCount} size="md" digits={3} />
              <p className="text-[9px] text-amber-400 mt-1">
                {reviewCount > 0 ? t('businessesKpiNeedsReviewHint') : t('businessesKpiAllClear')}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <AlertTriangle size={16} className="text-amber-400" />
            </div>
          </div>
        </Card>

        {/* Expired/at-risk */}
        <Card padding="md" className="nvi-card-hover">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('businessesKpiAtRisk')}</p>
              <FlipCounter value={expiredCount} size="md" digits={3} />
              <p className="text-[9px] text-[var(--pt-text-muted)] mt-1">{t('businessesKpiAtRiskHint')}</p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
              <Lock size={16} className="text-red-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* ── Search + filter bar ── */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <div className="space-y-3">
          {/* Search input */}
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 z-10 text-[var(--pt-text-muted)]">
              <Search size={14} />
            </div>
            <TextInput
              type="search"
              value={reg.search}
              onChange={(e) => reg.setSearch(e.target.value)}
              placeholder={t('businessesSearchPlaceholder')}
              className="pl-9"
            />
          </div>

          {/* Status pill tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_TABS.map((status) => {
              const isActive = reg.statusFilter === status;
              const count = status === 'ALL' ? reg.counts?.total ?? 0 : reg.counts?.byStatus[status] ?? 0;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => reg.setStatusFilter(status)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-medium transition nvi-press ${
                    isActive
                      ? 'bg-[var(--pt-accent-dim)] text-[var(--pt-accent)] border border-[var(--pt-accent-border)]'
                      : 'border border-white/[0.06] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-2)] hover:border-[var(--pt-accent-border)]'
                  }`}
                >
                  {t(`businessesStatus.${status}`)}
                  <span className={`tabular-nums ${isActive ? 'text-[var(--pt-accent)]' : 'text-[var(--pt-text-muted)]'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tier + sort */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">{t('businessesTierLabel')}:</span>
              {(['ALL', 'STARTER', 'BUSINESS', 'ENTERPRISE'] as TierFilter[]).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => reg.setTierFilter(tier)}
                  className={`rounded-md px-2 py-0.5 text-[10px] transition ${
                    reg.tierFilter === tier
                      ? 'bg-[var(--pt-accent-dim)] text-[var(--pt-accent)]'
                      : 'text-[var(--pt-text-muted)] hover:text-[var(--pt-text-2)]'
                  }`}
                >
                  {t(`businessesTier.${tier}`)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">{t('businessesSortLabel')}:</span>
              {(['pinnedFirst', 'name', 'lastActivity', 'expiry', 'health'] as SortMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => reg.setSortMode(mode)}
                  className={`rounded-md px-2 py-0.5 text-[10px] transition ${
                    reg.sortMode === mode
                      ? 'bg-[var(--pt-accent-dim)] text-[var(--pt-accent)]'
                      : 'text-[var(--pt-text-muted)] hover:text-[var(--pt-text-2)]'
                  }`}
                >
                  {t(`businessesSort.${mode}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Business rows ── */}
      {reg.isLoading ? (
        <div className="space-y-2 nvi-stagger">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
          ))}
        </div>
      ) : reg.error ? (
        <Banner message={reg.error} severity="error" />
      ) : reg.visibleBusinesses.length === 0 ? (
        <EmptyState
          icon={<Building2 size={32} className="text-[var(--pt-text-muted)]" />}
          title={t('businessesEmptyTitle')}
          description={t('businessesEmptyHint')}
        />
      ) : (
        <>
          {/* Select-all row */}
          <div className="flex items-center gap-2 pl-3 pb-1">
            <input
              type="checkbox"
              checked={reg.allOnPageSelected}
              onChange={(e) => {
                if (e.target.checked) reg.selectAllOnPage();
                else reg.clearSelection();
              }}
              className="h-3.5 w-3.5 accent-[var(--pt-accent)] cursor-pointer"
              aria-label={t('businessesSelectAll')}
            />
            <span className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
              {reg.selectedCount > 0
                ? t('businessesSelectedCount', { count: reg.selectedCount })
                : t('businessesSelectAll')}
            </span>
          </div>

          <div className="space-y-2 nvi-stagger">
            {reg.visibleBusinesses.map((biz) => (
              <BusinessRow
                key={biz.id}
                business={biz}
                isPinned={reg.isPinned(biz.id)}
                onTogglePin={() => reg.togglePin(biz.id)}
                isSelected={reg.isSelected(biz.id)}
                onToggleSelected={() => reg.toggleSelected(biz.id)}
                locale={params.locale}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Pagination ── */}
      {!reg.isLoading && reg.visibleBusinesses.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-[10px] text-[var(--pt-text-muted)]">
            {t('businessesPagination', { page: reg.page, total: reg.total })}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reg.goPrev}
              disabled={!reg.hasPrev}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--pt-accent-border)] px-3 py-1 text-[10px] text-[var(--pt-text-2)] disabled:opacity-40 nvi-press"
            >
              <ChevronLeft size={12} />
              {t('businessesPrev')}
            </button>
            <button
              type="button"
              onClick={reg.goNext}
              disabled={!reg.hasNext}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--pt-accent-border)] px-3 py-1 text-[10px] text-[var(--pt-text-2)] disabled:opacity-40 nvi-press"
            >
              {t('businessesNext')}
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ── Provision slide-in panel ── */}
      <BusinessProvisionPanel
        open={provisionOpen}
        onClose={() => setProvisionOpen(false)}
        onCreated={() => {
          setProvisionOpen(false);
          reg.refresh();
        }}
      />

      {/* ── Floating bulk action bar ── */}
      <BulkActionBar
        selectedIds={reg.selectedIds}
        onClear={reg.clearSelection}
        onCompleted={() => reg.refresh()}
      />
    </section>
  );
}

// ── BusinessRow component ──

type RowProps = {
  business: Business;
  isPinned: boolean;
  onTogglePin: () => void;
  isSelected: boolean;
  onToggleSelected: () => void;
  locale: string;
};

function BusinessRow({ business, isPinned, onTogglePin, isSelected, onToggleSelected, locale }: RowProps) {
  const t = useTranslations('platformConsole');
  const sub = business.subscription;
  const expiryDate = sub?.expiresAt ?? sub?.trialEndsAt ?? sub?.graceEndsAt;
  const days = daysRemaining(expiryDate);
  const expColor = expiryColor(days);
  const dotColor = STATUS_DOT_COLORS[business.status] ?? 'bg-zinc-500';
  const tierColor = sub?.tier ? TIER_COLORS[sub.tier] ?? '' : '';

  return (
    <div className={`group relative rounded-xl border ${isSelected ? 'border-[var(--pt-accent)] bg-[var(--pt-accent-dim)]' : 'border-white/[0.04] bg-white/[0.02]'} hover:border-[var(--pt-accent-border)] hover:bg-white/[0.03] transition nvi-card-hover`}>
      <Link
        href={`/${locale}/platform/businesses/${business.id}`}
        className="flex items-center gap-4 p-3"
      >
        {/* Selection checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelected();
          }}
          onClick={(e) => e.stopPropagation()}
          className={`h-3.5 w-3.5 shrink-0 accent-[var(--pt-accent)] cursor-pointer transition ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          aria-label={t('businessesSelectRow')}
        />

        {/* Pin star — top-left */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin();
          }}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition ${
            isPinned ? 'text-amber-400' : 'text-[var(--pt-text-muted)] opacity-0 group-hover:opacity-100 hover:text-amber-400'
          }`}
          aria-label={isPinned ? t('businessesUnpin') : t('businessesPin')}
        >
          <Star size={14} fill={isPinned ? 'currentColor' : 'none'} />
        </button>

        {/* Left — name + ID + owner */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[var(--pt-text-1)] truncate">{business.name}</p>
            {business.underReview && (
              <span className="shrink-0" title={business.reviewReason ?? 'Under review'}>
                <Eye size={11} className="text-amber-400" />
              </span>
            )}
            {business.settings?.readOnlyEnabled && (
              <span className="shrink-0" title="Read-only">
                <Lock size={11} className="text-red-400" />
              </span>
            )}
          </div>
          <p className="text-[9px] font-mono text-[var(--pt-text-muted)] truncate">{business.id}</p>
          {business.systemOwner && (
            <p className="text-[10px] text-[var(--pt-text-muted)] truncate">{business.systemOwner.name}</p>
          )}
        </div>

        {/* Center — status + tier + expiry */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          {/* Status pipeline */}
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
            <span className="text-[10px] uppercase tracking-wide text-[var(--pt-text-2)]">{business.status}</span>
          </div>

          {/* Tier badge */}
          {sub?.tier && (
            <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${tierColor}`}>
              {sub.tier}
            </span>
          )}

          {/* Expiry countdown */}
          {days !== null && (
            <span className={`text-[10px] font-medium tabular-nums ${expColor}`}>
              {days < 0 ? `${Math.abs(days)}d ago` : `in ${days}d`}
            </span>
          )}
        </div>

        {/* Right — health + counts + activity */}
        <div className="hidden lg:flex items-center gap-4 shrink-0">
          {/* Health bar */}
          {business.healthScore !== undefined && (
            <div className="flex flex-col items-center gap-1">
              <div className="h-1.5 w-12 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={`h-full ${healthColor(business.healthScore)} transition-all`}
                  style={{ width: `${business.healthScore}%` }}
                />
              </div>
              <span className="text-[9px] text-[var(--pt-text-muted)] tabular-nums">{business.healthScore}</span>
            </div>
          )}

          {/* Counts */}
          {business.counts && (
            <div className="flex items-center gap-2 text-[10px] text-[var(--pt-text-muted)]">
              <span className="flex items-center gap-0.5">
                <Package size={10} /> {business.counts.branches}
              </span>
              <span className="flex items-center gap-0.5">
                <Users size={10} /> {business.counts.users}
              </span>
              <span className="flex items-center gap-0.5">
                <Smartphone size={10} /> {business.counts.offlineDevices}
              </span>
            </div>
          )}

          {/* Last activity */}
          <span className="text-[10px] text-[var(--pt-text-muted)] tabular-nums w-16 text-right">
            {relativeTime(business.lastActivityAt)}
          </span>
        </div>
      </Link>
    </div>
  );
}
