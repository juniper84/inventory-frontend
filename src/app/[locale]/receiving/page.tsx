'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState, messageText } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { getOfflineCache } from '@/lib/offline-store';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { CurrencyInput } from '@/components/CurrencyInput';
import { Banner } from '@/components/notifications/Banner';
import {
  Card,
  Icon,
  EmptyState,
  ListPage,
  SortableTableHeader,
} from '@/components/ui';
import { ReceivingFormModal } from '@/components/receiving/ReceivingFormModal';
import type { SortDirection } from '@/components/ui';
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

import { useBranchScope } from '@/lib/use-branch-scope';
import { useFormatDate, useCurrency, formatCurrency } from '@/lib/business-context';
import { installBarcodeScanner } from '@/lib/barcode-scanner';

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
  qualityNote: string;
};
type SettingsResponse = {
  stockPolicies?: {
    batchTrackingEnabled?: boolean;
  };
};

/* ─── helpers ─── */
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ReceivingPage() {
  const t = useTranslations('receivingPage');
  const locale = useLocale();
  const { formatDate, formatDateTime } = useFormatDate();
  const currency = useCurrency();
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('purchases.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isReceiving, setIsReceiving] = useState(false);
  const [generatingCodeForLine, setGeneratingCodeForLine] = useState<string | null>(null);
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
  const [formOpen, setFormOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef<Record<number, string | null>>({ 1: null });
  const [total, setTotal] = useState<number | null>(null);
  const [targetType, setTargetType] = useState<'purchase' | 'purchaseOrder'>(
    'purchase',
  );
  const [batchTrackingEnabled, setBatchTrackingEnabled] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [scanTarget, setScanTarget] = useState<string | null>(null);
  const [lines, setLines] = useState<ReceiveLine[]>([
    {
      id: crypto.randomUUID(),
      variantId: '',
      quantity: '',
      unitCost: '',
      unitId: '',
      batchCode: '',
      expiryDate: '',
      qualityNote: '',
    },
  ]);
  const formatDocLabel = useCallback((doc: Purchase | PurchaseOrder) => {
    const dateLabel = doc.createdAt ? formatDate(doc.createdAt) : null;
    const parts = [doc.supplier?.name ?? null, dateLabel, doc.status].filter(Boolean);
    return parts.length
      ? parts.join(' \u2022 ')
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
        qualityNote: '',
      },
    ]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((line) => line.id !== id));
  };

  // Barcode scanner: when scanTarget is set, the next scanned barcode fills the batch code for that line
  const scanTargetRef = useRef<string | null>(null);
  scanTargetRef.current = scanTarget;

  const handleBarcodeScan = useCallback(
    (code: string) => {
      const lineId = scanTargetRef.current;
      if (!lineId) return;
      setLines((prev) =>
        prev.map((line) => (line.id === lineId ? { ...line, batchCode: code } : line)),
      );
      setScanTarget(null);
      setMessage({ action: 'save', outcome: 'info', message: t('batchScanned') });
    },
    [setMessage, t],
  );

  useEffect(() => {
    if (!scanTarget) return;
    return installBarcodeScanner({
      onScan: handleBarcodeScan,
      enabled: true,
      minLength: 3,
    });
  }, [scanTarget, handleBarcodeScan]);

  const generateBatchCodeForLine = async (lineId: string) => {
    const token = getAccessToken();
    const branchId = activeBranch?.id;
    if (!token || !branchId) return;
    setGeneratingCodeForLine(lineId);
    try {
      const result = await apiFetch<{ code: string }>('/stock/batches/generate-code', {
        token,
        method: 'POST',
        body: JSON.stringify({ branchId }),
      });
      setLines((prev) =>
        prev.map((line) => (line.id === lineId ? { ...line, batchCode: result.code } : line)),
      );
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, 'Failed to generate batch code'),
      });
    } finally {
      setGeneratingCodeForLine(null);
    }
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
    const validLines = lines.filter((line) => line.variantId && line.quantity && line.unitCost);
    const payloadLines = validLines.map((line) => ({
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
    // Aggregate per-line quality notes into the override reason
    const qualityNotes = validLines
      .filter((line) => line.qualityNote)
      .map((line) => {
        const vd = getVariantData(line.variantId) ?? variants.find((v) => v.id === line.variantId);
        const label = vd ? formatVariantLabel({ id: vd.id, name: vd.name, productName: vd.product?.name ?? null }) : common('unknown');
        return `[${label}] ${line.qualityNote}`;
      });
    const combinedReason = [overrideReason, ...qualityNotes].filter(Boolean).join(' | ') || undefined;
    setMessage(null);
    setIsReceiving(true);
    try {
      await apiFetch('/receiving', {
        token,
        method: 'POST',
        body: JSON.stringify({
          purchaseId: targetType === 'purchase' ? targetId : undefined,
          purchaseOrderId: targetType === 'purchaseOrder' ? targetId : undefined,
          overrideReason: combinedReason,
          lines: payloadLines,
        }),
      });
      setTargetId('');
      setOverrideReason('');
      setScanTarget(null);
      setLines([
        {
          id: crypto.randomUUID(),
          variantId: '',
          quantity: '',
          unitCost: '',
          unitId: '',
          batchCode: '',
          expiryDate: '',
          qualityNote: '',
        },
      ]);
      await load(1);
      setFormOpen(false);
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

  /* ─── KPI strip ─── */
  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      {(
        [
          { icon: 'PackageCheck' as const,     tone: 'emerald' as const, label: t('kpiRecentLines'),    value: String(total ?? receivings.length),                                               accent: 'text-emerald-300', size: '2xl' },
          { icon: 'ClipboardPenLine' as const, tone: 'blue' as const,    label: t('kpiManualReceives'), value: String(manualCount),                                                              accent: 'text-blue-300',    size: '2xl' },
          { icon: 'Layers' as const,           tone: 'amber' as const,   label: t('kpiBatchedLines'),   value: String(batchedCount),                                                             accent: 'text-amber-300',   size: '2xl' },
          { icon: (targetType === 'purchase' ? 'ShoppingCart' : 'Truck') as 'ShoppingCart' | 'Truck', tone: 'purple' as const, label: t('kpiTargetMode'), value: targetType === 'purchase' ? t('purchase') : t('purchaseOrder'), accent: 'text-purple-300', size: 'lg'  },
        ]
      ).map((k) => (
        <Card key={k.label} as="article" padding="md">
          <div className="flex items-center gap-3">
            <div className={`nvi-kpi-icon nvi-kpi-icon--${k.tone}`}>
              <Icon name={k.icon} size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--nvi-text-muted)]">{k.label}</p>
              <p className={`mt-0.5 font-bold tabular-nums ${k.accent} ${k.size === '2xl' ? 'text-2xl' : 'text-lg'}`}>{k.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  /* ─── Filter bar ─── */
  const filterBar = (
    <Card glow={false} padding="md">
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
          className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)]"
        />
        <DatePickerInput
          value={filters.to}
          onChange={(value) => pushFilters({ to: value })}
          placeholder={common('toDate')}
          className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)]"
        />
      </ListFilters>
    </Card>
  );

  /* ─── Card view ─── */
  const cardView = (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 nvi-stagger">
      {receivings.map((line) => {
        const unit = line.unitId
          ? units.find((item) => item.id === line.unitId) ?? null
          : null;
        const unitLabel = unit ? buildUnitLabel(unit) : line.unitId ?? '';
        const sourceType = line.purchase
          ? 'purchase'
          : line.purchaseOrder
            ? 'purchaseOrder'
            : 'manual';

        return (
          <div
            key={line.id}
            className="group relative overflow-hidden rounded-2xl border border-[var(--nvi-border)] bg-[var(--nvi-surface)] transition-all hover:border-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/[0.04]"
          >
            {/* Top colored accent strip */}
            <div className={[
              'h-1',
              sourceType === 'purchase'
                ? 'bg-gradient-to-r from-emerald-500/60 to-emerald-500/10'
                : sourceType === 'purchaseOrder'
                  ? 'bg-gradient-to-r from-blue-500/60 to-blue-500/10'
                  : 'bg-gradient-to-r from-[var(--nvi-text-muted)]/30 to-transparent',
            ].join(' ')} />

            <div className="p-4">
              {/* Header: hero quantity + source badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Hero quantity */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold tabular-nums text-emerald-400">
                      {line.quantity}
                    </span>
                    {unitLabel && (
                      <span className="text-xs font-medium text-emerald-400/60">
                        {unitLabel}
                      </span>
                    )}
                  </div>
                  {/* Variant + product name */}
                  <p className="mt-1.5 truncate text-sm font-semibold text-[var(--nvi-text)]">
                    {line.variant?.name ?? t('variantFallback')}
                  </p>
                  {line.variant?.product?.name && (
                    <p className="mt-0.5 truncate text-xs text-[var(--nvi-text-muted)]">
                      {line.variant.product.name}
                    </p>
                  )}
                </div>

                {/* Source badge */}
                <span
                  className={[
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    sourceType === 'purchase'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : sourceType === 'purchaseOrder'
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'bg-[var(--nvi-border)]/50 text-[var(--nvi-text-muted)]',
                  ].join(' ')}
                >
                  <Icon
                    name={sourceType === 'purchase' ? 'ShoppingCart' : sourceType === 'purchaseOrder' ? 'ClipboardList' : 'ClipboardPenLine'}
                    size={11}
                  />
                  {sourceType === 'purchase'
                    ? t('purchase')
                    : sourceType === 'purchaseOrder'
                      ? t('purchaseOrder')
                      : t('manual')}
                </span>
              </div>

              {/* Unit cost */}
              <p className="mt-2 text-xs font-medium text-[var(--nvi-text-muted)]">
                {formatCurrency(Number(line.unitCost), currency)} / {t('unit')}
              </p>

              {/* Source detail */}
              {(line.purchase || line.purchaseOrder) && (
                <p className="mt-1.5 truncate text-xs text-[var(--nvi-text-muted)]/70">
                  {line.purchase
                    ? line.purchase.supplier?.name ?? formatDocLabel(line.purchase)
                    : line.purchaseOrder
                      ? line.purchaseOrder.supplier?.name ?? formatDocLabel(line.purchaseOrder)
                      : null}
                </p>
              )}

              {/* Quality note */}
              {line.overrideReason && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.05] px-3 py-2">
                  <Icon name="MessageSquare" size={13} className="mt-0.5 shrink-0 text-amber-400" />
                  <p className="text-xs leading-relaxed text-amber-300/90 line-clamp-2">{line.overrideReason}</p>
                </div>
              )}

              {/* Batch + expiry chips */}
              {(line.batch?.code || line.batch?.expiryDate) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {line.batch.code && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/15 bg-blue-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-blue-300">
                      <Icon name="Hash" size={10} className="text-blue-400" />
                      {line.batch.code}
                    </span>
                  )}
                  {line.batch.expiryDate && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/15 bg-amber-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-amber-300">
                      <Icon name="Calendar" size={10} className="text-amber-400" />
                      {formatDate(line.batch.expiryDate)}
                    </span>
                  )}
                </div>
              )}

              {/* Footer: branch + time */}
              <div className="mt-4 flex items-center justify-between border-t border-[var(--nvi-border)]/60 pt-3 text-[11px] text-[var(--nvi-text-muted)]/70">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="Clock" size={10} />
                  {relativeTime(line.receivedAt)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="MapPin" size={10} />
                  {formatDate(line.receivedAt)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  /* ─── Table view ─── */
  const tableView = (
    <Card>
      <div className="overflow-auto">
        <table className="min-w-[720px] w-full text-left text-sm text-[var(--nvi-text)]">
          <thead className="text-xs uppercase text-[var(--nvi-text-muted)]">
            <tr>
              <SortableTableHeader label={t('variant')} sortKey="variant" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
              <SortableTableHeader label={`${t('quantity')} / ${t('unit')}`} sortKey="quantity" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
              <SortableTableHeader label={t('unitCost')} sortKey="unitCost" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} align="right" />
              <SortableTableHeader label={t('source')} sortKey="source" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
              {batchTrackingEnabled && (
                <th className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="Hash" size={12} className="text-blue-400" />
                    {t('batchCode')}
                  </span>
                </th>
              )}
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <Icon name="MessageSquare" size={12} className="text-amber-400" />
                  {t('qualityNote')}
                </span>
              </th>
              <SortableTableHeader label={t('receivedAt')} sortKey="receivedAt" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
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
                <tr key={line.id} className="border-t border-[var(--nvi-border)] transition-colors hover:bg-emerald-500/[0.02]">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                        <Icon name="Package" size={13} className="text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate font-semibold">
                          {line.variant?.name ?? t('variantFallback')}
                        </span>
                        {line.variant?.product?.name && (
                          <span className="block truncate text-[11px] text-[var(--nvi-text-muted)]">
                            {line.variant.product.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-bold tabular-nums text-emerald-400">{line.quantity}</span>
                    {unitLabel && <span className="ml-1.5 text-xs text-emerald-400/50">{unitLabel}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[var(--nvi-text-muted)]">
                    {formatCurrency(Number(line.unitCost), currency)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={[
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                        sourceType === 'purchase'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : sourceType === 'purchaseOrder'
                            ? 'bg-blue-500/10 text-blue-400'
                            : 'bg-[var(--nvi-border)]/50 text-[var(--nvi-text-muted)]',
                      ].join(' ')}
                    >
                      <Icon
                        name={sourceType === 'purchase' ? 'ShoppingCart' : sourceType === 'purchaseOrder' ? 'ClipboardList' : 'ClipboardPenLine'}
                        size={10}
                      />
                      {sourceType === 'purchase' ? t('purchase') : sourceType === 'purchaseOrder' ? t('purchaseOrder') : t('manual')}
                    </span>
                  </td>
                  {batchTrackingEnabled && (
                    <td className="px-3 py-2.5">
                      {line.batch?.code ? (
                        <div className="flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-lg border border-blue-500/15 bg-blue-500/[0.06] px-2 py-0.5 text-[11px] font-medium text-blue-300">
                            <Icon name="Hash" size={9} className="text-blue-400" />
                            {line.batch.code}
                          </span>
                          {line.batch.expiryDate && (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/15 bg-amber-500/[0.06] px-2 py-0.5 text-[11px] font-medium text-amber-300">
                              <Icon name="Calendar" size={9} className="text-amber-400" />
                              {formatDate(line.batch.expiryDate)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--nvi-text-muted)]/40">--</span>
                      )}
                    </td>
                  )}
                  <td className="max-w-[160px] px-3 py-2.5">
                    {line.overrideReason ? (
                      <span className="inline-flex items-start gap-1.5 rounded-lg bg-amber-500/[0.06] px-2 py-1 text-xs text-amber-300/90">
                        <Icon name="MessageSquare" size={10} className="mt-0.5 shrink-0 text-amber-400" />
                        <span className="truncate">{line.overrideReason}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--nvi-text-muted)]/40">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--nvi-text-muted)]">
                      <Icon name="Clock" size={10} />
                      {formatDate(line.receivedAt)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  /* ─── Pagination ─── */
  const paginationBlock = (
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
  );

  /* ─── Banner ─── */
  const bannerNode = message ? (
    <Banner
      message={messageText(message)}
      severity="info"
      onDismiss={() => setMessage(null)}
    />
  ) : null;

  return (
    <>
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      badges={
        <>
          <span className="inline-flex items-center gap-1 rounded-xl border border-[var(--nvi-accent)]/20 bg-[var(--nvi-accent)]/5 px-2 py-0.5 text-[11px] font-medium text-[var(--nvi-accent)]">
            <Icon name="Radio" size={10} />
            {t('badgeLiveQueue')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-xl border border-[var(--nvi-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--nvi-text-muted)]">
            <Icon name={batchTrackingEnabled ? 'Layers' : 'Package'} size={10} />
            {batchTrackingEnabled ? t('badgeBatchTracking') : t('badgeStandard')}
          </span>
        </>
      }
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="nvi-cta nvi-press inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-black"
            >
              <Icon name="PackageCheck" size={14} />
              {t('receiveTitle')}
            </button>
          ) : null}
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </div>
      }
      isLoading={isLoading}
      banner={bannerNode}
      kpis={kpiStrip}
      filters={filterBar}
      viewMode={viewMode}
      table={tableView}
      cards={cardView}
      isEmpty={!receivings.length}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="PackageCheck" size={40} className="text-[var(--nvi-text-muted)]/40" />
        </div>
      }
      emptyTitle={t('noReceivings')}
      emptyDescription={t('subtitle')}
      emptyAction={
        canWrite ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-[var(--nvi-accent)] px-4 py-2 text-xs font-semibold text-black"
          >
            <Icon name="Plus" size={14} />
            {t('receiveTitle')}
          </button>
        ) : undefined
      }
      pagination={paginationBlock}
    />

    <ReceivingFormModal
      open={formOpen}
      onClose={() => setFormOpen(false)}
      targetType={targetType}
      onTargetTypeChange={setTargetType}
      targetId={targetId}
      onTargetIdChange={setTargetId}
      overrideReason={overrideReason}
      onOverrideReasonChange={setOverrideReason}
      purchases={purchases}
      purchaseOrders={purchaseOrders}
      variants={variants}
      units={units}
      loadVariantOptions={loadVariantOptions}
      getVariantOption={getVariantOption}
      getVariantData={getVariantData}
      formatDocLabel={formatDocLabel}
      batchTrackingEnabled={batchTrackingEnabled}
      lines={lines}
      onUpdateLine={updateLine}
      onAddLine={addLine}
      onRemoveLine={removeLine}
      generatingCodeForLine={generatingCodeForLine}
      onGenerateCode={generateBatchCodeForLine}
      canGenerateCode={Boolean(activeBranch?.id)}
      scanTarget={scanTarget}
      onScanTargetToggle={(lineId) => setScanTarget(scanTarget === lineId ? null : lineId)}
      onSubmit={receive}
      isReceiving={isReceiving}
      canWrite={canWrite}
    />
    </>
  );
}
