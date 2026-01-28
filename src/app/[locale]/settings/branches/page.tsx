'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { PageSkeleton } from '@/components/PageSkeleton';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';

type Branch = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  status?: string | null;
  priceListId?: string | null;
};

type PriceList = {
  id: string;
  name: string;
};

export default function BranchesPage() {
  const t = useTranslations('branchesPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('settings.write');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [message, setMessage] = useToastState();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    priceListId: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState({
    name: '',
    address: '',
    phone: '',
    priceListId: '',
  });

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
    const query = buildCursorQuery({ limit: 25, cursor });
    const branchData = await apiFetch<PaginatedResponse<Branch> | Branch[]>(
      `/branches${query}`,
      { token },
    );
    const { items, nextCursor: cursorNext } = normalizePaginated(branchData);
    setBranches((prev) => (append ? [...prev, ...items] : items));
    setNextCursor(cursorNext);
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
  }, []);

  const createBranch = async () => {
    const token = getAccessToken();
    if (!token || !form.name.trim()) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      await apiFetch('/branches', {
        token,
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address || undefined,
          phone: form.phone || undefined,
          priceListId: form.priceListId || null,
        }),
      });
      setForm({ name: '', address: '', phone: '', priceListId: '' });
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

  const startEdit = (branch: Branch) => {
    setEditingId(branch.id);
    setEditing({
      name: branch.name ?? '',
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      priceListId: branch.priceListId ?? '',
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
      await apiFetch(`/branches/${editingId}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          name: editing.name || undefined,
          address: editing.address || undefined,
          phone: editing.phone || undefined,
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

  if (isLoading) {
    return <PageSkeleton title={t('title')} />;
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
          {t('title')}
        </h2>
        <p className="text-sm text-[color:var(--muted)]">{t('subtitle')}</p>
      </div>
      {message ? <StatusBanner message={message} /> : null}

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('addBranch')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder={t('branchName')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.address}
            onChange={(event) =>
              setForm({ ...form, address: event.target.value })
            }
            placeholder={t('addressOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            placeholder={t('phoneOptional')}
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
          onClick={createBranch}
          disabled={isCreating || !canWrite}
          title={!canWrite ? noAccess('title') : undefined}
          className="rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:opacity-70"
        >
          <span className="inline-flex items-center gap-2">
            {isCreating ? <Spinner variant="orbit" size="xs" /> : null}
            {isCreating ? t('creating') : t('createBranch')}
          </span>
        </button>
      </div>

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('listTitle')}</h3>
        {branches.length === 0 ? (
          <StatusBanner message={t('empty')} />
        ) : (
          <div className="space-y-2 nvi-stagger">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="rounded border border-gold-700/30 bg-black/40 p-3"
            >
              {editingId === branch.id ? (
                <div className="grid gap-2 md:grid-cols-4">
                  <input
                    value={editing.name}
                    onChange={(event) =>
                      setEditing({ ...editing, name: event.target.value })
                    }
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <input
                    value={editing.address}
                    onChange={(event) =>
                      setEditing({ ...editing, address: event.target.value })
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
                </div>
              ) : (
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm text-gold-100">{branch.name}</p>
                    <p className="text-xs text-gold-400">
                      {branch.address || t('noAddress')}
                    </p>
                    <p className="text-xs text-gold-400">
                      {branch.phone || t('noPhone')}
                    </p>
                    <p className="text-xs text-gold-500">
                      {t('priceListLabel')}{' '}
                      {branch.priceListId
                        ? priceLists.find((list) => list.id === branch.priceListId)
                            ?.name ?? t('priceListCustom')
                        : t('priceListDefault')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(branch)}
                    disabled={!canWrite}
                    title={!canWrite ? noAccess('title') : undefined}
                    className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
                  >
                    {common('edit')}
                  </button>
                </div>
              )}
              {editingId === branch.id ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={isSaving || !canWrite}
                    title={!canWrite ? noAccess('title') : undefined}
                    className="rounded bg-gold-500 px-3 py-1 text-xs font-semibold text-black disabled:opacity-70"
                  >
                    <span className="inline-flex items-center gap-2">
                      {isSaving ? <Spinner variant="dots" size="xs" /> : null}
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
          ))}
          </div>
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
