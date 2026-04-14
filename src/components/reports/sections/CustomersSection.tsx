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
import { RankedList } from '../widgets/RankedList';
import { BreakdownBars } from '../widgets/BreakdownBars';
import { StatusCard } from '../widgets/StatusCard';
import { DrillDownDrawer } from '../widgets/DrillDownDrawer';
import { SimplePager } from '../widgets/SimplePager';
import {
  formatCompact,
  makeCurrencyFormatter,
  makeIntegerFormatter,
} from '../utils/format';
import { buildRequestHeaders, getApiErrorMessageFromResponse } from '@/lib/api';
import type { ReportFilters } from '../hooks/useReportFilters';
import { useRegisterPdfSection, type SectionPdfPayload } from '../pdf/pdf-context';

type CustomerAggregate = {
  customerId: string | null;
  customerName: string | null;
  total: number | string;
  count: number | string;
};

type Outstanding = {
  id: string;
  customerId: string | null;
  customerNameSnapshot: string | null;
  outstandingAmount: number | string;
  creditDueDate?: string | null;
};

type Props = { filters: ReportFilters };

export function CustomersSection({ filters }: Props) {
  const t = useTranslations('reports');
  const locale = useLocale();
  const numberLocale = locale === 'sw' ? 'sw-TZ' : 'en-TZ';
  const currency = useCurrency();
  const integerFmt = useMemo(() => makeIntegerFormatter(numberLocale), [numberLocale]);
  const currencyFmt = useMemo(
    () => makeCurrencyFormatter(currency, numberLocale),
    [currency, numberLocale],
  );

  const [loading, setLoading] = useState(true);
  const [salesPage, setSalesPage] = useState(1);
  const [outstandingPage, setOutstandingPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const PAGE_SIZE = 10;
  const [sales, setSales] = useState<CustomerAggregate[]>([]);
  const [refunds, setRefunds] = useState<CustomerAggregate[]>([]);
  const [topCustomers, setTopCustomers] = useState<CustomerAggregate[]>([]);
  const [outstanding, setOutstanding] = useState<Outstanding[]>([]);
  const [nowTs, setNowTs] = useState(() => Date.now());
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

    const opts = { token, signal: controller.signal };

    Promise.all([
      apiFetch<CustomerAggregate[]>(`/reports/customers/sales?${qs}`, opts).catch(
        () => [] as CustomerAggregate[],
      ),
      apiFetch<CustomerAggregate[]>(`/reports/customers/refunds?${qs}`, opts).catch(
        () => [] as CustomerAggregate[],
      ),
      apiFetch<CustomerAggregate[]>(`/reports/customers/top?${qs}`, opts).catch(
        () => [] as CustomerAggregate[],
      ),
      apiFetch<Outstanding[]>(`/reports/customers/outstanding?${qs}`, opts).catch(
        () => [] as Outstanding[],
      ),
    ])
      .then(([s, r, tc, o]) => {
        if (controller.signal.aborted) return;
        setSales(s);
        setRefunds(r);
        setTopCustomers(tc);
        setOutstanding(o);
      })
      .catch(() => {
        /* aborts */
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          const ts = Date.now();
          setNowTs(ts);
          setUpdatedAt(ts);
        }
      });

    return () => controller.abort();
  }, [filters.branchId, filters.startDate, filters.endDate]);

  const totalSales = useMemo(
    () => sales.reduce((sum, s) => sum + Number(s.total ?? 0), 0),
    [sales],
  );
  const totalTransactions = useMemo(
    () => sales.reduce((sum, s) => sum + Number(s.count ?? 0), 0),
    [sales],
  );
  const totalOutstanding = useMemo(
    () => outstanding.reduce((sum, o) => sum + Number(o.outstandingAmount ?? 0), 0),
    [outstanding],
  );
  const totalRefunds = useMemo(
    () => refunds.reduce((sum, r) => sum + Number(r.total ?? 0), 0),
    [refunds],
  );

  const activeCustomers = sales.filter((s) => s.customerId).length;
  const avgTicket = totalTransactions > 0 ? totalSales / totalTransactions : 0;

  const overdueCount = useMemo(() => {
    return outstanding.filter((o) => {
      if (!o.creditDueDate) return false;
      return new Date(o.creditDueDate).getTime() < nowTs;
    }).length;
  }, [outstanding, nowTs]);

  const outstandingPct = useMemo(() => {
    const combined = totalSales + totalOutstanding;
    if (combined === 0) return 0;
    return (totalOutstanding / combined) * 100;
  }, [totalSales, totalOutstanding]);

  const topCustomer = topCustomers[0];

  const sortedSales = useMemo(
    () =>
      [...sales].sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0)),
    [sales],
  );
  const sortedOutstanding = useMemo(
    () =>
      [...outstanding].sort(
        (a, b) =>
          Number(b.outstandingAmount ?? 0) - Number(a.outstandingAmount ?? 0),
      ),
    [outstanding],
  );

  const handleExport = async () => {
    const token = getAccessToken();
    if (!token) return;
    setIsExporting(true);
    setExportMsg(null);
    try {
      const exportParams = new URLSearchParams();
      if (filters.branchId) exportParams.set('branchId', filters.branchId);
      if (filters.startDate) exportParams.set('startDate', filters.startDate);
      if (filters.endDate) exportParams.set('endDate', filters.endDate);
      const base =
        process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';
      const { headers } = buildRequestHeaders(token);
      const response = await fetch(
        `${base}/reports/customers/export${
          exportParams.toString() ? `?${exportParams.toString()}` : ''
        }`,
        { headers },
      );
      if (!response.ok) {
        const msg = await getApiErrorMessageFromResponse(
          response,
          t('exportFailed'),
        );
        setExportMsg(msg);
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
      setExportMsg(t('exported'));
    } catch {
      setExportMsg(t('exportFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  /* ─── PDF payload ─── */
  const pdfPayload = useMemo<SectionPdfPayload | null>(() => {
    if (loading) return null;
    const totalStr = formatCompact(totalSales, currency, numberLocale);
    const headline = topCustomer
      ? `${integerFmt.format(activeCustomers)} customers generated ${totalStr} — led by ${topCustomer.customerName ?? 'walk-in'} at ${formatCompact(Number(topCustomer.total ?? 0), currency, numberLocale)}.`
      : `${integerFmt.format(activeCustomers)} customers generated ${totalStr} this period.`;
    const subline =
      overdueCount > 0
        ? `${overdueCount} overdue credit ${overdueCount === 1 ? 'balance' : 'balances'} flagged.`
        : totalOutstanding > 0
          ? `${formatCompact(totalOutstanding, currency, numberLocale)} outstanding — all within term.`
          : 'All accounts settled.';
    return {
      headline,
      subline,
      kpis: [
        {
          label: 'Total Sales',
          value: totalStr,
          sub: `${integerFmt.format(totalTransactions)} transactions`,
        },
        {
          label: 'Outstanding',
          value: formatCompact(totalOutstanding, currency, numberLocale),
          sub: `${integerFmt.format(outstanding.length)} customer${outstanding.length === 1 ? '' : 's'}`,
        },
        {
          label: 'Refunds',
          value: formatCompact(totalRefunds, currency, numberLocale),
          sub:
            totalSales > 0
              ? `${((totalRefunds / totalSales) * 100).toFixed(1)}% of sales`
              : '',
        },
        {
          label: 'Avg ticket',
          value: formatCompact(avgTicket, currency, numberLocale),
          sub: `${integerFmt.format(activeCustomers)} customers`,
        },
      ],
      tables: [
        {
          title: 'Customer sales',
          headers: ['#', 'Customer', 'Transactions', 'Total'],
          rows: sortedSales.map((s, i) => [
            String(i + 1),
            s.customerName ?? 'Walk-in',
            integerFmt.format(Number(s.count ?? 0)),
            currencyFmt.format(Number(s.total ?? 0)),
          ]),
          emptyMessage: 'No customer sales',
        },
        {
          title: 'Outstanding balances',
          headers: ['#', 'Customer', 'Amount', 'Due date'],
          rows: sortedOutstanding.map((o, i) => {
            const isOverdue =
              o.creditDueDate && new Date(o.creditDueDate).getTime() < nowTs;
            return [
              String(i + 1),
              o.customerNameSnapshot ?? 'Unknown',
              currencyFmt.format(Number(o.outstandingAmount ?? 0)),
              o.creditDueDate
                ? `${new Date(o.creditDueDate).toLocaleDateString()}${isOverdue ? ' (overdue)' : ''}`
                : '—',
            ];
          }),
          emptyMessage: 'No outstanding balances',
        },
      ],
    };
  }, [
    loading,
    topCustomer,
    activeCustomers,
    totalSales,
    totalTransactions,
    totalOutstanding,
    totalRefunds,
    avgTicket,
    overdueCount,
    outstanding.length,
    sortedSales,
    sortedOutstanding,
    nowTs,
    currency,
    numberLocale,
    integerFmt,
    currencyFmt,
  ]);
  useRegisterPdfSection('customers', pdfPayload);

  if (loading) {
    return <SectionSkeleton />;
  }

  const narrativeHeadline = (() => {
    const totalStr = formatCompact(totalSales, currency, numberLocale);
    if (topCustomer) {
      const topStr = formatCompact(Number(topCustomer.total ?? 0), currency, numberLocale);
      return (
        <>
          <span className="rpt-narrative__accent">{integerFmt.format(activeCustomers)}</span>{' '}
          customers generated{' '}
          <span className="rpt-narrative__accent">{totalStr}</span> — led by{' '}
          <span className="rpt-narrative__accent">
            {topCustomer.customerName ?? 'walk-in'}
          </span>{' '}
          at {topStr}.
        </>
      );
    }
    return (
      <>
        <span className="rpt-narrative__accent">{integerFmt.format(activeCustomers)}</span>{' '}
        customers generated{' '}
        <span className="rpt-narrative__accent">{totalStr}</span> this period.
      </>
    );
  })();

  const narrativeSubline =
    overdueCount > 0
      ? `${overdueCount} overdue credit ${overdueCount === 1 ? 'balance' : 'balances'} flagged.`
      : totalOutstanding > 0
        ? `${formatCompact(totalOutstanding, currency, numberLocale)} outstanding — all within term.`
        : 'All accounts settled.';

  const refundBreakdownItems = refunds
    .slice()
    .sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0))
    .slice(0, 5)
    .map((r) => ({
      label: r.customerName ?? 'Walk-in',
      value: Number(r.total ?? 0),
      display: formatCompact(Number(r.total ?? 0), currency, numberLocale),
      color: '#ef4444',
    }));

  return (
    <div className="rpt-section">
      <div className="rpt-section-header">
        <FreshnessBadge updatedAt={updatedAt} />
      </div>
      <NarrativeCard
        eyebrow={t('sectionCustomers')}
        headline={narrativeHeadline}
        subline={narrativeSubline}
        accent={overdueCount > 0 ? 'red' : 'teal'}
        badge="CRM"
      />

      <div className="rpt-grid rpt-grid--4">
        <KpiRing
          label={t('totalSales')}
          value={formatCompact(totalSales, currency, numberLocale)}
          sub={`${integerFmt.format(totalTransactions)} transactions`}
          percent={Math.min(100, (totalSales / Math.max(totalSales + totalOutstanding, 1)) * 100)}
          color="#f6d37a"
        />
        <KpiRing
          label={t('outstandingBalances')}
          value={formatCompact(totalOutstanding, currency, numberLocale)}
          sub={`${integerFmt.format(outstanding.length)} customer${outstanding.length === 1 ? '' : 's'}`}
          percent={outstandingPct}
          color={overdueCount > 0 ? '#ef4444' : '#fbbf24'}
        />
        <KpiRing
          label={t('refunds')}
          value={formatCompact(totalRefunds, currency, numberLocale)}
          sub={
            totalSales > 0
              ? `${((totalRefunds / totalSales) * 100).toFixed(1)}% of sales`
              : ''
          }
          percent={
            totalSales > 0 ? Math.min((totalRefunds / totalSales) * 100, 100) : 0
          }
          color="#a78bfa"
        />
        <KpiRing
          label="Avg ticket"
          value={formatCompact(avgTicket, currency, numberLocale)}
          sub={`${integerFmt.format(activeCustomers)} customers`}
          percent={Math.min(
            totalSales > 0 ? (avgTicket / (totalSales / Math.max(activeCustomers, 1))) * 100 : 0,
            100,
          )}
          color="#2dd4bf"
        />
      </div>

      <div className="rpt-grid rpt-grid--2">
        <RankedList
          title={t('topCustomers')}
          badge={t('thisWeek')}
          items={topCustomers.slice(0, 8).map((c, i) => ({
            id: c.customerId ?? `top-${i}`,
            name: c.customerName ?? 'Walk-in',
            value: formatCompact(Number(c.total ?? 0), currency, numberLocale),
            sub: `${integerFmt.format(Number(c.count ?? 0))} transactions`,
          }))}
          emptyMessage={t('noCustomerTotals')}
        />

        <BreakdownBars
          title={t('refundsByCustomer')}
          badge={`${refunds.length} ${t('refundsLabel')}`}
          items={refundBreakdownItems}
          emptyMessage={t('noRefunds')}
        />
      </div>

      <div className="rpt-grid rpt-grid--2">
        <RankedList
          title={t('outstandingBalances')}
          badge={`${overdueCount} overdue`}
          items={outstanding
            .slice()
            .sort((a, b) => Number(b.outstandingAmount ?? 0) - Number(a.outstandingAmount ?? 0))
            .slice(0, 8)
            .map((o) => {
              const isOverdue =
                o.creditDueDate && new Date(o.creditDueDate).getTime() < nowTs;
              return {
                id: o.id,
                name: o.customerNameSnapshot ?? 'Unknown',
                value: formatCompact(
                  Number(o.outstandingAmount ?? 0),
                  currency,
                  numberLocale,
                ),
                sub: o.creditDueDate
                  ? `${isOverdue ? 'overdue · ' : 'due '}${new Date(o.creditDueDate).toLocaleDateString()}`
                  : 'no due date',
              };
            })}
          emptyMessage={t('noOutstanding')}
        />

        <div className="rpt-stack">
          <StatusCard
            icon="👥"
            label={t('customerSales')}
            value={integerFmt.format(activeCustomers)}
            sub={`${integerFmt.format(totalTransactions)} ${t('transactions')}`}
            severity="neutral"
          />
          <StatusCard
            icon="⏰"
            label="Overdue credits"
            value={integerFmt.format(overdueCount)}
            sub={overdueCount > 0 ? 'needs follow-up' : 'all on time'}
            severity={overdueCount > 0 ? 'critical' : 'good'}
          />
          <StatusCard
            icon="🧾"
            label="Avg ticket"
            value={formatCompact(avgTicket, currency, numberLocale)}
            sub={`${integerFmt.format(totalTransactions)} ${t('transactions')}`}
            severity="neutral"
          />
        </div>
      </div>

      {/* Drill-down: Full customer sales table + CSV export */}
      <DrillDownDrawer
        title={t('customerSales')}
        badge={`${sales.length} customers`}
      >
        <div className="rpt-drawer__controls">
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? t('exporting') : t('exportCsv')}
          </button>
          {exportMsg && (
            <span className="rpt-table__muted">{exportMsg}</span>
          )}
        </div>
        {sortedSales.length ? (
          <>
            <div className="rpt-table__wrap">
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Customer</th>
                    <th className="rpt-table__num">{t('transactions')}</th>
                    <th className="rpt-table__num">{t('totalSales')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSales
                    .slice((salesPage - 1) * PAGE_SIZE, salesPage * PAGE_SIZE)
                    .map((s, i) => (
                      <tr key={s.customerId ?? `r-${i}`}>
                        <td className="rpt-table__muted">
                          {(salesPage - 1) * PAGE_SIZE + i + 1}
                        </td>
                        <td>{s.customerName ?? 'Walk-in'}</td>
                        <td className="rpt-table__num">
                          {integerFmt.format(Number(s.count ?? 0))}
                        </td>
                        <td className="rpt-table__num">
                          {currencyFmt.format(Number(s.total ?? 0))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <SimplePager
              page={salesPage}
              totalPages={Math.max(1, Math.ceil(sortedSales.length / PAGE_SIZE))}
              onChange={setSalesPage}
            />
          </>
        ) : (
          <p className="rpt-table__empty">{t('noCustomerSales')}</p>
        )}
      </DrillDownDrawer>

      {/* Drill-down: Full outstanding balances table */}
      <DrillDownDrawer
        title={t('outstandingBalances')}
        badge={`${outstanding.length} accounts`}
      >
        {sortedOutstanding.length ? (
          <>
            <div className="rpt-table__wrap">
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Customer</th>
                    <th className="rpt-table__num">Amount</th>
                    <th>{t('dueDateHeader')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOutstanding
                    .slice(
                      (outstandingPage - 1) * PAGE_SIZE,
                      outstandingPage * PAGE_SIZE,
                    )
                    .map((o, i) => {
                      const isOverdue =
                        o.creditDueDate &&
                        new Date(o.creditDueDate).getTime() < nowTs;
                      return (
                        <tr key={o.id}>
                          <td className="rpt-table__muted">
                            {(outstandingPage - 1) * PAGE_SIZE + i + 1}
                          </td>
                          <td>{o.customerNameSnapshot ?? 'Unknown'}</td>
                          <td className="rpt-table__num">
                            {currencyFmt.format(Number(o.outstandingAmount ?? 0))}
                          </td>
                          <td
                            className={
                              isOverdue ? 'rpt-table__qty--critical' : ''
                            }
                          >
                            {o.creditDueDate
                              ? new Date(o.creditDueDate).toLocaleDateString()
                              : '—'}
                            {isOverdue ? ' (overdue)' : ''}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <SimplePager
              page={outstandingPage}
              totalPages={Math.max(
                1,
                Math.ceil(sortedOutstanding.length / PAGE_SIZE),
              )}
              onChange={setOutstandingPage}
            />
          </>
        ) : (
          <p className="rpt-table__empty">{t('noOutstanding')}</p>
        )}
      </DrillDownDrawer>
    </div>
  );
}
