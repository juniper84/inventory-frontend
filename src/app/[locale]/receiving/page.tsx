'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { getOfflineCache } from '@/lib/offline-store';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
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
import { useBranchScope } from '@/lib/use-branch-scope';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';
import { useFormatDate } from '@/lib/business-context';

type Branch = { id: string; name: string };
type Supplier = { id: string; name: string };
type Purchase = { id: string; status: string; createdAt?: string; supplier?: Supplier | null };
type PurchaseOrder = { id: string; status: string; createdAt?: string; supplier?: Supplier | null };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name?: string | null };
};
type ReceivingLine = {
  id: string;
  variant: Variant;
  quantity: string;
  unitCost: string;
  unitId?: string | null;
  batch?: { code?: string | null; expiryDate?: string | null } | null;
  overrideReason?: string | null;
  receivedAt: string;
  purchase?: Purchase | null;
  purchaseOrder?: PurchaseOrder | null;
};
type ReceiveLine = {
  id: string;
  variantId: string;
  quantity: string;
  unitCost: string;
  unitId: string;
  batchCode: string;
  expiryDate: string;
};
type SettingsResponse = {
  stockPolicies?: {
    batchTrackingEnabled?: boolean;
  };
};

export default function ReceivingPage() {
  const t = useTranslations('receivingPage');
  const locale = useLocale();
  const { formatDate } = useFormatDate();
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('purchases.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isReceiving, setIsReceiving] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [receivings, setReceivings] = useState<ReceivingLine[]>([]);
  const [message, setMessage] = useToastState();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  // Ref so `load` can read cursor values without `pageCursors` being a dep
  // (having it as a dep causes an infinite loop: load → setPageCursors → new load → effect re-fires)
  const pageCursorsRef = useRef<Record<number, string | null>>({ 1: null });
  const [total, setTotal] = useState<number | null>(null);
  const [targetType, setTargetType] = useState<'purchase' | 'purchaseOrder'>(
    'purchase',
  );
  const [batchTrackingEnabled, setBatchTrackingEnabled] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [lines, setLines] = useState<ReceiveLine[]>([
    {
      id: crypto.randomUUID(),
      variantId: '',
      quantity: '',
      unitCost: '',
      unitId: '',
      batchCode: '',
      expiryDate: '',
    },
  ]);
  const formatDocLabel = useCallback((doc: Purchase | PurchaseOrder) => {
    const dateLabel = doc.createdAt ? formatDate(doc.createdAt) : null;
    const parts = [doc.supplier?.name ?? null, dateLabel, doc.status].filter(Boolean);
    return parts.length
      ? parts.join(' • ')
      : formatEntityLabel({ id: doc.id }, common('unknown'));
  }, [common]);
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    branchId: '',
    status: '',
    from: '',
    to: '',
  });
  const { loadOptions: loadVariantOptions, getVariantData, seedCache: seedVariantCache, getVariantOption } = useVariantSearch();
  const { activeBranch } = useBranchScope();
  const [branchFilterInitialized, setBranchFilterInitialized] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const branchOptions = useMemo(
    () => [
      { value: '', label: common('allBranches') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );
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
  const manualCount = useMemo(
    () =>
      receivings.filter((line) => !line.purchase && !line.purchaseOrder).length,
    [receivings],
  );
  const batchedCount = useMemo(
    () => receivings.filter((line) => line.batch?.code).length,
    [receivings],
  );

  useEffect(() => {
    if (branchFilterInitialized) {
      return;
    }
    if (!activeBranch?.id) {
      return;
    }
    setBranchFilterInitialized(true);
    pushFilters({ branchId: activeBranch.id });
  }, [activeBranch?.id, branchFilterInitialized, pushFilters]);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

  const loadReferenceData = useCallback(async () => {
    if (!navigator.onLine) return;
    const token = getAccessToken();
    if (!token) return;
    try {
      const [branchData, purchaseData, poData, variantData, unitList, settings] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', { token }),
        apiFetch<PaginatedResponse<Purchase> | Purchase[]>('/purchases?limit=200', { token }),
        apiFetch<PaginatedResponse<PurchaseOrder> | PurchaseOrder[]>('/purchase-orders?limit=200', { token }),
        apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', { token }),
        loadUnits(token),
        apiFetch<SettingsResponse>('/settings', { token }),
      ]);
      setBranches(normalizePaginated(branchData).items);
      setPurchases(normalizePaginated(purchaseData).items);
      setPurchaseOrders(normalizePaginated(poData).items);
      setVariants(normalizePaginated(variantData).items);
      seedVariantCache(normalizePaginated(variantData).items);
      setUnits(unitList);
      setBatchTrackingEnabled(!!settings.stockPolicies?.batchTrackingEnabled);
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
        variants?: Variant[];
        units?: Unit[];
      }>('snapshot');
      if (cache) {
        setBranches(cache.branches ?? []);
        setVariants(cache.variants ?? []);
        seedVariantCache(cache.variants ?? []);
        setUnits(cache.units ?? []);
      } else {
        setMessage({ action: 'sync', outcome: 'info', message: t('offlineCacheUnavailable') });
      }
      setReceivings([]);
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
        branchId: filters.branchId || undefined,
        status: filters.status || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        search: filters.search || undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const receivingData = await apiFetch<PaginatedResponse<ReceivingLine> | ReceivingLine[]>(
        `/receiving${query}`,
        { token },
      );
      const receivingResult = normalizePaginated(receivingData);
      setReceivings(receivingResult.items);
      setNextCursor(receivingResult.nextCursor);
      if (typeof receivingResult.total === 'number') {
        setTotal(receivingResult.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (receivingResult.nextCursor) {
          nextState[targetPage + 1] = receivingResult.nextCursor;
        }
        pageCursorsRef.current = nextState;
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
  }, [pageSize, filters.branchId, filters.status, filters.from, filters.to, filters.search, t]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    setPage(1);
    pageCursorsRef.current = { 1: null };
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.branchId, filters.status, filters.from, filters.to, filters.search]);

  const updateLine = (id: string, patch: Partial<ReceiveLine>) => {
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
        batchCode: '',
        expiryDate: '',
      },
    ]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((line) => line.id !== id));
  };

  const receive = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    if (!targetId) {
      setMessage({ action: 'save', outcome: 'warning', message: t('targetRequired') });
      return;
    }
    const payloadLines = lines
      .filter((line) => line.variantId && line.quantity && line.unitCost)
      .map((line) => ({
        variantId: line.variantId,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
        unitId: line.unitId || undefined,
        batchCode: line.batchCode || undefined,
        expiryDate: line.expiryDate || undefined,
      }));
    if (!payloadLines.length) {
      return;
    }
    setMessage(null);
    setIsReceiving(true);
    try {
      await apiFetch('/receiving', {
        token,
        method: 'POST',
        body: JSON.stringify({
          purchaseId: targetType === 'purchase' ? targetId : undefined,
          purchaseOrderId: targetType === 'purchaseOrder' ? targetId : undefined,
          overrideReason: overrideReason || undefined,
          lines: payloadLines,
        }),
      });
      setTargetId('');
      setOverrideReason('');
      setLines([
        {
          id: crypto.randomUUID(),
          variantId: '',
          quantity: '',
          unitCost: '',
          unitId: '',
          batchCode: '',
          expiryDate: '',
        },
      ]);
      await load(1);
      setMessage({ action: 'create', outcome: 'success', message: t('recorded') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('recordFailed')),
      });
    } finally {
      setIsReceiving(false);
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
            <span className="status-chip">{t('badgeLiveQueue')}</span>
            <span className="status-chip">{batchTrackingEnabled ? t('badgeBatchTracking') : t('badgeStandard')}</span>
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiRecentLines')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{receivings.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiManualReceives')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{manualCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiBatchedLines')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{batchedCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiTargetMode')}
          </p>
          <p className="mt-2 text-lg font-semibold text-gold-100">
            {targetType === 'purchase' ? t('purchase') : t('purchaseOrder')}
          </p>
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
            instanceId="filter-branch"
            value={filters.branchId}
            onChange={(value) => pushFilters({ branchId: value })}
            options={branchOptions}
            placeholder={common('branch')}
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="filter-status"
            value={filters.status}
            onChange={(value) => pushFilters({ status: value })}
            options={statusOptions}
            placeholder={common('status')}
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
        <h3 className="text-lg font-semibold text-gold-100">{t('receiveTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <SmartSelect
            instanceId="receive-target-type"
            value={targetType}
            onChange={(value) =>
              setTargetType(value as 'purchase' | 'purchaseOrder')
            }
            options={[
              { value: 'purchase', label: t('purchase') },
              { value: 'purchaseOrder', label: t('purchaseOrder') },
            ]}
          />
          <SmartSelect
            instanceId="receive-target-document"
            value={targetId}
            onChange={(value) => setTargetId(value)}
            placeholder={t('selectDocument')}
            options={(targetType === 'purchase' ? purchases : purchaseOrders).map(
              (item) => ({
                value: item.id,
                label: formatDocLabel(item),
              }),
            )}
            isClearable
            className="sm:col-span-2 nvi-select-container"
          />
          <input
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            placeholder={t('overrideReason')}
            className="sm:col-span-3 rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        <div className="space-y-2">
          {lines.map((line) => (
            <div
              key={line.id}
              className={`grid gap-2 ${batchTrackingEnabled ? 'md:grid-cols-7' : 'md:grid-cols-5'}`}
            >
              <AsyncSmartSelect
                instanceId={`line-${line.id}-variant`}
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
                instanceId={`line-${line.id}-unit`}
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
              {batchTrackingEnabled ? (
                <>
                  <input
                    value={line.batchCode}
                    onChange={(event) =>
                      updateLine(line.id, { batchCode: event.target.value })
                    }
                    placeholder={t('batchCode')}
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <DatePickerInput
                    value={line.expiryDate}
                    onChange={(v) => updateLine(line.id, { expiryDate: v })}
                    placeholder={t('expiryDate')}
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                </>
              ) : null}
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
            onClick={receive}
            className="nvi-cta inline-flex items-center gap-2 rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite || isReceiving}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isReceiving ? <Spinner size="xs" variant="orbit" /> : null}
            {isReceiving ? t('receiving') : t('recordReceiving')}
          </button>
        </div>
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('recentTitle')}</h3>
        {viewMode === 'table' ? (
          <div className="overflow-auto text-sm text-gold-200">
            {!receivings.length ? (
              <StatusBanner message={t('noReceivings')} />
            ) : (
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('variant')}</th>
                    <th className="px-3 py-2">{t('quantity')} · {t('unit')}</th>
                    <th className="px-3 py-2">{t('unitCost')}</th>
                    <th className="px-3 py-2">{t('source')}</th>
                    {batchTrackingEnabled ? <th className="px-3 py-2">{t('batchCode')}</th> : null}
                    <th className="px-3 py-2">{t('receivedAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {receivings.map((line) => {
                    const unit = line.unitId
                      ? units.find((item) => item.id === line.unitId) ?? null
                      : null;
                    const unitLabel = unit ? buildUnitLabel(unit) : line.unitId ?? '';
                    const sourceType = line.purchase ? 'purchase' : line.purchaseOrder ? 'purchaseOrder' : 'manual';
                    return (
                      <tr key={line.id} className="border-t border-gold-700/20">
                        <td className="px-3 py-2">
                          <p className="font-semibold text-gold-100">
                            {line.variant
                              ? formatVariantLabel({
                                  id: line.variant.id,
                                  name: line.variant.name,
                                  productName: line.variant.product?.name ?? null,
                                })
                              : t('variantFallback')}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-gold-300">{line.quantity} {unitLabel}</td>
                        <td className="px-3 py-2 text-gold-300">{line.unitCost}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded border px-2 py-0.5 text-[11px] ${
                            sourceType === 'purchase'
                              ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                              : sourceType === 'purchaseOrder'
                                ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                                : 'border-gold-700/40 bg-black/30 text-gold-500'
                          }`}>
                            {sourceType === 'purchase' ? t('purchase') : sourceType === 'purchaseOrder' ? t('purchaseOrder') : t('manual')}
                          </span>
                        </td>
                        {batchTrackingEnabled ? (
                          <td className="px-3 py-2 text-gold-400 text-xs">
                            {line.batch?.code ?? '—'}
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-xs text-gold-400">
                          {formatDate(line.receivedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-sm text-gold-200">
            {!receivings.length ? (
              <StatusBanner message={t('noReceivings')} />
            ) : null}
            {receivings.map((line) => {
              const unit = line.unitId
                ? units.find((item) => item.id === line.unitId) ?? null
                : null;
              const unitLabel = unit ? buildUnitLabel(unit) : line.unitId ?? '';
              const sourceType = line.purchase ? 'purchase' : line.purchaseOrder ? 'purchaseOrder' : 'manual';
              return (
                <div
                  key={line.id}
                  className="rounded border border-gold-700/30 bg-black/40 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gold-100 truncate">
                        {line.variant
                          ? formatVariantLabel({
                              id: line.variant.id,
                              name: line.variant.name,
                              productName: line.variant.product?.name ?? null,
                            })
                          : t('variantFallback')}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gold-400">
                        <span>{line.quantity} {unitLabel} @ {line.unitCost}</span>
                        <span>{formatDate(line.receivedAt)}</span>
                        {line.purchase ? (
                          <span>{line.purchase.supplier?.name ?? formatDocLabel(line.purchase)}</span>
                        ) : line.purchaseOrder ? (
                          <span>{line.purchaseOrder.supplier?.name ?? formatDocLabel(line.purchaseOrder)}</span>
                        ) : null}
                      </div>
                      {(line.batch?.code || line.overrideReason) ? (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gold-500">
                          {line.batch?.code ? (
                            <span>
                              {t('batchLabel', {
                                code: line.batch.code,
                                expiry: line.batch.expiryDate
                                  ? formatDate(line.batch.expiryDate)
                                  : t('noExpiry'),
                              })}
                            </span>
                          ) : null}
                          {line.overrideReason ? (
                            <span>{t('overrideLabel', { reason: line.overrideReason })}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <span className={`shrink-0 rounded border px-2 py-0.5 text-[11px] ${
                      sourceType === 'purchase'
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                        : sourceType === 'purchaseOrder'
                          ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                          : 'border-gold-700/40 bg-black/30 text-gold-500'
                    }`}>
                      {sourceType === 'purchase' ? t('purchase') : sourceType === 'purchaseOrder' ? t('purchaseOrder') : t('manual')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="pt-2">
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            itemCount={receivings.length}
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
