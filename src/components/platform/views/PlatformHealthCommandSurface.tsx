import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';

type HealthMatrix = {
  rollups?: {
    overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    healthy: number;
    warning: number;
    critical: number;
  };
  generatedAt?: string;
  dependencies?: {
    key: string;
    label: string;
    detail?: unknown;
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  }[];
  telemetry?: {
    api?: {
      leaders?: {
        path: string;
        avgDurationMs: number;
        p95DurationMs: number;
        p99DurationMs: number;
        errorRate: number;
        count: number;
      }[];
    };
    syncRisk?: {
      score: number;
      status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
      failedActions24h: number;
      staleActiveDevices: number;
    };
    queuePressure?: {
      score: number;
      status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
      totalPending: number;
      exportsFailed: number;
    };
  };
};

type BusinessHealth = {
  subscriptionStatus: string;
  offlineFailed: number;
  exportsPending: number;
  score: number;
};

type Device = { id: string; deviceName?: string | null; status: string };

type SelectOption = { value: string; label: string };

export function PlatformHealthCommandSurface({
  show,
  t,
  healthMatrix,
  actionLoading,
  healthLoading,
  withAction,
  loadHealthMatrix,
  loadHealthForSelected,
  loadHealthForPinned,
  healthStatusLabel,
  healthBusinessId,
  setHealthBusinessId,
  businessSelectOptions,
  healthMap,
  businessLookup,
  deviceFleetBusinessId,
  setDeviceFleetBusinessId,
  deviceRevokeReason,
  setDeviceRevokeReason,
  setMessage,
  loadDevices,
  devicesMap,
  loadingDevices,
  revokeDevice,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  healthMatrix: HealthMatrix | null;
  actionLoading: Record<string, boolean>;
  healthLoading: boolean;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  loadHealthMatrix: () => Promise<void>;
  loadHealthForSelected: () => void | Promise<void>;
  loadHealthForPinned: () => void | Promise<void>;
  healthStatusLabel: (status: 'HEALTHY' | 'WARNING' | 'CRITICAL') => string;
  healthBusinessId: string;
  setHealthBusinessId: (value: string) => void;
  businessSelectOptions: SelectOption[];
  healthMap: Record<string, BusinessHealth>;
  businessLookup: Map<string, { name: string }>;
  deviceFleetBusinessId: string;
  setDeviceFleetBusinessId: (value: string) => void;
  deviceRevokeReason: string;
  setDeviceRevokeReason: (value: string) => void;
  setMessage: (message: string) => void;
  loadDevices: (businessId: string) => Promise<void>;
  devicesMap: Record<string, Device[]>;
  loadingDevices: Record<string, boolean>;
  revokeDevice: (
    deviceId: string,
    businessId: string,
    reason: string,
  ) => Promise<void>;
}) {
  if (!show) {
    return null;
  }

  return (
    <>
      <section className="command-card p-6 space-y-4 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">{t('healthTitle')}</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() =>
                withAction('health:refreshMatrix', () => loadHealthMatrix())
              }
              className="rounded border border-gold-700/60 px-3 py-1 text-gold-100"
            >
              <span className="inline-flex items-center gap-2">
                {actionLoading['health:refreshMatrix'] ? (
                  <Spinner size="xs" variant="grid" />
                ) : null}
                {t('refresh')}
              </span>
            </button>
            <button
              type="button"
              onClick={loadHealthForSelected}
              className="rounded border border-gold-700/60 px-3 py-1 text-gold-100"
              disabled={healthLoading}
            >
              <span className="inline-flex items-center gap-2">
                {healthLoading ? <Spinner size="xs" variant="pulse" /> : null}
                {healthLoading ? t('loading') : t('loadSelected')}
              </span>
            </button>
            <button
              type="button"
              onClick={loadHealthForPinned}
              className="rounded border border-gold-700/60 px-3 py-1 text-gold-100"
              disabled={healthLoading}
            >
              <span className="inline-flex items-center gap-2">
                {healthLoading ? <Spinner size="xs" variant="pulse" /> : null}
                {t('loadPinned')}
              </span>
            </button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded border border-gold-700/40 bg-black/35 p-3 text-xs text-gold-300">
            <p className="text-gold-100">{t('healthOverallStatus')}</p>
            <p className="mt-1 text-sm font-semibold text-gold-200">
              {healthMatrix?.rollups
                ? healthStatusLabel(healthMatrix.rollups.overallStatus)
                : t('notAvailable')}
            </p>
            <p className="text-[11px] text-gold-500">
              {healthMatrix?.generatedAt
                ? new Date(healthMatrix.generatedAt).toLocaleString()
                : t('notAvailable')}
            </p>
          </div>
          <div className="rounded border border-gold-700/40 bg-black/35 p-3 text-xs text-gold-300">
            <p className="text-gold-100">{t('healthDependencyRollup')}</p>
            <p className="mt-1 text-[11px]">
              {t('healthRollupHealthy', {
                value: healthMatrix?.rollups?.healthy ?? 0,
              })}
            </p>
            <p className="text-[11px]">
              {t('healthRollupWarning', {
                value: healthMatrix?.rollups?.warning ?? 0,
              })}
            </p>
            <p className="text-[11px]">
              {t('healthRollupCritical', {
                value: healthMatrix?.rollups?.critical ?? 0,
              })}
            </p>
          </div>
          <div className="rounded border border-gold-700/40 bg-black/35 p-3 text-xs text-gold-300">
            <p className="text-gold-100">{t('healthSyncRisk')}</p>
            <p className="mt-1 text-sm font-semibold text-gold-200">
              {healthMatrix?.telemetry?.syncRisk
                ? `${healthMatrix.telemetry.syncRisk.score}/100 • ${healthStatusLabel(
                    healthMatrix.telemetry.syncRisk.status,
                  )}`
                : t('notAvailable')}
            </p>
            <p className="text-[11px] text-gold-500">
              {t('healthSyncRiskBreakdown', {
                failed24h: healthMatrix?.telemetry?.syncRisk?.failedActions24h ?? 0,
                stale: healthMatrix?.telemetry?.syncRisk?.staleActiveDevices ?? 0,
              })}
            </p>
          </div>
          <div className="rounded border border-gold-700/40 bg-black/35 p-3 text-xs text-gold-300">
            <p className="text-gold-100">{t('healthQueuePressure')}</p>
            <p className="mt-1 text-sm font-semibold text-gold-200">
              {healthMatrix?.telemetry?.queuePressure
                ? `${healthMatrix.telemetry.queuePressure.score}/100 • ${healthStatusLabel(
                    healthMatrix.telemetry.queuePressure.status,
                  )}`
                : t('notAvailable')}
            </p>
            <p className="text-[11px] text-gold-500">
              {t('healthQueuePressureBreakdown', {
                pending: healthMatrix?.telemetry?.queuePressure?.totalPending ?? 0,
                failed: healthMatrix?.telemetry?.queuePressure?.exportsFailed ?? 0,
              })}
            </p>
          </div>
        </div>
        <div className="rounded border border-gold-700/40 bg-black/30 p-3 text-xs text-gold-300">
          <p className="mb-2 text-gold-100">{t('healthDependenciesTitle')}</p>
          <div className="space-y-2">
            {(healthMatrix?.dependencies ?? []).map((dependency) => (
              <div
                key={dependency.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-gold-700/30 bg-black/40 p-2"
              >
                <div>
                  <p className="text-gold-100">{dependency.label}</p>
                  <p className="text-[11px] text-gold-500">
                    {JSON.stringify(dependency.detail)}
                  </p>
                </div>
                <span className="rounded border border-gold-700/50 px-2 py-1 text-[11px] text-gold-200">
                  {healthStatusLabel(dependency.status)}
                </span>
              </div>
            ))}
            {!healthMatrix?.dependencies?.length ? (
              <p className="text-gold-500">{t('healthMatrixUnavailable')}</p>
            ) : null}
          </div>
        </div>
        <div className="rounded border border-gold-700/40 bg-black/30 p-3 text-xs text-gold-300">
          <p className="mb-2 text-gold-100">{t('healthLatencyLeadersTitle')}</p>
          <div className="space-y-2">
            {(healthMatrix?.telemetry?.api?.leaders ?? []).map((leader) => (
              <div
                key={leader.path}
                className="rounded border border-gold-700/30 bg-black/40 p-2"
              >
                <p className="text-gold-100">{leader.path}</p>
                <p className="text-[11px] text-gold-500">
                  {t('healthLatencyLeaderLine', {
                    avg: leader.avgDurationMs,
                    p95: leader.p95DurationMs,
                    p99: leader.p99DurationMs,
                    errors: Math.round(leader.errorRate * 100),
                    count: leader.count,
                  })}
                </p>
              </div>
            ))}
            {!healthMatrix?.telemetry?.api?.leaders?.length ? (
              <p className="text-gold-500">{t('healthNoLeaders')}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SmartSelect
            value={healthBusinessId}
            onChange={setHealthBusinessId}
            options={businessSelectOptions}
            placeholder={t('selectBusiness')}
          />
        </div>
        <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
          {Object.entries(healthMap).map(([businessId, health]) => {
            const business = businessLookup.get(businessId);
            return (
              <div
                key={businessId}
                className="rounded border border-gold-700/40 bg-black/40 p-3"
              >
                <p className="text-gold-100">
                  {business?.name ?? t('businessLabel')} • {businessId}
                </p>
                <p>
                  {t('subscriptionLabel', {
                    status: health.subscriptionStatus,
                    score: health.score,
                  })}
                </p>
                <p>
                  {t('healthOfflineFailures', {
                    value: health.offlineFailed,
                    backlog: health.exportsPending,
                  })}
                </p>
              </div>
            );
          })}
          {!Object.keys(healthMap).length ? (
            <p className="text-gold-400">{t('noHealthChecks')}</p>
          ) : null}
        </div>
      </section>

      <section className="command-card p-6 space-y-4 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">{t('deviceFleetTitle')}</h3>
          <button
            type="button"
            onClick={() => {
              if (!deviceFleetBusinessId) {
                setMessage(t('selectBusinessLoadDevices'));
                return;
              }
              loadDevices(deviceFleetBusinessId);
            }}
            className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
          >
            {t('loadDevices')}
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr_2fr_auto]">
          <SmartSelect
            value={deviceFleetBusinessId}
            onChange={setDeviceFleetBusinessId}
            options={businessSelectOptions}
            placeholder={t('selectBusiness')}
          />
          <input
            value={deviceRevokeReason}
            onChange={(event) => setDeviceRevokeReason(event.target.value)}
            placeholder={t('revokeReasonPlaceholder')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <button
            type="button"
            onClick={() => {
              if (!deviceFleetBusinessId) {
                setMessage(t('selectBusinessLoadDevices'));
                return;
              }
              withAction(`devices:refresh:${deviceFleetBusinessId}`, () =>
                loadDevices(deviceFleetBusinessId),
              );
            }}
            className="rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black"
          >
            <span className="inline-flex items-center gap-2">
              {actionLoading[`devices:refresh:${deviceFleetBusinessId}`] ? (
                <Spinner size="xs" variant="grid" />
              ) : null}
              {t('refresh')}
            </span>
          </button>
        </div>
        <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
          {(devicesMap[deviceFleetBusinessId] ?? []).map((device) => (
            <div
              key={device.id}
              className="rounded border border-gold-700/40 bg-black/40 p-3"
            >
              <p className="text-gold-100">
                {device.deviceName ?? t('unnamedDevice')} • {device.status}
              </p>
              {device.status !== 'REVOKED' ? (
                <button
                  type="button"
                  onClick={() =>
                    deviceRevokeReason.trim()
                      ? withAction(`device:revoke:${device.id}`, () =>
                          revokeDevice(
                            device.id,
                            deviceFleetBusinessId,
                            deviceRevokeReason,
                          ),
                        )
                      : setMessage(t('revokeReasonRequired'))
                  }
                  className="mt-2 rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
                >
                  <span className="inline-flex items-center gap-2">
                    {actionLoading[`device:revoke:${device.id}`] ? (
                      <Spinner size="xs" variant="dots" />
                    ) : null}
                    {t('revokeDevice')}
                  </span>
                </button>
              ) : null}
            </div>
          ))}
          {loadingDevices[deviceFleetBusinessId] ? (
            <div className="flex items-center gap-2 text-xs text-gold-300">
              <Spinner size="xs" variant="grid" /> {t('loadingDevices')}
            </div>
          ) : null}
          {!loadingDevices[deviceFleetBusinessId] &&
          (devicesMap[deviceFleetBusinessId] ?? []).length === 0 ? (
            <p className="text-gold-400">{t('noDevices')}</p>
          ) : null}
        </div>
      </section>
    </>
  );
}
