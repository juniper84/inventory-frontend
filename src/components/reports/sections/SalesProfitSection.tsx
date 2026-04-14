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
import { StatusCard } from '../widgets/StatusCard';
import { DrillDownDrawer } from '../widgets/DrillDownDrawer';
import { SimplePager } from '../widgets/SimplePager';
import { formatCompact, formatPercentChange, calcTrend, makeCurrencyFormatter } from '../utils/format';
import type { ReportFilters } from '../hooks/useReportFilters';
import { useRegisterPdfSection, type SectionPdfPayload } from '../pdf/pdf-context';

type PnlTotals = {
  revenue: number;
  cost: number;
  grossProfit: number;
  refunds: number;
  losses: number;
  adjustmentGains: number;
  stockCountShortages: number;
  stockCountSurpluses: number;
  stockCosts: number;
  expenses: number;
  transferFees: number;
  netProfit: number;
};

type PnlByDay = {
  date: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  netProfit: number;
  expenses: number;
};

type PnlReport = { totals: PnlTotals; byDay?: PnlByDay[] };

type VatSummary = {
  totalVat: number;
  byRate: { vatRate: number; vatAmount: number }[];
  byDay: { date: string; vatAmount: number }[];
};

type Props = { filters: ReportFilters };

const PAGE_SIZE = 10;

