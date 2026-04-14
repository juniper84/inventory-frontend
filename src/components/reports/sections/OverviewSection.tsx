'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useCurrency } from '@/lib/business-context';
import { SectionSkeleton } from '../widgets/SectionSkeleton';
import { FreshnessBadge } from '../widgets/FreshnessBadge';
import { NarrativeCard } from '../widgets/NarrativeCard';
import { KpiRing } from '../widgets/KpiRing';
import { TrendCard } from '../widgets/TrendCard';
import { BreakdownBars } from '../widgets/BreakdownBars';
import { RankedList } from '../widgets/RankedList';
import { StatusCard } from '../widgets/StatusCard';
import {
  formatCompact,
  formatPercentChange,
  calcTrend,
  makeIntegerFormatter,
} from '../utils/format';
import type { ReportFilters } from '../hooks/useReportFilters';
import { useRegisterPdfSection, type SectionPdfPayload } from '../pdf/pdf-context';

/* ─── Types ─── */
type Sale = { id: string; total: number | string; createdAt: string };
type PnlTotals = {
  revenue: number;
  cost: number;
  grossProfit: number;
  netProfit: number;
  expenses: number;
};
type PnlReport = { totals: PnlTotals };
type TopProduct = {
  variantId: string;
  variantName: string | null;
  productName: string | null;
  totalRevenue: number;
  quantity: number;
};
type SalesByBranch = {
  items: { branchId: string; branchName: string | null; totalSales: number }[];
};
type LowStockItem = { id: string; quantity: number | string };
type StockValue = { stockValue: number; trackedVariants: number };

/* ─── Props ─── */
type Props = { filters: ReportFilters };

