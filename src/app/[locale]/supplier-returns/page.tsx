'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { DatePickerInput } from '@/components/DatePickerInput';
import { StatusBanner } from '@/components/StatusBanner';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
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
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';
import { useFormatDate } from '@/lib/business-context';

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
  status: string;
  reason?: string | null;
  createdAt: string;
  supplier?: Supplier;
  branch?: Branch;
  lines: {
    variantId: string;
    quantity: string;
    unitCost: string;
    unitId?: string;
    variant?: Variant;
  }[];
};

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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [returns, setReturns] = useState<SupplierReturn[]>([]);
  const [message, setMessage] = useToastState();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [approvalNotice, setApprovalNotice] = useState<{
    action: string;
    approvalId?: string;
  } | null>(null);
  const [receivings, setReceivings] = useState<ReceivingLine[]>([]);
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
      ? parts.join(' • ')
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
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'PENDING', label: common('statusPending') },
      { value: 'REJECTED', label: common('statusRejected') },
      { value: 'COMPLETED', label: common('statusCompleted') },
    ],
    [common],
  );

  const returnStatusLabels = useMemo<Record<string, string>>(
    () => ({
      PENDING: common('statusPending'),
      APPROVED: common('statusApproved'),
      COMPLETED: common('statusCompleted'),
      CANCELLED: common('statusCancelled'),
    }),
    [common],
  );

  const getStatusStyle = (status: string): string => {
    switch (status) {
      case 'APPROVED': return 'border-blue-500/50 bg-blue-500/10 text-blue-200';
      case 'COMPLETED': return 'border-green-500/50 bg-green-500/10 text-green-200';
      case 'PENDING': return 'border-amber-500/50 bg-amber-500/10 text-amber-200';
      case 'CANCELLED': return 'border-red-500/50 bg-red-500/10 text-red-300';
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
  const pendingCount = useMemo(
    () => returns.filter((entry) => entry.status === 'PENDING').length,
    [returns],
  );
  const completedCount = useMemo(
    () => returns.filter((entry) => entry.status === 'COMPLETED').length,
    [returns],
  );

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

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
      ] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', { token }),
        apiFetch<PaginatedResponse<Supplier> | Supplier[]>('/suppliers?limit=200', { token }),
        apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', { token }),
        loadUnits(token),
        apiFetch<PaginatedResponse<Purchase> | Purchase[]>('/purchases?limit=200', { token }),
        apiFetch<PaginatedResponse<PurchaseOrder> | PurchaseOrder[]>('/purchase-orders?limit=200', { token }),
        apiFetch<PaginatedResponse<ReceivingLine> | ReceivingLine[]>('/receiving?limit=200', { token }),
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
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    }
  }, [setMessage, t]);

  const load = useCallback(async (cursor?: string, append = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    const token = getAccessToken();
    if (!token) {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
      return;
    }
    try {
      const query = buildCursorQuery({
        limit: 20,
        cursor,
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
      setReturns((prev) =>
        append ? [...prev, ...returnResult.items] : returnResult.items,
      );
      setNextCursor(returnResult.nextCursor);
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
  }, [effectiveFilterBranchId, filters.search, filters.status, filters.supplierId, filters.from, filters.to, t]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (activeBranch?.id && !form.branchId) {
      setForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
  }, [activeBranch?.id, form.branchId]);

  useEffect(() => {
    load().catch((err) => {
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
      setMessage({ action: 'create', outcome: 'success', message: t('created') });
      await load();
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
            <span className="status-chip">{t('badgeSupplierReturns')}</span>
            <span className="status-chip">{t('badgeLive')}</span>
          </>
        }
        actions={
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        }
      />
      {message ? <StatusBanner message={message} /> : null}
      {approvalNotice ? (
        <div className="rounded border border-gold-500/60 bg-gold-500/10 p-3 text-sm text-gold-100">
          <p className="font-semibold">{approvalNotice.action}</p>
          <p className="text-xs text-gold-300">
            {t('approvalRequired', {
              id: approvalNotice.approvalId ?? '',
            })}
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiOpenCases')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{returns.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiPending')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{pendingCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiCompleted')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{completedCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiLinkedReceipts')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{receivings.length}</p>
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
            instanceId="form-branch"
            value={form.branchId}
            onChange={(value) => setForm({ ...form, branchId: value })}
            placeholder={t('selectBranch')}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
          />
          <SmartSelect
            instanceId="form-supplier"
            value={form.supplierId}
            onChange={(value) => setForm({ ...form, supplierId: value })}
            placeholder={t('selectSupplier')}
            options={suppliers.map((supplier) => ({
              value: supplier.id,
              label: `${supplier.name} (${supplier.status})`,
            }))}
          />
          <SmartSelect
            instanceId="form-purchase"
            value={form.purchaseId}
            onChange={(value) => setForm({ ...form, purchaseId: value })}
            placeholder={t('linkPurchaseOptional')}
            options={purchases.map((purchase) => ({
              value: purchase.id,
              label: formatDocLabel(purchase),
            }))}
            isClearable
          />
          <SmartSelect
            instanceId="form-purchase-order"
            value={form.purchaseOrderId}
            onChange={(value) => setForm({ ...form, purchaseOrderId: value })}
            placeholder={t('linkPurchaseOrderOptional')}
            options={purchaseOrders.map((order) => ({
              value: order.id,
              label: formatDocLabel(order),
            }))}
            isClearable
          />
          <input
            value={form.reason}
            onChange={(event) => setForm({ ...form, reason: event.target.value })}
            placeholder={t('reasonOptional')}
            className="md:col-span-2 rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        <p className="text-xs text-gold-400">
          {t('receivingHint')}
        </p>
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="grid gap-2 md:grid-cols-6">
              <AsyncSmartSelect
                instanceId={`line-${line.id}-variant`}
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
                  updateLine(line.id, {
                    variantId: value,
                    unitId:
                      variant?.sellUnitId ??
                      variant?.baseUnitId ??
                      line.unitId,
                  });
                }}
                placeholder={t('variant')}
                isClearable
                className="nvi-select-container"
              />
              <input
                value={line.quantity}
                onChange={(event) =>
                  updateLine(line.id, { quantity: event.target.value })
                }
                placeholder={t('quantity')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <SmartSelect
                instanceId={`line-${line.id}-unit`}
                value={line.unitId}
                onChange={(value) => updateLine(line.id, { unitId: value })}
                placeholder={t('unit')}
                options={units.map((unit) => ({
                  value: unit.id,
                  label: buildUnitLabel(unit),
                }))}
                isClearable
                className="nvi-select-container"
              />
              <input
                value={line.unitCost}
                onChange={(event) =>
                  updateLine(line.id, { unitCost: event.target.value })
                }
                placeholder={t('unitCost')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <SmartSelect
                instanceId={`line-${line.id}-receiving`}
                value={line.receivingLineId}
                onChange={(value) =>
                  updateLine(line.id, {
                    receivingLineId: value,
                    unitId:
                      receivings.find((entry) => entry.id === value)?.unitId ??
                      line.unitId,
                  })
                }
                placeholder={t('receivingLineOptional')}
                options={receivings
                  .filter((receiving) =>
                    line.variantId ? receiving.variant?.id === line.variantId : true,
                  )
                  .map((receiving) => {
                    const unit = receiving.unitId
                      ? units.find((item) => item.id === receiving.unitId) ?? null
                      : null;
                    const unitLabel = unit
                      ? buildUnitLabel(unit)
                      : receiving.unitId ?? '';
                    return {
                      value: receiving.id,
                      label: t('receivingOption', {
                        name: formatVariantLabel(
                          {
                            id: receiving.variant?.id ?? null,
                            name: receiving.variant?.name ?? null,
                            productName: receiving.variant?.product?.name ?? null,
                          },
                          t('variantFallback'),
                        ),
                        qty: receiving.quantity,
                        unit: unitLabel,
                        date: formatDate(receiving.receivedAt),
                      }),
                    };
                  })}
                isClearable
              />
              <button
                type="button"
                onClick={() => removeLine(line.id)}
                disabled={!canWrite}
                title={!canWrite ? noAccess('title') : undefined}
                className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:opacity-60"
              >
                {actions('remove')}
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addLine}
            disabled={!canWrite}
            title={!canWrite ? noAccess('title') : undefined}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:opacity-60"
          >
            {t('addLine')}
          </button>
          <button
            type="button"
            onClick={createReturn}
            className="nvi-cta inline-flex items-center gap-2 rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isCreating || !canWrite}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isCreating ? <Spinner size="xs" variant="orbit" /> : null}
            {isCreating ? t('creating') : t('createReturn')}
          </button>
        </div>
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('recentTitle')}</h3>
        {viewMode === 'table' ? (
          !returns.length ? (
            <StatusBanner message={t('noReturns')} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[640px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{common('supplier')}</th>
                    <th className="px-3 py-2">{common('branch')}</th>
                    <th className="px-3 py-2">{common('status')}</th>
                    <th className="px-3 py-2">{t('reasonOptional')}</th>
                    <th className="px-3 py-2">{common('date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((entry) => (
                    <tr key={entry.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-gold-100">{entry.supplier?.name ?? t('supplierFallback')}</p>
                        <p className="text-[11px] text-gold-500">#{shortId(entry.id)}</p>
                      </td>
                      <td className="px-3 py-2 text-gold-300">{entry.branch?.name ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-2 py-0.5 text-[11px] ${getStatusStyle(entry.status)}`}>
                          {returnStatusLabels[entry.status] ?? entry.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gold-400">{entry.reason ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-gold-300">
                        {formatDate(entry.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
        {viewMode === 'cards' ? <div className="space-y-3 text-sm text-gold-200">
          {returns.map((entry) => (
            <div
              key={entry.id}
              className="rounded border border-gold-700/30 bg-black/40 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gold-100">
                      {entry.supplier?.name ?? t('supplierFallback')}
                    </p>
                    <span className={`rounded border px-2 py-0.5 text-[11px] ${getStatusStyle(entry.status)}`}>
                      {returnStatusLabels[entry.status] ?? entry.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gold-400">
                    {entry.branch?.name ? <span>{entry.branch.name}</span> : null}
                    <span>#{shortId(entry.id)}</span>
                    <span>{formatDate(entry.createdAt)}</span>
                    {entry.reason ? (
                      <span className="rounded bg-gold-900/30 px-2 py-0.5 text-[11px] text-gold-300">
                        {entry.reason}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              {entry.lines.length > 0 ? (
                <ul className="space-y-1 border-t border-gold-700/20 pt-2">
                  {entry.lines.map((line, index) => {
                    const unit = line.unitId
                      ? units.find((item) => item.id === line.unitId) ?? null
                      : null;
                    const unitLabel = unit ? buildUnitLabel(unit) : line.unitId ?? '';
                    return (
                      <li key={`${entry.id}-${index}`} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                        <span className="font-medium text-gold-300 max-w-[45%] truncate">
                          {formatVariantLabel(
                            {
                              id: line.variantId,
                              name: line.variant?.name ?? null,
                              productName: line.variant?.product?.name ?? null,
                            },
                            common('unknown'),
                          )}
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
          {!returns.length ? (
            <StatusBanner message={t('noReturns')} />
          ) : null}
        </div> : null}
        {nextCursor ? (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => load(nextCursor, true)}
              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-4 py-2 text-sm text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isLoadingMore}
            >
              {isLoadingMore ? <Spinner size="xs" variant="grid" /> : null}
              {isLoadingMore ? actions('loading') : actions('loadMore')}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
