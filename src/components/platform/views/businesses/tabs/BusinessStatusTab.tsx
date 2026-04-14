'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Workflow,
  Lock,
  LockOpen,
  Eye,
  Gauge,
  CalendarClock,
  TriangleAlert,
  ArrowRight,
  Check,
  X,
  Plus,
  Trash2,
  LogOut,
  Archive,
  Skull,
  RotateCcw,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/Spinner';
import { useBusinessWorkspace } from '../hooks/useBusinessWorkspace';
import { BusinessActionModal, type ActionKey } from '../BusinessActionModal';

type Props = {
  businessId: string;
};

// Valid state machine transitions (matches backend BUSINESS_STATUS_TRANSITIONS)
const TRANSITIONS: Record<string, { to: string; label: string; description: string; color: string }[]> = {
  TRIAL: [
    { to: 'ACTIVE', label: 'Activate', description: 'Mark as active subscription', color: 'emerald' },
    { to: 'GRACE', label: 'Grace', description: 'Move to grace period', color: 'amber' },
    { to: 'EXPIRED', label: 'Expire', description: 'Mark trial as expired', color: 'red' },
    { to: 'SUSPENDED', label: 'Suspend', description: 'Suspend the business', color: 'red' },
  ],
  ACTIVE: [
    { to: 'GRACE', label: 'Grace', description: 'Move to grace period', color: 'amber' },
    { to: 'EXPIRED', label: 'Expire', description: 'Mark as expired', color: 'red' },
    { to: 'SUSPENDED', label: 'Suspend', description: 'Suspend the business', color: 'red' },
  ],
  GRACE: [
    { to: 'ACTIVE', label: 'Reactivate', description: 'Restore to active', color: 'emerald' },
    { to: 'EXPIRED', label: 'Expire', description: 'Mark as expired', color: 'red' },
    { to: 'SUSPENDED', label: 'Suspend', description: 'Suspend the business', color: 'red' },
  ],
  EXPIRED: [
    { to: 'ACTIVE', label: 'Reactivate', description: 'Restore to active', color: 'emerald' },
    { to: 'GRACE', label: 'Grace', description: 'Move to grace period', color: 'amber' },
    { to: 'SUSPENDED', label: 'Suspend', description: 'Suspend the business', color: 'red' },
  ],
  SUSPENDED: [
    { to: 'ACTIVE', label: 'Reactivate', description: 'Restore to active', color: 'emerald' },
    { to: 'GRACE', label: 'Grace', description: 'Move to grace period', color: 'amber' },
    { to: 'EXPIRED', label: 'Expire', description: 'Mark as expired', color: 'red' },
  ],
};

const SEVERITIES: { value: string; label: string; color: string }[] = [
  { value: 'LOW', label: 'Low', color: 'bg-blue-400' },
  { value: 'MEDIUM', label: 'Medium', color: 'bg-amber-400' },
  { value: 'HIGH', label: 'High', color: 'bg-orange-400' },
  { value: 'CRITICAL', label: 'Critical', color: 'bg-red-400' },
];

