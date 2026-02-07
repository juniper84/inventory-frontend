'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  apiFetch,
  buildRequestHeaders,
  getApiErrorMessage,
  getApiErrorMessageFromResponse,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { DatePickerInput } from '@/components/DatePickerInput';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { formatEntityLabel, formatVariantLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { PaginationControls } from '@/components/PaginationControls';
import { REPORT_SECTIONS, type ReportSection } from '@/components/reports/sections';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';
import {
  getBranchModeForPathname,
  resolveBranchIdForMode,
} from '@/lib/branch-policy';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
);

type Branch = { id: string; name: string };

type CustomerAggregate = {
  customerId: string | null;
  customerName: string | null;
  total: number | string;
  count: number | string;
};

type StockSnapshot = {
  id: string;
  quantity: number | string;
  variantId: string;
  branchId: string;
  variantName?: string | null;
  productName?: string | null;
  branchName?: string | null;
};

type Sale = {
  id: string;
  total: number | string;
  createdAt: string;
};

type VatLine = {
  id: string;
  vatAmount: number | string;
};

type VatSummary = {
  totalVat: number;
  byRate: { vatRate: number; vatAmount: number }[];
  byDay: { date: string; vatAmount: number }[];
};

type PnlTotals = {
  revenue: number;
  cost: number;
  grossProfit: number;
  losses: number;
  expenses: number;
  transferFees: number;
  netProfit: number;
};

type PnlReport = {
  totals: PnlTotals;
  byDay?: Array<{
    date: string;
    revenue: number;
    cost: number;
    grossProfit: number;
    losses: number;
    expenses: number;
    transferFees: number;
    netProfit: number;
  }>;
};

type LowStock = {
  id: string;
  quantity: number | string;
  variant?: {
    id: string;
    name: string;
    baseUnitId?: string | null;
    product?: { name?: string | null } | null;
  };
  branch?: { name: string };
};

type ExpiringBatch = {
  id: string;
  expiryDate: string;
  variant?: {
    id: string;
    name: string;
    baseUnitId?: string | null;
    product?: { name?: string | null } | null;
  };
  branch?: { name: string };
};

type StockCountVariance = {
  id: string;
  branchId: string | null;
  branchName: string | null;
  variantId: string | null;
  variantName: string | null;
  productName?: string | null;
  countedQuantity: number | string | null;
  expectedQuantity: number | string | null;
  variance: number | string | null;
  reason: string | null;
  createdAt: string;
  userId: string | null;
};

type StaffPerformance = {
  cashierId: string;
  cashierName?: string | null;
  _sum: { total: number | string | null };
  _count: { id: number | string | null };
};

type Outstanding = {
  id: string;
  customerId: string | null;
  customerNameSnapshot: string | null;
  outstandingAmount: number | string;
  creditDueDate?: string | null;
};

type TopLossesReport = {
  days: number;
  items: Array<{
    variantId: string;
    variantName: string | null;
    productName: string | null;
    sku: string | null;
    lossCount: number;
    totalCost: number;
    quantity: number;
  }>;
};

const DEFAULT_FILTERS = {
  branchId: '',
  startDate: '',
  endDate: '',
};

