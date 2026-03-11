'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import { getPendingCount } from '@/lib/offline-store';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { TypeaheadInput } from '@/components/TypeaheadInput';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { formatVariantLabel } from '@/lib/display';
import {
  getBranchModeForPathname,
  resolveBranchIdForMode,
} from '@/lib/branch-policy';
import { useCurrency, useFormatDate } from '@/lib/business-context';
import { ZERO_DECIMAL_CURRENCIES } from '@/lib/currencies';

type Branch = { id: string; name: string };
type SaleRow = {
  id?: string;
  total: number | string;
  createdAt?: string;
  completedAt?: string;
};
type PnlTotals = {
  revenue: number;
  grossProfit: number;
  expenses: number;
};
type PnlReport = { totals: PnlTotals };
type LowStock = {
  id: string;
  quantity?: number | string;
  variant?: {
    id: string;
    name?: string | null;
    sku?: string | null;
    product?: { name?: string | null } | null;
  } | null;
  branch?: { id: string; name: string } | null;
};
type Approval = { id: string };
type Shift = { id: string; status: string };
type NotificationPreview = {
  id: string;
  title: string;
  message: string;
  status?: string | null;
  createdAt: string;
};
type ReceiptRow = {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  sale?: {
    id?: string;
    total?: number | string;
  } | null;
};
type TopLosses = {
  days: number;
  items: {
    variantId: string;
    variantName: string | null;
    productName: string | null;
    sku: string | null;
    totalCost: number;
    quantity: number;
  }[];
};
type TopProduct = {
  variantId: string;
  variantName: string | null;
  productName: string | null;
  sku: string | null;
  totalRevenue: number;
  quantity: number;
  saleLineCount: number;
};
type SalesByBranch = {
  total: number;
  items: { branchId: string; branchName: string | null; totalSales: number; saleCount: number }[];
};
type ExpenseBreakdown = {
  total: number;
  items: { category: string; amount: number; count: number; percent: number }[];
};
type RecentActivity = {
  items: {
    id: string;
    type: 'sale' | 'transfer' | 'alert';
    createdAt: string;
    title: string;
    detail: string | null;
  }[];
};
type StockValueSummary = {
  stockValue: number;
  trackedVariants: number;
};
type SearchResults = {
  products: {
    id: string;
    name: string;
    variants: { id: string; name: string; sku?: string | null }[];
  }[];
  variants: {
    id: string;
    name: string;
    sku?: string | null;
    product?: { name?: string | null };
  }[];
  receipts: { id: string; receiptNumber: string }[];
  customers: { id: string; name: string }[];
  transfers: {
    id: string;
    sourceBranch?: { name?: string | null } | null;
    destinationBranch?: { name?: string | null } | null;
  }[];
};

const toLocalDateIso = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function Sparkline({
  points,
  className = 'text-gold-300',
  filled = false,
}: {
  points: number[];
  className?: string;
  filled?: boolean;
}) {
  const safePoints = points.length ? points : [0, 0, 0, 0, 0];
  const max = Math.max(...safePoints, 1);
  const min = Math.min(...safePoints, 0);
  const span = Math.max(max - min, 1);
  const coords = safePoints.map((point, index) => ({
    x: (index / Math.max(safePoints.length - 1, 1)) * 100,
    y: 100 - ((point - min) / span) * 100,
  }));
  const polylinePoints = coords.map((p) => `${p.x},${p.y}`).join(' ');

  if (filled) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    const linePath = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
    const areaPath = `${linePath} L ${last.x},100 L ${first.x},100 Z`;
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className}>
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#sparkFill)" stroke="none" />
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polylinePoints}
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className}>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polylinePoints}
      />
    </svg>
  );
}

