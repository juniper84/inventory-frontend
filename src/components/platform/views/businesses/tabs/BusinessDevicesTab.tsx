'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Smartphone, X, Check, Wifi, WifiOff } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/Spinner';
import { useBusinessWorkspace } from '../hooks/useBusinessWorkspace';

type Props = {
  businessId: string;
};

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

export function BusinessDevicesTab({ businessId }: Props) {
  const t = useTranslations('platformConsole');
  const ws = useBusinessWorkspace(businessId);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-load on mount
  useEffect(() => {
    ws.loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const startRevoke = (deviceId: string) => {
    setRevokingId(deviceId);
    setReason('');
  };

  const cancelRevoke = () => {
    setRevokingId(null);
    setReason('');
  };

  const submitRevoke = async () => {
    if (!revokingId || !reason.trim()) return;
    setIsSubmitting(true);
    const ok = await ws.revokeDevice(revokingId, reason);
    if (ok) {
      setRevokingId(null);
      setReason('');
    }
    setIsSubmitting(false);
  };

  const total = ws.devices.length;
  const active = ws.devices.filter((d) => d.status === 'ACTIVE').length;
  const revoked = total - active;

  return (
    <div className="space-y-4 nvi-stagger">
      {/* Summary card */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
            <Smartphone size={16} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('devicesTitle')}</h3>
            <div className="mt-0.5 flex items-center gap-3 text-[10px] text-[var(--pt-text-muted)]">
              <span>{total} {t('devicesTotal')}</span>
              <span className="flex items-center gap-1 text-emerald-400">
                <Wifi size={9} /> {active} {t('devicesActive')}
              </span>
              {revoked > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <WifiOff size={9} /> {revoked} {t('devicesRevoked')}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Device list */}
      {ws.isLoadingDevices ? (
        <div className="space-y-2 nvi-stagger">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
          ))}
        </div>
      ) : ws.devices.length === 0 ? (
        <EmptyState
          icon={<Smartphone size={28} className="text-[var(--pt-text-muted)]" />}
          title={t('devicesEmptyTitle')}
          description={t('devicesEmptyHint')}
        />
      ) : (
        <div className="space-y-2 nvi-stagger">
          {ws.devices.map((device) => {
            const isRevoking = revokingId === device.id;
            const isActive = device.status === 'ACTIVE';

            return (
              <Card
                key={device.id}
                padding="md"
                className={`nvi-slide-in-bottom ${
                  !isActive ? 'opacity-70' : ''
                } hover:border-[var(--pt-accent-border)] transition`}
              >
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      isActive ? 'bg-emerald-500/10' : 'bg-red-500/10'
                    }`}
                  >
                    {isActive ? (
                      <Wifi size={14} className="text-emerald-400" />
                    ) : (
                      <WifiOff size={14} className="text-red-400" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--pt-text-1)] truncate">
                        {device.deviceName ?? t('devicesUnnamed')}
                      </p>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          isActive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                        }`}
                      >
                        {device.status}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--pt-text-muted)]">
                      <span>{t('devicesLastSeen')}: {relativeTime(device.lastSeenAt)}</span>
                      {device.createdAt && (
                        <span>{t('devicesCreated')}: {relativeTime(device.createdAt)}</span>
                      )}
                      {device.revokedAt && (
                        <span className="text-red-400">
                          {t('devicesRevokedAt')}: {relativeTime(device.revokedAt)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[9px] font-mono text-[var(--pt-text-muted)] truncate">
                      {device.id}
                    </p>
                  </div>

                  {/* Revoke button (active devices only) */}
                  {isActive && !isRevoking && (
                    <button
                      type="button"
                      onClick={() => startRevoke(device.id)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1 text-[9px] font-semibold text-red-400 hover:bg-red-500/10 transition nvi-press"
                    >
                      <X size={10} />
                      {t('devicesRevoke')}
                    </button>
                  )}
                </div>

                {/* Revoke form (inline) */}
                {isRevoking && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2 nvi-slide-in-bottom">
                    <TextInput
                      label={t('devicesRevokeReason')}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t('devicesRevokeReasonPlaceholder')}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={cancelRevoke}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-2 py-1 text-[9px] text-[var(--pt-text-muted)] nvi-press"
                      >
                        {t('devicesRevokeCancel')}
                      </button>
                      <button
                        type="button"
                        onClick={submitRevoke}
                        disabled={!reason.trim() || isSubmitting}
                        className="inline-flex items-center gap-1 rounded-md bg-red-500/15 border border-red-500/30 px-3 py-1 text-[9px] font-semibold text-red-400 disabled:opacity-40 nvi-press"
                      >
                        {isSubmitting ? <Spinner size="xs" variant="dots" /> : <Check size={10} />}
                        {isSubmitting ? t('devicesRevoking') : t('devicesRevokeConfirm')}
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
