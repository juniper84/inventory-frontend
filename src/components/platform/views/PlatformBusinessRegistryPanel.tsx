'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Spinner } from '@/components/Spinner';

type Business = {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  lastActivityAt?: string | null;
  underReview?: boolean | null;
  reviewReason?: string | null;
  reviewSeverity?: string | null;
  subscription?: {
    tier: string;
    status: string;
    trialEndsAt?: string | null;
    graceEndsAt?: string | null;
    expiresAt?: string | null;
  } | null;
  settings?: {
    readOnlyEnabled?: boolean;
    readOnlyReason?: string | null;
  } | null;
  counts?: { branches: number; users: number; offlineDevices: number };
  systemOwner?: { name: string; email: string; phone: string | null } | null;
};

type StatusFilter = 'ACTIVE' | 'UNDER_REVIEW' | 'SUSPENDED' | 'ARCHIVED' | 'DELETED';
type SortKey = 'name' | 'lastActivity' | 'risk' | 'expiry';

// ─── Style maps ────────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  ACTIVE:   'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  TRIAL:    'border-sky-500/40 bg-sky-500/10 text-sky-300',
  GRACE:    'border-amber-500/40 bg-amber-500/10 text-amber-300',
  EXPIRED:  'border-orange-500/40 bg-orange-500/10 text-orange-300',
  SUSPENDED:'border-red-500/40 bg-red-500/10 text-red-300',
  ARCHIVED: 'border-[color:var(--pt-accent-border)] bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-muted)]',
  DELETED:  'border-red-700/40 bg-red-700/10 text-red-400',
};

