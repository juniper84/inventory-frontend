'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { promptAction } from '@/lib/app-notifications';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import { formatEntityLabel } from '@/lib/display';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type Approval = {
  id: string;
  actionType: string;
  status: string;
  requestedByUserId: string;
  requestedByName?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  reason?: string | null;
  requestedAt: string;
  amount?: number | string | null;
  percent?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

export default function ApprovalsPage() {
  const t = useTranslations('approvalsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canApprove = permissions.has('approvals.write');
  const [isLoading, setIsLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<Record<string, string>>({});
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const [total, setTotal] = useState<number | null>(null);
  const [message, setMessage] = useToastState();
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: 'PENDING',
    actionType: '',
    from: '',
    to: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const statusOptions = useMemo(
    () => [
      { value: 'PENDING', label: common('statusPending') },
      { value: 'APPROVED', label: common('statusApproved') },
      { value: 'REJECTED', label: common('statusRejected') },
      { value: 'EXPIRED', label: common('statusExpired') },
    ],
    [common],
  );

  const actionOptions = useMemo(
    () => [
      { value: '', label: common('allTypes') },
      { value: 'STOCK_ADJUSTMENT', label: t('actionStockAdjustment') },
      { value: 'STOCK_COUNT', label: t('actionStockCount') },
      { value: 'REFUND', label: t('actionRefund') },
      { value: 'DISCOUNT', label: t('actionDiscount') },
      { value: 'TRANSFER', label: t('actionTransfer') },
      { value: 'PURCHASE', label: t('actionPurchase') },
    ],
    [common, t],
  );

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

  const formatApprovalQuantity = (approval: Approval) => {
    const metaQuantity = approval.metadata?.quantity;
    const resolveNumber = (value: unknown) => {
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? null : parsed;
      }
      return null;
    };
    const numeric =
      resolveNumber(metaQuantity) ?? resolveNumber(approval.amount) ?? null;
    if (numeric === null || Number.isNaN(numeric)) {
      return null;
    }
    const sign =
      approval.metadata?.type === 'NEGATIVE'
        ? '-'
        : approval.metadata?.type === 'POSITIVE'
          ? '+'
          : '';
    return `${sign}${numeric.toLocaleString()}`;
  };

  const load = async (
    nextStatus: string,
    targetPage = 1,
    nextPageSize?: number,
  ) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    const effectivePageSize = nextPageSize ?? pageSize;
    const cursor =
      targetPage === 1 ? null : pageCursors[targetPage] ?? null;
    try {
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        status: nextStatus || undefined,
        actionType: filters.actionType || undefined,
        search: filters.search || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const data = await apiFetch<PaginatedResponse<Approval> | Approval[]>(
        `/approvals${query}`,
        { token },
      );
      const result = normalizePaginated(data);
      setApprovals(result.items);
      setNextCursor(result.nextCursor);
      if (typeof result.total === 'number') {
        setTotal(result.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (result.nextCursor) {
          nextState[targetPage + 1] = result.nextCursor;
        }
        return nextState;
      });
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(filters.status, 1);
  }, [
    filters.status,
    filters.actionType,
    filters.search,
    filters.from,
    filters.to,
  ]);

  const approve = async (approvalId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setActionBusy((prev) => ({ ...prev, [approvalId]: 'approve' }));
    try {
      await apiFetch(`/approvals/${approvalId}/approve`, {
        token,
        method: 'POST',
      });
      setMessage({ action: 'approve', outcome: 'success', message: t('statusApproved') });
      await load(filters.status);
    } catch (err) {
      setMessage({
        action: 'approve',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      setActionBusy((prev) => {
        const next = { ...prev };
        delete next[approvalId];
        return next;
      });
    }
  };

  const reject = async (approvalId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const reason =
      (await promptAction({
        title: t('rejectTitle'),
        message: t('rejectPrompt'),
        confirmText: t('rejectAction'),
        cancelText: common('cancel'),
        placeholder: t('reasonPlaceholder'),
      })) || '';
    setActionBusy((prev) => ({ ...prev, [approvalId]: 'reject' }));
    try {
      await apiFetch(`/approvals/${approvalId}/reject`, {
        token,
        method: 'POST',
        body: JSON.stringify({ reason: reason || undefined }),
      });
      setMessage({ action: 'reject', outcome: 'success', message: t('statusRejected') });
      await load(filters.status);
    } catch (err) {
      setMessage({
        action: 'reject',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      setActionBusy((prev) => {
        const next = { ...prev };
        delete next[approvalId];
        return next;
      });
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
            {t('title')}
          </h2>
          <p className="text-sm text-[color:var(--muted)]">{t('subtitle')}</p>
        </div>
        <ViewToggle
          value={viewMode}
          onChange={setViewMode}
          labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
        />
      </div>
      {message ? <StatusBanner message={message} /> : null}
      <ListFilters
        searchValue={searchDraft}
        onSearchChange={setSearchDraft}
        onSearchSubmit={() => pushFilters({ search: searchDraft })}
        onReset={() => resetFilters()}
        isLoading={isLoading}
        showAdvanced={showAdvanced}
        onToggleAdvanced={() => setShowAdvanced((prev) => !prev)}
      >
        <SmartSelect
          value={filters.status}
          onChange={(value) => pushFilters({ status: value })}
          options={statusOptions}
          placeholder={common('status')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.actionType}
          onChange={(value) => pushFilters({ actionType: value })}
          options={actionOptions}
          placeholder={t('actionType')}
          className="nvi-select-container"
        />
        <DatePickerInput
          value={filters.from}
          onChange={(value) => pushFilters({ from: value })}
          placeholder={common('fromDate')}
          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <DatePickerInput
          value={filters.to}
          onChange={(value) => pushFilters({ to: value })}
          placeholder={common('toDate')}
          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
      </ListFilters>

      <div className="command-card p-4 space-y-3 nvi-reveal">
        {viewMode === 'table' ? (
          approvals.length === 0 ? (
            <StatusBanner message={t('noApprovals')} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('actionType')}</th>
                    <th className="px-3 py-2">{t('targetLabel')}</th>
                    <th className="px-3 py-2">{t('statusLabel')}</th>
                    <th className="px-3 py-2">{t('requestedByLabel')}</th>
                    <th className="px-3 py-2">{t('amountLabel')}</th>
                    <th className="px-3 py-2">{t('createdAt')}</th>
                    <th className="px-3 py-2">{t('actionsLabel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((approval) => (
                    <tr key={approval.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2 font-semibold">{approval.actionType}</td>
                      <td className="px-3 py-2">
                        {approval.targetType || t('targetFallback')} ·{' '}
                        {formatEntityLabel(
                          { name: approval.targetName ?? null, id: approval.targetId ?? null },
                          t('targetFallback'),
                        )}
                      </td>
                      <td className="px-3 py-2">{approval.status}</td>
                      <td className="px-3 py-2">
                        {formatEntityLabel(
                          {
                            name: approval.requestedByName ?? null,
                            id: approval.requestedByUserId,
                          },
                          common('unknown'),
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {formatApprovalQuantity(approval) ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {new Date(approval.requestedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {approval.status === 'PENDING' ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => approve(approval.id)}
                              className="inline-flex items-center gap-2 rounded bg-gold-500 px-3 py-1 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
                              disabled={!canApprove || actionBusy[approval.id] === 'approve'}
                              title={!canApprove ? noAccess('title') : undefined}
                            >
                              {actionBusy[approval.id] === 'approve' ? (
                                <Spinner size="xs" variant="pulse" />
                              ) : null}
                              {actionBusy[approval.id] === 'approve'
                                ? t('approving')
                                : actions('approve')}
                            </button>
                            <button
                              onClick={() => reject(approval.id)}
                              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                              disabled={!canApprove || actionBusy[approval.id] === 'reject'}
                              title={!canApprove ? noAccess('title') : undefined}
                            >
                              {actionBusy[approval.id] === 'reject' ? (
                                <Spinner size="xs" variant="dots" />
                              ) : null}
                              {actionBusy[approval.id] === 'reject'
                                ? t('rejecting')
                                : actions('reject')}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gold-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : approvals.length === 0 ? (
          <StatusBanner message={t('noApprovals')} />
        ) : (
          <div className="space-y-3 nvi-stagger">
          {approvals.map((approval) => (
            <div
              key={approval.id}
              className="command-card p-4 space-y-2 nvi-reveal"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-gold-100">{approval.actionType}</p>
                  <p className="text-xs text-gold-400">
                    {approval.targetType || t('targetFallback')} ·{' '}
                    {formatEntityLabel(
                      { name: approval.targetName ?? null, id: approval.targetId ?? null },
                      t('targetFallback'),
                    )}
                  </p>
                </div>
                <p className="text-xs text-gold-400">{approval.status}</p>
              </div>
              {approval.reason ? (
                <p className="text-xs text-gold-300">
                  {t('reason')}: {approval.reason}
                </p>
              ) : null}
              {formatApprovalQuantity(approval) ? (
                <p className="text-xs text-gold-300">
                  {t('amountLabel')}: {formatApprovalQuantity(approval)}
                </p>
              ) : null}
              <p className="text-xs text-gold-500">
                {t('requestedBy', {
                  userId: formatEntityLabel(
                    {
                      name: approval.requestedByName ?? null,
                      id: approval.requestedByUserId,
                    },
                    common('unknown'),
                  ),
                  date: new Date(approval.requestedAt).toLocaleString(),
                })}
              </p>
              {approval.status === 'PENDING' ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => approve(approval.id)}
                    className="inline-flex items-center gap-2 rounded bg-gold-500 px-3 py-1 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={!canApprove || actionBusy[approval.id] === 'approve'}
                    title={!canApprove ? noAccess('title') : undefined}
                  >
                    {actionBusy[approval.id] === 'approve' ? (
                      <Spinner size="xs" variant="pulse" />
                    ) : null}
                    {actionBusy[approval.id] === 'approve'
                      ? t('approving')
                      : actions('approve')}
                  </button>
                  <button
                    onClick={() => reject(approval.id)}
                    className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={!canApprove || actionBusy[approval.id] === 'reject'}
                    title={!canApprove ? noAccess('title') : undefined}
                  >
                    {actionBusy[approval.id] === 'reject' ? (
                      <Spinner size="xs" variant="dots" />
                    ) : null}
                    {actionBusy[approval.id] === 'reject'
                      ? t('rejecting')
                      : actions('reject')}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          </div>
        )}
      </div>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        itemCount={approvals.length}
        availablePages={Object.keys(pageCursors).map(Number)}
        hasNext={Boolean(nextCursor)}
        hasPrev={page > 1}
        isLoading={isLoading}
        onPageChange={(nextPage) => load(filters.status, nextPage)}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
          setPageCursors({ 1: null });
          setTotal(null);
          load(filters.status, 1, size);
        }}
      />
    </section>
  );
}
