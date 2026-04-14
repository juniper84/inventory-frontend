'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ChevronLeft,
  LogOut,
  Lock,
  Unlock as LockOpen,
  RefreshCw,
  Activity,
  Calendar,
  Building2,
  Users,
  Smartphone,
  Layers,
  CircleCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/notifications/Banner';
import { RingGauge } from '@/components/RingGauge';
import { useBusinessWorkspace } from './hooks/useBusinessWorkspace';
import { useBusinessWorkspaceContext } from './context/BusinessWorkspaceContext';
import { BusinessOverviewTab } from './tabs/BusinessOverviewTab';
import { BusinessNotesTab } from './tabs/BusinessNotesTab';
import { BusinessDevicesTab } from './tabs/BusinessDevicesTab';
import { BusinessSubscriptionTab } from './tabs/BusinessSubscriptionTab';
import { BusinessStatusTab } from './tabs/BusinessStatusTab';
import { BusinessExportsTab } from './tabs/BusinessExportsTab';

type Props = {
  businessId: string;
};

type TabKey = 'overview' | 'subscription' | 'status' | 'notes' | 'devices' | 'exports';

const TABS: TabKey[] = ['overview', 'subscription', 'status', 'notes', 'devices', 'exports'];

const STATUS_PIPELINE = ['TRIAL', 'ACTIVE', 'GRACE', 'EXPIRED'] as const;

const TIER_COLORS: Record<string, string> = {
  STARTER: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  BUSINESS: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
  ENTERPRISE: 'text-yellow-200 border-yellow-500/30 bg-yellow-500/10',
};

