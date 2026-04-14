'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { ListFilters } from '@/components/ListFilters';
import { Banner } from '@/components/notifications/Banner';
import {
  StatusBadge,
  SortableTableHeader,
  Card,
  Icon,
  EmptyState,
  ListPage,
} from '@/components/ui';
import type { SortDirection } from '@/components/ui';
import { useFormatDate } from '@/lib/business-context';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatVariantLabel } from '@/lib/display';
import { useListFilters } from '@/lib/list-filters';

import { PaginationControls } from '@/components/PaginationControls';

/* ── Direction helpers ── */

const IN_TYPES = new Set([
  'PURCHASE_IN',
  'RETURN_IN',
  'TRANSFER_IN',
  'ADJUSTMENT_POSITIVE',
  'OPENING_BALANCE',
]);
const OUT_TYPES = new Set([
  'SALE_OUT',
  'RETURN_OUT',
  'TRANSFER_OUT',
  'ADJUSTMENT_NEGATIVE',
]);

function isInType(type: string) {
  return IN_TYPES.has(type);
}
function isOutType(type: string) {
  return OUT_TYPES.has(type);
}

function movementDirection(type: string): 'green' | 'red' | 'blue' {
  if (isInType(type)) return 'green';
  if (isOutType(type)) return 'red';
  return 'blue';
}

/** Map movement type to a Lucide icon name */
function movementIcon(type: string): 'ShoppingCart' | 'Truck' | 'Wrench' | 'ClipboardCheck' | 'RotateCcw' | 'Package' {
  if (type === 'SALE_OUT') return 'ShoppingCart';
  if (type === 'PURCHASE_IN') return 'Truck';
  if (type === 'TRANSFER_IN' || type === 'TRANSFER_OUT') return 'Truck';
  if (type === 'ADJUSTMENT_POSITIVE' || type === 'ADJUSTMENT_NEGATIVE') return 'Wrench';
  if (type === 'STOCK_COUNT_VARIANCE') return 'ClipboardCheck';
  if (type === 'RETURN_IN' || type === 'RETURN_OUT') return 'RotateCcw';
  return 'Package';
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ── Types ── */

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

/* ── Direction badge color helpers ── */

const directionColors = {
  green: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', ring: 'ring-emerald-500/20' },
  red: { bg: 'bg-red-500/10', text: 'text-red-400', ring: 'ring-red-500/20' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', ring: 'ring-blue-500/20' },
};

const directionDot = {
  green: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]',
  red: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]',
  blue: 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]',
};

/* ── Main component ── */

