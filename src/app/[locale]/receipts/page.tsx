'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatEntityLabel, formatVariantLabel } from '@/lib/display';
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
  type ReceiptLine,
} from '@/lib/receipt-print';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type ReceiptData = ReceiptPrintData & {
  cashierId?: string | null;
  customer?: {
    name?: string | null;
    phone?: string | null;
    tin?: string | null;
  } | null;
  branchContact?: {
    address?: string | null;
    phone?: string | null;
  } | null;
};

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
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('sales.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isReprinting, setIsReprinting] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptResponse[]>([]);
  const [selected, setSelected] = useState<ReceiptResponse | null>(null);
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
  const activeBranch = useActiveBranch();
  const [returnItems, setReturnItems] = useState([
    { variantId: '', quantity: '', unitPrice: '' },
  ]);
  const [refundReason, setRefundReason] = useState('');
  const [refundReturnToStock, setRefundReturnToStock] = useState(true);
  const [isRefunding, setIsRefunding] = useState(false);
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
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const branchOptions = useMemo(
    () => [
      { value: '', label: common('allBranches') },
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
        search: filters.search || undefined,
        branchId: filters.branchId || undefined,
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
      const results = await Promise.allSettled([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<Customer> | Customer[]>('/customers?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
          token,
        }),
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
        setVariants(normalizePaginated(results[2].value).items);
      } else {
        setVariants([]);
      }
      if (results[3].status === 'fulfilled') {
        setUsers(normalizePaginated(results[3].value).items);
      } else {
        setUsers([]);
      }
    } catch {
      setMessage({ action: 'load', outcome: 'failure', message: t('loadFailed') });
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
    filters.paymentMethod,
    filters.from,
    filters.to,
  ]);

  useEffect(() => {
    if (activeBranch?.id && !returnForm.branchId) {
      setReturnForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
  }, [activeBranch?.id, returnForm.branchId]);

  const buildReceiptText = useCallback(
    (receipt: ReceiptResponse) => {
      if (!receipt.data) {
        return null;
      }
      return buildReceiptLines(
        {
          receiptNumber: receipt.receiptNumber,
          issuedAt: receipt.issuedAt,
          data: receipt.data,
        },
        32,
      );
    },
    [],
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
          } catch {
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
        setTimeout(() => window.print(), 100);
      }
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
  const outstandingAmount = selected?.sale?.outstandingAmount
    ? Number(selected.sale.outstandingAmount)
    : 0;

  const submitSettlement = async () => {
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
    } catch {
      setMessage({ action: 'save', outcome: 'failure', message: t('settlementFailed') });
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
    const token = getAccessToken();
    if (!token || !returnForm.branchId) {
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
          branchId: returnForm.branchId,
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
    } catch {
      setMessage({ action: 'save', outcome: 'failure', message: t('returnFailed') });
    } finally {
      setIsReturning(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  const refundSale = async () => {
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
    } catch {
      setMessage({ action: 'save', outcome: 'failure', message: t('refundFailed') });
    } finally {
      setIsRefunding(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
          <p className="text-sm text-gold-300">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
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
          value={filters.branchId}
          onChange={(value) => pushFilters({ branchId: value })}
          options={branchOptions}
          placeholder={common('branch')}
          className="nvi-select-container"
        />
        <SmartSelect
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

      <div className="command-card p-4 space-y-3 nvi-reveal">
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
                        {new Date(receipt.issuedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {receipt.sale?.total ?? t('empty')}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            onClick={() => setSelected(receipt)}
                            className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                          >
                            {actions('view')}
                          </button>
                          <button
                            onClick={() => reprint(receipt.id)}
                            className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                            disabled={isReprinting === receipt.id}
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
                  {new Date(receipt.issuedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelected(receipt)}
                  className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                >
                  {actions('view')}
                </button>
                <button
                  onClick={() => reprint(receipt.id)}
                  className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isReprinting === receipt.id}
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
        <div className="command-card p-4 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('detailTitle')}</h3>
          <p className="text-xs text-gold-400">{selected.receiptNumber}</p>
          {receiptData ? (
            <div className="space-y-2 text-sm text-gold-200">
              <p>
                {t('businessLabel', {
                  value: receiptData.businessName ?? t('empty'),
                })}
              </p>
              <p>
                {t('branchLabel', { value: receiptData.branchName ?? t('empty') })}
              </p>
              <p>
                {t('cashierLabel', {
                  value: formatEntityLabel(
                    {
                      name: receiptData.cashierId
                        ? cashierLookup.get(receiptData.cashierId) ?? null
                        : null,
                      id: receiptData.cashierId ?? null,
                    },
                    t('empty'),
                  ),
                })}
              </p>
              <p>{t('templateLabel', { value: receiptData.receiptTemplate || 'THERMAL' })}</p>
              {receiptData.customer ? (
                <p>
                  {t('customerLabel', {
                    name: receiptData.customer.name ?? t('empty'),
                    phone: receiptData.customer.phone || t('empty'),
                    tin: receiptData.customer.tin || t('empty'),
                  })}
                </p>
              ) : null}
              {receiptData.receiptHeader ? (
                <p>{t('headerLabel', { value: receiptData.receiptHeader })}</p>
              ) : null}
              {receiptData.receiptFooter ? (
                <p>{t('footerLabel', { value: receiptData.receiptFooter })}</p>
              ) : null}
              <div className="space-y-1">
                {receiptData.lines?.map((line: ReceiptLine, index: number) => (
                  <div key={index} className="text-xs text-gold-300">
                    {t('lineItem', {
                      name: formatVariantLabel(
                        {
                          id: line.variantId ?? null,
                          name: line.variantName ?? null,
                          productName: line.productName ?? null,
                        },
                        t('empty'),
                      ),
                      qty: line.quantity ?? 0,
                      price: line.unitPrice ?? 0,
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gold-300">{t('noReceiptData')}</p>
          )}
        </div>
      ) : null}

      {selected?.sale && outstandingAmount > 0 ? (
        <div className="command-card p-4 space-y-2 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">
            {t('settlementTitle')}
          </h3>
          <p className="text-xs text-gold-400">
            {t('outstandingLabel', {
              amount: outstandingAmount.toFixed(2),
              due: selected.sale.creditDueDate
                ? new Date(selected.sale.creditDueDate).toLocaleDateString()
                : '',
            })}
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <SmartSelect
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
            <input
              value={settlement.amount}
              onChange={(event) =>
                setSettlement({ ...settlement, amount: event.target.value })
              }
              type="number"
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
            onClick={submitSettlement}
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite || isSettling}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isSettling ? <Spinner size="xs" variant="pulse" /> : null}
            {isSettling ? t('recording') : t('recordSettlement')}
          </button>
        </div>
      ) : null}

      {selected?.sale ? (
        <div className="command-card p-4 space-y-3 nvi-reveal">
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
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite || isRefunding}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isRefunding ? <Spinner size="xs" variant="pulse" /> : null}
            {isRefunding ? t('refunding') : t('refundSale')}
          </button>
        </div>
      ) : null}

      <div className="command-card p-4 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">
          {t('returnTitle')}
        </h3>
        <div className="grid gap-2 md:grid-cols-3">
          <SmartSelect
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
          <SmartSelect
            value={returnForm.customerId}
            onChange={(value) =>
              setReturnForm({ ...returnForm, customerId: value })
            }
            options={customers.map((customer) => ({
              value: customer.id,
              label: customer.name,
            }))}
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
        <div className="space-y-2">
          {returnItems.map((item, index) => (
            <div key={`return-${index}`} className="grid gap-2 md:grid-cols-3">
              <SmartSelect
                value={item.variantId}
                onChange={(value) =>
                  updateReturnItem(index, { variantId: value })
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
            disabled={!canWrite}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {t('addItem')}
          </button>
          <button
            type="button"
            onClick={submitReturnWithoutReceipt}
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite || isReturning}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isReturning ? <Spinner size="xs" variant="orbit" /> : null}
            {isReturning ? t('submitting') : t('submitReturn')}
          </button>
        </div>
      </div>

      <div id="receipt-print" className="hidden print:block">
        {receiptData ? (
          <div className="rounded border border-neutral-200 bg-white p-4 text-black">
            <h1 className="text-lg font-semibold">{receiptData.businessName}</h1>
            <p className="text-xs">{receiptData.branchName}</p>
            {receiptData.branchContact ? (
              <p className="text-[10px] text-neutral-700">
                {[receiptData.branchContact.address, receiptData.branchContact.phone]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
            {receiptData.customer ? (
              <p className="text-[10px] text-neutral-700">
                {receiptData.customer.name}
                {receiptData.customer.phone
                  ? ` · ${receiptData.customer.phone}`
                  : ''}
                {receiptData.customer.tin ? ` · TIN ${receiptData.customer.tin}` : ''}
              </p>
            ) : null}
            {receiptData.receiptHeader ? (
              <p className="text-xs">{receiptData.receiptHeader}</p>
            ) : null}
            <p className="text-xs">
              {t('receiptNumber', { value: selected?.receiptNumber ?? '' })}
            </p>
            <div className="mt-2 space-y-1 text-xs">
              {receiptData.lines?.map((line: ReceiptLine, index: number) => (
                <div key={index} className="flex justify-between">
                  <span>
                    {formatVariantLabel(
                      {
                        id: line.variantId ?? null,
                        name: line.variantName ?? null,
                        productName: line.productName ?? null,
                      },
                      line.variantName ?? 'Item',
                    )}
                  </span>
                  <span>
                    {line.quantity} × {line.unitPrice}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs">
              <p>{t('totalLabel', { value: receiptData.totals?.total ?? 0 })}</p>
            </div>
            {receiptData.receiptFooter ? (
              <p className="mt-2 text-xs">{receiptData.receiptFooter}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <style jsx global>{`
        @media print {
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
        }
      `}</style>
    </section>
  );
}
