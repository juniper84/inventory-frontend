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
import { useCurrency, useFormatDate, useTimezone } from '@/lib/business-context';
import { ZERO_DECIMAL_CURRENCIES } from '@/lib/currencies';
import { FlipCounter, TapeMeter, ThermometerGauge } from '@/components/analog';
import { ProgressBar, StatusBadge } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { RingGauge } from '@/components/RingGauge';

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

/** Get a YYYY-MM-DD string representing what "today" (or any date) is in the business timezone */
function toBusinessDateIso(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map['year']}-${map['month']}-${map['day']}`;
}

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

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
        <style>{`@keyframes sparkline-draw { to { stroke-dashoffset: 0; } }`}</style>
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
          style={{
            strokeDasharray: 300,
            strokeDashoffset: 300,
            animation: 'sparkline-draw 1.5s ease forwards',
          }}
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className}>
      <style>{`@keyframes sparkline-draw { to { stroke-dashoffset: 0; } }`}</style>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polylinePoints}
        style={{
          strokeDasharray: 300,
          strokeDashoffset: 300,
          animation: 'sparkline-draw 1.5s ease forwards',
        }}
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
  const timezone = useTimezone();
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

  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

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
    const todayIso = toBusinessDateIso(today, timezone);

    // Trend: always last 30 days regardless of filter
    const trendStart = new Date(today);
    trendStart.setDate(trendStart.getDate() - 29);
    const trendStartIso = toBusinessDateIso(trendStart, timezone);

    // Month start in business timezone
    const nowParts = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(today);
    const nowMap: Record<string, string> = {};
    for (const p of nowParts) nowMap[p.type] = p.value;
    const monthStartIso = `${nowMap['year']}-${nowMap['month']}-01`;

    // Week start in business timezone
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekStartIso = toBusinessDateIso(weekAgo, timezone);

    // Determine KPI date range based on filter
    let startIso: string;
    let endIso: string;
    switch (dateRange) {
      case 'today':
        startIso = todayIso;
        endIso = todayIso;
        break;
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yIso = toBusinessDateIso(yesterday, timezone);
        startIso = yIso;
        endIso = yIso;
        break;
      }
      case 'week':
        startIso = weekStartIso;
        endIso = todayIso;
        break;
      case 'month':
        startIso = monthStartIso;
        endIso = todayIso;
        break;
      case 'custom':
        startIso = customStart || todayIso;
        endIso = customEnd || todayIso;
        break;
    }

    const dayParams = new URLSearchParams({
      startDate: startIso,
      endDate: endIso,
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
  }, [effectiveBranchId, dateRange, customStart, customEnd]);

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
    return toBusinessDateIso(new Date(dt), timezone) === toBusinessDateIso(new Date(), timezone);
  }).length;

  const storedUser = typeof window !== 'undefined' ? (() => { try { const u = localStorage.getItem('nvi.user'); return u ? JSON.parse(u) : null; } catch { return null; } })() : null;
  const userName = storedUser?.name ?? 'there';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return t('greetingMorning');
    if (h < 17) return t('greetingAfternoon');
    return t('greetingEvening');
  })();

  const stockHealthPct = stockValueSummary
    ? Math.round(((stockValueSummary.trackedVariants - lowStock.length) / Math.max(stockValueSummary.trackedVariants, 1)) * 100)
    : 0;

  const expenseBudgetPct = pnlMtd
    ? Math.min(Math.round((pnlMtd.totals.expenses / Math.max(pnlMtd.totals.revenue, 1)) * 100), 100)
    : 0;

  return (
    <section className="nvi-page">
      <div className="mc-grid">
        {/* ── Row 1: Greeting + Status ── */}
        <div className="mc-card mc-span-full mc-delay-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl" style={{ color: 'var(--foreground)' }}>
                {greeting}, <span style={{ color: '#f6d37a' }}>{userName}</span>
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'rgba(167,163,160,0.6)' }}>
                {t('executiveOverviewSubtitle')}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>{nowLabel}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mc-chip mc-chip--live"><span className="mc-pulse" /> {t('statusLive')}</span>
            <span className="mc-chip mc-chip--info">{t('statusMultiBranch')}</span>
            {approvalsCount > 0 && <span className="mc-chip mc-chip--warn">{t('attentionApprovals', { count: approvalsCount })}</span>}
            <span className="mc-chip mc-chip--info">{t('attentionAlerts', { count: alertsCount })}</span>
            <button
              type="button"
              onClick={() => load(true)}
              disabled={isRefreshing}
              className="ml-auto rounded-lg px-3 py-1.5 text-xs"
              style={{ border: '1px solid rgba(227,178,51,0.12)', color: 'var(--foreground)', background: 'rgba(255,255,255,0.025)' }}
            >
              {isRefreshing ? <Spinner size="xs" variant="dots" /> : t('refresh')}
            </button>
          </div>
        </div>

        {message ? <p role="alert" className="mc-span-full text-sm text-red-400">{typeof message === 'string' ? message : ''}</p> : null}

        {/* ── Date Range Filter ── */}
        <div className="mc-span-full flex flex-wrap items-center gap-2">
          {(['today', 'yesterday', 'week', 'month', 'custom'] as const).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => { if (range !== 'custom') { setDateRange(range); setCustomStart(''); setCustomEnd(''); } else { setDateRange('custom'); } }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${dateRange === range ? 'bg-gold-500/20 text-gold-200 border border-gold-500/40' : 'text-white/50 border border-white/[0.08] hover:text-white/70 hover:border-white/[0.15]'}`}
            >
              {t(`range${range.charAt(0).toUpperCase()}${range.slice(1)}` as 'rangeToday')}
            </button>
          ))}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded border border-white/[0.12] bg-transparent px-2 py-1 text-xs text-white/70 outline-none"
              />
              <span className="text-xs text-white/40">—</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded border border-white/[0.12] bg-transparent px-2 py-1 text-xs text-white/70 outline-none"
              />
            </div>
          )}
        </div>

        {/* ── Row 2: KPI Cards ── */}
        {/* Sales */}
        <div className="mc-card mc-span-full mc-span-t3 mc-span-d3 mc-delay-1" style={{ borderImage: 'linear-gradient(135deg, rgba(246,211,122,0.25), rgba(45,212,191,0.15), rgba(246,211,122,0.08)) 1' }}>
          <div className="flex items-center justify-between">
            <span className="mc-kpi-label">{t(dateRange === 'today' ? 'salesToday' : dateRange === 'yesterday' ? 'salesYesterday' : dateRange === 'week' ? 'salesThisWeek' : dateRange === 'month' ? 'salesThisMonth' : 'salesCustom')}</span>
            {salesDayTrendPct !== 0 && (
              <span className={`mc-trend ${salesDayTrendPct > 0 ? 'mc-trend--up' : 'mc-trend--down'}`}>
                {salesDayTrendPct > 0 ? '▲' : '▼'} {Math.abs(salesDayTrendPct)}%
              </span>
            )}
          </div>
          <div className="mc-kpi-value"><CountUpValue value={salesTotal} formatter={tzsFormatter} /></div>
          <p className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>{t('grossSalesTzs')}</p>
          <Sparkline points={trendPoints.slice(-8)} className="mt-2 h-9 w-full text-gold-300" filled />
        </div>

        {/* Revenue MTD */}
        <div className="mc-card mc-span-full mc-span-t3 mc-span-d3 mc-delay-2">
          <div className="flex items-center justify-between">
            <span className="mc-kpi-label">{t('revenueMtd')}</span>
            {marginPct !== 0 && <span className="mc-trend mc-trend--neutral">{marginPct}% margin</span>}
          </div>
          <div className="mc-kpi-value"><CountUpValue value={pnlMtd?.totals.revenue ?? 0} formatter={tzsFormatter} /></div>
          <p className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>{t('revenueMtdHint')}</p>
          <Sparkline points={trendPoints.slice(-8)} className="mt-2 h-9 w-full text-teal-300" />
        </div>

        {/* Stock Health Ring */}
        <div className="mc-card mc-span-full mc-span-t3 mc-span-d3 mc-delay-3">
          <div className="mc-ring-wrap">
            <RingGauge value={stockHealthPct} size={72} color="#f6d37a" />
            <div className="mc-ring-info">
              <span className="mc-kpi-label">{t('stockValue')}</span>
              <span className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
                {integerFormatter.format(stockValueSummary?.trackedVariants ?? 0)} SKUs
              </span>
              <span className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>
                {criticalLowStockCount} {t('critical').toLowerCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Expenses Ring */}
        <div className="mc-card mc-span-full mc-span-t3 mc-span-d3 mc-delay-4">
          <div className="mc-ring-wrap">
            <RingGauge value={expenseBudgetPct} size={72} color="#2dd4bf" />
            <div className="mc-ring-info">
              <span className="mc-kpi-label">{t('expensesMtd')}</span>
              <span className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
                <CountUpValue value={pnlMtd?.totals.expenses ?? 0} formatter={tzsFormatter} />
              </span>
              <span className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>{t('expensesMtdHint')}</span>
            </div>
          </div>
        </div>

        {/* ── Row 3: Revenue Chart + Top Products ── */}
        <div className="mc-card mc-span-full mc-span-t6 mc-span-d8 mc-delay-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{t('revenueSalesTrendTitle')}</span>
            <span className="mc-chip mc-chip--info">{t('last30Days')}</span>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.3)' }}>
            <Sparkline points={trendPoints} className="h-40 w-full text-gold-300" filled />
          </div>
        </div>

        <div className="mc-card mc-span-full mc-span-t6 mc-span-d4 mc-delay-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{t('topProductsTitle')}</span>
            <span className="mc-chip mc-chip--info">{t('thisWeek')}</span>
          </div>
          <div className="space-y-1.5">
            {topProductsPreview.length ? topProductsPreview.map((item, index) => {
              const label = item.productName ?? item.variantName ?? common('unknown');
              const pct = Math.round((item.totalRevenue / maxTopProductRevenue) * 100);
              return (
                <div key={item.variantId} className="mc-list-item">
                  <span className="mc-list-rank">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--foreground)' }}>{label}</p>
                    <div className="mc-list-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>{tzsFormatter.format(item.totalRevenue)}</span>
                </div>
              );
            }) : <p className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>{t('noTopProducts')}</p>}
          </div>
        </div>

        {/* ── Row 4: Low Stock Alerts ── */}
        <div className="mc-card mc-span-full mc-span-t6 mc-span-d8 mc-delay-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{t('lowStockAlertsTitle')}</span>
            {criticalLowStockCount > 0 && <span className="mc-chip mc-chip--warn">{criticalLowStockCount} {t('critical').toLowerCase()}</span>}
          </div>
          <div className="mc-alert-scroll">
            {lowStockPreview.length ? lowStockPreview.map((row) => {
              const qty = Number(row.quantity ?? 0);
              const isCritical = qty <= 2;
              const label = row.variant
                ? formatVariantLabel({ id: row.variant.id, name: row.variant.name ?? null, productName: row.variant.product?.name ?? null }, common('unknown'))
                : `${common('unknown')}`;
              return (
                <div key={row.id} className={`mc-alert-item ${isCritical ? 'mc-alert-item--critical' : 'mc-alert-item--warn'}`}>
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--foreground)' }}>{label}</p>
                  <p className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>{row.branch?.name ?? common('unknown')}</p>
                  <p className={`text-sm font-extrabold ${isCritical ? 'text-red-400' : 'text-amber-400'}`}>
                    {t('qtyShort', { count: integerFormatter.format(qty) })}
                  </p>
                </div>
              );
            }) : <p className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>{t('stableStock')}</p>}
          </div>
        </div>

        {/* ── Row 5: Activity Feed + Quick Actions ── */}
        <div className="mc-card mc-span-full mc-span-t3 mc-span-d4 mc-delay-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{t('recentActivityTitle')}</span>
            <span className="mc-chip mc-chip--live"><span className="mc-pulse" /> {t('statusLive')}</span>
          </div>
          <div className="space-y-1">
            {recentActivity.length ? recentActivity.map((item) => (
              <div key={item.id} className="mc-feed-item">
                <span className={`mc-feed-dot mc-feed-dot--${item.type}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{item.title}</p>
                  <p className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>{item.detail ?? common('unknown')}</p>
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: 'rgba(167,163,160,0.35)' }}>{formatTime(item.createdAt)}</span>
              </div>
            )) : <p className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>{t('noRecentActivity')}</p>}
          </div>
        </div>

        <div className="mc-card mc-span-full mc-span-t3 mc-span-d4 mc-delay-6">
          <span className="text-sm font-bold" style={{ color: 'var(--foreground)', display: 'block', marginBottom: 8 }}>{t('quickActions')}</span>
          <div className="space-y-2">
            <Link href={`/${locale}/pos`} className="mc-action">
              <span className="mc-action-icon mc-action-icon--sale">+</span>
              <div><p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{t('quickNewSale')}</p><p className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>Open point of sale</p></div>
            </Link>
            <Link href={`/${locale}/transfers`} className="mc-action">
              <span className="mc-action-icon mc-action-icon--transfer">&#8644;</span>
              <div><p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{t('quickNewTransfer')}</p><p className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>Move stock between branches</p></div>
            </Link>
            <Link href={`/${locale}/stock/counts`} className="mc-action">
              <span className="mc-action-icon mc-action-icon--count">&#9745;</span>
              <div><p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{t('quickStockCount')}</p><p className="text-xs" style={{ color: 'rgba(167,163,160,0.6)' }}>Verify physical inventory</p></div>
            </Link>
          </div>
        </div>

        {/* ── Row 6: Recent Sales ── */}
        <div className="mc-card mc-span-full mc-span-t6 mc-span-d8 mc-delay-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{t('recentSalesTitle')}</span>
            <Link href={`/${locale}/receipts`} className="text-xs hover:underline" style={{ color: '#f6d37a' }}>{t('viewAll')} &rarr;</Link>
          </div>
          <table className="mc-tbl">
            <thead><tr>
              <th>{t('colOrder')}</th>
              <th>{t('colTime')}</th>
              <th>{t('colTotal')}</th>
              <th>{t('colStatus') ?? common('status')}</th>
            </tr></thead>
            <tbody>
              {recentReceipts.length ? recentReceipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td className="truncate" style={{ maxWidth: 180 }}>{receipt.receiptNumber}</td>
                  <td>{formatTime(receipt.issuedAt)}</td>
                  <td style={{ fontWeight: 700, color: 'var(--foreground)' }}>{tzsFormatter.format(Number(receipt.sale?.total ?? 0))}</td>
                  <td><StatusBadge status={(receipt as Record<string, unknown>).status as string ?? 'COMPLETED'} size="xs" /></td>
                </tr>
              )) : <tr><td colSpan={4} className="text-center py-4">{t('noSalesToday')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
