'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState, messageText } from '@/lib/app-notifications';
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
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { Banner } from '@/components/notifications/Banner';
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

import { useFormatDate } from '@/lib/business-context';
import {
  ListPage,
  Card,
  Icon,
  TextInput,
  StatusBadge,
  SortableTableHeader,
  ProgressBar,
  EmptyState,
} from '@/components/ui';
import type { SortDirection } from '@/components/ui';
import { PurchaseCreateModal } from '@/components/purchases/PurchaseCreateModal';
import { PurchasePaymentModal } from '@/components/purchases/PurchasePaymentModal';

// ─── Types ──────────────────────────────────────────────────────────────────

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
  referenceNumber?: string | null;
  status: string;
  total: string;
  createdAt: string;
  supplier?: Supplier;
  branch?: Branch;
  lines: { variantId: string; quantity: string; unitCost: string; unitId?: string }[];
  payments: { id: string; method: string; amount: string; reference?: string | null }[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function computePaymentInfo(purchase: Purchase) {
  const totalPaid = purchase.payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) ?? 0;
  const totalDue = Number(purchase.total) || 0;
  const paidPercent = totalDue > 0 ? Math.min(Math.round((totalPaid / totalDue) * 100), 100) : 0;
  const isPaid = totalDue > 0 && totalPaid >= totalDue;
  const isPartial = totalPaid > 0 && !isPaid;
  const remaining = Math.max(totalDue - totalPaid, 0);
  return { totalPaid, totalDue, paidPercent, isPaid, isPartial, remaining };
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}