function CountUpValue({
  value,
  formatter,
  duration = 900,
}: {
  value: number;
  formatter: Intl.NumberFormat;
  duration?: number;
}) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(value * eased));
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, [value, duration]);
  return <>{formatter.format(displayed)}</>;
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const common = useTranslations('common');
  const pathname = usePathname();
  const locale = useLocale();
  const numberLocale = locale === 'sw' ? 'sw-TZ' : 'en-TZ';
  const currency = useCurrency();
  const { formatTime, formatDateTime } = useFormatDate();
  const activeBranch = useActiveBranch();
  const branchMode = useMemo(() => getBranchModeForPathname(pathname), [pathname]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useToastState();

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);

  const [salesToday, setSalesToday] = useState<SaleRow[]>([]);
  const [salesTrendRows, setSalesTrendRows] = useState<SaleRow[]>([]);
  const [pnl, setPnl] = useState<PnlReport | null>(null);
  const [pnlMtd, setPnlMtd] = useState<PnlReport | null>(null);
  const [stockValueSummary, setStockValueSummary] = useState<StockValueSummary | null>(null);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [salesByBranch, setSalesByBranch] = useState<SalesByBranch | null>(null);
  const [expenseBreakdown, setExpenseBreakdown] = useState<ExpenseBreakdown | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity['items']>([]);
  const [recentReceipts, setRecentReceipts] = useState<ReceiptRow[]>([]);

  const [approvalsCount, setApprovalsCount] = useState(0);
  const [alertsCount, setAlertsCount] = useState(0);
  const [openShiftCount, setOpenShiftCount] = useState(0);
  const [pendingSync, setPendingSync] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<
    { id: string; label: string }[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);

  const effectiveBranchId = useMemo(
    () =>
      resolveBranchIdForMode({
        mode: branchMode,
        selectedBranchId,
        activeBranchId: activeBranch?.id ?? '',
      }),
    [activeBranch?.id, branchMode, selectedBranchId],
  );

  const salesTotal = useMemo(
    () => salesToday.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0),
    [salesToday],
  );

  const marginPct = useMemo(() => {
    if (!pnl || pnl.totals.revenue === 0) {
      return 0;
    }
    return Math.round((pnl.totals.grossProfit / pnl.totals.revenue) * 100);
  }, [pnl]);

  const trendPoints = useMemo(() => {
    if (!salesTrendRows.length) {
      return [0, 0, 0, 0, 0, 0, 0];
    }
    const perDay = new Map<string, number>();
    for (const row of salesTrendRows) {
      const rawDate = row.createdAt ?? row.completedAt;
      if (!rawDate) {
        continue;
      }
      const day = new Date(rawDate).toISOString().slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + Number(row.total ?? 0));
    }
    const days = Array.from(perDay.keys()).sort();
    const tail = days.slice(-30);
    return tail.map((day) => perDay.get(day) ?? 0);
  }, [salesTrendRows]);

  const branchOptions = useMemo(
    () => [
      { id: '', name: common('globalBranch') },
      ...branches,
    ],
    [branches, common],
  );

  const tzsFormatter = useMemo(() => {
    const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
    return new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }, [numberLocale, currency]);

  const integerFormatter = useMemo(
    () =>
      new Intl.NumberFormat(numberLocale, {
        maximumFractionDigits: 0,
      }),
    [numberLocale],
  );
  const nowLabel = useMemo(
    () => formatDateTime(new Date()),
    [formatDateTime],
  );

  const load = async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const today = new Date();
    const todayIso = toLocalDateIso(today);
    const trendStart = new Date(today);
    trendStart.setDate(trendStart.getDate() - 29);
    const trendStartIso = toLocalDateIso(trendStart);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStartIso = toLocalDateIso(monthStart);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);
    const weekStartIso = toLocalDateIso(weekStart);

    const dayParams = new URLSearchParams({
      startDate: todayIso,
      endDate: todayIso,
    });
    const trendParams = new URLSearchParams({
      startDate: trendStartIso,
      endDate: todayIso,
    });
    const mtdParams = new URLSearchParams({
      startDate: monthStartIso,
      endDate: todayIso,
    });
    const weekParams = new URLSearchParams({
      startDate: weekStartIso,
      endDate: todayIso,
      limit: '5',
    });
    if (effectiveBranchId) {
      dayParams.set('branchId', effectiveBranchId);
      trendParams.set('branchId', effectiveBranchId);
      mtdParams.set('branchId', effectiveBranchId);
      weekParams.set('branchId', effectiveBranchId);
    }

    try {
      const auditOriginHeaders = { 'x-audit-origin': 'dashboard' };

      const [
        branchData,
        daySalesData,
        trendSalesData,
        pnlData,
        pnlMtdData,
        lowStockData,
        stockValueData,
        topProductsData,
        salesByBranchData,
        expenseBreakdownData,
        recentActivityData,
      ] =
        await Promise.all([
          apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
            token,
          }).catch(() => [] as Branch[]),
          apiFetch<SaleRow[]>(`/reports/sales?${dayParams.toString()}`, {
            token,
            headers: auditOriginHeaders,
          }).catch(() => [] as SaleRow[]),
          apiFetch<SaleRow[]>(`/reports/sales?${trendParams.toString()}`, {
            token,
            headers: auditOriginHeaders,
          }).catch(() => [] as SaleRow[]),
          apiFetch<PnlReport | null>(`/reports/pnl?${dayParams.toString()}`, {
            token,
            headers: auditOriginHeaders,
          }).catch(() => null),
          apiFetch<PnlReport | null>(`/reports/pnl?${mtdParams.toString()}`, {
            token,
            headers: auditOriginHeaders,
          }).catch(() => null),
          apiFetch<LowStock[]>(
            `/reports/low-stock?threshold=5${
              effectiveBranchId ? `&branchId=${effectiveBranchId}` : ''
            }`,
            {
              token,
              headers: auditOriginHeaders,
            },
          ).catch(() => [] as LowStock[]),
          apiFetch<StockValueSummary | null>(
            `/reports/stock-value${
              effectiveBranchId ? `?branchId=${encodeURIComponent(effectiveBranchId)}` : ''
            }`,
            { token, headers: auditOriginHeaders },
          ).catch(() => null),
          apiFetch<{ items: TopProduct[] }>(
            `/reports/top-products?${weekParams.toString()}`,
            { token, headers: auditOriginHeaders },
          ).catch(() => ({ items: [] as TopProduct[] })),
          apiFetch<SalesByBranch | null>(`/reports/sales-by-branch?${mtdParams.toString()}`, {
            token,
            headers: auditOriginHeaders,
          }).catch(() => null),
          apiFetch<ExpenseBreakdown | null>(
            `/reports/expenses/breakdown?${mtdParams.toString()}&limit=6`,
            {
              token,
              headers: auditOriginHeaders,
            },
          ).catch(() => null),
          apiFetch<RecentActivity>(
            `/reports/recent-activity?limit=8${
              effectiveBranchId ? `&branchId=${encodeURIComponent(effectiveBranchId)}` : ''
            }`,
            { token, headers: auditOriginHeaders },
          ).catch(() => ({ items: [] })),
        ]);

      setBranches(normalizePaginated(branchData).items);
      setSalesToday(daySalesData);
      setSalesTrendRows(trendSalesData);
      setPnl(pnlData);
      setPnlMtd(pnlMtdData);
      setLowStock(lowStockData);
      setStockValueSummary(stockValueData);
      setTopProducts(topProductsData.items ?? []);
      setSalesByBranch(salesByBranchData);
      setExpenseBreakdown(expenseBreakdownData);
      setRecentActivity(recentActivityData.items ?? []);

      const [pendingCount, approvalsData, notificationsData, shiftsData, receiptsData] =
        await Promise.all([
          getPendingCount().catch(() => 0),
          apiFetch<PaginatedResponse<Approval> | Approval[]>(
            '/approvals?status=PENDING&limit=1&includeTotal=1',
            { token },
          ).catch(() => [] as Approval[] | PaginatedResponse<Approval>),
          apiFetch<PaginatedResponse<NotificationPreview> | NotificationPreview[]>(
            '/notifications?limit=25',
            { token },
          ).catch(() => [] as NotificationPreview[] | PaginatedResponse<NotificationPreview>),
          apiFetch<PaginatedResponse<Shift> | Shift[]>('/shifts?status=OPEN&limit=20', {
            token,
          }).catch(() => [] as Shift[] | PaginatedResponse<Shift>),
          apiFetch<PaginatedResponse<ReceiptRow> | ReceiptRow[]>(
            `/sales/receipts?limit=6${effectiveBranchId ? `&branchId=${effectiveBranchId}` : ''}`,
            { token },
          ).catch(() => [] as ReceiptRow[] | PaginatedResponse<ReceiptRow>),
        ]);

      setPendingSync(pendingCount);

      const approvalsPayload = normalizePaginated(approvalsData).items;
      const approvalsTotal =
        normalizePaginated(approvalsData).total ?? approvalsPayload.length;
      setApprovalsCount(approvalsTotal);

      const notificationsPayload = normalizePaginated(notificationsData).items;
      setAlertsCount(
        notificationsPayload.filter((item) => item.status && item.status !== 'READ').length,
      );

      setOpenShiftCount(normalizePaginated(shiftsData).items.length);
      setRecentReceipts(normalizePaginated(receiptsData).items.slice(0, 6));
    } catch (error) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(error, t('loadFailed')),
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [effectiveBranchId]);

  const runSearch = async (queryText = searchQuery) => {
    const token = getAccessToken();
    if (!token || !queryText.trim()) {
      return;
    }
    setIsSearching(true);
    try {
      const data = await apiFetch<SearchResults>(
        `/search?q=${encodeURIComponent(queryText.trim())}`,
        { token },
      );
      setSearchResults(data);
    } catch {
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const token = getAccessToken();
    if (!token || searchQuery.trim().length < 2) {
      setSearchSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const data = await apiFetch<SearchResults>(
          `/search?q=${encodeURIComponent(searchQuery.trim())}`,
          { token },
        );
        const next = [
          ...data.products.flatMap((item) =>
            item.variants.length
              ? item.variants.map((variant) => ({
                  id: `variant:${variant.id}`,
                  label: `${formatVariantLabel(
                    {
                      id: variant.id,
                      name: variant.name,
                      productName: item.name,
                    },
                    common('unknown'),
                  )}${variant.sku ? ` (${variant.sku})` : ''}`,
                }))
              : [{ id: `product:${item.id}`, label: item.name }],
          ),
          ...data.receipts.map((item) => ({
            id: `receipt:${item.id}`,
            label: item.receiptNumber,
          })),
          ...data.customers.map((item) => ({
            id: `customer:${item.id}`,
            label: item.name,
          })),
        ];
        setSearchSuggestions(next.slice(0, 12));
      } catch {
        setSearchSuggestions([]);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [common, searchQuery]);

  const salesDayTrendPct = useMemo(() => {
    const len = trendPoints.length;
    if (len < 2) return 0;
    const yesterday = trendPoints[len - 2];
    if (!yesterday) return 0;
    return Math.round(((trendPoints[len - 1] - yesterday) / yesterday) * 100);
  }, [trendPoints]);

  if (isLoading) {
    return <PageSkeleton />;
  }

  const activityIconFor = (type: string): { icon: string; cls: string } => {
    if (type === 'sale') return { icon: '✓', cls: 'text-emerald-400' };
    if (type === 'transfer') return { icon: '↔', cls: 'text-blue-400' };
    return { icon: '!', cls: 'text-amber-400' };
  };

  const lowStockPreview = lowStock.slice(0, 5);
  const topProductsPreview = topProducts.slice(0, 5);
  const salesByBranchPreview = salesByBranch?.items?.slice(0, 6) ?? [];
  const expenseBreakdownPreview = expenseBreakdown?.items?.slice(0, 6) ?? [];
  const maxBranchSales = Math.max(
    1,
    ...salesByBranchPreview.map((item) => item.totalSales),
  );
  const maxTopProductRevenue = Math.max(
    1,
    ...topProductsPreview.map((item) => item.totalRevenue),
  );
  const criticalLowStockCount = lowStock.filter(
    (item) => Number(item.quantity ?? 0) <= 2,
  ).length;
  const activeBranchesCount = salesByBranchPreview.filter(
    (item) => item.totalSales > 0,
  ).length;
  const todayTransfers = recentActivity.filter((item) => {
    if (item.type !== 'transfer') {
      return false;
    }
    const dt = new Date(item.createdAt);
    return toLocalDateIso(new Date(dt)) === toLocalDateIso(new Date());
  }).length;

  return (
    <section className="nvi-page dashboard-lux">
      <div className="command-card nvi-panel p-5 nvi-reveal dashboard-main-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-3xl font-semibold text-[color:var(--foreground)]">
              {t('executiveOverviewTitle')}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {t('executiveOverviewSubtitle')}
            </p>
          </div>
          <span className="status-chip">{nowLabel}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="status-chip">{t('statusLive')}</span>
          <span className="status-chip">{t('statusMultiBranch')}</span>
          <span className="status-chip">
            {t('attentionApprovals', { count: approvalsCount })}
          </span>
          <span className="status-chip">
            {t('attentionAlerts', { count: alertsCount })}
          </span>
          <button
            type="button"
            onClick={() => load(true)}
            className="ml-auto rounded border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--foreground)]"
            disabled={isRefreshing}
          >
            {isRefreshing ? <Spinner size="xs" variant="dots" /> : t('refresh')}
          </button>
        </div>
      </div>

      {message ? <p role="alert" className="text-sm text-red-400">{message}</p> : null}

      <div className="command-card nvi-panel p-4 nvi-reveal dashboard-toolbar">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted)] dashboard-toolbar__label">
            {common('branch')}
          </label>
          <select
            value={selectedBranchId}
            onChange={(event) => setSelectedBranchId(event.target.value)}
            className="rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--foreground)] dashboard-toolbar__select"
          >
            {branchOptions.map((branch) => (
              <option key={branch.id || 'all'} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-[color:var(--muted)] dashboard-toolbar__meta">
            {t('pendingSync')}: {pendingSync} • {t('openShifts')}: {openShiftCount}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 nvi-stagger dashboard-kpi-grid">
        <div className="kpi-card nvi-tile p-5 dashboard-kpi">
          <span className="lux-shine" />
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">{t('salesToday')}</p>
            {salesDayTrendPct !== 0 && (
              <span className={`lux-trend-chip ${salesDayTrendPct > 0 ? 'lux-trend-chip--up' : 'lux-trend-chip--down'}`}>
                {salesDayTrendPct > 0 ? '▲' : '▼'} {Math.abs(salesDayTrendPct)}%
              </span>
            )}
          </div>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            <CountUpValue value={salesTotal} formatter={tzsFormatter} />
          </p>
          <p className="text-xs text-[color:var(--muted)]">{t('grossSalesTzs')}</p>
          <Sparkline points={trendPoints.slice(-8)} className="mt-3 h-8 w-full text-gold-300" filled />
        </div>

        <div className="kpi-card nvi-tile p-5 dashboard-kpi">
          <span className="lux-shine" />
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">{t('revenueMtd')}</p>
            {marginPct !== 0 && (
              <span className="lux-trend-chip lux-trend-chip--neutral">{marginPct}% margin</span>
            )}
          </div>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            <CountUpValue value={pnlMtd?.totals.revenue ?? 0} formatter={tzsFormatter} />
          </p>
          <p className="text-xs text-[color:var(--muted)]">{t('revenueMtdHint')}</p>
        </div>

        <div className="kpi-card nvi-tile p-5 dashboard-kpi">
          <span className="lux-shine" />
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">{t('expensesMtd')}</p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            <CountUpValue value={pnlMtd?.totals.expenses ?? 0} formatter={tzsFormatter} />
          </p>
          <p className="text-xs text-[color:var(--muted)]">{t('expensesMtdHint')}</p>
        </div>

        <div className="kpi-card nvi-tile p-5 dashboard-kpi">
          <span className="lux-shine" />
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">{t('stockValue')}</p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            <CountUpValue value={stockValueSummary?.stockValue ?? 0} formatter={tzsFormatter} />
          </p>
          <p className="text-xs text-[color:var(--muted)]">
            {t('trackedSkuCount', {
              count: integerFormatter.format(stockValueSummary?.trackedVariants ?? 0),
            })}
          </p>
        </div>

        <div className="kpi-card nvi-tile p-5 dashboard-kpi">
          <span className="lux-shine" />
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">{t('lowStock')}</p>
            {criticalLowStockCount > 0 && (
              <span className="lux-trend-chip lux-trend-chip--down">{criticalLowStockCount} critical</span>
            )}
          </div>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">{lowStock.length}</p>
          <p className="text-xs text-[color:var(--muted)]">
            {t('criticalLowStockCount', { count: integerFormatter.format(criticalLowStockCount) })}
          </p>
        </div>

        <div className="kpi-card nvi-tile p-5 dashboard-kpi">
          <span className="lux-shine" />
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">{t('activeBranches')}</p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">{activeBranchesCount}</p>
          <p className="text-xs text-[color:var(--muted)]">
            {t('transfersTodayCount', { count: integerFormatter.format(todayTransfers) })}
          </p>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-3 nvi-stagger dashboard-main-grid">
        <div className="command-card nvi-panel p-5 lg:col-span-2 nvi-reveal dashboard-main-panel">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('revenueSalesTrendTitle')}</h3>
            <span className="status-chip">{t('last30Days')}</span>
          </div>
          <p className="text-sm text-[color:var(--muted)]">{t('revenueSalesTrendSubtitle')}</p>
          <div className="mt-4 rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-4">
            <Sparkline points={trendPoints} className="h-40 w-full text-gold-300" filled />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="command-card nvi-panel p-5 nvi-reveal dashboard-side-panel">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('topProductsTitle')}</h3>
              <span className="status-chip">{t('thisWeek')}</span>
            </div>
            <p className="text-sm text-[color:var(--muted)]">{t('topProductsSubtitle')}</p>
            <div className="mt-4 space-y-2 text-sm text-[color:var(--muted)]">
              {topProductsPreview.length ? (
                topProductsPreview.map((item, index) => {
                  const pct = Math.max(
                    8,
                    Math.round((item.totalRevenue / maxTopProductRevenue) * 100),
                  );
                  return (
                    <div key={item.variantId} className="rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--border)] text-xs">
                          {index + 1}
                        </span>
                        <p className="text-xs font-medium text-[color:var(--foreground)]">
                          {item.productName ?? item.variantName ?? common('unknown')}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-white/10">
                          <div
                            className="h-2 rounded-full bg-gold-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-[color:var(--foreground)]">
                          {tzsFormatter.format(item.totalRevenue)}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-[color:var(--muted)]">{t('noTopProducts')}</p>
              )}
            </div>
          </div>

          <div className="command-card nvi-panel p-5 nvi-reveal dashboard-side-panel">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('lowStockAlertsTitle')}</h3>
              <span className="status-chip">{t('critical')}</span>
            </div>
            <p className="text-sm text-[color:var(--muted)]">{t('lowStockAlertsSubtitle')}</p>
            <div className="mt-4 space-y-2 text-sm text-[color:var(--muted)]">
              {lowStockPreview.length ? (
                lowStockPreview.map((row) => {
                  const isCritical = Number(row.quantity ?? 0) <= 2;
                  const label = row.variant
                    ? formatVariantLabel(
                        {
                          id: row.variant.id,
                          name: row.variant.name ?? null,
                          productName: row.variant.product?.name ?? null,
                        },
                        common('unknown'),
                      )
                    : `${common('unknown')} • ${row.id.slice(0, 8)}`;
                  return (
                    <div key={row.id} className="rounded border border-red-400/30 bg-red-500/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-[color:var(--foreground)]">{label}</p>
                        {isCritical && <span className="lux-pulse" />}
                      </div>
                      <p className="text-xs text-[color:var(--muted)]">
                        {(row.branch?.name ?? common('unknown')) +
                          ` • ${t('qtyShort', {
                            count: integerFormatter.format(Number(row.quantity ?? 0)),
                          })}`}
                      </p>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-[color:var(--muted)]">{t('stableStock')}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3 nvi-stagger dashboard-secondary-grid">
        <div className="command-card nvi-panel p-5 nvi-reveal dashboard-side-panel">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('salesByBranchTitle')}</h3>
            <span className="status-chip">{t('revenueMtd')}</span>
          </div>
          <p className="text-sm text-[color:var(--muted)]">{t('salesByBranchSubtitle')}</p>
          <div className="mt-4 space-y-3">
            {salesByBranchPreview.length ? (
              salesByBranchPreview.map((item) => {
                const pct = Math.max(
                  6,
                  Math.round((item.totalSales / maxBranchSales) * 100),
                );
                return (
                  <div key={item.branchId}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span>{item.branchName ?? common('unknown')}</span>
                      <span>{tzsFormatter.format(item.totalSales)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10">
                      <div className="h-2 rounded-full bg-cyan-300" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-[color:var(--muted)]">{t('noBranches')}</p>
            )}
          </div>
        </div>

        <div className="command-card nvi-panel p-5 nvi-reveal dashboard-side-panel">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('expenseBreakdownTitle')}</h3>
            <span className="status-chip">{t('revenueMtd')}</span>
          </div>
          <p className="text-sm text-[color:var(--muted)]">{t('expenseBreakdownSubtitle')}</p>
          <div className="mt-4 space-y-2 text-sm">
            {expenseBreakdownPreview.length ? (
              expenseBreakdownPreview.map((item) => (
                <div key={item.category} className="rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs">{item.category}</p>
                    <p className="text-xs">{tzsFormatter.format(item.amount)}</p>
                  </div>
                  <p className="text-xs text-[color:var(--muted)]">
                    {item.percent.toFixed(1)}%
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[color:var(--muted)]">{t('expensesHint')}</p>
            )}
          </div>
        </div>

        <div className="command-card nvi-panel p-5 nvi-reveal dashboard-side-panel">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('recentActivityTitle')}</h3>
            <span className="status-chip">{t('statusLive')}</span>
          </div>
          <p className="text-sm text-[color:var(--muted)]">{t('recentActivitySubtitle')}</p>
          <div className="mt-4 space-y-2 text-sm">
            {recentActivity.length ? (
              recentActivity.map((item) => {
                const { icon, cls } = activityIconFor(item.type);
                return (
                  <div key={item.id} className="rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current bg-current/10 text-xs font-bold ${cls}`}>{icon}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-[color:var(--foreground)]">{item.title}</p>
                        <p className="text-xs text-[color:var(--muted)]">
                          {(item.detail ?? common('unknown'))} •{' '}
                          {formatTime(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-[color:var(--muted)]">{t('noRecentActivity')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3 nvi-stagger dashboard-footer-grid">
        {/* Recent Sales Table */}
        <div className="command-card nvi-panel p-5 xl:col-span-2 nvi-reveal dashboard-main-panel">
          <span className="lux-shine" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('recentSalesTitle')}</h3>
            <Link
              href={`/${locale}/sales`}
              className="text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            >
              {t('viewAll')}
            </Link>
          </div>
          <div className="mt-4">
            <div className="lux-table-row mb-1 border-transparent bg-transparent">
              <span className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
                {t('colOrder')}
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
                {t('colTime')}
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
                {t('colTotal')}
              </span>
            </div>
            <div className="space-y-1">
              {recentReceipts.length ? (
                recentReceipts.map((receipt) => (
                  <div key={receipt.id} className="lux-table-row">
                    <span className="text-xs text-[color:var(--foreground)] truncate">
                      {receipt.receiptNumber}
                    </span>
                    <span className="text-xs text-[color:var(--muted)]">
                      {formatTime(receipt.issuedAt)}
                    </span>
                    <span className="text-xs font-semibold text-[color:var(--foreground)]">
                      {tzsFormatter.format(Number(receipt.sale?.total ?? 0))}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[color:var(--muted)]">{t('noSalesToday')}</p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions + Mini Search */}
        <div className="flex flex-col gap-4">
          <div className="command-card nvi-panel p-5 nvi-reveal dashboard-side-panel">
            <span className="lux-shine" />
            <h3 className="text-base font-semibold text-[color:var(--foreground)]">{t('globalSearch')}</h3>
            <div className="mt-3 flex gap-2">
              <TypeaheadInput
                value={searchQuery}
                onChange={setSearchQuery}
                onSelect={(option) => {
                  setSearchQuery(option.label);
                  runSearch(option.label);
                }}
                onEnter={() => runSearch()}
                options={searchSuggestions}
                className="min-w-0 flex-1 rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--foreground)]"
              />
              <button
                type="button"
                onClick={() => runSearch()}
                className="inline-flex items-center gap-1 rounded border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--foreground)]"
                disabled={isSearching}
              >
                {isSearching ? <Spinner size="xs" variant="orbit" /> : '↵'}
              </button>
            </div>
            {searchResults ? (
              <div className="mt-3 space-y-1 text-xs text-[color:var(--muted)]">
                <p>
                  {t('products')}: {searchResults.products.length} •{' '}
                  {t('receipts')}: {searchResults.receipts.length} •{' '}
                  {t('customers')}: {searchResults.customers.length}
                </p>
                {searchResults.products.slice(0, 3).map((item) => (
                  <p key={item.id} className="text-[color:var(--foreground)]">
                    {item.name}
                  </p>
                ))}
              </div>
            ) : null}
            <Link
              href={`/${locale}/search`}
              className="mt-2 block text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            >
              {t('openFullSearch')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
