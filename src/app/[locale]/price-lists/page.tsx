'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatEntityLabel, formatVariantLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

type PriceListItem = {
  id: string;
  variantId: string;
  price: number | string;
};

type PriceList = {
  id: string;
  name: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  items?: PriceListItem[];
};

type Variant = {
  id: string;
  name: string;
  product?: { name?: string | null };
  defaultPrice?: number | null;
};

export default function PriceListsPage() {
  const t = useTranslations('priceListsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const permissions = getPermissionSet();
  const canManage = permissions.has('price-lists.manage');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [lists, setLists] = useState<PriceList[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [message, setMessage] = useToastState();
  const [form, setForm] = useState({ name: '' });
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
      const query = buildCursorQuery({ limit: 25, cursor });
      const [listData, variantData] = await Promise.all([
        apiFetch<PaginatedResponse<PriceList> | PriceList[]>(
          `/price-lists${query}`,
          { token },
        ),
        apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
          token,
        }),
      ]);
      const listResult = normalizePaginated(listData);
      const variantResult = normalizePaginated(variantData);
      setLists((prev) =>
        append ? [...prev, ...listResult.items] : listResult.items,
      );
      setNextCursor(listResult.nextCursor);
      setVariants(variantResult.items);
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
  }, []);

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
      setItemForm({ ...itemForm, price: '' });
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

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="nvi-page">
      <PremiumPageHeader
        eyebrow="Pricing command"
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="status-chip">Price governance</span>
            <span className="status-chip">Live</span>
          </>
        }
        actions={
          <Link
            href={`/${locale}/price-lists/wizard`}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
          >
            {t('openWizard')}
          </Link>
        }
      />
      {message ? <StatusBanner message={message} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Price lists</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{lists.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Active lists</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{activeLists}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Overrides</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{overrideCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Variant pool</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{variants.length}</p>
        </article>
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('createTitle')}</h3>
        <div className="flex flex-wrap gap-3">
          <input
            value={form.name}
            onChange={(event) => setForm({ name: event.target.value })}
            placeholder={t('namePlaceholder')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <button
            type="button"
            onClick={createList}
            className="nvi-cta inline-flex items-center gap-2 rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isCreating || !canManage}
            title={!canManage ? noAccess('title') : undefined}
          >
            {isCreating ? <Spinner size="xs" variant="orbit" /> : null}
            {isCreating ? t('creating') : common('create')}
          </button>
        </div>
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('assignTitle')}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <SmartSelect
            value={itemForm.listId}
            onChange={(value) => setItemForm({ ...itemForm, listId: value })}
            options={lists.map((list) => ({
              value: list.id,
              label: list.name,
            }))}
            placeholder={t('selectList')}
            isClearable
            className="nvi-select-container"
          />
          <SmartSelect
            value={itemForm.variantId}
            onChange={(value) =>
              setItemForm({ ...itemForm, variantId: value })
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
            value={itemForm.price}
            onChange={(event) =>
              setItemForm({ ...itemForm, price: event.target.value })
            }
            placeholder={t('price')}
            type="number"
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        <button
          type="button"
          onClick={addItem}
          className="nvi-cta inline-flex items-center gap-2 rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isAssigning || !canManage}
          title={!canManage ? noAccess('title') : undefined}
        >
          {isAssigning ? <Spinner size="xs" variant="pulse" /> : null}
          {isAssigning ? t('saving') : t('savePrice')}
        </button>
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('listsTitle')}</h3>
        {lists.length === 0 ? (
          <StatusBanner message={t('empty')} />
        ) : (
          lists.map((list) => (
            <div
              key={list.id}
              className="rounded border border-gold-700/30 bg-black/40 p-3 space-y-2"
            >
              {editingId === list.id ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    value={editing.name}
                    onChange={(event) =>
                      setEditing({ ...editing, name: event.target.value })
                    }
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                  />
                  <SmartSelect
                    value={editing.status ?? 'ACTIVE'}
                    onChange={(value) =>
                      setEditing({
                        ...editing,
                        status: value as PriceList['status'],
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-gold-100">{list.name}</p>
                    <p className="text-xs text-gold-400">
                      {t('statusLabel')}: {list.status ?? 'ACTIVE'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(list)}
                    disabled={!canManage}
                    title={!canManage ? noAccess('title') : undefined}
                    className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
                  >
                    {common('edit')}
                  </button>
                </div>
              )}
              {editingId === list.id ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="nvi-cta inline-flex items-center gap-2 rounded px-3 py-1 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={isSaving || !canManage}
                    title={!canManage ? noAccess('title') : undefined}
                  >
                    {isSaving ? <Spinner size="xs" variant="grid" /> : null}
                    {isSaving ? t('saving') : common('save')}
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
              <div className="space-y-1 text-xs text-gold-400">
                {(list.items ?? []).length === 0 ? (
                  <p>{t('noOverrides')}</p>
                ) : (
                  (list.items ?? []).map((item) => {
                    const variant = variantMap.get(item.variantId);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span>
                          {formatVariantLabel(
                            {
                              id: item.variantId,
                              name: variant?.name ?? null,
                              productName: variant?.product?.name ?? null,
                            },
                            common('unknown'),
                          )}{' '}
                          · {item.price}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItem(list.id, item.id)}
                          className="inline-flex items-center gap-2 text-xs text-gold-200"
                          disabled={removingItemId === item.id || !canManage}
                          title={!canManage ? noAccess('title') : undefined}
                        >
                          {removingItemId === item.id ? (
                            <Spinner size="xs" variant="dots" />
                          ) : null}
                          {removingItemId === item.id ? t('removing') : actions('remove')}
                        </button>
                      </div>
                    );
                  })
                )}
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
