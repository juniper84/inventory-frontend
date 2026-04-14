'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { SmartSelect } from '@/components/SmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { DatePickerInput } from '@/components/DatePickerInput';
import { Banner } from '@/components/notifications/Banner';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { formatEntityLabel, formatVariantLabel, shortId } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';

import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { useFormatDate } from '@/lib/business-context';
import {
  ListPage,
  Card,
  Icon,
  StatusBadge,
  EmptyState,
  Tooltip,
} from '@/components/ui';
import { SupplierReturnCreateModal } from '@/components/supplier-returns/SupplierReturnCreateModal';
import Link from 'next/link';

type Branch = { id: string; name: string };
type Supplier = { id: string; name: string; status: string };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name?: string | null };
};
type Purchase = { id: string; status?: string; createdAt?: string; supplier?: Supplier | null };
type PurchaseOrder = { id: string; status?: string; createdAt?: string; supplier?: Supplier | null };
type ReceivingLine = {
  id: string;
  variant?: Variant;
  quantity: string;
  unitCost: string;
  receivedAt: string;
  unitId?: string | null;
};
type SupplierReturnLine = {
  id: string;
  variantId: string;
  quantity: string;
  unitCost: string;
  receivingLineId: string;
  unitId: string;
};
type SupplierReturn = {
  id: string;
  referenceNumber?: string | null;
  status: string;
  reason?: string | null;
  createdAt: string;
  supplier?: Supplier;
  branch?: Branch;
  purchaseId?: string | null;
  purchaseOrderId?: string | null;
  purchase?: { id: string } | null;
  purchaseOrder?: { id: string } | null;
  lines: {
    variantId: string;
    quantity: string;
    unitCost: string;
    unitId?: string;
    variant?: Variant;
  }[];
};

/* ─── Status pipeline steps ──────────────────────────────────────────────── */
const PIPELINE_STEPS = ['PENDING', 'COMPLETED', 'CREDITED'] as const;

