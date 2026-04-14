'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  X,
  ChevronRight,
  ChevronLeft,
  CircleCheck,
  CircleX,
  TriangleAlert,
  Users,
  Smartphone,
  Package,
  Lock,
  Loader,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { Spinner } from '@/components/Spinner';
import { useBusinessWorkspace } from './hooks/useBusinessWorkspace';

export type ActionKey = 'SUSPEND' | 'ARCHIVE' | 'DELETE_READY' | 'RESTORE' | 'PURGE';

type Props = {
  open: boolean;
  action: ActionKey | null;
  businessId: string;
  businessName: string;
  onClose: () => void;
  onCompleted?: () => void;
};

type Preflight = {
  action: string;
  business: { id: string; name: string; status: string; updatedAt: string };
  impact: {
    users: number;
    pendingExports: number;
    activeDevices: number;
    failedOfflineActions: number;
    currentStatus: string;
    readOnlyEnabled: boolean;
    subscriptionStatus?: string | null;
  };
  preconditions: { code: string; ok: boolean; message: string }[];
  ready: boolean;
};

const ACTION_CONFIG: Record<
  ActionKey,
  {
    color: 'red' | 'amber' | 'blue';
    needsPreflight: boolean;
    isDestructive: boolean;
    statusTransition?: string; // For SUSPEND/ARCHIVE/RESTORE
  }
> = {
  SUSPEND: { color: 'amber', needsPreflight: true, isDestructive: false, statusTransition: 'SUSPENDED' },
  ARCHIVE: { color: 'amber', needsPreflight: true, isDestructive: true, statusTransition: 'ARCHIVED' },
  DELETE_READY: { color: 'red', needsPreflight: true, isDestructive: true, statusTransition: 'DELETED' },
  RESTORE: { color: 'blue', needsPreflight: false, isDestructive: false, statusTransition: 'ACTIVE' },
  PURGE: { color: 'red', needsPreflight: true, isDestructive: true },
};