const TIER_PILL: Record<string, string> = {
  STARTER:    'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-2)]',
  BUSINESS:   'border-sky-500/40 text-sky-300',
  ENTERPRISE: 'border-violet-500/40 text-violet-300',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(date?: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

function timeAgo(date?: string | null): string | null {
  if (!date) return null;
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function RiskBadge({ score }: { score: number }) {
  const [colorCls, label] =
    score >= 60 ? ['border-red-500/40 bg-red-500/10 text-red-300', 'HIGH'] :
    score >= 30 ? ['border-amber-500/40 bg-amber-500/10 text-amber-300', 'MED'] :
                  ['border-emerald-500/40 bg-emerald-500/10 text-emerald-300', 'LOW'];
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${colorCls}`}>
      {score}
      <span className="opacity-60">{label}</span>
    </span>
  );
}

function ExpiryLine({ sub }: { sub?: Business['subscription'] }) {
  if (!sub) return null;

  if (sub.status === 'TRIAL' && sub.trialEndsAt) {
    const d = daysUntil(sub.trialEndsAt);
    if (d === null) return null;
    const cls = d <= 3 ? 'text-red-300' : d <= 7 ? 'text-amber-300' : 'text-[color:var(--pt-text-muted)]';
    return <span className={`text-[11px] tabular-nums ${cls}`}>Trial · {d >= 0 ? `${d}d left` : 'ended'}</span>;
  }

  if (sub.status === 'GRACE' && sub.graceEndsAt) {
    const d = daysUntil(sub.graceEndsAt);
    if (d === null) return null;
    const cls = d <= 2 ? 'text-red-300' : 'text-amber-300';
    return <span className={`text-[11px] tabular-nums ${cls}`}>Grace · {d >= 0 ? `${d}d left` : 'ended'}</span>;
  }

  if (sub.status === 'EXPIRED') {
    return <span className="text-[11px] text-orange-300">Subscription expired</span>;
  }

  if (sub.expiresAt) {
    const d = daysUntil(sub.expiresAt);
    if (d === null) return null;
    if (d < 0) return <span className="text-[11px] text-orange-300">Expired</span>;
    const date = new Date(sub.expiresAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
    const cls = d <= 7 ? 'text-amber-300' : d <= 30 ? 'text-[color:var(--pt-text-2)]' : 'text-[color:var(--pt-text-muted)]';
    return <span className={`text-[11px] tabular-nums ${cls}`}>{date} · {d}d left</span>;
  }

  return null;
}

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PlatformBusinessRegistryPanel({
  show,
  t,
  locale,
  withAction,
  actionLoading,
  loadBusinesses,
  businessSearch,
  setBusinessSearch,
  businessStatusFilter,
  setBusinessStatusFilter,
  filteredBusinesses,
  businesses,
  getBusinessRiskScore,
  pinnedBusinessIds,
  togglePinnedBusiness,
  updateReview,
  totalBusinesses,
  businessPage,
  hasNextBusinessPage,
  onBusinessNextPage,
  onBusinessPrevPage,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  locale: string;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  actionLoading: Record<string, boolean>;
  loadBusinesses: (cursor?: string) => Promise<void>;
  businessSearch: string;
  setBusinessSearch: (value: string) => void;
  businessStatusFilter: StatusFilter;
  setBusinessStatusFilter: (value: StatusFilter) => void;
  filteredBusinesses: Business[];
  businesses: Business[];
  getBusinessRiskScore: (business: Business) => number;
  pinnedBusinessIds: string[];
  togglePinnedBusiness: (businessId: string) => void;
  updateReview: (
    businessId: string,
    options?: { underReview: boolean; reason: string; severity: string },
  ) => Promise<void>;
  totalBusinesses: number | null;
  businessPage: number;
  hasNextBusinessPage: boolean;
  onBusinessNextPage: () => Promise<void>;
  onBusinessPrevPage: () => Promise<void>;
}) {
  const [sortBy, setSortBy] = useState<SortKey>('name');

  // ── Derived data (all hooks before any early return) ────────────────────────

  const pinnedSet = useMemo(() => new Set(pinnedBusinessIds), [pinnedBusinessIds]);

  const counts = useMemo(() => ({
    ACTIVE:       businesses.filter(b => !['ARCHIVED', 'DELETED', 'SUSPENDED'].includes(b.status)).length,
    UNDER_REVIEW: businesses.filter(b => Boolean(b.underReview)).length,
    SUSPENDED:    businesses.filter(b => b.status === 'SUSPENDED').length,
    ARCHIVED:     businesses.filter(b => b.status === 'ARCHIVED').length,
    DELETED:      businesses.filter(b => b.status === 'DELETED').length,
  }), [businesses]);

  const highRiskCount = useMemo(
    () => businesses.filter(b => getBusinessRiskScore(b) >= 60).length,
    [businesses, getBusinessRiskScore],
  );

  const sorted = useMemo(() => {
    const pinned = filteredBusinesses.filter(b => pinnedSet.has(b.id));
    const rest   = filteredBusinesses.filter(b => !pinnedSet.has(b.id));

    const sortFn = (a: Business, b: Business): number => {
      switch (sortBy) {
        case 'lastActivity': {
          const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
          const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
          return tb - ta;
        }
        case 'risk':
          return getBusinessRiskScore(b) - getBusinessRiskScore(a);
        case 'expiry': {
          const da = daysUntil(a.subscription?.expiresAt) ?? 9999;
          const db = daysUntil(b.subscription?.expiresAt) ?? 9999;
          return da - db;
        }
        default:
          return a.name.localeCompare(b.name);
      }
    };

    return [...pinned, ...rest.sort(sortFn)];
  }, [filteredBusinesses, pinnedSet, sortBy, getBusinessRiskScore]);

  // ── Early return ────────────────────────────────────────────────────────────
  if (!show) return null;

  const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'ACTIVE',       label: t('statusActive') },
    { value: 'UNDER_REVIEW', label: t('underReview') },
    { value: 'SUSPENDED',    label: t('statusSuspended') },
    { value: 'ARCHIVED',     label: t('statusArchived') },
    { value: 'DELETED',      label: t('statusDeletedReady') },
  ];

  const isRefreshing = Boolean(actionLoading['businesses:load']);

  return (
    <div className="space-y-3">

      {/* ── Header row ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[12px] text-[color:var(--pt-text-2)]">
            {filteredBusinesses.length} business{filteredBusinesses.length !== 1 ? 'es' : ''}
            {businessPage > 1 ? ` · page ${businessPage}` : ''}
          </span>
          {highRiskCount > 0 && (
            <span className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
              {highRiskCount} high-risk
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            className="rounded border border-[color:var(--pt-accent-border)] bg-[var(--pt-bg-surface)] px-2 py-1 text-[11px] text-[color:var(--pt-text-2)] outline-none focus:border-[color:var(--pt-accent-border-hi)]"
          >
            <option value="name">Sort: A–Z</option>
            <option value="lastActivity">Sort: Last active</option>
            <option value="risk">Sort: Risk ↑</option>
            <option value="expiry">Sort: Expiry ↑</option>
          </select>

          {/* Refresh */}
          <button
            type="button"
            onClick={() => withAction('businesses:load', () => loadBusinesses())}
            title="Refresh"
            className="flex items-center justify-center rounded border border-[color:var(--pt-accent-border)] p-1.5 text-[color:var(--pt-text-muted)] transition-colors hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-2)]"
          >
            {isRefreshing ? <Spinner size="xs" variant="grid" /> : <RefreshIcon />}
          </button>
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────────── */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[color:var(--pt-text-muted)]">
          <SearchIcon />
        </div>
        <input
          type="text"
          value={businessSearch}
          onChange={e => setBusinessSearch(e.target.value)}
          placeholder={t('searchBusinesses')}
          aria-label={t('searchBusinesses')}
          className="w-full rounded border border-[color:var(--pt-accent-border)] bg-[var(--pt-bg-surface)] py-2 pl-9 pr-9 text-[13px] text-[color:var(--pt-text-1)] placeholder:text-[color:var(--pt-text-muted)] outline-none focus:border-[color:var(--pt-accent-border-hi)] transition-colors"
        />
        {businessSearch && (
          <button
            type="button"
            onClick={() => setBusinessSearch('')}
            aria-label="Clear search"
            className="absolute inset-y-0 right-3 flex items-center text-[color:var(--pt-text-muted)] transition-colors hover:text-[color:var(--pt-text-2)]"
          >
            <ClearIcon />
          </button>
        )}
      </div>

      {/* ── Status filter pills with counts ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map(opt => {
          const isActive = businessStatusFilter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setBusinessStatusFilter(opt.value)}
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] transition-colors ${
                isActive
                  ? 'border-[color:var(--pt-accent)] bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-1)]'
                  : 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-2)]'
              }`}
            >
              {opt.label}
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ${
                isActive
                  ? 'bg-[var(--pt-accent)] text-black'
                  : 'bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-2)]'
              }`}>
                {counts[opt.value]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Business card list ────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        {sorted.map(business => {
          const riskScore  = getBusinessRiskScore(business);
          const isPinned   = pinnedSet.has(business.id);
          const sub        = business.subscription;
          const tier       = sub?.tier ?? '';
          const subStatus  = sub?.status ?? '';

          // Urgency: amber border if expiry soon or in grace
          const daysLeft = daysUntil(sub?.expiresAt);
          const isGrace   = subStatus === 'GRACE';
          const isExpired = subStatus === 'EXPIRED';
          const isExpiringSoon = !isGrace && !isExpired && daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;

          const urgencyBorder =
            isExpired ? 'border-l-[3px] border-l-orange-500/60' :
            isGrace   ? 'border-l-[3px] border-l-amber-500/70' :
            isExpiringSoon ? 'border-l-[3px] border-l-amber-500/40' :
            '';

          const cardBase = isPinned
            ? 'border-[color:var(--pt-accent)] bg-[var(--pt-accent-dim)]'
            : 'border-[color:var(--pt-accent-border)] bg-[var(--pt-bg-card)] hover:border-[color:var(--pt-accent-border-hi)] hover:bg-[var(--pt-accent-dim)]';

          return (
            <div
              key={business.id}
              className={`group rounded border transition-colors ${cardBase} ${urgencyBorder}`}
            >
              <div className="flex items-start justify-between gap-4 px-4 py-3">

                {/* Left — identity */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isPinned && (
                      <span
                        className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--pt-accent)]"
                        title={t('pinned')}
                      />
                    )}
                    <span className="truncate text-[13px] font-medium text-[color:var(--pt-text-1)]">
                      {business.name}
                    </span>
                    {business.underReview && (
                      <span className="flex-shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-amber-300">
                        Review
                      </span>
                    )}
                    {business.settings?.readOnlyEnabled && (
                      <span className="flex-shrink-0 rounded border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-orange-300">
                        Read-only
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-[color:var(--pt-text-muted)]">
                    {business.id.slice(0, 16)}…
                  </p>
                  {business.systemOwner && (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-[11px] text-[color:var(--pt-text-2)]">
                        {business.systemOwner.name}
                      </p>
                      <p className="text-[11px] text-[color:var(--pt-text-muted)]">
                        {business.systemOwner.email}
                      </p>
                      {business.systemOwner.phone && (
                        <p className="text-[11px] text-[color:var(--pt-text-muted)]">
                          {business.systemOwner.phone}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Right — metrics + actions */}
                <div className="flex flex-shrink-0 flex-col items-end gap-1.5">

                  {/* Status + Tier + Risk */}
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                      STATUS_PILL[business.status] ?? 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-2)]'
                    }`}>
                      {business.status}
                    </span>
                    {tier && (
                      <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                        TIER_PILL[tier] ?? 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-2)]'
                      }`}>
                        {tier}
                      </span>
                    )}
                    <RiskBadge score={riskScore} />
                  </div>

                  {/* Expiry */}
                  <ExpiryLine sub={sub} />

                  {/* Counts */}
                  {business.counts && (
                    <p className="text-[11px] text-[color:var(--pt-text-muted)]">
                      {business.counts.branches} br
                      {' · '}
                      {business.counts.users} usr
                      {business.counts.offlineDevices > 0 && ` · ${business.counts.offlineDevices} dev`}
                    </p>
                  )}

                  {/* Last active + actions */}
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {business.lastActivityAt && (
                      <span className="text-[11px] text-[color:var(--pt-text-muted)]">
                        {timeAgo(business.lastActivityAt)}
                      </span>
                    )}
                    <Link
                      href={`/${locale}/platform/businesses/${business.id}`}
                      className="rounded border border-[color:var(--pt-accent-border-hi)] bg-[var(--pt-accent-dim)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--pt-text-1)] transition-colors hover:bg-[var(--pt-accent)] hover:text-black"
                    >
                      {t('open')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => togglePinnedBusiness(business.id)}
                      title={isPinned ? t('pinned') : t('pin')}
                      className={`rounded border px-2 py-1 text-[12px] transition-colors ${
                        isPinned
                          ? 'border-[color:var(--pt-accent)] text-[color:var(--pt-accent)]'
                          : 'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-muted)] hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-2)]'
                      }`}
                    >
                      {isPinned ? '★' : '☆'}
                    </button>
                    {!business.underReview && (
                      <button
                        type="button"
                        title={t('markRisk')}
                        onClick={() =>
                          withAction(`review:flag:${business.id}`, () =>
                            updateReview(business.id, {
                              underReview: true,
                              reason: t('markRiskDefaultReason'),
                              severity: 'MEDIUM',
                            }),
                          )
                        }
                        className="rounded border border-amber-800/40 px-2 py-1 text-[11px] text-amber-500/60 transition-colors hover:border-amber-600/50 hover:text-amber-300"
                      >
                        ⚑
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {!sorted.length && (
          <div className="rounded border border-[color:var(--pt-accent-border)] py-12 text-center">
            <p className="text-[13px] text-[color:var(--pt-text-muted)]">
              {businessSearch ? `No businesses match "${businessSearch}"` : t('noBusinesses')}
            </p>
            {businessSearch && (
              <button
                type="button"
                onClick={() => setBusinessSearch('')}
                className="mt-2 text-[12px] text-[color:var(--pt-text-2)] underline underline-offset-2 hover:text-[color:var(--pt-text-1)]"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────────── */}
      {(businessPage > 1 || hasNextBusinessPage) && (
        <div className="flex items-center justify-between border-t border-[color:var(--pt-accent-border)] pt-3">
          <button
            type="button"
            onClick={() => withAction('businesses:prev', () => onBusinessPrevPage())}
            disabled={businessPage <= 1}
            className="inline-flex items-center gap-1.5 rounded border border-[color:var(--pt-accent-border)] px-3 py-1.5 text-[12px] text-[color:var(--pt-text-2)] transition-colors hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-1)] disabled:pointer-events-none disabled:opacity-30"
          >
            {actionLoading['businesses:prev'] ? <Spinner size="xs" variant="dots" /> : '←'}
            {' '}Prev
          </button>

          <div className="text-center">
            <span className="text-[12px] font-medium text-[color:var(--pt-text-1)]">
              Page {businessPage}
              {totalBusinesses !== null && (
                <> of {Math.ceil(totalBusinesses / 20)}</>
              )}
            </span>
            {totalBusinesses !== null ? (
              <span className="ml-2 text-[11px] text-[color:var(--pt-text-muted)]">
                · {totalBusinesses.toLocaleString()} total
              </span>
            ) : (
              <span className="ml-2 text-[11px] text-[color:var(--pt-text-muted)]">
                · {filteredBusinesses.length} shown
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => withAction('businesses:next', () => onBusinessNextPage())}
            disabled={!hasNextBusinessPage}
            className="inline-flex items-center gap-1.5 rounded border border-[color:var(--pt-accent-border)] px-3 py-1.5 text-[12px] text-[color:var(--pt-text-2)] transition-colors hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-1)] disabled:pointer-events-none disabled:opacity-30"
          >
            Next{' '}
            {actionLoading['businesses:next'] ? <Spinner size="xs" variant="dots" /> : '→'}
          </button>
        </div>
      )}
    </div>
  );
}
