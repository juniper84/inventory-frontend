'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Activity,
  Shield,
  PlayCircle,
  ExternalLink,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/Spinner';
import type {
  SupportRequest,
  SupportPriority,
  SupportSeverity,
  SupportRequestStatus,
} from '../hooks/useSupportRequests';

type Props = {
  request: SupportRequest;
  locale: string;
  isActivating: boolean;
  onActivate: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const SEVERITY_COLOR: Record<SupportSeverity, string> = {
  LOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  CRITICAL:
    'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse',
};

const PRIORITY_COLOR: Record<SupportPriority, string> = {
  LOW: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  URGENT: 'bg-red-500/20 text-red-300 border-red-500/40',
};

const PIPELINE: SupportRequestStatus[] = [
  'PENDING',
  'APPROVED',
  'EXPIRED',
];

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function timeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return '0m';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

export function RequestCard({
  request,
  locale,
  isActivating,
  onActivate,
  t,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const businessName = request.business?.name ?? request.businessId;
  const activeSession = request.sessions?.find((s) => !s.revokedAt);
  const hasActiveSession =
    activeSession &&
    new Date(activeSession.expiresAt).getTime() > Date.now();

  // Visual pipeline state
  const pipelineState =
    request.status === 'REJECTED'
      ? 'rejected'
      : request.status === 'EXPIRED'
      ? 'expired'
      : hasActiveSession
      ? 'activated'
      : request.status === 'APPROVED'
      ? 'approved'
      : 'pending';

  return (
    <Card
      padding="md"
      className="nvi-slide-in-bottom hover:border-[var(--pt-accent-border)] transition"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {/* Left: identity */}
        <div className="flex-1 min-w-0">
          <Link
            href={`/${locale}/platform/businesses/${request.businessId}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--pt-text-1)] hover:text-[var(--pt-accent)] transition"
          >
            {businessName}
            <ExternalLink size={11} className="opacity-60" />
          </Link>
          <p
            className={`mt-1 text-xs text-[var(--pt-text-2)] ${
              expanded ? '' : 'line-clamp-2'
            }`}
          >
            {request.reason}
          </p>
          {request.reason.length > 120 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
            >
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {expanded ? t('requestLessText') : t('requestMoreText')}
            </button>
          )}

          {/* Scope badges */}
          {request.scope && request.scope.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {request.scope.map((s) => (
                <span
                  key={s}
                  className="rounded-md border border-white/[0.06] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium text-[var(--pt-text-2)]"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Center: pipeline + badges */}
        <div className="flex flex-col items-start gap-2 lg:items-center lg:px-4">
          {/* Status pipeline */}
          <div className="flex items-center gap-1">
            {PIPELINE.map((step, idx) => {
              const isActive =
                step === request.status ||
                (step === 'APPROVED' && pipelineState === 'activated');
              const isPast =
                (step === 'PENDING' &&
                  request.status !== 'PENDING') ||
                (step === 'APPROVED' &&
                  (pipelineState === 'activated' ||
                    pipelineState === 'expired'));
              return (
                <div key={step} className="flex items-center gap-1">
                  <div
                    className={`h-2 w-2 rounded-full transition ${
                      isActive
                        ? 'bg-[var(--pt-accent)] ring-2 ring-[var(--pt-accent)]/30'
                        : isPast
                        ? 'bg-[var(--pt-accent)]/60'
                        : 'bg-white/10'
                    }`}
                  />
                  {idx < PIPELINE.length - 1 && (
                    <div
                      className={`h-px w-3 ${
                        isPast ? 'bg-[var(--pt-accent)]/60' : 'bg-white/10'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Severity + priority */}
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${SEVERITY_COLOR[request.severity]}`}
            >
              <Shield size={9} />
              {request.severity}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${PRIORITY_COLOR[request.priority]}`}
            >
              <Activity size={9} />
              {request.priority}
            </span>
          </div>
        </div>

        {/* Right: metadata + action */}
        <div className="flex flex-col items-start gap-1 lg:items-end">
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--pt-text-muted)]">
            <Clock size={10} />
            {request.durationHours
              ? `${request.durationHours}h`
              : t('requestDurationDefault')}
          </span>
          <span
            className="text-[10px] text-[var(--pt-text-muted)]"
            title={new Date(request.requestedAt).toLocaleString()}
          >
            {relativeTime(request.requestedAt)}
          </span>

          {/* Status / action */}
          {pipelineState === 'pending' && (
            <span className="mt-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-300">
              {t('requestAwaitingApproval')}
            </span>
          )}
          {pipelineState === 'rejected' && (
            <span className="mt-1 rounded-md bg-red-500/15 px-2 py-0.5 text-[9px] font-semibold text-red-300">
              {t('requestRejected')}
            </span>
          )}
          {pipelineState === 'expired' && (
            <span className="mt-1 rounded-md bg-zinc-500/15 px-2 py-0.5 text-[9px] font-semibold text-zinc-300">
              {t('requestExpired')}
            </span>
          )}
          {pipelineState === 'activated' && activeSession && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[9px] font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {t('requestSessionActive', {
                time: timeRemaining(activeSession.expiresAt),
              })}
            </span>
          )}
          {pipelineState === 'approved' && !hasActiveSession && (
            <button
              type="button"
              onClick={onActivate}
              disabled={isActivating}
              className="mt-1 inline-flex items-center gap-1 rounded-lg bg-[var(--pt-accent)] px-2 py-1 text-[10px] font-semibold text-black disabled:opacity-50 nvi-press"
            >
              {isActivating ? (
                <Spinner size="xs" variant="dots" />
              ) : (
                <PlayCircle size={11} />
              )}
              {t('requestActivateLogin')}
            </button>
          )}
        </div>
      </div>

      {/* Linked sessions footer */}
      {request.sessions && request.sessions.length > 0 && expanded && (
        <div className="mt-3 border-t border-white/[0.06] pt-2">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)] mb-1">
            {t('requestLinkedSessions')}
          </p>
          <div className="space-y-1">
            {request.sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md bg-white/[0.02] px-2 py-1 text-[10px]"
              >
                <span className="text-[var(--pt-text-2)]">
                  {s.revokedAt
                    ? t('requestSessionRevoked')
                    : new Date(s.expiresAt).getTime() > Date.now()
                    ? t('requestSessionActiveShort')
                    : t('requestSessionExpiredShort')}
                </span>
                <span className="text-[var(--pt-text-muted)]">
                  {relativeTime(s.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
