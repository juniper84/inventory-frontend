'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Wifi,
  WifiOff,
  Clock,
  Shield,
  X,
  Plus,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Spinner } from '@/components/Spinner';
import type { SupportSession } from '../hooks/useSupportSessions';

type Props = {
  session: SupportSession;
  locale: string;
  isRevoking: boolean;
  isExtending: boolean;
  onRevoke: (reason: string) => void;
  onExtend: (additionalHours: number, reason: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const SEVERITY_COLOR: Record<string, string> = {
  LOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  CRITICAL: 'bg-red-500/20 text-red-300 border-red-500/40',
};

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

export function SessionCard({
  session,
  locale,
  isRevoking,
  isExtending,
  onRevoke,
  onExtend,
  t,
}: Props) {
  const [showRevoke, setShowRevoke] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [extendReason, setExtendReason] = useState('');
  const [extendHours, setExtendHours] = useState(2);

  // Live re-render every 30s for countdown
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const expiresAtMs = new Date(session.expiresAt).getTime();
  const remainingMs = expiresAtMs - now;
  const isRevoked = Boolean(session.revokedAt);
  const isExpired = !isRevoked && remainingMs <= 0;
  const isActive = !isRevoked && !isExpired;

  const status = isRevoked ? 'revoked' : isExpired ? 'expired' : 'active';
  const statusDotColor =
    status === 'active'
      ? 'bg-emerald-400'
      : status === 'revoked'
      ? 'bg-red-400'
      : 'bg-zinc-400';

  // Countdown text + color
  let countdownText = '0m';
  let countdownColor = 'text-zinc-400';
  if (isActive) {
    const totalMins = Math.floor(remainingMs / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    countdownText =
      hours > 0
        ? mins > 0
          ? `${hours}h ${mins}m`
          : `${hours}h`
        : `${mins}m`;
    if (totalMins < 15) countdownColor = 'text-red-400 animate-pulse';
    else if (totalMins < 60) countdownColor = 'text-orange-400';
    else if (totalMins < 180) countdownColor = 'text-amber-400';
    else countdownColor = 'text-emerald-400';
  }

  const businessName = session.business?.name ?? session.businessId;
  const severity = session.request?.severity;

  return (
    <Card
      padding="md"
      className={`nvi-slide-in-bottom transition ${
        isActive
          ? 'border-emerald-500/20 hover:border-emerald-500/40'
          : 'hover:border-[var(--pt-accent-border)]'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${
              isActive
                ? 'bg-emerald-500/15'
                : isRevoked
                ? 'bg-red-500/15'
                : 'bg-zinc-500/15'
            }`}
          >
            {isActive ? (
              <Wifi size={12} className="text-emerald-400" />
            ) : (
              <WifiOff size={12} className="text-zinc-400" />
            )}
          </div>
          <div className="min-w-0">
            <Link
              href={`/${locale}/platform/businesses/${session.businessId}`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--pt-text-1)] hover:text-[var(--pt-accent)] transition"
            >
              {businessName}
              <ExternalLink size={10} className="opacity-60" />
            </Link>
            <p className="text-[10px] text-[var(--pt-text-muted)]">
              {t('sessionId')}: <span className="font-mono">{session.id.slice(0, 8)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${statusDotColor} ${isActive ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pt-text-2)]">
            {t(`sessionStatus.${status}`)}
          </span>
        </div>
      </div>

      {/* Body */}
      {session.request && (
        <p className="mt-2 text-xs text-[var(--pt-text-2)] line-clamp-2">
          {session.request.reason}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {/* Countdown */}
        <div className="rounded-lg bg-white/[0.02] px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
            {isActive
              ? t('sessionTimeRemaining')
              : isRevoked
              ? t('sessionRevokedAt')
              : t('sessionExpired')}
          </p>
          <p className={`text-sm font-bold ${countdownColor}`}>
            <Clock size={11} className="inline mr-1" />
            {countdownText}
          </p>
        </div>
        {severity && (
          <div className="rounded-lg bg-white/[0.02] px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
              {t('sessionSeverity')}
            </p>
            <span
              className={`mt-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${SEVERITY_COLOR[severity] ?? ''}`}
            >
              <Shield size={9} />
              {severity}
            </span>
          </div>
        )}
      </div>

      {/* Scope badges */}
      {session.scope && session.scope.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {session.scope.map((s) => (
            <span
              key={s}
              className="rounded-md border border-white/[0.06] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium text-[var(--pt-text-2)]"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Footer: timestamps */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--pt-text-muted)]">
        <span>
          {t('sessionCreated')}: {relativeTime(session.createdAt)}
        </span>
        <span>
          {t('sessionExpiresAt')}:{' '}
          {new Date(session.expiresAt).toLocaleString(locale)}
        </span>
        {session.revokedAt && (
          <span className="text-red-300">
            {t('sessionRevokedAt')}: {relativeTime(session.revokedAt)}
          </span>
        )}
      </div>

      {/* Actions */}
      {isActive && (
        <div className="mt-3 border-t border-white/[0.06] pt-3 space-y-2">
          {!showRevoke && !showExtend && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowExtend(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 nvi-press"
              >
                <Plus size={11} />
                {t('sessionExtend')}
              </button>
              <button
                type="button"
                onClick={() => setShowRevoke(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-300 hover:bg-red-500/20 nvi-press"
              >
                <X size={11} />
                {t('sessionRevoke')}
              </button>
            </div>
          )}

          {showExtend && (
            <div className="space-y-2 rounded-lg bg-emerald-500/[0.04] border border-emerald-500/20 p-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-[var(--pt-text-muted)]">
                    {t('sessionExtendHours')}
                  </label>
                  <TextInput
                    type="number"
                    min={1}
                    max={24}
                    value={String(extendHours)}
                    onChange={(e) =>
                      setExtendHours(Math.max(1, Number(e.target.value) || 1))
                    }
                  />
                </div>
                <div>
                  <label className="text-[9px] text-[var(--pt-text-muted)]">
                    {t('sessionExtendReason')}
                  </label>
                  <TextInput
                    value={extendReason}
                    onChange={(e) => setExtendReason(e.target.value)}
                    placeholder={t('sessionExtendReasonPlaceholder')}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowExtend(false);
                    setExtendReason('');
                  }}
                  className="rounded-md px-2 py-1 text-[10px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
                >
                  {t('sessionCancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExtend(extendHours, extendReason);
                    setShowExtend(false);
                    setExtendReason('');
                  }}
                  disabled={!extendReason.trim() || isExtending}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-1 text-[10px] font-semibold text-black disabled:opacity-50 nvi-press"
                >
                  {isExtending ? (
                    <Spinner size="xs" variant="dots" />
                  ) : (
                    <Plus size={11} />
                  )}
                  {t('sessionExtendConfirm')}
                </button>
              </div>
            </div>
          )}

          {showRevoke && (
            <div className="space-y-2 rounded-lg bg-red-500/[0.04] border border-red-500/20 p-2">
              <label className="text-[9px] text-[var(--pt-text-muted)]">
                {t('sessionRevokeReason')}
              </label>
              <TextInput
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder={t('sessionRevokeReasonPlaceholder')}
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowRevoke(false);
                    setRevokeReason('');
                  }}
                  className="rounded-md px-2 py-1 text-[10px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
                >
                  {t('sessionCancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRevoke(revokeReason);
                    setShowRevoke(false);
                    setRevokeReason('');
                  }}
                  disabled={!revokeReason.trim() || isRevoking}
                  className="inline-flex items-center gap-1 rounded-md bg-red-500 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50 nvi-press"
                >
                  {isRevoking ? (
                    <Spinner size="xs" variant="dots" />
                  ) : (
                    <X size={11} />
                  )}
                  {t('sessionRevokeConfirm')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isRevoked && (
        <div className="mt-3 border-t border-red-500/20 pt-2">
          <p className="inline-flex items-center gap-1 text-[10px] text-red-300">
            <AlertCircle size={10} />
            {t('sessionRevokedFooter', { time: relativeTime(session.revokedAt!) })}
          </p>
        </div>
      )}
    </Card>
  );
}
