'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken, getOrCreateDeviceId } from '@/lib/auth';
import { notify } from '@/components/notifications/NotificationProvider';
import { Banner } from '@/components/notifications/Banner';
import { Spinner } from '@/components/Spinner';
import {
  Card,
  Icon,
  ListPage,
} from '@/components/ui';
import type { IconName } from '@/components/ui';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatEnum } from '@/lib/format-enum';
import { getPermissionSet } from '@/lib/permissions';
import { useFormatDate } from '@/lib/business-context';
import { FlipCounter } from '@/components/analog';

type Conflict = {
  id: string;
  actionType: string;
  status: string;
  conflictReason?: string | null;
  conflictPayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
  createdAt: string;
};

/* ─── Conflict reason color mapping ─── */
const REASON_THEME: Record<string, {
  color: string;
  bg: string;
  border: string;
  icon: IconName;
  pillBg: string;
  pillText: string;
  btnBg: string;
  btnText: string;
  btnBorder: string;
}> = {
  APPROVAL_REQUIRED: {
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-l-purple-500',
    icon: 'Shield',
    pillBg: 'bg-purple-500/15',
    pillText: 'text-purple-300',
    btnBg: 'bg-purple-500/10',
    btnText: 'text-purple-400',
    btnBorder: 'border-purple-500/30',
  },
  PRICE_VARIANCE: {
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-l-red-500',
    icon: 'DollarSign',
    pillBg: 'bg-red-500/15',
    pillText: 'text-red-300',
    btnBg: 'bg-red-500/10',
    btnText: 'text-red-400',
    btnBorder: 'border-red-500/30',
  },
  VAT_CHANGED: {
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-l-blue-500',
    icon: 'Receipt',
    pillBg: 'bg-blue-500/15',
    pillText: 'text-blue-300',
    btnBg: 'bg-blue-500/10',
    btnText: 'text-blue-400',
    btnBorder: 'border-blue-500/30',
  },
};

const DEFAULT_THEME = {
  color: 'text-white/50',
  bg: 'bg-white/[0.04]',
  border: 'border-l-white/20',
  icon: 'TriangleAlert' as IconName,
  pillBg: 'bg-white/[0.06]',
  pillText: 'text-white/60',
  btnBg: 'bg-white/[0.06]',
  btnText: 'text-white/60',
  btnBorder: 'border-white/10',
};

/* ─── Resolution button config ─── */
const RESOLUTION_ICONS: Record<string, IconName> = {
  SYNC_APPROVAL: 'CircleCheck',
  OVERRIDE_PRICE: 'DollarSign',
  RETRY: 'RefreshCw',
  DISMISS: 'X',
};

