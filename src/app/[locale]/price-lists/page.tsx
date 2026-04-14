'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { notify } from '@/components/notifications/NotificationProvider';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { useVariantSearch } from '@/lib/use-variant-search';
import { Banner } from '@/components/notifications/Banner';
import { PriceListCreateModal } from '@/components/price-lists/PriceListCreateModal';
import { PriceListEditModal } from '@/components/price-lists/PriceListEditModal';
import { AddOverrideModal } from '@/components/price-lists/AddOverrideModal';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { formatVariantLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { useCurrency, formatCurrency } from '@/lib/business-context';
import {
  ListPage,
  Card,
  Icon,
  StatusBadge,
  ActionButtons,
} from '@/components/ui';

// ─── Types ──────────────────────────────────────────────────────────────────

type PriceListItem = {
  id: string;
  variantId: string;
  price: number | string;
};

type PriceList = {
  id: string;
  name: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  customerCount?: number;
  items?: PriceListItem[];
};

type Variant = {
  id: string;
  name: string;
  product?: { name?: string | null };
  defaultPrice?: number | null;
  imageUrl?: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function computePricingImpact(
  items: PriceListItem[],
  variantMap: Map<string, Variant>,
) {
  if (items.length === 0) return null;
  let totalDiffPct = 0;
  let compared = 0;
  let discountCount = 0;
  let markupCount = 0;

  for (const item of items) {
    const variant = variantMap.get(item.variantId);
    const defaultPrice = variant?.defaultPrice != null ? Number(variant.defaultPrice) : null;
    const listPrice = Number(item.price);
    if (defaultPrice != null && defaultPrice > 0) {
      const diffPct = ((listPrice - defaultPrice) / defaultPrice) * 100;
      totalDiffPct += diffPct;
      compared++;
      if (listPrice < defaultPrice) discountCount++;
      else if (listPrice > defaultPrice) markupCount++;
    }
  }

  if (compared === 0) return null;
  const avgPct = totalDiffPct / compared;
  return {
    avgPct,
    compared,
    discountCount,
    markupCount,
    isDiscount: avgPct < 0,
    isMarkup: avgPct > 0,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PriceListsPage() {
  const t = useTranslations('priceListsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const currency = useCurrency();
  const permissions = getPermissionSet();
  const canManage = permissions.has('price-lists.manage');
  const { loadOptions: loadVariantOptions, seedCache: seedVariantCache, getVariantOption } = useVariantSearch();
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState<number | null>(null);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({ 1: null });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [lists, setLists] = useState<PriceList[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [message, setMessage] = useToastState();
  const [form, setForm] = useState({ name: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [addOverrideOpen, setAddOverrideOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState({
    name: '',
    status: 'ACTIVE' as PriceList['status'],
  });
  const [itemForm, setItemForm] = useState({
    listId: '',
    variantId: '',
    price: '',
  });
  const [expandedItems, setExpandedItems] = useState<string | null>(null);

  // ─── Data loading ─────────────────────────────────────────────────────

  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const variantData = await apiFetch<PaginatedResponse<Variant> | Variant[]>(
        '/variants?limit=200',
        { token },
      );
      const variantList = normalizePaginated(variantData).items;
      setVariants(variantList);
      seedVariantCache(variantList);
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
    const effectivePageSize = nextPageSize ?? pageSize;
    const cursor = targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
    try {
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const listData = await apiFetch<PaginatedResponse<PriceList> | PriceList[]>(
        `/price-lists${query}`,
        { token },
      );
      const listResult = normalizePaginated(listData);
      setLists(listResult.items);
      setNextCursor(listResult.nextCursor);
      if (typeof listResult.total === 'number') {
        setTotal(listResult.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (listResult.nextCursor) {
          nextState[targetPage + 1] = listResult.nextCursor;
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
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [load]);

  // ─── Actions ──────────────────────────────────────────────────────────

  const createList = async () => {
    const token = getAccessToken();
    if (!token || !form.name.trim()) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      await apiFetch('/price-lists', {
        token,
        method: 'POST',
        body: JSON.stringify({ name: form.name.trim() }),
      });
      setForm({ name: '' });
      setCreateOpen(false);
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

  const startEdit = (list: PriceList) => {
    setEditingId(list.id);
    setEditing({
      name: list.name ?? '',
      status: list.status ?? 'ACTIVE',
    });
  };

  const saveEdit = async () => {
    const token = getAccessToken();
    if (!token || !editingId) {
      return;
    }
    setMessage(null);
    setIsSaving(true);
    try {
      await apiFetch(`/price-lists/${editingId}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          name: editing.name || undefined,
          status: editing.status ?? undefined,
        }),
      });
      setEditingId(null);
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

  const addItem = async () => {
    const token = getAccessToken();
    if (!token || !itemForm.listId || !itemForm.variantId || !itemForm.price) {
      return;
    }
    setMessage(null);
    setIsAssigning(true);
    try {
      await apiFetch(`/price-lists/${itemForm.listId}/items`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          variantId: itemForm.variantId,
          price: Number(itemForm.price),
        }),
      });
      setItemForm({ listId: '', variantId: '', price: '' });
      setAddOverrideOpen(false);
      setMessage({ action: 'save', outcome: 'success', message: t('itemSaved') });
      await load();
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('setItemFailed')),
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const removeItem = async (listId: string, itemId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setMessage(null);
    setRemovingItemId(itemId);
    try {
      await apiFetch(`/price-lists/${listId}/items/${itemId}/remove`, {
        token,
        method: 'POST',
      });
      setMessage({ action: 'delete', outcome: 'success', message: t('itemRemoved') });
      await load();
    } catch (err) {
      setMessage({
        action: 'delete',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('removeItemFailed')),
      });
    } finally {
      setRemovingItemId(null);
    }
  };

  const archiveList = async (listId: string) => {
    const token = getAccessToken();
    if (!token) return;
    const ok = await notify.confirm({
      title: t('archiveConfirmTitle') || common('archive'),
      message: t('archiveConfirmMessage') || t('updated'),
      confirmText: t('archiveConfirmButton') || common('archive'),
    });
    if (!ok) return;
    setMessage(null);
    setArchivingId(listId);
    try {
      await apiFetch(`/price-lists/${listId}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({ status: 'ARCHIVED' }),
      });
      setMessage({ action: 'update', outcome: 'success', message: t('updated') });
      await load();
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('updateFailed')),
      });
    } finally {
      setArchivingId(null);
    }
  };

  const undoLastChange = async (listId: string) => {
    const token = getAccessToken();
    if (!token) return;
    const ok = await notify.confirm({
      title: t('undoConfirmTitle'),
      message: t('undoConfirmMessage'),
      confirmText: t('undoConfirmButton'),
    });
    if (!ok) return;
    setMessage(null);
    setUndoingId(listId);
    try {
      await apiFetch(`/price-lists/${listId}/undo`, {
        token,
        method: 'POST',
      });
      setMessage({ action: 'update', outcome: 'success', message: t('undoSuccess') });
      await load();
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('undoFailed')),
      });
    } finally {
      setUndoingId(null);
    }
  };

  // ─── Derived data ─────────────────────────────────────────────────────

  const variantMap = useMemo(() => {
    return new Map(variants.map((variant) => [variant.id, variant]));
  }, [variants]);

  const activeLists = useMemo(
    () => lists.filter((list) => (list.status ?? 'ACTIVE') === 'ACTIVE').length,
    [lists],
  );

  const overrideCount = useMemo(
    () => lists.reduce((sum, list) => sum + (list.items?.length ?? 0), 0),
    [lists],
  );

  const uniqueVariantCount = useMemo(() => {
    const ids = new Set<string>();
    for (const list of lists) {
      for (const item of list.items ?? []) {
        ids.add(item.variantId);
      }
    }
    return ids.size;
  }, [lists]);

  // ─── Banner ───────────────────────────────────────────────────────────

  const bannerNode = message ? (
    <Banner message={message} onDismiss={() => setMessage(null)} />
  ) : null;

  // ─── KPI strip ────────────────────────────────────────────────────────

  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      <Card as="article" padding="md">
        <div className="flex items-center gap-3">
          <span className="nvi-kpi-icon nvi-kpi-icon--amber">
            <Icon name="ListOrdered" size={20} />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/50">{t('kpiPriceLists')}</p>
            <p className="mt-0.5 text-2xl font-bold text-amber-400">{total ?? lists.length}</p>
          </div>
        </div>
      </Card>
      <Card as="article" padding="md">
        <div className="flex items-center gap-3">
          <span className="nvi-kpi-icon nvi-kpi-icon--emerald">
            <Icon name="CircleCheck" size={20} />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/50">{t('kpiActiveLists')}</p>
            <p className="mt-0.5 text-2xl font-bold text-emerald-400">{activeLists}</p>
          </div>
        </div>
      </Card>
      <Card as="article" padding="md">
        <div className="flex items-center gap-3">
          <span className="nvi-kpi-icon nvi-kpi-icon--blue">
            <Icon name="Tags" size={20} />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/50">{t('kpiOverrides')}</p>
            <p className="mt-0.5 text-2xl font-bold text-blue-400">{overrideCount}</p>
          </div>
        </div>
      </Card>
      <Card as="article" padding="md">
        <div className="flex items-center gap-3">
          <span className="nvi-kpi-icon nvi-kpi-icon--purple">
            <Icon name="Package" size={20} />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/50">{t('kpiVariantPool')}</p>
            <p className="mt-0.5 text-2xl font-bold text-purple-400">{uniqueVariantCount}</p>
          </div>
        </div>
      </Card>
    </div>
  );


  // ─── Card view ────────────────────────────────────────────────────────

  const cardsContent = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 nvi-stagger">
      {lists.map((list) => {
        const items = list.items ?? [];
        const impact = computePricingImpact(items, variantMap);
        const isItemsOpen = expandedItems === list.id;

        return (
          <Card
            key={list.id}
            padding="md"
            className="nvi-card-hover transition-all"
          >
            {(
              /* ─── Display mode (edit handled by modal) ─── */
              <div className="space-y-4">
                {/* Header: name + status dot + actions */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        (list.status ?? 'ACTIVE') === 'ACTIVE'
                          ? 'bg-emerald-400'
                          : list.status === 'ARCHIVED'
                            ? 'bg-white/20'
                            : 'bg-amber-400'
                      }`}
                      title={list.status ?? 'ACTIVE'}
                    />
                    <h3 className="text-sm font-bold text-white truncate">{list.name}</h3>
                  </div>
                  <ActionButtons
                    actions={[
                      { key: 'edit', icon: <Icon name="Pencil" size={14} />, label: common('edit'), onClick: () => startEdit(list), disabled: !canManage },
                      { key: 'undo', icon: <Icon name="Undo" size={14} />, label: t('undoLastChange'), onClick: () => undoLastChange(list.id), disabled: !canManage || undoingId === list.id },
                      { key: 'archive', icon: <Icon name="Trash2" size={14} />, label: common('archive') || 'Archive', onClick: () => archiveList(list.id), disabled: !canManage || archivingId === list.id || list.status === 'ARCHIVED', variant: 'danger' },
                    ]}
                    size="xs"
                  />
                </div>

                {/* Impact summary — hero section */}
                {impact ? (
                  <div
                    className={`rounded-xl px-4 py-3 ${
                      impact.isDiscount
                        ? 'bg-emerald-500/8 border border-emerald-500/20'
                        : impact.isMarkup
                          ? 'bg-amber-500/8 border border-amber-500/20'
                          : 'bg-white/5 border border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        name={impact.isDiscount ? 'TrendingDown' : impact.isMarkup ? 'TrendingUp' : 'DollarSign'}
                        size={18}
                        className={
                          impact.isDiscount
                            ? 'text-emerald-400'
                            : impact.isMarkup
                              ? 'text-amber-400'
                              : 'text-white/40'
                        }
                      />
                      <div>
                        <p
                          className={`text-xl font-bold ${
                            impact.isDiscount
                              ? 'text-emerald-400'
                              : impact.isMarkup
                                ? 'text-amber-400'
                                : 'text-white/60'
                          }`}
                        >
                          {t('avgLabel') || 'avg'} {Math.abs(impact.avgPct).toFixed(0)}%{' '}
                          {impact.isDiscount
                            ? (t('belowDefault') || 'below default')
                            : impact.isMarkup
                              ? (t('aboveDefault') || 'above default')
                              : (t('atDefault') || 'at default')}
                        </p>
                        <p className="text-[11px] text-white/40 mt-0.5">
                          {items.length} {items.length === 1 ? 'item' : 'items'} compared
                        </p>
                      </div>
                    </div>
                  </div>
                ) : items.length > 0 ? (
                  <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                    <span className="text-sm text-white/40">
                      {items.length} {items.length === 1 ? 'item' : 'items'} — {t('noDefaultPrices') || 'no default prices to compare'}
                    </span>
                  </div>
                ) : null}

                {/* Customer count pill */}
                <div className="flex items-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
                    <Icon name="Users" size={13} className="text-blue-400" />
                    {t('customerCountLabel', { count: list.customerCount ?? 0 })}
                  </span>
                </div>

                {/* Items section (expandable) */}
                <div className="border-t border-white/[0.06] pt-3">
                  <button
                    type="button"
                    onClick={() => setExpandedItems(isItemsOpen ? null : list.id)}
                    className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors"
                  >
                    <Icon name={isItemsOpen ? 'ChevronUp' : 'ChevronDown'} size={12} />
                    {isItemsOpen
                      ? (t('hideItems') || 'Hide items')
                      : (t('viewItems') || `View ${items.length} items`)}
                  </button>
                  {isItemsOpen ? (
                    <div className="mt-2.5 space-y-1 nvi-expand">
                      {items.length === 0 ? (
                        <p className="text-xs text-white/30">{t('noOverrides')}</p>
                      ) : (
                        items.map((item) => {
                          const variant = variantMap.get(item.variantId);
                          const defaultPrice = variant?.defaultPrice != null ? Number(variant.defaultPrice) : null;
                          const listPrice = Number(item.price);
                          const diffPct = defaultPrice != null && defaultPrice > 0
                            ? ((listPrice - defaultPrice) / defaultPrice) * 100
                            : null;

                          return (
                            <div
                              key={item.id}
                              className="group flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2 hover:bg-white/[0.06] transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {variant?.imageUrl ? (
                                  <div className="nvi-img-zoom shrink-0">
                                    <img
                                      src={variant.imageUrl}
                                      alt={variant.name}
                                      className="h-8 w-8 rounded-lg object-cover ring-1 ring-white/10"
                                    />
                                  </div>
                                ) : (
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                                    <Icon name="Package" size={14} className="text-white/20" />
                                  </span>
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs text-white/70 truncate">
                                    {formatVariantLabel(
                                      {
                                        id: item.variantId,
                                        name: variant?.name ?? null,
                                        productName: variant?.product?.name ?? null,
                                      },
                                      common('unknown'),
                                    )}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {defaultPrice != null ? (
                                      <span className="text-[11px] text-white/25 line-through">
                                        {formatCurrency(defaultPrice, currency)}
                                      </span>
                                    ) : null}
                                    <span
                                      className={`text-xs font-bold ${
                                        diffPct != null && diffPct < 0
                                          ? 'text-emerald-400'
                                          : diffPct != null && diffPct > 0
                                            ? 'text-amber-400'
                                            : 'text-white/70'
                                      }`}
                                    >
                                      {formatCurrency(listPrice, currency)}
                                    </span>
                                    {diffPct != null ? (
                                      <span
                                        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                                          diffPct < 0
                                            ? 'bg-emerald-500/15 text-emerald-400'
                                            : diffPct > 0
                                              ? 'bg-red-500/15 text-red-400'
                                              : 'bg-white/10 text-white/40'
                                        }`}
                                      >
                                        {diffPct > 0 ? '+' : ''}{diffPct.toFixed(0)}%
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeItem(list.id, item.id)}
                                className="shrink-0 rounded-md p-1.5 text-white/20 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={removingItemId === item.id || !canManage}
                                title={!canManage ? noAccess('title') : (actions('remove'))}
                                aria-label={actions('remove')}
                              >
                                {removingItemId === item.id ? (
                                  <Spinner size="xs" variant="dots" />
                                ) : (
                                  <Icon name="Trash2" size={12} />
                                )}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Branch link */}
                <div className="flex items-center">
                  <Link
                    href={`/${locale}/branches`}
                    className="inline-flex items-center gap-1.5 text-[11px] text-white/30 hover:text-blue-400 transition-colors"
                  >
                    <Icon name="GitBranch" size={11} />
                    {t('applyToBranch')}
                  </Link>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );

  // ─── Table view ───────────────────────────────────────────────────────

  const tableContent = (
    <Card padding="lg">
      <h3 className="text-base font-semibold text-white mb-4">{t('listsTitle')}</h3>
      <div className="overflow-auto">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/30">{common('name') || 'Name'}</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/30">{t('statusLabel')}</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/30">{t('kpiOverrides') || 'Items'}</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/30">{t('impactLabel') || 'Impact'}</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/30">{t('customers')}</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/30 text-right">{common('actions') || 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {lists.map((list) => {
              const items = list.items ?? [];
              const impact = computePricingImpact(items, variantMap);

              return (
                <tr key={list.id} className="border-t border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                  <td className="px-3 py-2.5 font-semibold text-white">{list.name}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          (list.status ?? 'ACTIVE') === 'ACTIVE'
                            ? 'bg-emerald-400'
                            : list.status === 'ARCHIVED'
                              ? 'bg-white/20'
                              : 'bg-amber-400'
                        }`}
                      />
                      <span className="text-xs text-white/50">{list.status ?? 'ACTIVE'}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-white/50">{items.length}</td>
                  <td className="px-3 py-2.5">
                    {impact ? (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          impact.isDiscount
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : impact.isMarkup
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-white/5 text-white/40'
                        }`}
                      >
                        <Icon
                          name={impact.isDiscount ? 'TrendingDown' : impact.isMarkup ? 'TrendingUp' : 'DollarSign'}
                          size={13}
                        />
                        {Math.abs(impact.avgPct).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-white/15">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
                      <Icon name="Users" size={13} className="text-blue-400" />
                      {list.customerCount ?? 0}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ActionButtons
                      actions={[
                        {
                          key: 'edit',
                          icon: <Icon name="Pencil" size={14} />,
                          label: common('edit'),
                          onClick: () => {
                            setViewMode('cards');
                            startEdit(list);
                          },
                          disabled: !canManage,
                        },
                        {
                          key: 'undo',
                          icon: <Icon name="Undo" size={14} />,
                          label: t('undoLastChange'),
                          onClick: () => undoLastChange(list.id),
                          disabled: !canManage || undoingId === list.id,
                        },
                        {
                          key: 'archive',
                          icon: <Icon name="Trash2" size={14} />,
                          label: common('archive') || 'Archive',
                          onClick: () => archiveList(list.id),
                          disabled: !canManage || archivingId === list.id || list.status === 'ARCHIVED',
                          variant: 'danger',
                        },
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

  // ─── Pagination ───────────────────────────────────────────────────────

  const paginationNode = (
    <PaginationControls
      page={page}
      pageSize={pageSize}
      total={total}
      itemCount={lists.length}
      availablePages={Object.keys(pageCursors).map(Number)}
      hasNext={!!nextCursor}
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
          <span className="status-chip">{t('badgePriceGovernance')}</span>
          <span className="status-chip">{t('badgeLive')}</span>
        </>
      }
      headerActions={
        <div className="flex items-center gap-2">
          {canManage ? (
            <>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-[var(--nvi-accent)] px-3 py-2 text-xs font-semibold text-black"
              >
                <Icon name="Plus" size={14} />
                {t('createTitle')}
              </button>
              <button
                type="button"
                onClick={() => setAddOverrideOpen(true)}
                className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs text-[var(--nvi-text)]"
              >
                <Icon name="Tags" size={14} />
                {t('assignTitle')}
              </button>
            </>
          ) : null}
          <Link
            href={`/${locale}/price-lists/wizard`}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors nvi-press"
          >
            {t('openWizard')}
          </Link>
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: common('cards') || 'Cards', table: common('table') || 'Table' }}
          />
        </div>
      }
      banner={bannerNode}
      kpis={kpiStrip}
      viewMode={viewMode}
      table={tableContent}
      cards={cardsContent}
      isEmpty={lists.length === 0}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="ListOrdered" size={48} className="text-white/15" />
        </div>
      }
      emptyTitle={t('empty')}
      emptyDescription={t('emptyDescription') || t('empty')}
      pagination={paginationNode}
      isLoading={isLoading}
    />
    <PriceListCreateModal
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      name={form.name}
      onNameChange={(value) => setForm({ name: value })}
      onSubmit={createList}
      isCreating={isCreating}
      canManage={canManage}
    />
    <PriceListEditModal
      open={editingId !== null}
      onClose={() => setEditingId(null)}
      name={editing.name}
      status={editing.status ?? 'ACTIVE'}
      onNameChange={(value) => setEditing({ ...editing, name: value })}
      onStatusChange={(value) => setEditing({ ...editing, status: value })}
      instanceIdSuffix={editingId ?? 'none'}
      onSubmit={saveEdit}
      isSaving={isSaving}
      canManage={canManage}
    />
    <AddOverrideModal
      open={addOverrideOpen}
      onClose={() => setAddOverrideOpen(false)}
      form={itemForm}
      onFormChange={setItemForm}
      lists={lists}
      variants={variants}
      loadVariantOptions={loadVariantOptions}
      getVariantOption={getVariantOption}
      onSubmit={addItem}
      isAssigning={isAssigning}
      canManage={canManage}
    />
    </>
  );
}
