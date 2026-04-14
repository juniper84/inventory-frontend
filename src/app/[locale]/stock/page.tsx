'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormatDate } from '@/lib/business-context';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { Spinner } from '@/components/Spinner';
import { PaginationControls } from '@/components/PaginationControls';
import { Banner } from '@/components/notifications/Banner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { formatVariantLabel } from '@/lib/display';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';

import { FlipCounter } from '@/components/analog';
import {
  CollapsibleSection,
  ActionButtons,
  ProgressBar,
  SortableTableHeader,
  PageHeader,
  Card,
  Icon,
  TextInput,
  EmptyState,
  ListPage,
} from '@/components/ui';
import type { SortDirection } from '@/components/ui';

type Branch = { id: string; name: string };
type Category = { id: string; name: string };
type Variant = {
  id: string;
  name: string;
  imageUrl?: string | null;
  baseUnitId?: string | null;
  product?: { name?: string | null };
};
type Snapshot = {
  branchId: string;
  variantId: string;
  quantity: number | string;
  inTransitQuantity?: number | string;
  dailyVelocity?: number;
  daysRemaining?: number | null;
  branch?: { name?: string | null } | null;
  variant?: {
    name?: string | null;
    imageUrl?: string | null;
    defaultCost?: number | string | null;
    product?: { name?: string | null } | null;
    baseUnit?: { id: string; code: string; label: string; unitType: string } | null;
  } | null;
};
type ReorderPoint = {
  id: string;
  branchId: string;
  variantId: string;
  minQuantity: number | string;
  reorderQuantity: number | string;
  branch?: { name?: string | null };
  variant?: { name?: string | null };
};
type ReorderSuggestion = {
  id: string;
  branchId: string;
  variantId: string;
  onHand: number;
  inTransit: number;
  minQuantity: number;
  reorderQuantity: number;
  suggestedQuantity: number;
  branch?: { name?: string | null };
  variant?: { name?: string | null };
};

