'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  CreditCard,
  Sparkles,
  Calendar,
  History,
  Inbox,
  Check,
  X,
  ChevronRight,
  ChevronLeft,
  DollarSign,
  Gift,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/Spinner';
import { SubscriptionRevenueChart } from '../components/SubscriptionRevenueChart';
import { useBusinessWorkspace } from '../hooks/useBusinessWorkspace';

type Props = {
  businessId: string;
};

const TIERS = [
  {
    value: 'STARTER' as const,
    icon: '🌱',
    label: 'Starter',
    features: ['Up to 5 users', '1 branch', '5,000 products'],
  },
  {
    value: 'BUSINESS' as const,
    icon: '⚡',
    label: 'Business',
    features: ['Up to 15 users', '5 branches', 'Offline mode'],
  },
  {
    value: 'ENTERPRISE' as const,
    icon: '👑',
    label: 'Enterprise',
    features: ['Unlimited users', 'Unlimited branches', '+ WhatsApp'],
  },
];

const DURATION_OPTIONS = [1, 2, 3, 6, 12];

const TIER_COLORS: Record<string, string> = {
  STARTER: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  BUSINESS: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
  ENTERPRISE: 'text-yellow-200 border-yellow-500/30 bg-yellow-500/10',
};

function formatDate(date?: string | Date | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString();
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('en-US') + ' TZS';
}

