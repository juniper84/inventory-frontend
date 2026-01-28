'use client';

import { useEffect, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken, getOrCreateDeviceId, getStoredUser } from '@/lib/auth';
import {
  clearOfflinePin,
  clearOfflineData,
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
import { StatusBanner } from '@/components/StatusBanner';
import { getPermissionSet } from '@/lib/permissions';

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

export default function OfflinePage() {
  const t = useTranslations('offlinePage');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('offline.write');
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
  const [message, setMessage] = useToastState();
  const [receiptHistory, setReceiptHistory] = useState<
    { localReceiptNumber?: string | null; receiptNumber?: string | null; syncedAt: string }[]
  >([]);
  const deviceId = getOrCreateDeviceId();
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';

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

  const registerDevice = async () => {
    const token = getAccessToken();
    const user = getStoredUser();
    if (!token || !user) {
      return;
    }
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
    if (!token || !user) {
      return;
    }
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

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
      <p className="text-sm text-gold-300">
        {t('subtitle')}
      </p>
      {message ? <StatusBanner message={message} /> : null}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4 command-card p-6 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('deviceTitle')}</h3>
          <div className="text-sm text-gold-300">
            <p>{t('deviceId', { id: deviceId })}</p>
            <p>
              {t('deviceStatus')}: {status?.device?.status ?? t('notRegistered')}
            </p>
            <p>{t('lastSync', { value: lastSyncAt ?? t('never') })}</p>
            <p>{t('pendingActions', { count: pendingCount })}</p>
            {queueStats ? (
              <p>
                {t('queueUsage', {
                  count: queueStats.count,
                  maxItems: queueStats.maxItems,
                  size: Math.round(queueStats.bytes / 1024),
                  maxSize: Math.round(queueStats.maxBytes / 1024),
                })}
              </p>
            ) : null}
            {syncBlocked ? (
              <p className="text-red-300">{t('syncBlocked')}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              placeholder={t('deviceNamePlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
            />
            <button
              type="button"
              onClick={registerDevice}
              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isRegistering || !canWrite}
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isRegistering ? <Spinner size="xs" variant="dots" /> : null}
              {isRegistering ? t('registering') : t('registerDevice')}
            </button>
            <button
              type="button"
              onClick={syncNow}
              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSyncing || !canWrite}
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isSyncing ? <Spinner size="xs" variant="orbit" /> : null}
              {isSyncing ? t('syncing') : t('syncNow')}
            </button>
            <Link
              href={`/${locale}/offline/conflicts`}
              className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
            >
              {t('viewConflicts')}
            </Link>
            {status?.device?.status === 'ACTIVE' ? (
              <button
                type="button"
                onClick={revokeDevice}
                className="inline-flex items-center gap-2 rounded border border-red-700/50 px-3 py-2 text-xs text-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isRevoking || !canWrite}
                title={!canWrite ? noAccess('title') : undefined}
              >
                {isRevoking ? <Spinner size="xs" variant="pulse" /> : null}
                {isRevoking ? t('revoking') : t('revokeDevice')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 command-card p-6 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('safeguards')}</h3>
          <div className="text-sm text-gold-300 space-y-2">
            <p>
              {t('limits', {
                hours: status?.limits.offlineLimits?.maxDurationHours ?? '—',
                transactions: status?.limits.offlineLimits?.maxSalesCount ?? '—',
                value: status?.limits.offlineLimits?.maxTotalValue ?? '—',
              })}
            </p>
            <p>{t('encryptionNote')}</p>
            <p className="text-red-200">
              {t('riskWarning')}
            </p>
          </div>
          <div className="rounded border border-gold-700/40 bg-black/70 p-4">
            <p className="text-sm text-gold-200">
              {t('pinOptional')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="password"
                value={pinInput}
                onChange={(event) => setPinInput(event.target.value)}
                placeholder={t('pinPlaceholder')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!pinInput) {
                    return;
                  }
                  setIsPinSaving(true);
                  await setOfflinePin(pinInput);
                  setPinRequired(true);
                  setPinInput('');
                  setMessage({ action: 'sync', outcome: 'info', message: t('pinSet') });
                  setIsPinSaving(false);
                }}
                className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isPinSaving || !canWrite}
                title={!canWrite ? noAccess('title') : undefined}
              >
                {isPinSaving ? <Spinner size="xs" variant="grid" /> : null}
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
                  className="inline-flex items-center gap-2 rounded border border-red-700/50 px-3 py-2 text-xs text-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isPinClearing || !canWrite}
                  title={!canWrite ? noAccess('title') : undefined}
                >
                  {isPinClearing ? <Spinner size="xs" variant="pulse" /> : null}
                  {isPinClearing ? t('clearing') : t('clearPin')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="command-card p-6 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('receiptsTitle')}</h3>
        {receiptHistory.length === 0 ? (
          <StatusBanner message={t('noReceipts')} />
        ) : (
          <div className="mt-3 space-y-2 text-sm text-gold-200">
            {receiptHistory.map((receipt, index) => (
              <div key={`${receipt.syncedAt}-${index}`} className="flex flex-wrap gap-2">
                <span>{t('receiptLocal', { id: receipt.localReceiptNumber ?? '—' })}</span>
                <span>{t('receiptFinal', { id: receipt.receiptNumber ?? '—' })}</span>
                <span className="text-gold-400">{receipt.syncedAt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