export default function OfflineConflictsPage() {
  const t = useTranslations('offlineConflictsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const { formatDateTime } = useFormatDate();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('offline.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolvingAction, setResolvingAction] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{ message: string; severity: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const actionTypeLabels: Record<string, string> = useMemo(() => ({
    SALE_COMPLETE: t('actionTypeSaleComplete'),
    PURCHASE_DRAFT: t('actionTypePurchaseDraft'),
    STOCK_ADJUSTMENT: t('actionTypeStockAdjustment'),
  }), [t]);

  const conflictReasonLabels: Record<string, string> = useMemo(() => ({
    APPROVAL_REQUIRED: t('reasonApprovalRequired'),
    PRICE_VARIANCE: t('reasonPriceVariance'),
    VAT_CHANGED: t('reasonVatChanged'),
  }), [t]);

  /* ─── KPI computed values ─── */
  const approvalConflicts = useMemo(
    () => conflicts.filter((c) => c.conflictReason === 'APPROVAL_REQUIRED').length,
    [conflicts],
  );
  const priceConflicts = useMemo(
    () => conflicts.filter((c) => c.conflictReason === 'PRICE_VARIANCE').length,
    [conflicts],
  );
  const resolvedCount = useMemo(
    () => conflicts.filter((c) => c.status === 'APPLIED' || c.status === 'REJECTED').length,
    [conflicts],
  );

  /* ─── Data loading ─── */
  const load = useCallback(async (cursor?: string, append = false) => {
    const token = getAccessToken();
    const deviceId = getOrCreateDeviceId();
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    if (!token || !navigator.onLine) {
      setBannerMsg({ message: t('connectOnline'), severity: 'info' });
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
      notify.error(getApiErrorMessage(err, t('loadFailed')));
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  /* ─── Conflict resolution ─── */
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
      const msg =
        resolution === 'DISMISS'
          ? t('dismissed')
          : resolution === 'OVERRIDE_PRICE'
            ? t('overrideApplied')
            : resolution === 'SYNC_APPROVAL'
              ? t('syncedApproval')
              : t('retried');
      notify.success(msg);
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('resolveFailed')));
    } finally {
      setResolvingId(null);
      setResolvingAction(null);
    }
  };

  /* ─── Resolution options per reason ─── */
  const getResolutionOptions = (reason?: string | null) => {
    if (reason === 'VAT_CHANGED') {
      return [{ key: 'DISMISS', label: t('dismiss') }];
    }
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

  /* ═══════════════════════════════════════════════════════ */
  /* KPI STRIP — Horizontal colored icon containers        */
  /* ═══════════════════════════════════════════════════════ */
  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      {/* Total conflicts */}
      <Card padding="md" as="article">
        <div className="flex items-center gap-3">
          <div className="nvi-kpi-icon nvi-kpi-icon--amber shrink-0">
            <Icon name="TriangleAlert" size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-white/40">{t('kpiOpenConflicts')}</p>
            <div className="mt-0.5 text-2xl font-bold text-amber-400">
              <FlipCounter value={conflicts.length} digits={4} size="md" />
            </div>
          </div>
        </div>
      </Card>

      {/* Approval blocks */}
      <Card padding="md" as="article">
        <div className="flex items-center gap-3">
          <div className="nvi-kpi-icon nvi-kpi-icon--purple shrink-0">
            <Icon name="Shield" size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-white/40">{t('kpiApprovalBlocks')}</p>
            <div className="mt-0.5 text-2xl font-bold text-purple-400">
              <FlipCounter value={approvalConflicts} digits={4} size="md" />
            </div>
          </div>
        </div>
      </Card>

      {/* Price variance */}
      <Card padding="md" as="article">
        <div className="flex items-center gap-3">
          <div className="nvi-kpi-icon nvi-kpi-icon--red shrink-0">
            <Icon name="DollarSign" size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-white/40">{t('kpiPriceVariance')}</p>
            <div className="mt-0.5 text-2xl font-bold text-red-400">
              <FlipCounter value={priceConflicts} digits={4} size="md" />
            </div>
          </div>
        </div>
      </Card>

      {/* Resolved */}
      <Card padding="md" as="article">
        <div className="flex items-center gap-3">
          <div className="nvi-kpi-icon nvi-kpi-icon--emerald shrink-0">
            <Icon name="CircleCheck" size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-white/40">{t('kpiResolved')}</p>
            <div className="mt-0.5 text-2xl font-bold text-emerald-400">
              <FlipCounter value={resolvedCount} digits={4} size="md" />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );

  /* ═══════════════════════════════════════════════════════ */
  /* CONFLICT CARDS — Problem cards with colored zones     */
  /* ═══════════════════════════════════════════════════════ */
  const cardView = (
    <div className="grid gap-4 md:grid-cols-2 nvi-stagger">
      {conflicts.map((conflict) => {
        const theme = REASON_THEME[conflict.conflictReason ?? ''] ?? DEFAULT_THEME;
        const reasonLabel = conflict.conflictReason
          ? formatEnum(conflictReasonLabels, conflict.conflictReason)
          : common('unknown');

        return (
          <Card
            key={conflict.id}
            as="article"
            className={`nvi-card-hover border-l-4 ${theme.border} space-y-4`}
          >
            {/* Header: type icon container + reason badge + action type */}
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${theme.bg}`}>
                <Icon name={theme.icon} size={18} className={theme.color} />
              </div>
              <div className="min-w-0 flex-1">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${theme.pillBg} ${theme.pillText}`}>
                  {reasonLabel}
                </span>
                <p className="mt-1 text-xs text-white/40">
                  {formatEnum(actionTypeLabels, conflict.actionType)}
                </p>
              </div>
            </div>

            {/* Error message — contained block */}
            {conflict.errorMessage ? (
              <div className="rounded-lg bg-white/[0.03] p-2">
                <p className="text-xs leading-relaxed text-white/50">
                  {conflict.errorMessage}
                </p>
              </div>
            ) : null}

            {/* VAT changed hint */}
            {conflict.conflictReason === 'VAT_CHANGED' ? (
              <div className="rounded-lg bg-blue-500/[0.05] p-2">
                <p className="text-xs text-blue-300/80 leading-relaxed">
                  {t('vatChanged')}
                </p>
              </div>
            ) : null}

            {/* Approval ID reference */}
            {conflict.conflictPayload &&
            typeof conflict.conflictPayload['approvalId'] === 'string' ? (
              <p className="font-mono text-[11px] text-white/30">
                {t('approvalId', { value: conflict.conflictPayload['approvalId'] })}
              </p>
            ) : null}

            {/* Timestamp */}
            <div className="flex items-center gap-1.5 text-[11px] text-white/30">
              <Icon name="Clock" size={12} className="text-white/20" />
              <span>{formatDateTime(conflict.createdAt)}</span>
            </div>

            {/* Resolution buttons — colored per action */}
            <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
              {getResolutionOptions(conflict.conflictReason).map((option) => {
                const isBusy = resolvingId === conflict.id && resolvingAction === option.key;
                const isPrimary = option.key !== 'DISMISS' && option.key !== 'RETRY';

                /* Primary: filled with the conflict type's color */
                /* Retry: blue tinted */
                /* Dismiss: muted ghost */
                const btnClass = isPrimary
                  ? `inline-flex items-center gap-1.5 rounded-lg border ${theme.btnBorder} ${theme.btnBg} px-3 py-1.5 text-xs font-semibold ${theme.btnText} hover:brightness-125 transition-all disabled:cursor-not-allowed disabled:opacity-50`
                  : option.key === 'RETRY'
                    ? 'inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-50'
                    : 'inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-white/50 hover:bg-white/[0.08] hover:text-white/70 transition-all disabled:cursor-not-allowed disabled:opacity-50';

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => resolveConflict(conflict.id, option.key)}
                    className={btnClass}
                    disabled={resolvingId === conflict.id || !canWrite}
                    title={!canWrite ? noAccess('title') : undefined}
                  >
                    {isBusy ? (
                      <Spinner size="xs" variant="dots" />
                    ) : (
                      <Icon name={RESOLUTION_ICONS[option.key] ?? 'Circle'} size={12} />
                    )}
                    {isBusy ? t('resolving') : option.label}
                  </button>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );

  /* ═══════════════════════════════════════════════════════ */
  /* LOAD MORE                                             */
  /* ═══════════════════════════════════════════════════════ */
  const loadMoreBlock = nextCursor ? (
    <div className="flex justify-center pt-2">
      <button
        type="button"
        onClick={() => load(nextCursor, true)}
        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-medium text-white/60 hover:bg-white/[0.08] hover:text-white/80 transition-all disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isLoadingMore}
      >
        {isLoadingMore ? <Spinner size="xs" variant="grid" /> : null}
        {isLoadingMore ? actions('loading') : actions('loadMore')}
      </button>
    </div>
  ) : null;

  /* ═══════════════════════════════════════════════════════ */
  /* RENDER                                                */
  /* ═══════════════════════════════════════════════════════ */
  return (
    <ListPage
      eyebrow={t('eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      badges={
        <>
          <span className="nvi-badge">{t('badgeOfflineRecovery')}</span>
          <span className="nvi-badge">{t('badgeActionRequired')}</span>
        </>
      }
      banner={bannerMsg ? <Banner message={bannerMsg.message} severity={bannerMsg.severity} onDismiss={() => setBannerMsg(null)} /> : null}
      kpis={kpiStrip}
      isLoading={isLoading}
      isEmpty={conflicts.length === 0}
      emptyIcon={
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
          <Icon name="CircleCheck" size={28} className="text-emerald-400" />
        </div>
      }
      emptyTitle={t('emptyTitle')}
      emptyDescription={t('emptyDescription')}
      viewMode="cards"
      cards={
        <>
          {cardView}
          {loadMoreBlock}
        </>
      }
      table={null}
    />
  );
}