export default function StockMovementsPage() {
  const t = useTranslations('stockMovementsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const locale = useLocale();
  const { formatDateTime } = useFormatDate();
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useToastState();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [total, setTotal] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
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


  const branchOptions = useMemo(
    () => [
      { value: '', label: common('globalBranch') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );

  const movementTypeLabels = useMemo<Record<string, string>>(
    () => ({
      OPENING_BALANCE: t('typeOpeningBalance'),
      PURCHASE_IN: t('typePurchaseIn'),
      SALE_OUT: t('typeSaleOut'),
      ADJUSTMENT_POSITIVE: t('typeAdjustmentPositive'),
      ADJUSTMENT_NEGATIVE: t('typeAdjustmentNegative'),
      TRANSFER_OUT: t('typeTransferOut'),
      TRANSFER_IN: t('typeTransferIn'),
      RETURN_IN: t('typeReturnIn'),
      RETURN_OUT: t('typeReturnOut'),
      STOCK_COUNT_VARIANCE: t('typeStockCountVariance'),
    }),
    [t],
  );

  const typeOptions = useMemo(
    () => [
      { value: '', label: common('allTypes') },
      ...MOVEMENT_TYPES.map((type) => ({
        value: type,
        label: movementTypeLabels[type] ?? type,
      })),
    ],
    [common, movementTypeLabels],
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
        includeTotal: targetPage === 1 ? '1' : undefined,
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
      setMovements(result.items);
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
  }, [pageSize, filters.branchId, filters.type, filters.actorId, filters.from, filters.to, filters.search, t]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [load]);

  const totalIn = useMemo(
    () =>
      movements
        .filter((m) => isInType(m.movementType))
        .reduce((sum, m) => sum + Math.abs(Number(m.quantity)), 0),
    [movements],
  );
  const totalOut = useMemo(
    () =>
      movements
        .filter((m) => isOutType(m.movementType))
        .reduce((sum, m) => sum + Math.abs(Number(m.quantity)), 0),
    [movements],
  );
  const netChange = totalIn - totalOut;

  const handleSort = useCallback((key: string, dir: SortDirection) => {
    setSortKey(dir ? key : null);
    setSortDirection(dir);
  }, []);

  const sortedMovements = useMemo(() => {
    if (!sortKey || !sortDirection) return movements;
    return [...movements].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortKey) {
        case 'createdAt':
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        case 'branch':
          aVal = a.branch?.name ?? '';
          bVal = b.branch?.name ?? '';
          break;
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
        case 'batch':
          aVal = a.batch?.code ?? '';
          bVal = b.batch?.code ?? '';
          break;
        case 'actor':
          aVal = a.createdBy?.name ?? a.createdBy?.email ?? '';
          bVal = b.createdBy?.name ?? b.createdBy?.email ?? '';
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
  }, [movements, sortKey, sortDirection]);

  const groupedByDay = useMemo(() => {
    const groups: Record<string, Movement[]> = {};
    for (const m of movements) {
      const day = m.createdAt.slice(0, 10); // YYYY-MM-DD
      if (!groups[day]) groups[day] = [];
      groups[day].push(m);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [movements]);

  /* ── Variant label helper ── */
  const variantLabel = (m: Movement) =>
    m.variant
      ? formatVariantLabel(
          {
            id: m.variant.id,
            name: m.variant.name,
            productName: m.variant.product?.name ?? null,
          },
          t('empty'),
        )
      : t('empty');

  /* ── KPI strip ── */
  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      <Card as="article" padding="md" className="nvi-card-hover">
        <div className="flex items-start gap-3">
          <div className="nvi-kpi-icon nvi-kpi-icon--accent shrink-0" style={{ width: 36, height: 36 }}>
            <Icon name="Activity" size={18} />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--nvi-muted)]">
              {t('kpiMovementRows')}
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--nvi-foreground)]">
              {typeof total === 'number' ? total : movements.length}
            </p>
          </div>
        </div>
      </Card>
      <Card as="article" padding="md" className="nvi-card-hover">
        <div className="flex items-start gap-3">
          <div className="nvi-kpi-icon nvi-kpi-icon--emerald shrink-0" style={{ width: 36, height: 36 }}>
            <Icon name="ArrowDownToLine" size={18} />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--nvi-muted)]">
              {t('kpiTotalIn')}
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">{totalIn}</p>
          </div>
        </div>
      </Card>
      <Card as="article" padding="md" className="nvi-card-hover">
        <div className="flex items-start gap-3">
          <div className="nvi-kpi-icon nvi-kpi-icon--red shrink-0" style={{ width: 36, height: 36 }}>
            <Icon name="ArrowUpFromLine" size={18} />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--nvi-muted)]">
              {t('kpiTotalOut')}
            </p>
            <p className="mt-1 text-2xl font-bold text-red-400">{totalOut}</p>
          </div>
        </div>
      </Card>
      <Card as="article" padding="md" className="nvi-card-hover">
        <div className="flex items-start gap-3">
          <div
            className={`nvi-kpi-icon shrink-0 ${netChange >= 0 ? 'nvi-kpi-icon--emerald' : 'nvi-kpi-icon--red'}`}
            style={{ width: 36, height: 36 }}
          >
            <Icon name={netChange >= 0 ? 'TrendingUp' : 'TrendingDown'} size={18} />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--nvi-muted)]">
              {t('kpiNetChange')}
            </p>
            <p className={`mt-1 text-2xl font-bold ${netChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {netChange >= 0 ? '+' : ''}{netChange}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );

  /* ── Table content ── */
  const tableContent = (
    <Card padding="sm">
      <div className="overflow-auto text-sm text-[var(--nvi-foreground)]">
        <table className="min-w-[860px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-[var(--nvi-muted)]">
            <tr>
              <th className="px-3 py-2">{common('images')}</th>
              <SortableTableHeader label={t('date')} sortKey="createdAt" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableTableHeader label={t('branch')} sortKey="branch" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableTableHeader label={t('variant')} sortKey="variant" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableTableHeader label={t('type')} sortKey="type" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableTableHeader label={t('quantity')} sortKey="quantity" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} align="right" />
              <SortableTableHeader label={t('batch')} sortKey="batch" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableTableHeader label={t('actor')} sortKey="actor" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedMovements.map((movement) => {
              const dir = movementDirection(movement.movementType);
              const colors = directionColors[dir];
              return (
                <tr key={movement.id} className="border-t border-[var(--nvi-border)]">
                  <td className="px-3 py-2">
                    <div className="h-8 w-8 overflow-hidden rounded-xl border border-[var(--nvi-border)] bg-black">
                      {movement.variant?.imageUrl ? (
                        <img
                          src={movement.variant.imageUrl}
                          alt={movement.variant.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Icon name={movementIcon(movement.movementType)} size={12} className="text-[var(--nvi-muted)]" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--nvi-muted)]">
                    {formatDateTime(movement.createdAt)}
                  </td>
                  <td className="px-3 py-2">{movement.branch?.name || t('empty')}</td>
                  <td className="px-3 py-2">{variantLabel(movement)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      status={movement.movementType}
                      label={movementTypeLabels[movement.movementType] ?? movement.movementType}
                      size="xs"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${colors.text}`}>
                      <Icon name={isInType(movement.movementType) ? 'ArrowDown' : isOutType(movement.movementType) ? 'ArrowUp' : 'ArrowLeftRight'} size={12} />
                      {isInType(movement.movementType) ? '+' : isOutType(movement.movementType) ? '-' : ''}{Math.abs(Number(movement.quantity))}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--nvi-muted)]">
                    {movement.batch?.code || t('empty')}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--nvi-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="User" size={11} className="text-[var(--nvi-muted)]" />
                      {movement.createdBy?.name ||
                        movement.createdBy?.email ||
                        t('empty')}
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

  /* ── Card content ── */
  const cardsContent = (
    <div className="grid gap-3 nvi-stagger md:grid-cols-2 lg:grid-cols-3">
      {movements.map((movement) => {
        const dir = movementDirection(movement.movementType);
        const colors = directionColors[dir];
        const qty = Math.abs(Number(movement.quantity));
        return (
          <Card
            key={movement.id}
            padding="sm"
            className="nvi-card-hover group"
          >
            <div className="flex gap-3">
              {/* Direction indicator */}
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colors.bg}`}>
                <Icon
                  name={isInType(movement.movementType) ? 'ArrowDown' : isOutType(movement.movementType) ? 'ArrowUp' : 'ArrowLeftRight'}
                  size={20}
                  className={colors.text}
                />
              </div>
              {/* Main content */}
              <div className="min-w-0 flex-1">
                {/* Top row: type badge + quantity */}
                <div className="flex items-start justify-between gap-2">
                  <StatusBadge
                    status={movement.movementType}
                    label={movementTypeLabels[movement.movementType] ?? movement.movementType}
                    size="xs"
                  />
                  <span className={`text-xl font-bold tabular-nums ${colors.text}`}>
                    {isInType(movement.movementType) ? '+' : isOutType(movement.movementType) ? '-' : ''}{qty}
                  </span>
                </div>
                {/* Variant + product */}
                <p className="mt-1.5 truncate text-sm font-medium text-[var(--nvi-foreground)]">
                  {variantLabel(movement)}
                </p>
                {/* Branch */}
                <p className="mt-0.5 truncate text-xs text-[var(--nvi-muted)]">
                  <Icon name="MapPin" size={11} className="inline-block mr-1 -mt-px text-[var(--nvi-muted)]" />
                  {movement.branch?.name || t('empty')}
                </p>
                {/* Actor + relative time */}
                <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--nvi-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="User" size={10} />
                    {movement.createdBy?.name || movement.createdBy?.email || t('empty')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="Clock" size={10} />
                    {relativeTime(movement.createdAt)}
                  </span>
                </div>
                {/* Batch info */}
                {movement.batch?.code ? (
                  <p className="mt-1 text-[10px] text-[var(--nvi-muted)]">
                    <Icon name="Barcode" size={10} className="inline-block mr-1 -mt-px" />
                    {movement.batch.code}
                    {movement.batch.expiryDate ? ` (exp: ${movement.batch.expiryDate.slice(0, 10)})` : ''}
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );

  /* ── Timeline content (the star feature) ── */
  const timelineContent = (
    <div className="nvi-timeline nvi-reveal">
      {/* Vertical gold line */}
      <div className="nvi-timeline__line" />

      {groupedByDay.map(([day, dayMovements], dayIdx) => (
        <div key={day} className="nvi-timeline__day">
          {/* Day separator */}
          <div
            className="nvi-timeline__date-header nvi-slide-in-bottom"
            style={{ animationDelay: `${dayIdx * 80}ms` }}
          >
            <Icon name="Calendar" size={13} className="text-gold-500" />
            <span>{day}</span>
          </div>

          {/* Events for this day */}
          <div className="nvi-stagger">
            {dayMovements.map((m, idx) => {
              const dir = movementDirection(m.movementType);
              const colors = directionColors[dir];
              const qty = Math.abs(Number(m.quantity));
              const time = new Date(m.createdAt).toLocaleTimeString(locale, {
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div key={m.id} className="nvi-timeline__node">
                  {/* Time label (left of line) */}
                  <div className="nvi-timeline__time">{time}</div>

                  {/* Dot on the line */}
                  <div
                    className={`nvi-timeline__dot nvi-bounce-in ${directionDot[dir]}`}
                    style={{ animationDelay: `${(dayIdx * 5 + idx) * 60}ms` }}
                  />

                  {/* Event card (right of line) */}
                  <Card padding="sm" className="nvi-timeline__card nvi-card-hover flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${colors.bg}`}>
                        <Icon name={movementIcon(m.movementType)} size={14} className={colors.text} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <StatusBadge
                            status={m.movementType}
                            label={movementTypeLabels[m.movementType] ?? m.movementType}
                            size="xs"
                          />
                          <span className={`text-lg font-bold tabular-nums ${colors.text}`}>
                            {isInType(m.movementType) ? '+' : isOutType(m.movementType) ? '-' : ''}{qty}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-[var(--nvi-foreground)]">
                          {variantLabel(m)}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-[var(--nvi-muted)]">
                          <span className="inline-flex items-center gap-1">
                            <Icon name="MapPin" size={10} />
                            {m.branch?.name || t('empty')}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Icon name="User" size={10} />
                            {m.createdBy?.name || m.createdBy?.email || t('empty')}
                          </span>
                          {m.batch?.code ? (
                            <span className="inline-flex items-center gap-1">
                              <Icon name="Hash" size={10} />
                              {m.batch.code}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      eyebrow={t('title')}
      isLoading={isLoading}
      isEmpty={!movements.length}
      viewMode={viewMode}
      emptyIcon={<Icon name="Package" size={40} className="text-gold-500/40 nvi-float" />}
      emptyTitle={t('emptyState')}
      emptyDescription={t('subtitle')}
      headerActions={
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/exports`}
            className="nvi-press rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs text-[var(--nvi-foreground)] hover:border-[var(--nvi-foreground)]/30 transition-colors inline-flex items-center gap-1.5"
          >
            <Icon name="Download" size={14} />
            {t('exportMovements')}
          </Link>
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{
              cards: actions('viewCards'),
              table: actions('viewTable'),
              timeline: t('viewTimeline'),
            }}
          />
        </div>
      }
      banner={
        message ? (
          <Banner
            message={message}
            severity="info"
            onDismiss={() => setMessage(null)}
          />
        ) : null
      }
      kpis={kpiStrip}
      filters={
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
            instanceId="movements-filter-branch"
            value={filters.branchId}
            onChange={(value) => pushFilters({ branchId: value })}
            options={branchOptions}
            placeholder={common('branch')}
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="movements-filter-type"
            value={filters.type}
            onChange={(value) => pushFilters({ type: value })}
            options={typeOptions}
            placeholder={t('type')}
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="movements-filter-actor"
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
            className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-foreground)]"
          />
          <DatePickerInput
            value={filters.to}
            onChange={(value) => pushFilters({ to: value })}
            placeholder={common('toDate')}
            className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-foreground)]"
          />
        </ListFilters>
      }
      table={tableContent}
      cards={cardsContent}
      timeline={timelineContent}
      pagination={
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          itemCount={movements.length}
          availablePages={Object.keys(pageCursors).map(Number)}
          hasNext={Boolean(nextCursor)}
          hasPrev={page > 1}
          isLoading={isLoading}
          onPageChange={(nextPage) => load(nextPage)}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setPageCursors({ 1: null });
            setTotal(null);
            load(1, size);
          }}
        />
      }
    />
  );
}
