'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { notify } from '@/components/notifications/NotificationProvider';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';

import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatVariantLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { Banner } from '@/components/notifications/Banner';
import { Card, Icon, TextInput, ListPage } from '@/components/ui';
import { StatusBadge } from '@/components/ui';
import { TransferCreateModal } from '@/components/transfers/TransferCreateModal';
import { SortableTableHeader, SortDirection } from '@/components/ui/SortableTableHeader';
import { useFormatDate } from '@/lib/business-context';

type Branch = { id: string; name: string };
type Batch = { id: string; code: string; expiryDate?: string | null };

type TransferItem = {
  id: string;
  variantId: string;
  quantity: number | string;
  receivedQuantity: number | string;
  batchId?: string | null;
  variant?: {
    name?: string | null;
    product?: { name?: string | null };
    baseUnit?: { id: string; label?: string | null; code?: string | null } | null;
  } | null;
  batch?: Batch | null;
};

type Transfer = {
  id: string;
  referenceNumber?: string | null;
  status: string;
  sourceBranchId?: string | null;
  destinationBranchId?: string | null;
  sourceBranch?: Branch | null;
  destinationBranch?: Branch | null;
  items: TransferItem[];
  feeAmount?: number | string | null;
  feeCurrency?: string | null;
  feeCarrier?: string | null;
  feeNote?: string | null;
  createdAt: string;
};

type SettingsResponse = {
  stockPolicies?: {
    batchTrackingEnabled?: boolean;
    transferBatchPolicy?: 'PRESERVE' | 'RECREATE';
  };
  localeSettings?: {
    currency?: string;
  };
};

/* ─── Transfer pipeline steps ─── */
const PIPELINE_STEPS = ['PENDING', 'APPROVED', 'IN_TRANSIT', 'COMPLETED'] as const;
const PIPELINE_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  IN_TRANSIT: 'In Transit',
  COMPLETED: 'Completed',
};

