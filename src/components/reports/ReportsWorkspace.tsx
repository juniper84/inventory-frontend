'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import { PageSkeleton } from '@/components/PageSkeleton';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { Banner } from '@/components/notifications/Banner';
import { notify } from '@/components/notifications/NotificationProvider';
import { OverviewSection } from './sections/OverviewSection';
import { SalesProfitSection } from './sections/SalesProfitSection';
import { CustomersSection } from './sections/CustomersSection';
import { InventorySection } from './sections/InventorySection';
import { OperationsSection } from './sections/OperationsSection';
import { SectionErrorBoundary } from './widgets/SectionErrorBoundary';
import { SectionTabs } from './widgets/SectionTabs';
import { MetricStrip, type MetricCell } from './widgets/MetricStrip';
import { FilterBar, buildDatePresets, detectActivePreset } from './widgets/FilterBar';
import { PageHero } from './widgets/PageHero';
import { PdfRegistryProvider } from './pdf/pdf-context';
import { ExportPdfButton } from './pdf/ExportPdfButton';
import type { ReportPdfMeta } from './pdf/ReportPdfDocument';
import { getStoredUser } from '@/lib/auth';
import { getPermissionSet } from '@/lib/permissions';
import { REPORT_SECTIONS, type ReportSection } from '@/components/reports/sections';
import {
  getBranchModeForPathname,
  resolveBranchIdForMode,
} from '@/lib/branch-policy';
import { useCurrency } from '@/lib/business-context';
import { ZERO_DECIMAL_CURRENCIES } from '@/lib/currencies';

type Branch = { id: string; name: string };

type VatSummary = {
  totalVat: number;
  byRate: { vatRate: number; vatAmount: number }[];
  byDay: { date: string; vatAmount: number }[];
};

type PnlReport = {
  totals: {
    revenue: number;
    cost: number;
    expenses: number;
    netProfit: number;
  };
};

const DEFAULT_FILTERS = {
  branchId: '',
  startDate: '',
  endDate: '',
};

