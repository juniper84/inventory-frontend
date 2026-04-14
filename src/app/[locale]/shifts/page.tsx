'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { Spinner } from '@/components/Spinner';
import { Banner } from '@/components/notifications/Banner';
import { OpenShiftModal } from '@/components/shifts/OpenShiftModal';
import { CloseShiftModal } from '@/components/shifts/CloseShiftModal';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { useFormatDate } from '@/lib/business-context';
// FlipCounter/FlipClock removed in favor of colored text values
import {
  ListPage,
  Card,
  Icon,
  StatusBadge,
  SortableTableHeader,
  ProgressBar,
} from '@/components/ui';
import type { SortDirection } from '@/components/ui';
import { formatCurrency, useCurrency } from '@/lib/business-context';
import { PaginationControls } from '@/components/PaginationControls';

// ─── Types ──────────────────────────────────────────────────────────────────

type Branch = { id: string; name: string };
type Shift = {
  id: string;
  referenceNumber?: string | null;
  branchId: string;
  openedAt: string;
  openingCash: number | string;
  status: 'OPEN' | 'CLOSED';
  closedAt?: string | null;
  closingCash?: number | string | null;
  variance?: number | string | null;
};

type ShiftCloseResponse = {
  approvalRequired?: boolean;
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
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}

