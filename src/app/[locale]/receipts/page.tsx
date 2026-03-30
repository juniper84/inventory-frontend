'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import { CurrencyInput } from '@/components/CurrencyInput';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatVariantLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import {
  connectEscPosPrinter,
  printEscPosLines,
  EscPosConnection,
} from '@/lib/escpos-printer';
import {
  buildReceiptLines,
  type ReceiptData as ReceiptPrintData,
  type ReceiptLabels,
} from '@/lib/receipt-print';
import { ReceiptPreview } from '@/components/receipts/ReceiptPreview';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';
import { useCurrency, formatCurrency, useFormatDate, useTimezone, useDateFormat } from '@/lib/business-context';

type ReceiptData = ReceiptPrintData;

type ReceiptRecord = {
  id: string;
  saleId: string;
  receiptNumber: string;
  issuedAt: string;
  data?: ReceiptData;
};

type ReceiptResponse = ReceiptRecord & {
  sale?: {
    id: string;
    total: number | string;
    paidAmount?: number | string;
    outstandingAmount?: number | string;
    creditDueDate?: string | null;
  };
};

type SalesActionResponse = {
  approvalRequired?: boolean;
};

type Branch = { id: string; name: string };
type Customer = { id: string; name: string };
type Variant = { id: string; name: string; product?: { name: string } | null };
type User = { id: string; name?: string | null; email?: string | null };

