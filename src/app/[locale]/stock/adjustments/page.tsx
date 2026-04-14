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
import { Spinner } from '@/components/Spinner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { SmartSelect } from '@/components/SmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { DatePickerInput } from '@/components/DatePickerInput';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { StockAdjustmentModal } from '@/components/stock/StockAdjustmentModal';
import { StockBatchModal } from '@/components/stock/StockBatchModal';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { formatVariantLabel } from '@/lib/display';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { PaginationControls } from '@/components/PaginationControls';
import { useFormatDate } from '@/lib/business-context';
import {
  Card,
  Icon,
  TextInput,
  EmptyState,
  ListPage,
  StatusBadge,
  SortableTableHeader,
  type SortDirection,
} from '@/components/ui';
import { Banner } from '@/components/notifications/Banner';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
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

function reasonIcon(reason?: string | null): React.ReactNode {
  switch (reason?.toUpperCase()) {
    case 'DAMAGED':
      return <Icon name="Hammer" size={14} className="text-red-400" />;
    case 'LOST':
    case 'STOLEN':
      return <Icon name="ShieldAlert" size={14} className="text-red-400" />;
    case 'EXPIRED':
      return <Icon name="Clock" size={14} className="text-amber-400" />;
    case 'SHRINKAGE':
      return <Icon name="TrendingDown" size={14} className="text-red-300" />;
    case 'SOLD_OUTSIDE_POS':
      return <Icon name="Store" size={14} className="text-amber-300" />;
    case 'CORRECTION':
      return <Icon name="Check" size={14} className="text-emerald-400" />;
    case 'UNRECORDED_PURCHASE':
    case 'INITIAL_STOCK':
      return <Icon name="ShoppingCart" size={14} className="text-blue-400" />;
    case 'FOUND_STOCK':
    case 'RETURN_NOT_LOGGED':
      return <Icon name="Search" size={14} className="text-emerald-400" />;
    default:
      return <Icon name="CircleHelp" size={14} className="text-gold-500/60" />;
  }
}

function formatReasonLabel(reason?: string | null): string {
  if (!reason) return '—';
  return reason
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/* ─── Types ────────────────────────────────────────────────────────────────── */

type Branch = { id: string; name: string };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  conversionFactor?: number | string | null;
  product?: { name: string } | null;
};
type Batch = {
  id: string;
  code: string;
  expiryDate?: string | null;
  branchId?: string;
  variantId?: string;
};
type StockMovement = {
  id: string;
  movementType: string;
  quantity: string;
  unitId?: string | null;
  reason?: string | null;
  createdAt: string;
  branch?: { id: string; name: string } | null;
  variant?: {
    id: string;
    name: string;
    imageUrl?: string | null;
    product?: { name?: string | null } | null;
  } | null;
  createdBy?: { id: string; name: string; email: string } | null;
  approval?: {
    id: string;
    status: string;
    approvedByUserId?: string | null;
    approvedBy?: { name: string } | null;
    updatedAt?: string | null;
  } | null;
};