export default function StockOnHandPage() {
  const locale = useLocale();
  const t = useTranslations('stockPage');
  const common = useTranslations('common');
  const actions = useTranslations('actions');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('stock.write');
  const [isLoading, setIsLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [message, setMessage] = useToastState();
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    branchId: '',
    variantId: '',
    status: '',
    categoryId: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [total, setTotal] = useState<number | null>(null);
  const [reorderPoints, setReorderPoints] = useState<ReorderPoint[]>([]);
  const [reorderSuggestions, setReorderSuggestions] = useState<ReorderSuggestion[]>([]);
  const [reorderForm, setReorderForm] = useState({
    branchId: '',
    variantId: '',
    minQuantity: '',
    reorderQuantity: '',
  });
  const [isSavingReorder, setIsSavingReorder] = useState(false);
  const [isLoadingReorder, setIsLoadingReorder] = useState(false);
  const { formatDateTime } = useFormatDate();
  const [reorderFormOpen, setReorderFormOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const handleSort = useCallback((key: string, dir: SortDirection) => {
    setSortKey(dir ? key : null);
    setSortDir(dir);
  }, []);
  const { activeBranch, resolveBranchId } = useBranchScope();
  const { loadOptions: loadVariantOptions, seedCache: seedVariantCache, getVariantOption } = useVariantSearch();
  const effectiveFilterBranchId = resolveBranchId(filters.branchId) || '';
  const effectiveReorderBranchId = resolveBranchId(reorderForm.branchId) || '';

  const loadLookups = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const [branchData, categoryData, variantData] = await Promise.all([
      apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
        token,
      }),
      apiFetch<PaginatedResponse<Category> | Category[]>('/categories?limit=50', {
        token,
      }),
      apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
        token,
      }),
    ]);
    setBranches(normalizePaginated(branchData).items);
    setCategories(normalizePaginated(categoryData).items);
    setVariants(normalizePaginated(variantData).items);
    seedVariantCache(normalizePaginated(variantData).items);
  };

  const load = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsLoading(true);
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor =
        targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        branchId: effectiveFilterBranchId || undefined,
        variantId: filters.variantId || undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
        categoryId: filters.categoryId || undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const stockData = await apiFetch<PaginatedResponse<Snapshot> | Snapshot[]>(
        `/stock${query}`,
        { token },
      );
      const result = normalizePaginated(stockData);
      setSnapshots(result.items);
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
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, effectiveFilterBranchId, filters.variantId, filters.search, filters.status, filters.categoryId, t, setMessage]);

  useEffect(() => {
    loadLookups().catch((err) =>
      setMessage({ action: 'load', outcome: 'failure', message: getApiErrorMessage(err, t('filtersFailed')) }),
    );
  }, []);

  useEffect(() => {
    if (activeBranch?.id && !filters.branchId) {
      pushFilters({ branchId: activeBranch.id });
    }
  }, [activeBranch?.id, filters.branchId, pushFilters]);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);



  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [
    filters.branchId,
    filters.variantId,
    filters.search,
    filters.status,
    filters.categoryId,
    load,
  ]);

  useEffect(() => {
    if (activeBranch?.id && !reorderForm.branchId) {
      setReorderForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
  }, [activeBranch?.id, reorderForm.branchId]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const branchFilter =
      resolveBranchId(filters.branchId) ||
      resolveBranchId(reorderForm.branchId);
    const query = branchFilter ? `?branchId=${branchFilter}` : '';
    setIsLoadingReorder(true);
    Promise.all([
      apiFetch<PaginatedResponse<ReorderPoint> | ReorderPoint[]>(
        `/stock/reorder-points${query}`,
        { token },
      ),
      apiFetch<ReorderSuggestion[]>(
        `/stock/reorder-suggestions${query}`,
        { token },
      ),
    ])
      .then(([pointsData, suggestionData]) => {
        setReorderPoints(normalizePaginated(pointsData).items);
        setReorderSuggestions(suggestionData);
      })
      .catch((err) => setMessage({ action: 'load', outcome: 'failure', message: getApiErrorMessage(err, t('reorderLoadFailed')) }))
      .finally(() => setIsLoadingReorder(false));
  }, [filters.branchId, reorderForm.branchId]);

  const getBranchName = (id: string) =>
    branches.find((branch) => branch.id === id)?.name || common('unknown');
  const getVariantName = (id: string) => {
    const variant = variants.find((item) => item.id === id);
    return variant
      ? formatVariantLabel(
          {
            id: variant.id,
            name: variant.name,
            productName: variant.product?.name ?? null,
          },
          common('unknown'),
        )
      : common('unknown');
  };
  const sortedSnapshots = useMemo(() => {
    if (!sortKey || !sortDir) return snapshots;
    return [...snapshots].sort((a, b) => {
      let aVal: unknown = '';
      let bVal: unknown = '';
      switch (sortKey) {
        case 'branch': aVal = a.branch?.name ?? ''; bVal = b.branch?.name ?? ''; break;
        case 'variant': aVal = a.variant?.name ?? ''; bVal = b.variant?.name ?? ''; break;
        case 'quantity': aVal = Number(a.quantity ?? 0); bVal = Number(b.quantity ?? 0); break;
        case 'inTransit': aVal = Number(a.inTransitQuantity ?? 0); bVal = Number(b.inTransitQuantity ?? 0); break;
        case 'total': aVal = Number(a.quantity ?? 0) + Number(a.inTransitQuantity ?? 0); bVal = Number(b.quantity ?? 0) + Number(b.inTransitQuantity ?? 0); break;
        case 'stockValue': aVal = Number(a.quantity ?? 0) * Number(a.variant?.defaultCost ?? 0); bVal = Number(b.quantity ?? 0) * Number(b.variant?.defaultCost ?? 0); break;
        case 'daysRemaining': aVal = a.daysRemaining ?? Infinity; bVal = b.daysRemaining ?? Infinity; break;
        default: break;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [snapshots, sortKey, sortDir]);

  const branchOptions = useMemo(
    () => [
      { value: '', label: common('globalBranch') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );

  const loadCategoryOptions = useCallback(async (inputValue: string) => {
    const token = getAccessToken();
    if (!token) return [];
    try {
      const data = await apiFetch<PaginatedResponse<Category> | Category[]>(
        `/categories?search=${encodeURIComponent(inputValue)}&limit=25`,
        { token },
      );
      return normalizePaginated(data).items.map((c) => ({ value: c.id, label: c.name }));
    } catch {
      return [];
    }
  }, []);

  const variantOptions = useMemo(
    () => [
      { value: '', label: common('allVariants') },
      ...variants.map((variant) => ({
        value: variant.id,
        label: formatVariantLabel(
          {
            id: variant.id,
            name: variant.name,
            productName: variant.product?.name ?? null,
          },
          common('unknown'),
        ),
      })),
    ],
    [variants, common],
  );

  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'ACTIVE', label: common('statusActive') },
      { value: 'INACTIVE', label: common('statusInactive') },
      { value: 'ARCHIVED', label: common('statusArchived') },
    ],
    [common],
  );

  const saveReorderPoint = async () => {
    const token = getAccessToken();
    if (
      !token ||
      !effectiveReorderBranchId ||
      !reorderForm.variantId ||
      !reorderForm.minQuantity ||
      !reorderForm.reorderQuantity
    ) {
      return;
    }
    setIsSavingReorder(true);
    setMessage(null);
    try {
      await apiFetch('/stock/reorder-points', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: effectiveReorderBranchId,
          variantId: reorderForm.variantId,
          minQuantity: Number(reorderForm.minQuantity),
          reorderQuantity: Number(reorderForm.reorderQuantity),
        }),
      });
      setReorderForm((prev) => ({
        ...prev,
        variantId: '',
        minQuantity: '',
        reorderQuantity: '',
      }));
      const query = effectiveReorderBranchId
        ? `?branchId=${effectiveReorderBranchId}`
        : '';
      const [pointsData, suggestionData] = await Promise.all([
        apiFetch<PaginatedResponse<ReorderPoint> | ReorderPoint[]>(
          `/stock/reorder-points${query}`,
          { token },
        ),
        apiFetch<ReorderSuggestion[]>(`/stock/reorder-suggestions${query}`, {
          token,
        }),
      ]);
      setReorderPoints(normalizePaginated(pointsData).items);
      setReorderSuggestions(suggestionData);
      setReorderFormOpen(false);
      setMessage({ action: 'update', outcome: 'success', message: t('reorderSaved') });
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('reorderSaveFailed')),
      });
    } finally {
      setIsSavingReorder(false);
    }
  };

  /* ─── Reorder form + suggestions as beforeContent ─── */
  const beforeContent = (
    <>
      {/* Reorder form */}
      <CollapsibleSection title={t('reorderTitle')} defaultOpen={false} isOpen={reorderFormOpen} onToggle={setReorderFormOpen} storageKey="stock-reorder-form">
        <Card padding="lg" className="nvi-slide-in-bottom">
          {isLoadingReorder ? (
            <span className="text-xs text-[var(--nvi-text-muted)]">{actions('loading')}</span>
          ) : null}
          <div className="grid gap-3 md:grid-cols-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('selectBranch')}</label>
              <SmartSelect
                instanceId="stock-reorder-branch"
                value={reorderForm.branchId}
                onChange={(value) =>
                  setReorderForm((prev) => ({ ...prev, branchId: value }))
                }
                options={branches.map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                }))}
                placeholder={t('selectBranch')}
                isClearable
                className="nvi-select-container"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('selectVariant')}</label>
              <AsyncSmartSelect
                instanceId="stock-reorder-variant"
                value={getVariantOption(reorderForm.variantId)}
                loadOptions={loadVariantOptions}
                defaultOptions={variantOptions.filter((o) => o.value !== '')}
                onChange={(opt) =>
                  setReorderForm((prev) => ({ ...prev, variantId: opt?.value ?? '' }))
                }
                placeholder={t('selectVariant')}
                isClearable
                className="nvi-select-container"
              />
            </div>
            <TextInput
              label={t('reorderMin')}
              type="number"
              min={0}
              value={reorderForm.minQuantity}
              onChange={(event) =>
                setReorderForm((prev) => ({
                  ...prev,
                  minQuantity: event.target.value,
                }))
              }
              placeholder={t('reorderMin')}
            />
            <TextInput
              label={t('reorderQty')}
              type="number"
              min={0}
              value={reorderForm.reorderQuantity}
              onChange={(event) =>
                setReorderForm((prev) => ({
                  ...prev,
                  reorderQuantity: event.target.value,
                }))
              }
              placeholder={t('reorderQty')}
            />
          </div>
          <button
            type="button"
            onClick={saveReorderPoint}
            disabled={!canWrite || isSavingReorder}
            title={!canWrite ? noAccess('title') : undefined}
            className="nvi-cta nvi-press rounded-xl px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70 mt-3 inline-flex items-center gap-2"
          >
            {isSavingReorder ? <Spinner variant="orbit" size="xs" /> : <Icon name="Save" size={14} />}
            {isSavingReorder ? t('saving') : t('saveReorder')}
          </button>

          {/* Reorder points list */}
          <Card glow={false} padding="sm" className="mt-4">
            <div className="overflow-auto text-sm">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">
                  <tr>
                    <th className="px-3 py-2">{t('branch')}</th>
                    <th className="px-3 py-2">{t('variant')}</th>
                    <th className="px-3 py-2">{t('reorderMin')}</th>
                    <th className="px-3 py-2">{t('reorderQty')}</th>
                    <th className="px-3 py-2">{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderPoints.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-xs text-[var(--nvi-text-muted)]">
                        {t('noReorderPoints')}
                      </td>
                    </tr>
                  ) : (
                    reorderPoints.map((point) => (
                      <tr key={point.id} className="border-t border-[var(--nvi-border)]">
                        <td className="px-3 py-2 text-[var(--nvi-text)]">{point.branch?.name ?? getBranchName(point.branchId)}</td>
                        <td className="px-3 py-2 text-[var(--nvi-text)]">{point.variant?.name ?? getVariantName(point.variantId)}</td>
                        <td className="px-3 py-2 text-[var(--nvi-text)]">{point.minQuantity}</td>
                        <td className="px-3 py-2 text-[var(--nvi-text)]">{point.reorderQuantity}</td>
                        <td className="px-3 py-2 text-xs text-[var(--nvi-text-muted)]">{t('active')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </Card>
      </CollapsibleSection>

      {/* Reorder suggestions */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
            <Icon name="Lightbulb" size={16} className="text-emerald-400" />
          </div>
          <h3 className="text-base font-semibold text-[var(--nvi-text)]">
            {t('reorderSuggestionsTitle')}
          </h3>
        </div>
        {reorderSuggestions.length === 0 ? (
          <p className="text-sm text-[var(--nvi-text-muted)]">{t('noReorderSuggestions')}</p>
        ) : (
          <div className="overflow-auto text-sm">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">
                <tr>
                  <th className="px-3 py-2">{t('branch')}</th>
                  <th className="px-3 py-2">{t('variant')}</th>
                  <th className="px-3 py-2 text-right">{t('onHand')}</th>
                  <th className="px-3 py-2 text-right">{t('inTransit')}</th>
                  <th className="px-3 py-2 text-right">{t('reorderMin')}</th>
                  <th className="px-3 py-2 text-right">{t('suggestedQty')}</th>
                </tr>
              </thead>
              <tbody>
                {reorderSuggestions.map((suggestion) => (
                  <tr key={suggestion.id} className="border-t border-[var(--nvi-border)]">
                    <td className="px-3 py-2 text-[var(--nvi-text)]">
                      {suggestion.branch?.name ?? getBranchName(suggestion.branchId)}
                    </td>
                    <td className="px-3 py-2 text-[var(--nvi-text)]">
                      {suggestion.variant?.name ?? getVariantName(suggestion.variantId)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--nvi-text)]">{suggestion.onHand}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--nvi-text)]">{suggestion.inTransit}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--nvi-text)]">{suggestion.minQuantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-400">{suggestion.suggestedQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );

  /* ─── KPI strip ─── */
  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      {/* Snapshots */}
      <Card as="article" padding="md" className="nvi-card-hover">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
            <Icon name="Database" size={20} className="text-blue-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">
              {t('kpiSnapshots')}
            </p>
            <div className="mt-1 text-2xl font-semibold text-[var(--nvi-text)]">
              <FlipCounter value={total ?? snapshots.length} digits={4} size="md" />
            </div>
          </div>
        </div>
      </Card>

      {/* Reorder Points */}
      <Card as="article" padding="md" className="nvi-card-hover">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
            <Icon name="CircleAlert" size={20} className="text-amber-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">
              {t('kpiReorderPoints')}
            </p>
            <div className="mt-1 text-2xl font-semibold text-[var(--nvi-text)]">
              <FlipCounter value={reorderPoints.length} digits={4} size="md" />
            </div>
          </div>
        </div>
      </Card>

      {/* Suggestions */}
      <Card as="article" padding="md" className="nvi-card-hover">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
            <Icon name="Lightbulb" size={20} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">
              {t('kpiSuggestions')}
            </p>
            <div className="mt-1 text-2xl font-semibold text-[var(--nvi-text)]">
              <FlipCounter value={reorderSuggestions.length} digits={4} size="md" />
            </div>
          </div>
        </div>
      </Card>

      {/* Active Branch */}
      <Card as="article" padding="md" className="nvi-card-hover">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-500/10">
            <Icon name="Building2" size={20} className="text-yellow-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">
              {t('kpiActiveBranch')}
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--nvi-text)]">
              {activeBranch?.name ?? common('globalBranch')}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );

  /* ─── Filters ─── */
  const filtersNode = (
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
        instanceId="stock-filter-branch"
        value={filters.branchId}
        onChange={(value) => pushFilters({ branchId: value })}
        options={branchOptions}
        placeholder={common('branch')}
        className="nvi-select-container"
      />
      <AsyncSmartSelect
        instanceId="stock-filter-variant"
        value={getVariantOption(filters.variantId)}
        loadOptions={loadVariantOptions}
        defaultOptions={variantOptions}
        onChange={(opt) => pushFilters({ variantId: opt?.value ?? '' })}
        placeholder={common('variant')}
        className="nvi-select-container"
      />
      <SmartSelect
        instanceId="stock-filter-status"
        value={filters.status}
        onChange={(value) => pushFilters({ status: value })}
        options={statusOptions}
        placeholder={common('status')}
        className="nvi-select-container"
      />
      <AsyncSmartSelect
        instanceId="stock-filter-category"
        value={filters.categoryId ? { value: filters.categoryId, label: categories.find((c) => c.id === filters.categoryId)?.name ?? common('unknown') } : null}
        onChange={(opt) => pushFilters({ categoryId: opt?.value ?? '' })}
        loadOptions={loadCategoryOptions}
        defaultOptions={categories.map((c) => ({ value: c.id, label: c.name }))}
        placeholder={common('category')}
        isClearable
        className="nvi-select-container"
      />
    </ListFilters>
  );

  /* ─── Table view ─── */
  const tableView = (
    <Card>
      <div className="overflow-auto text-sm text-[var(--nvi-text)]">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">
            <tr>
              <th className="px-3 py-2">{common('images')}</th>
              <SortableTableHeader label={t('branch')} sortKey="branch" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <SortableTableHeader label={t('variant')} sortKey="variant" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <SortableTableHeader label={t('onHand')} sortKey="quantity" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} align="right" />
              <SortableTableHeader label={t('inTransit')} sortKey="inTransit" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} align="right" />
              <SortableTableHeader label={t('total')} sortKey="total" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} align="right" />
              <SortableTableHeader label={t('stockValue')} sortKey="stockValue" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} align="right" />
              <SortableTableHeader label={t('daysLeft')} sortKey="daysRemaining" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} align="right" />
              <th className="px-3 py-2">{t('status')}</th>
              <th className="px-3 py-2">{t('actionsLabel')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedSnapshots.map((item) => {
              const qty = Number(item.quantity ?? 0);
              return (
                <tr
                  key={`${item.branchId}-${item.variantId}`}
                  className={`border-t border-[var(--nvi-border)] ${
                    qty <= 2 ? 'bg-red-500/5' :
                    qty <= 5 ? 'bg-amber-500/5' : ''
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="h-8 w-8 overflow-hidden rounded-lg border border-[var(--nvi-border)] bg-[var(--nvi-surface)] nvi-img-zoom">
                      {item.variant?.imageUrl ? (
                        <img
                          src={item.variant.imageUrl}
                          alt={item.variant.name ?? ''}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--nvi-text-muted)]">
                          —
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[var(--nvi-text)]">{item.branch?.name ?? common('unknown')}</td>
                  <td className="px-3 py-2 text-[var(--nvi-text)]">{formatVariantLabel({ id: item.variantId, name: item.variant?.name ?? null, productName: item.variant?.product?.name ?? null }, common('unknown'))}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--nvi-text)]">
                    {item.quantity}
                    {item.variant?.baseUnit
                      ? ` (${item.variant.baseUnit.label} ${item.variant.baseUnit.code})`
                      : ''}
                    {qty <= 5 && <Icon name="TriangleAlert" size={12} className="ml-1 inline text-red-400" />}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--nvi-text)]">{item.inTransitQuantity ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--nvi-text)]">
                    {qty + Number(item.inTransitQuantity ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--nvi-text)]">
                    {item.variant?.defaultCost
                      ? (Number(item.quantity ?? 0) * Number(item.variant.defaultCost)).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.daysRemaining != null ? (
                      <span className={`inline-flex items-center gap-1 ${
                        item.daysRemaining <= 7 ? 'text-red-400 font-semibold' :
                        item.daysRemaining <= 30 ? 'text-amber-400' :
                        'text-[var(--nvi-text-muted)]'
                      }`}>
                        {item.daysRemaining <= 7 && <span className="nvi-bounce-in"><Icon name="TriangleAlert" size={12} /></span>}
                        {item.daysRemaining}d
                      </span>
                    ) : (
                      <span className="text-[var(--nvi-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--nvi-text-muted)]">{t('snapshot')}</td>
                  <td className="px-3 py-2">
                    <ActionButtons
                      actions={[
                        { key: 'adjust', icon: <Icon name="Pencil" size={14} />, label: t('adjust'), onClick: () => { /* placeholder */ } },
                      ]}
                      size="xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  /* ─── Card view — stock health cards ─── */
  const cardsView = (
    <div className="grid gap-4 sm:grid-cols-2 nvi-stagger">
      {snapshots.map((item) => {
        const qty = Number(item.quantity ?? 0);
        const inTransit = Number(item.inTransitQuantity ?? 0);
        const totalQty = qty + inTransit;
        const stockValue = item.variant?.defaultCost
          ? (qty * Number(item.variant.defaultCost)).toLocaleString()
          : null;
        const isLowStock = qty <= 5;
        const daysClass =
          item.daysRemaining != null && item.daysRemaining <= 7
            ? 'text-red-400 font-semibold'
            : item.daysRemaining != null && item.daysRemaining <= 30
            ? 'text-amber-400'
            : 'text-[var(--nvi-text-muted)]';

        return (
          <Card
            key={`${item.branchId}-${item.variantId}`}
            padding="md"
            className={`nvi-card-hover ${isLowStock ? 'border-l-2 border-l-red-500/60' : ''}`}
          >
            {/* Header: image + name + branch */}
            <div className="flex items-start gap-3 mb-4">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[var(--nvi-border)] bg-[var(--nvi-surface)] nvi-img-zoom">
                {item.variant?.imageUrl ? (
                  <img
                    src={item.variant.imageUrl}
                    alt={item.variant.name ?? ''}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--nvi-text-muted)]">
                    <Icon name="Package" size={16} className="opacity-40" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--nvi-text)] truncate">
                  {formatVariantLabel({ id: item.variantId, name: item.variant?.name ?? null, productName: item.variant?.product?.name ?? null }, common('unknown'))}
                </p>
                <p className="text-xs text-[var(--nvi-text-muted)]">
                  {item.branch?.name ?? common('unknown')}
                </p>
              </div>
            </div>

            {/* Three stat boxes */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="flex flex-col items-center rounded-xl bg-blue-500/5 px-2 py-2.5">
                <span className="text-lg font-bold tabular-nums text-[var(--nvi-text)]">{qty}</span>
                <span className="text-[10px] uppercase tracking-wide text-blue-400/80">{t('onHand')}</span>
              </div>
              <div className="flex flex-col items-center rounded-xl bg-amber-500/5 px-2 py-2.5">
                <span className="text-lg font-bold tabular-nums text-[var(--nvi-text)]">{inTransit}</span>
                <span className="text-[10px] uppercase tracking-wide text-amber-400/80">{t('inTransit')}</span>
              </div>
              <div className="flex flex-col items-center rounded-xl bg-emerald-500/5 px-2 py-2.5">
                <span className="text-lg font-bold tabular-nums text-[var(--nvi-text)]">{totalQty}</span>
                <span className="text-[10px] uppercase tracking-wide text-emerald-400/80">{t('total')}</span>
              </div>
            </div>

            {/* Stock value + days remaining */}
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-[var(--nvi-text-muted)]">
                {t('stockValue')}: <span className="font-semibold text-[var(--nvi-text)]">{stockValue ?? '—'}</span>
              </span>
              {item.daysRemaining != null ? (
                <span className={`inline-flex items-center gap-1 ${daysClass}`}>
                  {item.daysRemaining <= 7 && (
                    <span className="nvi-bounce-in">
                      <Icon name="TriangleAlert" size={12} />
                    </span>
                  )}
                  {t('daysLeft')}: {item.daysRemaining}
                </span>
              ) : (
                <span className="text-[var(--nvi-text-muted)]">{t('daysLeft')}: —</span>
              )}
            </div>

            {/* Progress bar */}
            <ProgressBar
              value={qty}
              max={100}
              height={4}
              color={qty <= 5 ? 'red' : qty <= 20 ? 'amber' : 'green'}
              className="mb-3"
            />

            {/* Adjust action */}
            <div className="flex justify-end">
              <button
                type="button"
                className="nvi-press rounded-xl border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text-muted)] hover:text-[var(--nvi-text)] inline-flex items-center gap-1.5 transition-colors"
                onClick={() => { /* placeholder */ }}
              >
                <Icon name="Pencil" size={12} />
                {t('adjust')}
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );

  /* ─── Pagination ─── */
  const paginationNode = (
    <PaginationControls
      page={page}
      pageSize={pageSize}
      total={total}
      itemCount={snapshots.length}
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

  return (
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      headerActions={
        <div className="flex items-center gap-2">
          <Link href={`/${locale}/stock/counts/wizard`} className="nvi-press rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs text-[var(--nvi-text)]">
            {t('bulkStockCount')}
          </Link>
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </div>
      }
      banner={message ? <Banner message={message.message} severity={message.outcome === 'failure' ? 'error' : 'success'} onDismiss={() => setMessage(null)} /> : null}
      kpis={kpiStrip}
      filters={filtersNode}
      beforeContent={beforeContent}
      viewMode={viewMode}
      table={tableView}
      cards={cardsView}
      isEmpty={snapshots.length === 0 && !isLoading}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="Package" size={32} className="text-gold-500/40" />
        </div>
      }
      emptyTitle={t('noSnapshots')}
      pagination={paginationNode}
      isLoading={isLoading}
    />
  );
}