export function OverviewSection({ filters }: Props) {
  const t = useTranslations('reports');
  const locale = useLocale();
  const numberLocale = locale === 'sw' ? 'sw-TZ' : 'en-TZ';
  const currency = useCurrency();
  const integerFmt = useMemo(() => makeIntegerFormatter(numberLocale), [numberLocale]);

  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [prevSales, setPrevSales] = useState<Sale[]>([]);
  const [pnl, setPnl] = useState<PnlReport | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [salesByBranch, setSalesByBranch] = useState<SalesByBranch | null>(null);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [stockValue, setStockValue] = useState<StockValue | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const params = new URLSearchParams();
    if (filters.branchId) params.set('branchId', filters.branchId);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    const qs = params.toString();

    // Previous period for comparison
    const prevParams = new URLSearchParams();
    if (filters.branchId) prevParams.set('branchId', filters.branchId);
    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      const span = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 86400000);
      const prevStart = new Date(prevEnd.getTime() - span);
      prevParams.set('startDate', prevStart.toISOString().slice(0, 10));
      prevParams.set('endDate', prevEnd.toISOString().slice(0, 10));
    }
    const prevQs = prevParams.toString();

    const opts = { token, signal: controller.signal };

    Promise.all([
      apiFetch<Sale[]>(`/reports/sales?${qs}`, opts).catch(() => [] as Sale[]),
      prevQs
        ? apiFetch<Sale[]>(`/reports/sales?${prevQs}`, opts).catch(() => [] as Sale[])
        : Promise.resolve([] as Sale[]),
      apiFetch<PnlReport | null>(`/reports/pnl?${qs}`, opts).catch(() => null),
      apiFetch<{ items: TopProduct[] }>(`/reports/top-products?${qs}&limit=5`, opts).catch(
        () => ({ items: [] as TopProduct[] }),
      ),
      apiFetch<SalesByBranch | null>(`/reports/sales-by-branch?${qs}`, opts).catch(
        () => null,
      ),
      apiFetch<LowStockItem[]>(
        `/reports/low-stock?threshold=5${
          filters.branchId ? `&branchId=${filters.branchId}` : ''
        }`,
        opts,
      ).catch(() => [] as LowStockItem[]),
      apiFetch<StockValue | null>(
        `/reports/stock-value${
          filters.branchId ? `?branchId=${filters.branchId}` : ''
        }`,
        opts,
      ).catch(() => null),
    ])
      .then(([s, ps, p, tp, sbb, ls, sv]) => {
        if (controller.signal.aborted) return;
        setSales(s);
        setPrevSales(ps);
        setPnl(p);
        setTopProducts(tp.items ?? []);
        setSalesByBranch(sbb);
        setLowStock(ls);
        setStockValue(sv);
      })
      .catch(() => {
        /* swallow aborts */
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setUpdatedAt(Date.now());
        }
      });

    return () => controller.abort();
  }, [filters.branchId, filters.startDate, filters.endDate]);

  /* ─── Computed values ─── */
  const salesTotal = useMemo(
    () => sales.reduce((sum, s) => sum + Number(s.total ?? 0), 0),
    [sales],
  );
  const prevSalesTotal = useMemo(
    () => prevSales.reduce((sum, s) => sum + Number(s.total ?? 0), 0),
    [prevSales],
  );
  const salesTrend = useMemo(
    () => calcTrend(salesTotal, prevSalesTotal),
    [salesTotal, prevSalesTotal],
  );

  // Daily sales for sparkline
  const salesByDay = useMemo(() => {
    const perDay = new Map<string, number>();
    for (const s of sales) {
      const day = new Date(s.createdAt).toISOString().slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + Number(s.total ?? 0));
    }
    return Array.from(perDay.keys())
      .sort()
      .map((day) => perDay.get(day) ?? 0);
  }, [sales]);

  const marginPct = useMemo(() => {
    if (!pnl || pnl.totals.revenue === 0) return 0;
    return (pnl.totals.grossProfit / pnl.totals.revenue) * 100;
  }, [pnl]);

  const stockHealthPct = useMemo(() => {
    if (!stockValue || stockValue.trackedVariants === 0) return 100;
    return ((stockValue.trackedVariants - lowStock.length) / stockValue.trackedVariants) * 100;
  }, [stockValue, lowStock]);

  const topBranch = useMemo(() => {
    if (!salesByBranch?.items?.length) return null;
    return [...salesByBranch.items].sort((a, b) => b.totalSales - a.totalSales)[0];
  }, [salesByBranch]);

  const criticalLowStock = useMemo(
    () => lowStock.filter((i) => Number(i.quantity ?? 0) <= 2).length,
    [lowStock],
  );

  /* ─── PDF payload ─── */
  const pdfPayload = useMemo<SectionPdfPayload | null>(() => {
    if (loading) return null;
    const salesStr = formatCompact(salesTotal, currency, numberLocale);
    const headline =
      salesTrend.direction === 'up'
        ? `Revenue is up ${formatPercentChange(salesTrend.pct)} this period — ${salesStr} in sales${topBranch ? `, driven by ${topBranch.branchName ?? 'top branch'}` : ''}.`
        : salesTrend.direction === 'down'
          ? `Revenue is down ${formatPercentChange(salesTrend.pct)} — ${salesStr} in sales this period.`
          : `Revenue holding steady at ${salesStr} this period.`;
    const subline =
      criticalLowStock > 0
        ? `${criticalLowStock} critical low stock ${criticalLowStock === 1 ? 'item' : 'items'} need attention.`
        : 'Stock levels are healthy across all tracked items.';
    return {
      headline,
      subline,
      kpis: [
        {
          label: 'Total Sales',
          value: salesStr,
          sub: `${sales.length} ${sales.length === 1 ? 'transaction' : 'transactions'}`,
        },
        {
          label: 'Gross Profit',
          value: formatCompact(pnl?.totals.grossProfit ?? 0, currency, numberLocale),
          sub: `${marginPct.toFixed(1)}% margin`,
        },
        {
          label: 'Stock Health',
          value: `${integerFmt.format(stockValue?.trackedVariants ?? 0)} SKUs`,
          sub: `${criticalLowStock} critical`,
        },
        {
          label: 'Expenses',
          value: formatCompact(pnl?.totals.expenses ?? 0, currency, numberLocale),
          sub: 'vs revenue',
        },
      ],
      breakdowns: [
        {
          title: 'Sales by branch',
          rows:
            salesByBranch?.items
              .slice()
              .sort((a, b) => b.totalSales - a.totalSales)
              .slice(0, 5)
              .map((b) => ({
                label: b.branchName ?? 'Branch',
                value: formatCompact(b.totalSales, currency, numberLocale),
              })) ?? [],
          emptyMessage: 'No branch data',
        },
      ],
      tables: [
        {
          title: 'Top products',
          headers: ['#', 'Product', 'Quantity', 'Revenue'],
          rows: topProducts.slice(0, 10).map((p, i) => [
            String(i + 1),
            p.productName ?? p.variantName ?? 'Unknown',
            integerFmt.format(p.quantity),
            formatCompact(p.totalRevenue, currency, numberLocale),
          ]),
          emptyMessage: 'No sales yet',
        },
      ],
    };
  }, [
    loading,
    salesTotal,
    salesTrend,
    topBranch,
    criticalLowStock,
    sales.length,
    pnl,
    marginPct,
    stockValue,
    salesByBranch,
    topProducts,
    currency,
    numberLocale,
    integerFmt,
  ]);
  useRegisterPdfSection('overview', pdfPayload);

  if (loading) {
    return <SectionSkeleton />;
  }

  /* ─── Narrative ─── */
  const narrativeHeadline = (() => {
    const salesStr = formatCompact(salesTotal, currency, numberLocale);
    if (salesTrend.direction === 'up') {
      return (
        <>
          Revenue is <span className="rpt-narrative__accent">up {formatPercentChange(salesTrend.pct)}</span>{' '}
          this period — <span className="rpt-narrative__accent">{salesStr}</span> in sales
          {topBranch ? (
            <>
              , driven by <span className="rpt-narrative__accent">{topBranch.branchName}</span>
            </>
          ) : null}
          .
        </>
      );
    }
    if (salesTrend.direction === 'down') {
      return (
        <>
          Revenue is <span className="rpt-narrative__accent rpt-narrative__accent--red">down {formatPercentChange(salesTrend.pct)}</span>{' '}
          — <span className="rpt-narrative__accent">{salesStr}</span> in sales this period.
        </>
      );
    }
    return (
      <>
        Revenue holding steady at <span className="rpt-narrative__accent">{salesStr}</span> this
        period.
      </>
    );
  })();

  const narrativeSubline =
    criticalLowStock > 0
      ? `${criticalLowStock} critical low stock ${criticalLowStock === 1 ? 'item' : 'items'} need attention.`
      : 'Stock levels are healthy across all tracked items.';

  return (
    <div className="rpt-section">
      <div className="rpt-section-header">
        <FreshnessBadge updatedAt={updatedAt} />
      </div>
      {/* Narrative hero */}
      <NarrativeCard
        eyebrow={t('sectionOverview') ?? 'Overview'}
        headline={narrativeHeadline}
        subline={narrativeSubline}
        accent={salesTrend.direction === 'down' ? 'red' : 'gold'}
        badge="LIVE"
      />

      {/* KPI rings row */}
      <div className="rpt-grid rpt-grid--4">
        <KpiRing
          label={t('totalSales') ?? 'Sales'}
          value={formatCompact(salesTotal, currency, numberLocale)}
          sub={`${sales.length} ${sales.length === 1 ? 'transaction' : 'transactions'}`}
          percent={Math.min(Math.abs(salesTrend.pct), 100)}
          color="#f6d37a"
          trend={salesTrend}
        />
        <KpiRing
          label={t('grossProfit') ?? 'Gross profit'}
          value={formatCompact(pnl?.totals.grossProfit ?? 0, currency, numberLocale)}
          sub={`${marginPct.toFixed(1)}% margin`}
          percent={marginPct}
          color="#34d399"
        />
        <KpiRing
          label={t('stockHealth') ?? 'Stock health'}
          value={`${integerFmt.format(stockValue?.trackedVariants ?? 0)} SKUs`}
          sub={`${criticalLowStock} critical`}
          percent={stockHealthPct}
          color="#2dd4bf"
        />
        <KpiRing
          label={t('expenses') ?? 'Expenses'}
          value={formatCompact(pnl?.totals.expenses ?? 0, currency, numberLocale)}
          sub={`vs revenue`}
          percent={
            pnl && pnl.totals.revenue > 0
              ? Math.min((pnl.totals.expenses / pnl.totals.revenue) * 100, 100)
              : 0
          }
          color="#a78bfa"
        />
      </div>

      {/* Charts & breakdowns row */}
      <div className="rpt-grid rpt-grid--2">
        <TrendCard
          title={t('salesTrendTitle') ?? 'Sales trend'}
          badge={t('sectionOverview') ?? 'This period'}
          points={salesByDay}
          color="#f6d37a"
          height={160}
        >
          <div className="rpt-trend__footer">
            <span>{sales.length} transactions</span>
            <span className="rpt-trend__footer-value">
              {formatCompact(salesTotal, currency, numberLocale)}
            </span>
          </div>
        </TrendCard>

        <BreakdownBars
          title={t('salesByBranchTitle') ?? 'Sales by branch'}
          badge={`${salesByBranch?.items.length ?? 0} ${t('branchesLabel') ?? 'branches'}`}
          items={
            salesByBranch?.items
              .slice()
              .sort((a, b) => b.totalSales - a.totalSales)
              .slice(0, 5)
              .map((b) => ({
                label: b.branchName ?? 'Branch',
                value: b.totalSales,
                display: formatCompact(b.totalSales, currency, numberLocale),
                color: '#2dd4bf',
              })) ?? []
          }
          emptyMessage={t('noBranchData') ?? 'No branch data'}
        />
      </div>

      {/* Top products + Status cards */}
      <div className="rpt-grid rpt-grid--2">
        <RankedList
          title={t('topProductsTitle') ?? 'Top products'}
          badge={t('thisWeek') ?? 'This period'}
          items={topProducts.slice(0, 5).map((p) => ({
            id: p.variantId,
            name: p.productName ?? p.variantName ?? 'Unknown',
            value: formatCompact(p.totalRevenue, currency, numberLocale),
            sub: `${integerFmt.format(p.quantity)} sold`,
          }))}
          emptyMessage={t('noTopProducts') ?? 'No sales yet'}
        />

        <div className="rpt-stack">
          <StatusCard
            icon="📦"
            label={t('stockValueLabel') ?? 'Stock value'}
            value={formatCompact(stockValue?.stockValue ?? 0, currency, numberLocale)}
            sub={`${integerFmt.format(stockValue?.trackedVariants ?? 0)} SKUs tracked`}
            severity="neutral"
          />
          <StatusCard
            icon="⚠️"
            label={t('lowStock') ?? 'Low stock'}
            value={integerFmt.format(lowStock.length)}
            sub={`${criticalLowStock} critical`}
            severity={criticalLowStock > 0 ? 'critical' : lowStock.length > 0 ? 'warning' : 'good'}
          />
          <StatusCard
            icon="💰"
            label={t('netProfit') ?? 'Net profit'}
            value={formatCompact(pnl?.totals.netProfit ?? 0, currency, numberLocale)}
            sub={(pnl?.totals.netProfit ?? 0) >= 0 ? 'profit' : 'loss'}
            severity={(pnl?.totals.netProfit ?? 0) >= 0 ? 'good' : 'critical'}
          />
        </div>
      </div>
    </div>
  );
}