export function BusinessStatusTab({ businessId }: Props) {
  const t = useTranslations('platformConsole');
  const ws = useBusinessWorkspace(businessId);

  // Modal state
  const [actionModal, setActionModal] = useState<ActionKey | null>(null);

  // State transition state
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [statusReason, setStatusReason] = useState('');

  // Review form state
  const [reviewForm, setReviewForm] = useState({
    underReview: false,
    reason: '',
    severity: 'MEDIUM' as string,
  });
  const [isUpdatingReview, setIsUpdatingReview] = useState(false);

  // Rate limit form
  const [rateLimitForm, setRateLimitForm] = useState({
    limit: '',
    ttlSeconds: '',
    expiresAt: '',
    reason: '',
  });
  const [isUpdatingRateLimit, setIsUpdatingRateLimit] = useState(false);

  // Read-only form
  const [readOnlyReason, setReadOnlyReason] = useState('');
  const [isUpdatingReadOnly, setIsUpdatingReadOnly] = useState(false);

  // Scheduled action form
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    actionType: 'STATUS_CHANGE' as 'STATUS_CHANGE' | 'SUBSCRIPTION_CHANGE',
    payload: '',
    scheduledFor: '',
  });

  // Auto-load
  useEffect(() => {
    ws.loadScheduledActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Sync review form from workspace data
  useEffect(() => {
    if (ws.workspace?.business) {
      setReviewForm({
        underReview: !!ws.workspace.business.underReview,
        reason: ws.workspace.business.reviewReason ?? '',
        severity: ws.workspace.business.reviewSeverity ?? 'MEDIUM',
      });
    }
  }, [ws.workspace?.business]);

  // Sync rate limit form from settings
  useEffect(() => {
    if (ws.workspace?.settings?.rateLimitOverride) {
      const ro = ws.workspace.settings.rateLimitOverride as Record<string, unknown>;
      setRateLimitForm({
        limit: typeof ro.limit === 'number' ? String(ro.limit) : '',
        ttlSeconds: typeof ro.ttlSeconds === 'number' ? String(ro.ttlSeconds) : '',
        expiresAt: typeof ro.expiresAt === 'string' ? ro.expiresAt.slice(0, 16) : '',
        reason: '',
      });
    }
  }, [ws.workspace?.settings]);

  const currentStatus = ws.workspace?.business?.status ?? 'TRIAL';
  const validTransitions = TRANSITIONS[currentStatus] ?? [];

  const handleStatusTransition = async () => {
    if (!pendingStatus || !statusReason.trim()) return;
    const ok = await ws.updateStatus(pendingStatus, statusReason);
    if (ok) {
      setPendingStatus(null);
      setStatusReason('');
    }
  };

  const handleReviewSubmit = async () => {
    if (!reviewForm.reason.trim()) return;
    setIsUpdatingReview(true);
    await ws.updateReview({
      underReview: reviewForm.underReview,
      reason: reviewForm.reason,
      severity: reviewForm.severity,
    });
    setIsUpdatingReview(false);
  };

  const handleRateLimitSubmit = async () => {
    if (!rateLimitForm.reason.trim()) return;
    setIsUpdatingRateLimit(true);
    await ws.updateRateLimits({
      limit: rateLimitForm.limit ? parseInt(rateLimitForm.limit, 10) : null,
      ttlSeconds: rateLimitForm.ttlSeconds ? parseInt(rateLimitForm.ttlSeconds, 10) : null,
      expiresAt: rateLimitForm.expiresAt ? new Date(rateLimitForm.expiresAt).toISOString() : null,
      reason: rateLimitForm.reason,
    });
    setIsUpdatingRateLimit(false);
  };

  const handleCreateScheduledAction = async () => {
    if (!scheduleForm.scheduledFor || !scheduleForm.payload) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(scheduleForm.payload);
    } catch {
      ws.setBanner({ text: 'Invalid JSON payload', severity: 'error' });
      return;
    }
    const ok = await ws.createScheduledAction({
      actionType: scheduleForm.actionType,
      payload,
      scheduledFor: new Date(scheduleForm.scheduledFor).toISOString(),
    });
    if (ok) {
      setShowScheduleForm(false);
      setScheduleForm({ actionType: 'STATUS_CHANGE', payload: '', scheduledFor: '' });
    }
  };

  return (
    <div className="space-y-4 nvi-stagger">
      {/* ── Status state machine ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-blue-400">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
            <Workflow size={16} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('statusStateMachine')}</h3>
            <p className="text-[10px] text-[var(--pt-text-muted)]">{t('statusStateMachineHint')}</p>
          </div>
        </div>

        {/* Current status pill */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">{t('statusCurrent')}:</span>
          <span className="rounded-md bg-[var(--pt-accent-dim)] border border-[var(--pt-accent-border)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--pt-accent)]">
            {currentStatus}
          </span>
        </div>

        {/* Transition options */}
        {validTransitions.length === 0 ? (
          <p className="text-[10px] text-[var(--pt-text-muted)]">{t('statusNoTransitions')}</p>
        ) : pendingStatus ? (
          <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 nvi-slide-in-bottom">
            <p className="text-xs text-amber-300">
              {t('statusConfirmTransition', { from: currentStatus, to: pendingStatus })}
            </p>
            <Textarea
              label={t('statusTransitionReason')}
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder={t('statusTransitionReasonPlaceholder')}
              rows={2}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingStatus(null);
                  setStatusReason('');
                }}
                className="rounded-md border border-white/[0.08] px-3 py-1 text-[10px] text-[var(--pt-text-muted)] nvi-press"
              >
                {t('statusCancel')}
              </button>
              <button
                type="button"
                onClick={handleStatusTransition}
                disabled={!statusReason.trim()}
                className="rounded-md bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-[10px] font-semibold text-amber-400 disabled:opacity-40 nvi-press"
              >
                {t('statusConfirmChange')}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {validTransitions.map((tx) => (
              <button
                key={tx.to}
                type="button"
                onClick={() => setPendingStatus(tx.to)}
                className={`flex items-start gap-2 rounded-lg border p-2 text-left transition nvi-press border-${tx.color}-500/30 hover:bg-${tx.color}-500/5 hover:border-${tx.color}-500/50`}
              >
                <ArrowRight size={11} className={`mt-0.5 text-${tx.color}-400 shrink-0`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-[10px] font-semibold uppercase text-${tx.color}-400`}>{tx.to}</p>
                  <p className="text-[9px] text-[var(--pt-text-muted)]">{tx.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* ── Read-only toggle ── */}
      <Card padding="lg" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${ws.workspace?.settings?.readOnlyEnabled ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
              {ws.workspace?.settings?.readOnlyEnabled ? (
                <Lock size={16} className="text-red-400" />
              ) : (
                <LockOpen size={16} className="text-emerald-400" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('statusReadOnlyTitle')}</h3>
              <p className="text-[10px] text-[var(--pt-text-muted)]">
                {ws.workspace?.settings?.readOnlyEnabled
                  ? ws.workspace.settings.readOnlyReason ?? t('statusReadOnlyEnabledHint')
                  : t('statusReadOnlyDisabledHint')}
              </p>
            </div>
          </div>
        </div>

        {!ws.workspace?.settings?.readOnlyEnabled && (
          <Textarea
            label={t('statusReadOnlyReason')}
            value={readOnlyReason}
            onChange={(e) => setReadOnlyReason(e.target.value)}
            placeholder={t('statusReadOnlyReasonPlaceholder')}
            rows={2}
          />
        )}

        <button
          type="button"
          onClick={async () => {
            if (ws.workspace?.settings?.readOnlyEnabled) {
              setIsUpdatingReadOnly(true);
              await ws.toggleReadOnly(false, 'Disabled from Status tab');
              setIsUpdatingReadOnly(false);
            } else {
              if (!readOnlyReason.trim()) return;
              setIsUpdatingReadOnly(true);
              const ok = await ws.toggleReadOnly(true, readOnlyReason);
              if (ok) setReadOnlyReason('');
              setIsUpdatingReadOnly(false);
            }
          }}
          disabled={isUpdatingReadOnly || (!ws.workspace?.settings?.readOnlyEnabled && !readOnlyReason.trim())}
          className={`mt-3 inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40 nvi-press ${
            ws.workspace?.settings?.readOnlyEnabled
              ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/20 border-red-500/30 text-red-400'
          }`}
        >
          {isUpdatingReadOnly ? <Spinner size="xs" variant="dots" /> : ws.workspace?.settings?.readOnlyEnabled ? <LockOpen size={11} /> : <Lock size={11} />}
          {ws.workspace?.settings?.readOnlyEnabled ? t('statusReadOnlyDisable') : t('statusReadOnlyEnable')}
        </button>
      </Card>

      {/* ── Review flag ── */}
      <Card padding="lg" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
              <Eye size={16} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('statusReviewFlag')}</h3>
              <p className="text-[10px] text-[var(--pt-text-muted)]">{t('statusReviewFlagHint')}</p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={reviewForm.underReview}
              onChange={(e) => setReviewForm({ ...reviewForm, underReview: e.target.checked })}
              className="h-4 w-4 accent-[var(--pt-accent)]"
            />
            <span className="text-[10px] uppercase tracking-wide text-[var(--pt-text-2)]">
              {reviewForm.underReview ? t('statusReviewOn') : t('statusReviewOff')}
            </span>
          </label>
        </div>

        {reviewForm.underReview && (
          <div className="space-y-3 nvi-slide-in-bottom">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)] mb-1.5">{t('statusSeverity')}</p>
              <div className="flex flex-wrap gap-1.5">
                {SEVERITIES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setReviewForm({ ...reviewForm, severity: s.value })}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold transition nvi-press ${
                      reviewForm.severity === s.value
                        ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400'
                        : 'border border-white/[0.06] text-[var(--pt-text-muted)]'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${s.color}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              label={t('statusReviewReason')}
              value={reviewForm.reason}
              onChange={(e) => setReviewForm({ ...reviewForm, reason: e.target.value })}
              placeholder={t('statusReviewReasonPlaceholder')}
              rows={2}
            />
          </div>
        )}

        {!reviewForm.underReview && (
          <Textarea
            label={t('statusReviewReason')}
            value={reviewForm.reason}
            onChange={(e) => setReviewForm({ ...reviewForm, reason: e.target.value })}
            placeholder={t('statusReviewClearPlaceholder')}
            rows={2}
          />
        )}

        <button
          type="button"
          onClick={handleReviewSubmit}
          disabled={!reviewForm.reason.trim() || isUpdatingReview}
          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-[10px] font-semibold text-amber-400 disabled:opacity-40 nvi-press"
        >
          {isUpdatingReview ? <Spinner size="xs" variant="dots" /> : <Check size={11} />}
          {t('statusSaveReview')}
        </button>
      </Card>

      {/* ── Rate limit overrides ── */}
      <Card padding="lg" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10">
            <Gauge size={16} className="text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('statusRateLimits')}</h3>
            <p className="text-[10px] text-[var(--pt-text-muted)]">{t('statusRateLimitsHint')}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <TextInput
            label={t('statusRateLimitLimit')}
            type="number"
            value={rateLimitForm.limit}
            onChange={(e) => setRateLimitForm({ ...rateLimitForm, limit: e.target.value })}
            placeholder="100"
          />
          <TextInput
            label={t('statusRateLimitTtl')}
            type="number"
            value={rateLimitForm.ttlSeconds}
            onChange={(e) => setRateLimitForm({ ...rateLimitForm, ttlSeconds: e.target.value })}
            placeholder="60"
          />
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gold-300/80">
              {t('statusRateLimitExpires')}
            </label>
            <input
              type="datetime-local"
              value={rateLimitForm.expiresAt}
              onChange={(e) => setRateLimitForm({ ...rateLimitForm, expiresAt: e.target.value })}
              className="rounded-xl border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100 outline-none transition-colors focus:border-gold-500/70"
            />
          </div>
        </div>

        <div className="mt-3">
          <Textarea
            label={t('statusRateLimitReason')}
            value={rateLimitForm.reason}
            onChange={(e) => setRateLimitForm({ ...rateLimitForm, reason: e.target.value })}
            placeholder={t('statusRateLimitReasonPlaceholder')}
            rows={2}
          />
        </div>

        <button
          type="button"
          onClick={handleRateLimitSubmit}
          disabled={!rateLimitForm.reason.trim() || isUpdatingRateLimit}
          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-purple-500/20 border border-purple-500/30 px-3 py-1.5 text-[10px] font-semibold text-purple-400 disabled:opacity-40 nvi-press"
        >
          {isUpdatingRateLimit ? <Spinner size="xs" variant="dots" /> : <Check size={11} />}
          {t('statusSaveRateLimits')}
        </button>
      </Card>

      {/* ── Scheduled actions ── */}
      <Card padding="lg" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <CalendarClock size={16} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('statusScheduledActions')}</h3>
              <p className="text-[10px] text-[var(--pt-text-muted)]">{t('statusScheduledActionsHint')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowScheduleForm((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-lg border border-blue-500/30 px-2 py-1 text-[10px] text-blue-400 nvi-press"
          >
            <Plus size={11} />
            {t('statusScheduleNew')}
          </button>
        </div>

        {showScheduleForm && (
          <div className="mb-3 space-y-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 nvi-slide-in-bottom">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)] mb-1">{t('statusScheduleType')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleForm({ ...scheduleForm, actionType: 'STATUS_CHANGE' })}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                    scheduleForm.actionType === 'STATUS_CHANGE'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'border border-white/[0.06] text-[var(--pt-text-muted)]'
                  }`}
                >
                  STATUS_CHANGE
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleForm({ ...scheduleForm, actionType: 'SUBSCRIPTION_CHANGE' })}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                    scheduleForm.actionType === 'SUBSCRIPTION_CHANGE'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'border border-white/[0.06] text-[var(--pt-text-muted)]'
                  }`}
                >
                  SUBSCRIPTION_CHANGE
                </button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-gold-300/80">
                {t('statusScheduleFor')}
              </label>
              <input
                type="datetime-local"
                value={scheduleForm.scheduledFor}
                onChange={(e) => setScheduleForm({ ...scheduleForm, scheduledFor: e.target.value })}
                className="rounded-xl border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100 outline-none transition-colors focus:border-gold-500/70"
              />
            </div>
            <Textarea
              label={t('statusSchedulePayload')}
              value={scheduleForm.payload}
              onChange={(e) => setScheduleForm({ ...scheduleForm, payload: e.target.value })}
              placeholder={
                scheduleForm.actionType === 'STATUS_CHANGE'
                  ? '{"status": "SUSPENDED", "reason": "..."}'
                  : '{"tier": "BUSINESS", "reason": "..."}'
              }
              rows={3}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowScheduleForm(false)}
                className="rounded-md border border-white/[0.08] px-3 py-1 text-[10px] text-[var(--pt-text-muted)] nvi-press"
              >
                {t('statusCancel')}
              </button>
              <button
                type="button"
                onClick={handleCreateScheduledAction}
                disabled={!scheduleForm.scheduledFor || !scheduleForm.payload}
                className="rounded-md bg-blue-500/20 border border-blue-500/30 px-3 py-1 text-[10px] font-semibold text-blue-400 disabled:opacity-40 nvi-press"
              >
                {t('statusScheduleCreate')}
              </button>
            </div>
          </div>
        )}

        {ws.isLoadingScheduled ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[0.03]" />
            ))}
          </div>
        ) : ws.scheduledActions.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={24} className="text-[var(--pt-text-muted)]" />}
            title={t('statusNoScheduled')}
          />
        ) : (
          <div className="space-y-2">
            {ws.scheduledActions.map((sa) => (
              <div key={sa.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-400">
                      {sa.actionType}
                    </span>
                    <span className="text-[10px] text-[var(--pt-text-2)]">
                      {new Date(sa.scheduledFor).toLocaleString()}
                    </span>
                  </div>
                  <code className="block mt-0.5 text-[9px] font-mono text-[var(--pt-text-muted)] truncate">
                    {JSON.stringify(sa.payload)}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => ws.cancelScheduledAction(sa.id)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-red-500/30 px-2 py-1 text-[9px] font-semibold text-red-400 hover:bg-red-500/5 nvi-press"
                >
                  <Trash2 size={10} />
                  {t('statusCancelScheduled')}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Danger zone ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-red-400 border border-red-500/20 bg-red-500/[0.02]">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 animate-pulse">
            <TriangleAlert size={16} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-red-400">{t('statusDangerZone')}</h3>
            <p className="text-[10px] text-[var(--pt-text-muted)]">{t('statusDangerZoneHint')}</p>
          </div>
        </div>

        <div className="space-y-2">
          <DangerRow
            icon={<LogOut size={12} />}
            title={t('dangerForceLogout')}
            description={t('dangerForceLogoutDesc')}
            color="amber"
            onClick={() => {
              const reason = window.prompt(t('dangerForceLogoutPrompt'));
              if (reason) ws.forceLogout(reason);
            }}
          />
          {currentStatus !== 'SUSPENDED' && currentStatus !== 'ARCHIVED' && (
            <DangerRow
              icon={<Lock size={12} />}
              title={t('dangerSuspend')}
              description={t('dangerSuspendDesc')}
              color="amber"
              onClick={() => setActionModal('SUSPEND')}
            />
          )}
          {currentStatus !== 'ARCHIVED' && (
            <DangerRow
              icon={<Archive size={12} />}
              title={t('dangerArchive')}
              description={t('dangerArchiveDesc')}
              color="amber"
              onClick={() => setActionModal('ARCHIVE')}
            />
          )}
          {currentStatus === 'ARCHIVED' && (
            <DangerRow
              icon={<Skull size={12} />}
              title={t('dangerDeleteReady')}
              description={t('dangerDeleteReadyDesc')}
              color="red"
              onClick={() => setActionModal('DELETE_READY')}
            />
          )}
          {(currentStatus === 'SUSPENDED' || currentStatus === 'ARCHIVED') && (
            <DangerRow
              icon={<RotateCcw size={12} />}
              title={t('dangerRestore')}
              description={t('dangerRestoreDesc')}
              color="emerald"
              onClick={() => setActionModal('RESTORE')}
            />
          )}
          {currentStatus === 'ARCHIVED' && (
            <DangerRow
              icon={<Trash2 size={12} />}
              title={t('dangerPurge')}
              description={t('dangerPurgeDesc')}
              color="red"
              onClick={() => setActionModal('PURGE')}
            />
          )}
        </div>
      </Card>

      {/* Action modal */}
      <BusinessActionModal
        open={actionModal !== null}
        action={actionModal}
        businessId={businessId}
        businessName={ws.workspace?.business?.name ?? ''}
        onClose={() => setActionModal(null)}
        onCompleted={() => ws.loadWorkspace()}
      />
    </div>
  );
}

function DangerRow({
  icon,
  title,
  description,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'red' | 'amber' | 'emerald';
  onClick: () => void;
}) {
  const buttonClasses = {
    red: 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25',
    amber: 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25',
    emerald: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25',
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[var(--pt-text-1)]">{title}</p>
        <p className="text-[10px] text-[var(--pt-text-muted)]">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition nvi-press ${buttonClasses[color]}`}
      >
        {icon}
        {title}
      </button>
    </div>
  );
}
