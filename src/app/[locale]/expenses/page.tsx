'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { Banner } from '@/components/notifications/Banner';
import { getPermissionSet } from '@/lib/permissions';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';

import { useFormatDate } from '@/lib/business-context';
import {
  ListPage,
  Card,
  Icon,
  SortableTableHeader,
} from '@/components/ui';
import { ExpenseCreateModal } from '@/components/expenses/ExpenseCreateModal';
import type { SortDirection } from '@/components/ui';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { formatCurrency, useCurrency } from '@/lib/business-context';

// ─── Types ──────────────────────────────────────────────────────────────────

type Branch = { id: string; name: string };

type Expense = {
  id: string;
  referenceNumber?: string | null;
  branchId: string;
  amount: number | string;
  currency: string;
  category: string;
  title?: string | null;
  note?: string | null;
  receiptRef?: string | null;
  expenseDate: string;
  branch?: Branch | null;
  transferId?: string | null;
  transfer?: {
    id: string;
    sourceBranch?: Branch | null;
    destinationBranch?: Branch | null;
  } | null;
};

type SettingsResponse = {
  localeSettings?: { currency?: string };
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

type CategoryStyle = {
  bg: string;
  text: string;
  iconBg: string;
  icon: 'Package' | 'Truck' | 'Zap' | 'House' | 'Users' | 'ArrowLeftRight' | 'CircleHelp' | 'Tag';
};

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  GENERAL:      { bg: 'bg-white/[0.06]',   text: 'text-zinc-300',    iconBg: 'bg-white/[0.06]',   icon: 'Package' },
  SHIPPING:     { bg: 'bg-blue-500/15',    text: 'text-blue-300',    iconBg: 'bg-blue-500/10',    icon: 'Truck' },
  UTILITIES:    { bg: 'bg-amber-500/15',   text: 'text-amber-300',   iconBg: 'bg-amber-500/10',   icon: 'Zap' },
  RENT:         { bg: 'bg-purple-500/15',  text: 'text-purple-300',  iconBg: 'bg-purple-500/10',  icon: 'House' },
  PAYROLL:      { bg: 'bg-emerald-500/15', text: 'text-emerald-300', iconBg: 'bg-emerald-500/10', icon: 'Users' },
  TRANSFER_FEE: { bg: 'bg-cyan-500/15',   text: 'text-cyan-300',    iconBg: 'bg-cyan-500/10',    icon: 'ArrowLeftRight' },
  STOCK_COST:   { bg: 'bg-orange-500/15',  text: 'text-orange-300',  iconBg: 'bg-orange-500/10',  icon: 'Package' },
  OTHER:        { bg: 'bg-white/[0.04]',   text: 'text-zinc-400',    iconBg: 'bg-white/[0.04]',   icon: 'CircleHelp' },
};

