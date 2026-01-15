'use client';

import { useEffect, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import { useTranslations } from 'next-intl';
import { apiFetch, buildRequestHeaders } from '@/lib/api';
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

type Branch = { id: string; name: string };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  product?: { name?: string | null } | null;
};

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

export default function ReportsPage() {
  const t = useTranslations('reports');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canExport = permissions.has('customers.export');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
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
  const [message, setMessage] = useToastState();
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(10);
  const [variancePage, setVariancePage] = useState(1);
  const [variancePageSize, setVariancePageSize] = useState(10);
  const [filters, setFilters] = useState({
    branchId: '',
    startDate: '',
    endDate: '',
  });
  const activeBranch = useActiveBranch();
  const [threshold, setThreshold] = useState('5');
  const [expiryDays, setExpiryDays] = useState('30');
  const [hasInitialized, setHasInitialized] = useState(false);

  const resolveUnitLabel = (unitId?: string | null) => {
    if (!unitId) {
      return '';
    }
    const unit = units.find((entry) => entry.id === unitId);
    return unit ? buildUnitLabel(unit) : '';
  };

  const resolveVariantUnitLabel = (variantId: string) => {
    const variant = variants.find((entry) => entry.id === variantId);
    return resolveUnitLabel(variant?.baseUnitId ?? null);
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
  const pagedSales = sales.slice(
    (salesPage - 1) * salesPageSize,
    salesPage * salesPageSize,
  );
  const pagedVariance = stockCountVariance.slice(
    (variancePage - 1) * variancePageSize,
    variancePage * variancePageSize,
  );

  const load = async () => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    const params = new URLSearchParams();
    if (filters.branchId) {
      params.set('branchId', filters.branchId);
    }
    if (filters.startDate) {
      params.set('startDate', filters.startDate);
    }
    if (filters.endDate) {
      params.set('endDate', filters.endDate);
    }
    const branchParam = filters.branchId
      ? `branchId=${encodeURIComponent(filters.branchId)}`
      : '';
    try {
      const [
        branchData,
        variantData,
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
      ] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
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
            ...(filters.branchId ? { branchId: filters.branchId } : {}),
          }).toString()}`,
          { token },
        ),
        apiFetch<ExpiringBatch[]>(
          `/reports/expiry?${new URLSearchParams({
            days: expiryDays,
            ...(filters.branchId ? { branchId: filters.branchId } : {}),
          }).toString()}`,
          { token },
        ),
        apiFetch<StockCountVariance[]>(
          `/reports/stock-count-variance?${new URLSearchParams({
            branchId: filters.branchId,
            from: filters.startDate,
            to: filters.endDate,
          }).toString()}`,
          { token },
        ),
        apiFetch<StaffPerformance[]>(
          `/reports/staff?${params.toString()}`,
          { token },
        ),
      ]);
      setBranches(normalizePaginated(branchData).items);
      setVariants(normalizePaginated(variantData).items);
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
    } catch {
      setMessage({ action: 'load', outcome: 'failure', message: t('loadFailed') });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeBranch?.id && !filters.branchId) {
      setFilters((prev) => ({ ...prev, branchId: activeBranch.id }));
      return;
    }
    if (!hasInitialized) {
      load();
      setHasInitialized(true);
    }
  }, [activeBranch?.id, filters.branchId, hasInitialized]);

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
    const exportParams = new URLSearchParams();
    if (filters.branchId) {
      exportParams.set('branchId', filters.branchId);
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
      setMessage({ action: 'export', outcome: 'failure', message: t('exportFailed') });
      setIsExporting(false);
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
    setIsExporting(false);
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">
            {t('eyebrow')}
          </p>
          <h2 className="text-3xl font-semibold text-[color:var(--foreground)]">
            {t('title')}
          </h2>
          <p className="text-sm text-[color:var(--muted)]">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="status-chip">{t('statusLive')}</span>
          <span className="status-chip">{t('statusMultiBranch')}</span>
          <span className="status-chip">{t('currencyTzs')}</span>
        </div>
      </div>
      {message ? <StatusBanner message={message} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 nvi-stagger">
        <div className="kpi-card p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('revenue')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {pnl ? pnl.totals.revenue.toLocaleString() : '—'}
          </p>
        </div>
        <div className="kpi-card p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('cost')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {pnl ? pnl.totals.cost.toLocaleString() : '—'}
          </p>
        </div>
        <div className="kpi-card p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('expenses')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {pnl ? pnl.totals.expenses.toLocaleString() : '—'}
          </p>
        </div>
        <div className="kpi-card p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('netProfit')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {pnl ? pnl.totals.netProfit.toLocaleString() : '—'}
          </p>
        </div>
        <div className="kpi-card p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('vat')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {vatTotal.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="command-card p-6 space-y-4 nvi-reveal">
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
          </div>
          <button
            type="button"
            onClick={async () => {
              setIsRefreshing(true);
              await load();
              setIsRefreshing(false);
            }}
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
            onChange={(value) => setFilters({ ...filters, branchId: value })}
            placeholder={t('allBranches')}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
          />
          <DatePickerInput
            value={filters.startDate}
            onChange={(value) => setFilters({ ...filters, startDate: value })}
            placeholder={t('fromDate')}
            className="rounded border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-[color:var(--foreground)]"
          />
          <DatePickerInput
            value={filters.endDate}
            onChange={(value) => setFilters({ ...filters, endDate: value })}
            placeholder={t('toDate')}
            className="rounded border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-[color:var(--foreground)]"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] nvi-stagger">
        <div className="command-card p-6 space-y-4 nvi-reveal">
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
          <div className="chart-shell" />
          <div className="flex flex-wrap gap-4 text-sm text-[color:var(--muted)]">
            <span>{t('transactions')}: {salesRows.length}</span>
            <span>{t('totalSales')}: {salesTotal.toLocaleString()}</span>
          </div>
        </div>
        <div className="command-card p-6 space-y-4 nvi-reveal">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              {t('inventoryValuationEyebrow')}
            </p>
            <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
              {t('inventoryValuation')}
            </h3>
          </div>
          <div className="chart-shell chart-shell--compact" />
          <div className="text-sm text-[color:var(--muted)]">
            {t('inventoryValuationTotal', { value: 'TZS 0.00' })}
          </div>
          <div className="text-sm text-[color:var(--muted)]">
            {t('totalStockUnits', { count: totalStockUnits.toLocaleString() })}
          </div>
        </div>
      </div>

      <div className="command-card p-6 space-y-4 nvi-reveal">
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

      <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
        <div className="command-card p-6 space-y-3 nvi-reveal">
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
        <div className="command-card p-6 space-y-3 nvi-reveal">
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

      <div className="command-card p-6 space-y-3 nvi-reveal">
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
          pagedSales.map((row) => (
            <div key={row.customerId ?? 'unknown'} className="text-sm text-[color:var(--muted)]">
              {row.customerName ?? common('unknown')} · {t('salesCount', { count: row.count })} ·{' '}
              {row.total}
            </div>
          ))
        )}
        {sales.length > 0 ? (
          <PaginationControls
            page={salesPage}
            pageSize={salesPageSize}
            total={sales.length}
            itemCount={pagedSales.length}
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

      <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
        <div className="command-card p-6 space-y-2 nvi-reveal">
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
        <div className="command-card p-6 space-y-2 nvi-reveal">
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

      <div className="command-card p-6 space-y-2 nvi-reveal">
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

      <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
        <div className="command-card p-6 space-y-2 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('stockOnHand')}
          </h3>
          {stock.length === 0 ? (
            <StatusBanner message={t('noStock')} />
          ) : (
            stock.slice(0, 6).map((row) => (
              <div key={row.id} className="text-sm text-[color:var(--muted)]">
                {(() => {
                  const unitLabel = resolveVariantUnitLabel(row.variantId);
                  const variant = variants.find((item) => item.id === row.variantId);
                  const variantLabel = formatVariantLabel(
                    {
                      id: row.variantId,
                      name: row.variantName ?? variant?.name ?? null,
                      productName: row.productName ?? variant?.product?.name ?? null,
                    },
                    common('unknown'),
                  );
                  return (
                    <>
                      {variantLabel} · {row.quantity}
                      {unitLabel ? ` (${unitLabel})` : ''}
                    </>
                  );
                })()}
              </div>
            ))
          )}
        </div>
        <div className="command-card p-6 space-y-2 nvi-reveal">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('salesSummary')}
          </h3>
          <div className="text-sm text-[color:var(--muted)]">
            {t('transactions')}: {salesRows.length}
          </div>
          <div className="text-sm text-[color:var(--muted)]">
            {t('totalSales')}: {salesTotal.toLocaleString()}
          </div>
          <div className="text-sm text-[color:var(--muted)]">
            {t('vatTotal')}: {vatTotal.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
        <div className="command-card p-6 space-y-2 nvi-reveal">
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
          {lowStock.length === 0 ? (
            <StatusBanner message={t('noLowStock')} />
          ) : (
            lowStock.map((row) => (
              <div key={row.id} className="text-sm text-[color:var(--muted)]">
                {(() => {
                  const unitLabel = resolveUnitLabel(row.variant?.baseUnitId ?? null);
                  return (
                    <>
                      {formatVariantLabel(
                        {
                          id: row.variant?.id ?? null,
                          name: row.variant?.name ?? null,
                          productName: row.variant?.product?.name ?? null,
                        },
                        common('unknown'),
                      )}{' '}
                      · {row.quantity}
                      {unitLabel ? ` (${unitLabel})` : ''} (
                      {row.branch?.name ?? common('branch')})
                    </>
                  );
                })()}
              </div>
            ))
          )}
        </div>
        <div className="command-card p-6 space-y-2 nvi-reveal">
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
          {expiry.length === 0 ? (
            <StatusBanner message={t('noExpiry')} />
          ) : (
            expiry.map((row) => (
              <div key={row.id} className="text-sm text-[color:var(--muted)]">
                {formatVariantLabel(
                  {
                    id: row.variant?.id ?? null,
                    name: row.variant?.name ?? null,
                    productName: row.variant?.product?.name ?? null,
                  },
                  common('unknown'),
                )}{' '}
                ·{' '}
                {new Date(row.expiryDate).toLocaleDateString()} (
                {row.branch?.name ?? common('branch')})
              </div>
            ))
          )}
        </div>
      </div>

      <div className="command-card p-6 space-y-2 nvi-reveal">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {t('stockCountVariance')}
          </h3>
          <button
            type="button"
            onClick={async () => {
              setIsRefreshing(true);
              await load();
              setIsRefreshing(false);
            }}
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

      <div className="command-card p-6 space-y-2 nvi-reveal">
        <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
          {t('staffPerformance')}
        </h3>
        {staff.length === 0 ? (
          <StatusBanner message={t('noStaffPerformance')} />
        ) : (
          staff.map((row) => (
            <div key={row.cashierId} className="text-sm text-[color:var(--muted)]">
              {formatEntityLabel(
                { name: row.cashierName ?? null, id: row.cashierId },
                common('unknown'),
              )}{' '}
              · {t('salesCount', { count: row._count.id ?? 0 })} ·{' '}
              {row._sum.total}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