export function BusinessSubscriptionTab({ businessId }: Props) {
  const t = useTranslations('platformConsole');
  const ws = useBusinessWorkspace(businessId);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tier, setTier] = useState<'STARTER' | 'BUSINESS' | 'ENTERPRISE'>('BUSINESS');
  const [months, setMonths] = useState<number>(1);
  const [customMonths, setCustomMonths] = useState<string>('');
  const [isPaid, setIsPaid] = useState(true);
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-load on mount
  useEffect(() => {
    ws.loadSubscriptionData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const sub = ws.workspace?.subscription;

  // Live preview computations
  const effectiveMonths = customMonths ? parseInt(customMonths, 10) || 0 : months;
  const previewExpiryDate = useMemo(() => {
    const start = new Date();
    start.setMonth(start.getMonth() + effectiveMonths);
    return start;
  }, [effectiveMonths]);
  const previewAmount = isPaid ? parseFloat(amount) || 0 : 0;

  const canSubmit = effectiveMonths > 0 && reason.trim().length > 0 && (!isPaid || previewAmount > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    const ok = await ws.recordPurchase({
      tier,
      months: effectiveMonths,
      isPaid,
      amountDue: previewAmount,
      reason,
    });
    if (ok) {
      setStep(1);
      setCustomMonths('');
      setMonths(1);
      setAmount('');
      setReason('');
    }
    setIsSubmitting(false);
  };

  const handleApprove = async (requestId: string) => {
    await ws.decideSubscriptionRequest(requestId, 'approve', {});
  };

  const handleReject = async (requestId: string) => {
    const note = window.prompt(t('subscriptionRejectPrompt'));
    if (note !== null) {
      await ws.decideSubscriptionRequest(requestId, 'reject', { responseNote: note });
    }
  };

  return (
    <div className="space-y-4 nvi-stagger">
      {/* ── Current subscription display ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-amber-400">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
            <CreditCard size={16} className="text-amber-400" />
          </div>
          <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('subscriptionCurrent')}</h3>
        </div>

        {sub ? (
          <>
            <div className="flex items-center gap-2 mb-3">
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

            {/* Visual timeline */}
            <div className="relative pt-2">
              <div className="absolute left-0 right-0 top-[12px] h-px bg-white/[0.06]" />
              <div className="relative flex items-start justify-between">
                {[
                  { label: t('subscriptionTrialStart'), date: sub.createdAt },
                  { label: t('subscriptionTrialEnds'), date: sub.trialEndsAt },
                  { label: t('subscriptionExpires'), date: sub.expiresAt },
                  { label: t('subscriptionGraceEnds'), date: sub.graceEndsAt },
                ].map((point, i) => (
                  <div key={i} className="flex flex-col items-center text-center max-w-[80px]">
                    <div className={`h-3 w-3 rounded-full border-2 border-[var(--pt-bg-deep)] ${point.date ? 'bg-amber-400' : 'bg-white/[0.06]'}`} />
                    <p className="mt-1 text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">{point.label}</p>
                    <p className="text-[10px] text-[var(--pt-text-1)] mt-0.5">{formatDate(point.date)}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-[var(--pt-text-muted)]">{t('subscriptionNoSubscription')}</p>
        )}
      </Card>

      {/* ── Pending requests ── */}
      {ws.pendingRequests.length > 0 && (
        <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-blue-400">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <Inbox size={16} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('subscriptionPendingRequests')}</h3>
              <p className="text-[10px] text-[var(--pt-text-muted)]">{t('subscriptionPendingRequestsHint')}</p>
            </div>
          </div>

          <div className="space-y-2">
            {ws.pendingRequests.map((req) => (
              <div key={req.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-400">
                        {req.type}
                      </span>
                      {req.requestedTier && (
                        <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${TIER_COLORS[req.requestedTier] ?? ''}`}>
                          {req.requestedTier}
                        </span>
                      )}
                      {req.requestedDurationMonths && (
                        <span className="text-[9px] text-[var(--pt-text-muted)]">
                          {req.requestedDurationMonths} {t('subscriptionMonths')}
                        </span>
                      )}
                    </div>
                    {req.reason && (
                      <p className="mt-1 text-[10px] text-[var(--pt-text-2)]">{req.reason}</p>
                    )}
                    <p className="mt-0.5 text-[9px] text-[var(--pt-text-muted)]">
                      {new Date(req.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => handleApprove(req.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 text-[9px] font-semibold text-emerald-400 nvi-press"
                    >
                      <Check size={10} />
                      {t('subscriptionApprove')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(req.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-red-500/15 border border-red-500/30 px-2 py-1 text-[9px] font-semibold text-red-400 nvi-press"
                    >
                      <X size={10} />
                      {t('subscriptionReject')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Record purchase form (3-step) ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-emerald-400">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
            <Sparkles size={16} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('subscriptionRecordPurchase')}</h3>
            <p className="text-[10px] text-[var(--pt-text-muted)]">{t('subscriptionRecordPurchaseHint')}</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          {[
            { num: 1, label: t('subscriptionStepTier') },
            { num: 2, label: t('subscriptionStepDuration') },
            { num: 3, label: t('subscriptionStepPayment') },
          ].map((s, i) => (
            <div key={s.num} className="flex items-center gap-2 flex-1">
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold transition ${
                  step >= s.num ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/[0.04] text-[var(--pt-text-muted)]'
                }`}
              >
                {step > s.num ? <Check size={10} /> : s.num}
              </div>
              <span className={`text-[10px] uppercase tracking-wide ${step === s.num ? 'text-[var(--pt-text-1)]' : 'text-[var(--pt-text-muted)]'}`}>
                {s.label}
              </span>
              {i < 2 && <div className={`flex-1 h-px ${step > s.num ? 'bg-emerald-500/30' : 'bg-white/[0.06]'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Tier */}
        {step === 1 && (
          <div className="space-y-3 nvi-slide-in-bottom">
            {TIERS.map((tierOpt) => {
              const isSelected = tier === tierOpt.value;
              return (
                <button
                  key={tierOpt.value}
                  type="button"
                  onClick={() => setTier(tierOpt.value)}
                  className={`w-full rounded-xl border p-3 text-left transition nvi-press ${
                    isSelected
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-[var(--pt-accent-border)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{tierOpt.icon}</div>
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${isSelected ? 'text-emerald-400' : 'text-[var(--pt-text-1)]'}`}>
                        {tierOpt.label}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {tierOpt.features.map((f, i) => (
                          <li key={i} className="text-[10px] text-[var(--pt-text-muted)]">• {f}</li>
                        ))}
                      </ul>
                    </div>
                    {isSelected && (
                      <div className="rounded-full bg-emerald-500 p-0.5">
                        <Check size={9} className="text-black" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2: Duration */}
        {step === 2 && (
          <div className="space-y-3 nvi-slide-in-bottom">
            <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">{t('subscriptionPurchaseDurationLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((m) => {
                const isSelected = months === m && !customMonths;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMonths(m);
                      setCustomMonths('');
                    }}
                    className={`rounded-full px-3 py-1 text-[10px] font-semibold transition nvi-press ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'border border-white/[0.06] text-[var(--pt-text-muted)] hover:border-[var(--pt-accent-border)]'
                    }`}
                  >
                    {m} {m === 1 ? t('subscriptionMonth') : t('subscriptionMonths')}
                  </button>
                );
              })}
            </div>
            <div className="pt-1">
              <TextInput
                label={t('subscriptionCustomMonths')}
                type="number"
                value={customMonths}
                onChange={(e) => setCustomMonths(e.target.value)}
                placeholder="e.g. 18"
              />
            </div>
            {effectiveMonths > 0 && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <Calendar size={10} />
                  {t('subscriptionPreviewExpiry')}: <strong>{previewExpiryDate.toLocaleDateString()}</strong>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Payment */}
        {step === 3 && (
          <div className="space-y-3 nvi-slide-in-bottom">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsPaid(true)}
                className={`flex-1 rounded-xl border p-3 text-left transition nvi-press ${
                  isPaid
                    ? 'border-emerald-500/50 bg-emerald-500/5'
                    : 'border-white/[0.06] bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <DollarSign size={14} className={isPaid ? 'text-emerald-400' : 'text-[var(--pt-text-muted)]'} />
                  <span className={`text-xs font-semibold ${isPaid ? 'text-emerald-400' : 'text-[var(--pt-text-2)]'}`}>
                    {t('subscriptionPaid')}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setIsPaid(false)}
                className={`flex-1 rounded-xl border p-3 text-left transition nvi-press ${
                  !isPaid
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : 'border-white/[0.06] bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Gift size={14} className={!isPaid ? 'text-blue-400' : 'text-[var(--pt-text-muted)]'} />
                  <span className={`text-xs font-semibold ${!isPaid ? 'text-blue-400' : 'text-[var(--pt-text-2)]'}`}>
                    {t('subscriptionComplimentary')}
                  </span>
                </div>
              </button>
            </div>

            {isPaid && (
              <TextInput
                label={t('subscriptionAmount')}
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            )}

            <Textarea
              label={t('subscriptionReason')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('subscriptionPurchaseReasonPlaceholder')}
              rows={2}
            />

            {/* Live preview */}
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-emerald-400">{t('subscriptionPreview')}</p>
              <p className="text-[10px] text-[var(--pt-text-2)]">
                {tier} · {effectiveMonths} {effectiveMonths === 1 ? t('subscriptionMonth') : t('subscriptionMonths')}
              </p>
              <p className="text-[10px] text-[var(--pt-text-2)]">
                {t('subscriptionExpiresOn')}: {previewExpiryDate.toLocaleDateString()}
              </p>
              {isPaid && previewAmount > 0 && (
                <p className="text-sm font-bold text-emerald-400">{formatMoney(previewAmount)}</p>
              )}
            </div>
          </div>
        )}

        {/* Step nav */}
        <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => step > 1 && setStep((step - 1) as 1 | 2 | 3)}
            disabled={step === 1 || isSubmitting}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-1.5 text-[10px] text-[var(--pt-text-2)] disabled:opacity-40 nvi-press"
          >
            <ChevronLeft size={11} />
            {t('subscriptionBack')}
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((step + 1) as 1 | 2 | 3)}
              disabled={step === 2 && effectiveMonths <= 0}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 text-[10px] font-semibold text-emerald-400 disabled:opacity-40 nvi-press"
            >
              {t('subscriptionContinue')}
              <ChevronRight size={11} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-semibold text-black disabled:opacity-40 nvi-press"
            >
              {isSubmitting ? <Spinner size="xs" variant="dots" /> : <Check size={11} />}
              {isSubmitting ? t('subscriptionRecording') : t('subscriptionConfirm')}
            </button>
          )}
        </div>
      </Card>

      {/* ── Revenue timeline chart ── */}
      {ws.purchases.length > 0 && (
        <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-emerald-400">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
              <History size={16} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('subscriptionRevenueTimeline')}</h3>
              <p className="text-[10px] text-[var(--pt-text-muted)]">{t('subscriptionRevenueTimelineHint')}</p>
            </div>
          </div>
          <SubscriptionRevenueChart purchases={ws.purchases} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Purchase history ── */}
        <Card padding="lg" className="nvi-slide-in-bottom">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10">
              <History size={16} className="text-purple-400" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('subscriptionPurchaseHistory')}</h3>
          </div>

          {ws.isLoadingSubscription ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[0.03]" />
              ))}
            </div>
          ) : ws.purchases.length === 0 ? (
            <EmptyState
              icon={<History size={24} className="text-[var(--pt-text-muted)]" />}
              title={t('subscriptionNoPurchases')}
            />
          ) : (
            <div className="space-y-2">
              {ws.purchases.map((p) => (
                <div key={p.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${TIER_COLORS[p.tier] ?? ''}`}>
                        {p.tier}
                      </span>
                      <span className="text-[10px] text-[var(--pt-text-2)]">
                        {p.months} {p.months === 1 ? t('subscriptionMonth') : t('subscriptionMonths')}
                      </span>
                      {p.isPaid ? (
                        <span className="text-[10px] font-bold text-emerald-400 tabular-nums">
                          {formatMoney(p.amountDue)}
                        </span>
                      ) : (
                        <span className="text-[9px] text-blue-400">
                          {t('subscriptionComplimentary')}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-[9px] text-[var(--pt-text-muted)]">
                      {formatDate(p.createdAt)}
                    </span>
                  </div>
                  {p.reason && (
                    <p className="mt-1 text-[9px] text-[var(--pt-text-muted)]">{p.reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Subscription change history ── */}
        <Card padding="lg" className="nvi-slide-in-bottom">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
              <History size={16} className="text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('subscriptionChangeHistory')}</h3>
          </div>

          {ws.isLoadingSubscription ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[0.03]" />
              ))}
            </div>
          ) : ws.subscriptionHistory.length === 0 ? (
            <EmptyState
              icon={<History size={24} className="text-[var(--pt-text-muted)]" />}
              title={t('subscriptionNoChanges')}
            />
          ) : (
            <div className="space-y-2">
              {ws.subscriptionHistory.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-[10px]">
                  <div className="flex items-center gap-2">
                    {entry.previousTier && entry.newTier && entry.previousTier !== entry.newTier && (
                      <span className="text-[var(--pt-text-2)]">
                        {entry.previousTier} → <strong className="text-[var(--pt-accent)]">{entry.newTier}</strong>
                      </span>
                    )}
                    {entry.previousStatus && entry.newStatus && entry.previousStatus !== entry.newStatus && (
                      <span className="text-[var(--pt-text-2)]">
                        {entry.previousStatus} → <strong className="text-[var(--pt-accent)]">{entry.newStatus}</strong>
                      </span>
                    )}
                    <span className="ml-auto text-[var(--pt-text-muted)]">{formatDate(entry.createdAt)}</span>
                  </div>
                  {entry.reason && (
                    <p className="mt-0.5 text-[var(--pt-text-muted)]">{entry.reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
