'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch } from '@/lib/api';
import { getAccessToken, getOrCreateDeviceId } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import {
  enqueueOfflineAction,
  getOfflineCache,
  getOfflineFlag,
  isOfflinePinRequired,
  verifyOfflinePin,
} from '@/lib/offline-store';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatEntityLabel, formatVariantLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
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
  product?: { name: string } | null;
};
type PurchaseLine = {
  id: string;
  variantId: string;
  quantity: string;
  unitCost: string;
  unitId: string;
};
type Purchase = {
  id: string;
  status: string;
  total: string;
  createdAt: string;
  supplier?: Supplier;
  branch?: Branch;
  lines: { variantId: string; quantity: string; unitCost: string; unitId?: string }[];
  payments: { id: string; method: string; amount: string; reference?: string | null }[];
};

export default function PurchasesPage() {
  const t = useTranslations('purchasesPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('purchases.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [message, setMessage] = useToastState();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const [total, setTotal] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [syncBlocked, setSyncBlocked] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [form, setForm] = useState({
    branchId: '',
    supplierId: '',
  });
  const activeBranch = useActiveBranch();
  const [lines, setLines] = useState<PurchaseLine[]>([
    { id: crypto.randomUUID(), variantId: '', quantity: '', unitCost: '', unitId: '' },
  ]);
  const [paymentForm, setPaymentForm] = useState({
    purchaseId: '',
    method: 'CASH',
    amount: '',
    reference: '',
    methodLabel: '',
  });
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
      { value: 'DRAFT', label: common('statusDraft') },
      { value: 'PENDING_APPROVAL', label: common('statusPending') },
      { value: 'APPROVED', label: common('statusApproved') },
      { value: 'PARTIALLY_RECEIVED', label: common('statusPartial') },
      { value: 'RECEIVED', label: common('statusReceived') },
      { value: 'CANCELLED', label: common('statusCancelled') },
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

  useEffect(() => {
    const handleOnline = () => setOffline(!navigator.onLine);
    handleOnline();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOnline);
    };
  }, []);

  useEffect(() => {
    if (activeBranch?.id && !form.branchId) {
      setForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
  }, [activeBranch?.id, form.branchId]);

  const load = async (targetPage = 1, nextPageSize?: number) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    if (!navigator.onLine) {
      const cache = await getOfflineCache<{
        branches?: Branch[];
        suppliers?: Supplier[];
        variants?: Variant[];
        units?: Unit[];
      }>('snapshot');
      if (!cache) {
        setMessage({ action: 'sync', outcome: 'info', message: t('offlineCacheUnavailable') });
        return;
      }
      setBranches(cache.branches ?? []);
      setSuppliers(cache.suppliers ?? []);
      setVariants(cache.variants ?? []);
      setUnits(cache.units ?? []);
      setPurchases([]);
      setNextCursor(null);
      setPage(1);
      setPageCursors({ 1: null });
      setTotal(null);
      setIsLoading(false);
      return;
    }
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor =
        targetPage === 1 ? null : pageCursors[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
        branchId: filters.branchId || undefined,
        supplierId: filters.supplierId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const [branchData, supplierData, variantData, unitList, purchaseData] =
        await Promise.all([
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
          apiFetch<PaginatedResponse<Purchase> | Purchase[]>(
            `/purchases${query}`,
            { token },
          ),
        ]);
      setBranches(normalizePaginated(branchData).items);
      setSuppliers(normalizePaginated(supplierData).items);
      setVariants(normalizePaginated(variantData).items);
      setUnits(unitList);
      const purchaseResult = normalizePaginated(purchaseData);
      setPurchases(purchaseResult.items);
      setNextCursor(purchaseResult.nextCursor);
      if (typeof purchaseResult.total === 'number') {
        setTotal(purchaseResult.total);
      }
    setPage(targetPage);
    setPageCursors((prev) => {
      const nextState: Record<number, string | null> =
        targetPage === 1 ? { 1: null } : { ...prev };
      if (purchaseResult.nextCursor) {
        nextState[targetPage + 1] = purchaseResult.nextCursor;
      }
      return nextState;
    });
    } catch {
      setMessage({ action: 'load', outcome: 'failure', message: t('loadFailed') });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [
    offline,
    filters.search,
    filters.status,
    filters.branchId,
    filters.supplierId,
    filters.from,
    filters.to,
  ]);

  useEffect(() => {
    const loadFlags = async () => {
      const blocked = (await getOfflineFlag('syncBlocked')) === 'true';
      const required = await isOfflinePinRequired();
      setSyncBlocked(blocked);
      setPinRequired(required);
    };
    loadFlags();
  }, []);

  const updateLine = (id: string, patch: Partial<PurchaseLine>) => {
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
        unitId: '',
      },
    ]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((line) => line.id !== id));
  };

  const createPurchase = async () => {
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
        unitId: line.unitId || undefined,
      }));
    if (!payloadLines.length) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    if (offline) {
      if (syncBlocked) {
        setMessage({ action: 'sync', outcome: 'warning', message: t('offlineSyncBlocked') });
        setIsCreating(false);
        return;
      }
      if (pinRequired && !pinVerified) {
        setMessage({ action: 'sync', outcome: 'warning', message: t('offlinePinRequired') });
        setIsCreating(false);
        return;
      }
      const actionId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `offline-${Date.now()}`;
      try {
        await enqueueOfflineAction({
          id: actionId,
          actionType: 'PURCHASE_DRAFT',
          payload: {
            deviceId: getOrCreateDeviceId(),
            branchId: form.branchId,
            supplierId: form.supplierId,
            lines: payloadLines,
            idempotencyKey: actionId,
          },
          provisionalAt: new Date().toISOString(),
          localAuditId: actionId,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('offlineQueueFailed');
        setMessage(message);
        setIsCreating(false);
        return;
      }
      setForm({ branchId: '', supplierId: '' });
      setLines([
        {
          id: crypto.randomUUID(),
          variantId: '',
          quantity: '',
          unitCost: '',
          unitId: '',
        },
      ]);
      setMessage({ action: 'sync', outcome: 'success', message: t('offlineQueued') });
      setIsCreating(false);
      return;
    }
    try {
      await apiFetch('/purchases', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: form.branchId,
          supplierId: form.supplierId,
          lines: payloadLines,
        }),
      });
      setForm({ branchId: '', supplierId: '' });
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
    } catch {
      setMessage({ action: 'create', outcome: 'failure', message: t('createFailed') });
    } finally {
      setIsCreating(false);
    }
  };

  const recordPayment = async () => {
    const token = getAccessToken();
    if (!token || !paymentForm.purchaseId || !paymentForm.amount) {
      return;
    }
    if (paymentForm.method === 'BANK_TRANSFER' && !paymentForm.reference) {
      setMessage({ action: 'save', outcome: 'info', message: t('bankTransferReference') });
      return;
    }
    setMessage(null);
    setIsRecording(true);
    try {
      await apiFetch(`/purchases/${paymentForm.purchaseId}/payments`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          method: paymentForm.method,
          amount: Number(paymentForm.amount),
          reference: paymentForm.reference || undefined,
          methodLabel: paymentForm.methodLabel || undefined,
        }),
      });
      setPaymentForm({
        purchaseId: '',
        method: 'CASH',
        amount: '',
        reference: '',
        methodLabel: '',
      });
      await load(page);
      setMessage({ action: 'update', outcome: 'success', message: t('paymentRecorded') });
    } catch {
      setMessage({ action: 'save', outcome: 'failure', message: t('recordFailed') });
    } finally {
      setIsRecording(false);
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
      {offline && pinRequired && !pinVerified ? (
        <div className="rounded border border-red-600/40 bg-red-950/50 p-3 text-xs text-red-200">
          <p className="font-semibold">{t('pinRequiredTitle')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              placeholder={t('pinPlaceholder')}
              className="rounded border border-red-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <button
              type="button"
              onClick={async () => {
                const ok = await verifyOfflinePin(pinInput);
                if (ok) {
                  setPinVerified(true);
                  setMessage({ action: 'sync', outcome: 'success', message: t('pinVerified') });
                } else {
                  setMessage({ action: 'sync', outcome: 'failure', message: t('pinInvalid') });
                }
                setPinInput('');
              }}
              className="rounded border border-red-700/50 px-3 py-2 text-xs text-red-100"
            >
              {t('unlock')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('createTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <SmartSelect
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
        </div>
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <SmartSelect
                value={line.variantId}
                onChange={(value) =>
                  updateLine(line.id, {
                    variantId: value,
                    unitId:
                      variants.find((variant) => variant.id === value)?.sellUnitId ||
                      variants.find((variant) => variant.id === value)?.baseUnitId ||
                      line.unitId,
                  })
                }
                options={variants.map((variant) => ({
                  value: variant.id,
                  label: formatVariantLabel({
                    id: variant.id,
                    name: variant.name,
                    productName: variant.product?.name ?? null,
                  }),
                }))}
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
                value={line.unitId}
                onChange={(value) => updateLine(line.id, { unitId: value })}
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
                  updateLine(line.id, { unitCost: event.target.value })
                }
                placeholder={t('unitCost')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <button
                type="button"
                onClick={() => removeLine(line.id)}
                className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={!canWrite}
                title={!canWrite ? noAccess('title') : undefined}
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
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {t('addLine')}
          </button>
          <button
            type="button"
            onClick={createPurchase}
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite || isCreating}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isCreating ? <Spinner size="xs" variant="orbit" /> : null}
            {isCreating ? t('creating') : t('createPurchase')}
          </button>
        </div>
      </div>

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('paymentTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="md:col-span-2">
            <SmartSelect
              value={paymentForm.purchaseId}
              onChange={(value) =>
                setPaymentForm({ ...paymentForm, purchaseId: value })
              }
              options={purchases.map((purchase) => ({
                value: purchase.id,
                label: `${
                  purchase.supplier?.name ??
                  (purchase.createdAt
                    ? new Date(purchase.createdAt).toLocaleDateString()
                    : formatEntityLabel({ id: purchase.id }, common('unknown')))
                } • ${purchase.status}`,
              }))}
              placeholder={t('selectPurchase')}
              isClearable
              className="nvi-select-container"
            />
          </div>
          <SmartSelect
            value={paymentForm.method}
            onChange={(value) =>
              setPaymentForm({ ...paymentForm, method: value })
            }
            options={[
              { value: 'CASH', label: t('paymentCash') },
              { value: 'CARD', label: t('paymentCard') },
              { value: 'MOBILE_MONEY', label: t('paymentMobileMoney') },
              { value: 'BANK_TRANSFER', label: t('paymentBankTransfer') },
              { value: 'OTHER', label: t('paymentOther') },
            ]}
            className="nvi-select-container"
          />
          <input
            value={paymentForm.amount}
            onChange={(event) =>
              setPaymentForm({ ...paymentForm, amount: event.target.value })
            }
            placeholder={t('amount')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={paymentForm.reference}
            onChange={(event) =>
              setPaymentForm({ ...paymentForm, reference: event.target.value })
            }
            placeholder={t('referenceOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 md:col-span-2"
          />
          <input
            value={paymentForm.methodLabel}
            onChange={(event) =>
              setPaymentForm({ ...paymentForm, methodLabel: event.target.value })
            }
            placeholder={t('methodLabelOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 md:col-span-2"
          />
        </div>
        <button
          type="button"
          onClick={recordPayment}
          className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!canWrite || isRecording}
          title={!canWrite ? noAccess('title') : undefined}
        >
          {isRecording ? <Spinner size="xs" variant="pulse" /> : null}
          {isRecording ? t('recording') : t('recordPayment')}
        </button>
      </div>

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('listTitle')}</h3>
        {viewMode === 'table' ? (
          purchases.length === 0 ? (
            <StatusBanner message={t('noPurchases')} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[640px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('supplierFallback')}</th>
                    <th className="px-3 py-2">{t('statusLabel')}</th>
                    <th className="px-3 py-2">{t('createdAt')}</th>
                    <th className="px-3 py-2">{t('total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr key={purchase.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2 font-semibold">
                        {purchase.supplier?.name ?? t('supplierFallback')}
                      </td>
                      <td className="px-3 py-2">{purchase.status}</td>
                      <td className="px-3 py-2">
                        {new Date(purchase.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">{purchase.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : purchases.length === 0 ? (
          <StatusBanner message={t('noPurchases')} />
        ) : (
          purchases.map((purchase) => (
            <div
              key={purchase.id}
              className="rounded border border-gold-700/30 bg-black/40 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gold-100">
                    {purchase.supplier?.name ?? t('supplierFallback')} • {purchase.status}
                  </p>
                  <p className="text-xs text-gold-400">
                    {purchase.id} • {new Date(purchase.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="text-xs text-gold-300">
                  {t('totalLabel', { value: purchase.total })}
                </div>
              </div>
              {purchase.payments?.length ? (
                <div className="mt-2 text-xs text-gold-400">
                  {t('paymentsLabel')}{' '}
                  {purchase.payments.map((payment) => (
                    <span key={payment.id} className="mr-2">
                      {payment.method} {payment.amount}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
        <div className="pt-2">
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            itemCount={purchases.length}
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
