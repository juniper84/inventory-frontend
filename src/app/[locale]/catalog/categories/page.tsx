'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { StatusBadge, CollapsibleSection, ActionButtons, ProgressBar, SortableTableHeader, SortDirection, Icon, Card, TextInput, EmptyState, ListPage } from '@/components/ui';
import { Banner } from '@/components/notifications/Banner';
import { Checkbox } from '@/components/Checkbox';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';

import { PaginationControls } from '@/components/PaginationControls';

type Category = {
  id: string;
  name: string;
  parentId?: string | null;
  status: string;
  _count?: { products: number };
};

export default function CategoriesPage() {
  const t = useTranslations('categoriesPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('catalog.write');
  const [categories, setCategories] = useState<Category[]>([]);
  const [message, setMessage] = useState<{ action: string; outcome: string; message: string } | null>(null);
  const [form, setForm] = useState({ name: '', parentId: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState({ name: '', parentId: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState<number | null>(null);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({ 1: null });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);


  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'ACTIVE', label: common('statusActive') },
      { value: 'INACTIVE', label: common('statusInactive') },
      { value: 'ARCHIVED', label: common('statusArchived') },
    ],
    [common],
  );
  const activeCount = useMemo(
    () => categories.filter((category) => category.status === 'ACTIVE').length,
    [categories],
  );
  const parentCount = useMemo(
    () => categories.filter((category) => !category.parentId).length,
    [categories],
  );
  const maxProducts = useMemo(
    () => Math.max(1, ...categories.map((c) => c._count?.products ?? 0)),
    [categories],
  );

  const handleSort = (key: string, dir: SortDirection) => {
    setSortKey(dir ? key : null);
    setSortDir(dir);
  };

  const sortedCategories = useMemo(() => {
    if (!sortKey || !sortDir) return categories;
    return [...categories].sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortKey === 'products') {
        va = a._count?.products ?? 0;
        vb = b._count?.products ?? 0;
      } else {
        va = (a as Record<string, unknown>)[sortKey] as string ?? '';
        vb = (b as Record<string, unknown>)[sortKey] as string ?? '';
      }
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [categories, sortKey, sortDir]);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);



  const load = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) { setIsLoading(false); return; }
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor = targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
      });
      const data = await apiFetch<PaginatedResponse<Category> | Category[]>(
        `/categories${query}`,
        { token },
      );
      const result = normalizePaginated(data);
      setCategories(result.items);
      setNextCursor(result.nextCursor);
      if (typeof result.total === 'number') setTotal(result.total);
      setPage(targetPage);
      setPageCursors(prev => {
        const next: Record<number, string | null> = targetPage === 1 ? { 1: null } : { ...prev };
        if (result.nextCursor) next[targetPage + 1] = result.nextCursor;
        return next;
      });
    } catch (err) {
      setMessage({ action: 'load', outcome: 'failure', message: getApiErrorMessage(err, t('loadFailed')) });
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, filters.search, filters.status, t]);

  useEffect(() => {
    load(1);
  }, [load]);

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
      setFormOpen(false);
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

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setEditingForm({
      name: category.name,
      parentId: category.parentId || '',
    });
    // Switch to card view if in table — edit form only renders on cards
    if (viewMode === 'table') {
      setViewMode('cards');
    }
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
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('updateFailed')),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getParentName = (parentId?: string | null) => {
    if (!parentId) {
      return null;
    }
    return (
      categories.find((cat) => cat.id === parentId)?.name || common('unknown')
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const bulkStatus = async (status: string) => {
    const token = getAccessToken();
    if (!token || selectedIds.size === 0) return;
    setIsBulkLoading(true);
    setMessage(null);
    try {
      await apiFetch('/categories/bulk-status', {
        token,
        method: 'POST',
        body: JSON.stringify({ categoryIds: Array.from(selectedIds), status }),
      });
      setSelectedIds(new Set());
      setMessage({ action: 'update', outcome: 'success', message: t('bulkStatusSuccess') });
      await load();
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('bulkStatusFailed')),
      });
    } finally {
      setIsBulkLoading(false);
    }
  };

  /* ── KPI strip ── */
  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      <Card padding="md" as="article">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/10">
            <Icon name="FolderTree" size={20} className="text-gold-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiCategories')}</p>
            <p className="text-2xl font-bold text-[var(--nvi-text)]">{categories.length}</p>
          </div>
        </div>
      </Card>
      <Card padding="md" as="article">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <Icon name="CircleCheck" size={20} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiActive')}</p>
            <p className="text-2xl font-bold text-[var(--nvi-text)]">{activeCount}</p>
          </div>
        </div>
      </Card>
      <Card padding="md" as="article">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
            <Icon name="GitBranch" size={20} className="text-blue-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiParentGroups')}</p>
            <p className="text-2xl font-bold text-[var(--nvi-text)]">{parentCount}</p>
          </div>
        </div>
      </Card>
      <Card padding="md" as="article">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <Icon name="ListFilter" size={20} className="text-amber-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiFilteredStatus')}</p>
            <p className="text-2xl font-bold text-[var(--nvi-text)]">{filters.status || common('allStatuses')}</p>
          </div>
        </div>
      </Card>
    </div>
  );

  /* ── Filters ── */
  const filtersBar = (
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
        instanceId="categories-filter-status"
        value={filters.status}
        onChange={(value) => pushFilters({ status: value })}
        options={statusOptions}
        placeholder={common('status')}
        className="nvi-select-container"
      />
    </ListFilters>
  );

  /* ── Create form + Bulk bar ── */
  const beforeContent = (
    <>
      <CollapsibleSection title={t('createCategory')} isOpen={formOpen} onToggle={setFormOpen} storageKey="nvi.categories.form">
        <Card padding="lg" className="space-y-4 nvi-slide-in-bottom">
          <TextInput
            label={t('categoryName')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Beverages"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)] mb-1.5">{t('noParent')}</p>
            <SmartSelect
              instanceId="category-form-parent"
              value={form.parentId}
              onChange={(value) => setForm({ ...form, parentId: value })}
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              placeholder="Leave empty for top-level"
              isClearable
              className="nvi-select-container"
            />
          </div>
          <button
            type="button"
            onClick={createCategory}
            disabled={isCreating || !canWrite}
            title={!canWrite ? noAccess('title') : undefined}
            className="nvi-cta nvi-press rounded-xl px-4 py-2 font-semibold text-black disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              {isCreating ? <Spinner variant="orbit" size="xs" /> : <Icon name="Plus" size={14} />}
              {isCreating ? t('creating') : t('createCategory')}
            </span>
          </button>
        </Card>
      </CollapsibleSection>

      {selectedIds.size > 0 ? (() => {
        const selectedCategories = categories.filter((c) => selectedIds.has(c.id));
        const allActive = selectedCategories.every((c) => c.status === 'ACTIVE');
        const allInactive = selectedCategories.every((c) => c.status === 'INACTIVE');
        const allArchived = selectedCategories.every((c) => c.status === 'ARCHIVED');
        return (
          <Card padding="sm" glow={false} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--nvi-text)]">
              <span key={selectedIds.size} className="font-bold nvi-pop">{selectedIds.size}</span>{' '}
              {t('bulkSelected', { count: selectedIds.size })}
            </p>
            <div className="flex items-center gap-2">
              {!allActive ? (
                <button
                  type="button"
                  onClick={() => bulkStatus('ACTIVE')}
                  disabled={isBulkLoading || !canWrite}
                  className="nvi-press rounded-xl border border-emerald-500/50 px-3 py-1.5 text-xs font-medium text-emerald-300 disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  {isBulkLoading ? <Spinner variant="dots" size="xs" /> : <Icon name="CircleCheck" size={14} />}
                  {t('bulkActivate')}
                </button>
              ) : null}
              {!allInactive && !allArchived ? (
                <button
                  type="button"
                  onClick={() => bulkStatus('INACTIVE')}
                  disabled={isBulkLoading || !canWrite}
                  className="nvi-press rounded-xl border border-amber-500/50 px-3 py-1.5 text-xs font-medium text-amber-300 disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  {isBulkLoading ? <Spinner variant="dots" size="xs" /> : <Icon name="CircleOff" size={14} />}
                  {t('bulkDeactivate')}
                </button>
              ) : null}
              {!allArchived ? (
                <button
                  type="button"
                  onClick={() => bulkStatus('ARCHIVED')}
                  disabled={isBulkLoading || !canWrite}
                  className="nvi-press rounded-xl border border-red-500/50 px-3 py-1.5 text-xs font-medium text-red-300 disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  {isBulkLoading ? <Spinner variant="dots" size="xs" /> : <Icon name="Archive" size={14} />}
                  {t('bulkArchive')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="ml-2 nvi-press rounded-xl border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text-muted)]"
              >
                {common('cancel')}
              </button>
            </div>
          </Card>
        );
      })() : null}
    </>
  );

  /* ── Card view ── */
  const cardView = (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 nvi-stagger">
      {sortedCategories.map((category) => (
        <div key={category.id}>
          {editingId === category.id ? (
            <Card padding="md" className="ring-2 ring-gold-500/30">
              <div className="space-y-3 nvi-slide-in-bottom">
                <TextInput
                  label={t('categoryName')}
                  value={editingForm.name}
                  onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })}
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)] mb-1.5">{t('parent')}</p>
                  <SmartSelect
                    instanceId={`category-edit-parent-${category.id}`}
                    value={editingForm.parentId}
                    onChange={(value) => setEditingForm({ ...editingForm, parentId: value })}
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
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={isSaving || !canWrite}
                    title={!canWrite ? noAccess('title') : undefined}
                    className="nvi-cta nvi-press rounded-xl px-4 py-2 text-sm font-semibold text-black disabled:opacity-70 inline-flex items-center gap-1.5"
                  >
                    {isSaving ? <Spinner variant="dots" size="xs" /> : <Icon name="Check" size={14} />}
                    {isSaving ? t('saving') : common('save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="nvi-press rounded-xl border border-[var(--nvi-border)] px-4 py-2 text-sm text-[var(--nvi-text)] inline-flex items-center gap-1.5"
                  >
                    <Icon name="X" size={14} />
                    {common('cancel')}
                  </button>
                </div>
              </div>
            </Card>
          ) : (
            <Card padding="md" className="nvi-card-hover group">
              <div className="flex items-start gap-4">
                {/* Left: Visual icon container */}
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold-500/8 group-hover:bg-gold-500/15 transition-colors">
                  <Icon name={category.parentId ? 'FolderOpen' : 'Folder'} size={24} className="text-gold-400" />
                </div>

                {/* Center: Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedIds.has(category.id)}
                      onChange={() => toggleSelect(category.id)}
                    />
                    <h3 className="text-base font-bold text-[var(--nvi-text)] truncate">{category.name}</h3>
                    <StatusBadge status={category.status} size="xs" />
                  </div>

                  {/* Hierarchy breadcrumb */}
                  {getParentName(category.parentId) ? (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--nvi-text-muted)]">
                      <Icon name="GitBranch" size={12} />
                      {getParentName(category.parentId)}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-gold-500/60 italic">Top-level category</p>
                  )}

                  {/* Product count as visual bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[var(--nvi-text-muted)]">{t('products')}</span>
                      <span className="font-semibold text-[var(--nvi-text)]">{category._count?.products ?? 0}</span>
                    </div>
                    <ProgressBar value={category._count?.products ?? 0} max={maxProducts} height={4} />
                  </div>
                </div>

                {/* Right: Action */}
                <ActionButtons
                  actions={[
                    {
                      key: 'edit',
                      icon: <Icon name="Pencil" size={14} />,
                      label: common('edit'),
                      onClick: () => startEdit(category),
                      disabled: !canWrite,
                    },
                  ]}
                  size="xs"
                />
              </div>
            </Card>
          )}
        </div>
      ))}
    </div>
  );

  /* ── Table view ── */
  const tableView = (
    <Card padding="md">
      <div className="overflow-auto">
        <table className="min-w-[720px] w-full text-left text-sm text-[var(--nvi-text)]">
          <thead className="text-xs uppercase text-[var(--nvi-text-muted)]">
            <tr>
              <th className="w-8 px-3 py-2">
                <Checkbox
                  checked={categories.length > 0 && selectedIds.size === categories.length}
                  onChange={() => {
                    if (selectedIds.size === categories.length) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(categories.map((c) => c.id)));
                    }
                  }}
                />
              </th>
              <SortableTableHeader label={t('name')} sortKey="name" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <SortableTableHeader label={t('parent')} sortKey="parentId" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <SortableTableHeader label={t('products')} sortKey="products" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <SortableTableHeader label={common('status')} sortKey="status" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <th className="px-3 py-2">{common('edit')}</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="border-t border-[var(--nvi-border)]">
                <td className="px-3 py-2">
                  <Checkbox
                    checked={selectedIds.has(category.id)}
                    onChange={() => toggleSelect(category.id)}
                  />
                </td>
                <td className="px-3 py-2 font-bold truncate max-w-[200px]">{category.name}</td>
                <td className="px-3 py-2">
                  {getParentName(category.parentId) ? (
                    <span className="inline-flex items-center gap-1.5 text-[var(--nvi-text-muted)]">
                      <Icon name="GitBranch" size={12} />
                      {getParentName(category.parentId)}
                    </span>
                  ) : (
                    <span className="text-[var(--nvi-text-muted)]">&mdash;</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-[var(--nvi-text)]">{category._count?.products ?? 0}</span>
                    <ProgressBar value={category._count?.products ?? 0} max={maxProducts} height={4} className="w-20" />
                  </div>
                </td>
                <td className="px-3 py-2"><StatusBadge status={category.status} size="xs" /></td>
                <td className="px-3 py-2">
                  <ActionButtons
                    actions={[
                      {
                        key: 'edit',
                        icon: <Icon name="Pencil" size={14} />,
                        label: common('edit'),
                        onClick: () => startEdit(category),
                        disabled: !canWrite,
                      },
                    ]}
                    size="xs"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      eyebrow={t('eyebrow')}
      badges={
        <>
          <span className="status-chip">{t('badgeTaxonomy')}</span>
          <span className="status-chip">{t('badgeLive')}</span>
        </>
      }
      headerActions={
        <ViewToggle
          value={viewMode}
          onChange={setViewMode}
          labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
        />
      }
      isLoading={isLoading}
      loadingTitle={t('title')}
      banner={message ? <Banner message={typeof message === 'string' ? message : message.message} severity={message && typeof message !== 'string' && message.outcome === 'failure' ? 'error' : 'success'} onDismiss={() => setMessage(null)} /> : null}
      kpis={kpiStrip}
      filters={filtersBar}
      beforeContent={beforeContent}
      viewMode={viewMode}
      isEmpty={!categories.length}
      emptyIcon={<div className="nvi-float"><Icon name="FolderTree" size={32} className="text-gold-500/40" /></div>}
      emptyTitle="No categories yet"
      emptyDescription="Create your first category to organize your products."
      table={tableView}
      cards={cardView}
      pagination={
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          itemCount={categories.length}
          availablePages={Object.keys(pageCursors).map(Number)}
          hasNext={Boolean(nextCursor)}
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
      }
    />
  );
}