export default function ReceiptsPage() {
  const t = useTranslations('receiptsPage');
  const previewT = useTranslations('receiptPreview');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const { formatDate, formatDateTime } = useFormatDate();
  const timezone = useTimezone();
  const dateFormat = useDateFormat();
  const currency = useCurrency();
  const permissions = getPermissionSet();
  const canRead = permissions.has('sales.read');
  const canRefund = permissions.has('sales.write');
  const canSettleCredit = permissions.has('sales.credit.settle');
  const canReturnWithoutReceipt = permissions.has('sales.return.without-receipt');
  const [isLoading, setIsLoading] = useState(true);
  const [isReprinting, setIsReprinting] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptResponse[]>([]);
  const [selected, setSelected] = useState<ReceiptResponse | null>(null);
  const [previewMode, setPreviewMode] = useState<'compact' | 'detailed'>('detailed');
  const [message, setMessage] = useToastState();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const [total, setTotal] = useState<number | null>(null);
  const [settlement, setSettlement] = useState({
    amount: '',
    method: 'CASH',
    reference: '',
    methodLabel: '',
  });
  const [returnForm, setReturnForm] = useState({
    branchId: '',
    customerId: '',
    reason: '',
  });
  const [returnToStock, setReturnToStock] = useState(true);
  const { activeBranch, resolveBranchId } = useBranchScope();
  const { loadOptions: loadVariantOptions, seedCache: seedVariantCache, getVariantOption } = useVariantSearch();
  const [returnItems, setReturnItems] = useState([
    { variantId: '', quantity: '', unitPrice: '' },
  ]);
  const [refundReason, setRefundReason] = useState('');
  const [refundReturnToStock, setRefundReturnToStock] = useState(true);
  const [isRefunding, setIsRefunding] = useState(false);
  const printTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [printer, setPrinter] = useState<EscPosConnection | null>(null);
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [useHardwarePrint, setUseHardwarePrint] = useState(false);
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    branchId: '',
    paymentMethod: '',
    from: '',
    to: '',
  });
  const effectiveFilterBranchId = resolveBranchId(filters.branchId) || '';
  const effectiveReturnBranchId = resolveBranchId(returnForm.branchId) || '';
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const branchOptions = useMemo(
    () => [
      { value: '', label: common('globalBranch') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );

  const paymentOptions = useMemo(
    () => [
      { value: '', label: common('allPayments') },
      { value: 'CASH', label: common('paymentCash') },
      { value: 'CARD', label: common('paymentCard') },
      { value: 'MOBILE_MONEY', label: common('paymentMobileMoney') },
      { value: 'BANK_TRANSFER', label: common('paymentBank') },
      { value: 'OTHER', label: common('paymentOther') },
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

  const loadCustomerOptions = useCallback(async (inputValue: string) => {
    const token = getAccessToken();
    if (!token) return [];
    try {
      const data = await apiFetch<PaginatedResponse<Customer> | Customer[]>(
        `/customers?search=${encodeURIComponent(inputValue)}&limit=25`,
        { token },
      );
      return normalizePaginated(data).items.map((c) => ({ value: c.id, label: c.name }));
    } catch {
      return [];
    }
  }, []);

  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const results = await Promise.allSettled([
      apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', { token }),
      apiFetch<PaginatedResponse<Customer> | Customer[]>('/customers?limit=50', { token }),
      apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', { token }),
      apiFetch<PaginatedResponse<User> | User[]>('/users?limit=200', { token }),
    ]);
    if (results[0].status === 'fulfilled') {
      setBranches(normalizePaginated(results[0].value).items);
    } else {
      setBranches([]);
    }
    if (results[1].status === 'fulfilled') {
      setCustomers(normalizePaginated(results[1].value).items);
    } else {
      setCustomers([]);
    }
    if (results[2].status === 'fulfilled') {
      const variantList = normalizePaginated(results[2].value).items;
      setVariants(variantList);
      seedVariantCache(variantList);
    } else {
      setVariants([]);
    }
    if (results[3].status === 'fulfilled') {
      setUsers(normalizePaginated(results[3].value).items);
    } else {
      setUsers([]);
    }
  }, [seedVariantCache]);

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
        targetPage === 1 ? null : pageCursors[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        search: filters.search || undefined,
        branchId: effectiveFilterBranchId || undefined,
        paymentMethod: filters.paymentMethod || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const data = await apiFetch<
        PaginatedResponse<ReceiptResponse> | ReceiptResponse[]
      >(`/sales/receipts${query}`, { token });
      const receiptResult = normalizePaginated(data);
      setReceipts(receiptResult.items);
      setNextCursor(receiptResult.nextCursor);
      if (typeof receiptResult.total === 'number') {
        setTotal(receiptResult.total);
      }
    setPage(targetPage);
    setPageCursors((prev) => {
      const nextState: Record<number, string | null> =
        targetPage === 1 ? { 1: null } : { ...prev };
      if (receiptResult.nextCursor) {
        nextState[targetPage + 1] = receiptResult.nextCursor;
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
  }, [pageSize, pageCursors, filters.search, effectiveFilterBranchId, filters.paymentMethod, filters.from, filters.to, t]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [load]);

  useEffect(() => {
    if (activeBranch?.id && !returnForm.branchId) {
      setReturnForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
  }, [activeBranch?.id, returnForm.branchId]);

  useEffect(() => {
    return () => {
      if (printTimerRef.current) clearTimeout(printTimerRef.current);
    };
  }, []);

  const buildReceiptText = useCallback(
    (receipt: ReceiptResponse) => {
      if (!receipt.data) {
        return null;
      }
      const labels: ReceiptLabels = {
        receipt: common('receiptLabelReceipt'),
        cashier: common('receiptLabelCashier'),
        customer: common('receiptLabelCustomer'),
        tin: common('receiptLabelTin'),
        subtotal: common('receiptLabelSubtotal'),
        discounts: common('receiptLabelDiscounts'),
        vat: common('receiptLabelVat'),
        total: common('receiptLabelTotal'),
        payment: common('receiptLabelPayment'),
      };
      return buildReceiptLines(
        {
          receiptNumber: receipt.receiptNumber,
          issuedAt: receipt.issuedAt,
          data: receipt.data,
        },
        32,
        currency,
        locale,
        labels,
        timezone,
        dateFormat,
      );
    },
    [currency, locale, common],
  );

  const connectPrinter = async () => {
    if (isConnectingPrinter) {
      return;
    }
    setIsConnectingPrinter(true);
    setMessage(null);
    try {
      const connection = await connectEscPosPrinter();
      setPrinter(connection);
      setUseHardwarePrint(true);
      setMessage({ action: 'save', outcome: 'success', message: t('printerConnected') });
    } catch (error) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: t('printerConnectFailed'),
      });
    } finally {
      setIsConnectingPrinter(false);
    }
  };

  const reprint = async (receiptId: string) => {
    if (!canRead) {
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsReprinting(receiptId);
    try {
      await apiFetch(`/sales/receipts/${receiptId}/reprint`, {
        token,
        method: 'POST',
      });
      const target = receipts.find((receipt) => receipt.id === receiptId) || null;
      setSelected(target);
      if (useHardwarePrint && printer && target) {
        const lines = buildReceiptText(target);
        if (lines) {
          try {
            await printEscPosLines(printer, lines);
          } catch (err) {
            console.warn('Receipt print failed', err);
            setMessage({
              action: 'save',
              outcome: 'failure',
              message: t('printerConnectFailed'),
            });
          }
        } else {
          setMessage({ action: 'save', outcome: 'warning', message: t('noReceiptData') });
        }
      } else {
        printTimerRef.current = setTimeout(() => window.print(), 100);
      }
    } catch (err) {
      setMessage({ action: 'save', outcome: 'failure', message: getApiErrorMessage(err, t('reprintFailed')) });
    } finally {
      setIsReprinting(null);
    }
  };

  const receiptData = useMemo(() => selected?.data ?? null, [selected]);
  const cashierLookup = useMemo(() => {
    return new Map(
      users.map((user) => [
        user.id,
        user.name?.trim() || user.email?.trim() || null,
      ]),
    );
  }, [users]);
  const previewReceiptData = useMemo(() => {
    if (!receiptData) {
      return null;
    }
    const cashierLabel = receiptData.cashierId
      ? cashierLookup.get(receiptData.cashierId) ?? receiptData.cashierId
      : null;
    return { ...receiptData, cashierId: cashierLabel ?? receiptData.cashierId };
  }, [receiptData, cashierLookup]);
  const outstandingAmount = selected?.sale?.outstandingAmount
    ? Number(selected.sale.outstandingAmount)
    : 0;

  const submitSettlement = async () => {
    if (!canSettleCredit) {
      return;
    }
    const token = getAccessToken();
    if (!token || !selected?.sale?.id || !settlement.amount) {
      return;
    }
    setMessage(null);
    setIsSettling(true);
    try {
      await apiFetch(`/sales/${selected.sale.id}/settlements`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          amount: Number(settlement.amount),
          method: settlement.method,
          reference: settlement.reference || undefined,
          methodLabel: settlement.methodLabel || undefined,
        }),
      });
      setSettlement({ amount: '', method: 'CASH', reference: '', methodLabel: '' });
      await load(page);
      setMessage({ action: 'update', outcome: 'success', message: t('settlementRecorded') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('settlementFailed')),
      });
    } finally {
      setIsSettling(false);
    }
  };

  const addReturnItem = () => {
    setReturnItems((prev) => [
      ...prev,
      { variantId: '', quantity: '', unitPrice: '' },
    ]);
  };

  const updateReturnItem = (
    index: number,
    data: Partial<{ variantId: string; quantity: string; unitPrice: string }>,
  ) => {
    setReturnItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...data };
      return next;
    });
  };

  const submitReturnWithoutReceipt = async () => {
    if (!canReturnWithoutReceipt) {
      return;
    }
    const token = getAccessToken();
    if (!token || !effectiveReturnBranchId) {
      return;
    }
    const items = returnItems
      .filter((item) => item.variantId && item.quantity && item.unitPrice)
      .map((item) => ({
        variantId: item.variantId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      }));
    if (items.length === 0) {
      setMessage({ action: 'save', outcome: 'warning', message: t('returnItemRequired') });
      return;
    }
    setMessage(null);
    setIsReturning(true);
    try {
      const response = await apiFetch<SalesActionResponse>(
        '/sales/returns/without-receipt',
        {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: effectiveReturnBranchId,
          customerId: returnForm.customerId || undefined,
          reason: returnForm.reason || undefined,
          returnToStock,
          items,
        }),
        },
      );
      if (response?.approvalRequired) {
        setMessage({ action: 'save', outcome: 'warning', message: t('returnNeedsApproval') });
        return;
      }
      setReturnForm({ branchId: '', customerId: '', reason: '' });
      setReturnItems([{ variantId: '', quantity: '', unitPrice: '' }]);
      setReturnToStock(true);
      await load(page);
      setMessage({ action: 'save', outcome: 'success', message: t('returnRecorded') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('returnFailed')),
      });
    } finally {
      setIsReturning(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  const refundSale = async () => {
    if (!canRefund) {
      return;
    }
    const token = getAccessToken();
    if (!token || !selected?.sale?.id) {
      return;
    }
    setIsRefunding(true);
    setMessage(null);
    try {
      const response = await apiFetch<SalesActionResponse>(
        `/sales/${selected.sale.id}/refund`,
        {
        token,
        method: 'POST',
        body: JSON.stringify({
          reason: refundReason || undefined,
          returnToStock: refundReturnToStock,
        }),
        },
      );
      if (response?.approvalRequired) {
        setMessage({ action: 'save', outcome: 'warning', message: t('refundNeedsApproval') });
        return;
      }
      setRefundReason('');
      setRefundReturnToStock(true);
      await load(page);
      setMessage({ action: 'save', outcome: 'success', message: t('refundRecorded') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('refundFailed')),
      });
    } finally {
      setIsRefunding(false);
    }
  };

  return (
    <section className="nvi-page">
      <PremiumPageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <>
            <button
              type="button"
              onClick={connectPrinter}
              className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:opacity-70"
              disabled={isConnectingPrinter}
            >
              {isConnectingPrinter ? t('printerConnecting') : t('connectPrinter')}
            </button>
            <label className="flex items-center gap-2 text-xs text-gold-200">
              <input
                type="checkbox"
                className="h-3 w-3 accent-gold-400"
                checked={useHardwarePrint}
                onChange={(event) => setUseHardwarePrint(event.target.checked)}
                disabled={!printer}
              />
              {t('hardwarePrint')}
            </label>
            <ViewToggle
              value={viewMode}
              onChange={setViewMode}
              labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
            />
          </>
        }
      />
      {message ? <StatusBanner message={message} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiReceiptRows')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{receipts.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiCurrentPage')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{page}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiOutstanding')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{formatCurrency(outstandingAmount, currency)}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            {t('kpiSelectedReceipt')}
          </p>
          <p className="mt-2 text-xl font-semibold text-gold-100">
            {selected ? selected.receiptNumber : t('none')}
          </p>
        </article>
      </div>
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
          instanceId="receipts-filter-branch"
          value={filters.branchId}
          onChange={(value) => pushFilters({ branchId: value })}
          options={branchOptions}
          placeholder={common('branch')}
          className="nvi-select-container"
        />
        <SmartSelect
          instanceId="receipts-filter-payment-method"
          value={filters.paymentMethod}
          onChange={(value) => pushFilters({ paymentMethod: value })}
          options={paymentOptions}
          placeholder={t('paymentMethod')}
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

      <div className="command-card nvi-panel p-4 space-y-3 nvi-reveal">
        {viewMode === 'table' ? (
          receipts.length === 0 ? (
            <StatusBanner message={t('noReceipts')} />
          ) : (
            <div className="overflow-auto text-sm text-gold-200">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('receiptNumberLabel')}</th>
                    <th className="px-3 py-2">{t('issuedAt')}</th>
                    <th className="px-3 py-2">{t('total')}</th>
                    <th className="px-3 py-2">{t('actionsLabel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((receipt) => (
                    <tr key={receipt.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2 font-semibold">{receipt.receiptNumber}</td>
                      <td className="px-3 py-2">
                        {formatDateTime(receipt.issuedAt)}
                      </td>
                      <td className="px-3 py-2">
                        {receipt.sale?.total ?? t('empty')}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setSelected(receipt)}
                            className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                          >
                            {actions('view')}
                          </button>
                          <button
                            type="button"
                            onClick={() => reprint(receipt.id)}
                            className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                            disabled={!canRead || isReprinting === receipt.id}
                            title={!canRead ? noAccess('title') : undefined}
                          >
                            {isReprinting === receipt.id ? (
                              <Spinner size="xs" variant="dots" />
                            ) : null}
                            {isReprinting === receipt.id ? t('reprinting') : t('reprint')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : receipts.length === 0 ? (
          <StatusBanner message={t('noReceipts')} />
        ) : (
          receipts.map((receipt) => (
            <div
              key={receipt.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-700/20 pb-2 text-sm text-gold-200"
            >
              <div>
                <p className="text-gold-100">{receipt.receiptNumber}</p>
                <p className="text-xs text-gold-400">
                  {formatDateTime(receipt.issuedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(receipt)}
                  className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                >
                  {actions('view')}
                </button>
                <button
                  type="button"
                  onClick={() => reprint(receipt.id)}
                  className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={!canRead || isReprinting === receipt.id}
                  title={!canRead ? noAccess('title') : undefined}
                >
                  {isReprinting === receipt.id ? (
                    <Spinner size="xs" variant="dots" />
                  ) : null}
                  {isReprinting === receipt.id ? t('reprinting') : t('reprint')}
                </button>
              </div>
            </div>
          ))
        )}
        <div className="pt-2">
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            itemCount={receipts.length}
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
        </div>
      </div>

      {selected ? (
        <div className="command-card nvi-panel p-4 space-y-3 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gold-100">
                {previewT('title')}
              </h3>
              <p className="text-xs text-gold-400">{selected.receiptNumber}</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPreviewMode('compact')}
                className={`rounded border px-3 py-1 ${
                  previewMode === 'compact'
                    ? 'border-gold-500 text-gold-100'
                    : 'border-gold-700/50 text-gold-400'
                }`}
              >
                {previewT('compact')}
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('detailed')}
                className={`rounded border px-3 py-1 ${
                  previewMode === 'detailed'
                    ? 'border-gold-500 text-gold-100'
                    : 'border-gold-700/50 text-gold-400'
                }`}
              >
                {previewT('detailed')}
              </button>
            </div>
          </div>
          <ReceiptPreview
            receiptNumber={selected.receiptNumber}
            issuedAt={selected.issuedAt}
            data={previewReceiptData ?? undefined}
            mode={previewMode}
          />
        </div>
      ) : null}

      {selected?.sale && outstandingAmount > 0 ? (
        <div className="command-card nvi-panel p-4 space-y-2 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">
            {t('settlementTitle')}
          </h3>
          <p className="text-xs text-gold-400">
            {t('outstandingLabel', {
              amount: formatCurrency(outstandingAmount, currency),
              due: selected.sale.creditDueDate
                ? formatDate(selected.sale.creditDueDate)
                : '',
            })}
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <SmartSelect
              instanceId="receipts-settlement-method"
              value={settlement.method}
              onChange={(value) =>
                setSettlement({ ...settlement, method: value })
              }
              options={[
                { value: 'CASH', label: t('paymentCash') },
                { value: 'CARD', label: t('paymentCard') },
                { value: 'MOBILE_MONEY', label: t('paymentMobileMoney') },
                { value: 'BANK_TRANSFER', label: t('paymentBankTransfer') },
                { value: 'OTHER', label: t('paymentOther') },
              ]}
              className="nvi-select-container"
            />
            <CurrencyInput
              value={settlement.amount}
              onChange={(value) =>
                setSettlement({ ...settlement, amount: value })
              }
              placeholder={t('amount')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
            />
            {settlement.method === 'OTHER' ? (
              <input
                value={settlement.methodLabel}
                onChange={(event) =>
                  setSettlement({ ...settlement, methodLabel: event.target.value })
                }
                placeholder={t('paymentLabel')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
              />
            ) : null}
            <input
              value={settlement.reference}
              onChange={(event) =>
                setSettlement({ ...settlement, reference: event.target.value })
              }
              placeholder={t('referenceOptional')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
            />
          </div>
          <button
            type="button"
            onClick={submitSettlement}
            className="nvi-cta rounded px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canSettleCredit || isSettling}
            title={!canSettleCredit ? noAccess('title') : undefined}
          >
            {isSettling ? <Spinner size="xs" variant="pulse" /> : null}
            {isSettling ? t('recording') : t('recordSettlement')}
          </button>
        </div>
      ) : null}

      {selected?.sale ? (
        <div className="command-card nvi-panel p-4 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">
            {t('refundTitle')}
          </h3>
          <div className="grid gap-2 md:grid-cols-2">
            <input
              value={refundReason}
              onChange={(event) => setRefundReason(event.target.value)}
              placeholder={t('refundReasonOptional')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
            />
            <label className="flex items-center gap-2 text-xs text-gold-200">
              <input
                type="checkbox"
                checked={refundReturnToStock}
                onChange={(event) => setRefundReturnToStock(event.target.checked)}
              />
              {t('returnToStock')}
            </label>
          </div>
          <button
            type="button"
            onClick={refundSale}
            className="nvi-cta rounded px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canRefund || isRefunding}
            title={!canRefund ? noAccess('title') : undefined}
          >
            {isRefunding ? <Spinner size="xs" variant="pulse" /> : null}
            {isRefunding ? t('refunding') : t('refundSale')}
          </button>
        </div>
      ) : null}

      <div className="command-card nvi-panel p-4 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">
          {t('returnTitle')}
        </h3>
        <div className="grid gap-2 md:grid-cols-3">
          <SmartSelect
            instanceId="receipts-return-branch"
            value={returnForm.branchId}
            onChange={(value) =>
              setReturnForm({ ...returnForm, branchId: value })
            }
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            placeholder={t('selectBranch')}
            isClearable
            className="nvi-select-container"
          />
          <AsyncSmartSelect
            instanceId="receipts-return-customer"
            value={returnForm.customerId ? { value: returnForm.customerId, label: customers.find((c) => c.id === returnForm.customerId)?.name ?? returnForm.customerId } : null}
            onChange={(opt) => setReturnForm({ ...returnForm, customerId: opt?.value ?? '' })}
            loadOptions={loadCustomerOptions}
            defaultOptions={customers.map((c) => ({ value: c.id, label: c.name }))}
            placeholder={t('customerOptional')}
            isClearable
            className="nvi-select-container"
          />
          <input
            value={returnForm.reason}
            onChange={(event) =>
              setReturnForm({ ...returnForm, reason: event.target.value })
            }
            placeholder={t('reasonOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
          />
          <label className="flex items-center gap-2 text-xs text-gold-200">
            <input
              type="checkbox"
              checked={returnToStock}
              onChange={(event) => setReturnToStock(event.target.checked)}
            />
            {t('returnToStock')}
          </label>
        </div>
        <div className="space-y-2 nvi-stagger">
          {returnItems.map((item, index) => (
            <div key={`return-${index}`} className="grid gap-2 md:grid-cols-3">
              <AsyncSmartSelect
                instanceId={`receipts-return-item-${index}-variant`}
                value={getVariantOption(item.variantId)}
                loadOptions={loadVariantOptions}
                defaultOptions={variants.map((v) => ({
                  value: v.id,
                  label: formatVariantLabel({
                    id: v.id,
                    name: v.name,
                    productName: v.product?.name ?? null,
                  }),
                }))}
                onChange={(opt) =>
                  updateReturnItem(index, { variantId: opt?.value ?? '' })
                }
                placeholder={t('selectVariant')}
                isClearable
                className="nvi-select-container"
              />
              <input
                value={item.quantity}
                onChange={(event) =>
                  updateReturnItem(index, { quantity: event.target.value })
                }
                type="number"
                placeholder={t('quantity')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
              />
              <input
                value={item.unitPrice}
                onChange={(event) =>
                  updateReturnItem(index, { unitPrice: event.target.value })
                }
                type="number"
                placeholder={t('unitPrice')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addReturnItem}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canReturnWithoutReceipt}
            title={!canReturnWithoutReceipt ? noAccess('title') : undefined}
          >
            {t('addItem')}
          </button>
          <button
            type="button"
            onClick={submitReturnWithoutReceipt}
            className="nvi-cta rounded px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canReturnWithoutReceipt || isReturning}
            title={!canReturnWithoutReceipt ? noAccess('title') : undefined}
          >
            {isReturning ? <Spinner size="xs" variant="orbit" /> : null}
            {isReturning ? t('submitting') : t('submitReturn')}
          </button>
        </div>
      </div>

      <div
        id="receipt-print"
        className="hidden print:block"
        data-template={receiptData?.receiptTemplate ?? 'THERMAL'}
      >
        {selected ? (
          <ReceiptPreview
            receiptNumber={selected.receiptNumber}
            issuedAt={selected.issuedAt}
            data={previewReceiptData ?? undefined}
            mode={previewMode}
          />
        ) : null}
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          body * {
            visibility: hidden;
          }
          #receipt-print,
          #receipt-print * {
            visibility: visible;
          }
          #receipt-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            padding: 16px;
          }
          #receipt-print .receipt-paper {
            background: white !important;
            border-color: #ddd !important;
          }
          #receipt-print .receipt-paper * {
            color: #111 !important;
          }
          #receipt-print[data-template='THERMAL'] .receipt-paper {
            max-width: 320px;
            margin: 0 auto;
          }
        }
      `}</style>
    </section>
  );
}