export function BusinessActionModal({
  open,
  action,
  businessId,
  businessName,
  onClose,
  onCompleted,
}: Props) {
  const t = useTranslations('platformConsole');
  const ws = useBusinessWorkspace(businessId);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [isLoadingPreflight, setIsLoadingPreflight] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (open && action) {
      setStep(1);
      setPreflight(null);
      setPreflightError(null);
      setReason('');
      setConfirmId('');
      setConfirmText('');
      const cfg = ACTION_CONFIG[action];
      if (cfg.needsPreflight) {
        setIsLoadingPreflight(true);
        ws.loadPreflight(action).then((data) => {
          if (data) {
            setPreflight(data);
          } else {
            setPreflightError(t('actionModalPreflightFailed'));
          }
          setIsLoadingPreflight(false);
        });
      }
    }
  }, [open, action]);

  // Global escape key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, isSubmitting]);

  if (!open || !action) return null;

  const cfg = ACTION_CONFIG[action];
  const isPurge = action === 'PURGE';
  const purgeValid =
    isPurge && confirmId === businessId && confirmText === 'DELETE';
  const canConfirm = step === 3 && reason.trim().length > 0 && (!isPurge || purgeValid);
  const canAdvanceFromStep1 = !cfg.needsPreflight || (preflight !== null && preflight.ready);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    let ok = false;
    if (isPurge) {
      ok = await ws.purgeBusiness({
        reason,
        confirmBusinessId: confirmId,
        confirmText,
      });
    } else if (cfg.statusTransition) {
      ok = await ws.updateStatus(cfg.statusTransition, reason);
    }
    setIsSubmitting(false);
    if (ok) {
      onCompleted?.();
      onClose();
    }
  };

  const colorClasses = {
    red: 'border-red-500/30 bg-red-500/5 text-red-400',
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
    blue: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
  };

  const buttonClasses = {
    red: 'bg-red-500 hover:bg-red-400 text-white',
    amber: 'bg-amber-500 hover:bg-amber-400 text-black',
    blue: 'bg-blue-500 hover:bg-blue-400 text-white',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={() => !isSubmitting && onClose()}
        aria-hidden="true"
      />

      {/* Centered modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none"
      >
        <Card
          padding="lg"
          className={`pointer-events-auto w-full max-w-md nvi-slide-in-bottom border-l-2 border-l-${cfg.color}-400`}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${colorClasses[cfg.color]}`}>
                <TriangleAlert size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="action-modal-title" className="text-sm font-semibold text-[var(--pt-text-1)]">
                  {t(`actionModal.${action}.title`)}
                </h2>
                <p className="text-[10px] text-[var(--pt-text-muted)] truncate">{businessName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => !isSubmitting && onClose()}
              disabled={isSubmitting}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--pt-text-muted)] hover:bg-white/[0.05] hover:text-[var(--pt-text-1)] transition nvi-press disabled:opacity-40"
              aria-label={t('actionModalClose')}
            >
              <X size={14} />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold transition ${
                    step >= s ? `bg-${cfg.color}-500/20 text-${cfg.color}-400 border border-${cfg.color}-500/30` : 'bg-white/[0.04] text-[var(--pt-text-muted)]'
                  }`}
                >
                  {step > s ? <CircleCheck size={10} /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`h-px flex-1 ${
                      step > s ? `bg-${cfg.color}-500/30` : 'bg-white/[0.06]'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Preflight / Impact review */}
          {step === 1 && (
            <div className="space-y-3 nvi-slide-in-bottom">
              <p className="text-xs text-[var(--pt-text-2)]">
                {t(`actionModal.${action}.description`)}
              </p>

              {isLoadingPreflight ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-white/[0.03]" />
                  ))}
                </div>
              ) : preflightError ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <p className="text-xs text-red-400">{preflightError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoadingPreflight(true);
                      setPreflightError(null);
                      ws.loadPreflight(action).then((data) => {
                        if (data) setPreflight(data);
                        else setPreflightError(t('actionModalPreflightFailed'));
                        setIsLoadingPreflight(false);
                      });
                    }}
                    className="mt-2 text-[10px] text-red-300 underline"
                  >
                    {t('actionModalRetry')}
                  </button>
                </div>
              ) : preflight ? (
                <>
                  {/* Impact stats */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                      <div className="flex items-center gap-1.5 text-[var(--pt-text-muted)]">
                        <Users size={10} />
                        <span className="text-[9px] uppercase tracking-wide">{t('actionImpactUsers')}</span>
                      </div>
                      <p className="mt-0.5 text-sm font-bold text-[var(--pt-text-1)] tabular-nums">{preflight.impact.users}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                      <div className="flex items-center gap-1.5 text-[var(--pt-text-muted)]">
                        <Smartphone size={10} />
                        <span className="text-[9px] uppercase tracking-wide">{t('actionImpactDevices')}</span>
                      </div>
                      <p className="mt-0.5 text-sm font-bold text-[var(--pt-text-1)] tabular-nums">{preflight.impact.activeDevices}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                      <div className="flex items-center gap-1.5 text-[var(--pt-text-muted)]">
                        <Package size={10} />
                        <span className="text-[9px] uppercase tracking-wide">{t('actionImpactExports')}</span>
                      </div>
                      <p className="mt-0.5 text-sm font-bold text-[var(--pt-text-1)] tabular-nums">{preflight.impact.pendingExports}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                      <div className="flex items-center gap-1.5 text-[var(--pt-text-muted)]">
                        <Loader size={10} />
                        <span className="text-[9px] uppercase tracking-wide">{t('actionImpactFailed')}</span>
                      </div>
                      <p className="mt-0.5 text-sm font-bold text-[var(--pt-text-1)] tabular-nums">{preflight.impact.failedOfflineActions}</p>
                    </div>
                  </div>

                  {/* Preconditions */}
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">{t('actionPreconditions')}</p>
                    {preflight.preconditions.length === 0 ? (
                      <p className="text-[10px] text-[var(--pt-text-muted)] italic">{t('actionNoPreconditions')}</p>
                    ) : (
                      preflight.preconditions.map((p, i) => (
                        <div
                          key={`${p.code}-${i}`}
                          className={`flex items-start gap-2 rounded-md p-2 ${
                            p.ok ? 'bg-emerald-500/5' : 'bg-red-500/5'
                          }`}
                        >
                          {p.ok ? (
                            <CircleCheck size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                          ) : (
                            <CircleX size={12} className="text-red-400 mt-0.5 shrink-0" />
                          )}
                          <p className={`text-[10px] ${p.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                            {p.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {!preflight.ready && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2">
                      <p className="text-[10px] text-red-300">{t('actionBlocked')}</p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* Step 2: Reason */}
          {step === 2 && (
            <div className="space-y-3 nvi-slide-in-bottom">
              <p className="text-xs text-[var(--pt-text-2)]">{t('actionModalReasonHint')}</p>
              <Textarea
                label={t('actionModalReasonLabel')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('actionModalReasonPlaceholder')}
                rows={4}
                autoFocus
              />
            </div>
          )}

          {/* Step 3: Final confirmation */}
          {step === 3 && (
            <div className="space-y-3 nvi-slide-in-bottom">
              {isPurge ? (
                <>
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <div className="flex items-center gap-2">
                      <Lock size={12} className="text-red-400" />
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">
                        {t('actionPurgeWarningTitle')}
                      </p>
                    </div>
                    <p className="mt-1 text-[10px] text-red-300">{t('actionPurgeWarning')}</p>
                  </div>

                  <TextInput
                    label={t('actionPurgeConfirmId')}
                    value={confirmId}
                    onChange={(e) => setConfirmId(e.target.value)}
                    placeholder={businessId}
                  />
                  <TextInput
                    label={t('actionPurgeConfirmText')}
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE"
                  />
                </>
              ) : (
                <div className={`rounded-lg border p-3 ${colorClasses[cfg.color]}`}>
                  <p className="text-xs">
                    {t('actionConfirmFinal', { action: t(`actionModal.${action}.title`) })}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="mt-5 flex items-center justify-between gap-2 pt-3 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() => (step > 1 ? setStep((step - 1) as 1 | 2 | 3) : onClose())}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-1.5 text-[10px] text-[var(--pt-text-2)] disabled:opacity-40 nvi-press"
            >
              {step === 1 ? (
                t('actionModalCancel')
              ) : (
                <>
                  <ChevronLeft size={11} />
                  {t('actionModalBack')}
                </>
              )}
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((step + 1) as 1 | 2 | 3)}
                disabled={
                  (step === 1 && !canAdvanceFromStep1) ||
                  (step === 2 && !reason.trim())
                }
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40 nvi-press ${buttonClasses[cfg.color]}`}
              >
                {t('actionModalNext')}
                <ChevronRight size={11} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canConfirm || isSubmitting}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40 nvi-press ${buttonClasses[cfg.color]}`}
              >
                {isSubmitting ? <Spinner size="xs" variant="dots" /> : null}
                {t(`actionModal.${action}.confirmButton`)}
              </button>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
