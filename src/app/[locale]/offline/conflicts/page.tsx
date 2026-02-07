'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken, getOrCreateDeviceId } from '@/lib/auth';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

type Conflict = {
  id: string;
  actionType: string;
  status: string;
  conflictReason?: string | null;
  conflictPayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
  createdAt: string;
};

export default function OfflineConflictsPage() {
  const t = useTranslations('offlineConflictsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('offline.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolvingAction, setResolvingAction] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [message, setMessage] = useToastState();
  const approvalConflicts = useMemo(
    () => conflicts.filter((conflict) => conflict.conflictReason === 'APPROVAL_REQUIRED').length,
    [conflicts],
  );
  const priceConflicts = useMemo(
    () => conflicts.filter((conflict) => conflict.conflictReason === 'PRICE_VARIANCE').length,
    [conflicts],
  );

  const load = async (cursor?: string, append = false) => {
    const token = getAccessToken();
    const deviceId = getOrCreateDeviceId();
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    if (!token || !navigator.onLine) {
      setMessage({ action: 'save', outcome: 'info', message: t('connectOnline') });
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
      return;
    }
    try {
      const query = buildCursorQuery({ limit: 20, cursor, deviceId });
      const data = await apiFetch<PaginatedResponse<Conflict> | Conflict[]>(
        `/offline/conflicts${query}`,
        { token },
      );
      const result = normalizePaginated(data);
      setConflicts((prev) =>
        append ? [...prev, ...result.items] : result.items,
      );
      setNextCursor(result.nextCursor);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resolveConflict = async (actionId: string, resolution: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setResolvingId(actionId);
    setResolvingAction(resolution);
    try {
      const updated = await apiFetch<Conflict>('/offline/conflicts/resolve', {
        token,
        method: 'POST',
        body: JSON.stringify({ actionId, resolution }),
      });
      setConflicts((prev) => {
        if (updated.status === 'CONFLICT') {
          return prev.map((conflict) => (conflict.id === actionId ? updated : conflict));
        }
        return prev.filter((conflict) => conflict.id !== actionId);
      });
      setMessage({
        action: 'update',
        outcome: 'success',
        message:
          resolution === 'DISMISS'
            ? t('dismissed')
            : resolution === 'OVERRIDE_PRICE'
              ? t('overrideApplied')
              : resolution === 'SYNC_APPROVAL'
                ? t('syncedApproval')
                : t('retried'),
      });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('resolveFailed')),
      });
    } finally {
      setResolvingId(null);
      setResolvingAction(null);
    }
  };

  const getResolutionOptions = (reason?: string | null) => {
    const options: Array<{ key: string; label: string }> = [
      { key: 'RETRY', label: t('retry') },
    ];
    if (reason === 'PRICE_VARIANCE') {
      options.unshift({ key: 'OVERRIDE_PRICE', label: t('overridePrice') });
    }
    if (reason === 'APPROVAL_REQUIRED') {
      options.unshift({ key: 'SYNC_APPROVAL', label: t('syncApproval') });
    }
    options.push({ key: 'DISMISS', label: t('dismiss') });
    return options;
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="space-y-4 nvi-reveal">
      <PremiumPageHeader
        eyebrow="CONFLICT CENTER"
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-badge">OFFLINE RECOVERY</span>
            <span className="nvi-badge">ACTION REQUIRED</span>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">OPEN CONFLICTS</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{conflicts.length}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">APPROVAL BLOCKS</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{approvalConflicts}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">PRICE VARIANCE</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{priceConflicts}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">NEXT PAGE</p>
          <p className="mt-2 text-lg font-semibold text-gold-100">{nextCursor ? 'YES' : 'NO'}</p>
        </article>
      </div>
      {message ? <StatusBanner message={message} /> : null}
      <div className="space-y-3">
        {conflicts.length === 0 ? (
          <StatusBanner message={t('empty')} />
        ) : (
          conflicts.map((conflict) => (
            <div
              key={conflict.id}
              className="rounded border border-red-600/40 bg-red-950/30 p-4 text-sm text-red-100"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{conflict.actionType}</span>
                <span className="text-xs text-red-200">{conflict.status}</span>
              </div>
              <p className="mt-2 text-xs text-red-200">
                {t('reason', { value: conflict.conflictReason ?? common('unknown') })}
              </p>
              {conflict.errorMessage ? (
                <p className="mt-1 text-xs text-red-300">{conflict.errorMessage}</p>
              ) : null}
              {conflict.conflictPayload &&
              typeof conflict.conflictPayload['approvalId'] === 'string' ? (
                <p className="mt-1 text-xs text-red-200">
                  {t('approvalId', { value: conflict.conflictPayload['approvalId'] })}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {getResolutionOptions(conflict.conflictReason).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => resolveConflict(conflict.id, option.key)}
                    className="inline-flex items-center gap-2 rounded border border-red-700/50 px-3 py-1 text-xs text-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={resolvingId === conflict.id || !canWrite}
                    title={!canWrite ? noAccess('title') : undefined}
                  >
                    {resolvingId === conflict.id &&
                    resolvingAction === option.key ? (
                      <Spinner size="xs" variant="dots" />
                    ) : null}
                    {resolvingId === conflict.id &&
                    resolvingAction === option.key
                      ? t('resolving')
                      : option.label}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      {nextCursor ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => load(nextCursor, true)}
            className="nvi-cta inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isLoadingMore}
          >
            {isLoadingMore ? <Spinner size="xs" variant="grid" /> : null}
            {isLoadingMore ? actions('loading') : actions('loadMore')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
