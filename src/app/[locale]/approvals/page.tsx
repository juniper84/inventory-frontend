'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { notify } from '@/components/notifications/NotificationProvider';
import { Banner } from '@/components/notifications/Banner';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import {
  StatusBadge,
  SortableTableHeader,
  Card,
  Icon,
  EmptyState,
  ListPage,
} from '@/components/ui';
import type { SortDirection } from '@/components/ui';
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

import { useFormatDate } from '@/lib/business-context';
import { FlipCounter } from '@/components/analog';
import type { IconName } from '@/components/ui';
import { ApprovalDelegateModal } from '@/components/approvals/ApprovalDelegateModal';

type Approval = {
  id: string;
  referenceNumber?: string | null;
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

type DelegateUser = { id: string; name: string; email: string };

/* ─── Type icon + color mapping ─── */
const ACTION_TYPE_ICONS: Record<string, { icon: IconName; color: string; bg: string }> = {
  STOCK_ADJUSTMENT: { icon: 'Package', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  STOCK_COUNT: { icon: 'ClipboardCheck', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  REFUND: { icon: 'RotateCcw', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  DISCOUNT: { icon: 'Percent', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  TRANSFER: { icon: 'Truck', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  PURCHASE: { icon: 'ShoppingCart', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
};

/* ─── Status urgency stripe colors ─── */
const STATUS_STRIPE: Record<string, string> = {
  PENDING: 'border-l-amber-400',
  APPROVED: 'border-l-emerald-400',
  REJECTED: 'border-l-red-400',
  EXPIRED: 'border-l-white/10',
  CANCELLED: 'border-l-white/10',
};

/* ─── Status dot colors for table view ─── */
const STATUS_DOT: Record<string, string> = {
  PENDING: 'bg-amber-400',
  APPROVED: 'bg-emerald-400',
  REJECTED: 'bg-red-400',
  EXPIRED: 'bg-[var(--nvi-text-muted)]',
  CANCELLED: 'bg-[var(--nvi-text-muted)]',
};

export default function ApprovalsPage() {
  const locale = useLocale();
  const { formatDateTime } = useFormatDate();
  const t = useTranslations('approvalsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canApprove = permissions.has('approvals.write');
  const [isLoading, setIsLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [delegatingId, setDelegatingId] = useState<string | null>(null);
  const [delegateUsers, setDelegateUsers] = useState<DelegateUser[]>([]);
  const [delegateBusy, setDelegateBusy] = useState(false);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [total, setTotal] = useState<number | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{ message: string; severity: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: 'PENDING',
    actionType: '',
    from: '',
    to: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);


  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
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

  const approvalStatusLabels = useMemo<Record<string, string>>(
    () => ({
      PENDING: common('statusPending'),
      APPROVED: common('statusApproved'),
      REJECTED: common('statusRejected'),
      CANCELLED: common('statusCancelled'),
    }),
    [common],
  );

  const approvalActionTypeLabels = useMemo<Record<string, string>>(
    () => ({
      STOCK_ADJUSTMENT: t('actionStockAdjustment'),
      STOCK_COUNT: t('actionStockCount'),
      REFUND: t('actionRefund'),
      DISCOUNT: t('actionDiscount'),
      TRANSFER: t('actionTransfer'),
      PURCHASE: t('actionPurchase'),
    }),
    [t],
  );

  const pendingCount = useMemo(
    () => approvals.filter((approval) => approval.status === 'PENDING').length,
    [approvals],
  );

  const approvedTodayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return approvals.filter(
      (a) => a.status === 'APPROVED' && a.requestedAt?.slice(0, 10) === today,
    ).length;
  }, [approvals]);

  const rejectedCount = useMemo(
    () => approvals.filter((a) => a.status === 'REJECTED').length,
    [approvals],
  );

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);



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
    return `${sign}${numeric.toLocaleString(locale)}`;
  };

  /* ─── Relative time helper ─── */
  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '<1m';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  const load = useCallback(async (
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
      targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
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
      setBannerMsg({
        message: getApiErrorMessage(err, t('loadFailed')),
        severity: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, filters.status, filters.actionType, filters.search, filters.from, filters.to, t]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(filters.status, 1);
  }, [load, filters.status]);

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
      notify.success(t('statusApproved'));
      await load(filters.status);
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('loadFailed')));
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
    const reason = await notify.prompt({
      title: t('rejectTitle'),
      message: t('rejectPrompt'),
      placeholder: t('reasonPlaceholder'),
    });
    if (reason === null) return;
    setActionBusy((prev) => ({ ...prev, [approvalId]: 'reject' }));
    try {
      await apiFetch(`/approvals/${approvalId}/reject`, {
        token,
        method: 'POST',
        body: JSON.stringify({ reason: reason || undefined }),
      });
      notify.success(t('statusRejected'));
      await load(filters.status);
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('loadFailed')));
    } finally {
      setActionBusy((prev) => {
        const next = { ...prev };
        delete next[approvalId];
        return next;
      });
    }
  };

  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.status === 'PENDING'),
    [approvals],
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const pendingIds = pendingApprovals.map((a) => a.id);
      const allSelected = pendingIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(pendingIds);
    });
  };

  const bulkApprove = async () => {
    const token = getAccessToken();
    if (!token || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await apiFetch('/approvals/bulk-approve', {
        token,
        method: 'POST',
        body: JSON.stringify({ approvalIds: Array.from(selectedIds) }),
      });
      notify.success(t('bulkApproveSuccess'));
      setSelectedIds(new Set());
      await load(filters.status);
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('bulkApproveFailed')));
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkReject = async () => {
    const token = getAccessToken();
    if (!token || selectedIds.size === 0) return;
    const reason = await notify.prompt({
      title: t('bulkRejectTitle'),
      message: t('bulkRejectPrompt'),
      placeholder: t('reasonPlaceholder'),
    });
    if (reason === null) return;
    setBulkBusy(true);
    try {
      await apiFetch('/approvals/bulk-reject', {
        token,
        method: 'POST',
        body: JSON.stringify({
          approvalIds: Array.from(selectedIds),
          reason: reason || undefined,
        }),
      });
      notify.success(t('bulkRejectSuccess'));
      setSelectedIds(new Set());
      await load(filters.status);
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('bulkRejectFailed')));
    } finally {
      setBulkBusy(false);
    }
  };

  const openDelegate = async (approvalId: string) => {
    setDelegatingId(approvalId);
    if (delegateUsers.length > 0) return;
    const token = getAccessToken();
    if (!token) return;
    try {
      const data = await apiFetch<PaginatedResponse<DelegateUser> | DelegateUser[]>('/users?limit=200', { token });
      setDelegateUsers(normalizePaginated(data).items);
    } catch {
      setDelegateUsers([]);
    }
  };

  const submitDelegate = async (approvalId: string, userId: string) => {
    const token = getAccessToken();
    if (!token) return;
    setDelegateBusy(true);
    try {
      await apiFetch(`/approvals/${approvalId}/delegate`, {
        token,
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      notify.success(t('delegated'));
      setDelegatingId(null);
      await load(filters.status);
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('delegateFailed')));
    } finally {
      setDelegateBusy(false);
    }
  };

  /* ─── Type badge helper ─── */
  const TypeBadge = ({ actionType }: { actionType: string }) => {
    const cfg = ACTION_TYPE_ICONS[actionType] ?? { icon: 'TriangleAlert' as IconName, color: 'text-[var(--nvi-text-muted)]', bg: 'bg-[var(--nvi-surface-alt)]' };
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 ${cfg.bg}`}>
        <Icon name={cfg.icon} size={13} className={cfg.color} />
        <span className={`text-[11px] font-semibold ${cfg.color}`}>
          {approvalActionTypeLabels[actionType] ?? actionType}
        </span>
      </div>
    );
  };

  /* ─── Action buttons (shared between card + table) ─── */
  const ActionButtons = ({ approval }: { approval: Approval }) => {
    if (approval.status !== 'PENDING') return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => approve(approval.id)}
          className="nvi-press nvi-decision-btn nvi-decision-approve"
          disabled={!canApprove || actionBusy[approval.id] === 'approve'}
          title={!canApprove ? noAccess('title') : undefined}
        >
          {actionBusy[approval.id] === 'approve' ? (
            <Spinner size="xs" variant="pulse" />
          ) : (
            <Icon name="CircleCheck" size={14} />
          )}
          {actionBusy[approval.id] === 'approve' ? t('approving') : actions('approve')}
        </button>
        <button
          type="button"
          onClick={() => reject(approval.id)}
          className="nvi-press nvi-decision-btn nvi-decision-reject"
          disabled={!canApprove || actionBusy[approval.id] === 'reject'}
          title={!canApprove ? noAccess('title') : undefined}
        >
          {actionBusy[approval.id] === 'reject' ? (
            <Spinner size="xs" variant="dots" />
          ) : (
            <Icon name="CircleX" size={14} />
          )}
          {actionBusy[approval.id] === 'reject' ? t('rejecting') : actions('reject')}
        </button>
        <button
          type="button"
          onClick={() => openDelegate(approval.id)}
          className="nvi-press nvi-decision-btn nvi-decision-delegate"
          disabled={!canApprove}
          title={!canApprove ? noAccess('title') : undefined}
        >
          <Icon name="Forward" size={14} />
          {t('delegate')}
        </button>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════ */
  /* KPI STRIP — Decision dashboard                        */
  /* ═══════════════════════════════════════════════════════ */
  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      {(
        [
          { icon: 'Clock' as const,       tone: 'amber' as const,   label: t('kpiPendingNow'),    value: pendingCount,            accent: 'text-amber-400'   },
          { icon: 'CircleCheck' as const, tone: 'emerald' as const, label: t('kpiApprovedToday'), value: approvedTodayCount,      accent: 'text-emerald-400' },
          { icon: 'CircleX' as const,     tone: 'red' as const,     label: t('kpiRejected'),      value: rejectedCount,           accent: 'text-red-400'     },
          { icon: 'ListTodo' as const,    tone: 'blue' as const,    label: t('kpiTotalQueue'),    value: total ?? approvals.length, accent: 'text-blue-400'  },
        ]
      ).map((k) => (
        <Card key={k.label} padding="md" as="article">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{k.label}</p>
              <div className={`mt-2 text-3xl font-bold ${k.accent}`}>
                <FlipCounter value={k.value} digits={4} size="md" />
              </div>
            </div>
            <div className={`nvi-kpi-icon nvi-kpi-icon--${k.tone}`}>
              <Icon name={k.icon} size={18} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  /* ═══════════════════════════════════════════════════════ */
  /* FILTER BAR                                            */
  /* ═══════════════════════════════════════════════════════ */
  const filterBar = (
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
        instanceId="approvals-filter-status"
        value={filters.status}
        onChange={(value) => pushFilters({ status: value })}
        options={statusOptions}
        placeholder={common('status')}
        className="nvi-select-container"
      />
      <SmartSelect
        instanceId="approvals-filter-type"
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
        className="rounded-xl border border-[var(--nvi-border)] bg-[var(--nvi-bg)] px-3 py-2 text-[var(--nvi-text)]"
      />
      <DatePickerInput
        value={filters.to}
        onChange={(value) => pushFilters({ to: value })}
        placeholder={common('toDate')}
        className="rounded-xl border border-[var(--nvi-border)] bg-[var(--nvi-bg)] px-3 py-2 text-[var(--nvi-text)]"
      />
    </ListFilters>
  );

  /* ═══════════════════════════════════════════════════════ */
  /* BULK ACTIONS BAR (beforeContent slot)                 */
  /* ═══════════════════════════════════════════════════════ */
  const bulkBar = selectedIds.size > 0 ? (
    <Card padding="sm" className="nvi-slide-in-bottom">
      <div className="flex flex-wrap items-center gap-3">
        <span className="nvi-pop inline-flex items-center gap-1.5 rounded-xl bg-[var(--nvi-accent)]/10 px-3 py-1.5 text-xs font-bold text-[var(--nvi-accent)]">
          <Icon name="SquareCheck" size={14} />
          {t('selected', { count: selectedIds.size })}
        </span>
        <button
          type="button"
          onClick={bulkApprove}
          disabled={bulkBusy || !canApprove}
          className="nvi-press nvi-decision-btn nvi-decision-approve"
        >
          {bulkBusy ? <Spinner size="xs" variant="pulse" /> : <Icon name="CircleCheck" size={14} />}
          {t('bulkApprove')}
        </button>
        <button
          type="button"
          onClick={bulkReject}
          disabled={bulkBusy || !canApprove}
          className="nvi-press nvi-decision-btn nvi-decision-reject"
        >
          {bulkBusy ? <Spinner size="xs" variant="dots" /> : <Icon name="CircleX" size={14} />}
          {t('bulkReject')}
        </button>
      </div>
    </Card>
  ) : null;

  /* ═══════════════════════════════════════════════════════ */
  /* TABLE VIEW                                            */
  /* ═══════════════════════════════════════════════════════ */
  const tableView = (
    <Card padding="sm">
      <div className="overflow-auto">
        <table className="min-w-[800px] w-full text-left text-sm text-[var(--nvi-text)]">
          <thead className="text-xs uppercase text-[var(--nvi-text-muted)]">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={pendingApprovals.length > 0 && pendingApprovals.every((a) => selectedIds.has(a.id))}
                  onChange={toggleSelectAll}
                  title={t('selectAll')}
                  className="accent-[var(--nvi-accent)]"
                />
              </th>
              <SortableTableHeader label={t('actionType')} sortKey="actionType" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
              <SortableTableHeader label={t('targetLabel')} sortKey="target" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
              <SortableTableHeader label={t('statusLabel')} sortKey="status" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
              <SortableTableHeader label={t('requestedByLabel')} sortKey="requestedBy" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
              <SortableTableHeader label={t('amountLabel')} sortKey="amount" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} align="right" />
              <SortableTableHeader label={t('createdAt')} sortKey="requestedAt" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
              <th className="px-3 py-2">{t('actionsLabel')}</th>
            </tr>
          </thead>
          <tbody>
            {approvals.map((approval) => (
              <tr key={approval.id} className="border-t border-[var(--nvi-border)] transition-colors hover:bg-[var(--nvi-surface-alt)]/50">
                <td className="px-3 py-2">
                  {approval.status === 'PENDING' ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(approval.id)}
                      onChange={() => toggleSelected(approval.id)}
                      className="accent-[var(--nvi-accent)]"
                    />
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <TypeBadge actionType={approval.actionType} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-0.5">
                    {approval.referenceNumber ? (
                      <span className="font-mono text-[11px] text-white/40">{approval.referenceNumber}</span>
                    ) : null}
                    <span className="text-xs">
                      {formatEntityLabel(
                        { name: approval.targetName ?? null, id: approval.targetId ?? null },
                        t('targetFallback'),
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${STATUS_DOT[approval.status] ?? 'bg-[var(--nvi-text-muted)]'}`} />
                    <span className={`text-xs ${approval.status !== 'PENDING' ? 'nvi-status-fade' : ''}`}>
                      {approvalStatusLabels[approval.status] ?? approval.status}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2 py-1 text-xs">
                    <Icon name="User" size={12} className="text-[var(--nvi-text-muted)]" />
                    {formatEntityLabel(
                      {
                        name: approval.requestedByName ?? null,
                        id: approval.requestedByUserId,
                      },
                      common('unknown'),
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs font-bold">
                  {formatApprovalQuantity(approval) ?? '\u2014'}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--nvi-text-muted)]">
                  {formatDateTime(approval.requestedAt)}
                </td>
                <td className="px-3 py-2">
                  <ActionButtons approval={approval} />
                  {approval.status !== 'PENDING' ? (
                    <span className="text-xs text-[var(--nvi-text-muted)]">\u2014</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  /* ═══════════════════════════════════════════════════════ */
  /* CARD VIEW — Decision cards                            */
  /* ═══════════════════════════════════════════════════════ */
  const cardView = (
    <div className="grid gap-4 md:grid-cols-2 nvi-stagger">
      {approvals.map((approval) => {
        const qty = formatApprovalQuantity(approval);
        const stripe = STATUS_STRIPE[approval.status] ?? 'border-l-[var(--nvi-border)]';

        return (
          <Card
            key={approval.id}
            as="article"
            className={`nvi-card-hover border-l-4 ${stripe} space-y-3`}
          >
            {/* Top row: type badge + status + checkbox */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {approval.status === 'PENDING' ? (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(approval.id)}
                    onChange={() => toggleSelected(approval.id)}
                    className="accent-[var(--nvi-accent)]"
                  />
                ) : null}
                <TypeBadge actionType={approval.actionType} />
              </div>
              <StatusBadge
                status={approval.status}
                label={approvalStatusLabels[approval.status]}
                size="xs"
                className={approval.status !== 'PENDING' ? 'nvi-status-fade' : ''}
              />
            </div>

            {/* Reference number */}
            {approval.referenceNumber ? (
              <p className="font-mono text-[11px] text-white/40">
                {approval.referenceNumber}
              </p>
            ) : null}

            {/* Hero number — the impact of this decision */}
            {qty ? (
              <p className="text-xl font-bold text-[var(--nvi-text)]">{qty}</p>
            ) : null}

            {/* Target */}
            <p className="text-xs text-[var(--nvi-text)]">
              {formatEntityLabel(
                { name: approval.targetName ?? null, id: approval.targetId ?? null },
                t('targetFallback'),
              )}
            </p>

            {/* Reason (if rejected) */}
            {approval.reason ? (
              <p className="text-[11px] italic text-[var(--nvi-text-muted)]">
                {t('reason')}: {approval.reason}
              </p>
            ) : null}

            {/* Requester + relative time */}
            <div className="flex items-center gap-2 text-[11px] text-[var(--nvi-text-muted)]">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2 py-1">
                <Icon name="User" size={12} />
                <span>
                  {formatEntityLabel(
                    {
                      name: approval.requestedByName ?? null,
                      id: approval.requestedByUserId,
                    },
                    common('unknown'),
                  )}
                </span>
              </span>
              <span className="ml-auto">{relativeTime(approval.requestedAt)}</span>
            </div>

            {/* Action buttons */}
            <ActionButtons approval={approval} />
          </Card>
        );
      })}
    </div>
  );

  /* ═══════════════════════════════════════════════════════ */
  /* PAGINATION                                            */
  /* ═══════════════════════════════════════════════════════ */
  const paginationBlock = (
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
  );

  /* ═══════════════════════════════════════════════════════ */
  /* RENDER                                                */
  /* ═══════════════════════════════════════════════════════ */
  const delegatingApproval = approvals.find((a) => a.id === delegatingId) ?? null;
  const delegateSummary = delegatingApproval
    ? `${approvalActionTypeLabels[delegatingApproval.actionType] ?? delegatingApproval.actionType}${delegatingApproval.targetName ? ` · ${delegatingApproval.targetName}` : ''}`
    : null;

  return (
    <>
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      eyebrow={t('eyebrow')}
      badges={
        <>
          <span className="nvi-badge">{t('badgeApprovals')}</span>
          <span className="nvi-badge">{t('badgeLive')}</span>
        </>
      }
      headerActions={
        <ViewToggle
          value={viewMode}
          onChange={setViewMode}
          labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
        />
      }
      isLoading={isLoading}
      banner={bannerMsg ? <Banner message={bannerMsg.message} severity={bannerMsg.severity} onDismiss={() => setBannerMsg(null)} /> : null}
      kpis={kpiStrip}
      filters={filterBar}
      beforeContent={bulkBar}
      viewMode={viewMode}
      table={tableView}
      cards={cardView}
      isEmpty={!approvals.length}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="CircleCheck" size={40} className="text-emerald-400/40" />
        </div>
      }
      emptyTitle={t('emptyTitle')}
      emptyDescription={t('emptyDescription')}
      pagination={paginationBlock}
    />

    <ApprovalDelegateModal
      open={Boolean(delegatingId)}
      onClose={() => setDelegatingId(null)}
      approvalId={delegatingId}
      approvalSummary={delegateSummary}
      users={delegateUsers}
      isBusy={delegateBusy}
      onSubmit={submitDelegate}
    />
    </>
  );
}
