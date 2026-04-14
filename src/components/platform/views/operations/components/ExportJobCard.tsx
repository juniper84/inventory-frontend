'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  X,
  RotateCcw,
  CheckCircle,
  Loader,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Spinner } from '@/components/Spinner';
import type { ExportJob, ExportJobStatus } from '../hooks/useExportJobs';

type Props = {
  job: ExportJob;
  locale: string;
  isActioning: boolean;
  actionType: 'retry' | 'requeue' | 'cancel' | 'delivered' | null;
  onRetry: (reason: string) => void;
  onRequeue: (reason: string) => void;
  onCancel: (reason: string) => void;
  onMarkDelivered: (reason: string) => void;
  formatDateTime: (date: Date | string | null | undefined) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const STATUS_COLOR: Record<ExportJobStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  RUNNING: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  COMPLETED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  FAILED: 'bg-red-500/15 text-red-300 border-red-500/30',
  CANCELED: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

const STATUS_DOT: Record<ExportJobStatus, string> = {
  PENDING: 'bg-amber-400',
  RUNNING: 'bg-blue-400 animate-pulse',
  COMPLETED: 'bg-emerald-400',
  FAILED: 'bg-red-400',
  CANCELED: 'bg-zinc-400',
};

const TYPE_COLOR: Record<string, string> = {
  STOCK: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  PRODUCTS: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  AUDIT_LOGS: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  SALES: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  CUSTOMERS: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
};

const DEFAULT_TYPE_COLOR =
  'bg-zinc-500/10 text-zinc-300 border-zinc-500/30';

function relativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ExportJobCard({
  job,
  locale,
  isActioning,
  actionType,
  onRetry,
  onRequeue,
  onCancel,
  onMarkDelivered,
  formatDateTime,
  t,
}: Props) {
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [activeForm, setActiveForm] = useState<
    'retry' | 'requeue' | 'cancel' | 'delivered' | null
  >(null);
  const [reason, setReason] = useState('');

  const businessName = job.business?.name ?? job.businessId;
  const typeColor = TYPE_COLOR[job.type] ?? DEFAULT_TYPE_COLOR;

  // Bug fix: Requeue must NOT show on COMPLETED jobs
  // Bug fix: Mark Delivered only on COMPLETED jobs (not yet delivered)
  const canRetry = job.status === 'FAILED';
  const canCancel = job.status === 'PENDING';
  const canRequeue = job.status === 'FAILED' || job.status === 'CANCELED';
  const canMarkDelivered = job.status === 'COMPLETED' && !job.deliveredAt;

  const submitForm = () => {
    if (!reason.trim()) return;
    if (activeForm === 'retry') onRetry(reason);
    else if (activeForm === 'requeue') onRequeue(reason);
    else if (activeForm === 'cancel') onCancel(reason);
    else if (activeForm === 'delivered') onMarkDelivered(reason);
    setReason('');
    setActiveForm(null);
  };

  return (
    <Card
      padding="md"
      className="nvi-slide-in-bottom hover:border-[var(--pt-accent-border)] transition"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <span
            className={`mt-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${typeColor}`}
          >
            {job.type}
          </span>
          <div className="min-w-0 flex-1">
            <Link
              href={`/${locale}/platform/businesses/${job.businessId}`}
              className="inline-flex items-center gap-0.5 text-sm font-semibold text-[var(--pt-text-1)] hover:text-[var(--pt-accent)] transition"
            >
              {businessName}
              <ExternalLink size={10} />
            </Link>
            <p className="text-[10px] text-[var(--pt-text-muted)] font-mono">
              {job.id.slice(0, 8)}…
            </p>
          </div>
        </div>

        {/* Status pill */}
        <div
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[job.status]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[job.status]}`} />
          {t(`exportStatus.${job.status}`)}
          {job.status === 'RUNNING' && <Loader size={10} className="animate-spin" />}
        </div>
      </div>

      {/* Timestamps grid */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-md bg-white/[0.02] px-2 py-1">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
            {t('opExportCreated')}
          </p>
          <p className="text-[var(--pt-text-1)]" title={formatDateTime(job.createdAt)}>
            {relativeTime(job.createdAt)}
          </p>
        </div>
        {job.startedAt && (
          <div className="rounded-md bg-white/[0.02] px-2 py-1">
            <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
              {t('opExportStarted')}
            </p>
            <p
              className="text-[var(--pt-text-1)]"
              title={formatDateTime(job.startedAt)}
            >
              {relativeTime(job.startedAt)}
            </p>
          </div>
        )}
        {job.completedAt && (
          <div className="rounded-md bg-white/[0.02] px-2 py-1">
            <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
              {t('opExportCompleted')}
            </p>
            <p
              className="text-[var(--pt-text-1)]"
              title={formatDateTime(job.completedAt)}
            >
              {relativeTime(job.completedAt)}
            </p>
          </div>
        )}
        {job.deliveredAt && (
          <div className="rounded-md bg-emerald-500/[0.06] border border-emerald-500/20 px-2 py-1">
            <p className="text-[9px] uppercase tracking-wide text-emerald-400">
              {t('opExportDelivered')}
            </p>
            <p
              className="text-emerald-300"
              title={formatDateTime(job.deliveredAt)}
            >
              {relativeTime(job.deliveredAt)}
            </p>
          </div>
        )}
      </div>

      {job.attempts > 1 && (
        <p className="mt-2 text-[10px] text-[var(--pt-text-muted)]">
          {t('exportAttempts', { count: job.attempts })}
        </p>
      )}

      {/* Last error (expandable, FAILED only) */}
      {job.status === 'FAILED' && job.lastError && (
        <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/[0.04] p-2">
          <button
            type="button"
            onClick={() => setErrorExpanded((e) => !e)}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-300 hover:text-red-200"
          >
            <AlertCircle size={10} />
            {t('exportLastError')}
            {errorExpanded ? (
              <ChevronUp size={10} />
            ) : (
              <ChevronDown size={10} />
            )}
          </button>
          {errorExpanded && (
            <p className="mt-1 text-[10px] text-red-300/90 whitespace-pre-wrap font-mono">
              {job.lastError}
            </p>
          )}
        </div>
      )}

      {/* Action form (when an action is active) */}
      {activeForm && (
        <div className="mt-3 space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
          <p className="text-[10px] font-semibold text-[var(--pt-text-1)]">
            {t(`exportAction.${activeForm}`)}
          </p>
          <TextInput
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('exportActionReasonPlaceholder')}
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveForm(null);
                setReason('');
              }}
              className="rounded-md px-2 py-1 text-[10px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
            >
              {t('exportActionCancel')}
            </button>
            <button
              type="button"
              onClick={submitForm}
              disabled={!reason.trim() || isActioning}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold disabled:opacity-50 nvi-press ${
                activeForm === 'cancel'
                  ? 'bg-red-500 text-white'
                  : activeForm === 'delivered'
                    ? 'bg-emerald-500 text-black'
                    : 'bg-[var(--pt-accent)] text-black'
              }`}
            >
              {isActioning ? (
                <Spinner size="xs" variant="dots" />
              ) : activeForm === 'cancel' ? (
                <X size={11} />
              ) : activeForm === 'delivered' ? (
                <CheckCircle size={11} />
              ) : (
                <RefreshCw size={11} />
              )}
              {t('exportActionConfirm')}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons row */}
      {!activeForm && (canRetry || canRequeue || canCancel || canMarkDelivered) && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
          {canRetry && (
            <button
              type="button"
              onClick={() => setActiveForm('retry')}
              disabled={isActioning}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 nvi-press"
            >
              {isActioning && actionType === 'retry' ? (
                <Spinner size="xs" variant="dots" />
              ) : (
                <RefreshCw size={11} />
              )}
              {t('exportRetry')}
            </button>
          )}
          {canRequeue && (
            <button
              type="button"
              onClick={() => setActiveForm('requeue')}
              disabled={isActioning}
              className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 nvi-press"
            >
              {isActioning && actionType === 'requeue' ? (
                <Spinner size="xs" variant="dots" />
              ) : (
                <RotateCcw size={11} />
              )}
              {t('exportRequeue')}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => setActiveForm('cancel')}
              disabled={isActioning}
              className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50 nvi-press"
            >
              {isActioning && actionType === 'cancel' ? (
                <Spinner size="xs" variant="dots" />
              ) : (
                <X size={11} />
              )}
              {t('exportCancel')}
            </button>
          )}
          {canMarkDelivered && (
            <button
              type="button"
              onClick={() => setActiveForm('delivered')}
              disabled={isActioning}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 nvi-press"
            >
              {isActioning && actionType === 'delivered' ? (
                <Spinner size="xs" variant="dots" />
              ) : (
                <CheckCircle size={11} />
              )}
              {t('exportMarkDelivered')}
            </button>
          )}
        </div>
      )}

      {/* RUNNING progress indicator */}
      {job.status === 'RUNNING' && !activeForm && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-blue-400">
          <Spinner size="xs" variant="dots" />
          {t('exportRunningHint')}
        </div>
      )}
    </Card>
  );
}