function fmtNum(n: number | string): string {
  const val = Number(n);
  if (Number.isNaN(val)) return String(n);
  return val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PurchasesPage() {
  const t = useTranslations('purchasesPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const { formatDate, formatDateTime } = useFormatDate();
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
  const [createOpen, setCreateOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
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
  const [expandedPayment, setExpandedPayment] = useState<string | null>(null);
  const [form, setForm] = useState({
    branchId: '',
    supplierId: '',
  });
  const { activeBranch, resolveBranchId } = useBranchScope();
  const { loadOptions: loadVariantOptions, getVariantData, seedCache: seedVariantCache, getVariantOption } = useVariantSearch();

  const getUnitOptionsForVariant = useCallback(
    (variantId: string) => {
      const allOpts = units.map((u) => ({ value: u.id, label: buildUnitLabel(u) }));
      if (!variantId) return allOpts;
      const variant = getVariantData(variantId) ?? variants.find((v) => v.id === variantId);
      if (!variant) return allOpts;
      const validIds = new Set<string>();
      if (variant.baseUnitId) validIds.add(variant.baseUnitId);
      if (variant.sellUnitId) validIds.add(variant.sellUnitId);
      if (validIds.size === 0) return allOpts;
      return units
        .filter((u) => validIds.has(u.id))
        .map((u) => ({
          value: u.id,
          label: `${buildUnitLabel(u)}${u.id === variant.baseUnitId ? ` (${t('unitBase')})` : u.id === variant.sellUnitId ? ` (${t('unitSell')})` : ''}`,
        }));
    },
    [units, variants, getVariantData, t],
  );

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

  // ─── Derived KPI data ───────────────────────────────────────────────────

  const kpiData = useMemo(() => {
    let monthSpend = 0;
    let unpaidBalance = 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    for (const p of purchases) {
      const total = Number(p.total) || 0;
      const created = new Date(p.createdAt);
      if (created >= monthStart) {
        monthSpend += total;
      }
      const { remaining } = computePaymentInfo(p);
      unpaidBalance += remaining;
    }

    return { monthSpend, unpaidBalance };
  }, [purchases]);

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);



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

  // ─── Handlers ─────────────────────────────────────────────────────────────

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
      setCreateOpen(false);
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

  const reorderFromPurchase = (purchase: Purchase) => {
    // Seed variant cache from local variants list for any IDs in the purchase
    const purchaseVariantIds = new Set(purchase.lines.map((l) => l.variantId).filter(Boolean));
    const seeds = variants.filter((v) => purchaseVariantIds.has(v.id));
    if (seeds.length) seedVariantCache(seeds);

    setForm({
      branchId: purchase.branch?.id ?? '',
      supplierId: purchase.supplier?.id ?? '',
    });
    setLines(
      purchase.lines.length > 0
        ? purchase.lines.map((line) => ({
            id: crypto.randomUUID(),
            variantId: line.variantId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            unitId: line.unitId ?? '',
          }))
        : [{ id: crypto.randomUUID(), variantId: '', quantity: '', unitCost: '', unitId: '' }],
    );
    setCreateOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startInlinePayment = (purchaseId: string) => {
    setExpandedPayment((prev) => (prev === purchaseId ? null : purchaseId));
    setPaymentForm((prev) => ({ ...prev, purchaseId, amount: '', reference: '', methodLabel: '' }));
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
      setExpandedPayment(null);
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

  // ─── Banner helper ────────────────────────────────────────────────────────

  const bannerNode = message ? (
    <Banner
      message={messageText(message)}
      onDismiss={() => setMessage(null)}
    />
  ) : null;

  // ─── Payment method color map ──────────────────────────────────────────────

  const paymentMethodStyle: Record<string, { bg: string; text: string; icon: 'Banknote' | 'CreditCard' | 'Smartphone' | 'Landmark' | 'Wallet' }> = {
    CASH: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: 'Banknote' },
    CARD: { bg: 'bg-blue-500/15', text: 'text-blue-400', icon: 'CreditCard' },
    MOBILE_MONEY: { bg: 'bg-purple-500/15', text: 'text-purple-400', icon: 'Smartphone' },
    BANK_TRANSFER: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', icon: 'Landmark' },
    OTHER: { bg: 'bg-gray-500/15', text: 'text-gray-400', icon: 'Wallet' },
  };

  const defaultMethodStyle = { bg: 'bg-gray-500/15', text: 'text-gray-400', icon: 'Wallet' as const };

  // ─── Payment status indicator ─────────────────────────────────────────────

  const PaymentIndicator = ({ purchase }: { purchase: Purchase }) => {
    const { isPaid, isPartial, paidPercent, totalPaid, totalDue } = computePaymentInfo(purchase);
    const barColor = isPaid ? 'green' : isPartial ? 'amber' : 'red';
    const textColor = isPaid ? 'text-emerald-400' : isPartial ? 'text-amber-400' : 'text-red-400';
    const label = isPaid ? (common('statusCompleted') || 'Paid') : isPartial ? `${paidPercent}% paid` : (common('statusPending') || 'Unpaid');

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold ${textColor}`}>{label}</span>
          <span className="text-[10px] tabular-nums text-[var(--nvi-text-muted)]">
            {fmtNum(totalPaid)} / {fmtNum(totalDue)}
          </span>
        </div>
        <ProgressBar value={paidPercent} max={100} color={barColor} height={4} />
      </div>
    );
  };

  // ─── Table payment cell ────────────────────────────────────────────────────

  const PaymentCell = ({ purchase }: { purchase: Purchase }) => {
    const { isPaid, isPartial, paidPercent } = computePaymentInfo(purchase);
    const dotColor = isPaid ? 'bg-emerald-400' : isPartial ? 'bg-amber-400' : 'bg-red-400';
    const barColor = isPaid ? 'green' : isPartial ? 'amber' : 'red';
    const textColor = isPaid ? 'text-emerald-400' : isPartial ? 'text-amber-400' : 'text-red-400';
    return (
      <div className="flex items-center gap-2.5 min-w-[120px]">
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
        <ProgressBar value={paidPercent} max={100} color={barColor} height={4} className="flex-1 min-w-[48px]" />
        <span className={`text-[11px] font-medium tabular-nums ${textColor} shrink-0`}>
          {paidPercent}%
        </span>
      </div>
    );
  };

  // ─── KPI strip ────────────────────────────────────────────────────────────

  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      {(
        [
          { icon: 'ShoppingCart' as const, tone: 'amber' as const,   label: t('kpiTotal'),         value: String(total ?? purchases.length),                 accent: 'text-white',         size: '2xl' },
          { icon: 'TrendingUp' as const,   tone: 'blue' as const,    label: t('kpiMonthSpend'),    value: fmtNum(kpiData.monthSpend),                         accent: 'text-blue-400',      size: '2xl' },
          { icon: 'CircleAlert' as const,  tone: 'red' as const,     label: t('kpiUnpaid'),        value: fmtNum(kpiData.unpaidBalance),                      accent: 'text-red-400',       size: '2xl' },
          { icon: 'Building2' as const,    tone: 'emerald' as const, label: t('kpiActiveBranch'),  value: activeBranch?.name ?? common('globalBranch'),       accent: 'text-emerald-400',   size: 'lg'  },
        ]
      ).map((k) => (
        <Card key={k.label} padding="md" as="article" className="nvi-card-hover">
          <div className="flex items-center gap-3">
            <div className={`nvi-kpi-icon nvi-kpi-icon--${k.tone}`}>
              <Icon name={k.icon} size={20} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{k.label}</p>
              <p className={`${k.size === '2xl' ? 'text-2xl font-extrabold' : 'text-lg font-bold'} ${k.accent} leading-tight ${k.size === '2xl' ? 'tabular-nums' : 'truncate'}`}>{k.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  // ─── Filters ──────────────────────────────────────────────────────────────

  const filterBar = (
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
        className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-text)]"
      />
      <DatePickerInput
        value={filters.to}
        onChange={(value) => pushFilters({ to: value })}
        placeholder={common('toDate')}
        className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-text)]"
      />
    </ListFilters>
  );

  // ─── Offline PIN gate ─────────────────────────────────────────────────────

  const offlinePinGate = offline && pinRequired && !pinVerified ? (
    <Card padding="md" className="border-red-600/40 bg-red-950/30">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/20">
          <Icon name="Lock" size={16} className="text-red-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-200">{t('pinRequiredTitle')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TextInput
              type="password"
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              placeholder={t('pinPlaceholder')}
              className="max-w-[200px]"
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
              className="nvi-cta nvi-press rounded-xl px-3 py-2 text-xs font-semibold text-black"
            >
              {t('unlock')}
            </button>
          </div>
        </div>
      </div>
    </Card>
  ) : null;

  // ─── Create form ──────────────────────────────────────────────────────────


  // ─── Purchase cards ───────────────────────────────────────────────────────

  const purchaseCards = (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 nvi-stagger">
      {purchases.map((purchase) => {
        const { totalPaid, totalDue, paidPercent, isPaid, isPartial, remaining } = computePaymentInfo(purchase);
        const totalItems = purchase.lines.length;
        const totalUnits = purchase.lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
        const isPaymentExpanded = expandedPayment === purchase.id;
        const costColor = isPaid ? 'text-emerald-400' : isPartial ? 'text-amber-400' : 'text-red-400';

        return (
          <Card key={purchase.id} padding="sm" className="nvi-card-hover flex flex-col">
            {/* ── Header: hero cost + order status ── */}
            <div className="flex items-start justify-between p-1">
              <div className="min-w-0">
                <p className={`text-2xl font-extrabold tabular-nums leading-tight ${costColor}`}>
                  {fmtNum(purchase.total)}
                </p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-white/30">
                  {purchase.referenceNumber || '#' + shortId(purchase.id)}
                </p>
              </div>
              <StatusBadge
                status={purchase.status}
                label={purchaseStatusLabels[purchase.status]}
                size="xs"
                className="nvi-status-fade shrink-0"
              />
            </div>

            {/* ── Supplier row with blue-tinted icon ── */}
            <div className="mt-2 flex items-center gap-2.5 px-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                <Icon name="Building2" size={15} className="text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white/90 truncate">
                  {purchase.supplier?.name ?? t('supplierFallback')}
                </p>
                {purchase.branch?.name ? (
                  <p className="text-[10px] text-white/40 truncate">{purchase.branch.name}</p>
                ) : null}
              </div>
            </div>

            {/* ── Meta chips: items badge, date ── */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2 px-1">
              <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                <Icon name="Package" size={10} className="text-white/30" />
                {totalItems} {totalItems === 1 ? 'item' : 'items'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                <Icon name="Layers" size={10} className="text-white/30" />
                {fmtNum(totalUnits)} units
              </span>
              <span className="ml-auto text-[10px] text-white/30">
                {relativeTime(purchase.createdAt)}
              </span>
            </div>

            {/* ── Payment progress bar ── */}
            <div className="mt-3 border-t border-white/[0.06] pt-2.5 px-1">
              <PaymentIndicator purchase={purchase} />
            </div>

            {/* ── Payment method pills (colored per method) ── */}
            {purchase.payments?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5 px-1">
                {purchase.payments.map((payment) => {
                  const mStyle = paymentMethodStyle[payment.method] ?? defaultMethodStyle;
                  return (
                    <span
                      key={payment.id}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-medium ${mStyle.bg} ${mStyle.text}`}
                    >
                      <Icon name={mStyle.icon} size={10} />
                      {fmtNum(payment.amount)}
                    </span>
                  );
                })}
              </div>
            ) : null}

            {/* ── Action buttons ── */}
            {canWrite ? (
              <div className="mt-auto border-t border-white/[0.06] pt-2.5 px-1 mt-3">
                <div className="flex flex-wrap gap-2">
                  {!isPaid ? (
                    <button
                      type="button"
                      onClick={() => startInlinePayment(purchase.id)}
                      className="nvi-press flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20"
                    >
                      <Icon name="CreditCard" size={12} />
                      {t('recordPayment')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => reorderFromPurchase(purchase)}
                    className="nvi-press flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-white/60 transition-colors hover:bg-white/[0.08]"
                  >
                    <Icon name="RotateCcw" size={12} />
                    {t('reorder')}
                  </button>
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );

  // ─── Table view ───────────────────────────────────────────────────────────

  const purchaseTable = (
    <Card padding="md">
      <div className="overflow-auto">
        <table className="min-w-[880px] w-full text-left text-sm text-[var(--nvi-text)]">
          <thead>
            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/35">
              <SortableTableHeader label={t('supplierFallback')} sortKey="supplier" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
              <SortableTableHeader label={common('branch')} sortKey="branch" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
              <SortableTableHeader label={t('statusLabel')} sortKey="status" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
              <th className="px-3 py-2.5">{t('paymentStatus') || 'Payment'}</th>
              <SortableTableHeader label={t('createdAt')} sortKey="createdAt" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
              <SortableTableHeader label={t('total')} sortKey="total" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} align="right" />
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => {
              const { isPaid, isPartial } = computePaymentInfo(purchase);
              const amountColor = isPaid ? 'text-emerald-400' : isPartial ? 'text-amber-400' : 'text-white/90';
              return (
                <tr key={purchase.id} className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                        <Icon name="Building2" size={13} className="text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white/90 truncate">{purchase.supplier?.name ?? t('supplierFallback')}</p>
                        <p className="text-[10px] text-white/30">{purchase.referenceNumber || '#' + shortId(purchase.id)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-white/40">{purchase.branch?.name ?? '\u2014'}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      status={purchase.status}
                      label={purchaseStatusLabels[purchase.status]}
                      size="xs"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <PaymentCell purchase={purchase} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-white/35">
                    {relativeTime(purchase.createdAt)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${amountColor}`}>
                    {fmtNum(purchase.total)}
                  </td>
                  <td className="px-3 py-2.5">
                    {canWrite ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startInlinePayment(purchase.id)}
                          className="nvi-press flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20"
                        >
                          <Icon name="CreditCard" size={10} />
                          {t('recordPayment')}
                        </button>
                        <button
                          type="button"
                          onClick={() => reorderFromPurchase(purchase)}
                          className="nvi-press rounded-lg bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-white/50 transition-colors hover:bg-white/[0.08]"
                        >
                          {t('reorder')}
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </Card>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  const selectedPurchase = purchases.find((p) => p.id === expandedPayment) ?? null;
  const selectedRemaining = selectedPurchase
    ? computePaymentInfo(selectedPurchase).remaining
    : 0;
  const selectedPurchaseLabel = selectedPurchase
    ? (selectedPurchase.referenceNumber ??
      selectedPurchase.supplier?.name ??
      null)
    : null;

  return (
    <>
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      eyebrow={t('eyebrow')}
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="nvi-cta nvi-press inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-black"
            >
              <Icon name="ShoppingCart" size={14} />
              {t('createPurchase')}
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
      beforeContent={offlinePinGate}
      viewMode={viewMode}
      isEmpty={!purchases.length}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="ShoppingCart" size={32} className="text-[var(--nvi-text-muted)]" />
        </div>
      }
      emptyTitle={t('noPurchases')}
      emptyDescription={t('emptyDescription') || undefined}
      table={purchaseTable}
      cards={purchaseCards}
      pagination={
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
      }
    />

    <PurchaseCreateModal
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      form={form}
      onFormChange={setForm}
      branches={branches}
      suppliers={suppliers}
      variants={variants}
      units={units}
      lines={lines}
      onUpdateLine={updateLine}
      onAddLine={addLine}
      onRemoveLine={removeLine}
      loadVariantOptions={loadVariantOptions}
      getVariantOption={getVariantOption}
      onSubmit={createPurchase}
      isCreating={isCreating}
      canWrite={canWrite}
    />

    <PurchasePaymentModal
      open={Boolean(expandedPayment)}
      onClose={() => setExpandedPayment(null)}
      form={paymentForm}
      onFormChange={setPaymentForm}
      remaining={selectedRemaining}
      purchaseLabel={selectedPurchaseLabel}
      onSubmit={recordPayment}
      isRecording={isRecording}
    />
    </>
  );
}
