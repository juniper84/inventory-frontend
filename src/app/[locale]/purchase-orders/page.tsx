'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import type { Dispatch, SetStateAction } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatEntityLabel, formatVariantLabel, shortId } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';
import { useFormatDate } from '@/lib/business-context';

type Branch = { id: string; name: string };
type Supplier = { id: string; name: string; status: string; leadTimeDays?: number | null };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name?: string | null };
  defaultCost?: number | string | null;
};
type PurchaseOrderLine = {
  id: string;
  variantId: string;
  quantity: string;
  unitCost: string;
  unitId: string;
};
type PurchaseOrderListLine = {
  variantId: string;
  quantity: string;
  unitCost: string;
  unitId?: string;
  variant?: { name?: string | null; product?: { name?: string | null } | null } | null;
};
type PurchaseOrder = {
  id: string;
  status: string;
  createdAt: string;
  expectedAt?: string | null;
  branch?: Branch;
  supplier?: Supplier;
  lines: PurchaseOrderListLine[];
};

type ReorderSuggestion = {
  id: string;
  branchId: string;
  variantId: string;
  suggestedQuantity: number;
  variant?: { name?: string | null };
};

export default function PurchaseOrdersPage() {
  const t = useTranslations('purchaseOrdersPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const { formatDate } = useFormatDate();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('purchases.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [message, setMessage] = useToastState();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [total, setTotal] = useState<number | null>(null);
  const [approvalNotice, setApprovalNotice] = useState<{
    action: string;
    approvalId?: string;
  } | null>(null);
  const [form, setForm] = useState({ branchId: '', supplierId: '', expectedAt: '' });
  const { activeBranch, resolveBranchId } = useBranchScope();
  const [lines, setLines] = useState<PurchaseOrderLine[]>([
    { id: crypto.randomUUID(), variantId: '', quantity: '', unitCost: '', unitId: '' },
  ]);
  const [updateForm, setUpdateForm] = useState({
    purchaseOrderId: '',
    expectedAt: '',
  });
  const [updateLines, setUpdateLines] = useState<PurchaseOrderLine[]>([
    { id: crypto.randomUUID(), variantId: '', quantity: '', unitCost: '', unitId: '' },
  ]);
  const [reorderSuggestions, setReorderSuggestions] = useState<ReorderSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const { loadOptions: loadVariantOptions, seedCache: seedVariantCache, getVariantOption } = useVariantSearch();
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
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'DRAFT', label: common('statusDraft') },
      { value: 'PENDING_APPROVAL', label: common('statusPending') },
      { value: 'APPROVED', label: common('statusApproved') },
      { value: 'PARTIALLY_RECEIVED', label: common('statusPartial') },
      { value: 'FULLY_RECEIVED', label: common('statusReceived') },
      { value: 'CLOSED', label: common('statusClosed') },
      { value: 'CANCELLED', label: common('statusCancelled') },
    ],
    [common],
  );

  const orderStatusLabels = useMemo<Record<string, string>>(
    () => ({
      DRAFT: common('statusDraft'),
      PENDING: common('statusPending'),
      APPROVED: common('statusApproved'),
      PARTIAL: common('statusPartial'),
      RECEIVED: common('statusReceived'),
      CANCELLED: common('statusCancelled'),
    }),
    [common],
  );

  const getStatusStyle = (status: string): string => {
    switch (status) {
      case 'APPROVED': return 'border-blue-500/50 bg-blue-500/10 text-blue-200';
      case 'FULLY_RECEIVED': case 'RECEIVED': return 'border-green-500/50 bg-green-500/10 text-green-200';
      case 'PENDING_APPROVAL': case 'PENDING': return 'border-amber-500/50 bg-amber-500/10 text-amber-200';
      case 'PARTIALLY_RECEIVED': case 'PARTIAL': return 'border-purple-500/50 bg-purple-500/10 text-purple-200';
      case 'CANCELLED': return 'border-red-500/50 bg-red-500/10 text-red-300';
      case 'DRAFT': return 'border-gold-700/50 bg-black/40 text-gold-400';
      case 'CLOSED': return 'border-gray-600/50 bg-gray-900/40 text-gray-400';
      default: return 'border-gold-700/50 bg-black/40 text-gold-400';
    }
  };

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

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

  const selectedSupplier = suppliers.find((supplier) => supplier.id === form.supplierId);
  const supplierEta =
    selectedSupplier?.leadTimeDays && selectedSupplier.leadTimeDays > 0
      ? new Date(Date.now() + selectedSupplier.leadTimeDays * 24 * 60 * 60 * 1000)
      : null;
  const resolveVariantLabel = (
    variantId: string,
    inlineVariant?: { name?: string | null; product?: { name?: string | null } | null } | null,
  ) => {
    // Prefer inline data included in the API response
    if (inlineVariant) {
      return formatVariantLabel(
        { id: variantId, name: inlineVariant.name ?? null, productName: inlineVariant.product?.name ?? null },
        common('unknown'),
      );
    }
    // Fall back to local reference cache
    const cached = variants.find((item) => item.id === variantId);
    if (cached) {
      return formatVariantLabel(
        { id: cached.id, name: cached.name, productName: cached.product?.name ?? null },
        common('unknown'),
      );
    }
    return formatEntityLabel({ id: variantId }, common('unknown'));
  };
  const formatOrderLabel = (order: PurchaseOrder) => {
    const dateLabel = order.createdAt
      ? formatDate(order.createdAt)
      : null;
    const parts = [
      order.supplier?.name ?? order.branch?.name ?? null,
      dateLabel,
      order.status,
    ].filter(Boolean);
    return parts.length
      ? parts.join(' • ')
      : formatEntityLabel({ id: order.id }, common('unknown'));
  };
  const pendingApprovalCount = useMemo(
    () => orders.filter((order) => order.status === 'PENDING_APPROVAL').length,
    [orders],
  );
  const approvedCount = useMemo(
    () =>
      orders.filter((order) =>
        ['APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED'].includes(order.status),
      ).length,
    [orders],
  );
  const expectedSoonCount = useMemo(() => {
    const inAWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return orders.filter((order) => {
      if (!order.expectedAt) return false;
      const ts = new Date(order.expectedAt).getTime();
      return Number.isFinite(ts) && ts <= inAWeek;
    }).length;
  }, [orders]);

  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const [branchData, supplierData, variantData, unitList] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', { token }),
        apiFetch<PaginatedResponse<Supplier> | Supplier[]>('/suppliers?limit=200', { token }),
        apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', { token }),
        loadUnits(token),
      ]);
      setBranches(normalizePaginated(branchData).items);
      setSuppliers(normalizePaginated(supplierData).items);
      setVariants(normalizePaginated(variantData).items);
      seedVariantCache(normalizePaginated(variantData).items);
      setUnits(unitList);
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
        search: filters.search || undefined,
        status: filters.status || undefined,
        branchId: effectiveFilterBranchId || undefined,
        supplierId: filters.supplierId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const orderData = await apiFetch<PaginatedResponse<PurchaseOrder> | PurchaseOrder[]>(
        `/purchase-orders${query}`,
        { token },
      );
      const ordersResult = normalizePaginated(orderData);
      setOrders(ordersResult.items);
      setNextCursor(ordersResult.nextCursor);
      if (typeof ordersResult.total === 'number') {
        setTotal(ordersResult.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (ordersResult.nextCursor) {
          nextState[targetPage + 1] = ordersResult.nextCursor;
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
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [load]);

  useEffect(() => {
    if (activeBranch?.id && !form.branchId) {
      setForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
  }, [activeBranch?.id, form.branchId]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !effectiveFormBranchId) {
      setReorderSuggestions([]);
      return;
    }
    setIsLoadingSuggestions(true);
    apiFetch<ReorderSuggestion[]>(
      `/stock/reorder-suggestions?branchId=${effectiveFormBranchId}`,
      { token },
    )
      .then((data) => setReorderSuggestions(data))
      .catch((err) => {
        setReorderSuggestions([]);
        setMessage({
          action: 'load',
          outcome: 'failure',
          message: getApiErrorMessage(err, t('loadFailed')),
        });
      })
      .finally(() => setIsLoadingSuggestions(false));
  }, [effectiveFormBranchId]);

  const updateLine = (
    id: string,
    patch: Partial<PurchaseOrderLine>,
    setter: Dispatch<SetStateAction<PurchaseOrderLine[]>>,
  ) => {
    setter((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  };

  const addLine = (setter: Dispatch<SetStateAction<PurchaseOrderLine[]>>) => {
    setter((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        variantId: '',
        quantity: '',
        unitCost: '',
        unitId: '',
      },
    ]);
  };

  const removeLine = (
    id: string,
    setter: Dispatch<SetStateAction<PurchaseOrderLine[]>>,
  ) => {
    setter((prev) => prev.filter((line) => line.id !== id));
  };

  const createOrder = async () => {
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
        unitId: line.unitId || undefined,
      }));
    if (!payloadLines.length) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      const result = await apiFetch('/purchase-orders', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: effectiveFormBranchId,
          supplierId: form.supplierId,
          expectedAt: form.expectedAt || undefined,
          lines: payloadLines,
        }),
      });
      if (result && typeof result === 'object' && 'approvalRequired' in result) {
        setApprovalNotice({
          action: t('approvalCreated'),
          approvalId: (result as { approvalId?: string }).approvalId,
        });
      }
      setForm({ branchId: '', supplierId: '', expectedAt: '' });
      setLines([
        {
          id: crypto.randomUUID(),
          variantId: '',
          quantity: '',
          unitCost: '',
          unitId: '',
        },
      ]);
      await load(1);
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

  const approveOrder = async (orderId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setMessage(null);
    setActionBusy((prev) => ({ ...prev, [orderId]: true }));
    try {
      const result = await apiFetch(`/purchase-orders/${orderId}/approve`, {
        token,
        method: 'POST',
      });
      if (result && typeof result === 'object' && 'approvalRequired' in result) {
        setApprovalNotice({
          action: t('approvalRequested'),
          approvalId: (result as { approvalId?: string }).approvalId,
        });
      } else {
        setMessage({ action: 'approve', outcome: 'success', message: t('approved') });
      }
      await load(page);
    } catch (err) {
      setMessage({
        action: 'approve',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('approveFailed')),
      });
    } finally {
      setActionBusy((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const loadSuggestionLines = () => {
    if (!reorderSuggestions.length) {
      return;
    }
    setLines(
      reorderSuggestions.map((suggestion) => {
        const variant = variants.find((item) => item.id === suggestion.variantId);
        const fallbackCost =
          variant?.defaultCost !== null && variant?.defaultCost !== undefined
            ? String(variant.defaultCost)
            : '';
        return {
          id: crypto.randomUUID(),
          variantId: suggestion.variantId,
          quantity: String(suggestion.suggestedQuantity),
          unitCost: fallbackCost,
          unitId: variant?.sellUnitId ?? variant?.baseUnitId ?? '',
        };
      }),
    );
  };

  const updateOrder = async () => {
    const token = getAccessToken();
    if (!token || !updateForm.purchaseOrderId) {
      return;
    }
    const payloadLines = updateLines
      .filter((line) => line.variantId && line.quantity && line.unitCost)
      .map((line) => ({
        variantId: line.variantId,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
        unitId: line.unitId || undefined,
      }));
    if (!payloadLines.length) {
      return;
    }
    setMessage(null);
    setIsUpdating(true);
    try {
      const result = await apiFetch(`/purchase-orders/${updateForm.purchaseOrderId}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          lines: payloadLines,
          expectedAt: updateForm.expectedAt || undefined,
        }),
      });
      if (result && typeof result === 'object' && 'approvalRequired' in result) {
        setApprovalNotice({
          action: t('updateRequested'),
          approvalId: (result as { approvalId?: string }).approvalId,
        });
      }
      setUpdateForm({ purchaseOrderId: '', expectedAt: '' });
      setUpdateLines([
        {
          id: crypto.randomUUID(),
          variantId: '',
          quantity: '',
          unitCost: '',
          unitId: '',
        },
      ]);
      await load(page);
      setMessage({ action: 'update', outcome: 'success', message: t('updated') });
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('updateFailed')),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="nvi-page">
      <PremiumPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="status-chip">{t('badgeLive')}</span>
            <span className="status-chip">{t('badgeWarehouse')}</span>
          </>
        }
        actions={
          <>
            <Link
              href={`/${locale}/purchase-orders/wizard`}
              className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
            >
              {t('openWizard')}
            </Link>
            <ViewToggle
              value={viewMode}
              onChange={setViewMode}
              labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
            />
          </>
        }
      />
      {message ? <StatusBanner message={message} /> : null}
      {approvalNotice ? (
        <div className="rounded border border-gold-500/60 bg-gold-500/10 p-3 text-sm text-gold-100">
          <p className="font-semibold">{approvalNotice.action}</p>
          <p className="text-xs text-gold-300">
            {t('approvalRequired', { id: approvalNotice.approvalId ?? '' })}
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiOpenOrders')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{orders.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiPendingApproval')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{pendingApprovalCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiApprovedFlow')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{approvedCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiDueIn7Days')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{expectedSoonCount}</p>
        </article>
      </div>
      <div className="command-card nvi-reveal nvi-panel p-4">
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
            instanceId="po-filter-status"
            value={filters.status}
            onChange={(value) => pushFilters({ status: value })}
            options={statusOptions}
            placeholder={common('status')}
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="po-filter-branch"
            value={filters.branchId}
            onChange={(value) => pushFilters({ branchId: value })}
            options={branchOptions}
            placeholder={common('branch')}
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="po-filter-supplier"
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
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <DatePickerInput
            value={filters.to}
            onChange={(value) => pushFilters({ to: value })}
            placeholder={common('toDate')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </ListFilters>
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('createTitle')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            instanceId="po-create-branch"
            value={form.branchId}
            onChange={(value) => setForm({ ...form, branchId: value })}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            placeholder={t('selectBranch')}
            isClearable
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="po-create-supplier"
            value={form.supplierId}
            onChange={(value) => setForm({ ...form, supplierId: value })}
            options={suppliers.map((supplier) => ({
              value: supplier.id,
              label: `${supplier.name} (${supplier.status})`,
            }))}
            placeholder={t('selectSupplier')}
            isClearable
            className="nvi-select-container"
          />
          <input
            type="date"
            value={form.expectedAt}
            onChange={(event) => setForm({ ...form, expectedAt: event.target.value })}
            placeholder={t('expectedAt')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          {supplierEta ? (
            <div className="rounded border border-gold-700/40 bg-black/40 px-3 py-2 text-xs text-gold-200">
              {t('leadTimeHint', { days: selectedSupplier?.leadTimeDays ?? 0 })}
              <div className="text-gold-400">
                {t('etaHint', { date: formatDate(supplierEta) })}
              </div>
            </div>
          ) : (
            <div className="rounded border border-gold-700/20 bg-black/30 px-3 py-2 text-xs text-gold-400">
              {t('leadTimeMissing')}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gold-200">
          <button
            type="button"
            onClick={loadSuggestionLines}
            disabled={!reorderSuggestions.length}
            className="rounded border border-gold-700/50 px-3 py-1 text-gold-100 disabled:opacity-50"
          >
            {t('useReorderSuggestions')}
          </button>
          <span>
            {isLoadingSuggestions
              ? t('loadingSuggestions')
              : t('suggestionsReady', { count: reorderSuggestions.length })}
          </span>
        </div>
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="grid gap-2 md:grid-cols-5">
              <AsyncSmartSelect
                instanceId={`po-create-line-${line.id}-variant`}
                value={getVariantOption(line.variantId)}
                loadOptions={loadVariantOptions}
                defaultOptions={variants.map((variant) => ({
                  value: variant.id,
                  label: formatVariantLabel({
                    id: variant.id,
                    name: variant.name,
                    productName: variant.product?.name ?? null,
                  }),
                }))}
                onChange={(opt) => {
                  const value = opt?.value ?? '';
                  const variant = variants.find((item) => item.id === value);
                  updateLine(
                    line.id,
                    {
                      variantId: value,
                      unitId: variant?.sellUnitId ?? variant?.baseUnitId ?? line.unitId,
                    },
                    setLines,
                  );
                }}
                placeholder={t('variant')}
                isClearable
                className="nvi-select-container"
              />
              <input
                value={line.quantity}
                onChange={(event) =>
                  updateLine(line.id, { quantity: event.target.value }, setLines)
                }
                placeholder={t('quantity')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <SmartSelect
                instanceId={`po-create-line-${line.id}-unit`}
                value={line.unitId}
                onChange={(value) =>
                  updateLine(line.id, { unitId: value }, setLines)
                }
                options={units.map((unit) => ({
                  value: unit.id,
                  label: buildUnitLabel(unit),
                }))}
                placeholder={t('unit')}
                isClearable
                className="nvi-select-container"
              />
              <input
                value={line.unitCost}
                onChange={(event) =>
                  updateLine(line.id, { unitCost: event.target.value }, setLines)
                }
                placeholder={t('unitCost')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <button
                type="button"
                onClick={() => removeLine(line.id, setLines)}
                className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
              >
                {actions('remove')}
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => addLine(setLines)}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {t('addLine')}
          </button>
          <button
            type="button"
            onClick={createOrder}
            className="nvi-cta inline-flex items-center gap-2 rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite || isCreating}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isCreating ? <Spinner size="xs" variant="orbit" /> : null}
            {isCreating ? t('creating') : t('createAction')}
          </button>
        </div>
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('updateTitle')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            instanceId="po-update-order"
            value={updateForm.purchaseOrderId}
            onChange={(value) =>
              setUpdateForm((prev) => ({ ...prev, purchaseOrderId: value }))
            }
            options={orders.map((order) => ({
              value: order.id,
              label: formatOrderLabel(order),
            }))}
            placeholder={t('selectOrder')}
            isClearable
            className="nvi-select-container"
          />
          <input
            type="date"
            value={updateForm.expectedAt}
            onChange={(event) =>
              setUpdateForm({ ...updateForm, expectedAt: event.target.value })
            }
            placeholder={t('expectedAt')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        {updateForm.purchaseOrderId ? (
          <p className="text-xs text-gold-400">
            {t('editApprovalHint')}
          </p>
        ) : null}
        <div className="space-y-2">
          {updateLines.map((line) => (
            <div key={line.id} className="grid gap-2 md:grid-cols-5">
              <AsyncSmartSelect
                instanceId={`po-update-line-${line.id}-variant`}
                value={getVariantOption(line.variantId)}
                loadOptions={loadVariantOptions}
                defaultOptions={variants.map((variant) => ({
                  value: variant.id,
                  label: formatVariantLabel({
                    id: variant.id,
                    name: variant.name,
                    productName: variant.product?.name ?? null,
                  }),
                }))}
                onChange={(opt) => {
                  const value = opt?.value ?? '';
                  const variant = variants.find((item) => item.id === value);
                  updateLine(
                    line.id,
                    {
                      variantId: value,
                      unitId: variant?.sellUnitId ?? variant?.baseUnitId ?? line.unitId,
                    },
                    setUpdateLines,
                  );
                }}
                placeholder={t('variant')}
                isClearable
                className="nvi-select-container"
              />
              <input
                value={line.quantity}
                onChange={(event) =>
                  updateLine(line.id, { quantity: event.target.value }, setUpdateLines)
                }
                placeholder={t('quantity')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <SmartSelect
                instanceId={`po-update-line-${line.id}-unit`}
                value={line.unitId}
                onChange={(value) =>
                  updateLine(line.id, { unitId: value }, setUpdateLines)
                }
                options={units.map((unit) => ({
                  value: unit.id,
                  label: buildUnitLabel(unit),
                }))}
                placeholder={t('unit')}
                isClearable
                className="nvi-select-container"
              />
              <input
                value={line.unitCost}
                onChange={(event) =>
                  updateLine(line.id, { unitCost: event.target.value }, setUpdateLines)
                }
                placeholder={t('unitCost')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <button
                type="button"
                onClick={() => removeLine(line.id, setUpdateLines)}
                className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
              >
                {actions('remove')}
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => addLine(setUpdateLines)}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {t('addLine')}
          </button>
          <button
            type="button"
            onClick={updateOrder}
            className="nvi-cta inline-flex items-center gap-2 rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite || isUpdating}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isUpdating ? <Spinner size="xs" variant="pulse" /> : null}
            {isUpdating ? t('updating') : t('updateAction')}
          </button>
        </div>
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('recentTitle')}</h3>
        {viewMode === 'table' ? (
          <div className="overflow-auto text-sm text-gold-200">
            {!orders.length ? (
              <StatusBanner message={t('noOrders')} />
            ) : (
              <table className="min-w-[640px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('supplier')}</th>
                    <th className="px-3 py-2">{t('branch')}</th>
                    <th className="px-3 py-2">{t('status')}</th>
                    <th className="px-3 py-2">{t('expectedAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-gold-100">{order.supplier?.name ?? '—'}</p>
                        <p className="text-[11px] text-gold-500">{formatDate(order.createdAt)}</p>
                      </td>
                      <td className="px-3 py-2 text-gold-300">{order.branch?.name ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-2 py-0.5 text-[11px] ${getStatusStyle(order.status)}`}>
                          {orderStatusLabels[order.status] ?? order.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gold-300">
                        {order.expectedAt
                          ? formatDate(order.expectedAt)
                          : t('expectedAtMissing')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-sm text-gold-200">
            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded border border-gold-700/30 bg-black/40 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gold-100">
                        {order.supplier?.name ?? t('supplierFallback')}
                      </p>
                      <span className={`rounded border px-2 py-0.5 text-[11px] ${getStatusStyle(order.status)}`}>
                        {orderStatusLabels[order.status] ?? order.status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gold-400">
                      {order.branch?.name ? <span>{order.branch.name}</span> : null}
                      <span>{formatDate(order.createdAt)}</span>
                      {order.expectedAt ? (
                        <span className="text-gold-300">
                          {t('expectedAtLabel', { date: formatDate(order.expectedAt) })}
                        </span>
                      ) : (
                        <span className="text-gold-600">{t('expectedAtMissing')}</span>
                      )}
                    </div>
                  </div>
                  {(order.status === 'DRAFT' || order.status === 'PENDING_APPROVAL') && canWrite ? (
                    <button
                      type="button"
                      onClick={() => approveOrder(order.id)}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded border border-gold-700/50 px-3 py-1.5 text-xs text-gold-100 hover:border-gold-500/60 disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={actionBusy[order.id]}
                      title={!canWrite ? noAccess('title') : undefined}
                    >
                      {actionBusy[order.id] ? <Spinner size="xs" variant="grid" /> : null}
                      {actionBusy[order.id] ? t('approving') : actions('approve')}
                    </button>
                  ) : null}
                </div>
                {order.lines.length > 0 ? (
                  <ul className="space-y-1 border-t border-gold-700/20 pt-2">
                    {order.lines.map((line, index) => {
                      const unit = line.unitId
                        ? units.find((item) => item.id === line.unitId) ?? null
                        : null;
                      const unitLabel = unit ? buildUnitLabel(unit) : line.unitId ?? '';
                      return (
                        <li key={`${order.id}-${index}`} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                          <span className="font-medium text-gold-300 max-w-[45%] truncate">
                            {resolveVariantLabel(line.variantId, line.variant)}
                          </span>
                          <span className="text-gold-600">·</span>
                          <span className="text-gold-400">{line.quantity} {unitLabel}</span>
                          <span className="text-gold-600">·</span>
                          <span className="text-gold-400">{line.unitCost}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ))}
            {!orders.length ? <StatusBanner message={t('noOrders')} /> : null}
          </div>
        )}
        <div className="pt-2">
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            itemCount={orders.length}
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
        </div>
      </div>
    </section>
  );
}
