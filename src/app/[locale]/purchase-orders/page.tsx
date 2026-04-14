'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { Banner } from '@/components/notifications/Banner';
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

import { useFormatDate } from '@/lib/business-context';
import {
  Card,
  Icon,
  EmptyState,
  ListPage,
  StatusBadge,
} from '@/components/ui';
import { SortableTableHeader, SortDirection } from '@/components/ui/SortableTableHeader';
import { PurchaseOrderCreateModal } from '@/components/purchase-orders/PurchaseOrderCreateModal';
import { PurchaseOrderEditModal } from '@/components/purchase-orders/PurchaseOrderEditModal';

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
  referenceNumber?: string | null;
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

/* ─── PO pipeline steps ─── */
const PIPELINE_STEPS = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED'] as const;
const PIPELINE_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending',
  APPROVED: 'Approved',
  PARTIALLY_RECEIVED: 'Partial',
  FULLY_RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
  CLOSED: 'Closed',
};

function POPipeline({ status }: { status: string }) {
  const isCancelled = status === 'CANCELLED';
  const isClosed = status === 'CLOSED';

  if (isCancelled) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 nvi-status-fade">
          <Icon name="CircleX" size={12} className="text-red-400" />
          <span className="text-[10px] font-semibold text-red-400">Cancelled</span>
        </div>
      </div>
    );
  }

  if (isClosed) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 rounded-full bg-gray-500/10 px-2.5 py-1 nvi-status-fade">
          <Icon name="CircleCheck" size={12} className="text-gray-400" />
          <span className="text-[10px] font-semibold text-gray-400">Closed</span>
        </div>
      </div>
    );
  }

  const currentIndex = PIPELINE_STEPS.indexOf(status as typeof PIPELINE_STEPS[number]);

  return (
    <div className="flex items-center gap-1 nvi-bounce-in">
      {PIPELINE_STEPS.map((step, i) => {
        const isComplete = currentIndex > i;
        const isCurrent = currentIndex === i;

        return (
          <div key={step} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={`h-px w-3 transition-colors duration-300 ${
                  isComplete ? 'bg-emerald-400/60' : 'bg-[var(--nvi-border)]'
                }`}
              />
            )}
            <div className="flex items-center gap-1">
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-300 ${
                  isCurrent
                    ? 'bg-amber-400/20 ring-2 ring-amber-400/50'
                    : isComplete
                      ? 'bg-emerald-500/20'
                      : 'bg-white/10'
                }`}
              >
                {isComplete ? (
                  <Icon name="CircleCheck" size={10} className="text-emerald-400" />
                ) : (
                  <div
                    className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                      isCurrent ? 'bg-amber-400' : 'bg-white/20'
                    }`}
                  />
                )}
              </div>
              <span
                className={`text-[9px] font-medium uppercase tracking-wider transition-colors duration-300 ${
                  isCurrent
                    ? 'text-amber-400'
                    : isComplete
                      ? 'text-emerald-400/70'
                      : 'text-[var(--nvi-text-muted)]/40'
                }`}
              >
                {PIPELINE_LABELS[step]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Compact inline pipeline for table view ─── */
function POPipelineCompact({ status }: { status: string }) {
  const isCancelled = status === 'CANCELLED';
  const isClosed = status === 'CLOSED';

  if (isCancelled) {
    return <div className="flex h-2 w-2 rounded-full bg-red-400 nvi-status-fade" />;
  }
  if (isClosed) {
    return <div className="flex h-2 w-2 rounded-full bg-gray-400 nvi-status-fade" />;
  }

  const currentIndex = PIPELINE_STEPS.indexOf(status as typeof PIPELINE_STEPS[number]);

  return (
    <div className="flex items-center gap-0.5">
      {PIPELINE_STEPS.map((step, i) => {
        const isComplete = currentIndex > i;
        const isCurrent = currentIndex === i;
        return (
          <div key={step} className="flex items-center gap-0.5">
            {i > 0 && (
              <div className={`h-px w-1.5 ${isComplete ? 'bg-emerald-400/60' : 'bg-[var(--nvi-border)]'}`} />
            )}
            <div
              className={`h-2 w-2 rounded-full transition-all duration-300 ${
                isCurrent
                  ? 'bg-amber-400 ring-2 ring-amber-400/40'
                  : isComplete
                    ? 'bg-emerald-400'
                    : 'bg-white/20'
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ─── Relative time helper ─── */
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/* ─── Overdue days helper ─── */
function overdueDays(expectedAt: string): number {
  const diff = Date.now() - new Date(expectedAt).getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

export default function PurchaseOrdersPage() {
  const t = useTranslations('purchaseOrdersPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const { formatDate, formatDateTime } = useFormatDate();
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
  const [createOpen, setCreateOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
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

  const openEditModalFor = useCallback((order: PurchaseOrder) => {
    setUpdateForm({
      purchaseOrderId: order.id,
      expectedAt: order.expectedAt ?? '',
    });
    setUpdateLines(
      order.lines.length > 0
        ? order.lines.map((l) => ({
            id: crypto.randomUUID(),
            variantId: l.variantId,
            quantity: String(l.quantity),
            unitCost: String(l.unitCost),
            unitId: l.unitId ?? '',
          }))
        : [
            {
              id: crypto.randomUUID(),
              variantId: '',
              quantity: '',
              unitCost: '',
              unitId: '',
            },
          ],
    );
  }, []);

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
    const ref = order.referenceNumber || null;
    const parts = [
      ref,
      order.supplier?.name ?? order.branch?.name ?? null,
      dateLabel,
      order.status,
    ].filter(Boolean);
    return parts.length
      ? parts.join(' • ')
      : formatEntityLabel({ id: order.id }, common('unknown'));
  };
  const COMPLETED_STATUSES = ['FULLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'];
  const isOverdue = (order: PurchaseOrder): boolean => {
    if (!order.expectedAt) return false;
    if (COMPLETED_STATUSES.includes(order.status)) return false;
    return new Date(order.expectedAt).getTime() < Date.now();
  };

  const overdueCount = useMemo(
    () => orders.filter(isOverdue).length,
    [orders],
  );

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
    // Seed variant cache from local variants list for suggestion IDs
    const suggestionIds = new Set(reorderSuggestions.map((s) => s.variantId).filter(Boolean));
    const seeds = variants.filter((v) => suggestionIds.has(v.id));
    if (seeds.length) seedVariantCache(seeds);

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


  /* ─── KPI strip ─── */
  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      {(
        [
          { icon: 'ClipboardList' as const, tone: 'amber' as const,   label: t('kpiOpenOrders'),      value: total ?? orders.length,                                 accent: 'text-[var(--nvi-text)]' },
          { icon: 'TriangleAlert' as const, tone: 'red' as const,     label: t('overdue') || 'Overdue', value: overdueCount,                                           accent: overdueCount > 0 ? 'text-red-400' : 'text-[var(--nvi-text)]' },
          { icon: 'Clock' as const,         tone: 'blue' as const,    label: t('kpiPendingApproval'),  value: pendingApprovalCount,                                   accent: 'text-blue-400' },
          { icon: 'CircleCheck' as const,   tone: 'emerald' as const, label: t('kpiApprovedFlow'),     value: approvedCount,                                          accent: 'text-emerald-400' },
        ]
      ).map((k) => (
        <Card key={k.label} padding="md" as="article">
          <div className="flex items-center gap-3">
            <div className={`nvi-kpi-icon nvi-kpi-icon--${k.tone}`}>
              <Icon name={k.icon} size={20} />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--nvi-text-muted)]">
                {k.label}
              </p>
              <p className={`text-2xl font-bold tabular-nums ${k.accent}`}>{k.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  /* ─── Filter bar ─── */
  const filterBar = (
    <Card padding="md">
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

  /* ─── Before content: Create form + Reorder suggestions + Edit form ─── */
  const beforeContent = approvalNotice ? (
    <Banner
      message={t('approvalRequired', { id: approvalNotice.approvalId ?? '' })}
      title={approvalNotice.action}
      severity="warning"
      onDismiss={() => setApprovalNotice(null)}
    />
  ) : null;


  /* ─── Card view ─── */
  const cardView = (
    <div className="grid gap-4 md:grid-cols-2 nvi-stagger">
      {orders.map((order) => {
        const overdue = isOverdue(order);
        const orderTotal = order.lines.reduce(
          (sum, line) => sum + Number(line.quantity) * Number(line.unitCost),
          0,
        );
        const totalUnits = order.lines.reduce(
          (sum, line) => sum + Number(line.quantity),
          0,
        );
        const isExpanded = expandedCards[order.id] ?? false;
        const daysOverdue = overdue && order.expectedAt ? overdueDays(order.expectedAt) : 0;
        const isUpcomingSoon =
          !overdue &&
          order.expectedAt &&
          !COMPLETED_STATUSES.includes(order.status) &&
          new Date(order.expectedAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

        return (
          <Card key={order.id} as="article" className={`nvi-card-hover space-y-4 ${overdue ? 'ring-1 ring-red-500/20' : ''}`}>
            {/* Pipeline progress */}
            <POPipeline status={order.status} />

            {/* Supplier + Hero total */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                  <Icon name="Truck" size={18} className="text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--nvi-text)]">
                    {order.supplier?.name ?? t('supplierFallback')}
                  </p>
                  {order.referenceNumber ? (
                    <p className="text-[10px] font-mono text-[var(--nvi-text-muted)]">{order.referenceNumber}</p>
                  ) : (
                    <p className="text-[10px] text-[var(--nvi-text-muted)]">{relativeTime(order.createdAt)}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold tabular-nums text-emerald-400">
                  {orderTotal.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-[var(--nvi-text-muted)]">{common('total') || 'Total'}</p>
              </div>
            </div>

            {/* Delivery + Items row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Expected delivery */}
              {order.expectedAt ? (
                overdue ? (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5">
                    <Icon name="TriangleAlert" size={13} className="text-red-400" />
                    <span className="text-xs font-semibold text-red-400">
                      {daysOverdue}d {t('overdue')}
                    </span>
                  </div>
                ) : isUpcomingSoon ? (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5">
                    <Icon name="CalendarClock" size={13} className="text-amber-400" />
                    <span className="text-xs text-amber-400">
                      {formatDate(order.expectedAt)}
                    </span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--nvi-surface-alt)] px-2.5 py-1.5">
                    <Icon name="CalendarClock" size={13} className="text-[var(--nvi-text-muted)]" />
                    <span className="text-xs text-[var(--nvi-text-muted)]">{formatDate(order.expectedAt)}</span>
                  </div>
                )
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--nvi-surface-alt)] px-2.5 py-1.5 text-xs text-[var(--nvi-text-muted)]">
                  <Icon name="CalendarClock" size={13} />
                  {t('expectedAtMissing')}
                </span>
              )}

              {/* Items badge */}
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500/10 px-2.5 py-1.5 text-xs font-medium text-purple-300">
                <Icon name="Package" size={13} />
                {order.lines.length} {order.lines.length === 1 ? 'item' : 'items'}
              </span>

              {/* Branch */}
              {order.branch?.name ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--nvi-surface-alt)] px-2.5 py-1.5 text-xs text-[var(--nvi-text-muted)]">
                  <Icon name="MapPin" size={12} />
                  {order.branch.name}
                </span>
              ) : null}

              {order.supplier?.leadTimeDays ? (
                <span className="text-[10px] text-[var(--nvi-text-muted)]">
                  ({order.supplier.leadTimeDays}d {t('leadTime')})
                </span>
              ) : null}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--nvi-border)] pt-3">
              {(order.status === 'DRAFT' || order.status === 'PENDING_APPROVAL') && canWrite ? (
                <button
                  type="button"
                  onClick={() => approveOrder(order.id)}
                  className="nvi-press inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={actionBusy[order.id]}
                  title={!canWrite ? noAccess('title') : undefined}
                >
                  {actionBusy[order.id] ? (
                    <Spinner size="xs" variant="grid" />
                  ) : (
                    <Icon name="CircleCheck" size={14} />
                  )}
                  {actionBusy[order.id] ? t('approving') : actions('approve')}
                </button>
              ) : null}
              {(order.status === 'APPROVED' || order.status === 'PARTIALLY_RECEIVED') && canWrite ? (
                <Link
                  href={`/${locale}/purchase-orders/${order.id}/receive`}
                  className="nvi-press inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-400 hover:bg-blue-500/25"
                >
                  <Icon name="PackageCheck" size={14} />
                  Receive
                </Link>
              ) : null}
              {order.status === 'DRAFT' && canWrite ? (
                <button
                  type="button"
                  onClick={() => openEditModalFor(order)}
                  className="nvi-press inline-flex items-center gap-1.5 rounded-lg border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text)] hover:border-amber-500/40 hover:text-amber-400"
                >
                  <Icon name="Pencil" size={14} />
                  {actions('edit') || 'Edit'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  setExpandedCards((prev) => ({
                    ...prev,
                    [order.id]: !prev[order.id],
                  }))
                }
                className="nvi-press ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-[var(--nvi-text-muted)] hover:text-[var(--nvi-text)]"
              >
                <Icon name={isExpanded ? 'ChevronUp' : 'ChevronDown'} size={12} />
                {isExpanded ? 'Hide' : `${order.lines.length} items`}
              </button>
            </div>

            {/* Expandable line items */}
            {isExpanded && order.lines.length > 0 ? (
              <div className="space-y-1.5 nvi-slide-in-bottom">
                {order.lines.map((line, index) => {
                  const unit = line.unitId
                    ? units.find((item) => item.id === line.unitId) ?? null
                    : null;
                  const unitLabel = unit ? buildUnitLabel(unit) : line.unitId ?? '';
                  const lineTotal = Number(line.quantity) * Number(line.unitCost);
                  return (
                    <div
                      key={`${order.id}-${index}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[var(--nvi-surface-alt)] px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[var(--nvi-text)]">
                          {resolveVariantLabel(line.variantId, line.variant)}
                        </p>
                        <p className="text-[var(--nvi-text-muted)]">
                          {line.quantity} {unitLabel} x {line.unitCost}
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums font-semibold text-emerald-400">
                        {lineTotal.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );

  /* ─── Table view ─── */
  const getStatusDotColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-blue-400';
      case 'FULLY_RECEIVED': case 'RECEIVED': return 'bg-emerald-400';
      case 'PENDING_APPROVAL': case 'PENDING': return 'bg-amber-400';
      case 'PARTIALLY_RECEIVED': case 'PARTIAL': return 'bg-purple-400';
      case 'CANCELLED': return 'bg-red-400';
      case 'DRAFT': return 'bg-gray-400';
      case 'CLOSED': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const tableView = (
    <Card padding="md">
      <div className="overflow-x-auto">
      <table className="min-w-[720px] w-full text-left text-sm text-[var(--nvi-text)]">
        <thead className="text-[11px] uppercase tracking-wider text-[var(--nvi-text-muted)] border-b border-[var(--nvi-border)]">
          <tr>
            <th className="px-3 py-3 w-8" />
            <SortableTableHeader label={t('supplier')} sortKey="supplier" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
            <SortableTableHeader label={t('branch')} sortKey="branch" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
            <SortableTableHeader label={t('status')} sortKey="status" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
            <SortableTableHeader label={t('expectedAt')} sortKey="expectedAt" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
            <SortableTableHeader label={common('items') || 'Items'} sortKey="items" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} />
            <SortableTableHeader label={common('total') || 'Total'} sortKey="total" currentSortKey={sortKey} currentDirection={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d); }} align="right" />
            <th className="px-3 py-3 w-24" />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const orderTotal = order.lines.reduce(
              (sum, line) => sum + Number(line.quantity) * Number(line.unitCost),
              0,
            );
            const overdue = isOverdue(order);
            const daysOver = overdue && order.expectedAt ? overdueDays(order.expectedAt) : 0;
            return (
              <tr key={order.id} className={`border-t transition-colors hover:bg-[var(--nvi-surface-alt)]/50 ${overdue ? 'border-red-500/30 bg-red-500/5' : 'border-[var(--nvi-border)]'}`}>
                <td className="px-3 py-3">
                  <POPipelineCompact status={order.status} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                      <Icon name="Truck" size={13} className="text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-[var(--nvi-text)]">{order.supplier?.name ?? '---'}</p>
                      <p className="text-[10px] text-[var(--nvi-text-muted)]">
                        {order.referenceNumber ? <span className="font-mono">{order.referenceNumber} </span> : null}
                        {relativeTime(order.createdAt)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--nvi-text-muted)]">
                    <Icon name="MapPin" size={12} />
                    {order.branch?.name ?? '---'}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 shrink-0 rounded-full ${getStatusDotColor(order.status)}`} />
                    <span className="text-xs text-[var(--nvi-text)]">
                      {PIPELINE_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                  {overdue ? (
                    <div className="mt-0.5 ml-4 inline-flex items-center gap-0.5 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                      <Icon name="TriangleAlert" size={10} />
                      {daysOver}d overdue
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-xs">
                  {order.expectedAt ? (
                    <span className={overdue ? 'font-medium text-red-400' : 'text-[var(--nvi-text-muted)]'}>
                      {formatDate(order.expectedAt)}
                    </span>
                  ) : (
                    <span className="text-[var(--nvi-text-muted)]">{t('expectedAtMissing')}</span>
                  )}
                  {order.supplier?.leadTimeDays ? (
                    <span className="ml-1 text-[10px] text-[var(--nvi-text-muted)]">({order.supplier.leadTimeDays}d)</span>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-300">
                    <Icon name="Package" size={12} />
                    {order.lines.length}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <span className="tabular-nums text-sm font-bold text-emerald-400">
                    {orderTotal.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    {(order.status === 'DRAFT' || order.status === 'PENDING_APPROVAL') && canWrite ? (
                      <button
                        type="button"
                        onClick={() => approveOrder(order.id)}
                        className="nvi-press inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={actionBusy[order.id]}
                        title={actions('approve')}
                      >
                        {actionBusy[order.id] ? <Spinner size="xs" variant="grid" /> : <Icon name="CircleCheck" size={14} />}
                      </button>
                    ) : null}
                    {(order.status === 'APPROVED' || order.status === 'PARTIALLY_RECEIVED') && canWrite ? (
                      <Link
                        href={`/${locale}/purchase-orders/${order.id}/receive`}
                        className="nvi-press inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                        title="Receive"
                      >
                        <Icon name="PackageCheck" size={14} />
                      </Link>
                    ) : null}
                    {order.status === 'DRAFT' && canWrite ? (
                      <button
                        type="button"
                        onClick={() => openEditModalFor(order)}
                        className="nvi-press inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                        title={actions('edit') || 'Edit'}
                      >
                        <Icon name="Pencil" size={14} />
                      </button>
                    ) : null}
                  </div>
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
  );

  /* ─── Banner ─── */
  const bannerBlock = message ? (
    <Banner
      message={typeof message === 'string' ? message : message.message}
      severity={
        typeof message === 'string'
          ? 'info'
          : message.outcome === 'success'
            ? 'success'
            : message.outcome === 'failure'
              ? 'error'
              : 'warning'
      }
      onDismiss={() => setMessage(null)}
    />
  ) : null;

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === updateForm.purchaseOrderId) ?? null,
    [orders, updateForm.purchaseOrderId],
  );

  return (
    <>
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      isLoading={isLoading}
      headerActions={
        <>
          {canWrite ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="nvi-cta nvi-press inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-black"
            >
              <Icon name="Plus" size={14} />
              {t('createAction')}
            </button>
          ) : null}
          <Link
            href={`/${locale}/purchase-orders/wizard`}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs text-[var(--nvi-text)]"
          >
            <Icon name="Wand" size={14} />
            {t('openWizard')}
          </Link>
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </>
      }
      banner={bannerBlock}
      kpis={kpiStrip}
      filters={filterBar}
      beforeContent={beforeContent}
      viewMode={viewMode}
      table={tableView}
      cards={cardView}
      isEmpty={!orders.length}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="ClipboardList" size={40} className="text-[var(--nvi-text-muted)]/40" />
        </div>
      }
      emptyTitle={t('noOrders')}
      emptyDescription={t('subtitle')}
      emptyAction={
        canWrite ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-[var(--nvi-accent)] px-4 py-2 text-xs font-semibold text-black"
          >
            <Icon name="Plus" size={14} />
            {t('createAction')}
          </button>
        ) : undefined
      }
      pagination={paginationBlock}
    />

    <PurchaseOrderCreateModal
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      form={form}
      onFormChange={setForm}
      lines={lines}
      onAddLine={() => addLine(setLines)}
      onUpdateLine={(id, patch) => updateLine(id, patch, setLines)}
      onRemoveLine={(id) => removeLine(id, setLines)}
      branches={branches}
      suppliers={suppliers}
      variants={variants}
      units={units}
      loadVariantOptions={loadVariantOptions}
      getVariantOption={getVariantOption}
      supplierEta={supplierEta ? supplierEta.toISOString() : null}
      selectedSupplier={selectedSupplier ?? null}
      reorderSuggestions={reorderSuggestions}
      isLoadingSuggestions={isLoadingSuggestions}
      onLoadSuggestions={loadSuggestionLines}
      onSubmit={createOrder}
      isCreating={isCreating}
      canWrite={canWrite}
    />

    <PurchaseOrderEditModal
      open={Boolean(updateForm.purchaseOrderId)}
      onClose={() => {
        setUpdateForm({ purchaseOrderId: '', expectedAt: '' });
        setUpdateLines([
          { id: crypto.randomUUID(), variantId: '', quantity: '', unitCost: '', unitId: '' },
        ]);
      }}
      orderLabel={selectedOrder ? formatOrderLabel(selectedOrder) : ''}
      form={updateForm}
      onFormChange={setUpdateForm}
      lines={updateLines}
      onAddLine={() => addLine(setUpdateLines)}
      onUpdateLine={(id, patch) => updateLine(id, patch, setUpdateLines)}
      onRemoveLine={(id) => removeLine(id, setUpdateLines)}
      variants={variants}
      units={units}
      loadVariantOptions={loadVariantOptions}
      getVariantOption={getVariantOption}
      onSubmit={updateOrder}
      isUpdating={isUpdating}
      canWrite={canWrite}
    />
    </>
  );
}
