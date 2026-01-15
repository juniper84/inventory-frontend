'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import { PageSkeleton } from '@/components/PageSkeleton';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { formatVariantLabel } from '@/lib/display';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';

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
  const [units, setUnits] = useState<Unit[]>([]);
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
  const debouncedSearch = useDebouncedValue(searchDraft, 350);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
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
  const activeBranch = useActiveBranch();

  const loadLookups = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const [branchData, categoryData, variantData, unitList] = await Promise.all([
      apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
        token,
      }),
      apiFetch<PaginatedResponse<Category> | Category[]>('/categories?limit=200', {
        token,
      }),
      apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
        token,
      }),
      loadUnits(token),
    ]);
    setBranches(normalizePaginated(branchData).items);
    setCategories(normalizePaginated(categoryData).items);
    setVariants(normalizePaginated(variantData).items);
    setUnits(unitList);
  };

  const load = async (targetPage = 1, nextPageSize?: number) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsLoading(true);
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor =
        targetPage === 1 ? null : pageCursors[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        branchId: filters.branchId || undefined,
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
    } catch {
      setMessage({ action: 'load', outcome: 'failure', message: t('loadFailed') });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLookups().catch(() => setMessage(t('filtersFailed')));
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
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1).catch(() => setMessage(t('loadFailed')));
  }, [
    filters.branchId,
    filters.variantId,
    filters.search,
    filters.status,
    filters.categoryId,
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
    const branchFilter = filters.branchId || reorderForm.branchId;
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
      .catch(() => setMessage(t('reorderLoadFailed')))
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
  const getVariantUnitLabel = (variantId: string) => {
    const variant = variants.find((item) => item.id === variantId);
    if (!variant?.baseUnitId) {
      return '';
    }
    const unit = units.find((item) => item.id === variant.baseUnitId);
    return unit ? buildUnitLabel(unit) : '';
  };
  const getVariantImageUrl = (variantId: string) =>
    variants.find((item) => item.id === variantId)?.imageUrl ?? null;

  const branchOptions = useMemo(
    () => [
      { value: '', label: common('allBranches') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );

  const categoryOptions = useMemo(
    () => [
      { value: '', label: common('allCategories') },
      ...categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    ],
    [categories, common],
  );

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
      !reorderForm.branchId ||
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
          branchId: reorderForm.branchId,
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
      const query = reorderForm.branchId
        ? `?branchId=${reorderForm.branchId}`
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
      setMessage({ action: 'update', outcome: 'success', message: t('reorderSaved') });
    } catch {
      setMessage({ action: 'update', outcome: 'failure', message: t('reorderSaveFailed') });
    } finally {
      setIsSavingReorder(false);
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
          value={filters.branchId}
          onChange={(value) => pushFilters({ branchId: value })}
          options={branchOptions}
          placeholder={common('branch')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.variantId}
          onChange={(value) => pushFilters({ variantId: value })}
          options={variantOptions}
          placeholder={common('variant')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.status}
          onChange={(value) => pushFilters({ status: value })}
          options={statusOptions}
          placeholder={common('status')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.categoryId}
          onChange={(value) => pushFilters({ categoryId: value })}
          options={categoryOptions}
          placeholder={common('category')}
          className="nvi-select-container"
        />
      </ListFilters>
      <div className="command-card p-4 nvi-reveal">
        {viewMode === 'table' ? (
          <div className="grid grid-cols-1 gap-2 text-sm text-[color:var(--foreground)] md:grid-cols-7">
            <span className="text-xs uppercase text-[color:var(--muted)]">
              {common('images')}
            </span>
            <span className="text-xs uppercase text-[color:var(--muted)]">
              {t('branch')}
            </span>
            <span className="text-xs uppercase text-[color:var(--muted)]">
              {t('variant')}
            </span>
            <span className="text-xs uppercase text-[color:var(--muted)]">
              {t('onHand')}
            </span>
            <span className="text-xs uppercase text-[color:var(--muted)]">
              {t('inTransit')}
            </span>
            <span className="text-xs uppercase text-[color:var(--muted)]">
              {t('total')}
            </span>
            <span className="text-xs uppercase text-[color:var(--muted)]">
              {t('status')}
            </span>
            {snapshots.length === 0 ? (
              <div className="md:col-span-7">
                <StatusBanner message={t('noSnapshots')} />
              </div>
            ) : (
              snapshots.map((item) => (
                <div
                  key={`${item.branchId}-${item.variantId}`}
                  className="contents"
                >
                  <div>
                    <div className="h-8 w-8 overflow-hidden rounded border border-[color:var(--border)] bg-[color:var(--surface)]">
                      {getVariantImageUrl(item.variantId) ? (
                        <img
                          src={getVariantImageUrl(item.variantId) as string}
                          alt={getVariantName(item.variantId)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-[color:var(--muted)]">
                          —
                        </div>
                      )}
                    </div>
                  </div>
                  <div>{getBranchName(item.branchId)}</div>
                  <div>{getVariantName(item.variantId)}</div>
                  <div>
                    {item.quantity}
                    {getVariantUnitLabel(item.variantId)
                      ? ` (${getVariantUnitLabel(item.variantId)})`
                      : ''}
                  </div>
                  <div>{item.inTransitQuantity ?? 0}</div>
                  <div>
                    {Number(item.quantity ?? 0) +
                      Number(item.inTransitQuantity ?? 0)}
                  </div>
                  <div className="text-xs text-[color:var(--muted)]">{t('snapshot')}</div>
                </div>
              ))
            )}
          </div>
        ) : snapshots.length === 0 ? (
          <StatusBanner message={t('noSnapshots')} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 nvi-stagger">
            {snapshots.map((item) => (
              <div
                key={`${item.branchId}-${item.variantId}`}
                className="rounded border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3 text-sm text-[color:var(--foreground)]"
              >
                <p className="text-xs uppercase text-[color:var(--muted)]">
                  {getBranchName(item.branchId)}
                </p>
                <p className="text-base text-[color:var(--foreground)]">
                  {getVariantName(item.variantId)}
                </p>
                <p>
                  {t('onHand')}: {item.quantity}
                </p>
                <p>
                  {t('inTransit')}: {item.inTransitQuantity ?? 0}
                </p>
                <p>
                  {t('total')}: {Number(item.quantity ?? 0) + Number(item.inTransitQuantity ?? 0)}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
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
        </div>
      </div>

      <div className="command-card p-4 space-y-3 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-gold-100">{t('reorderTitle')}</h3>
          {isLoadingReorder ? (
            <span className="text-xs text-gold-400">{actions('loading')}</span>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <SmartSelect
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
          <SmartSelect
            value={reorderForm.variantId}
            onChange={(value) =>
              setReorderForm((prev) => ({ ...prev, variantId: value }))
            }
            options={variants.map((variant) => ({
              value: variant.id,
              label: formatVariantLabel({
                id: variant.id,
                name: variant.name,
                productName: variant.product?.name ?? null,
              }),
            }))}
            placeholder={t('selectVariant')}
            isClearable
            className="nvi-select-container"
          />
          <input
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
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
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
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        <button
          type="button"
          onClick={saveReorderPoint}
          disabled={!canWrite || isSavingReorder}
          title={!canWrite ? noAccess('title') : undefined}
          className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSavingReorder ? <Spinner variant="orbit" size="xs" /> : null}
          {isSavingReorder ? t('saving') : t('saveReorder')}
        </button>

        <div className="grid gap-2 text-sm text-gold-100 md:grid-cols-5">
          <span className="text-xs uppercase text-gold-400">{t('branch')}</span>
          <span className="text-xs uppercase text-gold-400">{t('variant')}</span>
          <span className="text-xs uppercase text-gold-400">{t('reorderMin')}</span>
          <span className="text-xs uppercase text-gold-400">{t('reorderQty')}</span>
          <span className="text-xs uppercase text-gold-400">{t('status')}</span>
          {reorderPoints.length === 0 ? (
            <span className="text-xs text-gold-400 md:col-span-5">
              {t('noReorderPoints')}
            </span>
          ) : (
            reorderPoints.map((point) => (
              <div key={point.id} className="contents">
                <div>{point.branch?.name ?? getBranchName(point.branchId)}</div>
                <div>
                  {point.variant?.name ?? getVariantName(point.variantId)}
                </div>
                <div>{point.minQuantity}</div>
                <div>{point.reorderQuantity}</div>
                <div className="text-xs text-gold-400">{t('active')}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="command-card p-4 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">
          {t('reorderSuggestionsTitle')}
        </h3>
        {reorderSuggestions.length === 0 ? (
          <p className="text-sm text-gold-300">{t('noReorderSuggestions')}</p>
        ) : (
          <div className="grid gap-2 text-sm text-gold-100 md:grid-cols-6">
            <span className="text-xs uppercase text-gold-400">{t('branch')}</span>
            <span className="text-xs uppercase text-gold-400">{t('variant')}</span>
            <span className="text-xs uppercase text-gold-400">{t('onHand')}</span>
            <span className="text-xs uppercase text-gold-400">{t('inTransit')}</span>
            <span className="text-xs uppercase text-gold-400">{t('reorderMin')}</span>
            <span className="text-xs uppercase text-gold-400">{t('suggestedQty')}</span>
            {reorderSuggestions.map((suggestion) => (
              <div key={suggestion.id} className="contents">
                <div>
                  {suggestion.branch?.name ??
                    getBranchName(suggestion.branchId)}
                </div>
                <div>
                  {suggestion.variant?.name ??
                    getVariantName(suggestion.variantId)}
                </div>
                <div>{suggestion.onHand}</div>
                <div>{suggestion.inTransit}</div>
                <div>{suggestion.minQuantity}</div>
                <div>{suggestion.suggestedQuantity}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
