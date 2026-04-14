'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState, messageText } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { Banner } from '@/components/notifications/Banner';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import {
  ListPage,
  Card,
  Icon,
  TextInput,
  CollapsibleSection,
  SortableTableHeader,
  EmptyState,
} from '@/components/ui';
import type { SortDirection } from '@/components/ui';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { PaginationControls } from '@/components/PaginationControls';

// ─── Types ──────────────────────────────────────────────────────────────────

type Branch = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  status?: string | null;
  priceListId?: string | null;
  activeUserCount?: number;
  openingTime?: string | null;
  closingTime?: string | null;
};

type BranchPerformance = {
  salesToday: number;
  saleCount: number;
  stockUnits: number;
};

type PriceList = {
  id: string;
  name: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatHoursRange(open?: string | null, close?: string | null): string | null {
  if (!open || !close) return null;
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };
  return `${fmt(open)} \u2013 ${fmt(close)}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const t = useTranslations('branchesPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('settings.write');

  // ─── State ──────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [message, setMessage] = useToastState();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState<number | null>(null);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({ 1: null });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    openingTime: '',
    closingTime: '',
    priceListId: '',
  });
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [perfBranchId, setPerfBranchId] = useState<string | null>(null);
  const [perfData, setPerfData] = useState<BranchPerformance | null>(null);
  const [isPerfLoading, setIsPerfLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState({
    name: '',
    address: '',
    phone: '',
    priceListId: '',
    openingTime: '',
    closingTime: '',
  });

  // ─── Load price list options (async select) ─────────────────────────────

  const loadPriceListOptions = async (inputValue: string) => {
    const token = getAccessToken();
    if (!token) return [];
    try {
      const data = await apiFetch<PaginatedResponse<PriceList> | PriceList[]>(
        `/price-lists?search=${encodeURIComponent(inputValue)}&limit=25`,
        { token },
      );
      return normalizePaginated(data).items.map((list) => ({ value: list.id, label: list.name }));
    } catch {
      return [];
    }
  };

  // ─── Data loading ───────────────────────────────────────────────────────

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
      });
      const branchData = await apiFetch<PaginatedResponse<Branch> | Branch[]>(
        `/branches${query}`,
        { token },
      );
      const { items, nextCursor: cursorNext, total: resultTotal } = normalizePaginated(branchData);
      setBranches(items);
      setNextCursor(cursorNext);
      if (typeof resultTotal === 'number') setTotal(resultTotal);
      setPage(targetPage);
      setPageCursors(prev => {
        const next: Record<number, string | null> = targetPage === 1 ? { 1: null } : { ...prev };
        if (cursorNext) next[targetPage + 1] = cursorNext;
        return next;
      });
      const listResult = await Promise.allSettled([
        apiFetch<PaginatedResponse<PriceList> | PriceList[]>(
          '/price-lists?limit=50',
          { token },
        ),
      ]);
      if (listResult[0].status === 'fulfilled') {
        setPriceLists(normalizePaginated(listResult[0].value).items);
      } else {
        setPriceLists([]);
      }
    } catch (err) {
      setMessage({ action: 'load', outcome: 'failure', message: getApiErrorMessage(err, t('loadFailed')) });
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, t]);

  useEffect(() => {
    load(1);
  }, [load]);

  // ─── Create ─────────────────────────────────────────────────────────────

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
          openingTime: form.openingTime || undefined,
          closingTime: form.closingTime || undefined,
          priceListId: form.priceListId || null,
        }),
      });
      setForm({ name: '', address: '', phone: '', openingTime: '', closingTime: '', priceListId: '' });
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

  // ─── Edit ───────────────────────────────────────────────────────────────

  const startEdit = (branch: Branch) => {
    if (viewMode === 'table') setViewMode('cards');
    setEditingId(branch.id);
    setEditing({
      name: branch.name ?? '',
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      priceListId: branch.priceListId ?? '',
      openingTime: branch.openingTime ?? '',
      closingTime: branch.closingTime ?? '',
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
          openingTime: editing.openingTime || undefined,
          closingTime: editing.closingTime || undefined,
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

  // ─── Filter + sort ──────────────────────────────────────────────────────

  const filtered = branches.filter(
    (b) => !search || b.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSort = useCallback((key: string, dir: SortDirection) => {
    setSortKey(dir ? key : null);
    setSortDir(dir);
  }, []);

  const sortedBranches = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey] ?? '';
      const bVal = (b as Record<string, unknown>)[sortKey] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // ─── Performance toggle ─────────────────────────────────────────────────

  const togglePerformance = async (branchId: string) => {
    if (perfBranchId === branchId) {
      setPerfBranchId(null);
      setPerfData(null);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setPerfBranchId(branchId);
    setPerfData(null);
    setIsPerfLoading(true);
    try {
      const data = await apiFetch<BranchPerformance>(`/branches/${branchId}/performance`, { token });
      setPerfData(data);
    } catch (err) {
      setMessage({ action: 'load', outcome: 'failure', message: getApiErrorMessage(err, t('performanceFailed')) });
      setPerfBranchId(null);
    } finally {
      setIsPerfLoading(false);
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────

  const getPriceListName = (priceListId?: string | null) => {
    if (!priceListId) return null;
    return priceLists.find((l) => l.id === priceListId)?.name ?? t('priceListCustom');
  };

  const totalActiveUsers = branches.reduce(
    (sum, b) => sum + (typeof b.activeUserCount === 'number' ? b.activeUserCount : 0),
    0,
  );

  // ─── KPI strip ──────────────────────────────────────────────────────────

  const kpiStrip = (
    <div className="flex gap-3 overflow-x-auto pb-1 nvi-stagger">
      {/* Total Branches */}
      <div className="flex min-w-[180px] flex-1 items-center gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/5 px-4 py-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
          <Icon name="Building2" size={20} className="text-blue-400" />
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--nvi-text-muted)]">{t('kpiTotalBranches')}</p>
          <p className="mt-0.5 text-2xl font-bold text-blue-400">{branches.length}</p>
        </div>
      </div>
      {/* With Price List */}
      <div className="flex min-w-[180px] flex-1 items-center gap-3 rounded-2xl border border-purple-500/20 bg-purple-500/5 px-4 py-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-500/10">
          <Icon name="Tag" size={20} className="text-purple-400" />
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--nvi-text-muted)]">{t('kpiWithPriceList')}</p>
          <p className="mt-0.5 text-2xl font-bold text-purple-400">
            {branches.filter((b) => Boolean(b.priceListId)).length}
          </p>
        </div>
      </div>
      {/* Active Users */}
      <div className="flex min-w-[180px] flex-1 items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
          <Icon name="Users" size={20} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--nvi-text-muted)]">{t('kpiActiveUsersTotal')}</p>
          <p className="mt-0.5 text-2xl font-bold text-emerald-400">{totalActiveUsers}</p>
        </div>
      </div>
      {/* Current Page */}
      <div className="flex min-w-[180px] flex-1 items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
          <Icon name="ListFilter" size={20} className="text-amber-400" />
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--nvi-text-muted)]">{t('kpiCurrentPage')}</p>
          <p className="mt-0.5 text-2xl font-bold text-amber-400">{page}</p>
        </div>
      </div>
    </div>
  );

  // ─── Create form ────────────────────────────────────────────────────────

  const createForm = (
    <CollapsibleSection title={t('createBranch')} isOpen={formOpen} onToggle={setFormOpen} storageKey="branches-form-open">
      <div className="rounded-2xl border border-[var(--nvi-border)] border-l-2 border-l-blue-400 bg-[var(--nvi-surface)] p-5 nvi-slide-in-bottom">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
            <Icon name="Building2" size={20} className="text-blue-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[var(--nvi-text)]">{t('createBranch')}</h4>
            <p className="text-[11px] text-[var(--nvi-text-muted)]">{t('subtitle')}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextInput
            label={t('branchName')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('branchName')}
          />
          <TextInput
            label={t('addressOptional')}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder={t('addressOptional')}
          />
          <div className="grid gap-1.5">
            <TextInput
              label={t('phoneOptional')}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+255..."
              type="tel"
            />
            <p className="text-[10px] text-[var(--nvi-text-muted)] px-1">{t('phoneCountryCodeHint')}</p>
          </div>
          <TextInput
            label={t('openingTime')}
            value={form.openingTime}
            onChange={(e) => setForm({ ...form, openingTime: e.target.value })}
            placeholder="08:00"
            type="text"
          />
          <TextInput
            label={t('closingTime')}
            value={form.closingTime}
            onChange={(e) => setForm({ ...form, closingTime: e.target.value })}
            placeholder="18:00"
            type="text"
          />
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gold-300/80 mb-1.5 block">{t('defaultPriceList')}</label>
            <AsyncSmartSelect
              instanceId="branch-create-price-list"
              value={form.priceListId ? { value: form.priceListId, label: priceLists.find((l) => l.id === form.priceListId)?.name ?? '' } : null}
              onChange={(opt) => setForm({ ...form, priceListId: opt?.value ?? '' })}
              loadOptions={loadPriceListOptions}
              defaultOptions={priceLists.map((list) => ({ value: list.id, label: list.name }))}
              placeholder={t('defaultPriceList')}
              isClearable
              className="nvi-select-container"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={createBranch}
          disabled={isCreating || !canWrite}
          title={!canWrite ? noAccess('title') : undefined}
          className="nvi-cta nvi-press mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isCreating ? <Spinner variant="orbit" size="xs" /> : <Icon name="Plus" size={16} />}
          {isCreating ? t('creating') : t('createBranch')}
        </button>
      </div>
    </CollapsibleSection>
  );

  // ─── Search bar ─────────────────────────────────────────────────────────

  const filterBar = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[var(--nvi-border)] bg-[var(--nvi-surface)] px-4 py-3">
      <h3 className="text-sm font-semibold text-[var(--nvi-text)]">{t('listTitle')}</h3>
      <div className="relative sm:w-64">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/10">
          <Icon name="Search" size={12} className="text-blue-400" />
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={common('search')}
          className="w-full rounded-xl border border-[var(--nvi-border)] bg-black/40 pl-11 pr-3 py-2 text-sm text-[var(--nvi-text)] placeholder:text-[var(--nvi-text-muted)] outline-none focus:border-blue-400 transition-colors"
        />
      </div>
    </div>
  );

  // ─── Branch location card (card view) ─────────────────────────────────

  const renderBranchCard = (branch: Branch) => {
    const isEditing = editingId === branch.id;
    const hours = formatHoursRange(branch.openingTime, branch.closingTime);
    const plName = getPriceListName(branch.priceListId);

    return (
      <div
        key={branch.id}
        className={[
          'rounded-2xl border border-[var(--nvi-border)] bg-[var(--nvi-surface)] p-4 transition-all hover:border-[var(--nvi-text-muted)]/30',
          isEditing ? 'ring-2 ring-blue-500/40' : '',
        ].join(' ')}
      >
        {isEditing ? (
          /* ── Edit mode ── */
          <div className="space-y-4 nvi-slide-in-bottom">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <Icon name="Building2" size={20} className="text-blue-400" />
              </div>
              <h4 className="text-sm font-bold text-[var(--nvi-text)]">{t('branchName')}</h4>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextInput
                label={t('branchName')}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <TextInput
                label={t('addressOptional')}
                value={editing.address}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              />
              <TextInput
                label={t('phoneOptional')}
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                placeholder="+255..."
                type="tel"
              />
              <TextInput
                label={t('openingTime')}
                value={editing.openingTime}
                onChange={(e) => setEditing({ ...editing, openingTime: e.target.value })}
                placeholder="08:00"
                type="text"
              />
              <TextInput
                label={t('closingTime')}
                value={editing.closingTime}
                onChange={(e) => setEditing({ ...editing, closingTime: e.target.value })}
                placeholder="18:00"
                type="text"
              />
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gold-300/80 mb-1.5 block">{t('defaultPriceList')}</label>
                <AsyncSmartSelect
                  instanceId={`branch-${branch.id}-price-list`}
                  value={editing.priceListId ? { value: editing.priceListId, label: priceLists.find((l) => l.id === editing.priceListId)?.name ?? '' } : null}
                  onChange={(opt) => setEditing({ ...editing, priceListId: opt?.value ?? '' })}
                  loadOptions={loadPriceListOptions}
                  defaultOptions={priceLists.map((list) => ({ value: list.id, label: list.name }))}
                  placeholder={t('defaultPriceList')}
                  isClearable
                  className="nvi-select-container"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveEdit}
                className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSaving || !canWrite}
                title={!canWrite ? noAccess('title') : undefined}
              >
                {isSaving ? <Spinner size="xs" variant="pulse" /> : <Icon name="Check" size={14} />}
                {isSaving ? t('saving') : actions('save')}
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-4 py-2 text-sm text-[var(--nvi-text)] hover:border-[var(--nvi-accent)] transition-colors"
              >
                <Icon name="X" size={14} />
                {actions('cancel')}
              </button>
            </div>
          </div>
        ) : (
          /* ── Display mode ── */
          <div className="space-y-4">
            {/* Header: large icon + name + status */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                <Icon name="Building2" size={24} className="text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[var(--nvi-text)] truncate">{branch.name}</h3>
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${branch.status === 'INACTIVE' ? 'bg-zinc-500' : 'bg-emerald-400'}`} title={branch.status === 'INACTIVE' ? 'Inactive' : 'Active'} />
                </div>

                {/* Detail rows with colored mini-containers */}
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10">
                      <Icon name="MapPin" size={12} className="text-amber-400" />
                    </span>
                    <span>{branch.address || t('noAddress')}</span>
                  </div>
                  {branch.phone ? (
                    <div className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10">
                        <Icon name="Phone" size={12} className="text-emerald-400" />
                      </span>
                      <span>{branch.phone}</span>
                    </div>
                  ) : null}
                  {hours ? (
                    <div className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/10">
                        <Icon name="Clock" size={12} className="text-purple-400" />
                      </span>
                      <span className="text-purple-300">{hours}</span>
                    </div>
                  ) : null}
                </div>

                {/* Tags row: price list + users */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {plName ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-400">
                      <Icon name="Tag" size={11} className="text-blue-400" />
                      {plName}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--nvi-text-muted)] opacity-60">{t('priceListDefault')}</span>
                  )}
                  {typeof branch.activeUserCount === 'number' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
                      <Icon name="Users" size={11} className="text-emerald-400" />
                      {t('activeUsers', { count: branch.activeUserCount })}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex shrink-0 items-center gap-1.5">
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => startEdit(branch)}
                    className="nvi-press inline-flex items-center gap-1 rounded-xl border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text)] hover:border-blue-400 transition-colors"
                    title={actions('edit')}
                  >
                    <Icon name="Pencil" size={12} />
                    {actions('edit')}
                  </button>
                ) : null}
              </div>
            </div>

            {/* Toggle performance */}
            <div className="flex flex-wrap gap-2 border-t border-[var(--nvi-border)]/50 pt-3">
              <button
                type="button"
                onClick={() => togglePerformance(branch.id)}
                className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text)] hover:border-blue-400 transition-colors"
              >
                <Icon name="ChartBar" size={12} className="text-blue-400" />
                {perfBranchId === branch.id ? t('hidePerformance') : t('performance')}
              </button>
            </div>

            {/* Performance panel (expandable) */}
            {perfBranchId === branch.id ? (
              <div className="nvi-expand rounded-xl border border-[var(--nvi-border)] bg-black/30 p-3">
                {isPerfLoading ? (
                  <span className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
                    <Spinner variant="dots" size="xs" /> {actions('loading')}
                  </span>
                ) : perfData ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-emerald-500/10 p-2.5 text-center">
                      <Icon name="ShoppingCart" size={14} className="mx-auto text-emerald-400" />
                      <p className="mt-1 text-lg font-bold text-emerald-400">{perfData.salesToday}</p>
                      <p className="text-[10px] text-[var(--nvi-text-muted)]">{t('salesToday')}</p>
                    </div>
                    <div className="rounded-xl bg-blue-500/10 p-2.5 text-center">
                      <Icon name="Hash" size={14} className="mx-auto text-blue-400" />
                      <p className="mt-1 text-lg font-bold text-blue-400">{perfData.saleCount}</p>
                      <p className="text-[10px] text-[var(--nvi-text-muted)]">{t('saleCount')}</p>
                    </div>
                    <div className="rounded-xl bg-amber-500/10 p-2.5 text-center">
                      <Icon name="Package" size={14} className="mx-auto text-amber-400" />
                      <p className="mt-1 text-lg font-bold text-amber-400">{perfData.stockUnits}</p>
                      <p className="text-[10px] text-[var(--nvi-text-muted)]">{t('stockUnits')}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  // ─── Cards view ─────────────────────────────────────────────────────────

  const cardsView = (
    <div className="grid gap-4 md:grid-cols-2 nvi-stagger">
      {sortedBranches.map(renderBranchCard)}
    </div>
  );

  // ─── Table view ─────────────────────────────────────────────────────────

  const tableView = (
    <div className="rounded-2xl border border-[var(--nvi-border)] bg-[var(--nvi-surface)] overflow-hidden">
      <div className="overflow-auto">
        <table className="min-w-[720px] w-full text-left text-sm text-[var(--nvi-text)]">
          <thead className="text-[11px] uppercase tracking-wider text-[var(--nvi-text-muted)] bg-black/20">
            <tr>
              <SortableTableHeader label={t('branchName')} sortKey="name" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <SortableTableHeader label={t('addressOptional')} sortKey="address" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <SortableTableHeader label={t('phoneOptional')} sortKey="phone" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <th className="px-3 py-2.5">{t('operatingHours')}</th>
              <th className="px-3 py-2.5">{t('defaultPriceList')}</th>
              <th className="px-3 py-2.5">{t('usersLabel')}</th>
              <th className="px-3 py-2.5">{actions('edit')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedBranches.map((branch) => {
              const hours = formatHoursRange(branch.openingTime, branch.closingTime);
              const plName = getPriceListName(branch.priceListId);
              return (
                <tr key={branch.id} className="border-t border-[var(--nvi-border)]/50 hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
                        <Icon name="Building2" size={14} className="text-blue-400" />
                      </span>
                      {branch.name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10">
                        <Icon name="MapPin" size={12} className="text-amber-400" />
                      </span>
                      {branch.address || <span className="text-[var(--nvi-text-muted)] opacity-60">{t('noAddress')}</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {branch.phone ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10">
                          <Icon name="Phone" size={12} className="text-emerald-400" />
                        </span>
                        {branch.phone}
                      </span>
                    ) : (
                      <span className="text-[var(--nvi-text-muted)] opacity-60">{t('noPhone')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {hours ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/10">
                          <Icon name="Clock" size={11} className="text-purple-400" />
                        </span>
                        <span className="text-purple-300">{hours}</span>
                      </span>
                    ) : (
                      <span className="text-[var(--nvi-text-muted)] opacity-60">{'\u2014'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {plName ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-400">
                        <Icon name="Tag" size={11} /> {plName}
                      </span>
                    ) : (
                      <span className="text-[var(--nvi-text-muted)] opacity-60">{t('priceListDefault')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {typeof branch.activeUserCount === 'number' ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400">
                        <Icon name="Users" size={13} /> {branch.activeUserCount}
                      </span>
                    ) : (
                      <span className="text-[var(--nvi-text-muted)] opacity-60">{'\u2014'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => startEdit(branch)}
                      disabled={!canWrite}
                      title={!canWrite ? noAccess('title') : undefined}
                      className="nvi-press inline-flex items-center gap-1 rounded-xl border border-[var(--nvi-border)] px-2.5 py-1 text-xs text-[var(--nvi-text)] hover:border-blue-400 transition-colors disabled:opacity-50"
                    >
                      <Icon name="Pencil" size={11} />
                      {actions('edit')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ─── Pagination ─────────────────────────────────────────────────────────

  const paginationControls = (
    <PaginationControls
      page={page}
      pageSize={pageSize}
      total={total}
      itemCount={branches.length}
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
  );

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <ListPage
      eyebrow={t('eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      badges={
        <>
          <span className="nvi-badge">{t('badgeBranchMap')}</span>
          <span className="nvi-badge">{t('badgePriceReady')}</span>
        </>
      }
      headerActions={
        <ViewToggle
          value={viewMode}
          onChange={setViewMode}
          labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
        />
      }
      banner={message ? <Banner message={messageText(message)} /> : null}
      kpis={kpiStrip}
      filters={filterBar}
      beforeContent={createForm}
      viewMode={viewMode}
      table={tableView}
      cards={cardsView}
      isEmpty={sortedBranches.length === 0}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="Building2" size={48} className="text-[var(--nvi-accent)]" />
        </div>
      }
      emptyTitle={t('emptyTitle')}
      emptyDescription={t('emptyDescription')}
      emptyAction={
        canWrite ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-black"
          >
            <Icon name="Plus" size={14} />
            {t('createBranch')}
          </button>
        ) : undefined
      }
      pagination={paginationControls}
      isLoading={isLoading}
    />
  );
}
