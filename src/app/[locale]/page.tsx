'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import { getPendingCount } from '@/lib/offline-store';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { TypeaheadInput } from '@/components/TypeaheadInput';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { formatVariantLabel } from '@/lib/display';

type Branch = { id: string; name: string };
type Sale = { total: number | string };
type PnlTotals = {
  revenue: number;
  cost: number;
  grossProfit: number;
  losses: number;
  expenses: number;
  transferFees: number;
  netProfit: number;
};
type PnlReport = { totals: PnlTotals };
type LowStock = { id: string; branch?: { id: string; name: string } | null };
type Approval = { id: string; actionType: string; status: string; createdAt: string };
type AuditLog = {
  id: string;
  action: string;
  outcome: string;
  resourceType?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};
type ExportJob = { id: string };
type Shift = { id: string; status: string };
type NotificationPreview = {
  id: string;
  title: string;
  message: string;
  status?: string | null;
  createdAt: string;
};
type SearchResults = {
  products: {
    id: string;
    name: string;
    variants: { id: string; name: string; sku?: string | null }[];
  }[];
  variants: { id: string; name: string; sku?: string | null; product?: { name?: string | null } }[];
  receipts: { id: string; receiptNumber: string }[];
  customers: { id: string; name: string }[];
  transfers: {
    id: string;
    sourceBranch?: { name?: string | null } | null;
    destinationBranch?: { name?: string | null } | null;
  }[];
};
type ReminderItem = {
  id: string;
  scheduledAt: string;
  note?: { id: string; title: string } | null;
  branch?: { id: string; name: string } | null;
};
type ReminderOverview = {
  upcoming: { count: number; items: ReminderItem[] };
  overdue: { count: number; items: ReminderItem[] };
};
type PendingTransfer = {
  id: string;
  status: string;
  createdAt: string;
  sourceBranch?: { id: string; name: string } | null;
  destinationBranch?: { id: string; name: string } | null;
  _count?: { items: number };
};
type OfflineRisk = {
  offlineEnabled: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  staleThresholdHours: number;
  devices: { active: number; stale: number; expired: number };
  actions: { pending: number; failed: number; conflicts: number };
};
type TopLosses = {
  days: number;
  items: {
    variantId: string;
    variantName: string | null;
    productName: string | null;
    sku: string | null;
    lossCount: number;
    totalCost: number;
    quantity: number;
  }[];
};

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const activeBranch = useActiveBranch();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [pnl, setPnl] = useState<PnlReport | null>(null);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [openShifts, setOpenShifts] = useState<Shift[]>([]);
  const [pendingSync, setPendingSync] = useState(0);
  const [failedSyncs, setFailedSyncs] = useState(0);
  const [exportBacklog, setExportBacklog] = useState(0);
  const [alertsCount, setAlertsCount] = useState(0);
  const [reminderOverview, setReminderOverview] =
    useState<ReminderOverview | null>(null);
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);
  const [pendingTransfersTotal, setPendingTransfersTotal] = useState(0);
  const [offlineRisk, setOfflineRisk] = useState<OfflineRisk | null>(null);
  const [topLosses, setTopLosses] = useState<TopLosses | null>(null);
  const [notificationPreview, setNotificationPreview] = useState<
    NotificationPreview[]
  >([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<
    { id: string; label: string }[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useToastState();

  const salesTotal = sales.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
  const openShiftCount = openShifts.length;
  const cashDrawerStatus =
    openShiftCount > 0 ? t('cashDrawerOpen') : t('cashDrawerClosed');
  const marginPct = useMemo(() => {
    if (!pnl || pnl.totals.revenue === 0) {
      return 0;
    }
    return Math.round((pnl.totals.grossProfit / pnl.totals.revenue) * 100);
  }, [pnl]);
  const expensesTotal = pnl?.totals.expenses ?? null;
  const transferFeesTotal = pnl?.totals.transferFees ?? null;
  const branchPulse = useMemo(() => {
    const counts = new Map<string, number>();
    lowStock.forEach((item) => {
      if (item.branch?.id) {
        counts.set(item.branch.id, (counts.get(item.branch.id) ?? 0) + 1);
      }
    });
    return branches.slice(0, 3).map((branch) => ({
      branch,
      lowStockCount: counts.get(branch.id) ?? 0,
    }));
  }, [branches, lowStock]);
  const atRiskBranches = branchPulse.filter((row) => row.lowStockCount > 0);
  const highRiskLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const risk = typeof log.metadata?.risk === 'string' ? log.metadata.risk : '';
      const action = log.action ?? '';
      return (
        risk.toUpperCase() === 'HIGH' ||
        action.includes('DELETE') ||
        action.includes('VOID') ||
        action.includes('REFUND') ||
        action.includes('ADJUST')
      );
    });
  }, [auditLogs]);
  const attentionItems = useMemo(() => {
    const items: { label: string; tone?: 'alert' | 'warn' | 'info' }[] = [];
    if (lowStock.length > 0) {
      items.push({
        label: t('attentionLowStock', { count: lowStock.length }),
        tone: 'alert',
      });
    }
    if (approvals.length > 0) {
      items.push({
        label: t('attentionApprovals', { count: approvals.length }),
        tone: 'warn',
      });
    }
    if (pendingSync > 0) {
      items.push({
        label: t('attentionPendingSync', { count: pendingSync }),
        tone: 'info',
      });
    }
    if (exportBacklog > 0) {
      items.push({
        label: t('attentionExports', { count: exportBacklog }),
        tone: 'warn',
      });
    }
    if (alertsCount > 0) {
      items.push({
        label: t('attentionAlerts', { count: alertsCount }),
        tone: 'alert',
      });
    }
    return items.slice(0, 4);
  }, [alertsCount, approvals.length, exportBacklog, lowStock.length, pendingSync, t]);
  const upcomingReminders = reminderOverview?.upcoming.items ?? [];
  const overdueReminders = reminderOverview?.overdue.items ?? [];
  const reminderUpcomingCount = reminderOverview?.upcoming.count ?? 0;
  const reminderOverdueCount = reminderOverview?.overdue.count ?? 0;
  const riskLevel = offlineRisk?.riskLevel ?? 'LOW';
  const riskLabel =
    riskLevel === 'HIGH'
      ? t('riskHigh')
      : riskLevel === 'MEDIUM'
      ? t('riskMedium')
      : t('riskLow');
  const riskTone =
    riskLevel === 'HIGH'
      ? 'text-rose-300'
      : riskLevel === 'MEDIUM'
      ? 'text-amber-300'
      : 'text-emerald-200';

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
    const today = new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams();
    params.set('startDate', today);
    params.set('endDate', today);
    if (activeBranch?.id) {
      params.set('branchId', activeBranch.id);
    }
    try {
      const auditOriginHeaders = { 'x-audit-origin': 'dashboard' };
      const [branchData, salesData, pnlData, lowStockData] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=5', { token }),
        apiFetch<Sale[]>(`/reports/sales?${params.toString()}`, {
          token,
          headers: auditOriginHeaders,
        }),
        apiFetch<PnlReport>(`/reports/pnl?${params.toString()}`, {
          token,
          headers: auditOriginHeaders,
        }),
        apiFetch<LowStock[]>('/reports/low-stock?threshold=5', {
          token,
          headers: auditOriginHeaders,
        }),
      ]);
      setBranches(normalizePaginated(branchData).items);
      setSales(salesData);
      setPnl(pnlData);
      setLowStock(lowStockData);

      const pendingCount = await getPendingCount();
      setPendingSync(pendingCount);

      const [approvalsData, auditData, exportData, shiftData, notificationsData] =
        await Promise.allSettled([
          apiFetch<PaginatedResponse<Approval> | Approval[]>(
            '/approvals?status=PENDING&limit=5',
            { token },
          ),
          apiFetch<PaginatedResponse<AuditLog> | AuditLog[]>(
            '/audit-logs?limit=12',
            { token },
          ),
          apiFetch<PaginatedResponse<ExportJob> | ExportJob[]>(
            '/exports/jobs?status=PENDING&limit=20',
            { token },
          ),
          apiFetch<PaginatedResponse<Shift> | Shift[]>(
            '/shifts?status=OPEN&limit=50',
            { token },
          ),
          apiFetch<PaginatedResponse<NotificationPreview> | NotificationPreview[]>(
            '/notifications?limit=10',
            { token },
          ),
        ]);

      const [remindersData, transfersData, offlineData, lossesData] =
        await Promise.allSettled([
          apiFetch<ReminderOverview>('/notes/reminders/overview?limit=3&windowDays=7', {
            token,
          }),
          apiFetch<PaginatedResponse<PendingTransfer> | PendingTransfer[]>(
            '/transfers/pending?limit=5&includeTotal=1',
            { token },
          ),
          apiFetch<OfflineRisk>('/offline/risk', { token }),
          apiFetch<TopLosses>(
            `/reports/losses/top?limit=5&days=30${
              activeBranch?.id ? `&branchId=${activeBranch.id}` : ''
            }`,
            { token, headers: auditOriginHeaders },
          ),
        ]);

      if (approvalsData.status === 'fulfilled') {
        setApprovals(normalizePaginated(approvalsData.value).items);
      } else {
        setApprovals([]);
      }
      if (auditData.status === 'fulfilled') {
        setAuditLogs(normalizePaginated(auditData.value).items);
      } else {
        setAuditLogs([]);
      }
      if (exportData.status === 'fulfilled') {
        setExportBacklog(normalizePaginated(exportData.value).items.length);
      } else {
        setExportBacklog(0);
      }
      if (shiftData.status === 'fulfilled') {
        setOpenShifts(normalizePaginated(shiftData.value).items);
      } else {
        setOpenShifts([]);
      }
      if (notificationsData.status === 'fulfilled') {
        const notifItems = normalizePaginated(notificationsData.value).items;
        setAlertsCount(
          notifItems.filter((item) => item.status && item.status !== 'READ').length,
        );
        setNotificationPreview(notifItems.slice(0, 5));
      } else {
        setAlertsCount(0);
        setNotificationPreview([]);
      }
      if (remindersData.status === 'fulfilled') {
        setReminderOverview(remindersData.value);
      } else {
        setReminderOverview(null);
      }
      if (transfersData.status === 'fulfilled') {
        const transferPayload = normalizePaginated(transfersData.value);
        setPendingTransfers(transferPayload.items);
        setPendingTransfersTotal(
          transferPayload.total ?? transferPayload.items.length,
        );
      } else {
        setPendingTransfers([]);
        setPendingTransfersTotal(0);
      }
      if (offlineData.status === 'fulfilled') {
        setOfflineRisk(offlineData.value);
      } else {
        setOfflineRisk(null);
      }
      if (lossesData.status === 'fulfilled') {
        setTopLosses(lossesData.value);
      } else {
        setTopLosses(null);
      }
      setFailedSyncs(0);
    } catch {
      setMessage({ action: 'load', outcome: 'failure', message: t('loadFailed') });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeBranch?.id]);

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
          ...data.variants.map((item) => ({
            id: `variant:${item.id}`,
            label: `${formatVariantLabel(
              {
                id: item.id,
                name: item.name,
                productName: item.product?.name ?? null,
              },
              common('unknown'),
            )}${item.sku ? ` (${item.sku})` : ''}`,
          })),
          ...data.receipts.map((item) => ({
            id: `receipt:${item.id}`,
            label: item.receiptNumber,
          })),
          ...data.customers.map((item) => ({
            id: `customer:${item.id}`,
            label: item.name,
          })),
          ...data.transfers.map((item) => ({
            id: `transfer:${item.id}`,
            label: `${item.sourceBranch?.name ?? common('unknown')} → ${
              item.destinationBranch?.name ?? common('unknown')
            }`,
          })),
        ];
        setSearchSuggestions(next);
      } catch {
        setSearchSuggestions([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">
            {t('commandLayer')}
          </p>
          <h2 className="text-3xl font-semibold text-[color:var(--foreground)]">
            {t('inventoryIntelligenceTitle')}
          </h2>
          <p className="text-sm text-[color:var(--muted)]">
            {t('inventoryIntelligenceSubtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="status-chip">{t('statusLive')}</span>
          <span className="status-chip">{t('statusMultiBranch')}</span>
          <span className="status-chip">{t('statusSyncOk')}</span>
          <button
            type="button"
            onClick={() => load(true)}
            className="rounded border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--foreground)]"
            disabled={isRefreshing}
          >
            {isRefreshing ? <Spinner size="xs" variant="dots" /> : t('refresh')}
          </button>
        </div>
      </div>

      {message ? <p className="text-sm text-red-400">{message}</p> : null}

      <div className="command-card p-6 nvi-reveal">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
          {t('heroEyebrow')}
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
          {t('heroTitle')}
        </h3>
        <p className="text-sm text-[color:var(--muted)]">
          {t('heroSubtitle')}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 nvi-stagger">
        <div className="kpi-card p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('salesToday')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {salesTotal.toLocaleString()}
          </p>
          <p className="text-xs text-[color:var(--muted)]">
            {t('grossSalesTzs')}
          </p>
        </div>
        <div className="kpi-card p-5">
          <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
            <span className="uppercase tracking-[0.3em]">{t('lowStock')}</span>
            {lowStock.length > 0 ? (
              <span className="text-amber-300">{t('needsAction')}</span>
            ) : null}
          </div>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {lowStock.length}
          </p>
          <p className="text-xs text-[color:var(--muted)]">
            {t('itemsBelowThreshold')}
          </p>
        </div>
        <div className="kpi-card p-5">
          <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
            <span className="uppercase tracking-[0.3em]">{t('grossMargin')}</span>
            <span className="text-emerald-200">+{marginPct}%</span>
          </div>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {marginPct}%
          </p>
          <p className="text-xs text-[color:var(--muted)]">
            {t('fromTodaysSales')}
          </p>
        </div>
        <div className="kpi-card p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('expensesToday')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {expensesTotal !== null ? expensesTotal.toLocaleString() : '—'}
          </p>
          <p className="text-xs text-[color:var(--muted)]">
            {transferFeesTotal && transferFeesTotal > 0
              ? t('transferFeesHint', { value: transferFeesTotal.toLocaleString() })
              : t('expensesHint')}
          </p>
        </div>
        <div className="kpi-card p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('openShifts')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
            {openShiftCount}
          </p>
          <p className="text-xs text-[color:var(--muted)]">
            {cashDrawerStatus}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 nvi-stagger">
        <div className="command-card p-5 xl:col-span-2 nvi-reveal">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                {t('inventoryRadar')}
              </p>
              <h3 className="text-lg font-semibold">{t('branchPerformance')}</h3>
            </div>
            <span className="status-chip">{t('statusLive')}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {branchPulse.length ? (
              branchPulse.map(({ branch, lowStockCount }) => {
                const health = Math.max(62, 100 - lowStockCount * 6);
                return (
                  <div
                    key={branch.id}
                    className="rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                      {branch.name}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
                      {health}%
                    </p>
                    <p className="text-xs text-[color:var(--muted)]">
                      {t('stockHealth')}
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-[color:var(--muted)]">
                {t('noBranches')}
              </p>
            )}
          </div>
          {atRiskBranches.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {atRiskBranches.map(({ branch, lowStockCount }) => (
                <span key={branch.id} className="status-chip">
                  {branch.name} • {lowStockCount} {t('lowLabel')}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="command-card p-5 nvi-reveal">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('systemAttention')}</h3>
            <span className="status-chip">{t('statusLive')}</span>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            {attentionItems.length ? (
              attentionItems.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className="rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2"
                >
                  <span
                    className={
                      item.tone === 'alert'
                        ? 'text-amber-200'
                        : item.tone === 'warn'
                        ? 'text-gold-300'
                        : 'text-[color:var(--foreground)]'
                    }
                  >
                    {item.label}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-[color:var(--muted)]">
                {t('noAlerts')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 nvi-stagger">
        <div className="command-card p-5 nvi-reveal">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('remindersTitle')}</h3>
            {isRefreshing ? <Spinner size="xs" variant="dots" /> : null}
          </div>
          <p className="text-sm text-[color:var(--muted)]">
            {t('remindersSubtitle')}
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-3">
              <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
                <span className="uppercase tracking-[0.2em]">
                  {t('upcomingReminders')}
                </span>
                <span>{reminderUpcomingCount}</span>
              </div>
              <div className="mt-2 space-y-2">
                {upcomingReminders.length ? (
                  upcomingReminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="flex items-start justify-between gap-3 text-xs text-[color:var(--foreground)]"
                    >
                      <div>
                        <p className="font-medium">
                          {reminder.note?.title ?? t('reminderUntitled')}
                        </p>
                        {reminder.branch?.name ? (
                          <p className="text-[color:var(--muted)]">
                            {reminder.branch.name}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-[color:var(--muted)]">
                        {new Date(reminder.scheduledAt).toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[color:var(--muted)]">
                    {t('noUpcomingReminders')}
                  </p>
                )}
              </div>
            </div>
            <div className="rounded border border-rose-900/40 bg-[color:var(--surface-soft)] p-3">
              <div className="flex items-center justify-between text-xs text-rose-200">
                <span className="uppercase tracking-[0.2em]">
                  {t('overdueReminders')}
                </span>
                <span>{reminderOverdueCount}</span>
              </div>
              <div className="mt-2 space-y-2">
                {overdueReminders.length ? (
                  overdueReminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="flex items-start justify-between gap-3 text-xs text-[color:var(--foreground)]"
                    >
                      <div>
                        <p className="font-medium">
                          {reminder.note?.title ?? t('reminderUntitled')}
                        </p>
                        {reminder.branch?.name ? (
                          <p className="text-[color:var(--muted)]">
                            {reminder.branch.name}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-[color:var(--muted)]">
                        {new Date(reminder.scheduledAt).toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[color:var(--muted)]">
                    {t('noOverdueReminders')}
                  </p>
                )}
              </div>
            </div>
          </div>
          <Link
            href={`/${locale}/notes`}
            className="mt-4 inline-flex text-xs text-[color:var(--accent)]"
          >
            {t('openNotes')}
          </Link>
        </div>
        <div className="command-card p-5 nvi-reveal">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('pendingTransfersTitle')}</h3>
            <span className="status-chip">
              {t('pendingTransfersCount', { count: pendingTransfersTotal })}
            </span>
          </div>
          <p className="text-sm text-[color:var(--muted)]">
            {t('pendingTransfersSubtitle')}
          </p>
          <div className="mt-4 space-y-2 text-sm text-[color:var(--muted)]">
            {pendingTransfers.length ? (
              pendingTransfers.map((transfer) => (
                <div
                  key={transfer.id}
                  className="flex items-start justify-between gap-3 rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2"
                >
                  <div className="text-xs text-[color:var(--foreground)]">
                    <p className="font-medium">
                      {transfer.sourceBranch?.name ?? common('unknown')} to{' '}
                      {transfer.destinationBranch?.name ?? common('unknown')}
                    </p>
                    <p className="text-[color:var(--muted)]">
                      {transfer._count?.items ?? 0} {t('transferItems')}
                    </p>
                  </div>
                  <span className="text-xs text-[color:var(--muted)]">
                    {new Date(transfer.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-[color:var(--muted)]">
                {t('noPendingTransfers')}
              </p>
            )}
          </div>
          <Link
            href={`/${locale}/transfers`}
            className="mt-4 inline-flex text-xs text-[color:var(--accent)]"
          >
            {t('openTransfers')}
          </Link>
        </div>
        <div className="command-card p-5 nvi-reveal">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('offlineRiskTitle')}</h3>
            <span className={`status-chip ${riskTone}`}>{riskLabel}</span>
          </div>
          <p className="text-sm text-[color:var(--muted)]">
            {t('offlineRiskSubtitle')}
          </p>
          {offlineRisk ? (
            <div className="mt-4 grid gap-3 text-sm text-[color:var(--muted)]">
              <div className="rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2">
                <p className="text-xs uppercase tracking-[0.2em]">
                  {t('offlineDevices')}
                </p>
                <p className="mt-1 text-sm text-[color:var(--foreground)]">
                  {t('offlineDevicesCount', {
                    active: offlineRisk.devices.active,
                    stale: offlineRisk.devices.stale,
                    expired: offlineRisk.devices.expired,
                  })}
                </p>
              </div>
              <div className="rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2">
                <p className="text-xs uppercase tracking-[0.2em]">
                  {t('offlineActions')}
                </p>
                <p className="mt-1 text-sm text-[color:var(--foreground)]">
                  {t('offlineActionsCount', {
                    pending: offlineRisk.actions.pending,
                    failed: offlineRisk.actions.failed,
                    conflicts: offlineRisk.actions.conflicts,
                  })}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[color:var(--muted)]">
              {t('offlineRiskUnavailable')}
            </p>
          )}
          <Link
            href={`/${locale}/offline`}
            className="mt-4 inline-flex text-xs text-[color:var(--accent)]"
          >
            {t('openOffline')}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="command-card p-5 xl:col-span-2 nvi-reveal">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('topLossesTitle')}</h3>
            <span className="status-chip">
              {t('topLossesRange', { days: topLosses?.days ?? 30 })}
            </span>
          </div>
          <p className="text-sm text-[color:var(--muted)]">
            {t('topLossesSubtitle')}
          </p>
          <div className="mt-4 space-y-2 text-sm text-[color:var(--muted)]">
            {topLosses?.items?.length ? (
              topLosses.items.map((loss) => (
                <div
                  key={loss.variantId}
                  className="flex items-start justify-between gap-3 rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2"
                >
                  <div className="text-xs text-[color:var(--foreground)]">
                    <p className="font-medium">
                      {loss.variantName ?? common('unknown')}
                    </p>
                    <p className="text-[color:var(--muted)]">
                      {loss.productName ?? common('unknown')}
                      {loss.sku ? ` • ${loss.sku}` : ''}
                    </p>
                  </div>
                  <div className="text-right text-xs text-[color:var(--muted)]">
                    <p className="text-[color:var(--foreground)]">
                      {loss.totalCost.toLocaleString()}
                    </p>
                    <p>
                      {t('lossUnits', { count: loss.quantity.toLocaleString() })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[color:var(--muted)]">{t('noLosses')}</p>
            )}
          </div>
          <Link
            href={`/${locale}/reports`}
            className="mt-4 inline-flex text-xs text-[color:var(--accent)]"
          >
            {t('openReports')}
          </Link>
        </div>
        <div className="command-card p-5 nvi-reveal">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {t('notificationsInboxTitle')}
            </h3>
            <span className="status-chip">{alertsCount}</span>
          </div>
          <p className="text-sm text-[color:var(--muted)]">
            {t('notificationsInboxSubtitle')}
          </p>
          <div className="mt-4 space-y-2 text-sm text-[color:var(--muted)]">
            {notificationPreview.length ? (
              notificationPreview.map((item) => (
                <div
                  key={item.id}
                  className="rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={
                        item.status && item.status !== 'READ'
                          ? 'text-amber-200'
                          : 'text-[color:var(--muted)]'
                      }
                    >
                      {item.title}
                    </span>
                    <span className="text-[color:var(--muted)]">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">
                    {item.message}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[color:var(--muted)]">
                {t('noNotifications')}
              </p>
            )}
          </div>
          <Link
            href={`/${locale}/notifications`}
            className="mt-4 inline-flex text-xs text-[color:var(--accent)]"
          >
            {t('viewInbox')}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="command-card p-5 xl:col-span-2 nvi-reveal">
          <h3 className="text-lg font-semibold">{t('recentActions')}</h3>
          <p className="text-sm text-[color:var(--muted)]">
            {t('recentActionsSubtitle')}
          </p>
          <div className="mt-4 space-y-2 text-sm text-[color:var(--muted)]">
            {approvals.length === 0 && highRiskLogs.length === 0 ? (
              <p>{t('noPendingApprovals')}</p>
            ) : null}
            {approvals.slice(0, 3).map((approval) => (
              <div
                key={approval.id}
                className="flex items-center justify-between rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2"
              >
                <span>{approval.actionType}</span>
                <span>{t('pendingApproval')}</span>
              </div>
            ))}
            {highRiskLogs.slice(0, 3).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2"
              >
                <span>{log.action.replaceAll('_', ' ')}</span>
                <span>{log.outcome}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="command-card p-5 nvi-reveal">
          <h3 className="text-lg font-semibold">{t('quickActions')}</h3>
          <p className="text-sm text-[color:var(--muted)]">
            {t('quickActionsSubtitle')}
          </p>
          <div className="mt-4 grid gap-2 text-sm">
            <Link
              href={`/${locale}/catalog/products`}
              className="rounded border border-[color:var(--border)] px-3 py-2 text-[color:var(--foreground)]"
            >
              {t('createProduct')}
            </Link>
            <Link
              href={`/${locale}/receiving`}
              className="rounded border border-[color:var(--border)] px-3 py-2 text-[color:var(--foreground)]"
            >
              {t('receiveStock')}
            </Link>
            <Link
              href={`/${locale}/pos`}
              className="rounded border border-[color:var(--border)] px-3 py-2 text-[color:var(--foreground)]"
            >
              {t('startSale')}
            </Link>
            <Link
              href={`/${locale}/transfers`}
              className="rounded border border-[color:var(--border)] px-3 py-2 text-[color:var(--foreground)]"
            >
              {t('newTransfer')}
            </Link>
          </div>
        </div>
      </div>

      <div className="command-card p-5 nvi-reveal">
        <h3 className="text-lg font-semibold">{t('globalSearch')}</h3>
        <p className="text-sm text-[color:var(--muted)]">
          {t('globalSearchSubtitle')}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <TypeaheadInput
            value={searchQuery}
            onChange={setSearchQuery}
            onSelect={(option) => {
              setSearchQuery(option.label);
              runSearch(option.label);
            }}
            onEnter={() => runSearch()}
            options={searchSuggestions}
            className="min-w-[240px] flex-1 rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--foreground)]"
          />
          <button
            type="button"
            onClick={() => runSearch()}
            className="inline-flex items-center gap-2 rounded border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--foreground)]"
            disabled={isSearching}
          >
            {isSearching ? <Spinner size="xs" variant="orbit" /> : null}
            {isSearching ? t('searching') : t('search')}
          </button>
          <Link
            href={`/${locale}/search`}
            className="inline-flex items-center gap-2 rounded border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--foreground)]"
          >
            {t('openFullSearch')}
          </Link>
        </div>
        {searchResults ? (
          <div className="mt-4 grid gap-3 text-xs text-[color:var(--muted)] md:grid-cols-2">
            <div className="rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-3">
              <p className="text-[color:var(--foreground)]">{t('products')}</p>
              {searchResults.products.length === 0 ? (
                <p className="mt-2">{t('noProductMatches')}</p>
              ) : (
                searchResults.products.slice(0, 3).map((item) => (
                  <p key={item.id} className="mt-2">
                    {item.name} • {item.variants.length} {t('variants')}
                  </p>
                ))
              )}
            </div>
            <div className="rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-3">
              <p className="text-[color:var(--foreground)]">{t('otherMatches')}</p>
              <p className="mt-2">
                {t('receipts')}: {searchResults.receipts.length} • {t('customers')}:{' '}
                {searchResults.customers.length} • {t('transfers')}:{' '}
                {searchResults.transfers.length}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
