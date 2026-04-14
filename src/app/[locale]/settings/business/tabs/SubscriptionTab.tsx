'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CreditCard, Send, ArrowUpCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { SmartSelect } from '@/components/SmartSelect';
import { ProgressBar } from '@/components/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/Spinner';
import { Banner } from '@/components/notifications/Banner';
import { useFormatDate } from '@/lib/business-context';
import type { useBusinessSettings } from '../hooks/useBusinessSettings';

type Props = { ctx: ReturnType<typeof useBusinessSettings> };

const TIER_RANK: Record<string, number> = { STARTER: 0, BUSINESS: 1, ENTERPRISE: 2 };
const ALL_TIERS = [
  { value: 'STARTER', label: 'Starter' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'ENTERPRISE', label: 'Enterprise' },
];
const DURATION_OPTIONS = [
  { value: '1', label: '1 month' },
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
];

export function SubscriptionTab({ ctx }: Props) {
  const t = useTranslations('businessSettingsPage');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const { formatDate, formatDateTime } = useFormatDate();
  const sub = ctx.subscription;

  const currentTier = sub?.tier ?? 'STARTER';
  const currentRank = TIER_RANK[currentTier] ?? 0;
  const isActive = sub?.status === 'ACTIVE';
  const isTrial = sub?.status === 'TRIAL';
  const isExpired = sub?.status === 'EXPIRED' || sub?.status === 'GRACE';
  const isEnterprise = currentTier === 'ENTERPRISE';
  const hasPendingRequest = ctx.subscriptionRequests.some((r) => r.status === 'PENDING');

  // Available actions
  const canSubscribe = isTrial || isExpired;
  const canUpgrade = isActive && !isEnterprise;
  const canCancel = isActive;

  // Auto-set form defaults when type changes
  const formType = ctx.subscriptionRequestForm.type;

  // For SUBSCRIBE: tiers >= current (you can subscribe at your current tier or higher)
  const subscribeTierOptions = ALL_TIERS.filter((o) => TIER_RANK[o.value] >= currentRank);
  // For UPGRADE: tiers > current only
  const upgradeTierOptions = ALL_TIERS.filter((o) => TIER_RANK[o.value] > currentRank);

  // Auto-select current tier when switching to SUBSCRIBE
  useEffect(() => {
    if (formType === 'SUBSCRIBE' && ctx.subscriptionRequestForm.requestedTier !== currentTier) {
      const tierRank = TIER_RANK[ctx.subscriptionRequestForm.requestedTier] ?? -1;
      if (tierRank < currentRank) {
        ctx.setSubscriptionRequestForm({ ...ctx.subscriptionRequestForm, requestedTier: currentTier });
      }
    }
  }, [formType, currentTier]);

  const renderUsageBar = (label: string, used: number, limit: number | string | boolean | null | undefined) => {
    const numericLimit = typeof limit === 'number' && limit >= 0 ? limit : null;
    const effectiveMax = numericLimit ?? used;
    const ratio = effectiveMax > 0 ? used / effectiveMax : 0;
    const barColor: 'red' | 'amber' | 'green' = ratio > 0.9 ? 'red' : ratio > 0.7 ? 'amber' : 'green';
    return (
      <ProgressBar
        value={used}
        max={effectiveMax}
        label={label}
        showValue
        formatValue={(v, m) => numericLimit ? `${v} / ${m}` : `${v} (${t('unlimited')})`}
        color={barColor}
      />
    );
  };

  const selectAction = (type: string) => {
    const patch: Record<string, string> = { type, reason: '' };
    if (type === 'SUBSCRIBE') {
      patch.requestedTier = currentTier;
      patch.requestedDurationMonths = '1';
    } else if (type === 'UPGRADE') {
      patch.requestedTier = upgradeTierOptions[0]?.value ?? 'BUSINESS';
      patch.requestedDurationMonths = '1';
    }
    ctx.setSubscriptionRequestForm({ ...ctx.subscriptionRequestForm, ...patch });
  };

  return (
    <div className="space-y-4 nvi-stagger">
      {/* ── Subscription overview ── */}
      {sub && (
        <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-amber-400">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <CreditCard size={18} className="text-amber-400" />
            </div>
            <h3 className="text-base font-semibold text-nvi-text-primary">{t('subscriptionTitle')}</h3>
          </div>

          {sub.warnings.length > 0 && (
            <Banner message={sub.warnings.map((w) => w.message).join(' ')} severity="warning" />
          )}

          {sub.status === 'TRIAL' && sub.trialEndsAt && (
            <Banner
              message={t('trialDeleteNotice', {
                trialEnd: formatDate(sub.trialEndsAt),
                deleteDate: formatDate(new Date(new Date(sub.trialEndsAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()),
              })}
              severity="info"
            />
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-widest text-nvi-text-tertiary">
                {sub.status === 'TRIAL' ? t('trialEndsLabel') : sub.status === 'GRACE' ? t('graceEndsLabel') : t('expiresAtLabel')}
              </p>
              <p className="mt-1 text-sm font-semibold text-nvi-text-primary">
                {formatDate(sub.trialEndsAt ?? sub.graceEndsAt ?? sub.expiresAt ?? '')}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-widest text-nvi-text-tertiary">{t('daysRemainingLabel')}</p>
              <p className="mt-1 text-sm font-semibold text-nvi-text-primary">
                {(() => {
                  const endDate = sub.trialEndsAt ?? sub.graceEndsAt ?? sub.expiresAt;
                  if (!endDate) return '—';
                  const days = Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                  return t('daysRemainingValue', { value: days });
                })()}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {renderUsageBar(t('usageUsers'), sub.usage.users, sub.limits.users)}
            {renderUsageBar(t('usageBranches'), sub.usage.branches, sub.limits.branches)}
            {renderUsageBar(t('usageProducts'), sub.usage.products, sub.limits.products)}
            {renderUsageBar(t('usageDevices'), sub.usage.devices, sub.limits.offlineDevices)}
          </div>
        </Card>
      )}

      {/* ── Subscription actions ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-purple-400">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/10">
            <Send size={18} className="text-purple-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-nvi-text-primary">{t('subscriptionRequestsTitle')}</h3>
            <p className="text-[10px] text-nvi-text-tertiary mt-0.5">{t('subscriptionRequestsSubtitle')}</p>
          </div>
        </div>

        {/* Pending request banner */}
        {hasPendingRequest && (
          <Banner message={t('pendingRequestNotice') || 'You already have a pending subscription request. Please wait for it to be reviewed before submitting another.'} severity="info" />
        )}

        {/* Action buttons — pick one */}
        {!hasPendingRequest && (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {canSubscribe && (
                <button
                  type="button"
                  onClick={() => selectAction('SUBSCRIBE')}
                  disabled={!ctx.canRequestSubscription}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition nvi-press ${
                    formType === 'SUBSCRIBE'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'text-nvi-text-secondary border border-white/[0.08] hover:border-emerald-500/20'
                  }`}
                >
                  <CreditCard size={14} />
                  {t('subscribe')}
                </button>
              )}
              {canUpgrade && (
                <button
                  type="button"
                  onClick={() => selectAction('UPGRADE')}
                  disabled={!ctx.canRequestSubscription}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition nvi-press ${
                    formType === 'UPGRADE'
                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                      : 'text-nvi-text-secondary border border-white/[0.08] hover:border-blue-500/20'
                  }`}
                >
                  <ArrowUpCircle size={14} />
                  {t('requestUpgrade')}
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  onClick={() => selectAction('CANCEL')}
                  disabled={!ctx.canRequestSubscription}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition nvi-press ${
                    formType === 'CANCEL'
                      ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                      : 'text-nvi-text-secondary border border-white/[0.08] hover:border-red-500/20'
                  }`}
                >
                  <XCircle size={14} />
                  {t('requestCancel')}
                </button>
              )}
            </div>

            {/* Enterprise max-tier notice */}
            {isActive && isEnterprise && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                <AlertTriangle size={14} className="shrink-0" />
                {t('alreadyHighestTier') || 'You are on the highest subscription tier. No upgrades are available.'}
              </div>
            )}

            {/* ── SUBSCRIBE form ── */}
            {formType === 'SUBSCRIBE' && canSubscribe && (
              <div className="space-y-3 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03] p-4">
                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">{t('subscribe')}</p>
                <p className="text-[10px] text-nvi-text-tertiary">
                  {t('subscribeHint') || 'Choose the tier you want to subscribe to and for how long. You can keep your current tier or move to a higher one.'}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SmartSelect
                    instanceId="sub-tier"
                    value={ctx.subscriptionRequestForm.requestedTier}
                    onChange={(value) => ctx.setSubscriptionRequestForm({ ...ctx.subscriptionRequestForm, requestedTier: value })}
                    options={subscribeTierOptions}
                    placeholder={t('selectTier')}
                  />
                  <SmartSelect
                    instanceId="sub-duration"
                    value={ctx.subscriptionRequestForm.requestedDurationMonths}
                    onChange={(value) => ctx.setSubscriptionRequestForm({ ...ctx.subscriptionRequestForm, requestedDurationMonths: value })}
                    options={DURATION_OPTIONS}
                    placeholder={t('subscriptionDuration')}
                  />
                </div>
                <TextInput
                  label={t('requestReason')}
                  value={ctx.subscriptionRequestForm.reason}
                  onChange={(e) => ctx.setSubscriptionRequestForm({ ...ctx.subscriptionRequestForm, reason: e.target.value })}
                />
                <p className="text-[10px] text-nvi-text-tertiary">{t('subscriptionPaymentNote')}</p>
                <button
                  type="button"
                  onClick={ctx.submitSubscriptionRequest}
                  disabled={ctx.isSubmittingRequest || !ctx.canRequestSubscription}
                  title={!ctx.canRequestSubscription ? noAccess('title') : undefined}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 text-xs font-semibold text-emerald-400 disabled:opacity-70 nvi-press"
                >
                  {ctx.isSubmittingRequest ? <Spinner size="xs" variant="orbit" /> : <Send size={14} />}
                  {ctx.isSubmittingRequest ? t('submitting') : t('subscribe')}
                </button>
              </div>
            )}

            {/* ── UPGRADE form ── */}
            {formType === 'UPGRADE' && canUpgrade && (
              <div className="space-y-3 rounded-xl border border-blue-500/10 bg-blue-500/[0.03] p-4">
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">{t('requestUpgrade')}</p>
                <p className="text-[10px] text-nvi-text-tertiary">
                  {t('upgradeHint') || 'Select a higher tier to upgrade to. Your current usage and data will carry over.'}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SmartSelect
                    instanceId="sub-tier"
                    value={ctx.subscriptionRequestForm.requestedTier}
                    onChange={(value) => ctx.setSubscriptionRequestForm({ ...ctx.subscriptionRequestForm, requestedTier: value })}
                    options={upgradeTierOptions}
                    placeholder={t('selectTier')}
                  />
                  <SmartSelect
                    instanceId="sub-duration"
                    value={ctx.subscriptionRequestForm.requestedDurationMonths}
                    onChange={(value) => ctx.setSubscriptionRequestForm({ ...ctx.subscriptionRequestForm, requestedDurationMonths: value })}
                    options={DURATION_OPTIONS}
                    placeholder={t('subscriptionDuration')}
                  />
                </div>
                <TextInput
                  label={t('requestReason')}
                  value={ctx.subscriptionRequestForm.reason}
                  onChange={(e) => ctx.setSubscriptionRequestForm({ ...ctx.subscriptionRequestForm, reason: e.target.value })}
                />
                <p className="text-[10px] text-nvi-text-tertiary">{t('subscriptionPaymentNote')}</p>
                <button
                  type="button"
                  onClick={ctx.submitSubscriptionRequest}
                  disabled={ctx.isSubmittingRequest || !ctx.canRequestSubscription}
                  title={!ctx.canRequestSubscription ? noAccess('title') : undefined}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-2 text-xs font-semibold text-blue-400 disabled:opacity-70 nvi-press"
                >
                  {ctx.isSubmittingRequest ? <Spinner size="xs" variant="orbit" /> : <ArrowUpCircle size={14} />}
                  {ctx.isSubmittingRequest ? t('submitting') : t('requestUpgrade')}
                </button>
              </div>
            )}

            {/* ── CANCEL form ── */}
            {formType === 'CANCEL' && canCancel && (
              <div className="space-y-3 rounded-xl border border-red-500/10 bg-red-500/[0.03] p-4">
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">{t('requestCancel')}</p>
                <p className="text-[10px] text-red-300">
                  {t('cancelHint') || 'Requesting cancellation will end your subscription. Your data will be retained for 30 days after cancellation.'}
                </p>
                <TextInput
                  label={t('requestReason')}
                  value={ctx.subscriptionRequestForm.reason}
                  onChange={(e) => ctx.setSubscriptionRequestForm({ ...ctx.subscriptionRequestForm, reason: e.target.value })}
                />
                <button
                  type="button"
                  onClick={ctx.submitSubscriptionRequest}
                  disabled={ctx.isSubmittingRequest || !ctx.canRequestSubscription}
                  title={!ctx.canRequestSubscription ? noAccess('title') : undefined}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-2 text-xs font-semibold text-red-400 disabled:opacity-70 nvi-press"
                >
                  {ctx.isSubmittingRequest ? <Spinner size="xs" variant="orbit" /> : <XCircle size={14} />}
                  {ctx.isSubmittingRequest ? t('submitting') : t('requestCancel')}
                </button>
              </div>
            )}

            {/* No actions available (e.g. expired + enterprise — can only subscribe) */}
            {!canSubscribe && !canUpgrade && !canCancel && (
              <p className="text-xs text-nvi-text-tertiary">{t('noSubscriptionActionsAvailable') || 'No subscription actions are currently available.'}</p>
            )}
          </>
        )}

        {/* Request history */}
        <div className="mt-6 space-y-2 text-xs text-nvi-text-secondary">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('requestHistoryLabel') || 'Request history'}</p>
          {ctx.subscriptionRequests.map((request) => (
            <Card key={request.id} padding="sm" glow={false}>
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                  request.type === 'CANCEL' ? 'bg-red-500/10 text-red-400'
                    : request.type === 'UPGRADE' ? 'bg-blue-500/10 text-blue-400'
                    : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  {request.type}
                </span>
                {request.requestedTier && (
                  <span className="text-xs text-nvi-text-primary font-medium">{request.requestedTier}</span>
                )}
                <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                  request.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400'
                    : request.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {request.status}
                </span>
              </div>
              {request.reason && <p className="mt-1 text-xs text-nvi-text-tertiary">{request.reason}</p>}
              {request.responseNote && <p className="mt-1 text-xs text-purple-300">{t('requestResponse', { value: request.responseNote })}</p>}
              <p className="mt-1 text-[10px] text-nvi-text-tertiary">{formatDateTime(request.createdAt)}</p>
            </Card>
          ))}
          {!ctx.subscriptionRequests.length && (
            <EmptyState icon={<Send size={24} className="text-nvi-text-tertiary" />} title={t('subscriptionRequestsEmpty')} />
          )}
        </div>
      </Card>
    </div>
  );
}