function TransferPipeline({ status }: { status: string }) {
  const currentIndex = PIPELINE_STEPS.indexOf(status as typeof PIPELINE_STEPS[number]);
  const isCancelled = status === 'CANCELLED';

  if (isCancelled) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 nvi-status-fade">
          <Icon name="CircleX" size={12} className="text-red-400" />
          <span className="text-[10px] font-semibold text-red-400">Cancelled</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 nvi-bounce-in">
      {PIPELINE_STEPS.map((step, i) => {
        const isComplete = currentIndex > i;
        const isCurrent = currentIndex === i;
        const isFuture = currentIndex < i;

        return (
          <div key={step} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={`h-px w-3 transition-colors duration-300 ${
                  isComplete ? 'bg-emerald-400/60' : 'bg-[var(--nvi-border)]'
                }`}
              />
            )}
            <div className="flex items-center gap-1">
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-300 ${
                  isCurrent
                    ? 'bg-[var(--nvi-accent)]/20 ring-1 ring-[var(--nvi-accent)]/40'
                    : isComplete
                      ? 'bg-emerald-500/20'
                      : 'bg-[var(--nvi-surface-alt)]'
                }`}
              >
                {isComplete ? (
                  <Icon name="CircleCheck" size={10} className="text-emerald-400" />
                ) : (
                  <div
                    className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                      isCurrent ? 'bg-[var(--nvi-accent)]' : 'bg-[var(--nvi-text-muted)]/40'
                    }`}
                  />
                )}
              </div>
              <span
                className={`text-[9px] font-medium uppercase tracking-wider transition-colors duration-300 ${
                  isCurrent
                    ? 'text-[var(--nvi-accent)]'
                    : isComplete
                      ? 'text-emerald-400/70'
                      : 'text-[var(--nvi-text-muted)]/50'
                }`}
              >
                {PIPELINE_LABELS[step]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Relative time helper ─── */
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function TransfersPage() {
  const t = useTranslations('transfersPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const { formatDateTime } = useFormatDate();

  const transferStatusLabels = useMemo<Record<string, string>>(
    () => ({
      PENDING: common('statusPending'),
      IN_TRANSIT: common('statusInTransit'),
      COMPLETED: common('statusCompleted'),
      CANCELLED: common('statusCancelled'),
    }),
    [common],
  );
  const permissions = getPermissionSet();
  const canWrite = permissions.has('transfers.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [actionBusy, setActionBusy] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [message, setMessage] = useToastState();
  const [batchTrackingEnabled, setBatchTrackingEnabled] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [createOpen, setCreateOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [total, setTotal] = useState<number | null>(null);
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '' });


  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'PENDING', label: common('statusPending') },
      { value: 'IN_TRANSIT', label: common('statusInTransit') },
      { value: 'COMPLETED', label: common('statusCompleted') },
      { value: 'CANCELLED', label: common('statusCancelled') },
    ],
    [common],
  );

  const [items, setItems] = useState<
    { id: string; variantId: string; quantity: string; batchId: string }[]
  >([{ id: crypto.randomUUID(), variantId: '', quantity: '', batchId: '' }]);
  const [form, setForm] = useState({
    sourceBranchId: '',
    destinationBranchId: '',
    feeAmount: '',
    feeCurrency: '',
    feeCarrier: '',
    feeNote: '',
  });
  const [batchOptions, setBatchOptions] = useState<Record<string, Batch[]>>({});
  const [receiveQuantities, setReceiveQuantities] = useState<
    Record<string, Record<string, string>>
  >({});
  const { activeBranch, resolveBranchId } = useBranchScope();
  const effectiveSourceBranchId = resolveBranchId(form.sourceBranchId) || '';
  const { loadOptions: loadVariantOptions, getVariantOption, seedCache: seedVariantCache } = useVariantSearch();

  const totalFees = useMemo(
    () => transfers.reduce((sum, tr) => sum + (Number(tr.feeAmount) || 0), 0),
    [transfers],
  );

  /* ─── KPI derived counts ─── */
  const pendingCount = useMemo(
    () => transfers.filter((tr) => tr.status === 'PENDING' || tr.status === 'REQUESTED').length,
    [transfers],
  );
  const inTransitCount = useMemo(
    () => transfers.filter((tr) => tr.status === 'IN_TRANSIT').length,
    [transfers],
  );
  const completedCount = useMemo(
    () => transfers.filter((tr) => tr.status === 'COMPLETED').length,
    [transfers],
  );

  const duplicateTransfer = useCallback((transfer: Transfer) => {
    // Seed variant cache from transfer items so dropdowns show names not UUIDs
    const variantSeeds = transfer.items
      .filter((item) => item.variant)
      .map((item) => ({
        id: item.variantId,
        name: item.variant?.name ?? '',
        product: item.variant?.product ?? null,
      }));
    if (variantSeeds.length) seedVariantCache(variantSeeds);

    setForm({
      sourceBranchId: transfer.sourceBranchId ?? '',
      destinationBranchId: transfer.destinationBranchId ?? '',
      feeAmount: transfer.feeAmount ? String(transfer.feeAmount) : '',
      feeCurrency: transfer.feeCurrency ?? '',
      feeCarrier: transfer.feeCarrier ?? '',
      feeNote: transfer.feeNote ?? '',
    });
    setItems(
      transfer.items.map((item) => ({
        id: crypto.randomUUID(),
        variantId: item.variantId,
        quantity: String(item.quantity),
        batchId: item.batchId ?? '',
      })),
    );
    setViewMode('cards');
    setCreateOpen(true);
    setMessage({ action: 'load', outcome: 'info', message: t('created').replace('.', ' — ' + t('duplicate') + '.') });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setMessage, t, seedVariantCache]);

  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const [branchData, settings] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', { token }),
        apiFetch<SettingsResponse>('/settings', { token }),
      ]);
      setBranches(normalizePaginated(branchData).items);
      setBatchTrackingEnabled(!!settings.stockPolicies?.batchTrackingEnabled);
      if (settings.localeSettings?.currency) {
        setForm((prev) => prev.feeCurrency ? prev : { ...prev, feeCurrency: settings.localeSettings?.currency ?? '' });
      }
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    }
  }, [setMessage, t]);

  const load = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor =
        targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      });
      const transferData = await apiFetch<PaginatedResponse<Transfer> | Transfer[]>(
        `/transfers${query}`,
        { token },
      );
      const transferResult = normalizePaginated(transferData);
      setTransfers(transferResult.items);
      setNextCursor(transferResult.nextCursor);
      if (typeof transferResult.total === 'number') {
        setTotal(transferResult.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (transferResult.nextCursor) {
          nextState[targetPage + 1] = transferResult.nextCursor;
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
  }, [pageSize, t, filters.search, filters.status, filters.from, filters.to]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [load]);

  useEffect(() => {
    if (activeBranch?.id && !form.sourceBranchId) {
      setForm((prev) => ({ ...prev, sourceBranchId: activeBranch.id }));
    }
  }, [activeBranch?.id, form.sourceBranchId]);

  const loadBatches = async (branchId: string, variantId: string) => {
    const token = getAccessToken();
    if (!token || !branchId || !variantId) {
      return;
    }
    const key = `${branchId}-${variantId}`;
    const data = await apiFetch<Batch[] | PaginatedResponse<Batch>>(
      `/stock/batches?branchId=${branchId}&variantId=${variantId}`,
      { token },
    );
    setBatchOptions((prev) => ({ ...prev, [key]: normalizePaginated(data).items }));
  };

  const updateItem = (
    index: number,
    data: Partial<{ variantId: string; quantity: string; batchId: string }>,
  ) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...data };
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { id: crypto.randomUUID(), variantId: '', quantity: '', batchId: '' }]);
  };

  const submitTransfer = async () => {
    const token = getAccessToken();
    if (!token || !effectiveSourceBranchId || !form.destinationBranchId) {
      return;
    }
    const payloadItems = items
      .filter((item) => item.variantId && item.quantity)
      .map((item) => ({
        variantId: item.variantId,
        quantity: Number(item.quantity),
        batchId: item.batchId || undefined,
      }));
    if (payloadItems.length === 0) {
      setMessage({ action: 'save', outcome: 'warning', message: t('itemRequired') });
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      await apiFetch('/transfers', {
        token,
        method: 'POST',
        body: JSON.stringify({
          sourceBranchId: effectiveSourceBranchId,
          destinationBranchId: form.destinationBranchId,
          items: payloadItems,
          feeAmount: form.feeAmount ? Number(form.feeAmount) : undefined,
          feeCurrency: form.feeCurrency || undefined,
          feeCarrier: form.feeCarrier || undefined,
          feeNote: form.feeNote || undefined,
        }),
      });
      setForm({
        sourceBranchId: '',
        destinationBranchId: '',
        feeAmount: '',
        feeCurrency: form.feeCurrency,
        feeCarrier: '',
        feeNote: '',
      });
      setItems([{ id: crypto.randomUUID(), variantId: '', quantity: '', batchId: '' }]);
      await load(1);
      setCreateOpen(false);
      setMessage({ action: 'create', outcome: 'success', message: t('created') });
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('createFailed')),
      });
    } finally {
      setIsCreating(false);
    }
  };

  const approveTransfer = async (transferId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const ok = await notify.confirm({
      title: t('approveConfirmTitle'),
      message: t('approveConfirmMessage'),
      confirmText: t('approveConfirmButton'),
    });
    if (!ok) return;
    setActionBusy((prev) => ({ ...prev, [transferId]: 'approve' }));
    try {
      const result = await apiFetch<{ approvalRequired?: boolean }>(
        `/transfers/${transferId}/approve`,
        { token, method: 'POST' },
      );
      if (result?.approvalRequired) {
        setMessage({ action: 'approve', outcome: 'warning', message: t('approveNeedsApproval') });
      } else {
        setMessage({ action: 'approve', outcome: 'success', message: t('approved') });
      }
      await load(page);
    } catch (err) {
      setMessage({ action: 'approve', outcome: 'failure', message: getApiErrorMessage(err, t('approveFailed')) });
    } finally {
      setActionBusy((prev) => {
        const next = { ...prev };
        delete next[transferId];
        return next;
      });
    }
  };

  const cancelTransfer = async (transferId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const ok = await notify.confirm({
      title: t('cancelConfirmTitle'),
      message: t('cancelConfirmMessage'),
      confirmText: t('cancelConfirmButton'),
    });
    if (!ok) return;
    setActionBusy((prev) => ({ ...prev, [transferId]: 'cancel' }));
    try {
      await apiFetch(`/transfers/${transferId}/cancel`, {
        token,
        method: 'POST',
      });
      await load(page);
      setMessage({ action: 'update', outcome: 'success', message: t('cancelled') });
    } catch (err) {
      setMessage({ action: 'update', outcome: 'failure', message: getApiErrorMessage(err, t('cancelFailed')) });
    } finally {
      setActionBusy((prev) => {
        const next = { ...prev };
        delete next[transferId];
        return next;
      });
    }
  };

  const receiveTransfer = async (transferId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setActionBusy((prev) => ({ ...prev, [transferId]: 'receive' }));
    const quantities = receiveQuantities[transferId];
    const itemsPayload = quantities
      ? Object.entries(quantities)
          .filter(([_, qty]) => qty)
          .map(([transferItemId, qty]) => ({
            transferItemId,
            quantity: Number(qty),
          }))
      : [];
    try {
      await apiFetch(`/transfers/${transferId}/receive`, {
        token,
        method: 'POST',
        body: itemsPayload.length ? JSON.stringify({ items: itemsPayload }) : '{}',
      });
      await load(page);
      setMessage({ action: 'update', outcome: 'success', message: t('received') });
    } catch (err) {
      setMessage({ action: 'update', outcome: 'failure', message: getApiErrorMessage(err, t('receiveFailed')) });
    } finally {
      setActionBusy((prev) => {
        const next = { ...prev };
        delete next[transferId];
        return next;
      });
    }
  };

  /* ─── KPI strip ─── */
  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      <Card padding="md" as="article">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiTransferRows')}</p>
            <p className="mt-2 text-3xl font-bold text-[var(--nvi-text)]">{total ?? transfers.length}</p>
          </div>
          <div className="nvi-kpi-icon" style={{ background: 'color-mix(in srgb, var(--nvi-accent) 10%, transparent)', color: 'var(--nvi-accent)' }}>
            <Icon name="Truck" size={18} />
          </div>
        </div>
      </Card>
      <Card padding="md" as="article">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{common('statusPending')}</p>
            <p className="mt-2 text-3xl font-bold text-amber-400">{pendingCount}</p>
          </div>
          <div className="nvi-kpi-icon nvi-kpi-icon--amber">
            <Icon name="Clock" size={18} />
          </div>
        </div>
      </Card>
      <Card padding="md" as="article">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{common('statusInTransit')}</p>
            <p className="mt-2 text-3xl font-bold text-blue-400">{inTransitCount}</p>
          </div>
          <div className="nvi-kpi-icon nvi-kpi-icon--blue">
            <Icon name="Truck" size={18} />
          </div>
        </div>
      </Card>
      <Card padding="md" as="article">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{common('statusCompleted')}</p>
            <p className="mt-2 text-3xl font-bold text-emerald-400">{completedCount}</p>
          </div>
          <div className="nvi-kpi-icon nvi-kpi-icon--emerald">
            <Icon name="CircleCheck" size={18} />
          </div>
        </div>
      </Card>
    </div>
  );

  /* ─── Filters ─── */
  const filterBar = (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <TextInput
        value={filters.search}
        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        placeholder={common('search')}
        type="search"
      />
      <SmartSelect
        instanceId="transfers-status-filter"
        value={filters.status}
        options={statusOptions}
        onChange={(v) => setFilters({ ...filters, status: v })}
      />
      <DatePickerInput
        value={filters.from}
        onChange={(v) => setFilters({ ...filters, from: v })}
        placeholder={common('fromDate')}
        className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)]"
      />
      <DatePickerInput
        value={filters.to}
        onChange={(v) => setFilters({ ...filters, to: v })}
        placeholder={common('toDate')}
        className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)]"
      />
    </div>
  );

  /* ─── Create modal ─── */
  const createModal = (
    <TransferCreateModal
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      form={form}
      onFormChange={setForm}
      items={items}
      onUpdateItem={updateItem}
      onAddItem={addItem}
      branches={branches}
      effectiveSourceBranchId={effectiveSourceBranchId}
      batchTrackingEnabled={batchTrackingEnabled}
      batchOptions={batchOptions}
      onLoadBatches={loadBatches}
      loadVariantOptions={loadVariantOptions}
      getVariantOption={getVariantOption}
      onSubmit={submitTransfer}
      isCreating={isCreating}
      canWrite={canWrite}
    />
  );

  /* ─── Table view ─── */
  const tableView = (
    <Card>
      <div className="overflow-auto">
        <table className="min-w-[720px] w-full text-left text-sm text-[var(--nvi-text)]">
          <thead className="text-xs uppercase text-[var(--nvi-text-muted)]">
            <tr>
              <SortableTableHeader label={t('sourceBranch')} sortKey="sourceBranch" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
              <SortableTableHeader label={t('destinationBranch')} sortKey="destinationBranch" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
              <SortableTableHeader label={t('statusLabel')} sortKey="status" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
              <SortableTableHeader label={t('createdAt')} sortKey="createdAt" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
              <SortableTableHeader label={t('items')} sortKey="items" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
              <SortableTableHeader label={t('transferFeeAmount')} sortKey="feeAmount" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} align="right" />
              <th className="px-3 py-2 text-right">{common('actions') || 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((transfer) => {
              const totalQty = transfer.items.reduce((s, it) => s + Number(it.quantity), 0);
              return (
                <tr key={transfer.id} className="border-t border-[var(--nvi-border)]">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Icon name="Building2" size={13} className="text-[var(--nvi-text-muted)]" />
                      {transfer.sourceBranch?.name || common('unknown')}
                    </div>
                    {transfer.referenceNumber ? <p className="text-[11px] text-[var(--nvi-text-muted)]">{transfer.referenceNumber}</p> : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Icon name="Building2" size={13} className="text-[var(--nvi-text-muted)]" />
                      {transfer.destinationBranch?.name || common('unknown')}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={transfer.status} size="xs" className="nvi-status-fade" />
                  </td>
                  <td className="px-3 py-2">
                    {formatDateTime(transfer.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="Package" size={12} className="text-[var(--nvi-text-muted)]" />
                      {transfer.items.length} ({totalQty})
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {transfer.feeAmount
                      ? `${transfer.feeAmount} ${transfer.feeCurrency ?? ''}`
                      : '\u2014'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {transfer.status === 'REQUESTED' || transfer.status === 'PENDING' ? (
                        <button
                          type="button"
                          onClick={() => approveTransfer(transfer.id)}
                          className="nvi-press rounded-xl p-1.5 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
                          disabled={!canWrite || actionBusy[transfer.id] === 'approve'}
                          title={actions('approve')}
                        >
                          {actionBusy[transfer.id] === 'approve' ? <Spinner size="xs" variant="pulse" /> : <Icon name="CircleCheck" size={15} />}
                        </button>
                      ) : null}
                      {(transfer.status === 'APPROVED' || transfer.status === 'IN_TRANSIT') && activeBranch?.id === transfer.destinationBranchId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setViewMode('cards');
                          }}
                          className="nvi-press rounded-xl p-1.5 text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"
                          disabled={!canWrite}
                          title={t('receive')}
                        >
                          <Icon name="Package" size={15} />
                        </button>
                      ) : null}
                      {transfer.status !== 'COMPLETED' && transfer.status !== 'CANCELLED' ? (
                        <button
                          type="button"
                          onClick={() => cancelTransfer(transfer.id)}
                          className="nvi-press rounded-xl p-1.5 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                          disabled={!canWrite || actionBusy[transfer.id] === 'cancel'}
                          title={actions('cancel')}
                        >
                          {actionBusy[transfer.id] === 'cancel' ? <Spinner size="xs" variant="dots" /> : <Icon name="CircleX" size={15} />}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => duplicateTransfer(transfer)}
                        className="nvi-press rounded-xl p-1.5 text-[var(--nvi-text-muted)] hover:bg-[var(--nvi-surface-alt)] disabled:opacity-50"
                        disabled={!canWrite}
                        title={t('duplicate')}
                      >
                        <Icon name="Copy" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  /* ─── Card view — transfer journey cards ─── */
  const cardView = (
    <div className="grid gap-4 md:grid-cols-2 nvi-stagger">
      {transfers.map((transfer) => {
        const totalQty = transfer.items.reduce((s, it) => s + Number(it.quantity), 0);
        return (
          <Card key={transfer.id} as="article" className="nvi-card-hover space-y-3">
            {/* Pipeline progress */}
            <TransferPipeline status={transfer.status} />

            {/* Branch route */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-xl bg-[var(--nvi-surface-alt)] px-2.5 py-1.5">
                <Icon name="Building2" size={14} className="text-[var(--nvi-accent)]" />
                <span className="text-xs font-medium text-[var(--nvi-text)]">
                  {transfer.sourceBranch?.name || common('unknown')}
                </span>
              </div>
              <Icon name="ArrowRight" size={14} className="text-[var(--nvi-text-muted)]" />
              <div className="flex items-center gap-1.5 rounded-xl bg-[var(--nvi-surface-alt)] px-2.5 py-1.5">
                <Icon name="Building2" size={14} className="text-[var(--nvi-accent)]" />
                <span className="text-xs font-medium text-[var(--nvi-text)]">
                  {transfer.destinationBranch?.name || common('unknown')}
                </span>
              </div>
            </div>

            {/* Reference + meta */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--nvi-text-muted)]">
              {transfer.referenceNumber ? (
                <span className="font-mono text-[11px]">{transfer.referenceNumber}</span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <Icon name="Package" size={12} />
                {transfer.items.length} {transfer.items.length === 1 ? 'item' : 'items'} ({totalQty} qty)
              </span>
              {transfer.feeAmount ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name="DollarSign" size={12} />
                  {transfer.feeAmount} {transfer.feeCurrency ?? ''}
                </span>
              ) : null}
              {transfer.feeCarrier ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name="User" size={12} />
                  {transfer.feeCarrier}
                </span>
              ) : null}
              <span className="ml-auto text-[11px]">{relativeTime(transfer.createdAt)}</span>
            </div>

            {/* Fee note */}
            {transfer.feeNote ? (
              <p className="text-[11px] italic text-[var(--nvi-text-muted)]">{transfer.feeNote}</p>
            ) : null}

            {/* Item details */}
            <div className="space-y-2 text-xs text-[var(--nvi-text)]">
              {transfer.items.map((item) => {
                const remaining =
                  Number(item.quantity) - Number(item.receivedQuantity || 0);
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--nvi-border)] pt-2"
                  >
                    <div>
                      <p className="font-medium">
                        {formatVariantLabel(
                          {
                            id: item.variantId ?? null,
                            name: item.variant?.name ?? null,
                            productName: item.variant?.product?.name ?? null,
                          },
                          common('unknown'),
                        )}
                      </p>
                      <p className="text-[var(--nvi-text-muted)]">
                        {t('itemSummary', {
                          qty: item.quantity,
                          received: item.receivedQuantity,
                        })}
                        {item.variant?.baseUnit ? (
                          <span className="ml-1 opacity-60">({item.variant.baseUnit.label || item.variant.baseUnit.code})</span>
                        ) : null}
                      </p>
                    </div>
                    {(transfer.status === 'APPROVED' || transfer.status === 'IN_TRANSIT') && activeBranch?.id === transfer.destinationBranchId ? (
                      <TextInput
                        value={
                          receiveQuantities[transfer.id]?.[item.id] || ''
                        }
                        onChange={(event) =>
                          setReceiveQuantities((prev) => ({
                            ...prev,
                            [transfer.id]: {
                              ...prev[transfer.id],
                              [item.id]: event.target.value,
                            },
                          }))
                        }
                        placeholder={t('remaining', { value: remaining })}
                        type="number"
                        className="w-24"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              {transfer.status === 'REQUESTED' || transfer.status === 'PENDING' ? (
                <button
                  type="button"
                  onClick={() => approveTransfer(transfer.id)}
                  className="nvi-decision-btn nvi-decision-approve"
                  disabled={!canWrite || actionBusy[transfer.id] === 'approve'}
                  title={!canWrite ? noAccess('title') : undefined}
                >
                  {actionBusy[transfer.id] === 'approve' ? (
                    <Spinner size="xs" variant="pulse" />
                  ) : (
                    <Icon name="CircleCheck" size={13} />
                  )}
                  {actionBusy[transfer.id] === 'approve'
                    ? t('approving')
                    : actions('approve')}
                </button>
              ) : null}
              {(transfer.status === 'APPROVED' || transfer.status === 'IN_TRANSIT') && activeBranch?.id === transfer.destinationBranchId ? (
                <button
                  type="button"
                  onClick={() => receiveTransfer(transfer.id)}
                  className="nvi-decision-btn nvi-decision-receive"
                  disabled={!canWrite || actionBusy[transfer.id] === 'receive'}
                  title={!canWrite ? noAccess('title') : undefined}
                >
                  {actionBusy[transfer.id] === 'receive' ? (
                    <Spinner size="xs" variant="grid" />
                  ) : (
                    <Icon name="Package" size={13} />
                  )}
                  {actionBusy[transfer.id] === 'receive'
                    ? t('receiving')
                    : t('receive')}
                </button>
              ) : null}
              {transfer.status !== 'COMPLETED' && transfer.status !== 'CANCELLED' ? (
                <button
                  type="button"
                  onClick={() => cancelTransfer(transfer.id)}
                  className="nvi-decision-btn nvi-decision-reject"
                  disabled={!canWrite || actionBusy[transfer.id] === 'cancel'}
                  title={!canWrite ? noAccess('title') : undefined}
                >
                  {actionBusy[transfer.id] === 'cancel' ? (
                    <Spinner size="xs" variant="dots" />
                  ) : (
                    <Icon name="CircleX" size={13} />
                  )}
                  {actionBusy[transfer.id] === 'cancel'
                    ? t('canceling')
                    : actions('cancel')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => duplicateTransfer(transfer)}
                className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text-muted)] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={!canWrite}
                title={!canWrite ? noAccess('title') : t('duplicate')}
              >
                <Icon name="Copy" size={13} />
                {t('duplicate')}
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );

  /* ─── Pagination ─── */
  const paginationBlock = (
    <PaginationControls
      page={page}
      pageSize={pageSize}
      total={total}
      itemCount={transfers.length}
      availablePages={Object.keys(pageCursors).map((value) => Number(value))}
      hasNext={Boolean(nextCursor)}
      hasPrev={page > 1}
      isLoading={isLoading}
      onPageChange={(targetPage) => load(targetPage)}
      onPageSizeChange={(nextPageSize) => {
        setPageSize(nextPageSize);
        setTotal(null);
        setPage(1);
        setPageCursors({ 1: null });
        load(1, nextPageSize);
      }}
    />
  );

  return (
    <>
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      isLoading={isLoading}
      headerActions={
        <>
          {canWrite ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-[var(--nvi-accent)] px-3 py-2 text-xs font-semibold text-black"
            >
              <Icon name="Plus" size={14} />
              {t('createTransfer')}
            </button>
          ) : null}
          <Link
            href={`/${locale}/transfers/wizard`}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs text-[var(--nvi-text)]"
          >
            <Icon name="Wand" size={14} />
            {t('openWizard')}
          </Link>
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </>
      }
      banner={message ? <Banner message={typeof message === 'string' ? message : message.message} severity={typeof message === 'string' ? 'info' : message.outcome === 'success' ? 'success' : message.outcome === 'failure' ? 'error' : 'warning'} onDismiss={() => setMessage(null)} /> : null}
      kpis={kpiStrip}
      filters={filterBar}
      viewMode={viewMode}
      table={tableView}
      cards={cardView}
      isEmpty={!transfers.length}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="Truck" size={40} className="text-[var(--nvi-text-muted)]/40" />
        </div>
      }
      emptyTitle={t('noTransfers')}
      emptyDescription={t('subtitle')}
      emptyAction={
        canWrite ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-[var(--nvi-accent)] px-4 py-2 text-xs font-semibold text-black"
          >
            <Icon name="Plus" size={14} />
            {t('createTransfer')}
          </button>
        ) : undefined
      }
      pagination={paginationBlock}
    />
    {createModal}
    </>
  );
}
