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
import { DrillDownDrawer } from '../widgets/DrillDownDrawer';
import { SimplePager } from '../widgets/SimplePager';
import {
  formatCompact,
  makeCurrencyFormatter,
  makeIntegerFormatter,
} from '../utils/format';
import type { ReportFilters } from '../hooks/useReportFilters';
import { useRegisterPdfSection, type SectionPdfPayload } from '../pdf/pdf-context';

type StockSnapshot = {
  id: string;
  quantity: number | string;
  variantId: string;
  branchId: string;
  variantName?: string | null;
  productName?: string | null;
  branchName?: string | null;
};

type LowStock = {
  id: string;
  quantity: number | string;
  variant?: {
    id: string;
    name: string;
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
    product?: { name?: string | null } | null;
  };
  branch?: { name: string };
};

type StockValue = { stockValue: number; trackedVariants: number };

type Props = { filters: ReportFilters };

export function InventorySection({ filters }: Props) {
  const t = useTranslations('reports');
  const locale = useLocale();
  const numberLocale = locale === 'sw' ? 'sw-TZ' : 'en-TZ';
  const currency = useCurrency();
  const integerFmt = useMemo(() => makeIntegerFormatter(numberLocale), [numberLocale]);

  const [threshold, setThreshold] = useState(5);
  const [thresholdDraft, setThresholdDraft] = useState('5');
  const [expiryDays, setExpiryDays] = useState(30);
  const [expiryDaysDraft, setExpiryDaysDraft] = useState('30');
  const [lowStockPage, setLowStockPage] = useState(1);
  const [expiryPage, setExpiryPage] = useState(1);
  const PAGE_SIZE = 10;

  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<StockSnapshot[]>([]);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [expiry, setExpiry] = useState<ExpiringBatch[]>([]);
  const [stockValue, setStockValue] = useState<StockValue | null>(null);
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
    const branchOnly = params.toString();

    const fullParams = new URLSearchParams(params);
    if (filters.startDate) fullParams.set('startDate', filters.startDate);
    if (filters.endDate) fullParams.set('endDate', filters.endDate);

    const opts = { token, signal: controller.signal };

    Promise.all([
      apiFetch<StockSnapshot[]>(`/reports/stock?${fullParams.toString()}`, opts).catch(
        () => [] as StockSnapshot[],
      ),
      apiFetch<LowStock[]>(
        `/reports/low-stock?threshold=${threshold}${branchOnly ? `&${branchOnly}` : ''}`,
        opts,
      ).catch(() => [] as LowStock[]),
      apiFetch<ExpiringBatch[]>(
        `/reports/expiry?days=${expiryDays}${branchOnly ? `&${branchOnly}` : ''}`,
        opts,
      ).catch(() => [] as ExpiringBatch[]),
      apiFetch<StockValue | null>(
        `/reports/stock-value${branchOnly ? `?${branchOnly}` : ''}`,
        opts,
      ).catch(() => null),
    ])
      .then(([s, ls, ex, sv]) => {
        if (controller.signal.aborted) return;
        setStock(s);
        setLowStock(ls);
        setExpiry(ex);
        setStockValue(sv);
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
  }, [filters.branchId, filters.startDate, filters.endDate, threshold, expiryDays]);

  const totalUnits = useMemo(
    () => stock.reduce((sum, s) => sum + Number(s.quantity ?? 0), 0),
    [stock],
  );

  const stockByBranch = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stock) {
      const name = s.branchName ?? 'Unknown';
      map.set(name, (map.get(name) ?? 0) + Number(s.quantity ?? 0));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [stock]);

  const criticalLow = useMemo(
    () => lowStock.filter((i) => Number(i.quantity ?? 0) <= 2),
    [lowStock],
  );

  const expiryByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expiry) {
      const day = new Date(e.expiryDate).toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return Array.from(map.keys())
      .sort()
      .map((day) => map.get(day) ?? 0);
  }, [expiry]);

  const stockHealthPct = useMemo(() => {
    if (!stockValue || stockValue.trackedVariants === 0) return 100;
    const healthy = stockValue.trackedVariants - lowStock.length;
    return Math.max(0, (healthy / stockValue.trackedVariants) * 100);
  }, [stockValue, lowStock]);

  const expiringSoon = useMemo(() => {
    const cutoff = nowTs + 7 * 86400000;
    return expiry.filter((e) => new Date(e.expiryDate).getTime() <= cutoff).length;
  }, [expiry, nowTs]);

  /* ─── PDF payload ─── */
  const pdfPayload = useMemo<SectionPdfPayload | null>(() => {
    if (loading) return null;
    const valStr = formatCompact(stockValue?.stockValue ?? 0, currency, numberLocale);
    const headline =
      criticalLow.length > 0
        ? `${integerFmt.format(criticalLow.length)} critical low-stock items need restocking — ${valStr} on hand across ${integerFmt.format(stockValue?.trackedVariants ?? 0)} SKUs.`
        : lowStock.length > 0
          ? `${valStr} inventory across ${integerFmt.format(stockValue?.trackedVariants ?? 0)} SKUs — ${integerFmt.format(lowStock.length)} running low.`
          : `${valStr} inventory across ${integerFmt.format(stockValue?.trackedVariants ?? 0)} SKUs — stock levels healthy.`;
    const subline =
      expiringSoon > 0
        ? `${integerFmt.format(expiringSoon)} batches expiring within 7 days.`
        : expiry.length > 0
          ? `${integerFmt.format(expiry.length)} batches in ${expiryDays}-day expiry window.`
          : 'No expiring batches flagged.';
    return {
      headline,
      subline,
      kpis: [
        {
          label: 'Inventory value',
          value: valStr,
          sub: `${integerFmt.format(stockValue?.trackedVariants ?? 0)} SKUs`,
        },
        {
          label: 'Stock on hand',
          value: integerFmt.format(totalUnits),
          sub: `${stockByBranch.length} branches`,
        },
        {
          label: 'Low stock',
          value: integerFmt.format(lowStock.length),
          sub: `${criticalLow.length} critical`,
        },
        {
          label: 'Expiring',
          value: integerFmt.format(expiry.length),
          sub: `${expiringSoon} within 7d`,
        },
      ],
      breakdowns: [
        {
          title: 'Stock by branch',
          rows: stockByBranch.map(([name, qty]) => ({
            label: name,
            value: `${integerFmt.format(qty)} units`,
          })),
          emptyMessage: 'No stock data',
        },
      ],
      tables: [
        {
          title: `Low stock (threshold ${threshold})`,
          headers: ['Variant', 'Branch', 'Quantity'],
          rows: [...lowStock]
            .sort((a, b) => Number(a.quantity ?? 0) - Number(b.quantity ?? 0))
            .map((row) => [
              row.variant?.product?.name ?? row.variant?.name ?? '—',
              row.branch?.name ?? '—',
              integerFmt.format(Number(row.quantity ?? 0)),
            ]),
          emptyMessage: 'No low stock items',
        },
        {
          title: `Expiring batches (next ${expiryDays} days)`,
          headers: ['Variant', 'Branch', 'Expires', 'Days left'],
          rows: [...expiry]
            .sort(
              (a, b) =>
                new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
            )
            .map((row) => {
              const daysLeft = Math.floor(
                (new Date(row.expiryDate).getTime() - nowTs) / 86400000,
              );
              return [
                row.variant?.product?.name ?? row.variant?.name ?? '—',
                row.branch?.name ?? '—',
                new Date(row.expiryDate).toLocaleDateString(),
                String(daysLeft),
              ];
            }),
          emptyMessage: 'No expiring batches',
        },
      ],
    };
  }, [
    loading,
    stockValue,
    criticalLow.length,
    lowStock,
    expiry,
    expiringSoon,
    expiryDays,
    totalUnits,
    stockByBranch,
    threshold,
    nowTs,
    currency,
    numberLocale,
    integerFmt,
  ]);
  useRegisterPdfSection('inventory', pdfPayload);

  if (loading) {
    return <SectionSkeleton />;
  }

  const valueStr = formatCompact(stockValue?.stockValue ?? 0, currency, numberLocale);
  const narrativeHeadline = (() => {
    if (criticalLow.length > 0) {
      return (
        <>
          <span className="rpt-narrative__accent rpt-narrative__accent--red">
            {integerFmt.format(criticalLow.length)} critical
          </span>{' '}
          low-stock items need restocking —{' '}
          <span className="rpt-narrative__accent">{valueStr}</span> on hand across{' '}
          <span className="rpt-narrative__accent">
            {integerFmt.format(stockValue?.trackedVariants ?? 0)}
          </span>{' '}
          SKUs.
        </>
      );
    }
    if (lowStock.length > 0) {
      return (
        <>
          <span className="rpt-narrative__accent">{valueStr}</span> inventory across{' '}
          <span className="rpt-narrative__accent">
            {integerFmt.format(stockValue?.trackedVariants ?? 0)}
          </span>{' '}
          SKUs —{' '}
          <span className="rpt-narrative__accent">
            {integerFmt.format(lowStock.length)}
          </span>{' '}
          running low.
        </>
      );
    }
    return (
      <>
        <span className="rpt-narrative__accent">{valueStr}</span> inventory across{' '}
        <span className="rpt-narrative__accent">
          {integerFmt.format(stockValue?.trackedVariants ?? 0)}
        </span>{' '}
        SKUs — stock levels healthy.
      </>
    );
  })();

  const narrativeSubline =
    expiringSoon > 0
      ? `${integerFmt.format(expiringSoon)} batches expiring within 7 days.`
      : expiry.length > 0
        ? `${integerFmt.format(expiry.length)} batches in 30-day expiry window.`
        : 'No expiring batches flagged.';

  return (
    <div className="rpt-section">
      <div className="rpt-section-header">
        <FreshnessBadge updatedAt={updatedAt} />
      </div>
      <NarrativeCard
        eyebrow={t('sectionInventory')}
        headline={narrativeHeadline}
        subline={narrativeSubline}
        accent={criticalLow.length > 0 ? 'red' : lowStock.length > 0 ? 'amber' : 'teal'}
        badge="STOCK"
      />

      <div className="rpt-grid rpt-grid--4">
        <KpiRing
          label={t('inventoryValuation')}
          value={valueStr}
          sub={`${integerFmt.format(stockValue?.trackedVariants ?? 0)} SKUs`}
          percent={stockHealthPct}
          color="#f6d37a"
        />
        <KpiRing
          label={t('stockOnHand')}
          value={integerFmt.format(totalUnits)}
          sub={`${t('units')} · ${stockByBranch.length} ${t('branch')}`}
          percent={Math.min((totalUnits / Math.max(totalUnits, 1)) * 100, 100)}
          color="#2dd4bf"
        />
        <KpiRing
          label={t('lowStock')}
          value={integerFmt.format(lowStock.length)}
          sub={`${criticalLow.length} critical`}
          percent={
            stockValue && stockValue.trackedVariants > 0
              ? Math.min((lowStock.length / stockValue.trackedVariants) * 100, 100)
              : 0
          }
          color={criticalLow.length > 0 ? '#ef4444' : '#fbbf24'}
        />
        <KpiRing
          label={t('expiry')}
          value={integerFmt.format(expiry.length)}
          sub={`${expiringSoon} within 7d`}
          percent={
            expiry.length > 0 ? Math.min((expiringSoon / expiry.length) * 100, 100) : 0
          }
          color={expiringSoon > 0 ? '#ef4444' : '#a78bfa'}
        />
      </div>

      <div className="rpt-grid rpt-grid--2">
        <BreakdownBars
          title={t('stockOnHand')}
          badge={`${stockByBranch.length} ${t('branch')}`}
          items={stockByBranch.map(([name, qty]) => ({
            label: name,
            value: qty,
            display: `${integerFmt.format(qty)} ${t('units')}`,
            color: '#2dd4bf',
          }))}
          emptyMessage={t('noStock')}
        />

        <TrendCard
          title={t('expiry')}
          badge={`${expiry.length} batches`}
          points={expiryByDay.length ? expiryByDay : [0]}
          color="#a78bfa"
          height={160}
        >
          <div className="rpt-trend__footer">
            <span>next 30 days</span>
            <span className="rpt-trend__footer-value">
              {integerFmt.format(expiry.length)} batches
            </span>
          </div>
        </TrendCard>
      </div>

      <div className="rpt-grid rpt-grid--2">
        <RankedList
          title={t('lowStock')}
          badge={`threshold ${t('threshold')}`}
          items={lowStock
            .slice()
            .sort((a, b) => Number(a.quantity ?? 0) - Number(b.quantity ?? 0))
            .slice(0, 8)
            .map((ls) => ({
              id: ls.id,
              name: ls.variant?.product?.name ?? ls.variant?.name ?? 'Unknown',
              value: `${integerFmt.format(Number(ls.quantity ?? 0))} ${t('units')}`,
              sub: ls.branch?.name ?? '',
            }))}
          emptyMessage={t('noLowStock')}
        />

        <div className="rpt-stack">
          <StatusCard
            icon="📦"
            label={t('inventoryValuationLabel')}
            value={valueStr}
            sub={`${integerFmt.format(stockValue?.trackedVariants ?? 0)} SKUs`}
            severity="neutral"
          />
          <StatusCard
            icon="⚠️"
            label={t('lowStock')}
            value={integerFmt.format(lowStock.length)}
            sub={`${criticalLow.length} critical`}
            severity={
              criticalLow.length > 0 ? 'critical' : lowStock.length > 0 ? 'warning' : 'good'
            }
          />
          <StatusCard
            icon="⏳"
            label={t('expiry')}
            value={integerFmt.format(expiringSoon)}
            sub="within 7 days"
            severity={expiringSoon > 0 ? 'warning' : 'good'}
          />
        </div>
      </div>

      {/* Drill-down: Low stock full list with threshold */}
      <DrillDownDrawer
        title={t('lowStock')}
        badge={`${lowStock.length} items · threshold ${threshold}`}
      >
        <div className="rpt-drawer__controls">
          <div className="rpt-drawer__control">
            <label htmlFor="low-stock-threshold">{t('threshold')}</label>
            <input
              id="low-stock-threshold"
              type="number"
              min={0}
              value={thresholdDraft}
              onChange={(e) => setThresholdDraft(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                const n = Number(thresholdDraft);
                if (Number.isFinite(n) && n >= 0) {
                  setThreshold(n);
                  setLowStockPage(1);
                }
              }}
            >
              Apply
            </button>
          </div>
        </div>
        {lowStock.length ? (
          <>
            <div className="rpt-table__wrap">
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>{t('variant')}</th>
                    <th>{t('branch')}</th>
                    <th className="rpt-table__num">{t('countedQty')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...lowStock]
                    .sort((a, b) => Number(a.quantity ?? 0) - Number(b.quantity ?? 0))
                    .slice(
                      (lowStockPage - 1) * PAGE_SIZE,
                      lowStockPage * PAGE_SIZE,
                    )
                    .map((row) => {
                      const qty = Number(row.quantity ?? 0);
                      const cls =
                        qty <= 1
                          ? 'rpt-table__qty--critical'
                          : qty <= 3
                            ? 'rpt-table__qty--warning'
                            : '';
                      return (
                        <tr key={row.id}>
                          <td>
                            {row.variant?.product?.name ?? row.variant?.name ?? '—'}
                          </td>
                          <td className="rpt-table__muted">
                            {row.branch?.name ?? '—'}
                          </td>
                          <td className={`rpt-table__num ${cls}`}>
                            {integerFmt.format(qty)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <SimplePager
              page={lowStockPage}
              totalPages={Math.max(1, Math.ceil(lowStock.length / PAGE_SIZE))}
              onChange={setLowStockPage}
            />
          </>
        ) : (
          <p className="rpt-table__empty">{t('noLowStock')}</p>
        )}
      </DrillDownDrawer>

      {/* Drill-down: Expiry full list with days control */}
      <DrillDownDrawer
        title={t('expiry')}
        badge={`${expiry.length} batches · next ${expiryDays} ${t('days')}`}
      >
        <div className="rpt-drawer__controls">
          <div className="rpt-drawer__control">
            <label htmlFor="expiry-days">{t('days')}</label>
            <input
              id="expiry-days"
              type="number"
              min={1}
              value={expiryDaysDraft}
              onChange={(e) => setExpiryDaysDraft(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                const n = Number(expiryDaysDraft);
                if (Number.isFinite(n) && n >= 1) {
                  setExpiryDays(n);
                  setExpiryPage(1);
                }
              }}
            >
              Apply
            </button>
          </div>
        </div>
        {expiry.length ? (
          <>
            <div className="rpt-table__wrap">
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>{t('variant')}</th>
                    <th>{t('branch')}</th>
                    <th>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {[...expiry]
                    .sort(
                      (a, b) =>
                        new Date(a.expiryDate).getTime() -
                        new Date(b.expiryDate).getTime(),
                    )
                    .slice(
                      (expiryPage - 1) * PAGE_SIZE,
                      expiryPage * PAGE_SIZE,
                    )
                    .map((row) => {
                      const daysLeft = Math.floor(
                        (new Date(row.expiryDate).getTime() - nowTs) / 86400000,
                      );
                      const cls =
                        daysLeft <= 3
                          ? 'rpt-table__qty--critical'
                          : daysLeft <= 7
                            ? 'rpt-table__qty--warning'
                            : '';
                      return (
                        <tr key={row.id}>
                          <td>
                            {row.variant?.product?.name ?? row.variant?.name ?? '—'}
                          </td>
                          <td className="rpt-table__muted">
                            {row.branch?.name ?? '—'}
                          </td>
                          <td className={cls}>
                            {new Date(row.expiryDate).toLocaleDateString()}{' '}
                            <span className="rpt-table__muted">
                              ({daysLeft}d)
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <SimplePager
              page={expiryPage}
              totalPages={Math.max(1, Math.ceil(expiry.length / PAGE_SIZE))}
              onChange={setExpiryPage}
            />
          </>
        ) : (
          <p className="rpt-table__empty">{t('noExpiry')}</p>
        )}
      </DrillDownDrawer>
    </div>
  );
}
