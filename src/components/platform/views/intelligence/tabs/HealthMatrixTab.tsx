'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Gauge,
  Wifi,
  Package,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { DateTimePickerInput } from '@/components/DateTimePickerInput';
import { Checkbox } from '@/components/Checkbox';
import { useHealthMatrix, type MetricsRangeKey } from '../hooks/useHealthMatrix';
import { DependencyCard } from '../components/DependencyCard';
import { TelemetryPanel } from '../components/TelemetryPanel';
import { ApiMetricsChart } from '../components/ApiMetricsChart';
import { LatencyBar } from '../components/LatencyBar';

export function HealthMatrixTab() {
  const t = useTranslations('platformConsole');
  const health = useHealthMatrix();
  const [showOfflineFailed, setShowOfflineFailed] = useState(false);
  const [showExportsPending, setShowExportsPending] = useState(false);

  const ranges: { key: MetricsRangeKey; label: string }[] = [
    { key: '24h', label: '24h' },
    { key: '7d', label: '7d' },
    { key: '30d', label: '30d' },
    { key: 'custom', label: t('metricsCustomRange') },
  ];

  const maxLatency = useMemo(() => {
    if (!health.matrix) return 500;
    const leaders = health.matrix.telemetry.api.leaders;
    if (leaders.length === 0) return 500;
    return Math.max(...leaders.map((l) => l.p99DurationMs), 100);
  }, [health.matrix]);

  if (health.isLoading && !health.matrix) {
    return (
      <div className="space-y-3 nvi-stagger">
        <div className="h-32 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!health.matrix) {
    return (
      <EmptyState
        icon={<Activity size={28} className="text-[var(--pt-text-muted)]" />}
        title={t('healthEmptyTitle')}
        description={t('healthEmptyHint')}
      />
    );
  }

  const overall = health.matrix.rollups.overallStatus;

  return (
    <div className="space-y-4 nvi-stagger">
      {/* System status hero */}
      <Card
        padding="lg"
        className={`nvi-slide-in-bottom ${
          overall === 'CRITICAL'
            ? 'border-red-500/40 bg-red-500/[0.04]'
            : overall === 'WARNING'
              ? 'border-amber-500/30 bg-amber-500/[0.04]'
              : 'border-emerald-500/25 bg-emerald-500/[0.04]'
        }`}
      >
        <div className="flex items-center justify-center gap-6">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full ${
              overall === 'CRITICAL'
                ? 'bg-red-500/20 animate-pulse'
                : overall === 'WARNING'
                  ? 'bg-amber-500/20 animate-pulse'
                  : 'bg-emerald-500/20'
            }`}
          >
            {overall === 'CRITICAL' ? (
              <AlertOctagon size={32} className="text-red-400" />
            ) : overall === 'WARNING' ? (
              <AlertTriangle size={32} className="text-amber-400" />
            ) : (
              <CheckCircle2 size={32} className="text-emerald-400" />
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--pt-text-muted)]">
              {t('healthOverallStatus')}
            </p>
            <h2
              className={`mt-0.5 text-3xl font-bold ${
                overall === 'CRITICAL'
                  ? 'text-red-400'
                  : overall === 'WARNING'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
              }`}
            >
              {t(`overallStatus.${overall}`)}
            </h2>
            <div className="mt-1 flex items-center gap-3 text-[10px]">
              <span className="text-emerald-400">
                ✓ {health.matrix.rollups.healthy} {t('healthHealthy')}
              </span>
              <span className="text-amber-400">
                ⚠ {health.matrix.rollups.warning} {t('healthWarning')}
              </span>
              <span className="text-red-400">
                ✕ {health.matrix.rollups.critical} {t('healthCritical')}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Dependency grid */}
      <div>
        <h3 className="mb-2 text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
          {t('healthDependenciesTitle')}
        </h3>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {health.matrix.dependencies.map((dep) => (
            <DependencyCard
              key={dep.key}
              dependency={dep}
              t={(key, values) => t(key, values)}
            />
          ))}
        </div>
      </div>

      {/* Telemetry */}
      <div>
        <h3 className="mb-2 text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
          {t('healthTelemetryTitle')}
        </h3>
        <TelemetryPanel
          syncRisk={health.matrix.telemetry.syncRisk}
          queuePressure={health.matrix.telemetry.queuePressure}
          apiPulse={{
            errorRate: health.matrix.telemetry.api.errorRate,
            avgLatencyMs: health.matrix.telemetry.api.avgLatencyMs,
          }}
          t={(key, values) => t(key, values)}
        />
      </div>

      {/* API metrics chart with controls */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pt-accent)]/10">
              <Gauge size={14} className="text-[var(--pt-accent)]" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
              {t('healthApiMetricsTitle')}
            </h3>
          </div>
          <div className="flex rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
            {ranges.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => health.setRange(r.key)}
                className={`rounded-md px-2 py-1 text-[10px] font-semibold transition nvi-press ${
                  health.range === r.key
                    ? 'bg-[var(--pt-accent)] text-black'
                    : 'text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom range pickers (bug fix #4) */}
        {health.range === 'custom' && (
          <div className="mb-3 grid gap-2 md:grid-cols-2">
            <div>
              <label className="text-[9px] text-[var(--pt-text-muted)]">
                {t('metricsFrom')}
              </label>
              <DateTimePickerInput
                value={health.customFrom}
                onChange={health.setCustomFrom}
              />
            </div>
            <div>
              <label className="text-[9px] text-[var(--pt-text-muted)]">
                {t('metricsTo')}
              </label>
              <DateTimePickerInput
                value={health.customTo}
                onChange={health.setCustomTo}
              />
            </div>
          </div>
        )}

        {/* Series toggles */}
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={showOfflineFailed}
              onChange={setShowOfflineFailed}
            />
            <span className="inline-flex items-center gap-1 text-[10px] text-[var(--pt-text-2)]">
              <Wifi size={10} />
              {t('metricsSeriesOfflineFailed')}
            </span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={showExportsPending}
              onChange={setShowExportsPending}
            />
            <span className="inline-flex items-center gap-1 text-[10px] text-[var(--pt-text-2)]">
              <Package size={10} />
              {t('metricsSeriesExportsPending')}
            </span>
          </label>
        </div>

        {health.metrics ? (
          <ApiMetricsChart
            series={health.metrics.series}
            showOfflineFailed={showOfflineFailed}
            showExportsPending={showExportsPending}
            labels={{
              errorRate: t('metricsSeriesErrorRate'),
              avgLatency: t('metricsSeriesAvgLatency'),
              offlineFailed: t('metricsSeriesOfflineFailed'),
              exportsPending: t('metricsSeriesExportsPending'),
            }}
          />
        ) : (
          <div className="h-72 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
        )}
      </Card>

      {/* Latency leaders */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <h3 className="mb-2 text-sm font-semibold text-[var(--pt-text-1)]">
          {t('healthLatencyLeadersTitle')}
        </h3>
        {health.matrix.telemetry.api.leaders.length === 0 ? (
          <p className="text-xs text-[var(--pt-text-muted)] italic">
            {t('healthLatencyLeadersEmpty')}
          </p>
        ) : (
          <div className="space-y-2">
            {health.matrix.telemetry.api.leaders.map((endpoint) => (
              <LatencyBar
                key={endpoint.path}
                endpoint={endpoint}
                max={maxLatency}
                t={(key, values) => t(key, values)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
