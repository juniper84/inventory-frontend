'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Loader,
  XCircle,
  CheckCircle,
  Download,
  Wrench,
  Package,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/notifications/Banner';
import { FlipCounter } from '@/components/analog/FlipCounter';
import { apiFetch } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';
import { IncidentsTab } from './tabs/IncidentsTab';
import { ExportsTab } from './tabs/ExportsTab';

type TabKey = 'incidents' | 'exports';

type IncidentsResponse = {
  items: { id: string; status: string; closedAt?: string | null }[];
};

type ExportStatsResponse = {
  total: number;
  byStatus: Record<string, number>;
};

export function OperationsView() {
  const t = useTranslations('platformConsole');

  const [activeTab, setActiveTab] = useState<TabKey>('incidents');
  const [showExportOnExit, setShowExportOnExit] = useState(false);
  const [kpis, setKpis] = useState({
    openIncidents: 0,
    activeExports: 0,
    failedExports: 0,
    resolvedThisWeek: 0,
  });
  const [bannerError, setBannerError] = useState<string | null>(null);

  const loadKpis = async () => {
    try {
      const token = getPlatformAccessToken();
      if (!token) return;

      const [incidentsRes, statsRes] = await Promise.all([
        apiFetch<IncidentsResponse>('/platform/incidents?limit=200', {
          token,
        }),
        apiFetch<ExportStatsResponse>('/platform/exports/stats', { token }),
      ]);

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const openIncidents = (incidentsRes.items ?? []).filter(
        (i) => i.status === 'OPEN' || i.status === 'INVESTIGATING',
      ).length;

      const resolvedThisWeek = (incidentsRes.items ?? []).filter((i) => {
        if (i.status !== 'RESOLVED' && i.status !== 'CLOSED') return false;
        if (!i.closedAt) return false;
        return new Date(i.closedAt).getTime() >= sevenDaysAgo;
      }).length;

      const byStatus = statsRes.byStatus ?? {};
      const activeExports =
        (byStatus.PENDING ?? 0) + (byStatus.RUNNING ?? 0);
      const failedExports = byStatus.FAILED ?? 0;

      setKpis({
        openIncidents,
        activeExports,
        failedExports,
        resolvedThisWeek,
      });
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Failed to load summary',
      );
    }
  };

  useEffect(() => {
    loadKpis();
    const id = setInterval(loadKpis, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4 nvi-stagger">
      <PageHeader
        title={t('operationsTitle')}
        subtitle={t('operationsSubtitle')}
        actions={
          activeTab === 'exports' ? (
            <button
              type="button"
              onClick={() => setShowExportOnExit((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 nvi-press"
            >
              <Download size={12} />
              {t('exportOnExitButton')}
            </button>
          ) : null
        }
      />

      {bannerError && (
        <Banner
          severity="error"
          message={bannerError}
          onDismiss={() => setBannerError(null)}
        />
      )}

      {/* KPI strip */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 nvi-stagger">
        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10">
              <AlertTriangle size={14} className="text-red-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('kpiOpenIncidents')}
              </p>
              <FlipCounter value={kpis.openIncidents} size="md" digits={3} />
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
              <Loader size={14} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('kpiActiveExports')}
              </p>
              <FlipCounter value={kpis.activeExports} size="md" digits={3} />
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10">
              <XCircle size={14} className="text-red-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('kpiFailedExports')}
              </p>
              <FlipCounter value={kpis.failedExports} size="md" digits={3} />
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
              <CheckCircle size={14} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('kpiResolvedThisWeek')}
              </p>
              <FlipCounter
                value={kpis.resolvedThisWeek}
                size="md"
                digits={3}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('incidents')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'incidents'
              ? 'bg-[var(--pt-accent)] text-black'
              : 'text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)]'
          }`}
        >
          <Wrench size={12} />
          {t('operationsTabIncidents')}
          {kpis.openIncidents > 0 && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold leading-none ${
                activeTab === 'incidents'
                  ? 'bg-black/20 text-black'
                  : 'bg-red-500/15 text-red-300'
              }`}
            >
              {kpis.openIncidents}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('exports')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'exports'
              ? 'bg-[var(--pt-accent)] text-black'
              : 'text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)]'
          }`}
        >
          <Package size={12} />
          {t('operationsTabExports')}
          {kpis.activeExports > 0 && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold leading-none ${
                activeTab === 'exports'
                  ? 'bg-black/20 text-black'
                  : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              {kpis.activeExports}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'incidents' && <IncidentsTab />}
      {activeTab === 'exports' && (
        <ExportsTab
          showExportOnExit={showExportOnExit}
          onCloseExportOnExit={() => setShowExportOnExit(false)}
        />
      )}
    </div>
  );
}
