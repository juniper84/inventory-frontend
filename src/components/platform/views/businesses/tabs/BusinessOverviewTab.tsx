'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Building2,
  Mail,
  Phone,
  User,
  Globe,
  Calendar,
  Copy,
  Check,
  CreditCard,
  CircleCheck,
  CircleAlert,
  Package,
  Users,
  ShoppingCart,
  Settings,
  Activity,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Timeline } from '@/components/ui/Timeline';
import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { useBusinessWorkspace } from '../hooks/useBusinessWorkspace';
import type { BusinessWorkspace } from '@/components/platform/types';

type Props = {
  workspace: BusinessWorkspace;
  businessId: string;
};

const TIER_COLORS: Record<string, string> = {
  STARTER: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  BUSINESS: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
  ENTERPRISE: 'text-yellow-200 border-yellow-500/30 bg-yellow-500/10',
};

function relativeDate(date?: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function relativeFuture(date?: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const days = Math.ceil(diffMs / 86400000);
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'today';
  return `in ${days}d`;
}

function formatDate(date?: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString();
}

function getActionTone(outcome: string): 'green' | 'red' | 'amber' | 'gray' {
  if (outcome === 'SUCCESS') return 'green';
  if (outcome === 'FAILURE') return 'red';
  if (outcome === 'WARNING') return 'amber';
  return 'gray';
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function BusinessOverviewTab({ workspace, businessId }: Props) {
  const t = useTranslations('platformConsole');
  const [copiedId, setCopiedId] = useState(false);
  const ws = useBusinessWorkspace(businessId);

  // Auto-load heatmap on mount
  useEffect(() => {
    ws.loadHeatmap(90);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const biz = workspace.business;
  const sub = workspace.subscription;
  const owner = workspace.systemOwner;
  const onboarding = (workspace.settings?.onboarding ?? {}) as Record<string, unknown>;

  const copyId = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(biz.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    }
  };

  // Onboarding milestones — 5 standard ones
  const milestones = [
    { key: 'branchesCreated', icon: <Building2 size={12} />, label: t('overviewMilestoneBranches') },
    { key: 'productsCreated', icon: <Package size={12} />, label: t('overviewMilestoneProducts') },
    { key: 'salesRecorded', icon: <ShoppingCart size={12} />, label: t('overviewMilestoneSales') },
    { key: 'usersInvited', icon: <Users size={12} />, label: t('overviewMilestoneUsers') },
    { key: 'settingsConfigured', icon: <Settings size={12} />, label: t('overviewMilestoneSettings') },
  ];
  const completedMilestones = milestones.filter((m) => Boolean(onboarding[m.key])).length;
  const milestonePct = Math.round((completedMilestones / milestones.length) * 100);

  // Recent admin actions for Timeline
  const timelineItems = (workspace.recentAdminActions ?? []).slice(0, 10).map((action) => ({
    id: action.id,
    title: formatAction(action.action),
    subtitle: action.reason ?? action.resourceType,
    timestamp: relativeDate(action.createdAt),
    color: getActionTone(action.outcome),
  }));

  return (
    <div className="space-y-4 nvi-stagger">
      {/* ── Review status — only when under review ── */}
      {biz.underReview && (
        <Card padding="md" className="nvi-slide-in-bottom border-l-2 border-l-amber-400">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 animate-pulse">
              <CircleAlert size={16} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-amber-300">{t('overviewUnderReview')}</p>
                {biz.reviewSeverity && (
                  <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-300">
                    {biz.reviewSeverity}
                  </span>
                )}
              </div>
              {biz.reviewReason && (
                <p className="mt-0.5 text-xs text-amber-200/80">{biz.reviewReason}</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Activity heatmap ── */}
      <Card padding="lg" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
            <Activity size={16} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('overviewActivityHeatmap')}</h3>
            <p className="text-[10px] text-[var(--pt-text-muted)]">{t('overviewActivityHeatmapHint')}</p>
          </div>
        </div>
        {ws.isLoadingHeatmap ? (
          <div className="h-[100px] animate-pulse rounded-lg bg-white/[0.03]" />
        ) : ws.heatmap ? (
          <ActivityHeatmap
            data={ws.heatmap.data}
            totalActivity={ws.heatmap.totalActivity}
            peakDay={ws.heatmap.peakDay}
          />
        ) : (
          <p className="py-4 text-center text-xs text-[var(--pt-text-muted)]">
            {t('overviewActivityHeatmapEmpty')}
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Identity card ── */}
        <Card padding="lg" className="nvi-slide-in-bottom">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <Building2 size={16} className="text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('overviewIdentity')}</h3>
          </div>

          <dl className="space-y-3">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewName')}</dt>
              <dd className="text-sm font-semibold text-[var(--pt-text-1)] mt-0.5">{biz.name}</dd>
            </div>

            <div>
              <dt className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewBusinessId')}</dt>
              <dd className="mt-0.5 flex items-center gap-2">
                <code className="text-[10px] font-mono text-[var(--pt-text-2)] truncate">{biz.id}</code>
                <button
                  type="button"
                  onClick={copyId}
                  className="shrink-0 text-[var(--pt-text-muted)] hover:text-[var(--pt-accent)] transition nvi-press"
                  aria-label="Copy ID"
                >
                  {copiedId ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </dd>
            </div>

            {owner && (
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewOwner')}</dt>
                <dd className="mt-1 space-y-0.5">
                  <p className="flex items-center gap-1.5 text-xs text-[var(--pt-text-1)]">
                    <User size={11} className="text-[var(--pt-text-muted)]" />
                    {owner.name}
                  </p>
                  <p className="flex items-center gap-1.5 text-[10px] text-[var(--pt-text-muted)]">
                    <Mail size={10} />
                    {owner.email}
                  </p>
                  {owner.phone && (
                    <p className="flex items-center gap-1.5 text-[10px] text-[var(--pt-text-muted)]">
                      <Phone size={10} />
                      {owner.phone}
                    </p>
                  )}
                </dd>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewCreated')}</dt>
                <dd className="text-xs text-[var(--pt-text-1)] mt-0.5 flex items-center gap-1">
                  <Calendar size={10} className="text-[var(--pt-text-muted)]" />
                  {formatDate(biz.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewLanguage')}</dt>
                <dd className="text-xs text-[var(--pt-text-1)] mt-0.5 flex items-center gap-1">
                  <Globe size={10} className="text-[var(--pt-text-muted)]" />
                  {biz.defaultLanguage?.toUpperCase() ?? '—'}
                </dd>
              </div>
            </div>
          </dl>
        </Card>

        {/* ── Subscription card ── */}
        <Card padding="lg" className="nvi-slide-in-bottom">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
              <CreditCard size={16} className="text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('overviewSubscription')}</h3>
          </div>

          {sub ? (
            <dl className="space-y-3">
              <div className="flex items-center gap-2">
                {sub.tier && (
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${TIER_COLORS[sub.tier] ?? ''}`}>
                    {sub.tier}
                  </span>
                )}
                {sub.status && (
                  <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--pt-text-2)]">
                    {sub.status}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                {sub.trialEndsAt && (
                  <div>
                    <dt className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewTrialEnds')}</dt>
                    <dd className="text-xs text-[var(--pt-text-1)] mt-0.5">{formatDate(sub.trialEndsAt)}</dd>
                    <dd className="text-[10px] text-[var(--pt-text-muted)]">{relativeFuture(sub.trialEndsAt)}</dd>
                  </div>
                )}
                {sub.expiresAt && (
                  <div>
                    <dt className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewExpiresAt')}</dt>
                    <dd className="text-xs text-[var(--pt-text-1)] mt-0.5">{formatDate(sub.expiresAt)}</dd>
                    <dd className="text-[10px] text-[var(--pt-text-muted)]">{relativeFuture(sub.expiresAt)}</dd>
                  </div>
                )}
                {sub.graceEndsAt && (
                  <div>
                    <dt className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('overviewGraceEnds')}</dt>
                    <dd className="text-xs text-[var(--pt-text-1)] mt-0.5">{formatDate(sub.graceEndsAt)}</dd>
                    <dd className="text-[10px] text-[var(--pt-text-muted)]">{relativeFuture(sub.graceEndsAt)}</dd>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-[var(--pt-text-muted)] pt-1">{t('overviewSubscriptionEditHint')}</p>
            </dl>
          ) : (
            <p className="text-xs text-[var(--pt-text-muted)]">{t('overviewNoSubscription')}</p>
          )}
        </Card>

        {/* ── Onboarding milestones ── */}
        <Card padding="lg" className="nvi-slide-in-bottom">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('overviewOnboarding')}</h3>
            <span className="text-[10px] text-[var(--pt-text-muted)]">
              {completedMilestones} / {milestones.length}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-3">
            <div
              className="h-full bg-emerald-400 transition-all duration-700"
              style={{ width: `${milestonePct}%` }}
            />
          </div>

          {/* Milestone list */}
          <ul className="space-y-1.5">
            {milestones.map((m) => {
              const isComplete = Boolean(onboarding[m.key]);
              return (
                <li key={m.key} className="flex items-center gap-2 text-xs">
                  {isComplete ? (
                    <CircleCheck size={12} className="text-emerald-400 shrink-0" />
                  ) : (
                    <span className="h-3 w-3 rounded-full border border-white/[0.1] shrink-0" />
                  )}
                  <span className={isComplete ? 'text-[var(--pt-text-2)]' : 'text-[var(--pt-text-muted)]'}>
                    {m.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* ── Recent activity timeline ── */}
        <Card padding="lg" className="nvi-slide-in-bottom">
          <div className="mb-4 flex items-center gap-3">
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('overviewRecentActivity')}</h3>
            <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[9px] text-[var(--pt-text-muted)]">
              {timelineItems.length}
            </span>
          </div>

          {timelineItems.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--pt-text-muted)]">
              {t('overviewNoActivity')}
            </p>
          ) : (
            <Timeline items={timelineItems} />
          )}
        </Card>
      </div>
    </div>
  );
}