function relativeTime(date?: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function daysUntil(date?: string | Date | null): number | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function expiryColor(days: number | null): string {
  if (days === null) return 'text-[var(--pt-text-muted)]';
  if (days < 0) return 'text-red-400';
  if (days <= 7) return 'text-red-400';
  if (days <= 30) return 'text-amber-400';
  return 'text-emerald-400';
}

function healthColor(score?: number): string {
  if (score === undefined) return 'rgb(113,113,122)';
  if (score >= 80) return 'rgb(52,211,153)';
  if (score >= 50) return 'rgb(245,158,11)';
  return 'rgb(239,68,68)';
}

export function BusinessWorkspaceView({ businessId }: Props) {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();
  const ws = useBusinessWorkspace(businessId);
  const { banner, setBanner } = useBusinessWorkspaceContext();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showQuickActionConfirm, setShowQuickActionConfirm] = useState<'logout' | 'readonly' | null>(null);
  const [quickActionReason, setQuickActionReason] = useState('');

  // Loading state
  if (ws.isLoadingWorkspace && !ws.workspace) {
    return (
      <section className="nvi-page space-y-4">
        <div className="space-y-3 nvi-stagger">
          <div className="h-16 animate-pulse rounded-2xl bg-white/[0.03] border border-white/[0.04]" />
          <div className="h-24 animate-pulse rounded-2xl bg-white/[0.03] border border-white/[0.04]" />
          <div className="h-12 animate-pulse rounded-2xl bg-white/[0.03] border border-white/[0.04]" />
          <div className="h-64 animate-pulse rounded-2xl bg-white/[0.03] border border-white/[0.04]" />
        </div>
      </section>
    );
  }

  // Error state
  if (ws.workspaceError && !ws.workspace) {
    return (
      <section className="nvi-page space-y-4">
        <Banner message={ws.workspaceError} severity="error" />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={ws.loadWorkspace}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--pt-accent-border)] px-3 py-1.5 text-xs text-[var(--pt-accent)] nvi-press"
          >
            <RefreshCw size={12} />
            {t('workspaceRetry')}
          </button>
        </div>
      </section>
    );
  }

  if (!ws.workspace) return null;

  const wks = ws.workspace;
  const biz = wks.business;
  const sub = wks.subscription;
  const counts = wks.counts;
  const queues = wks.queues;
  const isReadOnly = wks.settings?.readOnlyEnabled ?? false;

  // Vitals computations
  const healthScore = wks.risk?.score ?? 100;
  const expiryDate = sub?.expiresAt ?? sub?.trialEndsAt ?? sub?.graceEndsAt;
  const expiryDays = daysUntil(expiryDate);
  const pendingTotal = (queues?.pendingSupport ?? 0) + (queues?.pendingExports ?? 0) + (queues?.pendingSubscriptionRequests ?? 0);

  // Onboarding milestones
  const onboarding = (wks.settings?.onboarding ?? {}) as Record<string, unknown>;
  const milestoneKeys = ['branchesCreated', 'productsCreated', 'salesRecorded', 'usersInvited', 'settingsConfigured'];
  const completedMilestones = milestoneKeys.filter((k) => Boolean(onboarding[k])).length;

  const handleQuickAction = async () => {
    if (!showQuickActionConfirm || !quickActionReason.trim()) return;
    if (showQuickActionConfirm === 'logout') {
      await ws.forceLogout(quickActionReason);
    } else if (showQuickActionConfirm === 'readonly') {
      await ws.toggleReadOnly(!isReadOnly, quickActionReason);
    }
    setShowQuickActionConfirm(null);
    setQuickActionReason('');
  };

  return (
    <section className="nvi-page space-y-4">
      {/* ── Header — back arrow + name + status pipeline + tier badge + quick actions ── */}
      <div className="flex items-start justify-between gap-4 nvi-slide-in-bottom">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Link
            href={`/${params.locale}/platform/businesses`}
            className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--pt-accent-border)] text-[var(--pt-text-2)] hover:bg-[var(--pt-accent-dim)] transition nvi-press"
            aria-label={t('workspaceBack')}
          >
            <ChevronLeft size={14} />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--pt-text-1)] truncate">{biz.name}</h1>
              {sub?.tier && (
                <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${TIER_COLORS[sub.tier] ?? ''}`}>
                  {sub.tier}
                </span>
              )}
              {isReadOnly && (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                  <Lock size={9} />
                  {t('workspaceReadOnly')}
                </span>
              )}
            </div>

            {/* Status pipeline */}
            <div className="mt-2 flex items-center gap-1">
              {STATUS_PIPELINE.map((status, i) => {
                const isCurrent = biz.status === status;
                const isPast = STATUS_PIPELINE.indexOf(biz.status as typeof STATUS_PIPELINE[number]) > i;
                return (
                  <div key={status} className="flex items-center">
                    <div
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase transition ${
                        isCurrent
                          ? 'bg-[var(--pt-accent-dim)] text-[var(--pt-accent)] shadow-[0_0_10px_var(--pt-accent-dim)]'
                          : isPast
                            ? 'text-[var(--pt-text-2)]'
                            : 'text-[var(--pt-text-muted)]'
                      }`}
                    >
                      {isCurrent && <span className="h-1 w-1 rounded-full bg-[var(--pt-accent)] animate-pulse" />}
                      {status}
                    </div>
                    {i < STATUS_PIPELINE.length - 1 && (
                      <span className="mx-0.5 text-[var(--pt-text-muted)]">→</span>
                    )}
                  </div>
                );
              })}
              {/* Show non-pipeline statuses separately */}
              {!STATUS_PIPELINE.includes(biz.status as typeof STATUS_PIPELINE[number]) && (
                <span className="ml-2 rounded-full bg-zinc-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase text-zinc-400">
                  {biz.status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={ws.loadWorkspace}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--pt-accent-border)] px-3 py-1.5 text-[10px] text-[var(--pt-accent)] hover:bg-[var(--pt-accent-dim)] transition nvi-press"
          >
            <RefreshCw size={11} />
            {t('workspaceRefresh')}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowQuickActionConfirm('readonly');
              setQuickActionReason('');
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[10px] font-semibold transition nvi-press ${
              isReadOnly
                ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
            }`}
          >
            {isReadOnly ? <LockOpen size={11} /> : <Lock size={11} />}
            {isReadOnly ? t('workspaceDisableReadOnly') : t('workspaceEnableReadOnly')}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowQuickActionConfirm('logout');
              setQuickActionReason('');
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 px-3 py-1.5 text-[10px] font-semibold text-red-400 hover:bg-red-500/10 transition nvi-press"
          >
            <LogOut size={11} />
            {t('workspaceForceLogout')}
          </button>
        </div>
      </div>

      {/* ── Quick action confirm modal ── */}
      {showQuickActionConfirm && (
        <Card padding="md" className="nvi-slide-in-bottom border-l-2 border-l-amber-400">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              {showQuickActionConfirm === 'logout' ? (
                <LogOut size={14} className="text-amber-400" />
              ) : (
                <Lock size={14} className="text-amber-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[var(--pt-text-1)]">
                {showQuickActionConfirm === 'logout'
                  ? t('workspaceConfirmLogoutTitle')
                  : isReadOnly
                    ? t('workspaceConfirmDisableReadOnlyTitle')
                    : t('workspaceConfirmEnableReadOnlyTitle')}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--pt-text-muted)]">
                {showQuickActionConfirm === 'logout'
                  ? t('workspaceConfirmLogoutHint')
                  : t('workspaceConfirmReadOnlyHint')}
              </p>
              <input
                type="text"
                value={quickActionReason}
                onChange={(e) => setQuickActionReason(e.target.value)}
                placeholder={t('workspaceReasonPlaceholder')}
                autoFocus
                className="mt-2 w-full rounded-lg border border-[var(--pt-accent-border)] bg-transparent px-2 py-1 text-xs text-[var(--pt-text-1)] outline-none focus:border-[var(--pt-accent)]"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickActionConfirm(null);
                    setQuickActionReason('');
                  }}
                  className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-[var(--pt-text-muted)] nvi-press"
                >
                  {t('workspaceCancel')}
                </button>
                <button
                  type="button"
                  onClick={handleQuickAction}
                  disabled={!quickActionReason.trim()}
                  className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-1 text-[10px] font-semibold text-amber-400 disabled:opacity-40 nvi-press"
                >
                  {t('workspaceConfirm')}
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Banner ── */}
      {banner && (
        <Banner
          message={banner.text}
          severity={banner.severity}
          onDismiss={() => setBanner(null)}
        />
      )}

      {/* ── Vitals strip — 6 signal cards ── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6 nvi-stagger">
        {/* Health score */}
        <Card padding="md" className="nvi-card-hover">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('vitalsHealth')}</p>
              <p className="text-xl font-bold text-[var(--pt-text-1)] tabular-nums">{healthScore}</p>
            </div>
            <RingGauge
              value={healthScore}
              max={100}
              size={40}
              stroke={4}
              color={healthColor(healthScore)}
            />
          </div>
        </Card>

        {/* Subscription expiry */}
        <Card padding="md" className="nvi-card-hover">
          <p className="text-[9px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('vitalsExpiry')}</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${expiryColor(expiryDays)}`}>
            {expiryDays !== null ? (expiryDays < 0 ? `${Math.abs(expiryDays)}d` : `${expiryDays}d`) : '—'}
          </p>
          <p className="text-[9px] text-[var(--pt-text-muted)] mt-0.5">
            {expiryDays === null ? '' : expiryDays < 0 ? t('vitalsExpiryAgo') : t('vitalsExpiryAhead')}
          </p>
        </Card>

        {/* Counts */}
        <Card padding="md" className="nvi-card-hover">
          <p className="text-[9px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('vitalsCounts')}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--pt-text-1)]">
            <span className="flex items-center gap-1" title={t('vitalsBranches')}>
              <Building2 size={11} className="text-[var(--pt-text-muted)]" />
              <span className="tabular-nums">{counts?.branches ?? 0}</span>
            </span>
            <span className="flex items-center gap-1" title={t('vitalsUsers')}>
              <Users size={11} className="text-[var(--pt-text-muted)]" />
              <span className="tabular-nums">{counts?.users ?? 0}</span>
            </span>
            <span className="flex items-center gap-1" title={t('vitalsDevices')}>
              <Smartphone size={11} className="text-[var(--pt-text-muted)]" />
              <span className="tabular-nums">{counts?.offlineDevices ?? 0}</span>
            </span>
          </div>
        </Card>

        {/* Pending queue */}
        <Card padding="md" className="nvi-card-hover">
          <p className="text-[9px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('vitalsPending')}</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${pendingTotal > 0 ? 'text-amber-400' : 'text-[var(--pt-text-muted)]'}`}>
            {pendingTotal}
          </p>
          <p className="text-[9px] text-[var(--pt-text-muted)] mt-0.5 flex items-center gap-1">
            <Layers size={9} />
            {t('vitalsPendingHint')}
          </p>
        </Card>

        {/* Onboarding progress */}
        <Card padding="md" className="nvi-card-hover">
          <p className="text-[9px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('vitalsOnboarding')}</p>
          <p className="mt-1 text-xl font-bold text-[var(--pt-text-1)] tabular-nums">
            {completedMilestones}<span className="text-xs text-[var(--pt-text-muted)] font-normal">/5</span>
          </p>
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mt-1">
            <div
              className="h-full bg-emerald-400 transition-all duration-700"
              style={{ width: `${(completedMilestones / 5) * 100}%` }}
            />
          </div>
        </Card>

        {/* Last activity */}
        <Card padding="md" className="nvi-card-hover">
          <p className="text-[9px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('vitalsLastActivity')}</p>
          <p className="mt-1 text-xl font-bold text-[var(--pt-text-1)] tabular-nums">
            {relativeTime(biz.lastActivityAt)}
          </p>
          <p className="text-[9px] text-[var(--pt-text-muted)] mt-0.5 flex items-center gap-1">
            <Activity size={9} />
            {t('vitalsLastActivityHint')}
          </p>
        </Card>
      </div>

      {/* ── Tab navigation — custom inline (Tabs component CSS conflicts with --pt-* theme) ── */}
      <div className="flex flex-wrap gap-1 border-b border-white/[0.06] nvi-slide-in-bottom">
        {TABS.map((tabKey) => {
          const isActive = activeTab === tabKey;
          return (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className={`px-3 py-2 text-xs font-semibold transition nvi-press relative ${
                isActive
                  ? 'text-[var(--pt-accent)]'
                  : 'text-[var(--pt-text-muted)] hover:text-[var(--pt-text-2)]'
              }`}
            >
              {t(`workspaceTab.${tabKey}.label`)}
              {isActive && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--pt-accent)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <div className="min-h-[200px]">
        {activeTab === 'overview' && <BusinessOverviewTab workspace={wks} businessId={businessId} />}
        {activeTab === 'subscription' && <BusinessSubscriptionTab businessId={businessId} />}
        {activeTab === 'status' && <BusinessStatusTab businessId={businessId} />}
        {activeTab === 'notes' && <BusinessNotesTab businessId={businessId} />}
        {activeTab === 'devices' && <BusinessDevicesTab businessId={businessId} />}
        {activeTab === 'exports' && <BusinessExportsTab businessId={businessId} />}
      </div>
    </section>
  );
}