function getDurationMs(openedAt: string, closedAt?: string | null): number {
  const start = new Date(openedAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  return Math.max(0, end - start);
}

function formatDuration(openedAt: string, closedAt?: string | null): string {
  const diffMs = getDurationMs(openedAt, closedAt);
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function getDurationHours(openedAt: string, closedAt?: string | null): number {
  return getDurationMs(openedAt, closedAt) / 3_600_000;
}

function durationColor(hours: number): 'green' | 'amber' | 'red' {
  if (hours > 10) return 'red';
  if (hours > 8) return 'amber';
  return 'green';
}

function parseVariance(variance: number | string | null | undefined): number | null {
  if (variance === null || variance === undefined) return null;
  const num = typeof variance === 'string' ? Number.parseFloat(variance) : variance;
  if (Number.isNaN(num)) return null;
  return num;
}

function varianceColorClass(v: number): string {
  if (v < 0) return 'text-red-400';
  if (v > 0) return 'text-emerald-400';
  return 'text-[var(--nvi-text-muted)]';
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ShiftsPage() {
  const { formatDateTime } = useFormatDate();
  const currency = useCurrency();
  const t = useTranslations('shiftsPage');
  const actions = useTranslations('actions');
  const noAccess = useTranslations('noAccess');
  const common = useTranslations('common');

  const shiftStatusLabels = useMemo<Record<string, string>>(
    () => ({ OPEN: common('statusOpen'), CLOSED: common('statusClosed') }),
    [common],
  );

  const permissions = getPermissionSet();
  const canOpen = permissions.has('shifts.open');
  const canClose = permissions.has('shifts.close');
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [message, setMessage] = useToastState();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [total, setTotal] = useState<number | null>(null);
  const [openForm, setOpenForm] = useState({
    branchId: '',
    openingCash: '',
    notes: '',
  });
  const { activeBranch, resolveBranchId } = useBranchScope();
  const effectiveOpenBranchId = resolveBranchId(openForm.branchId) || '';
  const [closeForm, setCloseForm] = useState({
    shiftId: '',
    closingCash: '',
    varianceReason: '',
  });
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [openFormOpen, setOpenFormOpen] = useState(false);
  const [closeFormOpen, setCloseFormOpen] = useState(false);
  const [shiftPerformance, setShiftPerformance] = useState<Record<string, { saleCount: number; saleTotal: number; avgTransaction: number } | null>>({});
  const [perfLoading, setPerfLoading] = useState<string | null>(null);
  const [expandedPerf, setExpandedPerf] = useState<Set<string>>(new Set());

  // ─── Derived ──────────────────────────────────────────────────────────────

  const openShifts = useMemo(() => shifts.filter((s) => s.status === 'OPEN'), [shifts]);
  const openCount = openShifts.length;

  const todaySalesTotal = useMemo(() => {
    return Object.values(shiftPerformance).reduce((sum, p) => sum + (p?.saleTotal ?? 0), 0);
  }, [shiftPerformance]);

  const todayAvgTx = useMemo(() => {
    const perfs = Object.values(shiftPerformance).filter(Boolean) as { avgTransaction: number }[];
    if (perfs.length === 0) return 0;
    return perfs.reduce((sum, p) => sum + p.avgTransaction, 0) / perfs.length;
  }, [shiftPerformance]);

  // Find the earliest open shift for the FlipClock
  const earliestOpenShift = useMemo(() => {
    if (openShifts.length === 0) return null;
    return openShifts.reduce((earliest, s) =>
      new Date(s.openedAt).getTime() < new Date(earliest.openedAt).getTime() ? s : earliest,
    );
  }, [openShifts]);

  // ─── Data loading ─────────────────────────────────────────────────────────

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
      });
      const [branchData, shiftData] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<Shift> | Shift[]>(`/shifts${query}`, {
          token,
        }),
      ]);
      setBranches(normalizePaginated(branchData).items);
      const shiftResult = normalizePaginated(shiftData);
      setShifts(shiftResult.items);
      setNextCursor(shiftResult.nextCursor);
      if (typeof shiftResult.total === 'number') {
        setTotal(shiftResult.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (shiftResult.nextCursor) {
          nextState[targetPage + 1] = shiftResult.nextCursor;
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
  }, [pageSize, t]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [load]);

  useEffect(() => {
    if (activeBranch?.id && !openForm.branchId) {
      setOpenForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
  }, [activeBranch?.id, openForm.branchId]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const openShift = async () => {
    const token = getAccessToken();
    if (!token || !effectiveOpenBranchId || !openForm.openingCash) {
      return;
    }
    setMessage(null);
    setIsOpening(true);
    try {
      await apiFetch('/shifts/open', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: effectiveOpenBranchId,
          openingCash: Number(openForm.openingCash),
          notes: openForm.notes || undefined,
        }),
      });
      setOpenForm({ branchId: '', openingCash: '', notes: '' });
      setOpenFormOpen(false);
      setMessage({ action: 'create', outcome: 'success', message: t('opened') });
      await load();
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('openFailed')),
      });
    } finally {
      setIsOpening(false);
    }
  };

  const closeShift = async () => {
    const token = getAccessToken();
    if (!token || !closeForm.shiftId || !closeForm.closingCash) {
      return;
    }
    setMessage(null);
    setIsClosing(true);
    try {
      const response = await apiFetch<ShiftCloseResponse>(
        `/shifts/${closeForm.shiftId}/close`,
        {
          token,
          method: 'POST',
          body: JSON.stringify({
            closingCash: Number(closeForm.closingCash),
            varianceReason: closeForm.varianceReason || undefined,
          }),
        },
      );
      if (response?.approvalRequired) {
        setMessage({ action: 'save', outcome: 'info', message: t('varianceApproval') });
        setIsClosing(false);
        return;
      }
      setCloseForm({ shiftId: '', closingCash: '', varianceReason: '' });
      setCloseFormOpen(false);
      setMessage({ action: 'update', outcome: 'success', message: t('closed') });
      await load();
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('closeFailed')),
      });
    } finally {
      setIsClosing(false);
    }
  };

  const togglePerformance = async (shiftId: string) => {
    // Toggle expand/collapse for already loaded data
    if (shiftPerformance[shiftId] !== undefined) {
      setExpandedPerf((prev) => {
        const next = new Set(prev);
        if (next.has(shiftId)) {
          next.delete(shiftId);
        } else {
          next.add(shiftId);
        }
        return next;
      });
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setPerfLoading(shiftId);
    try {
      const data = await apiFetch<{ saleCount: number; saleTotal: number; avgTransaction: number }>(
        `/shifts/${shiftId}/performance`,
        { token },
      );
      setShiftPerformance((prev) => ({ ...prev, [shiftId]: data }));
      setExpandedPerf((prev) => new Set(prev).add(shiftId));
    } catch {
      setShiftPerformance((prev) => ({ ...prev, [shiftId]: null }));
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: t('performanceFailed'),
      });
    } finally {
      setPerfLoading(null);
    }
  };

  // ─── KPI strip ────────────────────────────────────────────────────────────

  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      {/* Active shifts */}
      <Card padding="md" as="article">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiActiveShifts')}</p>
            <p className="mt-2 text-2xl font-bold text-emerald-400">{openCount}</p>
          </div>
          <div className="nvi-kpi-icon nvi-kpi-icon--emerald">
            <Icon name="Clock" size={18} />
          </div>
        </div>
      </Card>

      {/* Today's sales */}
      <Card padding="md" as="article">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiTodaySales')}</p>
            <p className="mt-2 text-2xl font-bold text-blue-400">
              {todaySalesTotal > 0 ? formatCurrency(todaySalesTotal, currency) : '---'}
            </p>
          </div>
          <div className="nvi-kpi-icon nvi-kpi-icon--blue">
            <Icon name="ShoppingCart" size={18} />
          </div>
        </div>
      </Card>

      {/* Avg transaction */}
      <Card padding="md" as="article">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiAvgTransaction')}</p>
            <p className="mt-2 text-2xl font-bold text-purple-400">
              {todayAvgTx > 0 ? formatCurrency(todayAvgTx, currency) : '---'}
            </p>
          </div>
          <div className="nvi-kpi-icon nvi-kpi-icon--purple">
            <Icon name="TrendingUp" size={18} />
          </div>
        </div>
      </Card>

      {/* Current shift duration */}
      <Card padding="md" as="article">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiShiftDuration')}</p>
            <div className="mt-2">
              {earliestOpenShift ? (
                <p className="text-2xl font-bold text-amber-400">{formatDuration(earliestOpenShift.openedAt)}</p>
              ) : (
                <p className="text-2xl font-bold text-[var(--nvi-text-muted)]">---</p>
              )}
            </div>
          </div>
          <div className="nvi-kpi-icon nvi-kpi-icon--amber">
            <Icon name="Clock" size={18} />
          </div>
        </div>
      </Card>
    </div>
  );

  // ─── Modals ───────────────────────────────────────────────────────────────

  const modals = (
    <>
      <OpenShiftModal
        open={openFormOpen}
        onClose={() => setOpenFormOpen(false)}
        form={openForm}
        onFormChange={setOpenForm}
        branches={branches}
        onSubmit={openShift}
        isOpening={isOpening}
        canOpen={canOpen}
      />
      <CloseShiftModal
        open={closeFormOpen}
        onClose={() => setCloseFormOpen(false)}
        form={closeForm}
        onFormChange={setCloseForm}
        openShifts={openShifts}
        branches={branches}
        onSubmit={closeShift}
        isClosing={isClosing}
        canClose={canClose}
      />
    </>
  );

  // ─── Shift session cards ──────────────────────────────────────────────────

  const shiftCards = (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 nvi-stagger">
      {shifts.map((shift) => {
        const branchName = branches.find((b) => b.id === shift.branchId)?.name ?? t('branchFallback');
        const varianceNum = parseVariance(shift.variance);
        const hours = getDurationHours(shift.openedAt, shift.closedAt);
        const isOpen = shift.status === 'OPEN';
        const perf = shiftPerformance[shift.id];
        const perfExpanded = expandedPerf.has(shift.id);

        return (
          <Card key={shift.id} padding="md" className="nvi-card-hover">
            {/* Header: status dot + branch */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Status dot */}
                <span
                  className={`h-3 w-3 shrink-0 rounded-full ${
                    isOpen
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                      : 'bg-white/[0.06]'
                  }`}
                />
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5">
                    <Icon name="Building2" size={13} className="shrink-0 text-blue-400" />
                    <span className="text-sm font-semibold text-blue-300 truncate">{branchName}</span>
                  </span>
                  {shift.referenceNumber && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-[var(--nvi-border)]/30 px-1.5 py-0.5 text-[10px] text-[var(--nvi-text-muted)]">
                      <Icon name="Hash" size={10} />
                      {shift.referenceNumber}
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge status={shift.status} label={shiftStatusLabels[shift.status]} size="xs" />
            </div>

            {/* Duration section */}
            <div className="mt-3">
              {isOpen ? (
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
                    <Icon name="Clock" size={14} className="text-amber-400" />
                  </span>
                  <span className="text-lg font-bold text-amber-400">{formatDuration(shift.openedAt)}</span>
                  <span className="text-xs text-[var(--nvi-text-muted)]">{t('durationBar')}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--nvi-text-muted)]">{t('durationBar')}</span>
                    <span className="text-xs font-medium text-[var(--nvi-text)]">{formatDuration(shift.openedAt, shift.closedAt)}</span>
                  </div>
                  <ProgressBar
                    value={Math.min(hours, 12)}
                    max={12}
                    height={6}
                    color={durationColor(hours)}
                    formatValue={(v) => t('durationHours', { hours: v.toFixed(1) })}
                  />
                </>
              )}
            </div>

            {/* Cash summary */}
            <div className="mt-3 rounded-lg bg-[var(--nvi-border)]/10 px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <Icon name="DollarSign" size={13} className="text-[var(--nvi-text-muted)]" />
                  <span className="font-medium text-[var(--nvi-text)]">{formatCurrency(Number(shift.openingCash), currency)}</span>
                </div>
                {shift.status === 'CLOSED' && shift.closingCash != null && (
                  <>
                    <Icon name="ArrowRight" size={14} className="text-[var(--nvi-text-muted)]" />
                    <span className="font-semibold text-[var(--nvi-text)]">{formatCurrency(Number(shift.closingCash), currency)}</span>
                  </>
                )}
                {varianceNum !== null && (
                  <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                    varianceNum === 0
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : Math.abs(varianceNum) < 1000
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-red-500/10 text-red-400'
                  }`}>
                    {varianceNum !== 0 && (
                      <Icon name="TriangleAlert" size={11} />
                    )}
                    {varianceNum > 0 ? '+' : ''}{formatCurrency(Math.abs(varianceNum), currency)}
                  </span>
                )}
              </div>
            </div>

            {/* Timestamps */}
            <div className="mt-2 space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs text-[var(--nvi-text-muted)]">
                <Icon name="Clock" size={11} />
                <span>{t('openedAt', { value: relativeTime(shift.openedAt) })}</span>
              </div>
              {shift.closedAt && (
                <div className="flex items-center gap-1.5 text-xs text-[var(--nvi-text-muted)]">
                  <Icon name="Clock" size={11} />
                  <span>{t('closedAtLabel', { value: relativeTime(shift.closedAt) })}</span>
                </div>
              )}
            </div>

            {/* Performance section (expandable) */}
            {shift.status === 'CLOSED' && (
              <div className="mt-3 border-t border-[var(--nvi-border)] pt-2">
                <button
                  type="button"
                  onClick={() => togglePerformance(shift.id)}
                  className="flex w-full items-center justify-between text-xs font-medium text-[var(--nvi-text-muted)] hover:text-[var(--nvi-text)] transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Icon name="TrendingUp" size={12} />
                    {t('viewPerformance')}
                  </span>
                  <span className={`transition-transform duration-200 ${perfExpanded ? 'rotate-180' : ''}`}>
                    ▾
                  </span>
                </button>
                {perfLoading === shift.id && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--nvi-text-muted)]">
                    <Spinner size="xs" variant="dots" />
                    {t('performanceLoading')}
                  </div>
                )}
                {perfExpanded && perf !== undefined && (
                  <div className="nvi-expand">
                    {perf ? (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-emerald-500/10 p-2.5 text-center">
                          <p className="text-lg font-bold text-emerald-400">{perf.saleCount}</p>
                          <p className="text-[10px] uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('perfSalesLabel')}</p>
                        </div>
                        <div className="rounded-lg bg-blue-500/10 p-2.5 text-center">
                          <p className="text-sm font-bold text-blue-400">{formatCurrency(perf.saleTotal, currency)}</p>
                          <p className="text-[10px] uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('perfRevenueLabel')}</p>
                        </div>
                        <div className="rounded-lg bg-purple-500/10 p-2.5 text-center">
                          <p className="text-sm font-bold text-purple-400">{formatCurrency(perf.avgTransaction, currency)}</p>
                          <p className="text-[10px] uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('perfAvgLabel')}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-red-400">{t('performanceFailed')}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );

  // ─── Table view ───────────────────────────────────────────────────────────

  const shiftTable = (
    <Card padding="lg">
      <table className="min-w-[900px] w-full text-left text-sm text-[var(--nvi-text)]">
        <thead className="text-xs uppercase text-[var(--nvi-text-muted)]">
          <tr>
            <th className="px-3 py-2 w-6" />
            <SortableTableHeader label={t('branch')} sortKey="branch" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
            <SortableTableHeader label={t('openedAtCol')} sortKey="openedAt" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
            <SortableTableHeader label={t('closedAtCol')} sortKey="closedAt" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
            <th className="px-3 py-2">{t('durationCol')}</th>
            <SortableTableHeader label={t('openingCash')} sortKey="openingCash" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} align="right" />
            <SortableTableHeader label={t('closingCash')} sortKey="closingCash" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} align="right" />
            <SortableTableHeader label={t('varianceCol')} sortKey="variance" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} align="right" />
            <SortableTableHeader label={common('status')} sortKey="status" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
            <th className="px-3 py-2">
              <Icon name="TrendingUp" size={14} className="text-[var(--nvi-text-muted)]" />
            </th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift) => {
            const varianceNum = parseVariance(shift.variance);
            const hours = getDurationHours(shift.openedAt, shift.closedAt);
            const isOpen = shift.status === 'OPEN';
            return (
              <tr key={shift.id} className="border-t border-[var(--nvi-border)]">
                {/* Status dot */}
                <td className="px-3 py-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      isOpen
                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                        : 'bg-white/[0.06]'
                    }`}
                  />
                </td>
                {/* Branch */}
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-500/10">
                      <Icon name="Building2" size={12} className="text-blue-400" />
                    </span>
                    <span className="font-semibold text-[var(--nvi-text)]">
                      {branches.find((b) => b.id === shift.branchId)?.name ?? t('branchFallback')}
                    </span>
                  </span>
                  {shift.referenceNumber && (
                    <p className="text-[11px] text-[var(--nvi-text-muted)]/60">{shift.referenceNumber}</p>
                  )}
                </td>
                {/* Opened */}
                <td className="px-3 py-2">
                  <span className="text-xs">{relativeTime(shift.openedAt)}</span>
                  <p className="text-[11px] text-[var(--nvi-text-muted)]/50">{formatDateTime(shift.openedAt)}</p>
                </td>
                {/* Closed */}
                <td className="px-3 py-2">
                  {shift.closedAt ? (
                    <>
                      <span className="text-xs">{relativeTime(shift.closedAt)}</span>
                      <p className="text-[11px] text-[var(--nvi-text-muted)]/50">{formatDateTime(shift.closedAt)}</p>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--nvi-text-muted)]">---</span>
                  )}
                </td>
                {/* Duration */}
                <td className="px-3 py-2">
                  <span className="text-xs">{formatDuration(shift.openedAt, shift.closedAt)}</span>
                  <ProgressBar
                    value={Math.min(hours, 12)}
                    max={12}
                    height={4}
                    color={durationColor(hours)}
                    className="mt-1 w-20"
                  />
                </td>
                {/* Opening cash */}
                <td className="px-3 py-2 text-right">{formatCurrency(Number(shift.openingCash), currency)}</td>
                {/* Closing cash */}
                <td className="px-3 py-2 text-right">{shift.closingCash != null ? formatCurrency(Number(shift.closingCash), currency) : '---'}</td>
                {/* Variance */}
                <td className="px-3 py-2 text-right">
                  {varianceNum !== null ? (
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${
                      varianceNum === 0
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : Math.abs(varianceNum) < 1000
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-red-500/10 text-red-400'
                    }`}>
                      {varianceNum !== 0 && <Icon name="TriangleAlert" size={11} />}
                      {varianceNum > 0 ? '+' : ''}{formatCurrency(Math.abs(varianceNum), currency)}
                    </span>
                  ) : '---'}
                </td>
                {/* Status */}
                <td className="px-3 py-2">
                  <StatusBadge status={shift.status} label={shiftStatusLabels[shift.status]} size="xs" />
                </td>
                {/* Performance action */}
                <td className="px-3 py-2">
                  {shift.status === 'CLOSED' && (
                    <button
                      type="button"
                      onClick={() => togglePerformance(shift.id)}
                      className="rounded-lg p-1.5 text-[var(--nvi-text-muted)] hover:bg-[var(--nvi-border)]/20 hover:text-[var(--nvi-text)] transition-colors"
                      title={t('viewPerformance')}
                    >
                      {perfLoading === shift.id ? (
                        <Spinner size="xs" variant="dots" />
                      ) : (
                        <Icon name="TrendingUp" size={14} />
                      )}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );

  // ─── Banner ───────────────────────────────────────────────────────────────

  const bannerNode = message ? (
    <Banner
      message={typeof message === 'string' ? message : message.message}
      severity={
        typeof message === 'string'
          ? 'info'
          : message.outcome === 'success'
            ? 'success'
            : message.outcome === 'warning'
              ? 'warning'
              : 'error'
      }
      onDismiss={() => setMessage(null)}
    />
  ) : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      eyebrow={t('eyebrow')}
      badges={
        <>
          <span className="nvi-badge">{t('badgeCashDesk')}</span>
          <span className="nvi-badge">{t('badgeLive')}</span>
        </>
      }
      headerActions={
        <>
          {canOpen ? (
            <button
              type="button"
              onClick={() => setOpenFormOpen(true)}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
            >
              <Icon name="Play" size={14} />
              {t('openAction')}
            </button>
          ) : null}
          {canClose && openShifts.length > 0 ? (
            <button
              type="button"
              onClick={() => setCloseFormOpen(true)}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/25"
            >
              <Icon name="Square" size={14} />
              {t('closeAction')}
            </button>
          ) : null}
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </>
      }
      isLoading={isLoading}
      banner={bannerNode}
      kpis={kpiStrip}
      viewMode={viewMode}
      isEmpty={!shifts.length}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="Clock" size={32} className="text-[var(--nvi-text-muted)]" />
        </div>
      }
      emptyTitle={t('noShifts')}
      emptyDescription={t('emptyDescription')}
      table={shiftTable}
      cards={shiftCards}
      pagination={
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          itemCount={shifts.length}
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
    {modals}
    </>
  );
}