export function ReportsWorkspace({ section }: { section: ReportSection }) {
  const t = useTranslations('reports');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const permissions = getPermissionSet();
  const canReadReports = permissions.has('reports.read');
  const canExport = permissions.has('customers.export');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [sales, setSales] = useState<CustomerAggregate[]>([]);
  const [refunds, setRefunds] = useState<CustomerAggregate[]>([]);
  const [topCustomers, setTopCustomers] = useState<CustomerAggregate[]>([]);
  const [outstanding, setOutstanding] = useState<Outstanding[]>([]);
  const [stock, setStock] = useState<StockSnapshot[]>([]);
  const [salesRows, setSalesRows] = useState<Sale[]>([]);
  const [vatLines, setVatLines] = useState<VatLine[]>([]);
  const [vatSummary, setVatSummary] = useState<VatSummary | null>(null);
  const [pnl, setPnl] = useState<PnlReport | null>(null);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [expiry, setExpiry] = useState<ExpiringBatch[]>([]);
  const [stockCountVariance, setStockCountVariance] = useState<
    StockCountVariance[]
  >([]);
  const [staff, setStaff] = useState<StaffPerformance[]>([]);
  const [topLosses, setTopLosses] = useState<TopLossesReport | null>(null);
  const [message, setMessage] = useToastState();
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(10);
  const [variancePage, setVariancePage] = useState(1);
  const [variancePageSize, setVariancePageSize] = useState(10);
  const [filters, setFilters] = useState(() => ({
    branchId: searchParams.get('branchId') ?? DEFAULT_FILTERS.branchId,
    startDate: searchParams.get('startDate') ?? DEFAULT_FILTERS.startDate,
    endDate: searchParams.get('endDate') ?? DEFAULT_FILTERS.endDate,
  }));
  const activeBranch = useActiveBranch();
  const branchMode = useMemo(
    () => getBranchModeForPathname(pathname),
    [pathname],
  );
  const [threshold, setThreshold] = useState('5');
  const [expiryDays, setExpiryDays] = useState('30');
  const [hasInitialized, setHasInitialized] = useState(false);

  const reportsRootPath = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    const reportsIndex = segments.indexOf('reports');
    if (reportsIndex < 0) {
      return pathname;
    }
    return `/${segments.slice(0, reportsIndex + 1).join('/')}`;
  }, [pathname]);

  const updateFilters = useCallback(
    (patch: Partial<typeof DEFAULT_FILTERS>) => {
      setFilters((prev) => ({
        ...prev,
        ...patch,
      }));
    },
    [],
  );

  const sectionLabels: Record<ReportSection, string> = {
    overview: t('sectionOverview'),
    'sales-profit': t('sectionSalesProfit'),
    customers: t('sectionCustomers'),
    inventory: t('sectionInventory'),
    operations: t('sectionOperations'),
  };

  const sectionTabs = useMemo(
    () =>
      REPORT_SECTIONS.map((id) => {
        const params = new URLSearchParams(searchParams.toString());
        const query = params.toString();
        return {
          id,
          label: sectionLabels[id],
          href: `${reportsRootPath}/${id}${query ? `?${query}` : ''}`,
        };
      }),
    [reportsRootPath, searchParams, sectionLabels],
  );

  const resolveUnitLabel = (unitId?: string | null) => {
    if (!unitId) {
      return '';
    }
    const unit = units.find((entry) => entry.id === unitId);
    return unit ? buildUnitLabel(unit) : '';
  };

  const vatTotal =
    vatSummary?.totalVat ??
    vatLines.reduce((sum, line) => sum + Number(line.vatAmount ?? 0), 0);
  const salesTotal = salesRows.reduce(
    (sum, sale) => sum + Number(sale.total ?? 0),
    0,
  );
  const totalStockUnits = stock.reduce(
    (sum, row) => sum + Number(row.quantity ?? 0),
    0,
  );
  const salesTotalPages = Math.max(1, Math.ceil(sales.length / salesPageSize));
  const varianceTotalPages = Math.max(
    1,
    Math.ceil(stockCountVariance.length / variancePageSize),
  );
  const pagedVariance = stockCountVariance.slice(
    (variancePage - 1) * variancePageSize,
    variancePage * variancePageSize,
  );
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    [],
  );

  const salesByDay = useMemo(() => {
    const buckets = new Map<string, number>();
    salesRows.forEach((sale) => {
      const day = sale.createdAt.slice(0, 10);
      buckets.set(day, (buckets.get(day) ?? 0) + Number(sale.total ?? 0));
    });
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }));
  }, [salesRows]);

  const topStockItems = useMemo(() => {
    const rows = stock
      .map((row) => ({
        id: row.id,
        label: formatVariantLabel(
          {
            id: row.variantId,
            name: row.variantName ?? null,
            productName: row.productName ?? null,
          },
          common('unknown'),
        ),
        quantity: Number(row.quantity ?? 0),
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);
    return rows;
  }, [common, stock]);

  const sortedCustomerSales = useMemo(
    () =>
      [...sales].sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0)),
    [sales],
  );
  const pagedSortedSales = sortedCustomerSales.slice(
    (salesPage - 1) * salesPageSize,
    salesPage * salesPageSize,
  );

  const customerTotalAmount = useMemo(
    () =>
      sales.reduce((sum, row) => sum + Number(row.total ?? 0), 0),
    [sales],
  );

  const outstandingTotalAmount = useMemo(
    () =>
      outstanding.reduce((sum, row) => sum + Number(row.outstandingAmount ?? 0), 0),
    [outstanding],
  );

  const topCustomerChartRows = useMemo(
    () =>
      sortedCustomerSales.slice(0, 8).map((row) => ({
        label: row.customerName ?? common('unknown'),
        total: Number(row.total ?? 0),
      })),
    [common, sortedCustomerSales],
  );

  const inventoryQuantityByBranch = useMemo(() => {
    const byBranch = new Map<string, number>();
    stock.forEach((row) => {
      const branch = row.branchName ?? common('branch');
      byBranch.set(branch, (byBranch.get(branch) ?? 0) + Number(row.quantity ?? 0));
    });
    return Array.from(byBranch.entries())
      .map(([label, quantity]) => ({ label, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);
  }, [common, stock]);

  const lowStockByBranch = useMemo(() => {
    const byBranch = new Map<string, number>();
    lowStock.forEach((row) => {
      const branch = row.branch?.name ?? common('branch');
      byBranch.set(branch, (byBranch.get(branch) ?? 0) + 1);
    });
    return Array.from(byBranch.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [common, lowStock]);

  const expiryByDay = useMemo(() => {
    const byDay = new Map<string, number>();
    expiry.forEach((row) => {
      const key = row.expiryDate.slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    });
    return Array.from(byDay.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 12);
  }, [expiry]);

  const sortedStaff = useMemo(
    () =>
      [...staff]
        .map((row) => ({
          label: formatEntityLabel(
            { name: row.cashierName ?? null, id: row.cashierId },
            common('unknown'),
          ),
          salesCount: Number(row._count.id ?? 0),
          total: Number(row._sum.total ?? 0),
        }))
        .sort((a, b) => b.total - a.total),
    [common, staff],
  );

  const varianceByDay = useMemo(() => {
    const byDay = new Map<string, number>();
    stockCountVariance.forEach((row) => {
      const date = row.createdAt.slice(0, 10);
      const amount = Math.abs(Number(row.variance ?? 0));
      byDay.set(date, (byDay.get(date) ?? 0) + amount);
    });
    return Array.from(byDay.entries())
      .map(([date, totalVariance]) => ({ date, totalVariance }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
  }, [stockCountVariance]);

  const load = useCallback(async (mode: 'full' | 'refresh' = 'full') => {
    if (mode === 'full') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }
    const params = new URLSearchParams();
    const effectiveBranchId = resolveBranchIdForMode({
      mode: branchMode,
      selectedBranchId: filters.branchId,
      activeBranchId: activeBranch?.id ?? '',
    });
    if (effectiveBranchId) {
      params.set('branchId', effectiveBranchId);
    }
    if (filters.startDate) {
      params.set('startDate', filters.startDate);
    }
    if (filters.endDate) {
      params.set('endDate', filters.endDate);
    }
    const branchParam = effectiveBranchId
      ? `branchId=${encodeURIComponent(effectiveBranchId)}`
      : '';
    try {
      const [
        branchData,
        unitList,
        salesData,
        refundData,
        topData,
        outstandingData,
        stockData,
        salesRowsData,
        vatLinesData,
        vatSummaryData,
        pnlData,
        lowStockData,
        expiryData,
        varianceData,
        staffData,
        lossesData,
      ] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
          token,
        }),
        loadUnits(token),
        apiFetch<CustomerAggregate[]>(
          `/reports/customers/sales?${params.toString()}`,
          {
            token,
          },
        ),
        apiFetch<CustomerAggregate[]>(
          `/reports/customers/refunds?${params.toString()}`,
          {
            token,
          },
        ),
        apiFetch<CustomerAggregate[]>(
          `/reports/customers/top${branchParam ? `?${branchParam}` : ''}`,
          { token },
        ),
        apiFetch<Outstanding[]>(
          `/reports/customers/outstanding${branchParam ? `?${branchParam}` : ''}`,
          { token },
        ),
        apiFetch<StockSnapshot[]>(`/reports/stock?${params.toString()}`, {
          token,
        }),
        apiFetch<Sale[]>(`/reports/sales?${params.toString()}`, { token }),
        apiFetch<VatLine[]>(`/reports/vat?${params.toString()}`, { token }),
        apiFetch<VatSummary>(`/reports/vat-summary?${params.toString()}`, { token }),
        apiFetch<PnlReport>(`/reports/pnl?${params.toString()}`, { token }),
        apiFetch<LowStock[]>(
          `/reports/low-stock?${new URLSearchParams({
            threshold,
            ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
          }).toString()}`,
          { token },
        ),
        apiFetch<ExpiringBatch[]>(
          `/reports/expiry?${new URLSearchParams({
            days: expiryDays,
            ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
          }).toString()}`,
          { token },
        ),
        apiFetch<StockCountVariance[]>(
          `/reports/stock-count-variance?${new URLSearchParams({
            branchId: effectiveBranchId,
            from: filters.startDate,
            to: filters.endDate,
          }).toString()}`,
          { token },
        ),
        apiFetch<StaffPerformance[]>(
          `/reports/staff?${params.toString()}`,
          { token },
        ),
        apiFetch<TopLossesReport>(
          `/reports/losses/top?limit=8&days=30${
            effectiveBranchId
              ? `&branchId=${encodeURIComponent(effectiveBranchId)}`
              : ''
          }`,
          { token },
        ),
      ]);
      setBranches(normalizePaginated(branchData).items);
      setUnits(unitList);
      setSales(salesData);
      setRefunds(refundData);
      setTopCustomers(topData);
      setOutstanding(outstandingData);
      setStock(stockData);
      setSalesRows(salesRowsData);
      setVatLines(vatLinesData);
      setVatSummary(vatSummaryData);
      setPnl(pnlData);
      setLowStock(lowStockData);
      setExpiry(expiryData);
      setStockCountVariance(varianceData);
      setStaff(staffData);
      setTopLosses(lossesData);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [
    expiryDays,
    branchMode,
    activeBranch?.id,
    filters.branchId,
    filters.endDate,
    filters.startDate,
    setMessage,
    t,
    threshold,
  ]);

  useEffect(() => {
    const nextFilters = {
      branchId: searchParams.get('branchId') ?? DEFAULT_FILTERS.branchId,
      startDate: searchParams.get('startDate') ?? DEFAULT_FILTERS.startDate,
      endDate: searchParams.get('endDate') ?? DEFAULT_FILTERS.endDate,
    };
    setFilters((prev) =>
      prev.branchId === nextFilters.branchId &&
      prev.startDate === nextFilters.startDate &&
      prev.endDate === nextFilters.endDate
        ? prev
        : nextFilters,
    );
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (filters.branchId) {
      params.set('branchId', filters.branchId);
    } else {
      params.delete('branchId');
    }
    if (filters.startDate) {
      params.set('startDate', filters.startDate);
    } else {
      params.delete('startDate');
    }
    if (filters.endDate) {
      params.set('endDate', filters.endDate);
    } else {
      params.delete('endDate');
    }
    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    }
  }, [filters.branchId, filters.endDate, filters.startDate, pathname, router, searchParams]);

  useEffect(() => {
    if (
      (branchMode === 'required' || branchMode === 'defaulted') &&
      activeBranch?.id &&
      !filters.branchId
    ) {
      updateFilters({ branchId: activeBranch.id });
      return;
    }
    if (!hasInitialized) {
      void load('full');
      setHasInitialized(true);
    }
  }, [
    activeBranch?.id,
    branchMode,
    filters.branchId,
    hasInitialized,
    load,
    updateFilters,
  ]);

  useEffect(() => {
    if (!hasInitialized) {
      return;
    }
    const timer = window.setTimeout(() => {
      void load('refresh');
    }, 250);
    return () => window.clearTimeout(timer);
  }, [filters.branchId, filters.endDate, filters.startDate, hasInitialized, load]);

  useEffect(() => {
    if (salesPage > salesTotalPages) {
      setSalesPage(1);
    }
  }, [salesPage, salesTotalPages]);

  useEffect(() => {
    if (variancePage > varianceTotalPages) {
      setVariancePage(1);
    }
  }, [variancePage, varianceTotalPages]);

  const exportCsv = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsExporting(true);
    try {
      const exportParams = new URLSearchParams();
      const effectiveBranchId = resolveBranchIdForMode({
        mode: branchMode,
        selectedBranchId: filters.branchId,
        activeBranchId: activeBranch?.id ?? '',
      });
      if (effectiveBranchId) {
        exportParams.set('branchId', effectiveBranchId);
      }
      if (filters.startDate) {
        exportParams.set('startDate', filters.startDate);
      }
      if (filters.endDate) {
        exportParams.set('endDate', filters.endDate);
      }
      const base =
        process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';
      const { headers } = buildRequestHeaders(token);
      const response = await fetch(
        `${base}/reports/customers/export${
          exportParams.toString() ? `?${exportParams.toString()}` : ''
        }`,
        {
          headers,
        },
      );
      if (!response.ok) {
        const message = await getApiErrorMessageFromResponse(
          response,
          t('exportFailed'),
        );
        setMessage({ action: 'export', outcome: 'failure', message });
        return;
      }
      const data = await response.text();
      const blob = new Blob([data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'customer-sales-report.csv';
      link.click();
      URL.revokeObjectURL(url);
      setMessage({ action: 'export', outcome: 'success', message: t('exported') });
    } catch (err) {
      setMessage({
        action: 'export',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('exportFailed')),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const isOverview = section === 'overview';
  const isSalesProfit = section === 'sales-profit';
  const isCustomers = section === 'customers';
  const isInventory = section === 'inventory';
  const isOperations = section === 'operations';

  if (!canReadReports) {
    return (
      <section className="space-y-4">
        <StatusBanner message={noAccess('subtitle')} />
        <StatusBanner
          message={noAccess('requiredPermission', { permission: 'reports.read' })}
        />
      </section>
    );
  }

  const overviewSalesChartData = {
    labels: salesByDay.map((row) => row.date),
    datasets: [
      {
        label: t('totalSales'),
        data: salesByDay.map((row) => row.total),
        borderColor: '#e2b83f',
        backgroundColor: 'rgba(226, 184, 63, 0.2)',
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const overviewStockChartData = {
    labels: topStockItems.map((row) => row.label),
    datasets: [
      {
        label: t('stockOnHand'),
        data: topStockItems.map((row) => row.quantity),
        backgroundColor: '#2f6f8a',
        borderRadius: 8,
      },
    ],
  };

  const salesProfitChartData = {
    labels: pnl?.byDay?.map((row) => row.date) ?? [],
    datasets: [
      {
        label: t('revenue'),
        data: pnl?.byDay?.map((row) => row.revenue) ?? [],
        borderColor: '#e2b83f',
        backgroundColor: 'rgba(226, 184, 63, 0.2)',
        tension: 0.35,
      },
      {
        label: t('cost'),
        data: pnl?.byDay?.map((row) => row.cost) ?? [],
        borderColor: '#6e7a8c',
        backgroundColor: 'rgba(110, 122, 140, 0.2)',
        tension: 0.35,
      },
      {
        label: t('netProfit'),
        data: pnl?.byDay?.map((row) => row.netProfit) ?? [],
        borderColor: '#50b980',
        backgroundColor: 'rgba(80, 185, 128, 0.2)',
        tension: 0.35,
      },
    ],
  };

  const pnlBreakdownChartData = {
    labels: [t('grossProfit'), t('losses'), t('expenses'), t('transferFees')],
    datasets: [
      {
        label: t('pnlBreakdown'),
        data: [
          pnl?.totals.grossProfit ?? 0,
          pnl?.totals.losses ?? 0,
          pnl?.totals.expenses ?? 0,
          pnl?.totals.transferFees ?? 0,
        ],
        backgroundColor: ['#50b980', '#c35151', '#c58c3f', '#6e7a8c'],
        borderRadius: 8,
      },
    ],
  };

  const customerTopChartData = {
    labels: topCustomerChartRows.map((row) => row.label),
    datasets: [
      {
        label: t('totalSales'),
        data: topCustomerChartRows.map((row) => row.total),
        backgroundColor: '#e2b83f',
        borderRadius: 8,
      },
    ],
  };

  const customerBalanceChartData = {
    labels: [t('totalSales'), t('outstandingBalances')],
    datasets: [
      {
        data: [customerTotalAmount, outstandingTotalAmount],
        backgroundColor: ['#50b980', '#c58c3f'],
        borderColor: ['#2f3a2f', '#3f3324'],
        borderWidth: 1,
      },
    ],
  };

  const inventoryByBranchChartData = {
    labels: inventoryQuantityByBranch.map((row) => row.label),
    datasets: [
      {
        label: t('stockOnHand'),
        data: inventoryQuantityByBranch.map((row) => row.quantity),
        backgroundColor: '#2f6f8a',
        borderRadius: 8,
      },
    ],
  };

  const lowStockChartData = {
    labels: lowStockByBranch.map((row) => row.label),
    datasets: [
      {
        label: t('lowStock'),
        data: lowStockByBranch.map((row) => row.count),
        backgroundColor: '#c58c3f',
        borderRadius: 8,
      },
    ],
  };

  const expiryTrendChartData = {
    labels: expiryByDay.map((row) => row.date),
    datasets: [
      {
        label: t('expiry'),
        data: expiryByDay.map((row) => row.count),
        borderColor: '#c58c3f',
        backgroundColor: 'rgba(197, 140, 63, 0.2)',
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const staffTotalsChartData = {
    labels: sortedStaff.slice(0, 8).map((row) => row.label),
    datasets: [
      {
        label: t('totalSales'),
        data: sortedStaff.slice(0, 8).map((row) => row.total),
        backgroundColor: '#50b980',
        borderRadius: 8,
      },
    ],
  };

  const varianceTrendChartData = {
    labels: varianceByDay.map((row) => row.date),
    datasets: [
      {
        label: t('variance'),
        data: varianceByDay.map((row) => row.totalVariance),
        borderColor: '#c35151',
        backgroundColor: 'rgba(195, 81, 81, 0.2)',
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const lossesChartData = {
    labels:
      topLosses?.items.map((row) =>
        formatVariantLabel(
          {
            id: row.variantId,
            name: row.variantName,
            productName: row.productName,
          },
          common('unknown'),
        ),
      ) ?? [],
    datasets: [
      {
        label: t('losses'),
        data: topLosses?.items.map((row) => Number(row.totalCost ?? 0)) ?? [],
        backgroundColor: '#c35151',
        borderRadius: 8,
      },
    ],
  };

  const cartesianChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#d0c49a',
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#b7ab84' },
        grid: { color: 'rgba(198, 167, 86, 0.12)' },
      },
      y: {
        ticks: { color: '#b7ab84' },
        grid: { color: 'rgba(198, 167, 86, 0.12)' },
      },
    },
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="nvi-page">
      <PremiumPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="status-chip">{t('statusLive')}</span>
            <span className="status-chip">{t('statusMultiBranch')}</span>
            <span className="status-chip">{t('currencyTzs')}</span>
          </>
        }
      />
      <div className="command-card nvi-panel p-3 nvi-reveal">
        <div className="flex flex-wrap gap-2">
          {sectionTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => router.push(tab.href)}
              className={`rounded border px-3 py-2 text-xs uppercase tracking-[0.2em] transition ${
                section === tab.id
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/20 text-[color:var(--foreground)]'
                  : 'border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]'
              }`}
              aria-current={section === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {message ? <StatusBanner message={message} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 nvi-stagger">
        <div className="kpi-card nvi-tile p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('revenue')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {pnl ? pnl.totals.revenue.toLocaleString() : '—'}
          </p>
        </div>
        <div className="kpi-card nvi-tile p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('cost')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {pnl ? pnl.totals.cost.toLocaleString() : '—'}
          </p>
        </div>
        <div className="kpi-card nvi-tile p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('expenses')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {pnl ? pnl.totals.expenses.toLocaleString() : '—'}
          </p>
        </div>
        <div className="kpi-card nvi-tile p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('netProfit')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {pnl ? pnl.totals.netProfit.toLocaleString() : '—'}
          </p>
        </div>
        <div className="kpi-card nvi-tile p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('vat')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {vatTotal.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="command-card nvi-panel p-6 space-y-4 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              {t('filters')}
            </p>
            <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
              {t('filtersTitle')}
            </h3>
            <p className="text-sm text-[color:var(--muted)]">
              {t('filtersSubtitle')}
            </p>
            <p className="text-xs text-[color:var(--muted)]/80">
              {t('filtersAutoRefresh')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load('refresh')}
            className="inline-flex items-center gap-2 rounded border border-[color:var(--border)] px-4 py-2 text-xs text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isRefreshing}
          >
            {isRefreshing ? <Spinner size="xs" variant="orbit" /> : null}
            {isRefreshing ? t('refreshing') : t('refreshReports')}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SmartSelect
            instanceId="reports-branch"
            value={filters.branchId}
            onChange={(value) => updateFilters({ branchId: value })}
            placeholder={t('allBranches')}
            isDisabled={isRefreshing}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
          />
          <DatePickerInput
            value={filters.startDate}
            onChange={(value) => updateFilters({ startDate: value })}
            placeholder={t('fromDate')}
            disabled={isRefreshing}
            className="rounded border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-[color:var(--foreground)]"
          />
          <DatePickerInput
            value={filters.endDate}
            onChange={(value) => updateFilters({ endDate: value })}
            placeholder={t('toDate')}
            disabled={isRefreshing}
            className="rounded border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-[color:var(--foreground)]"
          />
        </div>
      </div>

      {isOverview ? (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] nvi-stagger">
        <div className="command-card nvi-panel p-6 space-y-4 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                {t('salesTrendEyebrow')}
              </p>
              <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
                {t('salesTrendTitle')}
              </h3>
              <p className="text-sm text-[color:var(--muted)]">
                {t('salesTrendSubtitle')}
              </p>
            </div>
          </div>
          {salesByDay.length > 0 ? (
            <div className="h-56 sm:h-64 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3">
              <Line data={overviewSalesChartData} options={cartesianChartOptions} />
            </div>
          ) : (
            <StatusBanner message={t('noData')} />
          )}
          <div className="flex flex-wrap gap-4 text-sm text-[color:var(--muted)]">
            <span>{t('transactions')}: {salesRows.length}</span>
            <span>{t('totalSales')}: {salesTotal.toLocaleString()}</span>
          </div>
        </div>
        <div className="command-card nvi-panel p-6 space-y-4 nvi-reveal">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              {t('inventoryValuationEyebrow')}
            </p>
            <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
              {t('inventoryValuation')}
            </h3>
          </div>
          {topStockItems.length > 0 ? (
            <div className="h-56 sm:h-64 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3">
              <Bar data={overviewStockChartData} options={cartesianChartOptions} />
            </div>
          ) : (
            <StatusBanner message={t('noData')} />
          )}
          <div className="text-sm text-[color:var(--muted)]">
            {t('inventoryValuationTotal', {
              value: `TZS ${currencyFormatter.format(0)}`,
            })}
          </div>
          <div className="text-sm text-[color:var(--muted)]">
            {t('totalStockUnits', { count: totalStockUnits.toLocaleString() })}
          </div>
        </div>
      </div>
      ) : null}

      {isSalesProfit ? (
      <div className="command-card nvi-panel p-6 space-y-4 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              {t('pnlEyebrow')}
            </p>
            <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
              {t('pnlBreakdown')}
            </h3>
          </div>
          <span className="status-chip">{t('statusLive')}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 nvi-stagger">
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">
              {t('revenue')}
            </p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
              {pnl ? pnl.totals.revenue.toLocaleString() : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">
              {t('cost')}
            </p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
              {pnl ? pnl.totals.cost.toLocaleString() : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">
              {t('expenses')}
            </p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
              {pnl ? pnl.totals.expenses.toLocaleString() : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">
              {t('grossProfit')}
            </p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
              {pnl ? pnl.totals.grossProfit.toLocaleString() : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">
              {t('losses')}
            </p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
              {pnl ? pnl.totals.losses.toLocaleString() : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">
              {t('netProfit')}
            </p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
              {pnl ? pnl.totals.netProfit.toLocaleString() : '—'}
            </p>
          </div>
        </div>
      </div>
      ) : null}

      {isSalesProfit ? (
      <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
        <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('salesTrendTitle')}
          </h3>
          {pnl?.byDay?.length ? (
            <div className="h-56 sm:h-72 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3">
              <Line data={salesProfitChartData} options={cartesianChartOptions} />
            </div>
          ) : (
            <StatusBanner message={t('noData')} />
          )}
        </div>
        <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('pnlBreakdown')}
          </h3>
          <div className="h-56 sm:h-72 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3">
            <Bar data={pnlBreakdownChartData} options={cartesianChartOptions} />
          </div>
        </div>
      </div>
      ) : null}

      {isSalesProfit ? (
      <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
        <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
              {t('vatBreakdown')}
            </h3>
            <span className="status-chip">{t('vatTotal')}: {vatTotal.toLocaleString()}</span>
          </div>
          {vatSummary && vatSummary.byRate.length > 0 ? (
            <div className="grid gap-2 text-sm text-[color:var(--muted)] md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs uppercase text-[color:var(--muted)]">
                  {t('vatByRate')}
                </p>
                {vatSummary.byRate.map((row) => (
                  <div key={row.vatRate}>
                    {t('vatRateLabel', { value: row.vatRate })} ·{' '}
                    {row.vatAmount.toLocaleString()}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase text-[color:var(--muted)]">
                  {t('vatByDay')}
                </p>
                {vatSummary.byDay.slice(-7).map((row) => (
                  <div key={row.date}>
                    {row.date} · {row.vatAmount.toLocaleString()}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <StatusBanner message={t('noData')} />
          )}
        </div>
        <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('pnlByDay')}
          </h3>
          {pnl?.byDay?.length ? (
            <div className="space-y-2 text-sm text-[color:var(--muted)]">
              {pnl.byDay.slice(-7).map((row) => (
                <div key={row.date} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{row.date}</span>
                  <span>
                    {t('netProfit')}: {row.netProfit.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <StatusBanner message={t('noData')} />
          )}
        </div>
      </div>
      ) : null}

      {isCustomers ? (
      <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
        <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('topCustomers')}
          </h3>
          {topCustomerChartRows.length > 0 ? (
            <div className="h-56 sm:h-72 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3">
              <Bar data={customerTopChartData} options={cartesianChartOptions} />
            </div>
          ) : (
            <StatusBanner message={t('noCustomerTotals')} />
          )}
        </div>
        <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('salesSummary')}
          </h3>
          {customerTotalAmount > 0 || outstandingTotalAmount > 0 ? (
            <div className="h-56 sm:h-72 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3">
              <Doughnut
                data={customerBalanceChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { labels: { color: '#d0c49a' } },
                  },
                }}
              />
            </div>
          ) : (
            <StatusBanner message={t('noData')} />
          )}
          <div className="grid gap-2 text-sm text-[color:var(--muted)]">
            <div className="flex items-center justify-between">
              <span>{t('totalSales')}</span>
              <span>{currencyFormatter.format(customerTotalAmount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('outstandingBalances')}</span>
              <span>{currencyFormatter.format(outstandingTotalAmount)}</span>
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {isCustomers ? (
      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('customerSales')}
          </h3>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded border border-[color:var(--border)] px-3 py-1 text-xs text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isExporting || !canExport}
            title={!canExport ? noAccess('title') : undefined}
          >
            {isExporting ? <Spinner size="xs" variant="dots" /> : null}
            {isExporting ? t('exporting') : t('exportCsv')}
          </button>
        </div>
        {sales.length === 0 ? (
          <StatusBanner message={t('noCustomerSales')} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/20">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-[color:var(--border)] text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3">{t('customerSales')}</th>
                  <th className="px-4 py-3">{t('transactions')}</th>
                  <th className="px-4 py-3 text-right">{t('totalSales')}</th>
                </tr>
              </thead>
              <tbody>
                {pagedSortedSales.map((row) => (
                  <tr
                    key={row.customerId ?? 'unknown'}
                    className="border-b border-[color:var(--border)]/50 text-[color:var(--muted)] last:border-b-0"
                  >
                    <td className="px-4 py-3">{row.customerName ?? common('unknown')}</td>
                    <td className="px-4 py-3">{row.count}</td>
                    <td className="px-4 py-3 text-right">
                      {currencyFormatter.format(Number(row.total ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sales.length > 0 ? (
          <PaginationControls
            page={salesPage}
            pageSize={salesPageSize}
            total={sales.length}
            itemCount={pagedSortedSales.length}
            availablePages={Array.from({ length: salesTotalPages }, (_, index) => index + 1)}
            hasNext={salesPage < salesTotalPages}
            hasPrev={salesPage > 1}
            isLoading={isLoading}
            onPageChange={(targetPage) => setSalesPage(targetPage)}
            onPageSizeChange={(nextSize) => {
              setSalesPageSize(nextSize);
              setSalesPage(1);
            }}
          />
        ) : null}
      </div>
      ) : null}

      {isCustomers ? (
      <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
        <div className="command-card nvi-panel p-6 space-y-2 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('refundsByCustomer')}
          </h3>
          {refunds.length === 0 ? (
            <StatusBanner message={t('noRefunds')} />
          ) : (
            refunds.map((row) => (
              <div key={row.customerId ?? 'unknown'} className="text-sm text-[color:var(--muted)]">
                {row.customerName ?? common('unknown')} · {t('refundsCount', { count: row.count })} ·{' '}
                {row.total}
              </div>
            ))
          )}
        </div>
        <div className="command-card nvi-panel p-6 space-y-2 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('topCustomers')}
          </h3>
          {topCustomers.length === 0 ? (
            <StatusBanner message={t('noCustomerTotals')} />
          ) : (
            topCustomers.map((row) => (
              <div key={row.customerId ?? 'unknown'} className="text-sm text-[color:var(--muted)]">
                {row.customerName ?? common('unknown')} · {row.total}
              </div>
            ))
          )}
        </div>
      </div>
      ) : null}

      {isCustomers ? (
      <div className="command-card nvi-panel p-6 space-y-2 nvi-reveal">
        <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
          {t('outstandingBalances')}
        </h3>
        {outstanding.length === 0 ? (
          <StatusBanner message={t('noOutstanding')} />
        ) : (
          outstanding.map((row) => (
            <div key={row.id} className="text-sm text-[color:var(--muted)]">
              {row.customerNameSnapshot ?? common('unknown')} · {row.outstandingAmount}
              {row.creditDueDate
                ? ` · ${t('dueOn', {
                    date: new Date(row.creditDueDate).toLocaleDateString(),
                  })}`
                : ''}
            </div>
          ))
        )}
      </div>
      ) : null}

      {isInventory ? (
      <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
        <div className="command-card nvi-panel p-6 space-y-2 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('stockOnHand')}
          </h3>
          {inventoryQuantityByBranch.length > 0 ? (
            <div className="h-56 sm:h-72 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3">
              <Bar data={inventoryByBranchChartData} options={cartesianChartOptions} />
            </div>
          ) : (
            <StatusBanner message={t('noStock')} />
          )}
          <div className="text-sm text-[color:var(--muted)]">
            {t('totalStockUnits', { count: totalStockUnits.toLocaleString() })}
          </div>
        </div>
        <div className="command-card nvi-panel p-6 space-y-2 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('lowStock')}
          </h3>
          {lowStockByBranch.length > 0 ? (
            <div className="h-56 sm:h-72 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3">
              <Bar data={lowStockChartData} options={cartesianChartOptions} />
            </div>
          ) : (
            <StatusBanner message={t('noLowStock')} />
          )}
          <div className="text-sm text-[color:var(--muted)]">
            {t('lowStock')}: {lowStock.length.toLocaleString()}
          </div>
        </div>
      </div>
      ) : null}

      {isInventory ? (
      <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
        <div className="command-card nvi-panel p-6 space-y-2 nvi-reveal">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
              {t('lowStock')}
            </h3>
            <input
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              className="w-20 rounded border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-xs text-[color:var(--foreground)]"
              placeholder={t('threshold')}
            />
          </div>
          <p className="text-xs text-[color:var(--muted)]/80">{t('inventoryRefreshHint')}</p>
          {lowStock.length === 0 ? (
            <StatusBanner message={t('noLowStock')} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/20">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-[color:var(--border)] text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">{t('variant')}</th>
                    <th className="px-4 py-3">{t('branch')}</th>
                    <th className="px-4 py-3 text-right">{t('countedQty')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((row) => {
                    const unitLabel = resolveUnitLabel(row.variant?.baseUnitId ?? null);
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-[color:var(--border)]/50 text-[color:var(--muted)] last:border-b-0"
                      >
                        <td className="px-4 py-3">
                          {formatVariantLabel(
                            {
                              id: row.variant?.id ?? null,
                              name: row.variant?.name ?? null,
                              productName: row.variant?.product?.name ?? null,
                            },
                            common('unknown'),
                          )}
                        </td>
                        <td className="px-4 py-3">{row.branch?.name ?? common('branch')}</td>
                        <td className="px-4 py-3 text-right">
                          {row.quantity}
                          {unitLabel ? ` (${unitLabel})` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="command-card nvi-panel p-6 space-y-2 nvi-reveal">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
              {t('expiry')}
            </h3>
            <input
              value={expiryDays}
              onChange={(event) => setExpiryDays(event.target.value)}
              className="w-20 rounded border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-xs text-[color:var(--foreground)]"
              placeholder={t('days')}
            />
          </div>
          {expiryByDay.length > 0 ? (
            <div className="h-52 sm:h-56 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3">
              <Line data={expiryTrendChartData} options={cartesianChartOptions} />
            </div>
          ) : (
            <StatusBanner message={t('noExpiry')} />
          )}
          {expiry.length === 0 ? (
            <StatusBanner message={t('noExpiry')} />
          ) : (
            <div className="space-y-2 text-sm text-[color:var(--muted)]">
              {expiry.slice(0, 12).map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3">
                  <span>
                    {formatVariantLabel(
                      {
                        id: row.variant?.id ?? null,
                        name: row.variant?.name ?? null,
                        productName: row.variant?.product?.name ?? null,
                      },
                      common('unknown'),
                    )}{' '}
                    ({row.branch?.name ?? common('branch')})
                  </span>
                  <span>{new Date(row.expiryDate).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      ) : null}

      {isOperations ? (
      <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
        <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('staffPerformance')}
          </h3>
          {sortedStaff.length > 0 ? (
            <div className="h-56 sm:h-72 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3">
              <Bar data={staffTotalsChartData} options={cartesianChartOptions} />
            </div>
          ) : (
            <StatusBanner message={t('noStaffPerformance')} />
          )}
        </div>
        <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('stockCountVariance')}
          </h3>
          {varianceByDay.length > 0 ? (
            <div className="h-56 sm:h-72 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3">
              <Line data={varianceTrendChartData} options={cartesianChartOptions} />
            </div>
          ) : (
            <StatusBanner message={t('noStockCountVariance')} />
          )}
        </div>
      </div>
      ) : null}

      {isOperations ? (
      <div className="command-card nvi-panel p-6 space-y-2 nvi-reveal">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('stockCountVariance')}
          </h3>
          <button
            type="button"
            onClick={() => void load('refresh')}
            className="inline-flex items-center gap-2 rounded border border-[color:var(--border)] px-3 py-1 text-xs text-[color:var(--foreground)]"
            disabled={isRefreshing}
          >
            {isRefreshing ? <Spinner size="xs" variant="grid" /> : null}
            {isRefreshing ? t('refreshing') : t('refresh')}
          </button>
        </div>
        {stockCountVariance.length === 0 ? (
          <StatusBanner message={t('noStockCountVariance')} />
        ) : (
          <div className="grid gap-2 text-sm text-[color:var(--muted)] md:grid-cols-5">
            <span className="text-xs uppercase text-[color:var(--muted)]">{t('branch')}</span>
            <span className="text-xs uppercase text-[color:var(--muted)]">{t('variant')}</span>
            <span className="text-xs uppercase text-[color:var(--muted)]">{t('expectedQty')}</span>
            <span className="text-xs uppercase text-[color:var(--muted)]">{t('countedQty')}</span>
            <span className="text-xs uppercase text-[color:var(--muted)]">{t('variance')}</span>
            {pagedVariance.map((row) => (
              <div key={row.id} className="contents">
                <div>{row.branchName ?? common('branch')}</div>
                <div>
                  {formatVariantLabel(
                    {
                      id: row.variantId ?? null,
                      name: row.variantName ?? null,
                      productName: row.productName ?? null,
                    },
                    '—',
                  )}
                </div>
                <div>{row.expectedQuantity ?? '—'}</div>
                <div>{row.countedQuantity ?? '—'}</div>
                <div>
                  {row.variance ?? '—'}{' '}
                  <span className="text-xs text-[color:var(--muted)]">
                    {row.reason ? `(${row.reason})` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {stockCountVariance.length > 0 ? (
          <PaginationControls
            page={variancePage}
            pageSize={variancePageSize}
            total={stockCountVariance.length}
            itemCount={pagedVariance.length}
            availablePages={Array.from(
              { length: varianceTotalPages },
              (_, index) => index + 1,
            )}
            hasNext={variancePage < varianceTotalPages}
            hasPrev={variancePage > 1}
            isLoading={isLoading}
            onPageChange={(targetPage) => setVariancePage(targetPage)}
            onPageSizeChange={(nextSize) => {
              setVariancePageSize(nextSize);
              setVariancePage(1);
            }}
          />
        ) : null}
      </div>
      ) : null}

      {isOperations ? (
      <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
        <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('staffPerformance')}
          </h3>
          {sortedStaff.length === 0 ? (
            <StatusBanner message={t('noStaffPerformance')} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/20">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-[color:var(--border)] text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">{t('staffPerformance')}</th>
                    <th className="px-4 py-3 text-right">{t('transactions')}</th>
                    <th className="px-4 py-3 text-right">{t('totalSales')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStaff.map((row, index) => (
                    <tr
                      key={`${row.label}-${index}`}
                      className="border-b border-[color:var(--border)]/50 text-[color:var(--muted)] last:border-b-0"
                    >
                      <td className="px-4 py-3">{row.label}</td>
                      <td className="px-4 py-3 text-right">{row.salesCount}</td>
                      <td className="px-4 py-3 text-right">
                        {currencyFormatter.format(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('losses')}
          </h3>
          <p className="text-xs text-[color:var(--muted)]/80">
            {t('lossesWindowLabel', { days: topLosses?.days ?? 30 })}
          </p>
          {topLosses?.items.length ? (
            <>
              <div className="h-52 sm:h-56 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 p-3">
                <Bar data={lossesChartData} options={cartesianChartOptions} />
              </div>
              <div className="space-y-2 text-sm text-[color:var(--muted)]">
                {topLosses.items.slice(0, 6).map((row) => (
                  <div
                    key={row.variantId}
                    className="flex items-center justify-between gap-3"
                  >
                    <span>
                      {formatVariantLabel(
                        {
                          id: row.variantId,
                          name: row.variantName,
                          productName: row.productName,
                        },
                        common('unknown'),
                      )}
                    </span>
                    <span>{currencyFormatter.format(row.totalCost)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <StatusBanner message={t('noData')} />
          )}
        </div>
      </div>
      ) : null}
    </section>
  );
}