function getCategoryStyle(category: string): CategoryStyle {
  if (category in CATEGORY_STYLES) return CATEGORY_STYLES[category];
  // Default style for custom categories — neutral indigo
  return {
    bg: 'bg-indigo-500/15',
    text: 'text-indigo-300',
    iconBg: 'bg-indigo-500/10',
    icon: 'Tag',
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const t = useTranslations('expensesPage');
  const common = useTranslations('common');
  const actions = useTranslations('actions');
  const noAccess = useTranslations('noAccess');
  const { formatDate } = useFormatDate();
  const currency = useCurrency();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('expenses.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useToastState();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [total, setTotal] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [formOpen, setFormOpen] = useState(false);
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    branchId: '',
    category: '',
    status: '',
    from: '',
    to: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);

  const [form, setForm] = useState({
    branchId: '',
    category: 'GENERAL',
    title: '',
    amount: '',
    currency: '',
    note: '',
    receiptRef: '',
    expenseDate: '',
  });
  const { activeBranch, resolveBranchId } = useBranchScope();
  const effectiveFilterBranchId = resolveBranchId(filters.branchId) || '';
  const effectiveFormBranchId = resolveBranchId(form.branchId) || '';

  const [categories, setCategories] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    apiFetch<{ id: string; code: string; label: string; isSystem: boolean }[]>(
      '/expenses/categories',
      { token },
    ).then((data) => {
      setCategories(data.map((c) => ({ value: c.code, label: c.label })));
    }).catch(() => {
      // Fallback to defaults if API fails
      setCategories([
        { value: 'GENERAL', label: t('categoryGeneral') },
        { value: 'SHIPPING', label: t('categoryShipping') },
        { value: 'UTILITIES', label: t('categoryUtilities') },
        { value: 'RENT', label: t('categoryRent') },
        { value: 'PAYROLL', label: t('categoryPayroll') },
        { value: 'OTHER', label: t('categoryOther') },
      ]);
    });
  }, [t]);
  const categoryOptions = useMemo(
    () => [
      { value: '', label: common('allCategories') },
      ...categories,
    ],
    [categories, common],
  );
  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'transfer', label: t('statusTransfer') },
      { value: 'direct', label: t('statusDirect') },
    ],
    [common, t],
  );
  const branchOptions = useMemo(
    () => [
      { value: '', label: common('globalBranch') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );
  const totalAmount = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  useEffect(() => {
    if (activeBranch?.id && !form.branchId) {
      setForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
    if (activeBranch?.id && !filters.branchId) {
      pushFilters({ branchId: activeBranch.id });
    }
  }, [activeBranch?.id, filters.branchId, form.branchId, pushFilters]);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);



  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const [branchData, settings] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', { token }),
        apiFetch<SettingsResponse>('/settings', { token }),
      ]);
      setBranches(normalizePaginated(branchData).items);
      if (settings.localeSettings?.currency) {
        setForm((prev) => prev.currency ? prev : { ...prev, currency: settings.localeSettings?.currency ?? '' });
      }
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
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor =
        targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
        search: filters.search || undefined,
        branchId: effectiveFilterBranchId || undefined,
        category: filters.category || undefined,
        status: filters.status || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      });
      const expenseData = await apiFetch<PaginatedResponse<Expense> | Expense[]>(
        `/expenses${query}`,
        { token },
      );
      const expenseResult = normalizePaginated(expenseData);
      setExpenses(expenseResult.items);
      setNextCursor(expenseResult.nextCursor);
      if (typeof expenseResult.total === 'number') {
        setTotal(expenseResult.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (expenseResult.nextCursor) {
          nextState[targetPage + 1] = expenseResult.nextCursor;
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
  }, [pageSize, effectiveFilterBranchId, filters.search, filters.category, filters.status, filters.from, filters.to, t]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [load]);

  const submit = async () => {
    const token = getAccessToken();
    if (!token || !effectiveFormBranchId || !form.amount) {
      return;
    }
    setMessage(null);
    setIsSubmitting(true);
    try {
      const result = await apiFetch<{ approvalRequired?: boolean }>('/expenses', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: effectiveFormBranchId,
          category: form.category,
          title: form.title || undefined,
          amount: Number(form.amount),
          currency: form.currency || undefined,
          note: form.note || undefined,
          receiptRef: form.receiptRef || undefined,
          expenseDate: form.expenseDate || undefined,
        }),
      });
      if (result?.approvalRequired) {
        setMessage({ action: 'save', outcome: 'warning', message: t('approvalRequired') });
        setIsSubmitting(false);
        return;
      }
      setForm((prev) => ({
        ...prev,
        category: 'GENERAL',
        title: '',
        amount: '',
        note: '',
        receiptRef: '',
        expenseDate: '',
      }));
      await load(1);
      setFormOpen(false);
      setMessage({ action: 'create', outcome: 'success', message: t('created') });
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('createFailed')),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Category badge ─────────────────────────────────────────────────────

  const CategoryBadge = ({ category, label }: { category: string; label?: string }) => {
    const style = getCategoryStyle(category);
    const displayLabel = label || categories.find((c) => c.value === category)?.label || category;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
        <Icon name={style.icon} size={12} />
        {displayLabel}
      </span>
    );
  };

  // ─── KPI strip ────────────────────────────────────────────────────────────

  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      <Card padding="md" as="article">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiRows')}</p>
            <p className="mt-2 text-3xl font-bold text-[var(--nvi-text)]">{total ?? expenses.length}</p>
          </div>
          <div className="nvi-kpi-icon nvi-kpi-icon--amber">
            <Icon name="Receipt" size={18} />
          </div>
        </div>
      </Card>
      <Card padding="md" as="article">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiTotalAmount')}</p>
            <p className="mt-2 text-2xl font-extrabold text-red-400">{formatCurrency(totalAmount, currency)}</p>
          </div>
          <div className="nvi-kpi-icon nvi-kpi-icon--red">
            <Icon name="DollarSign" size={18} />
          </div>
        </div>
      </Card>
      <Card padding="md" as="article">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiCategoryFilter')}</p>
            <p className="mt-2 text-lg font-bold text-blue-400 truncate">
              {filters.category
                ? categories.find((c) => c.value === filters.category)?.label ?? filters.category
                : common('allCategories')}
            </p>
          </div>
          <div className="nvi-kpi-icon nvi-kpi-icon--blue">
            <Icon name="Tags" size={18} />
          </div>
        </div>
      </Card>
      <Card padding="md" as="article">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiBranchScope')}</p>
            <p
              className="mt-2 text-lg font-bold text-emerald-400 truncate"
              title={
                filters.branchId
                  ? branches.find((b) => b.id === filters.branchId)?.name ?? common('unknown')
                  : common('globalBranch')
              }
            >
              {filters.branchId
                ? branches.find((b) => b.id === filters.branchId)?.name ?? common('unknown')
                : common('globalBranch')}
            </p>
          </div>
          <div className="nvi-kpi-icon nvi-kpi-icon--emerald">
            <Icon name="Building2" size={18} />
          </div>
        </div>
      </Card>
    </div>
  );

  // ─── Filters ──────────────────────────────────────────────────────────────

  const filterBar = (
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
        instanceId="expenses-filter-branch"
        value={filters.branchId}
        onChange={(value) => pushFilters({ branchId: value })}
        options={branchOptions}
        placeholder={common('branch')}
        className="nvi-select-container"
      />
      <SmartSelect
        instanceId="expenses-filter-category"
        value={filters.category}
        onChange={(value) => pushFilters({ category: value })}
        options={categoryOptions}
        placeholder={common('category')}
        className="nvi-select-container"
      />
      <SmartSelect
        instanceId="expenses-filter-status"
        value={filters.status}
        onChange={(value) => pushFilters({ status: value })}
        options={statusOptions}
        placeholder={common('status')}
        className="nvi-select-container"
      />
      <div className="flex items-center gap-1.5">
        <Icon name="CalendarRange" size={14} className="text-[var(--nvi-text-muted)]" />
        <DatePickerInput
          value={filters.from}
          onChange={(value) => pushFilters({ from: value })}
          placeholder={common('fromDate')}
          className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-text)]"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Icon name="CalendarRange" size={14} className="text-[var(--nvi-text-muted)]" />
        <DatePickerInput
          value={filters.to}
          onChange={(value) => pushFilters({ to: value })}
          placeholder={common('toDate')}
          className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-text)]"
        />
      </div>
    </ListFilters>
  );

  // ─── Create modal ─────────────────────────────────────────────────────────

  const createModal = (
    <ExpenseCreateModal
      open={formOpen}
      onClose={() => setFormOpen(false)}
      form={form}
      onFormChange={setForm}
      branches={branches}
      categories={categories}
      onSubmit={submit}
      isSubmitting={isSubmitting}
      canWrite={canWrite}
    />
  );

  // ─── Expense card ─────────────────────────────────────────────────────────

  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const toggleNote = (id: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expenseCards = (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 nvi-stagger">
      {expenses.map((expense) => {
        const style = getCategoryStyle(expense.category);
        const noteExpanded = expandedNotes.has(expense.id);
        const hasLongNote = (expense.note?.length ?? 0) > 80;

        return (
          <Card key={expense.id} padding="md" className="nvi-card-hover">
            {/* Header: amount hero + category badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-bold text-red-400">
                  {formatCurrency(Number(expense.amount), expense.currency || currency)}
                </p>
                <div className="mt-1.5">
                  <CategoryBadge category={expense.category} />
                </div>
              </div>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.iconBg}`}>
                <Icon name={style.icon} size={18} className={style.text} />
              </div>
            </div>

            {/* Title */}
            {expense.title && (
              <p className="mt-3 text-sm font-semibold text-[var(--nvi-text)]">{expense.title}</p>
            )}

            {/* Branch + Date */}
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-[var(--nvi-text-muted)]">
                <Icon name="MapPin" size={12} />
                <span>{expense.branch?.name ?? common('branch')}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[var(--nvi-text-muted)]">
                <Icon name="CalendarRange" size={12} />
                <span>{relativeTime(expense.expenseDate)}</span>
                <span className="text-[var(--nvi-text-muted)]/50">({formatDate(expense.expenseDate)})</span>
              </div>
            </div>

            {/* Reference number */}
            {expense.referenceNumber && (
              <p className="mt-1.5 text-[11px] text-[var(--nvi-text-muted)]/60">{expense.referenceNumber}</p>
            )}

            {/* Receipt reference */}
            {expense.receiptRef && (
              <div className="mt-2 flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/10">
                  <Icon name="FileText" size={11} className="text-blue-400" />
                </span>
                <span>{expense.receiptRef}</span>
              </div>
            )}

            {/* Transfer fee link */}
            {expense.category === 'TRANSFER_FEE' && expense.transfer && (
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-cyan-300 font-medium">
                  <Icon name="Building2" size={10} />
                  {expense.transfer.sourceBranch?.name ?? common('unknown')}
                </span>
                <Icon name="ArrowRight" size={12} className="text-cyan-400/60" />
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300 font-medium">
                  <Icon name="Building2" size={10} />
                  {expense.transfer.destinationBranch?.name ?? common('unknown')}
                </span>
              </div>
            )}

            {/* Note */}
            {expense.note && (
              <div className="mt-2">
                <p className={`text-xs text-[var(--nvi-text-muted)] ${!noteExpanded && hasLongNote ? 'line-clamp-2' : ''}`}>
                  {expense.note}
                </p>
                {hasLongNote && (
                  <button
                    type="button"
                    onClick={() => toggleNote(expense.id)}
                    className="mt-0.5 text-[11px] font-medium text-[var(--nvi-text-muted)] hover:text-[var(--nvi-text)] transition-colors"
                  >
                    {noteExpanded ? t('showLess') : t('showMore')}
                  </button>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );

  // ─── Table view ───────────────────────────────────────────────────────────

  const expenseTable = (
    <Card padding="lg">
      <table className="min-w-[720px] w-full text-left text-sm text-[var(--nvi-text)]">
        <thead className="text-xs uppercase text-[var(--nvi-text-muted)]">
          <tr>
            <SortableTableHeader label={common('date')} sortKey="expenseDate" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
            <SortableTableHeader label={common('branch')} sortKey="branch" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
            <SortableTableHeader label={common('category')} sortKey="category" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} />
            <th className="px-3 py-2">{t('titleLabel')}</th>
            <SortableTableHeader label={t('amount')} sortKey="amount" currentSortKey={sortKey} currentDirection={sortDirection} onSort={(k, d) => { setSortKey(k); setSortDirection(d); }} align="right" />
            <th className="px-3 py-2">{t('receiptRefLabel')}</th>
            <th className="px-3 py-2">{t('noteLabel')}</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.id} className="border-t border-[var(--nvi-border)]">
              <td className="px-3 py-2">
                <span className="text-xs text-[var(--nvi-text-muted)]">{relativeTime(expense.expenseDate)}</span>
                <p className="text-[11px] text-[var(--nvi-text-muted)]/50">{formatDate(expense.expenseDate)}</p>
              </td>
              <td className="px-3 py-2">
                <span className="text-[var(--nvi-text)]">{expense.branch?.name ?? common('branch')}</span>
                {expense.referenceNumber && (
                  <p className="text-[11px] text-[var(--nvi-text-muted)]/60">{expense.referenceNumber}</p>
                )}
              </td>
              <td className="px-3 py-2">
                <CategoryBadge category={expense.category} />
              </td>
              <td className="px-3 py-2 text-sm text-[var(--nvi-text)]">
                {expense.title || '—'}
              </td>
              <td className="px-3 py-2 text-right font-bold text-red-400">
                {formatCurrency(Number(expense.amount), expense.currency || currency)}
              </td>
              <td className="px-3 py-2 text-xs text-[var(--nvi-text-muted)]">
                {expense.receiptRef ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/10">
                      <Icon name="FileText" size={11} className="text-blue-400" />
                    </span>
                    {expense.receiptRef}
                  </span>
                ) : '—'}
              </td>
              <td className="px-3 py-2 text-xs text-[var(--nvi-text-muted)] max-w-[200px]">
                {expense.category === 'TRANSFER_FEE' && expense.transfer ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300 font-medium">
                      <Icon name="Building2" size={10} />
                      {expense.transfer.sourceBranch?.name ?? common('unknown')}
                    </span>
                    <Icon name="ArrowRight" size={10} className="text-cyan-400/60" />
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300 font-medium">
                      <Icon name="Building2" size={10} />
                      {expense.transfer.destinationBranch?.name ?? common('unknown')}
                    </span>
                  </span>
                ) : expense.note ? (
                  <span className="line-clamp-2">{expense.note}</span>
                ) : '—'}
              </td>
            </tr>
          ))}
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
          <span className="nvi-badge">{t('badgeOpsSpend')}</span>
          <span className="nvi-badge">{t('badgeLive')}</span>
        </>
      }
      headerActions={
        <>
          {canWrite ? (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-[var(--nvi-accent)] px-3 py-2 text-xs font-semibold text-black"
            >
              <Icon name="Plus" size={14} />
              {t('createExpense')}
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
      filters={filterBar}
      viewMode={viewMode}
      isEmpty={!expenses.length}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="Receipt" size={32} className="text-[var(--nvi-text-muted)]" />
        </div>
      }
      emptyTitle={t('noExpenses')}
      emptyDescription={t('emptyDescription')}
      table={expenseTable}
      cards={expenseCards}
      pagination={
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          itemCount={expenses.length}
          availablePages={Object.keys(pageCursors).map((value) => Number(value))}
          hasNext={Boolean(nextCursor)}
          hasPrev={page > 1}
          isLoading={isLoading}
          onPageChange={(targetPage) => load(targetPage)}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setTotal(null);
            setPage(1);
            setPageCursors({ 1: null });
            load(1, nextPageSize);
          }}
        />
      }
    />
    {createModal}
    </>
  );
}
