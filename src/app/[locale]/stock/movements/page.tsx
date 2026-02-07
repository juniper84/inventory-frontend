'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { StatusBanner } from '@/components/StatusBanner';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { ListFilters } from '@/components/ListFilters';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatVariantLabel } from '@/lib/display';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type Movement = {
  id: string;
  quantity: number | string;
  movementType: string;
  reason?: string | null;
  createdAt: string;
  branch?: { id: string; name: string } | null;
  createdBy?: { id: string; name?: string | null; email?: string | null } | null;
  variant?: {
    id: string;
    name: string;
    imageUrl?: string | null;
    product?: { name?: string | null } | null;
  } | null;
  batch?: { id: string; code: string; expiryDate?: string | null } | null;
};

type Branch = { id: string; name: string };
type User = { id: string; name?: string | null; email?: string | null };

const MOVEMENT_TYPES = [
  'OPENING_BALANCE',
  'PURCHASE_IN',
  'SALE_OUT',
  'ADJUSTMENT_POSITIVE',
  'ADJUSTMENT_NEGATIVE',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'RETURN_IN',
  'RETURN_OUT',
  'STOCK_COUNT_VARIANCE',
];

export default function StockMovementsPage() {
  const t = useTranslations('stockMovementsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useToastState();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { activeBranch, resolveBranchId } = useBranchScope();
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    branchId: '',
    type: '',
    actorId: '',
    from: '',
    to: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const branchOptions = useMemo(
    () => [
      { value: '', label: common('globalBranch') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );

  const typeOptions = useMemo(
    () => [
      { value: '', label: common('allTypes') },
      ...MOVEMENT_TYPES.map((type) => ({ value: type, label: type })),
    ],
    [common],
  );
  const actorOptions = useMemo(
    () => [
      { value: '', label: common('all') },
      ...users.map((user) => ({
        value: user.id,
        label: user.name || user.email || user.id,
      })),
    ],
    [common, users],
  );

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    Promise.allSettled([
      apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
        token,
      }),
      apiFetch<PaginatedResponse<User> | User[]>('/users?limit=200', { token }),
    ]).then((results) => {
      if (results[0].status === 'fulfilled') {
        setBranches(normalizePaginated(results[0].value).items);
      } else {
        setBranches([]);
      }
      if (results[1].status === 'fulfilled') {
        setUsers(normalizePaginated(results[1].value).items);
      } else {
        setUsers([]);
      }
    });
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

  const load = async (cursor?: string, append = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    const token = getAccessToken();
    if (!token) {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
      return;
    }
    try {
      const query = buildCursorQuery({
        limit: 50,
        cursor,
        branchId: resolveBranchId(filters.branchId) || undefined,
        type: filters.type || undefined,
        actorId: filters.actorId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        search: filters.search || undefined,
      });
      const data = await apiFetch<PaginatedResponse<Movement> | Movement[]>(
        `/stock/movements${query}`,
        { token },
      );
      const result = normalizePaginated(data);
      setMovements((prev) =>
        append ? [...prev, ...result.items] : result.items,
      );
      setNextCursor(result.nextCursor);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    setNextCursor(null);
    load();
  }, [
    filters.branchId,
    filters.type,
    filters.actorId,
    filters.from,
    filters.to,
    filters.search,
  ]);

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="nvi-page">
      <PremiumPageHeader
        eyebrow={t('title')}
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
            Movement rows
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{movements.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            Actor options
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{actorOptions.length - 1}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            View mode
          </p>
          <p className="mt-2 text-xl font-semibold text-gold-100">
            {viewMode === 'table' ? 'Table' : 'Cards'}
          </p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            More pages
          </p>
          <p className="mt-2 text-xl font-semibold text-gold-100">
            {nextCursor ? 'Available' : 'Complete'}
          </p>
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
          value={filters.branchId}
          onChange={(value) => pushFilters({ branchId: value })}
          options={branchOptions}
          placeholder={common('branch')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.type}
          onChange={(value) => pushFilters({ type: value })}
          options={typeOptions}
          placeholder={t('type')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.actorId}
          onChange={(value) => pushFilters({ actorId: value })}
          options={actorOptions}
          placeholder={t('actor')}
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
      <div className="command-card nvi-panel p-4 nvi-reveal">
        {!movements.length ? <StatusBanner message={t('emptyState')} /> : null}
        {viewMode === 'table' ? (
          <div className="grid grid-cols-1 gap-2 text-sm text-gold-100 md:grid-cols-[56px_160px_140px_minmax(180px,1fr)_140px_80px_120px_140px] md:items-center md:gap-3">
            <span className="text-xs uppercase text-gold-400">{common('images')}</span>
            <span className="text-xs uppercase text-gold-400">{t('date')}</span>
            <span className="text-xs uppercase text-gold-400">{t('branch')}</span>
            <span className="text-xs uppercase text-gold-400">{t('variant')}</span>
            <span className="text-xs uppercase text-gold-400">{t('type')}</span>
            <span className="text-xs uppercase text-gold-400">{t('quantity')}</span>
            <span className="text-xs uppercase text-gold-400">{t('batch')}</span>
            <span className="text-xs uppercase text-gold-400">{t('actor')}</span>
            {movements.map((movement) => (
              <div key={movement.id} className="contents">
                <div>
                  <div className="h-8 w-8 overflow-hidden rounded border border-gold-700/40 bg-black">
                    {movement.variant?.imageUrl ? (
                      <img
                        src={movement.variant.imageUrl}
                        alt={movement.variant.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-gold-500">
                        —
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gold-300">
                  {new Date(movement.createdAt).toLocaleString()}
                </div>
                <div className="min-w-0">{movement.branch?.name || t('empty')}</div>
                <div className="min-w-0">
                  {movement.variant
                    ? formatVariantLabel(
                        {
                          id: movement.variant.id,
                          name: movement.variant.name,
                          productName: movement.variant.product?.name ?? null,
                        },
                        t('empty'),
                      )
                    : t('empty')}
                </div>
                <div className="text-xs text-gold-300 truncate" title={movement.movementType}>
                  {movement.movementType}
                </div>
                <div className="tabular-nums">{movement.quantity}</div>
                <div className="text-xs text-gold-300">
                  {movement.batch?.code || t('empty')}
                </div>
                <div className="text-xs text-gold-300">
                  {movement.createdBy?.name ||
                    movement.createdBy?.email ||
                    t('empty')}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 nvi-stagger md:grid-cols-2">
            {movements.map((movement) => (
              <div
                key={movement.id}
                className="rounded border border-gold-700/40 bg-black/60 p-3 text-sm text-gold-200"
              >
                <p className="text-xs text-gold-400">
                  {new Date(movement.createdAt).toLocaleString()}
                </p>
                <p className="text-base text-gold-100">
                  {movement.variant
                    ? formatVariantLabel(
                        {
                          id: movement.variant.id,
                          name: movement.variant.name,
                          productName: movement.variant.product?.name ?? null,
                        },
                        t('empty'),
                      )
                    : t('empty')}
                </p>
                <p>{movement.movementType}</p>
                <p>
                  {t('quantity')}: {movement.quantity}
                </p>
                <p>
                  {t('branch')}: {movement.branch?.name || t('empty')}
                </p>
                <p>
                  {t('actor')}: {movement.createdBy?.name ||
                    movement.createdBy?.email ||
                    t('empty')}
                </p>
              </div>
            ))}
          </div>
        )}
        {nextCursor ? (
          <button
            type="button"
            onClick={() => load(nextCursor, true)}
            disabled={isLoadingMore}
            className="mt-4 rounded border border-gold-500/60 px-4 py-2 text-sm text-gold-200 disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              {isLoadingMore ? <Spinner variant="orbit" size="xs" /> : null}
              {isLoadingMore ? actions('loading') : actions('loadMore')}
            </span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
