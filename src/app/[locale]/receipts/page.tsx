'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { useVariantSearch } from '@/lib/use-variant-search';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { Banner } from '@/components/notifications/Banner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
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
import { ReceiptDetailModal } from '@/components/receipts/ReceiptDetailModal';
import { NoReceiptReturnModal } from '@/components/receipts/NoReceiptReturnModal';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';

import { useCurrency, formatCurrency, useFormatDate, useTimezone, useDateFormat } from '@/lib/business-context';
import {
  ListPage,
  Card,
  Icon,
  ActionButtons,
} from '@/components/ui';

type ReceiptData = ReceiptPrintData;

type ReceiptRecord = {
  id: string;
  saleId: string;
  receiptNumber: string;
  issuedAt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: ReceiptData | any;
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

function getPaymentMethodIcon(method: string): 'Banknote' | 'CreditCard' | 'Smartphone' | 'Building' | 'CircleDot' {
  switch (method) {
    case 'CASH': return 'Banknote';
    case 'CARD': return 'CreditCard';
    case 'MOBILE_MONEY': return 'Smartphone';
    case 'BANK_TRANSFER': return 'Building';
    default: return 'CircleDot';
  }
}

function getReceiptStatus(receipt: ReceiptResponse): { key: string; color: string; dotColor: string } {
  const outstanding = receipt.sale?.outstandingAmount ? Number(receipt.sale.outstandingAmount) : 0;
  if (outstanding > 0) return { key: 'CREDIT', color: 'text-amber-400', dotColor: 'bg-amber-400' };
  return { key: 'COMPLETED', color: 'text-emerald-400', dotColor: 'bg-emerald-400' };
}

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
  const [returnModalOpen, setReturnModalOpen] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, effectiveFilterBranchId, filters.paymentMethod, filters.from, filters.to, pageSize]);

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
      setReturnModalOpen(false);
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

  const receiptData = useMemo((): ReceiptData | null => {
    const raw = selected?.data;
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as ReceiptData; } catch { return null; }
    }
    return raw as ReceiptData;
  }, [selected]);

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

  const receiptStats = useMemo(() => {
    if (receipts.length === 0) return null;
    const totalSales = receipts.reduce((sum, r) => {
      const saleTotal = r.sale?.total != null ? Number(r.sale.total) : 0;
      return sum + saleTotal;
    }, 0);
    const totalItems = receipts.reduce((sum, r) => {
      return sum + (r.data?.lines?.length ?? 0);
    }, 0);
    return {
      avgSale: totalSales / receipts.length,
      avgItems: totalItems / receipts.length,
    };
  }, [receipts]);

  // ─── Computed: today's receipts count ────────────────────────────────────
  const todayCount = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return receipts.filter((r) => r.issuedAt.slice(0, 10) === todayStr).length;
  }, [receipts]);

  // ─── Computed: total outstanding across visible receipts ─────────────────
  const totalOutstanding = useMemo(() => {
    return receipts.reduce((sum, r) => {
      const amt = r.sale?.outstandingAmount ? Number(r.sale.outstandingAmount) : 0;
      return sum + amt;
    }, 0);
  }, [receipts]);

  // ─── Active filter description ───────────────────────────────────────────
  const activeFilterLabel = useMemo(() => {
    const parts: string[] = [];
    if (filters.search) parts.push(filters.search);
    if (filters.branchId) {
      const b = branches.find((br) => br.id === filters.branchId);
      if (b) parts.push(b.name);
    }
    if (filters.paymentMethod) parts.push(filters.paymentMethod);
    if (filters.from || filters.to) parts.push(`${filters.from || '...'} - ${filters.to || '...'}`);
    return parts.length > 0 ? parts.join(', ') : t('kpiAllReceipts');
  }, [filters, branches, t]);

  // ─── Branch lookup for receipt cards ─────────────────────────────────────
  const branchLookup = useMemo(() => {
    return new Map(branches.map((b) => [b.id, b.name]));
  }, [branches]);

  // ─── KPI Strip ───────────────────────────────────────────────────────────
  const kpiCards: {
    icon: 'Receipt' | 'Calendar' | 'DollarSign' | 'ListFilter';
    tone: 'amber' | 'emerald' | 'blue';
    label: string;
    value: string;
    truncate?: boolean;
  }[] = [
    {
      icon: 'Receipt',
      tone: 'amber',
      label: t('kpiTotalReceipts'),
      value: String(total ?? receipts.length),
    },
    {
      icon: 'Calendar',
      tone: 'emerald',
      label: t('kpiTodayReceipts'),
      value: String(todayCount),
    },
    {
      icon: 'DollarSign',
      tone: 'amber',
      label: t('kpiOutstanding'),
      value: formatCurrency(totalOutstanding, currency),
    },
    {
      icon: 'ListFilter',
      tone: 'blue',
      label: t('kpiCurrentFilter'),
      value: activeFilterLabel,
      truncate: true,
    },
  ];

  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      {kpiCards.map((k) => (
        <Card key={k.label}>
          <div className="flex items-center gap-3">
            <div className={`nvi-kpi-icon nvi-kpi-icon--${k.tone}`}>
              <Icon name={k.icon} size={20} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--muted)]">
                {k.label}
              </p>
              <p
                className={`font-semibold text-[color:var(--foreground)] ${
                  k.truncate
                    ? 'max-w-[180px] truncate text-sm'
                    : 'text-2xl font-bold'
                }`}
              >
                {k.value}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  // ─── Banner ──────────────────────────────────────────────────────────────
  const bannerNode = message ? (
    <Banner
      message={message.message}
      severity={message.outcome === 'success' ? 'success' : message.outcome === 'warning' ? 'warning' : 'error'}
      onDismiss={() => setMessage(null)}
    />
  ) : null;

  // ─── Header actions ──────────────────────────────────────────────────────
  const headerActions = (
    <div className="flex flex-wrap items-center gap-3">
      {canReturnWithoutReceipt ? (
        <button
          type="button"
          onClick={() => setReturnModalOpen(true)}
          className="nvi-press inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-1.5 text-xs text-[color:var(--foreground)]"
        >
          <Icon name="RotateCcw" size={14} />
          {t('returnTitle')}
        </button>
      ) : null}
      <button
        type="button"
        onClick={connectPrinter}
        className="nvi-press inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-1.5 text-xs text-[color:var(--foreground)] disabled:opacity-70"
        disabled={isConnectingPrinter}
      >
        <Icon name="Printer" size={14} />
        {isConnectingPrinter ? t('printerConnecting') : t('connectPrinter')}
      </button>
      <label className="flex items-center gap-2 text-xs text-[color:var(--foreground)]">
        <input
          type="checkbox"
          className="h-3 w-3 accent-[color:var(--accent)]"
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
  );

  // ─── Filters ─────────────────────────────────────────────────────────────
  const filtersNode = (
    <ListFilters
      searchValue={searchDraft}
      onSearchChange={setSearchDraft}
      onSearchSubmit={() => pushFilters({ search: searchDraft })}
      onReset={() => resetFilters()}
      isLoading={isLoading}
      showAdvanced={showAdvanced}
      onToggleAdvanced={() => setShowAdvanced((prev) => !prev)}
      placeholder={t('searchByReceiptNumber')}
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
        className="rounded-xl border border-[color:var(--border)] bg-black px-3 py-2 text-[color:var(--foreground)]"
      />
      <DatePickerInput
        value={filters.to}
        onChange={(value) => pushFilters({ to: value })}
        placeholder={common('toDate')}
        className="rounded-xl border border-[color:var(--border)] bg-black px-3 py-2 text-[color:var(--foreground)]"
      />
    </ListFilters>
  );

  // ─── Receipt stats row ───────────────────────────────────────────────────
  const statsRow = receiptStats ? (
    <div className="flex flex-wrap gap-4 text-xs text-[color:var(--muted)]">
      <span>{t('avgSale')}: {formatCurrency(receiptStats.avgSale, currency)}</span>
      <span>{t('avgItems')}: {receiptStats.avgItems.toFixed(1)}</span>
    </div>
  ) : null;


  // ─── Payment method pill ─────────────────────────────────────────────────
  const PaymentPill = ({ method }: { method: string }) => (
    <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-alt)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--foreground)] nvi-status-fade">
      <Icon name={getPaymentMethodIcon(method)} size={12} />
      {method.replace(/_/g, ' ')}
    </span>
  );

  // ─── Card view ───────────────────────────────────────────────────────────
  const cardsContent = (
    <div className="grid gap-4 md:grid-cols-2 nvi-stagger">
      {receipts.map((receipt) => {
        const status = getReceiptStatus(receipt);
        const saleTotal = receipt.sale?.total != null ? Number(receipt.sale.total) : null;
        const customerName = receipt.data?.customer?.name || null;
        const cashier = receipt.data?.cashierId
          ? cashierLookup.get(receipt.data.cashierId) ?? null
          : null;
        const branchName = receipt.data?.branchId
          ? branchLookup.get(receipt.data.branchId) ?? null
          : null;
        const payments = receipt.data?.payments ?? [];
        const isSelected = selected?.id === receipt.id;

        return (
          <Card
            key={receipt.id}
            className={`nvi-card-hover cursor-pointer ${isSelected ? 'ring-2 ring-[color:var(--accent)]' : ''}`}
          >
            <div onClick={() => setSelected(receipt)}>
              {/* Header row: receipt number + status dot */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon name="Hash" size={14} className="text-[color:var(--muted)]" />
                  <span className="font-mono text-sm font-semibold text-[color:var(--foreground)]">
                    {receipt.receiptNumber}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${status.dotColor} nvi-status-fade`} />
                  <span className={`text-[10px] font-medium ${status.color}`}>
                    {status.key}
                  </span>
                </div>
              </div>

              {/* Hero total */}
              {saleTotal !== null ? (
                <p className="text-2xl font-bold text-[color:var(--foreground)] mb-2">
                  {formatCurrency(saleTotal, currency)}
                </p>
              ) : null}

              {/* Payment method badges */}
              {payments.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {payments.map((p: { method: string }, i: number) => (
                    <PaymentPill key={i} method={p.method} />
                  ))}
                </div>
              ) : null}

              {/* Info rows */}
              <div className="space-y-1 text-xs text-[color:var(--muted)]">
                {customerName ? (
                  <p className="flex items-center gap-1.5">
                    <Icon name="Users" size={12} />
                    {customerName}
                  </p>
                ) : null}
                {branchName ? (
                  <p className="flex items-center gap-1.5">
                    <Icon name="Building2" size={12} />
                    {branchName}
                  </p>
                ) : null}
                {cashier ? (
                  <p className="flex items-center gap-1.5">
                    <Icon name="User" size={12} />
                    {cashier}
                  </p>
                ) : null}
                <p className="flex items-center gap-1.5">
                  <Icon name="Clock" size={12} />
                  {relativeTime(receipt.issuedAt)}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-3 flex items-center gap-1 border-t border-[color:var(--border)] pt-3">
              <ActionButtons
                actions={[
                  {
                    key: 'view',
                    icon: <Icon name="Eye" size={14} />,
                    label: actions('view'),
                    onClick: () => setSelected(receipt),
                  },
                  {
                    key: 'reprint',
                    icon: isReprinting === receipt.id ? <Spinner size="xs" variant="dots" /> : <Icon name="Printer" size={14} />,
                    label: t('reprint'),
                    onClick: () => reprint(receipt.id),
                    disabled: !canRead || isReprinting === receipt.id,
                  },
                  ...(canRefund && receipt.sale ? [{
                    key: 'refund',
                    icon: <Icon name="RotateCcw" size={14} />,
                    label: t('refundSale'),
                    onClick: () => setSelected(receipt),
                    variant: 'danger' as const,
                  }] : []),
                ]}
                size="xs"
              />
            </div>
          </Card>
        );
      })}
    </div>
  );

  // ─── Table view ──────────────────────────────────────────────────────────
  const tableContent = (
    <Card>
      <div className="overflow-auto text-sm">
        <table className="min-w-[780px] w-full text-left text-sm text-[color:var(--foreground)]">
          <thead className="text-xs uppercase text-[color:var(--muted)] border-b border-[color:var(--border)]">
            <tr>
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <Icon name="Hash" size={12} />
                  {t('receiptNumberLabel')}
                </span>
              </th>
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <Icon name="Users" size={12} />
                  {t('customerColumn')}
                </span>
              </th>
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <Icon name="Calendar" size={12} />
                  {t('issuedAt')}
                </span>
              </th>
              <th className="px-3 py-2 text-center">{t('itemsColumn')}</th>
              <th className="px-3 py-2 text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  <Icon name="DollarSign" size={12} />
                  {t('total')}
                </span>
              </th>
              <th className="px-3 py-2">{t('paymentMethod')}</th>
              <th className="px-3 py-2">{t('actionsLabel')}</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => {
              const status = getReceiptStatus(receipt);
              return (
                <tr key={receipt.id} className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface-alt)] transition-colors">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${status.dotColor} nvi-status-fade`} />
                      <span className="font-mono font-semibold">{receipt.receiptNumber}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {receipt.data?.customer?.name || t('empty')}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {formatDateTime(receipt.issuedAt)}
                  </td>
                  <td className="px-3 py-2 text-center text-xs">
                    {receipt.data?.lines?.length ?? t('empty')}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {receipt.sale?.total != null
                      ? formatCurrency(Number(receipt.sale.total), currency)
                      : t('empty')}
                  </td>
                  <td className="px-3 py-2">
                    {receipt.data?.payments?.[0]?.method ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-alt)] px-2 py-0.5 text-[10px] font-medium">
                        <Icon name={getPaymentMethodIcon(receipt.data.payments[0].method)} size={12} />
                        {receipt.data.payments[0].method.replace(/_/g, ' ')}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <ActionButtons
                      actions={[
                        { key: 'view', icon: <Icon name="Eye" size={14} />, label: actions('view'), onClick: () => setSelected(receipt) },
                        { key: 'reprint', icon: <Icon name="Printer" size={14} />, label: t('reprint'), onClick: () => reprint(receipt.id), disabled: !canRead || isReprinting === receipt.id },
                      ]}
                      size="xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  // ─── Pagination ──────────────────────────────────────────────────────────
  const paginationNode = (
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
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      <ListPage
        title={t('title')}
        subtitle={t('subtitle')}
        headerActions={headerActions}
        banner={bannerNode}
        kpis={kpiStrip}
        filters={filtersNode}
        beforeContent={statsRow}
        viewMode={viewMode}
        table={tableContent}
        cards={cardsContent}
        isEmpty={receipts.length === 0}
        emptyIcon={<Icon name="Receipt" size={32} className="text-amber-400/40 nvi-float" />}
        emptyTitle={t('noReceipts')}
        emptyDescription={t('subtitle')}
        pagination={paginationNode}
        isLoading={isLoading}
      />

      <ReceiptDetailModal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        receipt={selected}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        previewData={previewReceiptData}
        isReprinting={Boolean(selected && isReprinting === selected.id)}
        onReprint={() => selected && reprint(selected.id)}
        canRead={canRead}
        outstandingAmount={outstandingAmount}
        dueDateLabel={
          selected?.sale?.creditDueDate
            ? formatDate(selected.sale.creditDueDate)
            : null
        }
        currency={currency}
        settlement={settlement}
        onSettlementChange={setSettlement}
        onSubmitSettlement={submitSettlement}
        isSettling={isSettling}
        canSettleCredit={canSettleCredit}
        refundReason={refundReason}
        onRefundReasonChange={setRefundReason}
        refundReturnToStock={refundReturnToStock}
        onRefundReturnToStockChange={setRefundReturnToStock}
        onRefund={refundSale}
        isRefunding={isRefunding}
        canRefund={canRefund}
      />

      <NoReceiptReturnModal
        open={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        branches={branches}
        customers={customers}
        variants={variants}
        returnForm={returnForm}
        onReturnFormChange={setReturnForm}
        returnToStock={returnToStock}
        onReturnToStockChange={setReturnToStock}
        returnItems={returnItems}
        onAddItem={addReturnItem}
        onUpdateItem={updateReturnItem}
        loadCustomerOptions={loadCustomerOptions}
        loadVariantOptions={loadVariantOptions}
        getVariantOption={getVariantOption}
        isReturning={isReturning}
        onSubmit={submitReturnWithoutReceipt}
        canReturnWithoutReceipt={canReturnWithoutReceipt}
      />

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
    </>
  );
}
