'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { StatusBanner } from '@/components/StatusBanner';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatEntityLabel, formatVariantLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';

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
  const activeBranch = useActiveBranch();
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
    const dateLabel = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : null;
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

  const branchOptions = useMemo(
    () => [
      { value: '', label: common('allBranches') },
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

  const load = async (cursor?: string, append = false) => {
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
        branchId: filters.branchId || undefined,
        supplierId: filters.supplierId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      });
      const [
        branchData,
        supplierData,
        variantData,
        unitList,
        purchaseData,
        poData,
        returnData,
        receivingData,
      ] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<Supplier> | Supplier[]>('/suppliers?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
          token,
        }),
        loadUnits(token),
        apiFetch<PaginatedResponse<Purchase> | Purchase[]>('/purchases?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<PurchaseOrder> | PurchaseOrder[]>(
          '/purchase-orders?limit=200',
          { token },
        ),
        apiFetch<PaginatedResponse<SupplierReturn> | SupplierReturn[]>(
          `/supplier-returns${query}`,
          { token },
        ),
        apiFetch<PaginatedResponse<ReceivingLine> | ReceivingLine[]>(
          '/receiving?limit=200',
          { token },
        ),
      ]);
      setBranches(normalizePaginated(branchData).items);
      setSuppliers(normalizePaginated(supplierData).items);
      setVariants(normalizePaginated(variantData).items);
      setUnits(unitList);
      setPurchases(normalizePaginated(purchaseData).items);
      setPurchaseOrders(normalizePaginated(poData).items);
      const returnResult = normalizePaginated(returnData);
      setReturns((prev) =>
        append ? [...prev, ...returnResult.items] : returnResult.items,
      );
      setNextCursor(returnResult.nextCursor);
      setReceivings(normalizePaginated(receivingData).items);
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
  }, [
    filters.search,
    filters.status,
    filters.branchId,
    filters.supplierId,
    filters.from,
    filters.to,
  ]);

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
    if (!token || !form.branchId || !form.supplierId) {
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
          branchId: form.branchId,
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
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
      <p className="text-sm text-gold-300">{t('subtitle')}</p>
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
          value={filters.branchId}
          onChange={(value) => pushFilters({ branchId: value })}
          options={branchOptions}
          placeholder={common('branch')}
          className="nvi-select-container"
        />
        <SmartSelect
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

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('createTitle')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            value={form.branchId}
            onChange={(value) => setForm({ ...form, branchId: value })}
            placeholder={t('selectBranch')}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
          />
          <SmartSelect
            value={form.supplierId}
            onChange={(value) => setForm({ ...form, supplierId: value })}
            placeholder={t('selectSupplier')}
            options={suppliers.map((supplier) => ({
              value: supplier.id,
              label: `${supplier.name} (${supplier.status})`,
            }))}
          />
          <SmartSelect
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
            value={form.purchaseOrderId}
            onChange={(value) => setForm({ ...form, purchaseOrderId: value })}
            placeholder={t('linkPurchaseOrderOptional')}
            options={purchaseOrders.map((order) => ({
              value: order.id,
              label: formatDocLabel(order),
            }))}
            isClearable
          />
        </div>
        <input
          value={form.reason}
          onChange={(event) => setForm({ ...form, reason: event.target.value })}
          placeholder={t('reasonOptional')}
          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <p className="text-xs text-gold-400">
          {t('receivingHint')}
        </p>
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="grid gap-2 md:grid-cols-6">
              <SmartSelect
                value={line.variantId}
                onChange={(value) => {
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
                options={variants.map((variant) => ({
                  value: variant.id,
                  label: formatVariantLabel({
                    id: variant.id,
                    name: variant.name,
                    productName: variant.product?.name ?? null,
                  }),
                }))}
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
                        date: new Date(receiving.receivedAt).toLocaleDateString(),
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
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isCreating || !canWrite}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isCreating ? <Spinner size="xs" variant="orbit" /> : null}
            {isCreating ? t('creating') : t('createReturn')}
          </button>
        </div>
      </div>

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('recentTitle')}</h3>
        <div className="space-y-3 text-sm text-gold-200">
          {returns.map((entry) => (
            <div
              key={entry.id}
              className="rounded border border-gold-700/40 bg-black/40 p-4 space-y-1"
            >
              <p className="text-gold-100">
                {entry.supplier?.name ?? t('supplierFallback')} • {entry.status}
              </p>
              <p className="text-xs text-gold-400">
                {entry.branch?.name} • {new Date(entry.createdAt).toLocaleString()}
              </p>
              {entry.reason ? (
                <p className="text-xs text-gold-400">
                  {t('reasonLabel', { reason: entry.reason })}
                </p>
              ) : null}
              <ul className="text-xs text-gold-400">
                {entry.lines.map((line, index) => {
                  const unit = line.unitId
                    ? units.find((item) => item.id === line.unitId) ?? null
                    : null;
                  const unitLabel = unit ? buildUnitLabel(unit) : line.unitId ?? '';
                  return (
                    <li key={`${entry.id}-${index}`}>
                      {t('lineSummary', {
                        variant: formatVariantLabel(
                          {
                            id: line.variantId,
                            name: line.variant?.name ?? null,
                            productName: line.variant?.product?.name ?? null,
                          },
                          common('unknown'),
                        ),
                        qty: line.quantity,
                        unit: unitLabel,
                        cost: line.unitCost,
                      })}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!returns.length ? (
            <StatusBanner message={t('noReturns')} />
          ) : null}
        </div>
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
