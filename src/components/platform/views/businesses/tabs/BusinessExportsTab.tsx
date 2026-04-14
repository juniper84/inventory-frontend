'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Download,
  Package,
  RotateCcw,
  XCircle,
  Loader,
  CircleCheck,
  CircleX,
  Clock,
  PlayCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/Spinner';
import { useBusinessWorkspace } from '../hooks/useBusinessWorkspace';

type Props = {
  businessId: string;
};

const STATUS_CONFIG: Record<
  string,
  { color: string; icon: React.ReactNode; bg: string; label?: string }
> = {
  PENDING: { color: 'text-amber-400', icon: <Clock size={11} />, bg: 'bg-amber-500/10' },
  RUNNING: { color: 'text-blue-400', icon: <PlayCircle size={11} />, bg: 'bg-blue-500/10' },
  COMPLETED: { color: 'text-emerald-400', icon: <CircleCheck size={11} />, bg: 'bg-emerald-500/10' },
  FAILED: { color: 'text-red-400', icon: <CircleX size={11} />, bg: 'bg-red-500/10' },
  CANCELED: { color: 'text-zinc-400', icon: <XCircle size={11} />, bg: 'bg-zinc-500/10' },
  CANCELLED: { color: 'text-zinc-400', icon: <XCircle size={11} />, bg: 'bg-zinc-500/10' },
};

function formatDateTime(date?: string | Date | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString();
}

