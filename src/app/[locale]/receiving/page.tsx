'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
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
  const formatDocLabel = (doc: Purchase | PurchaseOrder) => {
    const dateLabel = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : null;
    const parts = [doc.supplier?.name ?? null, dateLabel, doc.status].filter(Boolean);
    return parts.length
      ? parts.join(' • ')
      : formatEntityLabel({ id: doc.id }, common('unknown'));
  };
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    branchId: '',
    status: '',
    from: '',
    to: '',
  });
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

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

  const load = async (targetPage = 1, nextPageSize?: number) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
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
        branchId: filters.branchId || undefined,
        status: filters.status || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        search: filters.search || undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const [
        branchData,
        purchaseData,
        poData,
        variantData,
        unitList,
        receivingData,
        settings,
      ] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<Purchase> | Purchase[]>('/purchases?limit=200', {
          token,
        }),
          apiFetch<PaginatedResponse<PurchaseOrder> | PurchaseOrder[]>(
            '/purchase-orders?limit=200',
            { token },
          ),
          apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
            token,
          }),
          loadUnits(token),
          apiFetch<PaginatedResponse<ReceivingLine> | ReceivingLine[]>(
            `/receiving${query}`,
            { token },
          ),
          apiFetch<SettingsResponse>('/settings', { token }),
        ]);
      setBranches(normalizePaginated(branchData).items);
      setPurchases(normalizePaginated(purchaseData).items);
      setPurchaseOrders(normalizePaginated(poData).items);
      setVariants(normalizePaginated(variantData).items);
      setUnits(unitList);
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
      return nextState;
    });
      setBatchTrackingEnabled(!!settings.stockPolicies?.batchTrackingEnabled);
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
    load(1);
  }, [
    filters.search,
    filters.branchId,
    filters.status,
    filters.from,
    filters.to,
  ]);

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
    if (!token || !targetId) {
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
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
          <p className="text-sm text-gold-300">{t('subtitle')}</p>
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
          value={filters.branchId}
          onChange={(value) => pushFilters({ branchId: value })}
          options={branchOptions}
          placeholder={common('branch')}
          className="nvi-select-container"
        />
        <SmartSelect
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

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('receiveTitle')}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <SmartSelect
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
            className="md:col-span-2"
          />
        </div>
        <input
          value={overrideReason}
          onChange={(event) => setOverrideReason(event.target.value)}
          placeholder={t('overrideReason')}
          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <div className="space-y-2">
          {lines.map((line) => (
            <div
              key={line.id}
              className={`grid gap-2 ${batchTrackingEnabled ? 'md:grid-cols-7' : 'md:grid-cols-5'}`}
            >
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
                  <input
                    type="date"
                    value={line.expiryDate}
                    onChange={(event) =>
                      updateLine(line.id, { expiryDate: event.target.value })
                    }
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
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite || isReceiving}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isReceiving ? <Spinner size="xs" variant="orbit" /> : null}
            {isReceiving ? t('receiving') : t('recordReceiving')}
          </button>
        </div>
      </div>

      <div className="command-card p-6 space-y-3 nvi-reveal">
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
                    <th className="px-3 py-2">{t('quantity')}</th>
                    <th className="px-3 py-2">{t('unit')}</th>
                    <th className="px-3 py-2">{t('unitCost')}</th>
                    <th className="px-3 py-2">{t('source')}</th>
                    <th className="px-3 py-2">{t('receivedAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {receivings.map((line) => {
                    const unit = line.unitId
                      ? units.find((item) => item.id === line.unitId) ?? null
                      : null;
                    const unitLabel = unit ? buildUnitLabel(unit) : line.unitId ?? '';
                    const sourceLabel = line.purchase
                      ? t('purchaseShort', { id: formatDocLabel(line.purchase) })
                      : line.purchaseOrder
                        ? t('purchaseOrderShort', { id: formatDocLabel(line.purchaseOrder) })
                        : t('manual');
                    return (
                      <tr key={line.id} className="border-t border-gold-700/20">
                        <td className="px-3 py-2 font-semibold">
                          {line.variant?.name ?? t('variantFallback')}
                        </td>
                        <td className="px-3 py-2">{line.quantity}</td>
                        <td className="px-3 py-2">{unitLabel}</td>
                        <td className="px-3 py-2">{line.unitCost}</td>
                        <td className="px-3 py-2">{sourceLabel}</td>
                        <td className="px-3 py-2">
                          {new Date(line.receivedAt).toLocaleString()}
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
            {receivings.map((line) => {
              const unit = line.unitId
                ? units.find((item) => item.id === line.unitId) ?? null
                : null;
              const unitLabel = unit ? buildUnitLabel(unit) : line.unitId ?? '';
              return (
                <div
                  key={line.id}
                  className="rounded border border-gold-700/40 bg-black/40 p-4 space-y-1"
                >
                  <p className="text-gold-100">
                    {t('lineSummary', {
                      name: line.variant?.name ?? t('variantFallback'),
                      qty: line.quantity,
                      unit: unitLabel,
                      cost: line.unitCost,
                    })}
                  </p>
                  <p className="text-xs text-gold-400">
                    {t('sourceLine', {
                      source: line.purchase
                        ? t('purchaseShort', {
                            id: formatDocLabel(line.purchase),
                          })
                        : line.purchaseOrder
                          ? t('purchaseOrderShort', {
                              id: formatDocLabel(line.purchaseOrder),
                            })
                          : t('manual'),
                      date: new Date(line.receivedAt).toLocaleString(),
                    })}
                  </p>
                  {line.batch?.code ? (
                    <p className="text-xs text-gold-400">
                      {t('batchLabel', {
                        code: line.batch.code,
                        expiry: line.batch.expiryDate
                          ? new Date(line.batch.expiryDate).toLocaleDateString()
                          : t('noExpiry'),
                      })}
                    </p>
                  ) : null}
                  {line.overrideReason ? (
                    <p className="text-xs text-gold-400">
                      {t('overrideLabel', { reason: line.overrideReason })}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {!receivings.length ? (
              <StatusBanner message={t('noReceivings')} />
            ) : null}
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
