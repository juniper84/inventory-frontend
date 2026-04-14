'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import { notify } from '@/components/notifications/NotificationProvider';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  Smartphone,
  Monitor,
  RefreshCw,
  Lock,
  Unlock,
  ShieldOff,
  Plus,
  Clock,
  AlertTriangle,
  Receipt,
  ArrowRightLeft,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken, getOrCreateDeviceId, getStoredUser } from '@/lib/auth';
import {
  clearOfflinePin,
  clearOfflineData,
  getOfflineCache,
  getOfflineFlag,
  getPendingCount,
  getQueueStats,
  isOfflinePinRequired,
  rotateOfflineKey,
  setOfflineFlag,
  setOfflinePin,
} from '@/lib/offline-store';
import { syncOfflineQueue } from '@/lib/offline-sync';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { getPermissionSet } from '@/lib/permissions';
import { useFormatDate } from '@/lib/business-context';
import { BarChart3 } from 'lucide-react';
import { PageHeader, Card, EmptyState, ProgressBar, TextInput, StatusBadge } from '@/components/ui';
import { Banner } from '@/components/notifications/Banner';

/* ─── Types ───────────────────────────────────────────────────────────────── */

type OfflineStatus = {
  device?: {
    id: string;
    deviceName: string;
    status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
    lastSeenAt?: string | null;
    createdAt?: string;
  } | null;
  offlineEnabled: boolean;
  limits: {
    offlineDevices: number;
    offlineLimits?: {
      maxDurationHours?: number;
      maxSalesCount?: number;
      maxTotalValue?: number;
    };
  };
  pendingCount: number;
  pendingSalesValue: number;
  lastSeenAt?: string | null;
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function statusDotClass(status?: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]';
    case 'REVOKED':
      return 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]';
    case 'EXPIRED':
      return 'bg-gray-400';
    default:
      return 'bg-gray-500';
  }
}

function deviceTypeIcon(name: string) {
  const lower = name.toLowerCase();
  const isMobile = lower.includes('phone') || lower.includes('mobile') || lower.includes('android') || lower.includes('iphone');
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
      {isMobile
        ? <Smartphone size={24} className="text-blue-400" />
        : <Monitor size={24} className="text-blue-400" />}
    </div>
  );
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ─── Component ───────────────────────────────────────────────────────────── */

