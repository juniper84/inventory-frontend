'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
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

type Category = {
  id: string;
  name: string;
  parentId?: string | null;
  status: string;
};

export default function CategoriesPage() {
  const t = useTranslations('categoriesPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('catalog.write');
  const [categories, setCategories] = useState<Category[]>([]);
  const [message, setMessage] = useToastState();
  const [form, setForm] = useState({ name: '', parentId: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState({ name: '', parentId: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
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
    });
    const data = await apiFetch<PaginatedResponse<Category> | Category[]>(
      `/categories${query}`,
      { token },
    );
    const result = normalizePaginated(data);
    setCategories((prev) =>
      append ? [...prev, ...result.items] : result.items,
    );
    setNextCursor(result.nextCursor);
    if (append) {
      setIsLoadingMore(false);
    } else {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => setMessage(t('loadFailed')));
  }, [filters.search, filters.status]);

  const createCategory = async () => {
    const token = getAccessToken();
    if (!token || !form.name) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      await apiFetch('/categories', {
        token,
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          parentId: form.parentId || undefined,
        }),
      });
      setForm({ name: '', parentId: '' });
      setMessage({ action: 'create', outcome: 'success', message: t('created') });
      await load();
    } catch (err) {
      setMessage({ action: 'create', outcome: 'failure', message: t('createFailed') });
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setEditingForm({
      name: category.name,
      parentId: category.parentId || '',
    });
  };

  const saveEdit = async () => {
    const token = getAccessToken();
    if (!token || !editingId || !editingForm.name) {
      return;
    }
    setMessage(null);
    setIsSaving(true);
    try {
      await apiFetch(`/categories/${editingId}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          name: editingForm.name,
          parentId: editingForm.parentId || undefined,
        }),
      });
      setEditingId(null);
      setEditingForm({ name: '', parentId: '' });
      setMessage({ action: 'update', outcome: 'success', message: t('updated') });
      await load();
    } catch (err) {
      setMessage({ action: 'update', outcome: 'failure', message: t('updateFailed') });
    } finally {
      setIsSaving(false);
    }
  };

  const getParentName = (parentId?: string | null) => {
    if (!parentId) {
      return '—';
    }
    return (
      categories.find((cat) => cat.id === parentId)?.name || common('unknown')
    );
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
      </ListFilters>

      <div className="command-card p-4 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('newCategory')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(event) =>
              setForm({ ...form, name: event.target.value })
            }
            placeholder={t('categoryName')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <SmartSelect
            value={form.parentId}
            onChange={(value) => setForm({ ...form, parentId: value })}
            options={categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
            placeholder={t('noParent')}
            isClearable
            className="nvi-select-container"
          />
        </div>
        <button
          onClick={createCategory}
          disabled={isCreating || !canWrite}
          title={!canWrite ? noAccess('title') : undefined}
          className="rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:opacity-70"
        >
          <span className="inline-flex items-center gap-2">
            {isCreating ? <Spinner variant="orbit" size="xs" /> : null}
            {isCreating ? t('creating') : t('createCategory')}
          </span>
        </button>
      </div>

      <div className="command-card p-4 nvi-reveal">
        {viewMode === 'table' ? (
          <div className="overflow-auto">
            {!categories.length ? (
              <StatusBanner message={t('empty')} />
            ) : (
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('name')}</th>
                    <th className="px-3 py-2">{t('parent')}</th>
                    <th className="px-3 py-2">{common('status')}</th>
                    <th className="px-3 py-2">{common('edit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2 font-semibold">{category.name}</td>
                      <td className="px-3 py-2">{getParentName(category.parentId)}</td>
                      <td className="px-3 py-2">{category.status}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => startEdit(category)}
                          disabled={!canWrite}
                          title={!canWrite ? noAccess('title') : undefined}
                          className="text-xs text-gold-300 hover:text-gold-100 disabled:opacity-70"
                        >
                          {common('edit')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {!categories.length ? (
              <StatusBanner message={t('empty')} />
            ) : null}
            {categories.map((category) => (
              <div
                key={category.id}
                className="rounded border border-gold-700/30 bg-black/60 p-3"
              >
                {editingId === category.id ? (
                  <div className="space-y-2">
                    <input
                      value={editingForm.name}
                      onChange={(event) =>
                        setEditingForm({
                          ...editingForm,
                          name: event.target.value,
                        })
                      }
                      className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                    />
                    <SmartSelect
                      value={editingForm.parentId}
                      onChange={(value) =>
                        setEditingForm({
                          ...editingForm,
                          parentId: value,
                        })
                      }
                      options={categories
                        .filter((parent) => parent.id !== category.id)
                        .map((parent) => ({
                          value: parent.id,
                          label: parent.name,
                        }))}
                      placeholder={t('noParent')}
                      isClearable
                      className="nvi-select-container"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        disabled={isSaving || !canWrite}
                        title={!canWrite ? noAccess('title') : undefined}
                        className="rounded bg-gold-500 px-3 py-1 text-sm font-semibold text-black disabled:opacity-70"
                      >
                        <span className="inline-flex items-center gap-2">
                          {isSaving ? <Spinner variant="dots" size="xs" /> : null}
                          {isSaving ? t('saving') : common('save')}
                        </span>
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded border border-gold-700/50 px-3 py-1 text-sm text-gold-100"
                      >
                        {common('cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-gold-300">{t('name')}</p>
                      <p className="text-base text-gold-100">{category.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gold-300">{t('parent')}</p>
                      <p className="text-sm text-gold-100">
                        {getParentName(category.parentId)}
                      </p>
                    </div>
                    <button
                      onClick={() => startEdit(category)}
                      disabled={!canWrite}
                      title={!canWrite ? noAccess('title') : undefined}
                      className="rounded border border-gold-700/50 px-3 py-1 text-sm text-gold-100"
                    >
                      {common('edit')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {nextCursor ? (
          <button
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