export function SalesProfitSection({ filters }: Props) {
  const t = useTranslations('reports');
  const locale = useLocale();
  const numberLocale = locale === 'sw' ? 'sw-TZ' : 'en-TZ';
  const currency = useCurrency();
  const currencyFmt = useMemo(
    () => makeCurrencyFormatter(currency, numberLocale),
    [currency, numberLocale],
  );
  const [vatDayPage, setVatDayPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [pnl, setPnl] = useState<PnlReport | null>(null);
  const [prevPnl, setPrevPnl] = useState<PnlReport | null>(null);
  const [vat, setVat] = useState<VatSummary | null>(null);
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
      apiFetch<PnlReport | null>(`/reports/pnl?${qs}`, opts).catch(() => null),
      prevQs
        ? apiFetch<PnlReport | null>(`/reports/pnl?${prevQs}`, opts).catch(() => null)
        : Promise.resolve(null),
      apiFetch<VatSummary | null>(`/reports/vat-summary?${qs}`, opts).catch(() => null),
    ])
      .then(([p, pp, v]) => {
        if (controller.signal.aborted) return;
        setPnl(p);
        setPrevPnl(pp);
        setVat(v);
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

  const totals = pnl?.totals;
  const prevTotals = prevPnl?.totals;

  const revenueTrend = useMemo(
    () => calcTrend(totals?.revenue ?? 0, prevTotals?.revenue ?? 0),
    [totals, prevTotals],
  );
  const netTrend = useMemo(
    () => calcTrend(totals?.netProfit ?? 0, prevTotals?.netProfit ?? 0),
    [totals, prevTotals],
  );

  const marginPct = useMemo(() => {
    if (!totals || totals.revenue === 0) return 0;
    return (totals.grossProfit / totals.revenue) * 100;
  }, [totals]);

  const netMarginPct = useMemo(() => {
    if (!totals || totals.revenue === 0) return 0;
    return (totals.netProfit / totals.revenue) * 100;
  }, [totals]);

  const expensePct = useMemo(() => {
    if (!totals || totals.revenue === 0) return 0;
    return Math.min((totals.expenses / totals.revenue) * 100, 100);
  }, [totals]);

  const netProfitSeries = useMemo(
    () => (pnl?.byDay ?? []).map((d) => d.netProfit),
    [pnl],
  );
  const revenueSeries = useMemo(
    () => (pnl?.byDay ?? []).map((d) => d.revenue),
    [pnl],
  );

  /* ─── PDF payload ─── */
  const pdfPayload = useMemo<SectionPdfPayload | null>(() => {
    if (loading) return null;
    const np = totals?.netProfit ?? 0;
    const rev = totals?.revenue ?? 0;
    const profitable = np >= 0;
    const profitStr = formatCompact(Math.abs(np), currency, numberLocale);
    const revStr = formatCompact(rev, currency, numberLocale);
    const trendTxt =
      netTrend.direction === 'flat'
        ? ''
        : ` — ${netTrend.direction === 'up' ? 'up' : 'down'} ${formatPercentChange(netTrend.pct)}`;
    const headline = profitable
      ? `Net profit ${profitStr} on ${revStr} revenue${trendTxt}.`
      : `Net loss of ${profitStr} against ${revStr} revenue.`;
    const subline = `${marginPct.toFixed(1)}% gross margin · ${netMarginPct.toFixed(1)}% net margin`;
    return {
      headline,
      subline,
      kpis: [
        {
          label: 'Revenue',
          value: revStr,
          sub: `${Math.min(Math.abs(revenueTrend.pct), 100).toFixed(0)}% vs prev`,
        },
        {
          label: 'Gross Profit',
          value: formatCompact(totals?.grossProfit ?? 0, currency, numberLocale),
          sub: `${marginPct.toFixed(1)}% margin`,
        },
        {
          label: 'Expenses',
          value: formatCompact(totals?.expenses ?? 0, currency, numberLocale),
          sub: `${expensePct.toFixed(1)}% of revenue`,
        },
        {
          label: 'Net Profit',
          value: formatCompact(np, currency, numberLocale),
          sub: `${netMarginPct.toFixed(1)}% net margin`,
        },
      ],
      breakdowns: totals
        ? [
            {
              title: 'P&L breakdown',
              rows: [
                { label: 'Revenue', value: formatCompact(totals.revenue, currency, numberLocale) },
                { label: 'Cost', value: formatCompact(totals.cost, currency, numberLocale) },
                { label: 'Gross profit', value: formatCompact(totals.grossProfit, currency, numberLocale) },
                { label: 'Expenses', value: formatCompact(totals.expenses, currency, numberLocale) },
                { label: 'Refunds', value: formatCompact(totals.refunds, currency, numberLocale) },
                { label: 'Losses', value: formatCompact(totals.losses, currency, numberLocale) },
                { label: 'Net profit', value: formatCompact(totals.netProfit, currency, numberLocale) },
              ],
            },
          ]
        : [],
      tables: [
        {
          title: 'VAT by rate',
          headers: ['Rate', 'VAT amount'],
          rows: (vat?.byRate ?? []).map((r) => [
            `${(r.vatRate * 100).toFixed(1)}%`,
            currencyFmt.format(r.vatAmount),
          ]),
          emptyMessage: 'No VAT data',
        },
        {
          title: 'VAT by day',
          headers: ['Date', 'VAT amount'],
          rows: (vat?.byDay ?? []).map((r) => [
            r.date,
            currencyFmt.format(r.vatAmount),
          ]),
          emptyMessage: 'No VAT data',
        },
      ],
    };
  }, [
    loading,
    totals,
    netTrend,
    revenueTrend,
    marginPct,
    netMarginPct,
    expensePct,
    vat,
    currency,
    numberLocale,
    currencyFmt,
  ]);
  useRegisterPdfSection('sales-profit', pdfPayload);

  if (loading) {
    return <SectionSkeleton />;
  }

  const netProfit = totals?.netProfit ?? 0;
  const revenue = totals?.revenue ?? 0;
  const isProfit = netProfit >= 0;

  const narrativeHeadline = (() => {
    const profitStr = formatCompact(Math.abs(netProfit), currency, numberLocale);
    const revenueStr = formatCompact(revenue, currency, numberLocale);
    if (isProfit) {
      return (
        <>
          Net profit{' '}
          <span className="rpt-narrative__accent">{profitStr}</span> on{' '}
          <span className="rpt-narrative__accent">{revenueStr}</span> revenue
          {netTrend.direction !== 'flat' ? (
            <>
              {' '}—{' '}
              <span
                className={`rpt-narrative__accent${
                  netTrend.direction === 'down' ? ' rpt-narrative__accent--red' : ''
                }`}
              >
                {netTrend.direction === 'up' ? 'up' : 'down'}{' '}
                {formatPercentChange(netTrend.pct)}
              </span>
            </>
          ) : null}
          .
        </>
      );
    }
    return (
      <>
        Net loss of{' '}
        <span className="rpt-narrative__accent rpt-narrative__accent--red">
          {profitStr}
        </span>{' '}
        against <span className="rpt-narrative__accent">{revenueStr}</span> revenue.
      </>
    );
  })();

  const narrativeSubline = `${marginPct.toFixed(1)}% gross margin · ${netMarginPct.toFixed(1)}% net margin`;

  const breakdownItems = totals
    ? [
        { label: t('revenue'), value: totals.revenue, display: formatCompact(totals.revenue, currency, numberLocale), color: '#f6d37a' },
        { label: t('cost'), value: totals.cost, display: formatCompact(totals.cost, currency, numberLocale), color: '#2dd4bf' },
        { label: t('grossProfit'), value: Math.abs(totals.grossProfit), display: formatCompact(totals.grossProfit, currency, numberLocale), color: '#34d399' },
        { label: t('expenses'), value: totals.expenses, display: formatCompact(totals.expenses, currency, numberLocale), color: '#a78bfa' },
        { label: t('refunds'), value: totals.refunds, display: formatCompact(totals.refunds, currency, numberLocale), color: '#fbbf24' },
        { label: t('losses'), value: totals.losses, display: formatCompact(totals.losses, currency, numberLocale), color: '#ef4444' },
      ].filter((it) => it.value > 0)
    : [];

  return (
    <div className="rpt-section">
      <div className="rpt-section-header">
        <FreshnessBadge updatedAt={updatedAt} />
      </div>
      <NarrativeCard
        eyebrow={t('sectionSalesProfit')}
        headline={narrativeHeadline}
        subline={narrativeSubline}
        accent={isProfit ? 'green' : 'red'}
        badge="P&L"
      />

      <div className="rpt-grid rpt-grid--4">
        <KpiRing
          label={t('revenue')}
          value={formatCompact(revenue, currency, numberLocale)}
          sub={`${Math.min(Math.abs(revenueTrend.pct), 100).toFixed(0)}% vs prev`}
          percent={Math.min(Math.abs(revenueTrend.pct), 100)}
          color="#f6d37a"
          trend={revenueTrend}
        />
        <KpiRing
          label={t('grossProfit')}
          value={formatCompact(totals?.grossProfit ?? 0, currency, numberLocale)}
          sub={`${marginPct.toFixed(1)}% margin`}
          percent={Math.max(0, Math.min(marginPct, 100))}
          color="#34d399"
        />
        <KpiRing
          label={t('expenses')}
          value={formatCompact(totals?.expenses ?? 0, currency, numberLocale)}
          sub={`${expensePct.toFixed(1)}% of revenue`}
          percent={expensePct}
          color="#a78bfa"
        />
        <KpiRing
          label={t('netProfit')}
          value={formatCompact(netProfit, currency, numberLocale)}
          sub={`${netMarginPct.toFixed(1)}% net margin`}
          percent={Math.max(0, Math.min(Math.abs(netMarginPct), 100))}
          color={isProfit ? '#34d399' : '#ef4444'}
          trend={netTrend}
        />
      </div>

      <div className="rpt-grid rpt-grid--2">
        <TrendCard
          title={t('pnlByDay')}
          badge={t('netProfit')}
          points={netProfitSeries}
          color={isProfit ? '#34d399' : '#ef4444'}
          height={160}
        >
          <div className="rpt-trend__footer">
            <span>{netProfitSeries.length} days</span>
            <span className="rpt-trend__footer-value">
              {formatCompact(netProfit, currency, numberLocale)}
            </span>
          </div>
        </TrendCard>

        <TrendCard
          title={t('salesTrendTitle')}
          badge={t('revenue')}
          points={revenueSeries}
          color="#f6d37a"
          height={160}
        >
          <div className="rpt-trend__footer">
            <span>{revenueSeries.length} days</span>
            <span className="rpt-trend__footer-value">
              {formatCompact(revenue, currency, numberLocale)}
            </span>
          </div>
        </TrendCard>
      </div>

      <div className="rpt-grid rpt-grid--2">
        <BreakdownBars
          title={t('pnlBreakdown')}
          badge={t('pnlSummary')}
          items={breakdownItems}
          emptyMessage={t('noData')}
        />

        <div className="rpt-stack">
          <StatusCard
            icon="💎"
            label={t('vatTotal')}
            value={formatCompact(vat?.totalVat ?? 0, currency, numberLocale)}
            sub={`${vat?.byRate?.length ?? 0} rate${(vat?.byRate?.length ?? 0) === 1 ? '' : 's'}`}
            severity="neutral"
          />
          <StatusCard
            icon="↩️"
            label={t('refunds')}
            value={formatCompact(totals?.refunds ?? 0, currency, numberLocale)}
            sub={revenue > 0 ? `${((totals?.refunds ?? 0) / revenue * 100).toFixed(1)}% of revenue` : ''}
            severity={(totals?.refunds ?? 0) > revenue * 0.05 ? 'warning' : 'neutral'}
          />
          <StatusCard
            icon="⚠️"
            label={t('losses')}
            value={formatCompact(totals?.losses ?? 0, currency, numberLocale)}
            sub={`+ ${formatCompact(totals?.stockCountShortages ?? 0, currency, numberLocale)} shortages`}
            severity={(totals?.losses ?? 0) > 0 ? 'warning' : 'good'}
          />
        </div>
      </div>

      {/* Drill-down: VAT by rate */}
      <DrillDownDrawer
        title={t('vatByRate')}
        badge={`${vat?.byRate?.length ?? 0} rates`}
      >
        {vat?.byRate?.length ? (
          <div className="rpt-table__wrap">
            <table className="rpt-table">
              <thead>
                <tr>
                  <th>{t('vatRateHeader')}</th>
                  <th className="rpt-table__num">{t('vatTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {vat.byRate.map((row, i) => (
                  <tr key={`${row.vatRate}-${i}`}>
                    <td>{(row.vatRate * 100).toFixed(1)}%</td>
                    <td className="rpt-table__num">
                      {currencyFmt.format(row.vatAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rpt-table__empty">{t('noData')}</p>
        )}
      </DrillDownDrawer>

      {/* Drill-down: VAT by day */}
      <DrillDownDrawer
        title={t('vatByDay')}
        badge={`${vat?.byDay?.length ?? 0} days`}
      >
        {vat?.byDay?.length ? (
          <>
            <div className="rpt-table__wrap">
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="rpt-table__num">{t('vatTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {vat.byDay
                    .slice((vatDayPage - 1) * PAGE_SIZE, vatDayPage * PAGE_SIZE)
                    .map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td className="rpt-table__num">
                          {currencyFmt.format(row.vatAmount)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <SimplePager
              page={vatDayPage}
              totalPages={Math.max(1, Math.ceil(vat.byDay.length / PAGE_SIZE))}
              onChange={setVatDayPage}
            />
          </>
        ) : (
          <p className="rpt-table__empty">{t('noData')}</p>
        )}
      </DrillDownDrawer>
    </div>
  );
}
