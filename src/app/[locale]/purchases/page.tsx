'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken, getOrCreateDeviceId } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
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
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import { CurrencyInput } from '@/components/CurrencyInput';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatEntityLabel, formatVariantLabel, shortId } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';
import { useFormatDate } from '@/lib/business-context';

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
  const locale = useLocale();
  const { formatDate } = useFormatDate();
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
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
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
  const { activeBranch, resolveBranchId } = useBranchScope();
  const { loadOptions: loadVariantOptions, getVariantData, seedCache: seedVariantCache, getVariantOption } = useVariantSearch();
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
      { value: 'RECEIVED', label: common('statusReceived') },
      { value: 'CANCELLED', label: common('statusCancelled') },
    ],
    [common],
  );

  const purchaseStatusLabels = useMemo<Record<string, string>>(
    () => ({
      PENDING: common('statusPending'),
      PARTIAL: common('statusPartial'),
      COMPLETED: common('statusCompleted'),
      CANCELLED: common('statusCancelled'),
    }),
    [common],
  );

  const getStatusStyle = (status: string): string => {
    switch (status) {
      case 'APPROVED': return 'border-blue-500/50 bg-blue-500/10 text-blue-200';
      case 'RECEIVED': case 'COMPLETED': return 'border-green-500/50 bg-green-500/10 text-green-200';
      case 'PENDING_APPROVAL': case 'PENDING': return 'border-amber-500/50 bg-amber-500/10 text-amber-200';
      case 'PARTIALLY_RECEIVED': case 'PARTIAL': return 'border-purple-500/50 bg-purple-500/10 text-purple-200';
      case 'CANCELLED': return 'border-red-500/50 bg-red-500/10 text-red-300';
      case 'DRAFT': return 'border-gold-700/50 bg-black/40 text-gold-400';
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

  const loadReferenceData = useCallback(async () => {
    if (!navigator.onLine) return;
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
      seedVariantCache(cache.variants ?? []);
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
      const purchaseData = await apiFetch<PaginatedResponse<Purchase> | Purchase[]>(
        `/purchases${query}`,
        { token },
      );
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
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, effectiveFilterBranchId, filters.search, filters.status, filters.supplierId, filters.from, filters.to, t, setMessage]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

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
    load,
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
    if (!token) {
      return;
    }
    if (!effectiveFormBranchId) {
      setMessage({ action: 'save', outcome: 'warning', message: t('branchRequired') });
      return;
    }
    if (!form.supplierId) {
      setMessage({ action: 'save', outcome: 'warning', message: t('supplierRequired') });
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
      setMessage({ action: 'save', outcome: 'warning', message: t('noValidLines') });
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
            branchId: effectiveFormBranchId,
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
        setMessage({ action: 'sync', outcome: 'failure', message });
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
          branchId: effectiveFormBranchId,
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

  const recordPayment = async () => {
    const token = getAccessToken();
    if (!token || !paymentForm.purchaseId || !paymentForm.amount) {
      return;
    }
    if ((paymentForm.method === 'BANK_TRANSFER' || paymentForm.method === 'MOBILE_MONEY') && !paymentForm.reference) {
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
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('recordFailed')),
      });
    } finally {
      setIsRecording(false);
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
        actions={
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        }
      />
      {message ? <StatusBanner message={message} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiTotal')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{total ?? purchases.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiDraftLines')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{lines.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiPaymentTarget')}
          </p>
          <p className="mt-2 text-xl font-semibold text-gold-100">
            {paymentForm.purchaseId ? t('kpiSelected') : t('kpiNone')}
          </p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiPage')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{page}</p>
        </article>
      </div>
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
          instanceId="purchases-filter-status"
          value={filters.status}
          onChange={(value) => pushFilters({ status: value })}
          options={statusOptions}
          placeholder={common('status')}
          className="nvi-select-container"
        />
        <SmartSelect
          instanceId="purchases-filter-branch"
          value={filters.branchId}
          onChange={(value) => pushFilters({ branchId: value })}
          options={branchOptions}
          placeholder={common('branch')}
          className="nvi-select-container"
        />
        <SmartSelect
          instanceId="purchases-filter-supplier"
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

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('createTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <SmartSelect
            instanceId="purchases-create-branch"
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
            instanceId="purchases-create-supplier"
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
        <div className="space-y-2 nvi-stagger">
          {lines.map((line) => (
            <div key={line.id} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <AsyncSmartSelect
                instanceId={`purchases-line-${line.id}-variant`}
                value={getVariantOption(line.variantId)}
                loadOptions={loadVariantOptions}
                defaultOptions={variants.map((v) => ({
                  value: v.id,
                  label: formatVariantLabel({
                    id: v.id,
                    name: v.name,
                    productName: v.product?.name ?? null,
                  }),
                }))}
                onChange={(opt) => {
                  const variantId = opt?.value ?? '';
                  const vd = getVariantData(variantId) ?? variants.find((v) => v.id === variantId);
                  updateLine(line.id, {
                    variantId,
                    unitId: vd?.baseUnitId ?? vd?.sellUnitId ?? line.unitId,
                  });
                }}
                placeholder={t('variant')}
                isClearable
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
                instanceId={`purchases-line-${line.id}-unit`}
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
              <CurrencyInput
                value={line.unitCost}
                onChange={(value) =>
                  updateLine(line.id, { unitCost: value })
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
            className="nvi-cta rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite || isCreating}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isCreating ? <Spinner size="xs" variant="orbit" /> : null}
            {isCreating ? t('creating') : t('createPurchase')}
          </button>
        </div>
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('paymentTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <SmartSelect
              instanceId="purchases-payment-purchase"
              value={paymentForm.purchaseId}
              onChange={(value) =>
                setPaymentForm({ ...paymentForm, purchaseId: value })
              }
              options={purchases.map((purchase) => ({
                value: purchase.id,
                label: `${
                  purchase.supplier?.name ??
                  (purchase.createdAt
                    ? formatDate(purchase.createdAt)
                    : formatEntityLabel({ id: purchase.id }, common('unknown')))
                } • ${purchaseStatusLabels[purchase.status] ?? purchase.status} • #${shortId(purchase.id)}`,
              }))}
              placeholder={t('selectPurchase')}
              isClearable
              className="nvi-select-container"
            />
          </div>
          <SmartSelect
            instanceId="purchases-payment-method"
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
          <CurrencyInput
            value={paymentForm.amount}
            onChange={(value) =>
              setPaymentForm({ ...paymentForm, amount: value })
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
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={paymentForm.methodLabel}
            onChange={(event) =>
              setPaymentForm({ ...paymentForm, methodLabel: event.target.value })
            }
            placeholder={t('methodLabelOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        <button
          type="button"
          onClick={recordPayment}
          className="nvi-cta rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!canWrite || isRecording}
          title={!canWrite ? noAccess('title') : undefined}
        >
          {isRecording ? <Spinner size="xs" variant="pulse" /> : null}
          {isRecording ? t('recording') : t('recordPayment')}
        </button>
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('listTitle')}</h3>
        {viewMode === 'table' ? (
          purchases.length === 0 ? (
            <StatusBanner message={t('noPurchases')} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('supplierFallback')}</th>
                    <th className="px-3 py-2">{common('branch')}</th>
                    <th className="px-3 py-2">{t('statusLabel')}</th>
                    <th className="px-3 py-2">{t('createdAt')}</th>
                    <th className="px-3 py-2">{t('total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr key={purchase.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-gold-100">{purchase.supplier?.name ?? t('supplierFallback')}</p>
                        <p className="text-[11px] text-gold-500">#{shortId(purchase.id)}</p>
                      </td>
                      <td className="px-3 py-2 text-gold-300">{purchase.branch?.name ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-2 py-0.5 text-[11px] ${getStatusStyle(purchase.status)}`}>
                          {purchaseStatusLabels[purchase.status] ?? purchase.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gold-300">
                        {formatDate(purchase.createdAt)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-gold-100">{purchase.total}</td>
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
              className="rounded border border-gold-700/30 bg-black/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gold-100 truncate">
                      {purchase.supplier?.name ?? t('supplierFallback')}
                    </p>
                    <span className={`rounded border px-2 py-0.5 text-[11px] ${getStatusStyle(purchase.status)}`}>
                      {purchaseStatusLabels[purchase.status] ?? purchase.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gold-400">
                    {purchase.branch?.name ? <span>{purchase.branch.name}</span> : null}
                    <span>#{shortId(purchase.id)}</span>
                    <span>{formatDate(purchase.createdAt)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-gold-100">{purchase.total}</p>
                </div>
              </div>
              {purchase.payments?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {purchase.payments.map((payment) => (
                    <span
                      key={payment.id}
                      className="rounded bg-gold-900/30 px-2 py-0.5 text-[11px] text-gold-300"
                    >
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
