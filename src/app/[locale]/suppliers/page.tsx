'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
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
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';
import { useFormatDate } from '@/lib/business-context';

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

export default function SuppliersPage() {
  const t = useTranslations('suppliersPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const { formatDate } = useFormatDate();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('suppliers.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [message, setMessage] = useToastState();
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    balanceDue: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

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
    () => suppliers.filter((supplier) => supplier.status === 'ACTIVE').length,
    [suppliers],
  );
  const inactiveSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.status !== 'ACTIVE').length,
    [suppliers],
  );
  const withLeadTime = useMemo(
    () => suppliers.filter((supplier) => Number(supplier.leadTimeDays ?? 0) > 0).length,
    [suppliers],
  );

  const getSupplierStatusStyle = (status: string): string => {
    switch (status) {
      case 'ACTIVE': return 'border-green-500/50 bg-green-500/10 text-green-200';
      case 'INACTIVE': return 'border-amber-500/50 bg-amber-500/10 text-amber-200';
      case 'ARCHIVED': return 'border-gray-600/50 bg-gray-900/40 text-gray-400';
      default: return 'border-gold-700/50 bg-black/40 text-gold-400';
    }
  };

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    leadTimeDays: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const formatRelatedLabel = (item: Purchase | PurchaseOrder) => {
    const date = item.createdAt
      ? formatDate(item.createdAt)
      : null;
    return `${date ?? formatEntityLabel({ id: item.id }, common('unknown'))} • ${
      item.status
    }`;
  };

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
        limit: 25,
        cursor,
        search: filters.search || undefined,
        status: filters.status || undefined,
        balanceDue: filters.balanceDue || undefined,
      });
      const data = await apiFetch<PaginatedResponse<Supplier> | Supplier[]>(
        `/suppliers${query}`,
        { token },
      );
      const result = normalizePaginated(data);
      setSuppliers((prev) =>
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
    load();
  }, [filters.search, filters.status, filters.balanceDue]);

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
    setEditingId(supplier.id);
    setEditing({ ...supplier });
  };

  const saveEdit = async () => {
    const token = getAccessToken();
    if (!token || !editingId || !editing) {
      return;
    }
    setMessage(null);
    setIsSaving(true);
    try {
      await apiFetch(`/suppliers/${editingId}`, {
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
      setEditingId(null);
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

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="nvi-page">
      <PremiumPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="status-chip">{t('badgeVendorOps')}</span>
            <span className="status-chip">{t('badgeLive')}</span>
          </>
        }
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
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiSuppliers')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{suppliers.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiActive')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{activeSuppliers}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiNeedsAttention')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{inactiveSuppliers}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiLeadTimeSet')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{withLeadTime}</p>
        </article>
      </div>
      <div className="command-card nvi-reveal nvi-panel p-4">
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
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('addTitle')}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder={t('name')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            placeholder={t('phoneOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder={t('emailOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.address}
            onChange={(event) =>
              setForm({ ...form, address: event.target.value })
            }
            placeholder={t('addressOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 md:col-span-2"
          />
          <input
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder={t('notesOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.leadTimeDays}
            onChange={(event) =>
              setForm({ ...form, leadTimeDays: event.target.value })
            }
            placeholder={t('leadTimeDays')}
            type="number"
            min={0}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        <button
          type="button"
          onClick={createSupplier}
          className="nvi-cta inline-flex items-center gap-2 rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isCreating || !canWrite}
          title={!canWrite ? noAccess('title') : undefined}
        >
          {isCreating ? <Spinner size="xs" variant="orbit" /> : null}
          {isCreating ? t('creating') : t('createSupplier')}
        </button>
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('listTitle')}</h3>
        {viewMode === 'table' ? (
          suppliers.length === 0 ? (
            <StatusBanner message={t('noSuppliers')} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[640px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('name')}</th>
                    <th className="px-3 py-2">{t('phone')} / {t('email')}</th>
                    <th className="px-3 py-2">{t('status')}</th>
                    <th className="px-3 py-2">{t('leadTimeDays')}</th>
                    <th className="px-3 py-2">{t('notesOptional')}</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-gold-100">{supplier.name}</p>
                      </td>
                      <td className="px-3 py-2">
                        {supplier.phone ? <p className="text-gold-300">{supplier.phone}</p> : null}
                        {supplier.email ? <p className="text-[11px] text-gold-500">{supplier.email}</p> : null}
                        {!supplier.phone && !supplier.email ? <span className="text-gold-600">—</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-2 py-0.5 text-[11px] ${getSupplierStatusStyle(supplier.status)}`}>
                          {supplier.status === 'ACTIVE'
                            ? t('statusActive')
                            : supplier.status === 'INACTIVE'
                              ? t('statusInactive')
                              : t('statusArchived')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gold-300">
                        {supplier.leadTimeDays
                          ? t('leadTimeLabel', { days: supplier.leadTimeDays })
                          : '—'}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-xs text-gold-400">
                        {supplier.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : suppliers.length === 0 ? (
          <StatusBanner message={t('noSuppliers')} />
        ) : (
          suppliers.map((supplier) => (
            <div
              key={supplier.id}
              className={`rounded border bg-black/40 p-4 transition-colors ${editingId === supplier.id ? 'border-gold-500/50' : 'border-gold-700/30'}`}
            >
              {editingId === supplier.id && editing ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <input
                    value={editing.name}
                    onChange={(event) =>
                      setEditing({ ...editing, name: event.target.value })
                    }
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <input
                    value={editing.phone ?? ''}
                    onChange={(event) =>
                      setEditing({ ...editing, phone: event.target.value })
                    }
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <input
                    value={editing.email ?? ''}
                    onChange={(event) =>
                      setEditing({ ...editing, email: event.target.value })
                    }
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <input
                    value={editing.address ?? ''}
                    onChange={(event) =>
                      setEditing({ ...editing, address: event.target.value })
                    }
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 md:col-span-2"
                  />
                  <input
                    value={editing.notes ?? ''}
                    onChange={(event) =>
                      setEditing({ ...editing, notes: event.target.value })
                    }
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <input
                    value={editing.leadTimeDays ?? ''}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        leadTimeDays: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                    placeholder={t('leadTimeDays')}
                    type="number"
                    min={0}
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <SmartSelect
                    instanceId={`supplier-${supplier.id}-status`}
                    value={editing.status}
                    onChange={(value) =>
                      setEditing({
                        ...editing,
                        status: value as Supplier['status'],
                      })
                    }
                    options={[
                      { value: 'ACTIVE', label: t('statusActive') },
                      { value: 'INACTIVE', label: t('statusInactive') },
                      { value: 'ARCHIVED', label: t('statusArchived') },
                    ]}
                    className="nvi-select-container"
                  />
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gold-100">{supplier.name}</p>
                      <span className={`rounded border px-2 py-0.5 text-[11px] ${getSupplierStatusStyle(supplier.status)}`}>
                        {supplier.status === 'ACTIVE'
                          ? t('statusActive')
                          : supplier.status === 'INACTIVE'
                            ? t('statusInactive')
                            : t('statusArchived')}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gold-400">
                      {supplier.phone ? <span>{supplier.phone}</span> : null}
                      {supplier.email ? <span>{supplier.email}</span> : null}
                      {!supplier.phone && !supplier.email ? <span>{t('noContact')}</span> : null}
                      {supplier.leadTimeDays && supplier.leadTimeDays > 0 ? (
                        <span className="rounded bg-gold-900/20 px-2 py-0.5 text-[11px] text-gold-300">
                          {t('leadTimeLabel', { days: supplier.leadTimeDays })}
                        </span>
                      ) : (
                        <span className="text-gold-600">{t('leadTimeMissing')}</span>
                      )}
                    </div>
                  </div>
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => startEdit(supplier)}
                      disabled={!canWrite}
                      title={!canWrite ? noAccess('title') : undefined}
                      className="shrink-0 rounded border border-gold-700/50 px-3 py-1.5 text-xs text-gold-100 hover:border-gold-500/60"
                    >
                      {actions('edit')}
                    </button>
                  ) : null}
                </div>
              )}
              <button
                type="button"
                onClick={() => toggleRelated(supplier.id)}
                className="mt-3 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
              >
                {relatedMap[supplier.id]?.open
                  ? t('hideActivity')
                  : t('viewActivity')}
              </button>
              {relatedMap[supplier.id]?.open ? (
                <div className="mt-3 rounded border border-gold-700/40 bg-black/60 p-3 text-xs text-gold-200">
                  {relatedMap[supplier.id]?.loading ? (
                    <div className="flex items-center gap-2 text-xs text-gold-300">
                      <Spinner size="xs" variant="grid" /> {t('loadingActivity')}
                    </div>
                  ) : relatedMap[supplier.id]?.error ? (
                    <p>{relatedMap[supplier.id]?.error}</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-gold-100">{t('recentPurchaseOrders')}</p>
                        {relatedMap[supplier.id]?.purchaseOrders.length ? (
                          relatedMap[supplier.id]?.purchaseOrders.map((po) => (
                            <div key={po.id}>
                              {formatRelatedLabel(po)}
                            </div>
                          ))
                        ) : (
                          <p className="text-gold-400">{t('noPurchaseOrders')}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-gold-100">{t('recentPurchases')}</p>
                        {relatedMap[supplier.id]?.purchases.length ? (
                          relatedMap[supplier.id]?.purchases.map((purchase) => (
                            <div key={purchase.id}>
                              {formatRelatedLabel(purchase)}
                            </div>
                          ))
                        ) : (
                          <p className="text-gold-400">{t('noPurchases')}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              {editingId === supplier.id ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="inline-flex items-center gap-2 rounded bg-gold-500 px-3 py-1 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={isSaving || !canWrite}
                    title={!canWrite ? noAccess('title') : undefined}
                  >
                    {isSaving ? <Spinner size="xs" variant="pulse" /> : null}
                    {isSaving ? t('saving') : actions('save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEditing(null);
                    }}
                    className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                  >
                    {actions('cancel')}
                  </button>
                </div>
              ) : null}
              <div className="mt-3">
                <RelatedNotesPanel resourceType="Supplier" resourceId={supplier.id} />
              </div>
            </div>
          ))
        )}
        {nextCursor ? (
          <button
            type="button"
            onClick={() => load(nextCursor, true)}
            disabled={isLoadingMore}
            className="rounded border border-gold-500/60 px-4 py-2 text-sm text-gold-200 disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              {isLoadingMore ? <Spinner size="xs" variant="orbit" /> : null}
              {isLoadingMore ? actions('loading') : actions('loadMore')}
            </span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
