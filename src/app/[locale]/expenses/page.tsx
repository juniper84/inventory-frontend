'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import { getPermissionSet } from '@/lib/permissions';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type Branch = { id: string; name: string };

type Expense = {
  id: string;
  branchId: string;
  amount: number | string;
  currency: string;
  category: string;
  note?: string | null;
  receiptRef?: string | null;
  expenseDate: string;
  branch?: Branch | null;
};

type SettingsResponse = {
  localeSettings?: { currency?: string };
};

export default function ExpensesPage() {
  const t = useTranslations('expensesPage');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
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
  const [total, setTotal] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    branchId: '',
    category: '',
    status: '',
    from: '',
    to: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);
  const [form, setForm] = useState({
    branchId: '',
    category: 'GENERAL',
    amount: '',
    currency: '',
    note: '',
    receiptRef: '',
    expenseDate: '',
  });
  const activeBranch = useActiveBranch();

  const categories = [
    { value: 'GENERAL', label: t('categoryGeneral') },
    { value: 'TRANSFER_FEE', label: t('categoryTransferFee') },
    { value: 'SHIPPING', label: t('categoryShipping') },
    { value: 'UTILITIES', label: t('categoryUtilities') },
    { value: 'RENT', label: t('categoryRent') },
    { value: 'PAYROLL', label: t('categoryPayroll') },
    { value: 'OTHER', label: t('categoryOther') },
  ];
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
      { value: '', label: common('allBranches') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );
  const categoryLabel = (value: string) =>
    categories.find((item) => item.value === value)?.label ?? value;

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

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

  const load = async (targetPage = 1, nextPageSize?: number) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor =
        targetPage === 1 ? null : pageCursors[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
        search: filters.search || undefined,
        branchId: filters.branchId || undefined,
        category: filters.category || undefined,
        status: filters.status || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      });
      const [branchData, expenseData, settings] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<Expense> | Expense[]>(
          `/expenses${query}`,
          { token },
        ),
        apiFetch<SettingsResponse>('/settings', { token }),
      ]);
      setBranches(normalizePaginated(branchData).items);
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
      if (!form.currency && settings.localeSettings?.currency) {
        setForm((prev) => ({ ...prev, currency: settings.localeSettings?.currency ?? '' }));
      }
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

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [
    filters.search,
    filters.branchId,
    filters.category,
    filters.status,
    filters.from,
    filters.to,
  ]);

  const submit = async () => {
    const token = getAccessToken();
    if (!token || !form.branchId || !form.amount) {
      return;
    }
    setMessage(null);
    setIsSubmitting(true);
    try {
      const result = await apiFetch<{ approvalRequired?: boolean }>('/expenses', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: form.branchId,
          category: form.category,
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
        amount: '',
        note: '',
        receiptRef: '',
        expenseDate: '',
      }));
      await load(1);
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

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
      <p className="text-sm text-gold-300">{t('subtitle')}</p>
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
          value={filters.branchId}
          onChange={(value) => pushFilters({ branchId: value })}
          options={branchOptions}
          placeholder={common('branch')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.category}
          onChange={(value) => pushFilters({ category: value })}
          options={categoryOptions}
          placeholder={common('category')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.status}
          onChange={(value) => pushFilters({ status: value })}
          options={statusOptions}
          placeholder={common('status')}
          className="nvi-select-container"
        />
        <DatePickerInput
          value={filters.from}
          onChange={(value) => pushFilters({ from: value })}
          placeholder={common('fromDate')}
          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <DatePickerInput
          value={filters.to}
          onChange={(value) => pushFilters({ to: value })}
          placeholder={common('toDate')}
          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
      </ListFilters>

      <div className="command-card p-4 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('newExpense')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            value={form.branchId}
            onChange={(value) => setForm((prev) => ({ ...prev, branchId: value }))}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            placeholder={t('branch')}
            isClearable
            className="nvi-select-container"
          />
          <SmartSelect
            value={form.category}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, category: value || 'GENERAL' }))
            }
            options={categories}
            placeholder={t('category')}
            isClearable
            className="nvi-select-container"
          />
          <input
            value={form.amount}
            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            placeholder={t('amount')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.currency}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))
            }
            placeholder={t('currency')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <DatePickerInput
            value={form.expenseDate}
            onChange={(value) => setForm((prev) => ({ ...prev, expenseDate: value }))}
            placeholder={t('expenseDate')}
          />
          <input
            value={form.receiptRef}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, receiptRef: event.target.value }))
            }
            placeholder={t('receiptRef')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.note}
            onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            placeholder={t('note')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 md:col-span-2"
          />
        </div>
        <button
          onClick={submit}
          className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!canWrite || isSubmitting}
          title={!canWrite ? noAccess('title') : undefined}
        >
          {isSubmitting ? <Spinner size="xs" variant="orbit" /> : null}
          {isSubmitting ? t('saving') : t('createExpense')}
        </button>
      </div>

      <div className="space-y-3">
        {expenses.length === 0 ? (
          <StatusBanner message={t('noExpenses')} />
        ) : (
          expenses.map((expense) => (
            <div
              key={expense.id}
              className="command-card p-4 text-sm text-gold-200 nvi-reveal"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-gold-100">
                    {expense.branch?.name ?? common('branch')} · {categoryLabel(expense.category)}
                  </p>
                  <p className="text-xs text-gold-400">
                    {new Date(expense.expenseDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-gold-100 font-semibold">
                  {expense.amount} {expense.currency}
                </div>
              </div>
              {expense.note ? <p className="text-xs text-gold-300">{expense.note}</p> : null}
              {expense.receiptRef ? (
                <p className="text-xs text-gold-400">
                  {t('receiptRef')}: {expense.receiptRef}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
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
    </section>
  );
}
