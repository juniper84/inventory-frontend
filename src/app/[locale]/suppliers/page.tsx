'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState, messageText } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { Banner } from '@/components/notifications/Banner';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import {
  ListPage,
  Card,
  Icon,
  TextInput,
  Textarea,
  StatusBadge,
  SortableTableHeader,
  AvatarInitials,
  ProgressBar,
  EmptyState,
} from '@/components/ui';
import { SupplierCreateModal } from '@/components/suppliers/SupplierCreateModal';
import { SupplierEditModal } from '@/components/suppliers/SupplierEditModal';
import type { SortDirection } from '@/components/ui';
import { RelatedNotesPanel } from '@/components/RelatedNotesPanel';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatEntityLabel, shortId } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';

import { PaginationControls } from '@/components/PaginationControls';
import { useFormatDate } from '@/lib/business-context';

// ─── Types ──────────────────────────────────────────────────────────────────

type Supplier = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  leadTimeDays?: number | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
};
type PurchaseOrder = { id: string; status: string; createdAt?: string };
type Purchase = { id: string; status: string; createdAt?: string };
type SupplierPerformance = {
  totalOrders: number;
  completedOrders: number;
  completionRate: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  return `${diffMonth}mo ago`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const t = useTranslations('suppliersPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const { formatDateTime } = useFormatDate();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('suppliers.write');

  // ─── State ──────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState<number | null>(null);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({ 1: null });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [message, setMessage] = useToastState();
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    balanceDue: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);


  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    leadTimeDays: '',
  });
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [relatedMap, setRelatedMap] = useState<
    Record<
      string,
      {
        open: boolean;
        loading: boolean;
        purchaseOrders: PurchaseOrder[];
        purchases: Purchase[];
        error?: string;
      }
    >
  >({});
  const [perfMap, setPerfMap] = useState<Record<string, { loading: boolean; data?: SupplierPerformance; error?: string }>>({});

  // ─── Memos ──────────────────────────────────────────────────────────────

  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'ACTIVE', label: common('statusActive') },
      { value: 'INACTIVE', label: common('statusInactive') },
      { value: 'ARCHIVED', label: common('statusArchived') },
    ],
    [common],
  );
  const balanceOptions = useMemo(
    () => [
      { value: '', label: common('all') },
      { value: 'yes', label: common('balanceDue') },
      { value: 'no', label: common('balanceClear') },
    ],
    [common],
  );
  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => s.status === 'ACTIVE').length,
    [suppliers],
  );
  const inactiveSuppliers = useMemo(
    () => suppliers.filter((s) => s.status !== 'ACTIVE').length,
    [suppliers],
  );
  const withLeadTime = useMemo(
    () => suppliers.filter((s) => Number(s.leadTimeDays ?? 0) > 0).length,
    [suppliers],
  );

  const handleSort = useCallback((key: string, dir: SortDirection) => {
    setSortKey(dir ? key : null);
    setSortDir(dir);
  }, []);

  const sortedSuppliers = useMemo(() => {
    if (!sortKey || !sortDir) return suppliers;
    return [...suppliers].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey] ?? '';
      const bVal = (b as Record<string, unknown>)[sortKey] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [suppliers, sortKey, sortDir]);

  // ─── Effects ────────────────────────────────────────────────────────────

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);



  // ─── Data loading ─────────────────────────────────────────────────────

  const formatRelatedLabel = (item: Purchase | PurchaseOrder) => {
    const date = item.createdAt
      ? formatDateTime(item.createdAt)
      : null;
    return `${date ?? formatEntityLabel({ id: item.id }, common('unknown'))} • ${
      item.status
    }`;
  };

  const load = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) { setIsLoading(false); return; }
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor = targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
        balanceDue: filters.balanceDue || undefined,
      });
      const data = await apiFetch<PaginatedResponse<Supplier> | Supplier[]>(
        `/suppliers${query}`,
        { token },
      );
      const result = normalizePaginated(data);
      setSuppliers(result.items);
      setNextCursor(result.nextCursor);
      if (typeof result.total === 'number') setTotal(result.total);
      setPage(targetPage);
      setPageCursors(prev => {
        const next: Record<number, string | null> = targetPage === 1 ? { 1: null } : { ...prev };
        if (result.nextCursor) next[targetPage + 1] = result.nextCursor;
        return next;
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
  }, [pageSize, filters.search, filters.status, filters.balanceDue, t]);

  useEffect(() => {
    load(1);
  }, [load]);

  // ─── CRUD handlers ───────────────────────────────────────────────────

  const createSupplier = async () => {
    const token = getAccessToken();
    if (!token || !form.name.trim()) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      await apiFetch('/suppliers', {
        token,
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
          notes: form.notes || undefined,
          leadTimeDays: form.leadTimeDays ? Number(form.leadTimeDays) : undefined,
        }),
      });
      setForm({
        name: '',
        phone: '',
        email: '',
        address: '',
        notes: '',
        leadTimeDays: '',
      });
      setFormOpen(false);
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

  const startEdit = (supplier: Supplier) => {
    setEditing({ ...supplier });
  };

  const saveEdit = async () => {
    const token = getAccessToken();
    if (!token || !editing) {
      return;
    }
    setMessage(null);
    setIsSaving(true);
    try {
      await apiFetch(`/suppliers/${editing.id}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          name: editing.name,
          phone: editing.phone || undefined,
          email: editing.email || undefined,
          address: editing.address || undefined,
          notes: editing.notes || undefined,
          leadTimeDays:
            editing.leadTimeDays === null || editing.leadTimeDays === undefined
              ? undefined
              : editing.leadTimeDays,
          status: editing.status,
        }),
      });
      setEditing(null);
      setMessage({ action: 'update', outcome: 'success', message: t('updated') });
      await load();
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('updateFailed')),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleRelated = async (supplierId: string) => {
    const existing = relatedMap[supplierId];
    if (existing?.open) {
      setRelatedMap((prev) => ({
        ...prev,
        [supplierId]: { ...existing, open: false },
      }));
      return;
    }
    if (existing?.purchaseOrders.length || existing?.purchases.length) {
      setRelatedMap((prev) => ({
        ...prev,
        [supplierId]: { ...existing, open: true },
      }));
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setRelatedMap((prev) => ({
      ...prev,
      [supplierId]: {
        open: true,
        loading: true,
        purchaseOrders: [],
        purchases: [],
      },
    }));
    try {
      const [poData, purchaseData] = await Promise.all([
        apiFetch<PaginatedResponse<PurchaseOrder> | PurchaseOrder[]>(
          `/purchase-orders?limit=5&supplierId=${supplierId}`,
          { token },
        ),
        apiFetch<PaginatedResponse<Purchase> | Purchase[]>(
          `/purchases?limit=5&supplierId=${supplierId}`,
          { token },
        ),
      ]);
      setRelatedMap((prev) => ({
        ...prev,
        [supplierId]: {
          open: true,
          loading: false,
          purchaseOrders: normalizePaginated(poData).items,
          purchases: normalizePaginated(purchaseData).items,
        },
      }));
    } catch (err) {
      setRelatedMap((prev) => ({
        ...prev,
        [supplierId]: {
          open: true,
          loading: false,
          purchaseOrders: [],
          purchases: [],
          error: getApiErrorMessage(err, t('activityFailed')),
        },
      }));
    }
  };

  const togglePerformance = async (supplierId: string) => {
    const existing = perfMap[supplierId];
    if (existing && !existing.loading) {
      setPerfMap((prev) => {
        const next = { ...prev };
        delete next[supplierId];
        return next;
      });
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setPerfMap((prev) => ({ ...prev, [supplierId]: { loading: true } }));
    try {
      const data = await apiFetch<SupplierPerformance>(`/suppliers/${supplierId}/performance`, { token });
      setPerfMap((prev) => ({ ...prev, [supplierId]: { loading: false, data } }));
    } catch (err) {
      setPerfMap((prev) => ({ ...prev, [supplierId]: { loading: false, error: getApiErrorMessage(err, t('performanceFailed')) } }));
    }
  };

  // ─── KPI strip ────────────────────────────────────────────────────────

  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      {(
        [
          { icon: 'Building2' as const,   tone: 'blue' as const,    label: t('kpiSuppliers'),       value: String(total ?? suppliers.length), accent: 'text-blue-300'    },
          { icon: 'CircleCheck' as const, tone: 'emerald' as const, label: t('kpiActive'),          value: String(activeSuppliers),           accent: 'text-emerald-300' },
          { icon: 'CircleAlert' as const, tone: 'amber' as const,   label: t('kpiNeedsAttention'),  value: String(inactiveSuppliers),         accent: 'text-amber-300'   },
          { icon: 'Truck' as const,       tone: 'purple' as const,  label: t('kpiLeadTimeSet'),     value: String(withLeadTime),              accent: 'text-purple-300'  },
        ]
      ).map((k) => (
        <Card key={k.label} as="article" padding="md">
          <div className="flex items-center gap-3">
            <div className={`nvi-kpi-icon nvi-kpi-icon--${k.tone}`}>
              <Icon name={k.icon} size={20} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">{k.label}</p>
              <p className={`mt-0.5 text-2xl font-extrabold ${k.accent}`}>{k.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  // ─── Filters ──────────────────────────────────────────────────────────

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
          instanceId="filter-status"
          value={filters.status}
          onChange={(value) => pushFilters({ status: value })}
          options={statusOptions}
          placeholder={common('status')}
          className="nvi-select-container"
        />
        <SmartSelect
          instanceId="filter-balance-due"
          value={filters.balanceDue}
          onChange={(value) => pushFilters({ balanceDue: value })}
          options={balanceOptions}
          placeholder={common('balanceDue')}
          className="nvi-select-container"
        />
      </ListFilters>
    </Card>
  );

  // ─── Create form ─────────────────────────────────────────────────────

  // ─── Supplier partner profile card (card view) ────────────────────────

  const renderSupplierCard = (supplier: Supplier) => {
    const perf = perfMap[supplier.id];
    const related = relatedMap[supplier.id];

    return (
      <Card
        key={supplier.id}
        padding="md"
        className="nvi-card-hover transition-all"
      >
          <div className="space-y-3">
            {/* Header row: avatar + name + status dot + actions */}
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-1">
                <AvatarInitials name={supplier.name} size="lg" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-[var(--nvi-text)] truncate">{supplier.name}</h3>
                  <span className={`inline-block h-2 w-2 rounded-full ${
                    supplier.status === 'ACTIVE' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]' :
                    supplier.status === 'INACTIVE' ? 'bg-white/30' : 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]'
                  }`} title={supplier.status} />
                  <span className="text-[10px] font-medium uppercase tracking-wide text-white/30">{supplier.status}</span>
                </div>

                {/* Contact info row with colored icon containers */}
                <div className="mt-2 flex flex-wrap items-center gap-2.5 text-xs text-[var(--nvi-text-muted)]">
                  {supplier.phone ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/10">
                        <Icon name="Phone" size={12} className="text-blue-400" />
                      </span>
                      {supplier.phone}
                    </span>
                  ) : null}
                  {supplier.email ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10">
                        <Icon name="Mail" size={12} className="text-emerald-400" />
                      </span>
                      <span className="truncate max-w-[200px]">{supplier.email}</span>
                    </span>
                  ) : null}
                  {supplier.address ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10">
                        <Icon name="MapPin" size={12} className="text-amber-400" />
                      </span>
                      <span className="truncate max-w-[180px]">{supplier.address}</span>
                    </span>
                  ) : null}
                  {!supplier.phone && !supplier.email ? (
                    <span className="text-[var(--nvi-text-muted)] opacity-60">{t('noContact')}</span>
                  ) : null}
                </div>

                {/* Lead time pill */}
                <div className="mt-2">
                  {supplier.leadTimeDays && supplier.leadTimeDays > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500/10 px-2.5 py-1 text-[11px] font-medium text-purple-300">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-purple-500/15">
                        <Icon name="Truck" size={11} className="text-purple-400" />
                      </span>
                      {t('leadTimeLabel', { days: supplier.leadTimeDays })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/5 px-2 py-0.5 text-[11px] text-amber-400/60">
                      <Icon name="CircleAlert" size={11} />
                      {t('leadTimeMissing')}
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Link
                  href={`/${locale}/purchase-orders`}
                  className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/20 transition-colors"
                >
                  <Icon name="Package" size={12} />
                  {t('newPO')}
                </Link>
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => startEdit(supplier)}
                    className="nvi-press inline-flex items-center gap-1 rounded-xl border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text)] hover:border-[var(--nvi-accent)] transition-colors"
                    title={actions('edit')}
                  >
                    <Icon name="Pencil" size={12} />
                    {actions('edit')}
                  </button>
                ) : null}
              </div>
            </div>

            {/* Toggle buttons row */}
            <div className="flex flex-wrap gap-2 border-t border-[var(--nvi-border)] pt-3">
              <button
                type="button"
                onClick={() => togglePerformance(supplier.id)}
                className={`nvi-press inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  perf ? 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20' : 'bg-[var(--nvi-surface)] border border-[var(--nvi-border)] text-[var(--nvi-text)] hover:border-amber-500/30 hover:text-amber-300'
                }`}
              >
                <Icon name="ChartBar" size={12} />
                {perf ? t('hidePerformance') : t('viewPerformance')}
              </button>
              <button
                type="button"
                onClick={() => toggleRelated(supplier.id)}
                className={`nvi-press inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  related?.open ? 'bg-blue-500/10 text-blue-300 hover:bg-blue-500/20' : 'bg-[var(--nvi-surface)] border border-[var(--nvi-border)] text-[var(--nvi-text)] hover:border-blue-500/30 hover:text-blue-300'
                }`}
              >
                <Icon name="Clock" size={12} />
                {related?.open ? t('hideActivity') : t('viewActivity')}
              </button>
            </div>

            {/* Performance metrics (expandable) */}
            {perf ? (
              <div className="nvi-expand nvi-slide-in-bottom rounded-xl border border-[var(--nvi-border)] bg-[var(--nvi-surface)]/60 p-4">
                {perf.loading ? (
                  <span className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
                    <Spinner size="xs" variant="dots" /> {t('loadingPerformance')}
                  </span>
                ) : perf.error ? (
                  <p className="text-xs text-red-400">{perf.error}</p>
                ) : perf.data ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-blue-500/[0.07] border border-blue-500/10 p-3 text-center">
                        <p className="text-2xl font-extrabold text-blue-300">{perf.data.totalOrders}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">{t('totalOrders')}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-500/[0.07] border border-emerald-500/10 p-3 text-center">
                        <p className="text-2xl font-extrabold text-emerald-300">{perf.data.completedOrders}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">{t('completedOrders')}</p>
                      </div>
                      <div className={`rounded-xl p-3 text-center border ${
                        perf.data.completionRate >= 0.8 ? 'bg-emerald-500/[0.07] border-emerald-500/10' :
                        perf.data.completionRate >= 0.5 ? 'bg-amber-500/[0.07] border-amber-500/10' :
                        'bg-red-500/[0.07] border-red-500/10'
                      }`}>
                        <p className={`text-2xl font-extrabold ${
                          perf.data.completionRate >= 0.8 ? 'text-emerald-300' :
                          perf.data.completionRate >= 0.5 ? 'text-amber-300' : 'text-red-300'
                        }`}>{(perf.data.completionRate * 100).toFixed(0)}%</p>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">{t('completionRate')}</p>
                      </div>
                    </div>
                    <ProgressBar
                      value={perf.data.completedOrders}
                      max={perf.data.totalOrders || 1}
                      color={perf.data.completionRate >= 0.8 ? 'green' : perf.data.completionRate >= 0.5 ? 'amber' : 'red'}
                      height={6}
                      label={t('completionRate')}
                      showPercent
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Related activity (expandable) */}
            {related?.open ? (
              <div className="nvi-expand nvi-slide-in-bottom rounded-xl border border-[var(--nvi-border)] bg-[var(--nvi-surface)]/60 p-3">
                {related.loading ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
                    <Spinner size="xs" variant="grid" /> {t('loadingActivity')}
                  </div>
                ) : related.error ? (
                  <p className="text-xs text-red-400">{related.error}</p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[var(--nvi-text)] flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/10">
                          <Icon name="ClipboardList" size={11} className="text-blue-400" />
                        </span>
                        {t('recentPurchaseOrders')}
                      </p>
                      {related.purchaseOrders.length ? (
                        related.purchaseOrders.map((po) => (
                          <div key={po.id} className="flex items-center gap-2 text-[11px] text-[var(--nvi-text-muted)] pl-7 py-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-400/60 shrink-0" />
                            <StatusBadge status={po.status} size="xs" />
                            <span>{po.createdAt ? relativeTime(po.createdAt) : shortId(po.id)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[11px] text-[var(--nvi-text-muted)] opacity-60 pl-7">{t('noPurchaseOrders')}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[var(--nvi-text)] flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10">
                          <Icon name="ShoppingCart" size={11} className="text-emerald-400" />
                        </span>
                        {t('recentPurchases')}
                      </p>
                      {related.purchases.length ? (
                        related.purchases.map((purchase) => (
                          <div key={purchase.id} className="flex items-center gap-2 text-[11px] text-[var(--nvi-text-muted)] pl-7 py-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/60 shrink-0" />
                            <StatusBadge status={purchase.status} size="xs" />
                            <span>{purchase.createdAt ? relativeTime(purchase.createdAt) : shortId(purchase.id)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[11px] text-[var(--nvi-text-muted)] opacity-60 pl-7">{t('noPurchases')}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Notes panel */}
            <div className="border-t border-[var(--nvi-border)] pt-3">
              <RelatedNotesPanel resourceType="Supplier" resourceId={supplier.id} />
            </div>
          </div>
      </Card>
    );
  };

  // ─── Card grid ────────────────────────────────────────────────────────

  const cardsView = (
    <div className="grid gap-4 md:grid-cols-2 nvi-stagger">
      {sortedSuppliers.map(renderSupplierCard)}
    </div>
  );

  // ─── Table view ───────────────────────────────────────────────────────

  const tableView = (
    <Card padding="md">
      <div className="overflow-auto">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-[var(--nvi-text-muted)]">
            <tr>
              <SortableTableHeader label={t('name')} sortKey="name" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <Icon name="Phone" size={12} /> {t('phone')}
                </span>
              </th>
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <Icon name="Mail" size={12} /> {t('email')}
                </span>
              </th>
              <SortableTableHeader label={t('status')} sortKey="status" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <Icon name="Truck" size={12} /> {t('leadTimeDays')}
                </span>
              </th>
              <th className="px-3 py-2">{t('completionRate')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {sortedSuppliers.map((supplier) => {
              const perf = perfMap[supplier.id];
              return (
                <tr key={supplier.id} className="border-t border-[var(--nvi-border)] hover:bg-[var(--nvi-surface)]/40 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="shrink-0 rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-0.5">
                        <AvatarInitials name={supplier.name} size="xs" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[var(--nvi-text)]">{supplier.name}</span>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                          supplier.status === 'ACTIVE' ? 'bg-emerald-400' :
                          supplier.status === 'INACTIVE' ? 'bg-white/30' : 'bg-red-400'
                        }`} />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--nvi-text-muted)]">
                    {supplier.phone ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/10">
                          <Icon name="Phone" size={10} className="text-blue-400" />
                        </span>
                        {supplier.phone}
                      </span>
                    ) : <span className="text-white/20">--</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--nvi-text-muted)]">
                    {supplier.email ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10">
                          <Icon name="Mail" size={10} className="text-emerald-400" />
                        </span>
                        <span className="truncate max-w-[160px]">{supplier.email}</span>
                      </span>
                    ) : <span className="text-white/20">--</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      supplier.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' :
                      supplier.status === 'INACTIVE' ? 'bg-white/5 text-white/40' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        supplier.status === 'ACTIVE' ? 'bg-emerald-400' :
                        supplier.status === 'INACTIVE' ? 'bg-white/30' : 'bg-red-400'
                      }`} />
                      {supplier.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {supplier.leadTimeDays && supplier.leadTimeDays > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500/10 px-2 py-1 text-[11px] font-medium text-purple-300">
                        <span className="flex h-4 w-4 items-center justify-center rounded bg-purple-500/15">
                          <Icon name="Truck" size={10} className="text-purple-400" />
                        </span>
                        {t('leadTimeLabel', { days: supplier.leadTimeDays })}
                      </span>
                    ) : (
                      <span className="text-white/20">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {perf?.data ? (
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <ProgressBar
                          value={perf.data.completedOrders}
                          max={perf.data.totalOrders || 1}
                          color={perf.data.completionRate >= 0.8 ? 'green' : perf.data.completionRate >= 0.5 ? 'amber' : 'red'}
                          height={5}
                          className="flex-1"
                        />
                        <span className={`text-[11px] font-semibold shrink-0 ${
                          perf.data.completionRate >= 0.8 ? 'text-emerald-400' :
                          perf.data.completionRate >= 0.5 ? 'text-amber-400' : 'text-red-400'
                        }`}>{(perf.data.completionRate * 100).toFixed(0)}%</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => togglePerformance(supplier.id)}
                        className="text-[11px] text-[var(--nvi-text-muted)] hover:text-amber-300 transition-colors"
                      >
                        {perf?.loading ? <Spinner size="xs" variant="dots" /> : t('viewPerformance')}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/${locale}/purchase-orders`}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-500/20 transition-colors"
                      >
                        <Icon name="Package" size={10} />
                        {t('newPO')}
                      </Link>
                      {canWrite ? (
                        <button
                          type="button"
                          onClick={() => startEdit(supplier)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--nvi-border)] px-2 py-1 text-[11px] text-[var(--nvi-text)] hover:border-[var(--nvi-accent)] transition-colors"
                          title={actions('edit')}
                        >
                          <Icon name="Pencil" size={10} />
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

  // ─── Pagination ───────────────────────────────────────────────────────

  const paginationControls = (
    <PaginationControls
      page={page}
      pageSize={pageSize}
      total={total}
      itemCount={suppliers.length}
      availablePages={Object.keys(pageCursors).map(Number)}
      hasNext={Boolean(nextCursor)}
      hasPrev={page > 1}
      isLoading={isLoading}
      onPageChange={(p) => load(p)}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(1);
        setPageCursors({ 1: null });
        setTotal(null);
        load(1, size);
      }}
    />
  );

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <>
    <ListPage
      eyebrow={t('eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      badges={
        <>
          <span className="status-chip">{t('badgeVendorOps')}</span>
          <span className="status-chip">{t('badgeLive')}</span>
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
              <Icon name="Plus" size={14} />
              {t('createSupplier')}
            </button>
          ) : null}
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </div>
      }
      banner={message ? <Banner message={messageText(message)} /> : null}
      kpis={kpiStrip}
      filters={filterBar}
      viewMode={viewMode}
      table={tableView}
      cards={cardsView}
      isEmpty={sortedSuppliers.length === 0}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="Building2" size={48} className="text-[var(--nvi-accent)]" />
        </div>
      }
      emptyTitle={t('noSuppliers')}
      emptyDescription={t('subtitle')}
      emptyAction={
        canWrite ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-black"
          >
            <Icon name="Plus" size={14} />
            {t('createSupplier')}
          </button>
        ) : undefined
      }
      pagination={paginationControls}
      isLoading={isLoading}
    />

    <SupplierCreateModal
      open={formOpen}
      onClose={() => setFormOpen(false)}
      form={form}
      onFormChange={setForm}
      onSubmit={createSupplier}
      isCreating={isCreating}
      canWrite={canWrite}
    />

    <SupplierEditModal
      open={Boolean(editing)}
      onClose={() => setEditing(null)}
      draft={editing}
      onDraftChange={setEditing}
      onSubmit={saveEdit}
      isSaving={isSaving}
      canWrite={canWrite}
    />
    </>
  );
}