export default function OfflinePage() {
  const t = useTranslations('offlinePage');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('offline.write');
  const { formatDateTime } = useFormatDate();

  /* ── State ─────────────────────────────────────────────────────────────── */

  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isPinSaving, setIsPinSaving] = useState(false);
  const [isPinClearing, setIsPinClearing] = useState(false);
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinRequired, setPinRequired] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [queueStats, setQueueStats] = useState<{
    count: number;
    bytes: number;
    maxItems: number;
    maxBytes: number;
  } | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncBlocked, setSyncBlocked] = useState(false);
  const [cacheTruncated, setCacheTruncated] = useState(false);
  const [message, setMessage] = useToastState();
  const [receiptHistory, setReceiptHistory] = useState<
    { localReceiptNumber?: string | null; receiptNumber?: string | null; syncedAt: string }[]
  >([]);
  const deviceId = getOrCreateDeviceId();

  /* ── Load ──────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const token = getAccessToken();
      const user = getStoredUser();
      if (!token || !user) {
        setIsLoading(false);
        return;
      }
      if (navigator.onLine) {
        try {
          const data = await apiFetch<OfflineStatus>(
            `/offline/status?deviceId=${deviceId}`,
            { token },
          );
          setStatus(data);
          setDeviceName(data.device?.deviceName ?? '');
        } catch (err) {
          setStatus(null);
          setMessage({
            action: 'load',
            outcome: 'failure',
            message: getApiErrorMessage(err, t('loadFailed')),
          });
        }
      }
      setPendingCount(await getPendingCount());
      setQueueStats(await getQueueStats());
      setPinRequired(await isOfflinePinRequired());
      setLastSyncAt(await getOfflineFlag('lastSyncAt'));
      setSyncBlocked((await getOfflineFlag('syncBlocked')) === 'true');
      const snapshot = await getOfflineCache<{ meta?: { truncated?: boolean } }>('snapshot');
      setCacheTruncated(snapshot?.meta?.truncated === true);
      const { getReceiptHistory } = await import('@/lib/offline-store');
      setReceiptHistory(
        (await getReceiptHistory()) as {
          localReceiptNumber?: string | null;
          receiptNumber?: string | null;
          syncedAt: string;
        }[],
      );
      setIsLoading(false);
    };
    load();
  }, [deviceId]);

  /* ── Derived ───────────────────────────────────────────────────────────── */

  const queueUsagePercent = useMemo(() => {
    if (!queueStats?.maxItems) return 0;
    return Math.min(100, Math.round((queueStats.count / queueStats.maxItems) * 100));
  }, [queueStats]);

  const activeDevices = status?.device?.status === 'ACTIVE' ? 1 : 0;

  /* ── Actions ───────────────────────────────────────────────────────────── */

  const registerDevice = async () => {
    const token = getAccessToken();
    const user = getStoredUser();
    if (!token || !user) return;
    setIsRegistering(true);
    try {
      const device = await apiFetch<OfflineStatus['device']>(
        `/offline/register-device`,
        {
          token,
          method: 'POST',
          body: JSON.stringify({ deviceName, deviceId, userId: user.id }),
        },
      );
      setStatus((prev) => ({
        ...(prev ?? {
          offlineEnabled: true,
          limits: { offlineDevices: 0 },
          pendingCount: 0,
          pendingSalesValue: 0,
        }),
        device,
      }));
      setMessage({ action: 'sync', outcome: 'info', message: t('deviceRegistered') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('registerFailed')),
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const revokeDevice = async () => {
    const token = getAccessToken();
    const user = getStoredUser();
    if (!token || !user) return;
    const ok = await notify.confirm({
      title: t('revokeDeviceConfirmTitle'),
      message: t('revokeDeviceConfirmMessage'),
      confirmText: t('revokeDeviceConfirmButton'),
    });
    if (!ok) return;
    setIsRevoking(true);
    try {
      await apiFetch('/offline/revoke-device', {
        token,
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      });
      await rotateOfflineKey();
      await clearOfflineData();
      setPendingCount(0);
      setQueueStats(await getQueueStats());
      setReceiptHistory([]);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              device: prev.device ? { ...prev.device, status: 'REVOKED' } : prev.device,
            }
          : prev,
      );
      setMessage({ action: 'sync', outcome: 'info', message: t('deviceRevoked') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('revokeFailed')),
      });
    } finally {
      setIsRevoking(false);
    }
  };

  const syncNow = async () => {
    setIsSyncing(true);
    try {
      const result = await syncOfflineQueue();
      if (result.cache) {
        setMessage({ action: 'sync', outcome: 'success', message: t('syncComplete') });
      } else {
        setMessage({ action: 'sync', outcome: 'info', message: t('syncEmpty') });
      }
      setPendingCount(await getPendingCount());
      setLastSyncAt(await getOfflineFlag('lastSyncAt'));
      await setOfflineFlag('syncBlocked', 'false');
      setSyncBlocked(false);
    } catch (err) {
      await setOfflineFlag('syncBlocked', 'true');
      setSyncBlocked(true);
      setMessage({
        action: 'sync',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('syncFailed')),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  /* ── Loading skeleton ──────────────────────────────────────────────────── */

  if (isLoading) {
    return <PageSkeleton />;
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  const deviceStatus = status?.device?.status;
  const hasDevice = !!status?.device;

  return (
    <section className="space-y-6">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-badge">{t('badgeDeviceState')}</span>
            <span className="nvi-badge">{t('badgeSyncWatch')}</span>
          </>
        }
      />

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        {/* Active devices */}
        <Card as="article" padding="md">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Smartphone size={20} className="text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiActiveDevices')}</p>
              <p className={`mt-1 text-3xl font-extrabold tabular-nums ${activeDevices > 0 ? 'text-blue-300' : 'text-white/20'}`}>{activeDevices}</p>
            </div>
          </div>
        </Card>

        {/* Pending queue */}
        <Card as="article" padding="md">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <Clock size={20} className="text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiPendingQueue')}</p>
              <p className={`mt-1 text-3xl font-extrabold tabular-nums ${pendingCount > 0 ? 'text-amber-300' : 'text-white/20'}`}>{pendingCount}</p>
            </div>
          </div>
        </Card>

        {/* Queue usage */}
        <Card as="article" padding="md">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-500/10">
              <BarChart3 size={20} className="text-purple-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiQueueUsage')}</p>
              <div className="mt-2 flex items-center gap-2">
                <ProgressBar
                  value={queueStats?.count ?? 0}
                  max={queueStats?.maxItems ?? 1}
                  color={queueUsagePercent > 80 ? 'red' : queueUsagePercent > 50 ? 'amber' : 'green'}
                  height={8}
                  className="flex-1"
                />
                <span className={`text-sm font-bold tabular-nums ${queueUsagePercent > 80 ? 'text-red-300' : queueUsagePercent > 50 ? 'text-amber-300' : 'text-emerald-300'}`}>{queueUsagePercent}%</span>
              </div>
            </div>
          </div>
        </Card>

        {/* PIN protected */}
        <Card as="article" padding="md">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <Lock size={20} className="text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiPinProtected')}</p>
              <p className={`mt-1 text-3xl font-extrabold ${pinRequired ? 'text-emerald-300' : 'text-white/20'}`}>
                {pinRequired ? t('kpiPinYes') : t('kpiPinNo')}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Status banner ──────────────────────────────────────────────────── */}
      {message ? <Banner message={message as string} /> : null}

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">

        {/* ── Left column ────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Device health card */}
          <Card padding="lg" className="border-l-2 border-l-blue-400">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <Smartphone size={18} className="text-blue-400" />
              </div>
              <h3 className="text-sm font-bold text-[color:var(--foreground)] tracking-wide">{t('deviceTitle')}</h3>
            </div>

            {hasDevice ? (
              <div className="space-y-4">
                {/* Device identity row */}
                <div className="flex items-start gap-3">
                  {deviceTypeIcon(status!.device!.deviceName)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-semibold text-[color:var(--foreground)] truncate">
                        {status!.device!.deviceName}
                      </span>
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(deviceStatus)}`} />
                      <StatusBadge status={deviceStatus ?? 'INACTIVE'} size="xs" showDot={false} />
                    </div>
                    <p className="mt-1 text-[11px] text-[color:var(--muted)] font-mono truncate">
                      {t('deviceId', { id: deviceId })}
                    </p>
                  </div>
                </div>

                {/* Queue stats */}
                {queueStats ? (
                  <div className="rounded-xl border border-[color:var(--border)] bg-gradient-to-br from-black/40 to-black/20 p-4">
                    <div className="flex items-center justify-between text-xs mb-3">
                      <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium">{t('queueStatsLabel')}</span>
                      <div className="flex items-center gap-2.5">
                        <span className={`text-base font-extrabold tabular-nums ${queueUsagePercent > 80 ? 'text-red-300' : queueUsagePercent > 50 ? 'text-amber-300' : 'text-emerald-300'}`}>{queueUsagePercent}%</span>
                        <span className="font-mono text-[11px] text-white/30">{queueStats.count}/{queueStats.maxItems}</span>
                      </div>
                    </div>
                    <ProgressBar
                      value={queueStats.count}
                      max={queueStats.maxItems}
                      color={queueUsagePercent > 80 ? 'red' : queueUsagePercent > 50 ? 'amber' : 'green'}
                      height={10}
                    />
                    <p className="mt-2.5 text-[11px] text-white/30 font-mono">
                      {t('queueBytes', {
                        size: Math.round(queueStats.bytes / 1024),
                        maxSize: Math.round(queueStats.maxBytes / 1024),
                      })}
                    </p>
                  </div>
                ) : null}

                {/* Last seen + PIN row */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-blue-500/5 border border-blue-500/15 px-3 py-2 text-xs text-white/60">
                    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/10">
                      <Clock size={11} className="text-blue-400" />
                    </div>
                    <span>{status!.device!.lastSeenAt ? relativeTime(status!.device!.lastSeenAt) : t('never')}</span>
                  </div>
                  {pinRequired ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400">
                      <Lock size={12} /> {t('pinActive')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400">
                      <Unlock size={12} /> {t('pinInactive')}
                    </span>
                  )}
                </div>

                {/* Warnings */}
                {syncBlocked ? (
                  <Banner message={t('syncBlocked')} severity="error" />
                ) : null}
                {cacheTruncated ? (
                  <Banner message={t('cacheTruncated')} severity="warning" />
                ) : null}

                {/* Action row */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[color:var(--border)]">
                  <button
                    type="button"
                    onClick={syncNow}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-2 text-xs font-semibold text-blue-400 transition-colors hover:bg-blue-500/20 hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={isSyncing || !canWrite}
                    title={!canWrite ? noAccess('title') : undefined}
                  >
                    {isSyncing ? <Spinner size="xs" variant="orbit" /> : <RefreshCw size={14} />}
                    {isSyncing ? t('syncing') : t('syncNow')}
                  </button>
                  <Link
                    href={`/${locale}/offline/conflicts`}
                    className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-4 py-2 text-xs font-medium text-[color:var(--foreground)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                  >
                    <ArrowRightLeft size={14} />
                    {t('viewConflicts')}
                  </Link>
                  {deviceStatus === 'ACTIVE' ? (
                    <button
                      type="button"
                      onClick={revokeDevice}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={isRevoking || !canWrite}
                      title={!canWrite ? noAccess('title') : undefined}
                    >
                      {isRevoking ? <Spinner size="xs" variant="pulse" /> : <ShieldOff size={14} />}
                      {isRevoking ? t('revoking') : t('revokeDevice')}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              /* ── Empty state: no device registered ─────────────────────── */
              <EmptyState
                icon={
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 mx-auto">
                    <Smartphone size={28} className="text-blue-400" />
                  </div>
                }
                title={t('noDeviceTitle')}
                description={t('noDeviceDescription')}
              />
            )}
          </Card>

          {/* Registration form card */}
          <Card padding="lg" className="border-l-2 border-l-blue-400">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <Smartphone size={18} className="text-blue-400" />
              </div>
              <h3 className="text-sm font-bold text-[color:var(--foreground)] tracking-wide">{t('registerTitle')}</h3>
            </div>
            <div className="space-y-3">
              <TextInput
                label={t('deviceNameLabel')}
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                placeholder={t('deviceNamePlaceholder')}
              />
              <button
                type="button"
                onClick={registerDevice}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-2.5 text-xs font-semibold text-blue-400 transition-colors hover:bg-blue-500/20 hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={isRegistering || !deviceName.trim() || !canWrite}
                title={!canWrite ? noAccess('title') : undefined}
              >
                {isRegistering ? <Spinner size="xs" variant="dots" /> : <Plus size={14} />}
                {isRegistering ? t('registering') : t('registerDevice')}
              </button>
            </div>
          </Card>
        </div>

        {/* ── Right column ───────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Sync control card */}
          <Card padding="lg" className="border-l-2 border-l-blue-400">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <RefreshCw size={18} className="text-blue-400" />
              </div>
              <h3 className="text-sm font-bold text-[color:var(--foreground)] tracking-wide">{t('syncTitle')}</h3>
            </div>
            <div className="space-y-3">
              {/* Stat pills */}
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-2 rounded-lg bg-blue-500/5 border border-blue-500/15 px-3 py-2.5 text-xs">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/10">
                    <Clock size={11} className="text-blue-400" />
                  </div>
                  <span className="text-white/40">{t('lastSyncLabel')}</span>
                  <span className="font-semibold text-[color:var(--foreground)]">
                    {lastSyncAt ? relativeTime(lastSyncAt) : t('never')}
                  </span>
                </div>
                <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs ${pendingCount > 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-black/30 border-white/5'}`}>
                  <span className="text-white/40">{t('pendingActionsLabel')}</span>
                  <span className={`font-extrabold tabular-nums ${pendingCount > 0 ? 'text-amber-300' : 'text-white/50'}`}>{pendingCount}</span>
                </div>
              </div>
              {syncBlocked ? (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 rounded-lg px-3 py-2.5 border border-red-500/20">
                  <AlertTriangle size={13} />
                  <span>{t('syncBlockedShort')}</span>
                </div>
              ) : null}
              <button
                type="button"
                onClick={syncNow}
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-400 hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                disabled={isSyncing || !canWrite}
                title={!canWrite ? noAccess('title') : undefined}
              >
                {isSyncing ? <Spinner size="xs" variant="orbit" /> : <RefreshCw size={16} />}
                {isSyncing ? t('syncing') : t('syncTrigger')}
              </button>
            </div>
          </Card>

          {/* Offline limits card */}
          <Card padding="lg" className="border-l-2 border-l-amber-400">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <AlertTriangle size={18} className="text-amber-400" />
              </div>
              <h3 className="text-sm font-bold text-[color:var(--foreground)] tracking-wide">{t('limitsTitle')}</h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-amber-500/15 bg-gradient-to-b from-amber-500/8 to-amber-500/3 p-4 text-center">
                <p className="text-2xl font-extrabold tabular-nums text-amber-300">
                  {status?.limits.offlineLimits?.maxDurationHours ?? '\u2014'}
                </p>
                <p className="mt-1.5 text-[10px] uppercase tracking-widest text-white/40">{t('limitsHours')}</p>
              </div>
              <div className="rounded-xl border border-amber-500/15 bg-gradient-to-b from-amber-500/8 to-amber-500/3 p-4 text-center">
                <p className="text-2xl font-extrabold tabular-nums text-amber-300">
                  {status?.limits.offlineLimits?.maxSalesCount ?? '\u2014'}
                </p>
                <p className="mt-1.5 text-[10px] uppercase tracking-widest text-white/40">{t('limitsSales')}</p>
              </div>
              <div className="rounded-xl border border-amber-500/15 bg-gradient-to-b from-amber-500/8 to-amber-500/3 p-4 text-center">
                <p className="text-2xl font-extrabold tabular-nums text-amber-300">
                  {status?.limits.offlineLimits?.maxTotalValue ?? '\u2014'}
                </p>
                <p className="mt-1.5 text-[10px] uppercase tracking-widest text-white/40">{t('limitsValue')}</p>
              </div>
            </div>
            <p className="mt-3.5 text-[11px] text-white/30">{t('encryptionNote')}</p>
            <p className="mt-2 text-[11px] text-amber-400/60 flex items-center gap-1.5">
              <AlertTriangle size={11} className="shrink-0" />
              {t('riskWarning')}
            </p>
          </Card>

          {/* PIN security card */}
          <Card padding="lg" className="border-l-2 border-l-emerald-400">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <Lock size={18} className="text-emerald-400" />
              </div>
              <h3 className="text-sm font-bold text-[color:var(--foreground)] tracking-wide">{t('pinTitle')}</h3>
            </div>
            <p className="text-xs text-white/40 mb-4">{t('pinOptional')}</p>
            <div className="space-y-4">
              <div className="max-w-xs mx-auto">
                <TextInput
                  label={t('pinLabel')}
                  type="password"
                  value={pinInput}
                  onChange={(event) => setPinInput(event.target.value)}
                  placeholder={t('pinPlaceholder')}
                  className="focus-within:ring-emerald-500/30 focus-within:border-emerald-500/50"
                />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!pinInput) return;
                    setIsPinSaving(true);
                    await setOfflinePin(pinInput);
                    setPinRequired(true);
                    setPinInput('');
                    setMessage({ action: 'sync', outcome: 'info', message: t('pinSet') });
                    setIsPinSaving(false);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={isPinSaving || !pinInput || !canWrite}
                  title={!canWrite ? noAccess('title') : undefined}
                >
                  {isPinSaving ? <Spinner size="xs" variant="grid" /> : <Lock size={14} />}
                  {isPinSaving ? t('saving') : t('enablePin')}
                </button>
                {pinRequired ? (
                  <button
                    type="button"
                    onClick={async () => {
                      setIsPinClearing(true);
                      await clearOfflinePin();
                      setPinRequired(false);
                      setMessage({ action: 'sync', outcome: 'success', message: t('pinCleared') });
                      setIsPinClearing(false);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20 hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={isPinClearing || !canWrite}
                    title={!canWrite ? noAccess('title') : undefined}
                  >
                    {isPinClearing ? <Spinner size="xs" variant="pulse" /> : <Unlock size={14} />}
                    {isPinClearing ? t('clearing') : t('clearPin')}
                  </button>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Receipt history ──────────────────────────────────────────────────── */}
      <Card padding="lg" className="border-l-2 border-l-purple-400">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
            <Receipt size={18} className="text-purple-400" />
          </div>
          <h3 className="text-sm font-bold text-[color:var(--foreground)] tracking-wide">{t('receiptsTitle')}</h3>
          {receiptHistory.length > 0 ? (
            <span className="ml-auto text-[11px] font-bold text-purple-300 bg-purple-500/10 rounded-full px-3 py-1 tabular-nums border border-purple-500/20">
              {receiptHistory.length}
            </span>
          ) : null}
        </div>
        {receiptHistory.length === 0 ? (
          <EmptyState
            icon={
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10 mx-auto">
                <Receipt size={28} className="text-purple-400" />
              </div>
            }
            title={t('noReceiptsTitle')}
            description={t('noReceiptsDescription')}
          />
        ) : (
          <div className="space-y-2">
            {receiptHistory.map((receipt, index) => (
              <div
                key={`${receipt.syncedAt}-${index}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-purple-500/10 bg-gradient-to-r from-purple-500/5 to-transparent px-4 py-3.5 text-xs transition-colors hover:border-purple-500/25"
              >
                <span className="font-mono text-white/50 tabular-nums tracking-wide">
                  {receipt.localReceiptNumber ?? '\u2014'}
                </span>
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-purple-500/10">
                  <ArrowRightLeft size={11} className="text-purple-400" />
                </div>
                <span className="font-mono font-semibold text-[color:var(--foreground)] tabular-nums tracking-wide">
                  {receipt.receiptNumber ?? '\u2014'}
                </span>
                <CheckCircle2 size={13} className="text-emerald-400 ml-1" />
                <span className="ml-auto text-[11px] text-white/30">
                  {formatDateTime(receipt.syncedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