function StatusPipeline({ current }: { current: string }) {
  const isRejected = current === 'REJECTED';
  return (
    <div className="flex items-center gap-1">
      {PIPELINE_STEPS.map((step, i) => {
        const idx = PIPELINE_STEPS.indexOf(current as typeof PIPELINE_STEPS[number]);
        const isActive = !isRejected && i <= idx;
        const isCurrent = step === current;
        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={[
                'h-2 w-2 rounded-full transition-colors nvi-status-fade',
                isCurrent ? 'ring-2 ring-offset-1 ring-offset-black' : '',
                isActive
                  ? step === 'CREDITED'
                    ? 'bg-emerald-400 ring-emerald-400/40'
                    : step === 'COMPLETED'
                      ? 'bg-blue-400 ring-blue-400/40'
                      : 'bg-amber-400 ring-amber-400/40'
                  : isRejected && i === 0
                    ? 'bg-red-400 ring-red-400/40'
                    : 'bg-[var(--nvi-border)]',
              ].join(' ')}
            />
            {i < PIPELINE_STEPS.length - 1 && (
              <div
                className={[
                  'h-px w-4',
                  isActive && i < idx ? 'bg-[var(--nvi-gold)]' : 'bg-[var(--nvi-border)]',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
      {isRejected && (
        <span className="ml-1 text-[10px] font-semibold uppercase text-red-400">Rejected</span>
      )}
    </div>
  );
}

/* ─── Source link badge ───────────────────────────────────────────────────── */
function SourceBadge({ entry, locale }: { entry: SupplierReturn; locale: string }) {
  if (entry.purchase?.id) {
    return (
      <Link
        href={`/${locale}/purchases`}
        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
      >
        <Icon name="ShoppingCart" size={11} className="text-emerald-400" />
        Purchase
      </Link>
    );
  }
  if (entry.purchaseOrder?.id) {
    return (
      <Link
        href={`/${locale}/purchase-orders`}
        className="inline-flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
      >
        <Icon name="ClipboardList" size={11} className="text-blue-400" />
        PO
      </Link>
    );
  }
  return null;
}

/* ─── Relative time helper ────────────────────────────────────────────────── */
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function SupplierReturnsPage() {
  const t = useTranslations('supplierReturnsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const { formatDate } = useFormatDate();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('purchases.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [returns, setReturns] = useState<SupplierReturn[]>([]);
  const [message, setMessage] = useToastState();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState<number | null>(null);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({ 1: null });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [approvalNotice, setApprovalNotice] = useState<{
    action: string;
    approvalId?: string;
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [receivings, setReceivings] = useState<ReceivingLine[]>([]);
  const [returnRates, setReturnRates] = useState<Record<string, number>>({});
  const [form, setForm] = useState({
    branchId: '',
    supplierId: '',
    purchaseId: '',
    purchaseOrderId: '',
    reason: '',
  });
  const { activeBranch, resolveBranchId } = useBranchScope();
  const { loadOptions: loadVariantOptions, seedCache: seedVariantCache, getVariantOption } = useVariantSearch();
  const [lines, setLines] = useState<SupplierReturnLine[]>([
    {
      id: crypto.randomUUID(),
      variantId: '',
      quantity: '',
      unitCost: '',
      receivingLineId: '',
      unitId: '',
    },
  ]);
  const formatDocLabel = (doc: Purchase | PurchaseOrder) => {
    const dateLabel = doc.createdAt ? formatDate(doc.createdAt) : null;
    const parts = [doc.supplier?.name ?? null, dateLabel, doc.status].filter(Boolean);
    return parts.length
      ? parts.join(' \u2022 ')
      : formatEntityLabel({ id: doc.id }, common('unknown'));
  };
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    branchId: '',
    supplierId: '',
    from: '',
    to: '',
  });
  const effectiveFilterBranchId = resolveBranchId(filters.branchId) || '';
  const effectiveFormBranchId = resolveBranchId(form.branchId) || '';
  const [searchDraft, setSearchDraft] = useState(filters.search);


  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'PENDING', label: common('statusPending') },
      { value: 'REJECTED', label: common('statusRejected') },
      { value: 'COMPLETED', label: common('statusCompleted') },
    ],
    [common],
  );

  const branchOptions = useMemo(
    () => [
      { value: '', label: common('globalBranch') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );

  const supplierOptions = useMemo(
    () => [
      { value: '', label: common('allSuppliers') },
      ...suppliers.map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
      })),
    ],
    [suppliers, common],
  );
  const pendingCount = useMemo(
    () => returns.filter((entry) => entry.status === 'PENDING').length,
    [returns],
  );
  const completedCount = useMemo(
    () => returns.filter((entry) => entry.status === 'COMPLETED').length,
    [returns],
  );
  const linkedCount = useMemo(
    () => returns.filter((entry) => entry.purchase?.id || entry.purchaseOrder?.id).length,
    [returns],
  );
  const totalReturnValue = useMemo(
    () =>
      returns.reduce(
        (sum, entry) =>
          sum +
          entry.lines.reduce(
            (lineSum, line) =>
              lineSum + Number(line.quantity) * Number(line.unitCost),
            0,
          ),
        0,
      ),
    [returns],
  );

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);



  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const [
        branchData,
        supplierData,
        variantData,
        unitList,
        purchaseData,
        poData,
        receivingData,
        ratesData,
      ] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', { token }),
        apiFetch<PaginatedResponse<Supplier> | Supplier[]>('/suppliers?limit=200', { token }),
        apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', { token }),
        loadUnits(token),
        apiFetch<PaginatedResponse<Purchase> | Purchase[]>('/purchases?limit=200', { token }),
        apiFetch<PaginatedResponse<PurchaseOrder> | PurchaseOrder[]>('/purchase-orders?limit=200', { token }),
        apiFetch<PaginatedResponse<ReceivingLine> | ReceivingLine[]>('/receiving?limit=200', { token }),
        apiFetch<{ supplierId: string; returnRate: number }[]>('/supplier-returns/rates', { token }).catch(() => [] as { supplierId: string; returnRate: number }[]),
      ]);
      const variantList = normalizePaginated(variantData).items;
      setBranches(normalizePaginated(branchData).items);
      setSuppliers(normalizePaginated(supplierData).items);
      setVariants(variantList);
      seedVariantCache(variantList);
      setUnits(unitList);
      setPurchases(normalizePaginated(purchaseData).items);
      setPurchaseOrders(normalizePaginated(poData).items);
      setReceivings(normalizePaginated(receivingData).items);
      if (Array.isArray(ratesData)) {
        const rateMap: Record<string, number> = {};
        for (const r of ratesData) {
          if (r.supplierId && typeof r.returnRate === 'number') {
            rateMap[r.supplierId] = r.returnRate;
          }
        }
        setReturnRates(rateMap);
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
    const effectivePageSize = nextPageSize ?? pageSize;
    const cursor = targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
    try {
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
        branchId: effectiveFilterBranchId || undefined,
        supplierId: filters.supplierId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      });
      const returnData = await apiFetch<PaginatedResponse<SupplierReturn> | SupplierReturn[]>(
        `/supplier-returns${query}`,
        { token },
      );
      const returnResult = normalizePaginated(returnData);
      setReturns(returnResult.items);
      setNextCursor(returnResult.nextCursor);
      if (typeof returnResult.total === 'number') {
        setTotal(returnResult.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (returnResult.nextCursor) {
          nextState[targetPage + 1] = returnResult.nextCursor;
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
  }, [pageSize, effectiveFilterBranchId, filters.search, filters.status, filters.supplierId, filters.from, filters.to, t]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (activeBranch?.id && !form.branchId) {
      setForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
  }, [activeBranch?.id, form.branchId]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1).catch((err) => {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
      setIsLoading(false);
    });
  }, [load]);

  const updateLine = (id: string, patch: Partial<SupplierReturnLine>) => {
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        variantId: '',
        quantity: '',
        unitCost: '',
        receivingLineId: '',
        unitId: '',
      },
    ]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((line) => line.id !== id));
  };

  const createReturn = async () => {
    const token = getAccessToken();
    if (!token || !effectiveFormBranchId || !form.supplierId) {
      return;
    }
    const payloadLines = lines
      .filter((line) => line.variantId && line.quantity && line.unitCost)
      .map((line) => ({
        variantId: line.variantId,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
        receivingLineId: line.receivingLineId || undefined,
        unitId: line.unitId || undefined,
      }));
    if (!payloadLines.length) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      const result = await apiFetch('/supplier-returns', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: effectiveFormBranchId,
          supplierId: form.supplierId,
          purchaseId: form.purchaseId || undefined,
          purchaseOrderId: form.purchaseOrderId || undefined,
          reason: form.reason || undefined,
          lines: payloadLines,
        }),
      });
      if (result && typeof result === 'object' && 'approvalRequired' in result) {
        setApprovalNotice({
          action: t('approvalRequested'),
          approvalId: (result as { approvalId?: string }).approvalId,
        });
        setCreateOpen(false);
        return;
      }
      setForm({
        branchId: '',
        supplierId: '',
        purchaseId: '',
        purchaseOrderId: '',
        reason: '',
      });
      setLines([
        {
          id: crypto.randomUUID(),
          variantId: '',
          quantity: '',
          unitCost: '',
          receivingLineId: '',
          unitId: '',
        },
      ]);
      setCreateOpen(false);
      setMessage({ action: 'create', outcome: 'success', message: t('created') });
      await load(1);
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

  /* ─── Compute return line value for a single entry ─────────────────────── */
  const entryValue = (entry: SupplierReturn) =>
    entry.lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitCost), 0);

  return (
    <>
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      eyebrow={t('eyebrow')}
      badges={
        <>
          <span className="status-chip">{t('badgeSupplierReturns')}</span>
          <span className="status-chip">{t('badgeLive')}</span>
        </>
      }
      headerActions={
        <>
          {canWrite ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-[var(--nvi-accent)] px-3 py-2 text-xs font-semibold text-black"
            >
              <Icon name="Plus" size={14} />
              {t('createReturn')}
            </button>
          ) : null}
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </>
      }
      isLoading={isLoading}
      isEmpty={!returns.length}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="RotateCcw" size={40} className="text-[var(--nvi-gold)]/40" />
        </div>
      }
      emptyTitle={t('noReturns')}
      emptyDescription={t('subtitle')}
      banner={
        <>
          {message ? <Banner message={message.message ?? ''} severity={message.outcome === 'failure' ? 'error' : 'success'} onDismiss={() => setMessage(null)} /> : null}
          {approvalNotice ? (
            <Card padding="sm" className="border-[var(--nvi-gold)]/40 bg-[var(--nvi-gold)]/5 nvi-slide-in-bottom">
              <div className="flex items-start gap-2">
                <Icon name="TriangleAlert" size={16} className="mt-0.5 text-[var(--nvi-gold)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--nvi-text)]">{approvalNotice.action}</p>
                  <p className="text-xs text-[var(--nvi-text-muted)]">
                    {t('approvalRequired', {
                      id: approvalNotice.approvalId ?? '',
                    })}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}
        </>
      }
      kpis={
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 nvi-stagger">
          <Card padding="md" as="article">
            <div className="flex items-center gap-2">
              <div className="nvi-kpi-icon nvi-kpi-icon--amber" style={{ width: 32, height: 32 }}>
                <Icon name="RotateCcw" size={16} />
              </div>
              <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiOpenCases')}</p>
            </div>
            <p className="mt-2 text-3xl font-bold text-amber-400">{returns.length}</p>
          </Card>
          <Card padding="md" as="article">
            <div className="flex items-center gap-2">
              <div className="nvi-kpi-icon nvi-kpi-icon--purple" style={{ width: 32, height: 32 }}>
                <Icon name="Clock" size={16} />
              </div>
              <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiPending')}</p>
            </div>
            <p className="mt-2 text-3xl font-bold text-purple-400">{pendingCount}</p>
          </Card>
          <Card padding="md" as="article">
            <div className="flex items-center gap-2">
              <div className="nvi-kpi-icon nvi-kpi-icon--emerald" style={{ width: 32, height: 32 }}>
                <Icon name="CircleCheck" size={16} />
              </div>
              <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiCompleted')}</p>
            </div>
            <p className="mt-2 text-3xl font-bold text-emerald-400">{completedCount}</p>
          </Card>
          <Card padding="md" as="article">
            <div className="flex items-center gap-2">
              <div className="nvi-kpi-icon nvi-kpi-icon--blue" style={{ width: 32, height: 32 }}>
                <Icon name="Link" size={16} />
              </div>
              <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiLinkedReceipts')}</p>
            </div>
            <p className="mt-2 text-3xl font-bold text-blue-400">{linkedCount}</p>
          </Card>
          <Card padding="md" as="article">
            <div className="flex items-center gap-2">
              <div className="nvi-kpi-icon nvi-kpi-icon--red" style={{ width: 32, height: 32 }}>
                <Icon name="DollarSign" size={16} />
              </div>
              <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiTotalReturnValue')}</p>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-red-400">
              {totalReturnValue.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </Card>
        </div>
      }
      filters={
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
            instanceId="filter-status"
            value={filters.status}
            onChange={(value) => pushFilters({ status: value })}
            options={statusOptions}
            placeholder={common('status')}
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="filter-branch"
            value={filters.branchId}
            onChange={(value) => pushFilters({ branchId: value })}
            options={branchOptions}
            placeholder={common('branch')}
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="filter-supplier"
            value={filters.supplierId}
            onChange={(value) => pushFilters({ supplierId: value })}
            options={supplierOptions}
            placeholder={common('supplier')}
            className="nvi-select-container"
          />
          <DatePickerInput
            value={filters.from}
            onChange={(value) => pushFilters({ from: value })}
            placeholder={common('fromDate')}
            className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-text)]"
          />
          <DatePickerInput
            value={filters.to}
            onChange={(value) => pushFilters({ to: value })}
            placeholder={common('toDate')}
            className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-text)]"
          />
        </ListFilters>
      }
      viewMode={viewMode}
      table={
        <Card padding="lg">
          <div className="overflow-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--nvi-text-muted)]">
                <tr>
                  <th className="px-3 py-2">{common('supplier')}</th>
                  <th className="px-3 py-2">{common('branch')}</th>
                  <th className="px-3 py-2">{common('status')}</th>
                  <th className="px-3 py-2">{t('reasonOptional')}</th>
                  <th className="px-3 py-2">{common('total') || 'Total'}</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">{common('date')}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {returns.map((entry) => (
                  <tr key={entry.id} className="border-t border-[var(--nvi-border)] hover:bg-[var(--nvi-surface)]/60 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Icon name="Building2" size={13} className="text-[var(--nvi-text-muted)]" />
                        <div>
                          <p className="font-semibold text-[var(--nvi-text)]">
                            {entry.supplier?.name ?? t('supplierFallback')}
                            {entry.supplier?.id && returnRates[entry.supplier.id] != null ? (
                              <span className={`ml-2 text-[11px] font-normal ${returnRates[entry.supplier.id] > 10 ? 'text-red-400' : 'text-[var(--nvi-text-muted)]'}`}>
                                ({t('returnRate', { rate: returnRates[entry.supplier.id].toFixed(1) })})
                              </span>
                            ) : null}
                          </p>
                          <p className="text-[11px] text-[var(--nvi-text-muted)]">{entry.referenceNumber || '#' + shortId(entry.id)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[var(--nvi-text-muted)]">
                      {entry.branch?.name ? (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="MapPin" size={11} className="text-[var(--nvi-text-muted)]" />
                          {entry.branch.name}
                        </span>
                      ) : '\u2014'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <StatusPipeline current={entry.status} />
                        <StatusBadge status={entry.status} size="xs" />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[180px] overflow-hidden">
                      {entry.reason ? (
                        <Tooltip content={entry.reason}>
                          <span className="block truncate max-w-[180px] rounded-md bg-amber-500/[0.06] px-2 py-1 text-amber-300 border border-amber-500/15">{entry.reason}</span>
                        </Tooltip>
                      ) : <span className="text-[var(--nvi-text-muted)]">{'\u2014'}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums font-semibold text-red-400">
                      {entryValue(entry).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2">
                      <SourceBadge entry={entry} locale={locale} />
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--nvi-text-muted)]">
                      {timeAgo(entry.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <Link href={`/${locale}/attachments`} className="text-[var(--nvi-text-muted)] hover:text-[var(--nvi-text)] underline transition-colors">
                        {t('viewAttachments')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      }
      cards={
        <div className="grid gap-4 md:grid-cols-2 nvi-stagger">
          {returns.map((entry) => {
            const value = entryValue(entry);
            return (
              <Card
                key={entry.id}
                padding="md"
                className="space-y-3 nvi-card-hover"
              >
                {/* ── Reason as hero ──────────────────────────────── */}
                {entry.reason ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
                    <Icon name="RotateCcw" size={15} className="mt-0.5 shrink-0 text-amber-400" />
                    <p className="text-sm font-medium text-[var(--nvi-text)]">{entry.reason}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-amber-500/10 bg-amber-500/[0.02] p-3 text-sm text-[var(--nvi-text-muted)]">
                    <Icon name="RotateCcw" size={15} className="text-amber-400/40" />
                    <span className="italic">No reason provided</span>
                  </div>
                )}

                {/* ── Quantity + value row ────────────────────────── */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--nvi-surface)] px-2 py-1 text-xs text-[var(--nvi-text-muted)]">
                    <Icon name="Package" size={13} className="text-amber-400" />
                    {entry.lines.length} {entry.lines.length === 1 ? 'item' : 'items'}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-red-400">
                    {value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <SourceBadge entry={entry} locale={locale} />
                </div>

                {/* ── Line items ──────────────────────────────────── */}
                {entry.lines.length > 0 && (
                  <div className="space-y-1.5 border-t border-[var(--nvi-border)] pt-2">
                    {entry.lines.map((line, index) => {
                      const unit = line.unitId
                        ? units.find((item) => item.id === line.unitId) ?? null
                        : null;
                      const unitLabel = unit ? buildUnitLabel(unit) : line.unitId ?? '';
                      return (
                        <div key={`${entry.id}-${index}`} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                          <span className="font-medium text-[var(--nvi-text)] max-w-[50%] truncate">
                            {formatVariantLabel(
                              {
                                id: line.variantId,
                                name: line.variant?.name ?? null,
                                productName: line.variant?.product?.name ?? null,
                              },
                              common('unknown'),
                            )}
                          </span>
                          <span className="text-[var(--nvi-border)]">{'\u00B7'}</span>
                          <span className="text-[var(--nvi-text-muted)]">{line.quantity} {unitLabel}</span>
                          <span className="text-[var(--nvi-border)]">{'\u00B7'}</span>
                          <span className="tabular-nums text-[var(--nvi-text-muted)]">{line.unitCost}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Status pipeline ─────────────────────────────── */}
                <div className="flex items-center justify-between border-t border-[var(--nvi-border)] pt-2">
                  <StatusPipeline current={entry.status} />
                  <StatusBadge status={entry.status} size="xs" />
                </div>

                {/* ── Footer metadata ─────────────────────────────── */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--nvi-text-muted)]">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-0.5 text-blue-400">
                    <Icon name="Building2" size={11} />
                    {entry.supplier?.name ?? t('supplierFallback')}
                    {entry.supplier?.id && returnRates[entry.supplier.id] != null ? (
                      <span className={returnRates[entry.supplier.id] > 10 ? 'text-red-400' : 'text-blue-300'}>
                        ({t('returnRate', { rate: returnRates[entry.supplier.id].toFixed(1) })})
                      </span>
                    ) : null}
                  </span>
                  {entry.branch?.name && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="MapPin" size={11} className="text-purple-400" />
                      {entry.branch.name}
                    </span>
                  )}
                  <span className="text-[var(--nvi-text-muted)]">{entry.referenceNumber || '#' + shortId(entry.id)}</span>
                  <span>{timeAgo(entry.createdAt)}</span>
                  <Link href={`/${locale}/attachments`} className="text-[var(--nvi-text-muted)] hover:text-[var(--nvi-text)] underline transition-colors">
                    {t('viewAttachments')}
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      }
      pagination={
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          itemCount={returns.length}
          availablePages={Object.keys(pageCursors).map(Number)}
          hasNext={!!nextCursor}
          hasPrev={page > 1}
          isLoading={isLoading}
          onPageChange={(p) => load(p)}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setPageCursors({ 1: null });
            setTotal(null);
            load(1, size);
          }}
        />
      }
    />
    <SupplierReturnCreateModal
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      form={form}
      onFormChange={setForm}
      lines={lines}
      onUpdateLine={updateLine}
      onAddLine={addLine}
      onRemoveLine={removeLine}
      branches={branches}
      suppliers={suppliers}
      variants={variants}
      units={units}
      purchases={purchases}
      purchaseOrders={purchaseOrders}
      receivings={receivings}
      formatDocLabel={formatDocLabel}
      loadVariantOptions={loadVariantOptions}
      getVariantOption={getVariantOption}
      onSubmit={createReturn}
      isCreating={isCreating}
      canWrite={canWrite}
    />
    </>
  );
}
