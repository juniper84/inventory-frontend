'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { Banner } from '@/components/notifications/Banner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { UnitHelpPanel } from '@/components/ui/UnitHelpPanel';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { formatVariantLabel } from '@/lib/display';
import { PaginationControls } from '@/components/PaginationControls';
import { useFormatDate } from '@/lib/business-context';
import {
  CollapsibleSection,
  SortableTableHeader,
  Card,
  Icon,
  TextInput,
  EmptyState,
  ListPage,
} from '@/components/ui';
import type { SortDirection } from '@/components/ui';

type Branch = { id: string; name: string };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  conversionFactor?: number | string | null;
  product?: { name?: string | null };
};
type Batch = { id: string; code: string; expiryDate?: string | null };
type Snapshot = { branchId: string; variantId: string; quantity: number };
type StockMovement = {
  id: string;
  movementType: string;
  quantity: string;
  unitId?: string | null;
  reason?: string | null;
  createdAt: string;
  branch?: { id: string; name: string } | null;
  variant?: { id: string; name: string; product?: { name?: string | null } | null } | null;
};

/* ── helpers ── */

function varianceLabel(qty: number): { text: string; color: string; iconName: 'TriangleAlert' | 'ArrowUp' | 'Check' } {
  if (qty < 0) return { text: `${qty} shortage`, color: 'text-red-400', iconName: 'TriangleAlert' };
  if (qty > 0) return { text: `+${qty} surplus`, color: 'text-emerald-400', iconName: 'ArrowUp' };
  return { text: '0 match', color: 'text-gold-500', iconName: 'Check' };
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

export default function StockCountsPage() {
  const t = useTranslations('stockCountsPage');
  const actions = useTranslations('actions');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const { formatDateTime } = useFormatDate();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('stock.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [message, setMessage] = useToastState();
  const [formOpen, setFormOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [recentCounts, setRecentCounts] = useState<StockMovement[]>([]);
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState<number | null>(null);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({ 1: null });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [form, setForm] = useState({
    branchId: '',
    variantId: '',
    countedQuantity: '',
    unitId: '',
    reason: '',
    shortageReason: '',
    surplusReason: '',
    batchId: '',
  });
  const { loadOptions: loadVariantOptions, seedCache: seedVariantCache, getVariantOption } = useVariantSearch();
  const { activeBranch, resolveBranchId } = useBranchScope();
  const effectiveBranchId = resolveBranchId(form.branchId) || '';

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const token = getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const [branchData, variantData, stockData, unitList] = await Promise.all([
          apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
            token,
          }),
          apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
            token,
          }),
          apiFetch<PaginatedResponse<Snapshot> | Snapshot[]>('/stock?limit=2000', {
            token,
          }),
          loadUnits(token),
        ]);
        setBranches(normalizePaginated(branchData).items);
        const variantList = normalizePaginated(variantData).items;
        setVariants(variantList);
        seedVariantCache(variantList);
        setSnapshots(normalizePaginated(stockData).items);
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
  }, []);

  const loadCounts = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsLoadingCounts(true);
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor =
        targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
        branchId: effectiveBranchId || undefined,
        type: 'STOCK_COUNT_VARIANCE',
      });
      const data = await apiFetch<
        PaginatedResponse<StockMovement> | StockMovement[]
      >(`/stock/movements${query}`, { token });
      const result = normalizePaginated(data);
      setRecentCounts(result.items);
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
      console.warn('Failed to load stock counts', err);
      setRecentCounts([]);
    } finally {
      setIsLoadingCounts(false);
    }
  }, [pageSize, effectiveBranchId]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    loadCounts(1);
  }, [loadCounts]);

  useEffect(() => {
    if (activeBranch?.id && !form.branchId) {
      setForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
  }, [activeBranch?.id, form.branchId]);

  useEffect(() => {
    const loadBatches = async () => {
      const token = getAccessToken();
      if (!token || !effectiveBranchId || !form.variantId) {
        setBatches([]);
        return;
      }
      const data = await apiFetch<PaginatedResponse<Batch> | Batch[]>(
        `/stock/batches?branchId=${effectiveBranchId}&variantId=${form.variantId}`,
        { token },
      );
      setBatches(normalizePaginated(data).items);
    };
    loadBatches().catch(() => setBatches([]));
  }, [effectiveBranchId, form.variantId]);

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

  const unitOptionsForVariant = useMemo(() => {
    if (!form.variantId) return units.map((u) => ({ value: u.id, label: buildUnitLabel(u) }));
    const variant = variants.find((v) => v.id === form.variantId);
    if (!variant) return units.map((u) => ({ value: u.id, label: buildUnitLabel(u) }));

    const validIds = new Set<string>();
    if (variant.baseUnitId) validIds.add(variant.baseUnitId);
    if (variant.sellUnitId) validIds.add(variant.sellUnitId);

    if (validIds.size === 0) return units.map((u) => ({ value: u.id, label: buildUnitLabel(u) }));

    return units
      .filter((u) => validIds.has(u.id))
      .map((u) => ({
        value: u.id,
        label: `${buildUnitLabel(u)}${u.id === variant.baseUnitId ? ` (${t('unitBase')})` : u.id === variant.sellUnitId ? ` (${t('unitSell')})` : ''}`,
      }));
  }, [form.variantId, variants, units, t]);

  const expected = snapshots.find(
    (item) => item.branchId === effectiveBranchId && item.variantId === form.variantId,
  )?.quantity;

  const shortageTotal = recentCounts
    .filter((m) => Number(m.quantity) < 0)
    .reduce((sum, m) => sum + Math.abs(Number(m.quantity)), 0);
  const surplusTotal = recentCounts
    .filter((m) => Number(m.quantity) > 0)
    .reduce((sum, m) => sum + Number(m.quantity), 0);
  const matchCount = recentCounts.filter((m) => Number(m.quantity) === 0).length;

  const handleSort = useCallback((key: string, dir: SortDirection) => {
    setSortKey(dir ? key : null);
    setSortDirection(dir);
  }, []);

  const sortedCounts = useMemo(() => {
    if (!sortKey || !sortDirection) return recentCounts;
    return [...recentCounts].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortKey) {
        case 'variant':
          aVal = a.variant?.name ?? '';
          bVal = b.variant?.name ?? '';
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
  }, [recentCounts, sortKey, sortDirection]);

  const recount = (movement: StockMovement) => {
    // Seed variant cache so the dropdown shows the name, not UUID
    if (movement.variant) {
      seedVariantCache([{
        id: movement.variant.id,
        name: movement.variant.name,
        product: movement.variant.product ?? null,
      }]);
    }
    setForm((prev) => ({
      ...prev,
      branchId: movement.branch?.id ?? prev.branchId,
      variantId: movement.variant?.id ?? prev.variantId,
    }));
    setFormOpen(true);
    if (viewMode === 'table') {
      setViewMode('cards');
    }
  };

  const submit = async () => {
    const token = getAccessToken();
    if (!token || !effectiveBranchId || !form.variantId || !form.countedQuantity) {
      return;
    }
    setMessage(null);
    setIsSubmitting(true);
    try {
      await apiFetch('/stock/counts', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: effectiveBranchId,
          variantId: form.variantId,
          countedQuantity: Number(form.countedQuantity),
          unitId: form.unitId || undefined,
          reason: form.reason || undefined,
          shortageReason: form.shortageReason || undefined,
          surplusReason: form.surplusReason || undefined,
          batchId: form.batchId || undefined,
        }),
      });
      setForm({
        branchId: '',
        variantId: '',
        countedQuantity: '',
        unitId: '',
        reason: '',
        shortageReason: '',
        surplusReason: '',
        batchId: '',
      });
      setFormOpen(false);
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

  /* ── KPI strip ── */
  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      <Card as="article" padding="md" className="nvi-card-hover">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-500/10">
            <Icon name="ClipboardCheck" size={18} className="text-gold-400" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--nvi-muted)]">
              {t('kpiRecentCounts')}
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--nvi-foreground)]">{total ?? recentCounts.length}</p>
          </div>
        </div>
      </Card>
      <Card as="article" padding="md" className="nvi-card-hover">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
            <Icon name="TriangleAlert" size={18} className="text-red-400" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--nvi-muted)]">
              {t('shortageTotal')}
            </p>
            <p className="mt-1 text-2xl font-bold text-red-400">{shortageTotal}</p>
          </div>
        </div>
      </Card>
      <Card as="article" padding="md" className="nvi-card-hover">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
            <Icon name="ArrowUp" size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--nvi-muted)]">
              {t('surplusTotal')}
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">{surplusTotal}</p>
          </div>
        </div>
      </Card>
      <Card as="article" padding="md" className="nvi-card-hover">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-500/10">
            <Icon name="Check" size={18} className="text-gold-400" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--nvi-muted)]">
              {t('kpiMatches')}
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--nvi-foreground)]">{matchCount}</p>
          </div>
        </div>
      </Card>
    </div>
  );

  /* ── Create form ── */
  const createForm = (
    <CollapsibleSection title={t('submitCount')} isOpen={formOpen} onToggle={setFormOpen} storageKey="counts-form-open">
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            instanceId="count-form-branch"
            value={form.branchId}
            onChange={(value) => setForm({ ...form, branchId: value })}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            placeholder={t('selectBranch')}
            isClearable
            className="nvi-select-container"
          />
          <AsyncSmartSelect
            instanceId="count-form-variant"
            value={getVariantOption(form.variantId)}
            loadOptions={loadVariantOptions}
            defaultOptions={variants.map((v) => ({
              value: v.id,
              label: formatVariantLabel({ id: v.id, name: v.name, productName: v.product?.name ?? null }),
            }))}
            onChange={(opt) => setForm({ ...form, variantId: opt?.value ?? '' })}
            placeholder={t('selectVariant')}
            isClearable
            className="nvi-select-container"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <TextInput
            label={t('countedQuantity')}
            type="number"
            value={form.countedQuantity}
            onChange={(event) =>
              setForm({ ...form, countedQuantity: event.target.value })
            }
            placeholder={t('countedQuantity')}
          />
          <SmartSelect
            instanceId="count-form-unit"
            value={form.unitId}
            onChange={(value) => setForm({ ...form, unitId: value })}
            options={unitOptionsForVariant}
            placeholder={t('unit')}
            isClearable
            className="nvi-select-container"
          />
          <div className="flex items-start gap-2 rounded-xl bg-blue-500/[0.04] border border-blue-500/15 px-3 py-2 text-[11px] text-blue-300/80">
            <Icon name="Info" size={14} className="mt-0.5 shrink-0 text-blue-400" />
            <div>
              <p className="font-medium text-blue-300">{t('unitHintTitle')}</p>
              <p className="mt-0.5">{t('unitHintCount')}</p>
            </div>
          </div>
          {(() => {
            const variant = variants.find((v) => v.id === form.variantId);
            if (!variant) return null;
            const baseUnit = units.find((u) => u.id === variant.baseUnitId);
            const sellUnit = units.find((u) => u.id === variant.sellUnitId);
            const factor = Number(variant.conversionFactor) || 1;
            const qty = Number(form.countedQuantity) || 0;
            return (
              <UnitHelpPanel
                mode="hint"
                baseUnitLabel={baseUnit?.label || baseUnit?.code}
                sellUnitLabel={sellUnit?.label || sellUnit?.code}
                conversionFactor={factor}
                quantity={qty > 0 ? qty : undefined}
              />
            );
          })()}
          <TextInput
            label={t('expectedQuantity')}
            value={expected != null ? String(expected) : ''}
            readOnly
            placeholder={t('expectedQuantity')}
            className="text-[var(--nvi-muted)]"
          />
          <SmartSelect
            instanceId="count-form-batch"
            value={form.batchId}
            onChange={(value) => setForm({ ...form, batchId: value })}
            options={batches.map((batch) => ({
              value: batch.id,
              label: `${batch.code}${
                batch.expiryDate
                  ? ` (${t('expiresShort', { date: batch.expiryDate.slice(0, 10) })})`
                  : ''
              }`,
            }))}
            placeholder={t('noBatch')}
            isClearable
            className="nvi-select-container"
          />
        </div>
        {(() => {
          const counted = Number(form.countedQuantity) || 0;
          const exp = expected ?? 0;
          const isShortage = counted > 0 && counted < exp;
          const isSurplus = counted > 0 && counted > exp;
          const shortageReasons = [
            { value: 'DAMAGED', label: t('shortageDamaged') },
            { value: 'LOST', label: t('shortageLost') },
            { value: 'STOLEN', label: t('shortageStolen') },
            { value: 'EXPIRED', label: t('shortageExpired') },
            { value: 'SHRINKAGE', label: t('shortageShrinkage') },
            { value: 'SOLD_OUTSIDE_POS', label: t('shortageSoldOutsidePos') },
            { value: 'CORRECTION', label: t('shortageCorrection') },
            { value: 'OTHER', label: t('shortageOther') },
          ];
          const surplusReasons = [
            { value: 'UNRECORDED_PURCHASE', label: t('surplusUnrecordedPurchase') },
            { value: 'FOUND_STOCK', label: t('surplusFoundStock') },
            { value: 'RETURN_NOT_LOGGED', label: t('surplusReturnNotLogged') },
            { value: 'CORRECTION', label: t('surplusCorrection') },
            { value: 'OTHER', label: t('surplusOther') },
          ];
          const shortageHints: Record<string, string> = {
            DAMAGED: t('hintRecordedAsLoss'), LOST: t('hintRecordedAsLoss'),
            STOLEN: t('hintRecordedAsLoss'), EXPIRED: t('hintRecordedAsLoss'),
            SHRINKAGE: t('hintRecordedAsLoss'), OTHER: t('hintRecordedAsLoss'),
            SOLD_OUTSIDE_POS: t('hintNoFinancialImpact'),
            CORRECTION: t('hintNoFinancialImpact'),
          };
          const surplusHints: Record<string, string> = {
            UNRECORDED_PURCHASE: t('hintRecordedAsCost'),
            FOUND_STOCK: t('hintNoFinancialImpact'),
            RETURN_NOT_LOGGED: t('hintNoFinancialImpact'),
            CORRECTION: t('hintNoFinancialImpact'),
            OTHER: t('hintNoFinancialImpact'),
          };
          const activeReason = isShortage ? form.shortageReason : isSurplus ? form.surplusReason : '';
          const activeHints = isShortage ? shortageHints : surplusHints;
          return (
            <>
              {isShortage ? (
                <SmartSelect
                  instanceId="count-form-shortage-reason"
                  value={form.shortageReason}
                  onChange={(value) => setForm({ ...form, shortageReason: value || '' })}
                  placeholder={t('shortageReasonLabel')}
                  options={shortageReasons}
                />
              ) : null}
              {isSurplus ? (
                <SmartSelect
                  instanceId="count-form-surplus-reason"
                  value={form.surplusReason}
                  onChange={(value) => setForm({ ...form, surplusReason: value || '' })}
                  placeholder={t('surplusReasonLabel')}
                  options={surplusReasons}
                />
              ) : null}
              {activeReason && activeHints[activeReason] ? (
                <p className="text-xs text-[var(--nvi-muted)] -mt-1 px-1">
                  {activeHints[activeReason]}
                </p>
              ) : null}
            </>
          );
        })()}
        <TextInput
          label={t('reason')}
          value={form.reason}
          onChange={(event) => setForm({ ...form, reason: event.target.value })}
          placeholder={t('reason')}
        />
        <button
          type="button"
          onClick={submit}
          className="nvi-press rounded-xl px-4 py-2.5 font-semibold text-black bg-gold-400 hover:bg-gold-300 transition-colors inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting || !canWrite}
          title={!canWrite ? noAccess('title') : undefined}
        >
          {isSubmitting ? (
            <Spinner size="xs" variant="orbit" />
          ) : (
            <Icon name="ClipboardCheck" size={16} className="text-black" />
          )}
          {isSubmitting ? t('submitting') : t('submitCount')}
        </button>
      </div>
    </CollapsibleSection>
  );

  /* ── Card view — variance-hero design ── */
  const cardsContent = (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 nvi-stagger">
      {sortedCounts.map((movement) => {
        const qty = Number(movement.quantity);
        const { text: vText, color: vColor, iconName: vIcon } = varianceLabel(qty);
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
          <Card
            key={movement.id}
            padding="sm"
            className="nvi-card-hover nvi-slide-in-bottom group"
          >
            {/* Hero variance */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${qty < 0 ? 'bg-red-500/10' : qty > 0 ? 'bg-emerald-500/10' : 'bg-gold-500/10'}`}>
                  <Icon name={vIcon} size={16} className={vColor} />
                </div>
                <span className={`text-xl font-bold tabular-nums ${vColor}`}>
                  {vText}
                </span>
              </div>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => recount(movement)}
                  className="nvi-press rounded-xl px-2.5 py-1 text-xs font-medium text-[var(--nvi-muted)] border border-[var(--nvi-border)] hover:text-[var(--nvi-foreground)] hover:border-[var(--nvi-foreground)]/30 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Icon name="RotateCcw" size={12} className="inline mr-1" />
                  {t('recount')}
                </button>
              ) : null}
            </div>

            {/* Variant + product */}
            <p className="text-sm font-semibold text-[var(--nvi-foreground)] truncate">{variantLabel}</p>

            {/* Stats row */}
            <div className="mt-2 flex gap-2">
              <div className="flex-1 rounded-xl bg-[var(--nvi-surface)] px-2.5 py-1.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-[var(--nvi-muted)]">{t('quantity')}</p>
                <p className={`text-sm font-bold tabular-nums ${vColor}`}>
                  {qty > 0 ? '+' : ''}{movement.quantity}
                </p>
              </div>
              {unitLabel ? (
                <div className="flex-1 rounded-xl bg-[var(--nvi-surface)] px-2.5 py-1.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--nvi-muted)]">{t('unit')}</p>
                  <p className="text-sm font-medium text-[var(--nvi-foreground)]">{unitLabel}</p>
                </div>
              ) : null}
            </div>

            {/* Reason badge */}
            {movement.reason ? (
              <div className="mt-2">
                <span className={`inline-flex items-center gap-1 rounded-xl px-2 py-0.5 text-[11px] font-medium ${qty < 0 ? 'bg-red-500/10 text-red-300' : qty > 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-gold-500/10 text-gold-300'}`}>
                  <Icon name={qty < 0 ? 'TriangleAlert' : qty > 0 ? 'ArrowUp' : 'Check'} size={10} />
                  {movement.reason}
                </span>
              </div>
            ) : null}

            {/* Footer: branch + who + when */}
            <div className="mt-3 flex items-center justify-between border-t border-[var(--nvi-border)] pt-2 text-[11px] text-[var(--nvi-muted)]">
              <span className="inline-flex items-center gap-1">
                <Icon name="MapPin" size={11} />
                {movement.branch?.name ?? t('branchFallback')}
              </span>
              <span className="inline-flex items-center gap-1" title={formatDateTime(movement.createdAt)}>
                <Icon name="Clock" size={11} />
                {relativeTime(movement.createdAt)}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );

  /* ── Table view ── */
  const tableContent = (
    <Card padding="sm">
      <div className="overflow-auto text-sm">
        <table className="min-w-[720px] w-full text-left text-sm text-[var(--nvi-foreground)]">
          <thead className="text-xs uppercase text-[var(--nvi-muted)]">
            <tr>
              <SortableTableHeader label={t('variant')} sortKey="variant" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableTableHeader label={t('quantity')} sortKey="quantity" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2">{t('unit')}</th>
              <SortableTableHeader label={t('branch')} sortKey="branch" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableTableHeader label={t('reason')} sortKey="reason" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableTableHeader label={t('createdAt')} sortKey="createdAt" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {sortedCounts.map((movement) => {
              const qty = Number(movement.quantity);
              const { color: vColor } = varianceLabel(qty);
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
                <tr key={movement.id} className="border-t border-[var(--nvi-border)]">
                  <td className="px-3 py-2 font-semibold">{variantLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={`inline-flex items-center gap-1 ${vColor}`}>
                      <Icon name={qty < 0 ? 'TriangleAlert' : qty > 0 ? 'ArrowUp' : 'Check'} size={12} />
                      {qty > 0 ? '+' : ''}{movement.quantity}
                    </span>
                  </td>
                  <td className="px-3 py-2">{unitLabel}</td>
                  <td className="px-3 py-2">
                    {movement.branch?.name ?? t('branchFallback')}
                  </td>
                  <td className="px-3 py-2">
                    {movement.reason ? (
                      <span className={`inline-flex items-center gap-1 rounded-xl px-2 py-0.5 text-[11px] font-medium ${qty < 0 ? 'bg-red-500/10 text-red-300' : qty > 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-gold-500/10 text-gold-300'}`}>
                        {movement.reason}
                      </span>
                    ) : (
                      <span className="text-[var(--nvi-muted)]">{t('noReason')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--nvi-muted)]">
                    {formatDateTime(movement.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {canWrite ? (
                      <button
                        type="button"
                        onClick={() => recount(movement)}
                        className="nvi-press rounded-xl px-2 py-1 text-xs text-[var(--nvi-muted)] hover:text-[var(--nvi-foreground)] transition-colors"
                      >
                        <Icon name="RotateCcw" size={12} className="inline mr-1" />
                        {t('recount')}
                      </button>
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

  return (
    <ListPage
      eyebrow={t('eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      isLoading={isLoading}
      isEmpty={!isLoadingCounts && recentCounts.length === 0}
      emptyIcon={<Icon name="ClipboardCheck" size={40} className="text-gold-500/40 nvi-float" />}
      emptyTitle={t('noCounts')}
      emptyDescription={t('subtitle')}
      emptyAction={
        canWrite ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="nvi-press nvi-bounce-in rounded-xl px-4 py-2 text-sm font-semibold text-black bg-gold-400 hover:bg-gold-300 transition-colors inline-flex items-center gap-2"
          >
            <Icon name="Plus" size={14} className="text-black" />
            {t('submitCount')}
          </button>
        ) : undefined
      }
      headerActions={
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/stock/counts/wizard`}
            className="nvi-press rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs text-[var(--nvi-foreground)] hover:border-[var(--nvi-foreground)]/30 transition-colors inline-flex items-center gap-1.5"
          >
            <Icon name="Wand" size={14} />
            {t('openWizard')}
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
      beforeContent={createForm}
      viewMode={viewMode}
      cards={
        isLoadingCounts ? (
          <div className="flex items-center gap-2 text-xs text-[var(--nvi-muted)] py-8 justify-center">
            <Spinner size="xs" variant="orbit" /> {t('loadingCounts')}
          </div>
        ) : cardsContent
      }
      table={
        isLoadingCounts ? (
          <div className="flex items-center gap-2 text-xs text-[var(--nvi-muted)] py-8 justify-center">
            <Spinner size="xs" variant="orbit" /> {t('loadingCounts')}
          </div>
        ) : tableContent
      }
      pagination={
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          itemCount={recentCounts.length}
          availablePages={Object.keys(pageCursors).map(Number)}
          hasNext={Boolean(nextCursor)}
          hasPrev={page > 1}
          isLoading={isLoadingCounts}
          onPageChange={(nextPage) => loadCounts(nextPage)}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setPageCursors({ 1: null });
            setTotal(null);
            loadCounts(1, size);
          }}
        />
      }
    />
  );
}
