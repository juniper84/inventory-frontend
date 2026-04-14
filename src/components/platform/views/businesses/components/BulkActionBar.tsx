'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Lock, Archive, Clock, X, CircleCheck, CircleX } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { Spinner } from '@/components/Spinner';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';
import { useBusinessWorkspaceContext } from '../context/BusinessWorkspaceContext';

export type BulkActionKey = 'SUSPEND' | 'EXTEND_TRIAL' | 'READ_ONLY' | 'ARCHIVE';

type BulkResult = {
  action: BulkActionKey;
  total: number;
  successCount: number;
  failureCount: number;
  results: { businessId: string; success: boolean; error?: string }[];
};

type Props = {
  selectedIds: string[];
  onClear: () => void;
  onCompleted: () => void;
};

export function BulkActionBar({ selectedIds, onClear, onCompleted }: Props) {
  const t = useTranslations('platformConsole');
  const ctx = useBusinessWorkspaceContext();
  const [pendingAction, setPendingAction] = useState<BulkActionKey | null>(null);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('7');
  const [readOnlyEnabled, setReadOnlyEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  if (selectedIds.length === 0 && !result) return null;

  const submit = async () => {
    if (!pendingAction || !reason.trim()) return;
    setIsSubmitting(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const params: { days?: number; reason: string; enabled?: boolean } = { reason };
      if (pendingAction === 'EXTEND_TRIAL') {
        const d = parseInt(days, 10);
        if (!Number.isFinite(d) || d <= 0) {
          ctx.setBanner({ text: 'Days must be a positive number', severity: 'error' });
          setIsSubmitting(false);
          return;
        }
        params.days = d;
      }
      if (pendingAction === 'READ_ONLY') {
        params.enabled = readOnlyEnabled;
      }
      const data = await apiFetch<BulkResult>('/platform/businesses/bulk-action', {
        token,
        method: 'POST',
        body: JSON.stringify({
          businessIds: selectedIds,
          action: pendingAction,
          params,
        }),
      });
      setResult(data);
      ctx.setBanner({
        text: `${data.successCount} succeeded, ${data.failureCount} failed`,
        severity: data.failureCount === 0 ? 'success' : 'warning',
      });
      onCompleted();
    } catch (err) {
      ctx.setBanner({
        text: getApiErrorMessage(err, 'Bulk action failed'),
        severity: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeAll = () => {
    setPendingAction(null);
    setReason('');
    setDays('7');
    setReadOnlyEnabled(true);
    setResult(null);
    onClear();
  };

  // Results view
  if (result) {
    return (
      <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 platform-bulk-bar-slide">
        <Card padding="md" className="w-[90vw] max-w-2xl border border-[var(--pt-accent-border)]">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-[var(--pt-text-1)]">
                {t('bulkResultsTitle', { action: t(`bulkActionLabel.${result.action}`) })}
              </p>
              <p className="text-[10px] text-[var(--pt-text-muted)]">
                {t('bulkResultsSummary', {
                  success: result.successCount,
                  failed: result.failureCount,
                  total: result.total,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={closeAll}
              className="text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)] nvi-press"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          <div className="max-h-[200px] overflow-y-auto space-y-1">
            {result.results.map((r) => (
              <div
                key={r.businessId}
                className={`flex items-start gap-2 rounded-md px-2 py-1 text-[10px] ${
                  r.success ? 'bg-emerald-500/5' : 'bg-red-500/5'
                }`}
              >
                {r.success ? (
                  <CircleCheck size={11} className="text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <CircleX size={11} className="text-red-400 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <code className="text-[9px] font-mono text-[var(--pt-text-muted)]">
                    {r.businessId.slice(0, 12)}...
                  </code>
                  {r.error && (
                    <p className="text-red-400 mt-0.5">{r.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  // Confirmation form
  if (pendingAction) {
    return (
      <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 platform-bulk-bar-slide">
        <Card padding="md" className="w-[90vw] max-w-md border border-[var(--pt-accent-border)]">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-[var(--pt-text-1)]">
                {t(`bulkActionLabel.${pendingAction}`)} · {selectedIds.length} {t('bulkSelectedCount')}
              </p>
              <p className="text-[10px] text-[var(--pt-text-muted)]">
                {t(`bulkActionHint.${pendingAction}`)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPendingAction(null)}
              className="text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)] nvi-press"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-2">
            {pendingAction === 'EXTEND_TRIAL' && (
              <TextInput
                label={t('bulkExtendDays')}
                type="number"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="7"
              />
            )}
            {pendingAction === 'READ_ONLY' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setReadOnlyEnabled(true)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[10px] font-semibold transition nvi-press ${
                    readOnlyEnabled
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                      : 'border-white/[0.06] text-[var(--pt-text-muted)]'
                  }`}
                >
                  {t('bulkReadOnlyEnable')}
                </button>
                <button
                  type="button"
                  onClick={() => setReadOnlyEnabled(false)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[10px] font-semibold transition nvi-press ${
                    !readOnlyEnabled
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-white/[0.06] text-[var(--pt-text-muted)]'
                  }`}
                >
                  {t('bulkReadOnlyDisable')}
                </button>
              </div>
            )}
            <Textarea
              label={t('bulkReasonLabel')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('bulkReasonPlaceholder')}
              rows={2}
              autoFocus
            />
          </div>

          <div className="mt-3 flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() => setPendingAction(null)}
              disabled={isSubmitting}
              className="rounded-md border border-white/[0.08] px-3 py-1 text-[10px] text-[var(--pt-text-muted)] disabled:opacity-40 nvi-press"
            >
              {t('bulkCancel')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!reason.trim() || isSubmitting}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--pt-accent)] px-3 py-1 text-[10px] font-semibold text-black disabled:opacity-40 nvi-press"
            >
              {isSubmitting ? <Spinner size="xs" variant="dots" /> : null}
              {t('bulkConfirm')}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // Action picker — initial floating bar
  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 platform-bulk-bar-slide">
      <Card
        padding="sm"
        className="flex items-center gap-2 border border-[var(--pt-accent-border)] bg-[var(--pt-bg-surface)]"
      >
        <span className="px-2 text-xs font-semibold text-[var(--pt-text-1)]">
          {selectedIds.length} {t('bulkSelectedCount')}
        </span>
        <div className="h-4 w-px bg-white/[0.08]" />
        <button
          type="button"
          onClick={() => setPendingAction('SUSPEND')}
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] font-semibold text-amber-400 hover:bg-amber-500/10 transition nvi-press"
        >
          <Lock size={10} />
          {t('bulkActionLabel.SUSPEND')}
        </button>
        <button
          type="button"
          onClick={() => setPendingAction('EXTEND_TRIAL')}
          className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/5 px-2 py-1 text-[10px] font-semibold text-blue-400 hover:bg-blue-500/10 transition nvi-press"
        >
          <Clock size={10} />
          {t('bulkActionLabel.EXTEND_TRIAL')}
        </button>
        <button
          type="button"
          onClick={() => setPendingAction('READ_ONLY')}
          className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/5 px-2 py-1 text-[10px] font-semibold text-purple-400 hover:bg-purple-500/10 transition nvi-press"
        >
          <Lock size={10} />
          {t('bulkActionLabel.READ_ONLY')}
        </button>
        <button
          type="button"
          onClick={() => setPendingAction('ARCHIVE')}
          className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-500/10 transition nvi-press"
        >
          <Archive size={10} />
          {t('bulkActionLabel.ARCHIVE')}
        </button>
        <div className="h-4 w-px bg-white/[0.08]" />
        <button
          type="button"
          onClick={onClear}
          className="px-1 text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)] nvi-press"
          aria-label="Clear selection"
        >
          <X size={12} />
        </button>
      </Card>
    </div>
  );
}
