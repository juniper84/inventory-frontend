'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { confirmAction } from '@/lib/app-notifications';
import { Spinner } from '@/components/Spinner';
import { PageSkeleton } from '@/components/PageSkeleton';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  tin?: string | null;
  notes?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  priceListId?: string | null;
};

type PriceList = {
  id: string;
  name: string;
};

export default function CustomersPage() {
  const t = useTranslations('customersPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canCreate = permissions.has('customers.create');
  const canEdit = permissions.has('customers.update');
  const canAnonymize = permissions.has('customers.anonymize');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [message, setMessage] = useToastState();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    tin: '',
    notes: '',
    priceListId: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState({
    name: '',
    phone: '',
    email: '',
    tin: '',
    notes: '',
    status: 'ACTIVE' as Customer['status'],
    priceListId: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

  const load = async (cursor?: string, append = false) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    const query = buildCursorQuery({
      limit: 25,
      cursor,
      search: filters.search || undefined,
      status: filters.status || undefined,
      balanceDue: filters.balanceDue || undefined,
    });
    const customerData = await apiFetch<PaginatedResponse<Customer> | Customer[]>(
      `/customers${query}`,
      { token },
    );
    const customerResult = normalizePaginated(customerData);
    setCustomers((prev) =>
      append ? [...prev, ...customerResult.items] : customerResult.items,
    );
    setNextCursor(customerResult.nextCursor);
    const listResult = await Promise.allSettled([
      apiFetch<PaginatedResponse<PriceList> | PriceList[]>(
        '/price-lists?limit=200',
        { token },
      ),
    ]);
    if (listResult[0].status === 'fulfilled') {
      setPriceLists(normalizePaginated(listResult[0].value).items);
    } else {
      setPriceLists([]);
    }
    if (append) {
      setIsLoadingMore(false);
    } else {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load().catch((err) => setMessage(getApiErrorMessage(err, t('loadFailed'))));
  }, [filters.search, filters.status, filters.balanceDue]);

  const createCustomer = async () => {
    const token = getAccessToken();
    if (!token || !form.name.trim()) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      await apiFetch('/customers', {
        token,
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone || undefined,
          email: form.email || undefined,
          tin: form.tin || undefined,
          notes: form.notes || undefined,
          priceListId: form.priceListId || null,
        }),
      });
      setForm({
        name: '',
        phone: '',
        email: '',
        tin: '',
        notes: '',
        priceListId: '',
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

  const startEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setEditing({
      name: customer.name ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      tin: customer.tin ?? '',
      notes: customer.notes ?? '',
      status: customer.status ?? 'ACTIVE',
      priceListId: customer.priceListId ?? '',
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
      await apiFetch(`/customers/${editingId}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          name: editing.name || undefined,
          phone: editing.phone || undefined,
          email: editing.email || undefined,
          tin: editing.tin || undefined,
          notes: editing.notes || undefined,
          status: editing.status ?? undefined,
          priceListId: editing.priceListId || null,
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

  const archiveCustomer = async (customerId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setMessage(null);
    try {
      await apiFetch(`/customers/${customerId}/archive`, {
        token,
        method: 'POST',
      });
      setMessage({ action: 'delete', outcome: 'success', message: t('archived') });
      await load();
    } catch (err) {
      setMessage({
        action: 'delete',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('archiveFailed')),
      });
    }
  };

  const resolvePriceListName = (priceListId?: string | null) => {
    if (!priceListId) {
      return '—';
    }
    return priceLists.find((list) => list.id === priceListId)?.name ?? common('unknown');
  };

  const anonymizeCustomer = async (customerId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const confirmed = await confirmAction({
      title: t('anonymizeTitle'),
      message: t('anonymizeConfirm'),
      confirmText: t('anonymizeAction'),
      cancelText: common('cancel'),
    });
    if (!confirmed) {
      return;
    }
    setMessage(null);
    try {
      await apiFetch(`/customers/${customerId}/anonymize`, {
        token,
        method: 'POST',
      });
      setMessage({ action: 'update', outcome: 'success', message: t('anonymized') });
      await load();
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('anonymizeFailed')),
      });
    }
  };

  if (isLoading) {
    return <PageSkeleton title={t('title')} />;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
          <p className="text-sm text-gold-300">{t('subtitle')}</p>
        </div>
        <ViewToggle
          value={viewMode}
          onChange={setViewMode}
          labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
        />
      </div>
      <p className="text-xs text-gold-400">
        {t('sensitiveHint')}
      </p>
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
          value={filters.status}
          onChange={(value) => pushFilters({ status: value })}
          options={statusOptions}
          placeholder={common('status')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.balanceDue}
          onChange={(value) => pushFilters({ balanceDue: value })}
          options={balanceOptions}
          placeholder={common('balanceDue')}
          className="nvi-select-container"
        />
      </ListFilters>

      <div className="command-card p-6 space-y-3 nvi-reveal">
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
            value={form.tin}
            onChange={(event) => setForm({ ...form, tin: event.target.value })}
            placeholder={t('tinOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder={t('notesOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <SmartSelect
            value={form.priceListId}
            onChange={(value) => setForm({ ...form, priceListId: value })}
            options={priceLists.map((list) => ({
              value: list.id,
              label: list.name,
            }))}
            placeholder={t('defaultPriceList')}
            isClearable
            className="nvi-select-container"
          />
        </div>
        <button
          type="button"
          onClick={createCustomer}
          disabled={isCreating || !canCreate}
          title={!canCreate ? noAccess('title') : undefined}
          className="rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:opacity-70"
        >
          <span className="inline-flex items-center gap-2">
            {isCreating ? <Spinner variant="orbit" size="xs" /> : null}
            {isCreating ? t('creating') : t('createCustomer')}
          </span>
        </button>
      </div>

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('listTitle')}</h3>
        {viewMode === 'table' ? (
          customers.length === 0 ? (
            <StatusBanner message={t('empty')} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('name')}</th>
                    <th className="px-3 py-2">{t('phone')}</th>
                    <th className="px-3 py-2">{t('email')}</th>
                    <th className="px-3 py-2">{t('status')}</th>
                    <th className="px-3 py-2">{t('defaultPriceList')}</th>
                    <th className="px-3 py-2">{t('notesOptional')}</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2 font-semibold">{customer.name}</td>
                      <td className="px-3 py-2">{customer.phone || '—'}</td>
                      <td className="px-3 py-2">{customer.email || '—'}</td>
                      <td className="px-3 py-2">{customer.status ?? 'ACTIVE'}</td>
                      <td className="px-3 py-2">
                        {resolvePriceListName(customer.priceListId)}
                      </td>
                      <td className="px-3 py-2">{customer.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : customers.length === 0 ? (
          <StatusBanner message={t('empty')} />
        ) : (
          customers.map((customer) => (
            <div
              key={customer.id}
              className="rounded border border-gold-700/30 bg-black/40 p-3"
            >
              {editingId === customer.id ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <input
                    value={editing.name}
                    onChange={(event) =>
                      setEditing({ ...editing, name: event.target.value })
                    }
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <input
                    value={editing.phone}
                    onChange={(event) =>
                      setEditing({ ...editing, phone: event.target.value })
                    }
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <input
                    value={editing.email}
                    onChange={(event) =>
                      setEditing({ ...editing, email: event.target.value })
                    }
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <input
                    value={editing.tin}
                    onChange={(event) =>
                      setEditing({ ...editing, tin: event.target.value })
                    }
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <input
                    value={editing.notes}
                    onChange={(event) =>
                      setEditing({ ...editing, notes: event.target.value })
                    }
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <SmartSelect
                    value={editing.priceListId}
                    onChange={(value) =>
                      setEditing({ ...editing, priceListId: value })
                    }
                    options={priceLists.map((list) => ({
                      value: list.id,
                      label: list.name,
                    }))}
                    placeholder={t('defaultPriceList')}
                    isClearable
                    className="nvi-select-container"
                  />
                  <SmartSelect
                    value={editing.status ?? 'ACTIVE'}
                    onChange={(value) =>
                      setEditing({
                        ...editing,
                        status: value as Customer['status'],
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
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm text-gold-100">{customer.name}</p>
                    <p className="text-xs text-gold-400">
                      {customer.phone || t('noPhone')} ·{' '}
                      {customer.email || t('noEmail')}
                    </p>
                    <p className="text-xs text-gold-400">
                      {t('tinLabel', { value: customer.tin || '—' })} ·{' '}
                      {t('statusLabel', { value: customer.status ?? 'ACTIVE' })}
                    </p>
                    {customer.notes ? (
                      <p className="text-xs text-gold-400">{customer.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(customer)}
                      disabled={!canEdit}
                      title={!canEdit ? noAccess('title') : undefined}
                      className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
                    >
                      {common('edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => archiveCustomer(customer.id)}
                      disabled={!canEdit}
                      title={!canEdit ? noAccess('title') : undefined}
                      className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
                    >
                      {t('archive')}
                    </button>
                    <button
                      type="button"
                      onClick={() => anonymizeCustomer(customer.id)}
                      disabled={!canAnonymize}
                      title={!canAnonymize ? noAccess('title') : undefined}
                      className="rounded border border-red-500/40 px-3 py-2 text-xs text-red-100"
                    >
                      {t('anonymizeAction')}
                    </button>
                  </div>
                </div>
              )}
              {editingId === customer.id ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={isSaving || !canEdit}
                    title={!canEdit ? noAccess('title') : undefined}
                    className="rounded bg-gold-500 px-3 py-1 text-xs font-semibold text-black disabled:opacity-70"
                  >
                    <span className="inline-flex items-center gap-2">
                      {isSaving ? <Spinner variant="grid" size="xs" /> : null}
                      {isSaving ? t('saving') : common('save')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                  >
                    {common('cancel')}
                  </button>
                </div>
              ) : null}
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
              {isLoadingMore ? <Spinner variant="orbit" size="xs" /> : null}
              {isLoadingMore ? actions('loading') : actions('loadMore')}
            </span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