export default function StockAdjustmentsPage() {
  const t = useTranslations('stockAdjustmentsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const { formatDateTime } = useFormatDate();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('stock.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [message, setMessage] = useToastState();
  const [offline, setOffline] = useState(false);
  const [syncBlocked, setSyncBlocked] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [recentAdjustments, setRecentAdjustments] = useState<StockMovement[]>([]);
  const [isLoadingAdjustments, setIsLoadingAdjustments] = useState(false);
  const [showAdjustmentFilters, setShowAdjustmentFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState<number | null>(null);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({ 1: null });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const {
    filters: adjustmentFilters,
    pushFilters: pushAdjustmentFilters,
    resetFilters: resetAdjustmentFilters,
  } = useListFilters({
    search: '',
    branchId: '',
    type: '',
    reason: '',
    from: '',
    to: '',
  });
  const [adjustmentSearch, setAdjustmentSearch] = useState(
    adjustmentFilters.search,
  );
  const [form, setForm] = useState({
    branchId: '',
    variantId: '',
    quantity: '',
    unitId: '',
    type: 'POSITIVE' as 'POSITIVE' | 'NEGATIVE',
    reason: '',
    batchId: '',
    lossReason: '',
    gainReason: '',
  });
  const [batchForm, setBatchForm] = useState({
    branchId: '',
    variantId: '',
    code: '',
    expiryDate: '',
  });
  const { loadOptions: loadVariantOptions, seedCache: seedVariantCache, getVariantOption } = useVariantSearch();
  const { activeBranch, resolveBranchId } = useBranchScope();
  const effectiveAdjustmentBranchId = resolveBranchId(adjustmentFilters.branchId) || '';
  const effectiveFormBranchId = resolveBranchId(form.branchId) || '';
  const effectiveBatchFormBranchId = resolveBranchId(batchForm.branchId) || '';
  const lossReasons = [
    { value: 'DAMAGED', label: t('lossDamaged') },
    { value: 'LOST', label: t('lossLost') },
    { value: 'STOLEN', label: t('lossStolen') },
    { value: 'EXPIRED', label: t('lossExpired') },
    { value: 'SHRINKAGE', label: t('lossShrinkage') },
    { value: 'SOLD_OUTSIDE_POS', label: t('lossSoldOutsidePos') },
    { value: 'CORRECTION', label: t('lossCorrection') },
    { value: 'OTHER', label: t('lossOther') },
  ];
  const gainReasons = [
    { value: 'UNRECORDED_PURCHASE', label: t('gainUnrecordedPurchase') },
    { value: 'INITIAL_STOCK', label: t('gainInitialStock') },
    { value: 'FOUND_STOCK', label: t('gainFoundStock') },
    { value: 'RETURN_NOT_LOGGED', label: t('gainReturnNotLogged') },
    { value: 'CORRECTION', label: t('gainCorrection') },
    { value: 'OTHER', label: t('gainOther') },
  ];

  // Helper text explaining financial impact of each reason
  const reasonFinancialHints: Record<string, string> = {
    DAMAGED: t('hintRecordedAsLoss'),
    LOST: t('hintRecordedAsLoss'),
    STOLEN: t('hintRecordedAsLoss'),
    EXPIRED: t('hintRecordedAsLoss'),
    SHRINKAGE: t('hintRecordedAsLoss'),
    OTHER: t('hintRecordedAsLoss'),
    SOLD_OUTSIDE_POS: t('hintSoldOutsidePos'),
    UNRECORDED_PURCHASE: t('hintRecordedAsCost'),
    INITIAL_STOCK: t('hintRecordedAsCost'),
    FOUND_STOCK: t('hintNoFinancialImpact'),
    RETURN_NOT_LOGGED: t('hintNoFinancialImpact'),
    CORRECTION: t('hintNoFinancialImpact'),
  };
  const activeReason = form.type === 'NEGATIVE' ? form.lossReason : form.gainReason;

  const adjustmentBranchOptions = useMemo(
    () => [
      { value: '', label: common('globalBranch') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );

  const adjustmentTypeOptions = useMemo(
    () => [
      { value: '', label: common('allTypes') },
      { value: 'ADJUSTMENT_POSITIVE', label: t('positiveAdjustments') },
      { value: 'ADJUSTMENT_NEGATIVE', label: t('negativeAdjustments') },
    ],
    [common, t],
  );

  /* ─── KPI derived values ────────────────────────────────────────────────── */

  const kpiPositiveCount = useMemo(
    () => recentAdjustments.filter((m) => m.movementType === 'ADJUSTMENT_POSITIVE').length,
    [recentAdjustments],
  );
  const kpiNegativeCount = useMemo(
    () => recentAdjustments.filter((m) => m.movementType === 'ADJUSTMENT_NEGATIVE').length,
    [recentAdjustments],
  );
  const kpiNetChange = useMemo(() => {
    let net = 0;
    for (const m of recentAdjustments) {
      net += Number(m.quantity) || 0;
    }
    return net;
  }, [recentAdjustments]);

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
    if (!activeBranch?.id) {
      return;
    }
    setForm((prev) =>
      prev.branchId ? prev : { ...prev, branchId: activeBranch.id },
    );
    setBatchForm((prev) =>
      prev.branchId ? prev : { ...prev, branchId: activeBranch.id },
    );
    if (!adjustmentFilters.branchId) {
      pushAdjustmentFilters({ branchId: activeBranch.id });
    }
  }, [activeBranch?.id, adjustmentFilters.branchId, pushAdjustmentFilters]);

  useEffect(() => {
    setAdjustmentSearch(adjustmentFilters.search);
  }, [adjustmentFilters.search]);

  useEffect(() => {
    const load = async () => {
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
          batches?: Batch[];
          units?: Unit[];
        }>('snapshot');
        if (!cache) {
          setMessage({ action: 'sync', outcome: 'info', message: t('offlineCacheUnavailable') });
          setIsLoading(false);
          return;
        }
        setBranches(cache.branches ?? []);
        setVariants(cache.variants ?? []);
        setUnits(cache.units ?? []);
        setIsLoading(false);
        return;
      }
      try {
        const [branchData, variantData, unitList] = await Promise.all([
          apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
            token,
          }),
          apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
            token,
          }),
          loadUnits(token),
        ]);
        setBranches(normalizePaginated(branchData).items);
        const variantList = normalizePaginated(variantData).items;
        setVariants(variantList);
        seedVariantCache(variantList);
        setUnits(unitList);
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
    load();
  }, [offline]);

  const loadAdjustments = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    if (offline) {
      setRecentAdjustments([]);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsLoadingAdjustments(true);
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor =
        targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
      const types = adjustmentFilters.type
        ? undefined
        : 'ADJUSTMENT_POSITIVE,ADJUSTMENT_NEGATIVE';
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
        branchId: effectiveAdjustmentBranchId || undefined,
        type: adjustmentFilters.type || undefined,
        types,
        search: adjustmentFilters.search || undefined,
        reason: adjustmentFilters.reason || undefined,
        from: adjustmentFilters.from || undefined,
        to: adjustmentFilters.to || undefined,
      });
      const data = await apiFetch<
        PaginatedResponse<StockMovement> | StockMovement[]
      >(`/stock/movements${query}`, { token });
      const result = normalizePaginated(data);
      setRecentAdjustments(result.items);
      setNextCursor(result.nextCursor);
      if (typeof result.total === 'number') {
        setTotal(result.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (result.nextCursor) {
          nextState[targetPage + 1] = result.nextCursor;
        }
        return nextState;
      });
    } catch (err) {
      setRecentAdjustments([]);
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      setIsLoadingAdjustments(false);
    }
  }, [
    pageSize,
    effectiveAdjustmentBranchId,
    adjustmentFilters.type,
    adjustmentFilters.search,
    adjustmentFilters.reason,
    adjustmentFilters.from,
    adjustmentFilters.to,
    offline,
    t,
  ]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    loadAdjustments(1);
  }, [loadAdjustments]);

  useEffect(() => {
    if (!form.variantId) {
      return;
    }
    const variant = variants.find((item) => item.id === form.variantId);
    if (!variant) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      unitId: variant.sellUnitId || variant.baseUnitId || '',
    }));
  }, [form.variantId, variants]);

  useEffect(() => {
    const loadFlags = async () => {
      const blocked = (await getOfflineFlag('syncBlocked')) === 'true';
      const required = await isOfflinePinRequired();
      setSyncBlocked(blocked);
      setPinRequired(required);
    };
    loadFlags();
  }, []);

  useEffect(() => {
    const loadBatches = async () => {
      const token = getAccessToken();
      if (!effectiveFormBranchId || !form.variantId) {
        setBatches([]);
        return;
      }
      if (!token || !navigator.onLine) {
        const cache = await getOfflineCache<{ batches?: Batch[] }>('snapshot');
        const cached = (cache?.batches ?? []).filter(
          (batch) =>
            batch.branchId === effectiveFormBranchId &&
            batch.variantId === form.variantId,
        );
        setBatches(cached);
        return;
      }
      const data = await apiFetch<PaginatedResponse<Batch> | Batch[]>(
        `/stock/batches?branchId=${effectiveFormBranchId}&variantId=${form.variantId}`,
        { token },
      );
      setBatches(normalizePaginated(data).items);
    };
    loadBatches().catch((err) => {
      setBatches([]);
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    });
  }, [effectiveFormBranchId, form.variantId]);

  const handleSort = useCallback((key: string, dir: SortDirection) => {
    setSortKey(dir ? key : null);
    setSortDirection(dir);
  }, []);

  const sortedAdjustments = useMemo(() => {
    if (!sortKey || !sortDirection) return recentAdjustments;
    return [...recentAdjustments].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortKey) {
        case 'variant':
          aVal = a.variant?.name ?? '';
          bVal = b.variant?.name ?? '';
          break;
        case 'type':
          aVal = a.movementType;
          bVal = b.movementType;
          break;
        case 'quantity':
          aVal = Math.abs(Number(a.quantity));
          bVal = Math.abs(Number(b.quantity));
          break;
        case 'branch':
          aVal = a.branch?.name ?? '';
          bVal = b.branch?.name ?? '';
          break;
        case 'reason':
          aVal = a.reason ?? '';
          bVal = b.reason ?? '';
          break;
        case 'actor':
          aVal = a.createdBy?.name ?? a.createdBy?.email ?? '';
          bVal = b.createdBy?.name ?? b.createdBy?.email ?? '';
          break;
        case 'createdAt':
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        default:
          return 0;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [recentAdjustments, sortKey, sortDirection]);

  const submit = async () => {
    const token = getAccessToken();
    if (!token || !effectiveFormBranchId || !form.variantId || !form.quantity) {
      return;
    }
    if (form.type === 'NEGATIVE' && !form.lossReason) {
      setMessage({ action: 'save', outcome: 'warning', message: t('lossReasonRequired') });
      return;
    }
    if (form.type === 'POSITIVE' && !form.gainReason) {
      setMessage({ action: 'save', outcome: 'warning', message: t('gainReasonRequired') });
      return;
    }
    setMessage(null);
    setIsSubmitting(true);
    if (offline) {
      if (syncBlocked) {
        setMessage({ action: 'sync', outcome: 'warning', message: t('offlineSyncBlocked') });
        setIsSubmitting(false);
        return;
      }
      if (pinRequired && !pinVerified) {
        setMessage({ action: 'sync', outcome: 'warning', message: t('offlinePinRequired') });
        setIsSubmitting(false);
        return;
      }
      const actionId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `offline-${Date.now()}`;
      try {
        await enqueueOfflineAction({
          id: actionId,
          actionType: 'STOCK_ADJUSTMENT',
          payload: {
            deviceId: getOrCreateDeviceId(),
            branchId: effectiveFormBranchId,
            variantId: form.variantId,
            quantity: Number(form.quantity),
            unitId: form.unitId || undefined,
            type: form.type,
            reason: form.reason || undefined,
            batchId: form.batchId || undefined,
            lossReason: form.lossReason || undefined,
            gainReason: form.gainReason || undefined,
            idempotencyKey: actionId,
          },
          provisionalAt: new Date().toISOString(),
          localAuditId: actionId,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('offlineQueueFailed');
        setMessage(message);
        setIsSubmitting(false);
        return;
      }
      setForm({
        branchId: '',
        variantId: '',
        quantity: '',
        unitId: '',
        type: 'POSITIVE',
        reason: '',
        batchId: '',
        lossReason: '',
        gainReason: '',
      });
      setFormOpen(false);
      setMessage({ action: 'sync', outcome: 'success', message: t('offlineQueued') });
      setIsSubmitting(false);
      return;
    }
    try {
      await apiFetch('/stock/adjustments', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: effectiveFormBranchId,
          variantId: form.variantId,
          quantity: Number(form.quantity),
          unitId: form.unitId || undefined,
          type: form.type,
          reason: form.reason || undefined,
          batchId: form.batchId || undefined,
          lossReason: form.lossReason || undefined,
          gainReason: form.gainReason || undefined,
        }),
      });
      setForm({
        branchId: '',
        variantId: '',
        quantity: '',
        unitId: '',
        type: 'POSITIVE',
        reason: '',
        batchId: '',
        lossReason: '',
        gainReason: '',
      });
      setFormOpen(false);
      await loadAdjustments(page);
      setMessage({ action: 'save', outcome: 'success', message: t('submitted') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('submitFailed')),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const createBatch = async () => {
    const token = getAccessToken();
    if (!token || !effectiveBatchFormBranchId || !batchForm.variantId || !batchForm.code) {
      return;
    }
    setMessage(null);
    setIsCreatingBatch(true);
    try {
      await apiFetch('/stock/batches', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: effectiveBatchFormBranchId,
          variantId: batchForm.variantId,
          code: batchForm.code,
          expiryDate: batchForm.expiryDate || undefined,
        }),
      });
      setBatchForm({ branchId: '', variantId: '', code: '', expiryDate: '' });
      setBatchModalOpen(false);
      setMessage({ action: 'create', outcome: 'success', message: t('batchCreated') });
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('batchCreateFailed')),
      });
    } finally {
      setIsCreatingBatch(false);
    }
  };

  const generateBatchCode = async () => {
    const token = getAccessToken();
    if (!token || !effectiveBatchFormBranchId) return;
    setIsGeneratingCode(true);
    try {
      const result = await apiFetch<{ code: string }>('/stock/batches/generate-code', {
        token,
        method: 'POST',
        body: JSON.stringify({ branchId: effectiveBatchFormBranchId }),
      });
      setBatchForm((prev) => ({ ...prev, code: result.code }));
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, 'Failed to generate batch code'),
      });
    } finally {
      setIsGeneratingCode(false);
    }
  };

  /* ─── Banner message ─────────────────────────────────────────────────────── */
  const bannerNode = message ? (
    <Banner
      message={typeof message === 'string' ? message : message.message}
      severity={
        typeof message === 'string'
          ? 'info'
          : message.outcome === 'failure'
            ? 'error'
            : message.outcome === 'warning'
              ? 'warning'
              : message.outcome === 'success'
                ? 'success'
                : 'info'
      }
      onDismiss={() => setMessage(null)}
    />
  ) : null;

  /* ─── Offline PIN panel ──────────────────────────────────────────────────── */
  const pinPanel = offline && pinRequired && !pinVerified ? (
    <Card padding="md" className="border-red-600/40 nvi-slide-in-bottom">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
          <Icon name="Lock" size={18} className="text-red-400 nvi-float" />
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-sm font-semibold text-red-200">{t('pinRequiredTitle')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <TextInput
              type="password"
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              placeholder={t('pinPlaceholder')}
              className="max-w-[200px] !border-red-700/50"
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
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-red-700/50 px-3 py-2 text-xs font-semibold text-red-100 transition-colors hover:bg-red-500/10"
            >
              <Icon name="LockOpen" size={14} />
              {t('unlock')}
            </button>
          </div>
        </div>
      </div>
    </Card>
  ) : null;

  /* ─── KPI strip ──────────────────────────────────────────────────────────── */
  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      {(
        [
          { icon: 'ArrowUpDown' as const,  tone: 'amber' as const,   label: t('kpiRecentAdjustments'),  value: String(total ?? recentAdjustments.length),                    accent: 'text-gold-100' },
          { icon: 'TrendingUp' as const,   tone: 'emerald' as const, label: t('positiveAdjustments'),   value: `+${kpiPositiveCount}`,                                       accent: 'text-emerald-400' },
          { icon: 'TrendingDown' as const, tone: 'red' as const,     label: t('negativeAdjustments'),   value: String(kpiNegativeCount),                                     accent: 'text-red-400' },
          { icon: 'Scale' as const,        tone: 'blue' as const,    label: t('kpiNetChange'),          value: `${kpiNetChange >= 0 ? '+' : ''}${kpiNetChange}`,             accent: kpiNetChange >= 0 ? 'text-emerald-400' : 'text-red-400' },
        ]
      ).map((k) => (
        <Card key={k.label} as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className={`nvi-kpi-icon nvi-kpi-icon--${k.tone}`}>
              <Icon name={k.icon} size={18} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{k.label}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${k.accent}`}>{k.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  /* ─── Filter bar ─────────────────────────────────────────────────────────── */
  const filterBar = (
    <ListFilters
      searchValue={adjustmentSearch}
      onSearchChange={setAdjustmentSearch}
      onSearchSubmit={() =>
        pushAdjustmentFilters({ search: adjustmentSearch })
      }
      onReset={() => resetAdjustmentFilters()}
      isLoading={isLoadingAdjustments}
      showAdvanced={showAdjustmentFilters}
      onToggleAdvanced={() =>
        setShowAdjustmentFilters((prev) => !prev)
      }
    >
      <SmartSelect
        instanceId="adjustment-filter-branch"
        value={adjustmentFilters.branchId}
        onChange={(value) => pushAdjustmentFilters({ branchId: value })}
        options={adjustmentBranchOptions}
        placeholder={common('branch')}
        className="nvi-select-container"
      />
      <SmartSelect
        instanceId="adjustment-filter-type"
        value={adjustmentFilters.type}
        onChange={(value) => pushAdjustmentFilters({ type: value })}
        options={adjustmentTypeOptions}
        placeholder={t('type')}
        className="nvi-select-container"
      />
      <TextInput
        value={adjustmentFilters.reason}
        onChange={(event) =>
          pushAdjustmentFilters({ reason: event.target.value })
        }
        placeholder={t('reason')}
      />
      <DatePickerInput
        value={adjustmentFilters.from}
        onChange={(value) => pushAdjustmentFilters({ from: value })}
        placeholder={common('fromDate')}
        className="rounded-xl border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
      />
      <DatePickerInput
        value={adjustmentFilters.to}
        onChange={(value) => pushAdjustmentFilters({ to: value })}
        placeholder={common('toDate')}
        className="rounded-xl border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
      />
    </ListFilters>
  );

  /* ─── Card view — TRUE REDESIGN ─────────────────────────────────────────── */
  const cardsContent = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 nvi-stagger">
      {sortedAdjustments.map((movement) => {
        const isPositive = movement.movementType === 'ADJUSTMENT_POSITIVE';
        const qty = Math.abs(Number(movement.quantity));
        const unit = movement.unitId
          ? units.find((item) => item.id === movement.unitId) ?? null
          : null;
        const unitLabel = unit ? buildUnitLabel(unit) : '';
        const variantLabel = movement.variant
          ? formatVariantLabel(
              {
                id: movement.variant.id,
                name: movement.variant.name,
                productName: movement.variant.product?.name ?? null,
              },
              t('variantFallback'),
            )
          : t('variantFallback');
        const displayReason = movement.reason || formatReasonLabel(
          isPositive ? undefined : movement.reason,
        );

        return (
          <Card
            key={movement.id}
            as="article"
            padding="md"
            className="nvi-card-hover group relative overflow-hidden"
          >
            {/* Hero quantity change */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Variant name */}
                <p className="text-sm font-semibold text-gold-100 truncate">
                  {variantLabel}
                </p>
                {movement.variant?.product?.name && movement.variant.name !== movement.variant.product.name && (
                  <p className="text-[11px] text-gold-500 truncate">{movement.variant.product.name}</p>
                )}
              </div>
              {/* HERO: The quantity change */}
              <div className="text-right shrink-0">
                <p className={`text-2xl font-bold tabular-nums leading-none nvi-bounce-in ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : '\u2212'}{qty}
                </p>
                {unitLabel && (
                  <p className="text-[10px] text-gold-500 mt-0.5">{unitLabel}</p>
                )}
              </div>
            </div>

            {/* Reason badge */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${
                isPositive
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}>
                {reasonIcon(movement.reason)}
                {formatReasonLabel(movement.reason)}
              </span>
              {movement.branch && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-gold-700/30 bg-gold-700/5 px-2 py-0.5 text-[10px] text-gold-400">
                  <Icon name="Building2" size={10} className="text-gold-500/60" />
                  {movement.branch.name}
                </span>
              )}
              {movement.approval?.approvedBy?.name && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                  <Icon name="CircleCheck" size={10} className="text-emerald-400" />
                  Approved by: {movement.approval.approvedBy.name}
                </span>
              )}
            </div>

            {/* Footer: actor + time */}
            <div className="mt-3 flex items-center justify-between border-t border-gold-700/15 pt-2.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon name="User" size={12} className="shrink-0 text-gold-600" />
                <span className="text-[11px] text-gold-400 truncate">
                  {movement.createdBy?.name ?? movement.createdBy?.email ?? '\u2014'}
                </span>
              </div>
              <span className="text-[11px] text-gold-600 shrink-0" title={formatDateTime(movement.createdAt)}>
                {timeAgo(movement.createdAt)}
              </span>
            </div>

            {/* Optional reason notes */}
            {displayReason && displayReason !== formatReasonLabel(movement.reason) && (
              <p className="mt-1.5 text-[11px] italic text-gold-500/70 truncate" title={displayReason}>
                {displayReason}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );

  /* ─── Table view ─────────────────────────────────────────────────────────── */
  const tableContent = (
    <Card padding="sm" className="overflow-hidden">
      <div className="overflow-auto text-sm text-gold-200">
        <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
          <thead className="text-xs uppercase text-gold-400">
            <tr>
              <th className="px-3 py-2">{common('images')}</th>
              <SortableTableHeader label={t('variant')} sortKey="variant" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableTableHeader label={t('type')} sortKey="type" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableTableHeader label={t('quantity')} sortKey="quantity" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2">{t('unit')}</th>
              <SortableTableHeader label={t('branch')} sortKey="branch" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableTableHeader label={t('reason')} sortKey="reason" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableTableHeader label={common('actor')} sortKey="actor" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2">Approved by</th>
              <SortableTableHeader label={t('createdAt')} sortKey="createdAt" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedAdjustments.map((movement) => {
              const isPositive = movement.movementType === 'ADJUSTMENT_POSITIVE';
              const unit = movement.unitId
                ? units.find((item) => item.id === movement.unitId) ?? null
                : null;
              const unitLabel = unit ? buildUnitLabel(unit) : movement.unitId ?? '';
              const variantLabel = movement.variant
                ? formatVariantLabel(
                    {
                      id: movement.variant.id,
                      name: movement.variant.name,
                      productName: movement.variant.product?.name ?? null,
                    },
                    t('variantFallback'),
                  )
                : t('variantFallback');
              return (
                <tr key={movement.id} className="border-t border-gold-700/20 transition-colors hover:bg-gold-700/5">
                  <td className="px-3 py-2">
                    <div className="h-8 w-8 overflow-hidden rounded-xl border border-gold-700/40 bg-black">
                      {movement.variant?.imageUrl ? (
                        <img
                          src={movement.variant.imageUrl}
                          alt={movement.variant.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Icon name="Package" size={14} className="text-gold-700/50" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-semibold">{variantLabel}</td>
                  <td className="px-3 py-2"><StatusBadge status={isPositive ? 'POSITIVE' : 'NEGATIVE'} size="xs" /></td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isPositive ? '+' : '\u2212'}{Math.abs(Number(movement.quantity))}
                  </td>
                  <td className="px-3 py-2">{unitLabel}</td>
                  <td className="px-3 py-2">
                    {movement.branch?.name ?? t('branchFallback')}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1">
                      {reasonIcon(movement.reason)}
                      {formatReasonLabel(movement.reason)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {movement.createdBy?.name ?? movement.createdBy?.email ?? '\u2014'}
                  </td>
                  <td className="px-3 py-2">
                    {movement.approval?.approvedBy?.name ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <Icon name="CircleCheck" size={12} />
                        {movement.approval.approvedBy.name}
                      </span>
                    ) : '\u2014'}
                  </td>
                  <td className="px-3 py-2 text-gold-400" title={formatDateTime(movement.createdAt)}>
                    {timeAgo(movement.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  /* ─── Pagination ─────────────────────────────────────────────────────────── */
  const paginationNode = (
    <PaginationControls
      page={page}
      pageSize={pageSize}
      total={total}
      itemCount={recentAdjustments.length}
      availablePages={Object.keys(pageCursors).map(Number)}
      hasNext={Boolean(nextCursor)}
      hasPrev={page > 1}
      isLoading={isLoadingAdjustments}
      onPageChange={(nextPage) => loadAdjustments(nextPage)}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(1);
        setPageCursors({ 1: null });
        setTotal(null);
        loadAdjustments(1, size);
      }}
    />
  );

  /* ─── Render via ListPage ────────────────────────────────────────────────── */
  return (
    <>
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      eyebrow={offline ? 'Offline' : undefined}
      badges={
        offline ? (
          <span className="inline-flex items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 nvi-float">
            <Icon name="WifiOff" size={12} />
            Offline
          </span>
        ) : undefined
      }
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <>
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="nvi-cta nvi-press inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-black"
              >
                <Icon name="Plus" size={14} />
                {t('submitAdjustment')}
              </button>
              <button
                type="button"
                onClick={() => setBatchModalOpen(true)}
                className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs text-[var(--nvi-text)]"
              >
                <Icon name="Layers" size={14} />
                {t('createBatch')}
              </button>
            </>
          ) : null}
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </div>
      }
      banner={bannerNode}
      kpis={kpiStrip}
      filters={filterBar}
      beforeContent={pinPanel}
      viewMode={viewMode}
      table={isLoadingAdjustments ? (
        <div className="flex items-center gap-2 py-8 justify-center text-xs text-gold-300">
          <Spinner size="xs" variant="orbit" /> {t('loadingAdjustments')}
        </div>
      ) : tableContent}
      cards={isLoadingAdjustments ? (
        <div className="flex items-center gap-2 py-8 justify-center text-xs text-gold-300">
          <Spinner size="xs" variant="orbit" /> {t('loadingAdjustments')}
        </div>
      ) : cardsContent}
      isEmpty={!isLoadingAdjustments && !recentAdjustments.length}
      emptyIcon={<Icon name="ArrowUpDown" size={40} className="text-gold-500/40 nvi-float" />}
      emptyTitle={t('noAdjustments')}
      emptyDescription={t('subtitle')}
      emptyAction={
        canWrite ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-black"
          >
            <Icon name="Plus" size={16} />
            {t('submitAdjustment')}
          </button>
        ) : undefined
      }
      pagination={paginationNode}
      isLoading={isLoading}
    />

    <StockAdjustmentModal
      open={formOpen}
      onClose={() => setFormOpen(false)}
      form={form}
      onFormChange={setForm}
      branches={branches}
      variants={variants}
      units={units}
      batches={batches}
      lossReasons={lossReasons}
      gainReasons={gainReasons}
      reasonFinancialHints={reasonFinancialHints}
      loadVariantOptions={loadVariantOptions}
      getVariantOption={getVariantOption}
      onSubmit={submit}
      isSubmitting={isSubmitting}
      canWrite={canWrite}
    />

    <StockBatchModal
      open={batchModalOpen}
      onClose={() => setBatchModalOpen(false)}
      form={batchForm}
      onFormChange={setBatchForm}
      branches={branches}
      variants={variants}
      loadVariantOptions={loadVariantOptions}
      getVariantOption={getVariantOption}
      onSubmit={createBatch}
      onGenerateCode={generateBatchCode}
      isSubmitting={isCreatingBatch}
      isGeneratingCode={isGeneratingCode}
      canWrite={canWrite}
      canGenerateCode={Boolean(effectiveBatchFormBranchId)}
    />
    </>
  );
}