export function ReportsWorkspace({ section }: { section: ReportSection }) {
  const t = useTranslations('reports');
  const locale = useLocale();
  const noAccess = useTranslations('noAccess');
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const permissions = getPermissionSet();
  const canReadReports = permissions.has('reports.read');
  const currency = useCurrency();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [vatSummary, setVatSummary] = useState<VatSummary | null>(null);
  const [pnl, setPnl] = useState<PnlReport | null>(null);
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
  const [hasInitialized, setHasInitialized] = useState(false);
  const loadControllerRef = useRef<AbortController | null>(null);

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

  const vatTotal = vatSummary?.totalVat ?? 0;

  const currencyFormatter = useMemo(() => {
    const resolved = currency || 'TZS';
    const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(resolved) ? 0 : 2;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: resolved,
      currencyDisplay: 'code',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }, [locale, currency]);

  const formatKpi = (value: number): string => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) {
      return (value / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 }) + 'M';
    }
    if (abs >= 100_000) {
      return (value / 1000).toLocaleString(locale, { maximumFractionDigits: 1 }) + 'K';
    }
    return currencyFormatter.format(value);
  };

  const load = useCallback(async (mode: 'full' | 'refresh' = 'full') => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
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
    const effectiveBranchId =
      filters.branchId === 'ALL'
        ? ''
        : resolveBranchIdForMode({
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
    try {
      const [branchData, vatSummaryData, pnlData] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
          token,
          signal: controller.signal,
        }),
        apiFetch<VatSummary>(`/reports/vat-summary?${params.toString()}`, {
          token,
          signal: controller.signal,
        }),
        apiFetch<PnlReport>(`/reports/pnl?${params.toString()}`, {
          token,
          signal: controller.signal,
        }),
      ]);
      setBranches(normalizePaginated(branchData).items);
      setVatSummary(vatSummaryData);
      setPnl(pnlData);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      notify.error(getApiErrorMessage(err, t('loadFailed')));
    } finally {
      if (loadControllerRef.current === controller) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [
    branchMode,
    activeBranch?.id,
    filters.branchId,
    filters.endDate,
    filters.startDate,
    t,
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


  const isOverview = section === 'overview';
  const isSalesProfit = section === 'sales-profit';
  const isCustomers = section === 'customers';
  const isInventory = section === 'inventory';
  const isOperations = section === 'operations';

  const datePresets = useMemo(() => buildDatePresets(), []);

  if (!canReadReports) {
    return (
      <section className="space-y-4">
        <Banner
          severity="warning"
          title={noAccess('subtitle')}
          message={noAccess('requiredPermission', { permission: 'reports.read' })}
        />
      </section>
    );
  }


  if (isLoading) {
    return <PageSkeleton />;
  }

  const activePresetId = detectActivePreset(
    filters.startDate ?? '',
    filters.endDate ?? '',
    datePresets,
  );

  const netProfitValue = pnl?.totals.netProfit ?? 0;
  const netProfitAccent: MetricCell['accent'] =
    netProfitValue < 0 ? 'red' : netProfitValue > 0 ? 'green' : 'amber';

  const metrics: MetricCell[] = [
    {
      label: t('revenue'),
      value: pnl ? formatKpi(pnl.totals.revenue) : '—',
      accent: 'gold',
    },
    {
      label: t('cost'),
      value: pnl ? formatKpi(pnl.totals.cost) : '—',
      accent: 'teal',
    },
    {
      label: t('expenses'),
      value: pnl ? formatKpi(pnl.totals.expenses) : '—',
      accent: 'purple',
    },
    {
      label: t('netProfit'),
      value: pnl ? formatKpi(pnl.totals.netProfit) : '—',
      accent: netProfitAccent,
      sub: netProfitValue >= 0 ? 'profit' : 'loss',
    },
    {
      label: t('vat'),
      value: formatKpi(vatTotal),
      accent: 'amber',
    },
  ];

  const buildPdfMeta = (): ReportPdfMeta => {
    const branchLabel =
      !filters.branchId || filters.branchId === 'ALL'
        ? t('allBranches')
        : branches.find((b) => b.id === filters.branchId)?.name ??
          activeBranch?.name ??
          filters.branchId;
    const user = getStoredUser();
    return {
      businessName: user?.name ?? t('title'),
      sectionLabel: sectionLabels[section],
      branchLabel,
      startDate: filters.startDate ?? '',
      endDate: filters.endDate ?? '',
      generatedAt: new Date().toLocaleString(locale),
      currency,
      workspaceKpis: metrics.map((m) => ({
        label: m.label,
        value: m.value,
        sub: m.sub,
      })),
    };
  };

  return (
    <PdfRegistryProvider>
    <section className="nvi-page rpt-shell">
      <PageHero
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="rpt-hero-badge rpt-hero-badge--live">
              <span className="rpt-hero-badge-dot" /> {t('statusLive')}
            </span>
            <span className="rpt-hero-badge">{t('statusMultiBranch')}</span>
            <span className="rpt-hero-badge">{currency}</span>
          </>
        }
        actions={
          <ExportPdfButton
            buildMeta={buildPdfMeta}
            sectionOrder={[{ id: section, label: sectionLabels[section] }]}
            filename={`nvi-report-${section}-${new Date().toISOString().slice(0, 10)}`}
          />
        }
      />

      <SectionTabs
        tabs={sectionTabs.map((tab) => ({ id: tab.id, label: tab.label, href: tab.href }))}
        activeId={section}
        onSelect={(tab) => router.push(tab.href)}
      />

      <FilterBar
        branchId={filters.branchId ?? ''}
        startDate={filters.startDate ?? ''}
        endDate={filters.endDate ?? ''}
        branches={branches}
        onBranchChange={(value) => updateFilters({ branchId: value })}
        onStartChange={(value) => updateFilters({ startDate: value })}
        onEndChange={(value) => updateFilters({ endDate: value })}
        onPresetSelect={(preset) => {
          const { startDate, endDate } = preset.apply();
          updateFilters({ startDate, endDate });
        }}
        onRefresh={() => void load('refresh')}
        isRefreshing={isRefreshing}
        presets={datePresets}
        activePresetId={activePresetId}
        labels={{
          allBranches: t('allBranches'),
          fromDate: t('fromDate'),
          toDate: t('toDate'),
          refresh: t('refreshReports'),
          refreshing: t('refreshing'),
        }}
      />

      <MetricStrip metrics={metrics} />

      {isOverview ? (
        <SectionErrorBoundary sectionName="overview">
          <OverviewSection
            filters={{
              branchId:
                filters.branchId === 'ALL' ? '' : filters.branchId ?? '',
              startDate: filters.startDate ?? '',
              endDate: filters.endDate ?? '',
            }}
          />
        </SectionErrorBoundary>
      ) : null}

      {isSalesProfit ? (
        <SectionErrorBoundary sectionName="sales-profit">
          <SalesProfitSection
            filters={{
              branchId:
                filters.branchId === 'ALL' ? '' : filters.branchId ?? '',
              startDate: filters.startDate ?? '',
              endDate: filters.endDate ?? '',
            }}
          />
        </SectionErrorBoundary>
      ) : null}

      {isCustomers ? (
        <SectionErrorBoundary sectionName="customers">
          <CustomersSection
            filters={{
              branchId:
                filters.branchId === 'ALL' ? '' : filters.branchId ?? '',
              startDate: filters.startDate ?? '',
              endDate: filters.endDate ?? '',
            }}
          />
        </SectionErrorBoundary>
      ) : null}

      {isInventory ? (
        <SectionErrorBoundary sectionName="inventory">
          <InventorySection
            filters={{
              branchId:
                filters.branchId === 'ALL' ? '' : filters.branchId ?? '',
              startDate: filters.startDate ?? '',
              endDate: filters.endDate ?? '',
            }}
          />
        </SectionErrorBoundary>
      ) : null}

      {isOperations ? (
        <SectionErrorBoundary sectionName="operations">
          <OperationsSection
            filters={{
              branchId:
                filters.branchId === 'ALL' ? '' : filters.branchId ?? '',
              startDate: filters.startDate ?? '',
              endDate: filters.endDate ?? '',
            }}
          />
        </SectionErrorBoundary>
      ) : null}
    </section>
    </PdfRegistryProvider>
  );
}
