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
import { RankedList } from '../widgets/RankedList';
import { StatusCard } from '../widgets/StatusCard';
import { DrillDownDrawer } from '../widgets/DrillDownDrawer';
import { SimplePager } from '../widgets/SimplePager';
import {
  formatCompact,
  makeCurrencyFormatter,
  makeIntegerFormatter,
} from '../utils/format';
import type { ReportFilters } from '../hooks/useReportFilters';
import { useRegisterPdfSection, type SectionPdfPayload } from '../pdf/pdf-context';

type StaffPerformance = {
  cashierId: string;
  cashierName?: string | null;
  _sum: { total: number | string | null };
  _count: { id: number | string | null };
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
  totalCost: number | null;
  varianceType: 'SHORTAGE' | 'SURPLUS' | null;
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

type Props = { filters: ReportFilters };

export function OperationsSection({ filters }: Props) {
  const t = useTranslations('reports');
  const locale = useLocale();
  const numberLocale = locale === 'sw' ? 'sw-TZ' : 'en-TZ';
  const currency = useCurrency();
  const integerFmt = useMemo(() => makeIntegerFormatter(numberLocale), [numberLocale]);
  const currencyFmt = useMemo(
    () => makeCurrencyFormatter(currency, numberLocale),
    [currency, numberLocale],
  );
  const [variancePage, setVariancePage] = useState(1);
  const PAGE_SIZE = 10;

  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffPerformance[]>([]);
  const [variance, setVariance] = useState<StockCountVariance[]>([]);
  const [topLosses, setTopLosses] = useState<TopLossesReport | null>(null);
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
      apiFetch<StaffPerformance[]>(`/reports/staff?${qs}`, opts).catch(
        () => [] as StaffPerformance[],
      ),
      apiFetch<StockCountVariance[]>(
        `/reports/stock-count-variance?${qs}`,
        opts,
      ).catch(() => [] as StockCountVariance[]),
      apiFetch<TopLossesReport | null>(
        `/reports/losses/top?limit=8&${qs}`,
        opts,
      ).catch(() => null),
    ])
      .then(([st, v, tl]) => {
        if (controller.signal.aborted) return;
        setStaff(st);
        setVariance(v);
        setTopLosses(tl);
      })
      .catch(() => {
        /* aborts */
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setUpdatedAt(Date.now());
        }
      });

    return () => controller.abort();
  }, [filters.branchId, filters.startDate, filters.endDate]);

  const staffTotal = useMemo(
    () => staff.reduce((sum, s) => sum + Number(s._sum?.total ?? 0), 0),
    [staff],
  );
  const staffTxns = useMemo(
    () => staff.reduce((sum, s) => sum + Number(s._count?.id ?? 0), 0),
    [staff],
  );

  const topStaff = useMemo(
    () =>
      [...staff].sort(
        (a, b) => Number(b._sum?.total ?? 0) - Number(a._sum?.total ?? 0),
      )[0] ?? null,
    [staff],
  );

  const shortages = useMemo(
    () => variance.filter((v) => v.varianceType === 'SHORTAGE'),
    [variance],
  );
  const surpluses = useMemo(
    () => variance.filter((v) => v.varianceType === 'SURPLUS'),
    [variance],
  );

  const varianceCost = useMemo(
    () => shortages.reduce((sum, v) => sum + Number(v.totalCost ?? 0), 0),
    [shortages],
  );

  const varianceByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of variance) {
      const day = new Date(v.createdAt).toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + Number(v.totalCost ?? 0));
    }
    return Array.from(map.keys())
      .sort()
      .map((day) => map.get(day) ?? 0);
  }, [variance]);

  const lossTotal = useMemo(
    () => (topLosses?.items ?? []).reduce((sum, i) => sum + Number(i.totalCost ?? 0), 0),
    [topLosses],
  );

  /* ─── PDF payload ─── */
  const pdfPayload = useMemo<SectionPdfPayload | null>(() => {
    if (loading) return null;
    const headline = topStaff
      ? `${topStaff.cashierName ?? 'Staff'} led with ${formatCompact(Number(topStaff._sum?.total ?? 0), currency, numberLocale)} across ${integerFmt.format(Number(topStaff._count?.id ?? 0))} sales.`
      : `${integerFmt.format(staff.length)} staff handled ${integerFmt.format(staffTxns)} transactions.`;
    const subline =
      shortages.length > 0
        ? `${integerFmt.format(shortages.length)} stock ${shortages.length === 1 ? 'shortage' : 'shortages'} totalling ${formatCompact(varianceCost, currency, numberLocale)}.`
        : variance.length > 0
          ? `${integerFmt.format(variance.length)} variance records logged — all balanced.`
          : 'No stock variances recorded.';
    return {
      headline,
      subline,
      kpis: [
        {
          label: 'Staff',
          value: integerFmt.format(staff.length),
          sub: `${integerFmt.format(staffTxns)} transactions`,
        },
        {
          label: 'Total Sales',
          value: formatCompact(staffTotal, currency, numberLocale),
          sub: `${integerFmt.format(staffTxns)} transactions`,
        },
        {
          label: 'Variance',
          value: integerFmt.format(variance.length),
          sub: `${shortages.length} shortages · ${surpluses.length} surpluses`,
        },
        {
          label: 'Losses',
          value: formatCompact(lossTotal, currency, numberLocale),
          sub: `${topLosses?.items?.length ?? 0} items`,
        },
      ],
      tables: [
        {
          title: 'Staff performance',
          headers: ['Staff', 'Transactions', 'Total'],
          rows: [...staff]
            .sort(
              (a, b) => Number(b._sum?.total ?? 0) - Number(a._sum?.total ?? 0),
            )
            .map((s) => [
              s.cashierName ?? 'Staff',
              integerFmt.format(Number(s._count?.id ?? 0)),
              currencyFmt.format(Number(s._sum?.total ?? 0)),
            ]),
          emptyMessage: 'No staff performance data',
        },
        {
          title: 'Top losses',
          headers: ['Item', 'Quantity', 'Events', 'Cost'],
          rows: (topLosses?.items ?? []).map((l) => [
            l.productName ?? l.variantName ?? 'Unknown',
            integerFmt.format(l.quantity),
            integerFmt.format(l.lossCount),
            currencyFmt.format(l.totalCost),
          ]),
          emptyMessage: 'No losses recorded',
        },
        {
          title: 'Stock count variance',
          headers: [
            'Branch',
            'Variant',
            'Expected',
            'Counted',
            'Variance',
            'Cost',
            'Type',
          ],
          rows: [...variance]
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .map((row) => {
              const v = Number(row.variance ?? 0);
              return [
                row.branchName ?? '—',
                row.productName ?? row.variantName ?? '—',
                integerFmt.format(Number(row.expectedQuantity ?? 0)),
                integerFmt.format(Number(row.countedQuantity ?? 0)),
                `${v > 0 ? '+' : ''}${integerFmt.format(v)}`,
                currencyFmt.format(Number(row.totalCost ?? 0)),
                row.varianceType ?? '—',
              ];
            }),
          emptyMessage: 'No variance records',
        },
      ],
    };
  }, [
    loading,
    topStaff,
    staff,
    staffTxns,
    staffTotal,
    shortages.length,
    surpluses.length,
    variance,
    varianceCost,
    lossTotal,
    topLosses,
    currency,
    numberLocale,
    integerFmt,
    currencyFmt,
  ]);
  useRegisterPdfSection('operations', pdfPayload);

  if (loading) {
    return <SectionSkeleton />;
  }

  const narrativeHeadline = (() => {
    if (topStaff) {
      return (
        <>
          <span className="rpt-narrative__accent">
            {topStaff.cashierName ?? 'Staff'}
          </span>{' '}
          led with{' '}
          <span className="rpt-narrative__accent">
            {formatCompact(Number(topStaff._sum?.total ?? 0), currency, numberLocale)}
          </span>{' '}
          across{' '}
          <span className="rpt-narrative__accent">
            {integerFmt.format(Number(topStaff._count?.id ?? 0))}
          </span>{' '}
          sales.
        </>
      );
    }
    return (
      <>
        <span className="rpt-narrative__accent">{integerFmt.format(staff.length)}</span>{' '}
        staff handled{' '}
        <span className="rpt-narrative__accent">{integerFmt.format(staffTxns)}</span>{' '}
        transactions.
      </>
    );
  })();

  const narrativeSubline =
    shortages.length > 0
      ? `${integerFmt.format(shortages.length)} stock ${shortages.length === 1 ? 'shortage' : 'shortages'} totalling ${formatCompact(varianceCost, currency, numberLocale)}.`
      : variance.length > 0
        ? `${integerFmt.format(variance.length)} variance records logged — all balanced.`
        : 'No stock variances recorded.';

  return (
    <div className="rpt-section">
      <div className="rpt-section-header">
        <FreshnessBadge updatedAt={updatedAt} />
      </div>
      <NarrativeCard
        eyebrow={t('sectionOperations')}
        headline={narrativeHeadline}
        subline={narrativeSubline}
        accent={shortages.length > 0 ? 'amber' : 'gold'}
        badge="OPS"
      />

      <div className="rpt-grid rpt-grid--4">
        <KpiRing
          label={t('staffPerformance')}
          value={integerFmt.format(staff.length)}
          sub={`${t('staff')} · ${integerFmt.format(staffTxns)} ${t('transactions')}`}
          percent={
            staff.length > 0
              ? Math.min((staffTxns / Math.max(staff.length * 10, 1)) * 100, 100)
              : 0
          }
          color="#f6d37a"
        />
        <KpiRing
          label={t('totalSales')}
          value={formatCompact(staffTotal, currency, numberLocale)}
          sub={`${integerFmt.format(staffTxns)} ${t('transactions')}`}
          percent={
            staffTotal > 0 && staffTxns > 0
              ? Math.min((staffTotal / (staffTxns * 10000)) * 100, 100)
              : 0
          }
          color="#2dd4bf"
        />
        <KpiRing
          label={t('stockCountVariance')}
          value={integerFmt.format(variance.length)}
          sub={`${shortages.length} shortages · ${surpluses.length} surpluses`}
          percent={
            variance.length > 0
              ? Math.min((shortages.length / variance.length) * 100, 100)
              : 0
          }
          color={shortages.length > 0 ? '#ef4444' : '#34d399'}
        />
        <KpiRing
          label={t('losses')}
          value={formatCompact(lossTotal, currency, numberLocale)}
          sub={`${topLosses?.items?.length ?? 0} items`}
          percent={
            lossTotal > 0 && staffTotal > 0
              ? Math.min((lossTotal / staffTotal) * 100, 100)
              : 0
          }
          color="#ef4444"
        />
      </div>

      <div className="rpt-grid rpt-grid--2">
        <RankedList
          title={t('staffPerformance')}
          badge={`${staff.length} ${t('staff')}`}
          items={[...staff]
            .sort((a, b) => Number(b._sum?.total ?? 0) - Number(a._sum?.total ?? 0))
            .slice(0, 8)
            .map((s) => ({
              id: s.cashierId,
              name: s.cashierName ?? 'Staff',
              value: formatCompact(
                Number(s._sum?.total ?? 0),
                currency,
                numberLocale,
              ),
              sub: `${integerFmt.format(Number(s._count?.id ?? 0))} ${t('transactions')}`,
            }))}
          emptyMessage={t('noStaffPerformance')}
        />

        <TrendCard
          title={t('stockCountVariance')}
          badge={`${variance.length} ${t('records')}`}
          points={varianceByDay.length ? varianceByDay : [0]}
          color={shortages.length > 0 ? '#ef4444' : '#34d399'}
          height={160}
        >
          <div className="rpt-trend__footer">
            <span>{variance.length} records</span>
            <span className="rpt-trend__footer-value">
              {formatCompact(varianceCost, currency, numberLocale)}
            </span>
          </div>
        </TrendCard>
      </div>

      <div className="rpt-grid rpt-grid--2">
        <RankedList
          title="Top losses"
          badge={`${topLosses?.items?.length ?? 0} items`}
          items={(topLosses?.items ?? []).slice(0, 8).map((l) => ({
            id: l.variantId,
            name: l.productName ?? l.variantName ?? 'Unknown',
            value: formatCompact(l.totalCost, currency, numberLocale),
            sub: `${integerFmt.format(l.quantity)} units · ${integerFmt.format(l.lossCount)} events`,
          }))}
          emptyMessage={t('noData')}
        />

        <div className="rpt-stack">
          <StatusCard
            icon="👤"
            label={t('staffPerformance')}
            value={integerFmt.format(staff.length)}
            sub={`${integerFmt.format(staffTxns)} ${t('transactions')}`}
            severity="neutral"
          />
          <StatusCard
            icon="📋"
            label={t('stockCountShortages')}
            value={integerFmt.format(shortages.length)}
            sub={formatCompact(varianceCost, currency, numberLocale)}
            severity={shortages.length > 0 ? 'warning' : 'good'}
          />
          <StatusCard
            icon="💸"
            label={t('losses')}
            value={formatCompact(lossTotal, currency, numberLocale)}
            sub={`${topLosses?.items?.length ?? 0} items`}
            severity={lossTotal > 0 ? 'warning' : 'good'}
          />
        </div>
      </div>

      {/* Drill-down: Stock count variance full table */}
      <DrillDownDrawer
        title={t('stockCountVariance')}
        badge={`${variance.length} ${t('records')}`}
      >
        {variance.length ? (
          <>
            <div className="rpt-table__wrap">
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>{t('branch')}</th>
                    <th>{t('variant')}</th>
                    <th className="rpt-table__num">{t('expectedQty')}</th>
                    <th className="rpt-table__num">{t('countedQty')}</th>
                    <th className="rpt-table__num">{t('variance')}</th>
                    <th className="rpt-table__num">{t('totalCost')}</th>
                    <th>{t('varianceType')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...variance]
                    .sort(
                      (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                    )
                    .slice(
                      (variancePage - 1) * PAGE_SIZE,
                      variancePage * PAGE_SIZE,
                    )
                    .map((row) => {
                      const v = Number(row.variance ?? 0);
                      const cls =
                        v < 0
                          ? 'rpt-table__qty--critical'
                          : v > 0
                            ? 'rpt-table__qty--warning'
                            : '';
                      return (
                        <tr key={row.id}>
                          <td className="rpt-table__muted">
                            {row.branchName ?? '—'}
                          </td>
                          <td>
                            {row.productName ?? row.variantName ?? '—'}
                          </td>
                          <td className="rpt-table__num">
                            {integerFmt.format(Number(row.expectedQuantity ?? 0))}
                          </td>
                          <td className="rpt-table__num">
                            {integerFmt.format(Number(row.countedQuantity ?? 0))}
                          </td>
                          <td className={`rpt-table__num ${cls}`}>
                            {v > 0 ? '+' : ''}
                            {integerFmt.format(v)}
                          </td>
                          <td className="rpt-table__num">
                            {currencyFmt.format(Number(row.totalCost ?? 0))}
                          </td>
                          <td>
                            {row.varianceType ? (
                              <span
                                className={`rpt-table__chip rpt-table__chip--${
                                  row.varianceType === 'SHORTAGE'
                                    ? 'shortage'
                                    : 'surplus'
                                }`}
                              >
                                {row.varianceType}
                              </span>
                            ) : (
                              <span className="rpt-table__muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <SimplePager
              page={variancePage}
              totalPages={Math.max(1, Math.ceil(variance.length / PAGE_SIZE))}
              onChange={setVariancePage}
            />
          </>
        ) : (
          <p className="rpt-table__empty">{t('noStockCountVariance')}</p>
        )}
      </DrillDownDrawer>
    </div>
  );
}