function relativeTime(date?: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function BusinessExportsTab({ businessId }: Props) {
  const t = useTranslations('platformConsole');
  const ws = useBusinessWorkspace(businessId);
  const [showExportOnExit, setShowExportOnExit] = useState(false);
  const [exitReason, setExitReason] = useState('');
  const [isQueuing, setIsQueuing] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    jobId: string;
    action: 'retry' | 'requeue' | 'cancel';
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Auto-load
  useEffect(() => {
    ws.loadExports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const handleExportOnExit = async () => {
    if (!exitReason.trim()) return;
    setIsQueuing(true);
    const ok = await ws.exportOnExit(exitReason);
    if (ok) {
      setShowExportOnExit(false);
      setExitReason('');
    }
    setIsQueuing(false);
  };

  const handleAction = async () => {
    if (!pendingAction) return;
    setIsSubmittingAction(true);
    const ok = await ws.exportAction(pendingAction.jobId, pendingAction.action, actionReason);
    if (ok) {
      setPendingAction(null);
      setActionReason('');
    }
    setIsSubmittingAction(false);
  };

  const total = ws.exports.length;
  const pending = ws.exports.filter((e) => e.status === 'PENDING' || e.status === 'RUNNING').length;
  const completed = ws.exports.filter((e) => e.status === 'COMPLETED').length;
  const failed = ws.exports.filter((e) => e.status === 'FAILED').length;

  return (
    <div className="space-y-4 nvi-stagger">
      {/* ── Summary + export-on-exit ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-blue-400">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <Package size={16} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('exportsTitle')}</h3>
              <div className="mt-0.5 flex items-center gap-3 text-[10px] text-[var(--pt-text-muted)]">
                <span>{total} {t('exportsTotal')}</span>
                {pending > 0 && (
                  <span className="text-amber-400">{pending} {t('exportsInProgress')}</span>
                )}
                {completed > 0 && (
                  <span className="text-emerald-400">{completed} {t('exportsCompleted')}</span>
                )}
                {failed > 0 && (
                  <span className="text-red-400">{failed} {t('exportsTabFailed')}</span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowExportOnExit((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/5 px-3 py-1.5 text-[10px] font-semibold text-blue-400 hover:bg-blue-500/10 transition nvi-press"
          >
            <Download size={11} />
            {t('exportsOnExit')}
          </button>
        </div>

        {showExportOnExit && (
          <div className="mt-3 space-y-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 nvi-slide-in-bottom">
            <p className="text-[10px] text-[var(--pt-text-2)]">{t('exportsOnExitHint')}</p>
            <Textarea
              label={t('exportsOnExitReason')}
              value={exitReason}
              onChange={(e) => setExitReason(e.target.value)}
              placeholder={t('exportsOnExitReasonPlaceholder')}
              rows={2}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowExportOnExit(false);
                  setExitReason('');
                }}
                disabled={isQueuing}
                className="rounded-md border border-white/[0.08] px-3 py-1 text-[10px] text-[var(--pt-text-muted)] nvi-press"
              >
                {t('exportsCancel')}
              </button>
              <button
                type="button"
                onClick={handleExportOnExit}
                disabled={!exitReason.trim() || isQueuing}
                className="rounded-md bg-blue-500/20 border border-blue-500/30 px-3 py-1 text-[10px] font-semibold text-blue-400 disabled:opacity-40 nvi-press"
              >
                {isQueuing ? <Spinner size="xs" variant="dots" /> : t('exportsQueue')}
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Export jobs list ── */}
      {ws.isLoadingExports ? (
        <div className="space-y-2 nvi-stagger">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
          ))}
        </div>
      ) : ws.exports.length === 0 ? (
        <EmptyState
          icon={<Package size={28} className="text-[var(--pt-text-muted)]" />}
          title={t('exportsEmptyTitle')}
          description={t('exportsEmptyHint')}
        />
      ) : (
        <div className="space-y-2 nvi-stagger">
          {ws.exports.map((job) => {
            const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.PENDING;
            const isFailed = job.status === 'FAILED';
            const isPending = job.status === 'PENDING';
            const canRetry = isFailed;
            const canRequeue = isFailed || job.status === 'CANCELED' || job.status === 'CANCELLED';
            const canCancel = isPending || job.status === 'RUNNING';
            const isThisActionPending = pendingAction?.jobId === job.id;

            return (
              <Card key={job.id} padding="md" className="nvi-slide-in-bottom hover:border-[var(--pt-accent-border)] transition">
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cfg.bg}`}>
                    <span className={cfg.color}>{cfg.icon}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--pt-text-1)]">{job.type}</p>
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase ${cfg.bg} ${cfg.color}`}>
                        {job.status}
                      </span>
                      {(job.attempts ?? 0) > 1 && (
                        <span className="text-[9px] text-[var(--pt-text-muted)]">
                          {t('exportsAttempts', { count: job.attempts ?? 1 })}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--pt-text-muted)]">
                      <span title={formatDateTime(job.createdAt)}>
                        {t('exportsCreated')}: {relativeTime(job.createdAt)}
                      </span>
                      {job.startedAt && (
                        <span title={formatDateTime(job.startedAt)}>
                          {t('exportsStarted')}: {relativeTime(job.startedAt)}
                        </span>
                      )}
                      {job.completedAt && (
                        <span title={formatDateTime(job.completedAt)}>
                          {t('exportsCompletedAt')}: {relativeTime(job.completedAt)}
                        </span>
                      )}
                      {job.deliveredAt && (
                        <span className="text-emerald-400" title={formatDateTime(job.deliveredAt)}>
                          {t('exportsDelivered')}: {relativeTime(job.deliveredAt)}
                        </span>
                      )}
                    </div>
                    {job.lastError && (
                      <p className="mt-1 text-[10px] text-red-400 font-mono truncate" title={job.lastError}>
                        {job.lastError}
                      </p>
                    )}
                    <p className="mt-0.5 text-[9px] font-mono text-[var(--pt-text-muted)] truncate">{job.id}</p>
                  </div>

                  {/* Actions */}
                  {!isThisActionPending && (
                    <div className="shrink-0 flex flex-col gap-1">
                      {canRetry && (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingAction({ jobId: job.id, action: 'retry' });
                            setActionReason('');
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[9px] font-semibold text-amber-400 hover:bg-amber-500/10 transition nvi-press"
                        >
                          <RotateCcw size={9} />
                          {t('exportsRetry')}
                        </button>
                      )}
                      {canRequeue && (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingAction({ jobId: job.id, action: 'requeue' });
                            setActionReason('');
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/5 px-2 py-1 text-[9px] font-semibold text-blue-400 hover:bg-blue-500/10 transition nvi-press"
                        >
                          <Loader size={9} />
                          {t('exportsRequeue')}
                        </button>
                      )}
                      {canCancel && (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingAction({ jobId: job.id, action: 'cancel' });
                            setActionReason('');
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1 text-[9px] font-semibold text-red-400 hover:bg-red-500/10 transition nvi-press"
                        >
                          <XCircle size={9} />
                          {t('exportsCancelAction')}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Action confirmation form */}
                {isThisActionPending && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2 nvi-slide-in-bottom">
                    <p className="text-[10px] text-[var(--pt-text-2)]">
                      {t('exportsActionConfirm', { action: pendingAction.action })}
                    </p>
                    <Textarea
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      placeholder={t('exportsActionReasonPlaceholder')}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingAction(null);
                          setActionReason('');
                        }}
                        disabled={isSubmittingAction}
                        className="rounded-md border border-white/[0.08] px-2 py-1 text-[9px] text-[var(--pt-text-muted)] nvi-press"
                      >
                        {t('exportsCancel')}
                      </button>
                      <button
                        type="button"
                        onClick={handleAction}
                        disabled={isSubmittingAction}
                        className="rounded-md bg-[var(--pt-accent-dim)] border border-[var(--pt-accent-border)] px-2 py-1 text-[9px] font-semibold text-[var(--pt-accent)] disabled:opacity-40 nvi-press"
                      >
                        {isSubmittingAction ? <Spinner size="xs" variant="dots" /> : t('exportsConfirm')}
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
