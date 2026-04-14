'use client';

import { RingGauge } from '@/components/RingGauge';
import { NeedleGauge } from '@/components/analog/NeedleGauge';
import { Card } from '@/components/ui/Card';
import type { HealthStatus } from '../hooks/useHealthMatrix';

type SyncRisk = {
  score: number;
  status: HealthStatus;
  failedActions24h: number;
  failedActions7d: number;
  staleActiveDevices: number;
  revokedDevices: number;
};

type QueuePressure = {
  score: number;
  status: HealthStatus;
  totalPending: number;
  exportsPending: number;
  supportPending: number;
  subscriptionsPending: number;
  exportsFailed: number;
};

type ApiPulse = {
  errorRate: number;
  avgLatencyMs: number;
};

type Props = {
  syncRisk: SyncRisk;
  queuePressure: QueuePressure;
  apiPulse: ApiPulse;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const GAUGE_COLOR_STOPS = [
  { offset: 0, color: '#3dba6a' },
  { offset: 0.4, color: '#e09a2a' },
  { offset: 0.8, color: '#e05252' },
];

export function TelemetryPanel({
  syncRisk,
  queuePressure,
  apiPulse,
  t,
}: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {/* Sync Risk */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <h3 className="mb-2 text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
          {t('telemetrySyncRiskTitle')}
        </h3>
        <div className="flex justify-center">
          <NeedleGauge
            value={syncRisk.score}
            max={100}
            label={t('telemetryRiskLabel')}
            size={140}
            colorStops={GAUGE_COLOR_STOPS}
          />
        </div>
        <div className="mt-2 space-y-0.5 text-[10px]">
          <div className="flex justify-between text-[var(--pt-text-2)]">
            <span>{t('telemetryFailed24h')}</span>
            <span className="font-semibold">{syncRisk.failedActions24h}</span>
          </div>
          <div className="flex justify-between text-[var(--pt-text-2)]">
            <span>{t('telemetryStaleDevices')}</span>
            <span className="font-semibold">{syncRisk.staleActiveDevices}</span>
          </div>
          <div className="flex justify-between text-[var(--pt-text-2)]">
            <span>{t('telemetryRevokedDevices')}</span>
            <span className="font-semibold">{syncRisk.revokedDevices}</span>
          </div>
        </div>
      </Card>

      {/* Queue Pressure */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <h3 className="mb-2 text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
          {t('telemetryQueuePressureTitle')}
        </h3>
        <div className="flex justify-center">
          <NeedleGauge
            value={queuePressure.score}
            max={100}
            label={t('telemetryPressureLabel')}
            size={140}
            colorStops={GAUGE_COLOR_STOPS}
          />
        </div>
        <div className="mt-2 space-y-0.5 text-[10px]">
          <div className="flex justify-between text-[var(--pt-text-2)]">
            <span>{t('telemetryExportsPending')}</span>
            <span className="font-semibold">{queuePressure.exportsPending}</span>
          </div>
          <div className="flex justify-between text-[var(--pt-text-2)]">
            <span>{t('telemetrySupportPending')}</span>
            <span className="font-semibold">{queuePressure.supportPending}</span>
          </div>
          <div className="flex justify-between text-[var(--pt-text-2)]">
            <span>{t('telemetryExportsFailed')}</span>
            <span className="font-semibold text-red-400">
              {queuePressure.exportsFailed}
            </span>
          </div>
        </div>
      </Card>

      {/* API Pulse — two mini ring gauges */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <h3 className="mb-2 text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
          {t('telemetryApiPulseTitle')}
        </h3>
        <div className="flex items-center justify-around">
          <div className="text-center">
            <RingGauge
              value={Math.round(apiPulse.errorRate * 10000) / 100}
              max={5}
              size={60}
              color={
                apiPulse.errorRate >= 0.05
                  ? 'var(--pt-danger, #e05252)'
                  : apiPulse.errorRate >= 0.02
                    ? 'var(--pt-warning, #e09a2a)'
                    : '#3dba6a'
              }
              label={`${(apiPulse.errorRate * 100).toFixed(2)}%`}
            />
            <p className="mt-1 text-[9px] text-[var(--pt-text-muted)]">
              {t('telemetryErrorRate')}
            </p>
          </div>
          <div className="text-center">
            <RingGauge
              value={Math.min(apiPulse.avgLatencyMs, 1000)}
              max={1000}
              size={60}
              color={
                apiPulse.avgLatencyMs >= 500
                  ? 'var(--pt-danger, #e05252)'
                  : apiPulse.avgLatencyMs >= 200
                    ? 'var(--pt-warning, #e09a2a)'
                    : '#3dba6a'
              }
              label={`${apiPulse.avgLatencyMs}ms`}
            />
            <p className="mt-1 text-[9px] text-[var(--pt-text-muted)]">
              {t('telemetryAvgLatency')}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
