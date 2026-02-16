import type { ChartData } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Spinner } from '@/components/Spinner';

type Metrics = {
  totals: {
    businesses: number;
    active: number;
    grace: number;
    expired: number;
    suspended: number;
    underReview: number;
    offlineEnabled: number;
  };
  offlineFailures: number;
  exports: { pending: number };
  api: {
    errorRate: number;
    avgLatency: number;
    slowEndpoints: { path: string; avgDurationMs: number; count: number }[];
  };
  storage: {
    totalMb: number;
    topBusinesses: { businessId: string; name: string; sizeMb: number }[];
  };
};

export function PlatformMetricsSection({
  t,
  show,
  metricsRange,
  setMetricsRange,
  metricsFrom,
  setMetricsFrom,
  metricsTo,
  setMetricsTo,
  withAction,
  loadMetrics,
  actionLoading,
  metrics,
  chartData,
}: {
  t: unknown;
  show: boolean;
  metricsRange: string;
  setMetricsRange: (value: string) => void;
  metricsFrom: string;
  setMetricsFrom: (value: string) => void;
  metricsTo: string;
  setMetricsTo: (value: string) => void;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  loadMetrics: () => Promise<void>;
  actionLoading: Record<string, boolean>;
  metrics: Metrics | null;
  chartData: ChartData<'line'> | null;
}) {
  const translate = t as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  if (!show) {
    return null;
  }

  return (
    <section className="command-card p-6 space-y-4 nvi-reveal">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-xl font-semibold">{translate('metricsTitle')}</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {['24h', '7d', '30d', 'custom'].map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setMetricsRange(range)}
              className={`rounded border px-3 py-1 ${
                metricsRange === range
                  ? 'border-gold-500 bg-gold-500/20 text-gold-100'
                  : 'border-gold-700/50 text-gold-300'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
      {metricsRange === 'custom' ? (
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={metricsFrom}
            onChange={(event) => setMetricsFrom(event.target.value)}
            placeholder={translate('metricsFrom')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={metricsTo}
            onChange={(event) => setMetricsTo(event.target.value)}
            placeholder={translate('metricsTo')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <button
            type="button"
            onClick={() => withAction('metrics:apply', loadMetrics)}
            className="rounded bg-gold-500 px-3 py-2 font-semibold text-black"
          >
            <span className="inline-flex items-center gap-2">
              {actionLoading['metrics:apply'] ? (
                <Spinner size="xs" variant="ring" />
              ) : null}
              {translate('applyRange')}
            </span>
          </button>
        </div>
      ) : null}
      {metrics ? (
        <div className="space-y-4">
          <div className="grid gap-3 text-sm text-gold-200 md:grid-cols-3">
            <div className="rounded border border-gold-700/40 bg-black/40 p-3">
              <p className="text-xs uppercase tracking-[0.25em] text-gold-300">
                {translate('metricsBusinesses')}
              </p>
              <p className="mt-2 text-gold-100">
                {translate('metricsTotal', { value: metrics.totals.businesses })}
              </p>
              <p>{translate('metricsActive', { value: metrics.totals.active })}</p>
              <p>{translate('metricsGrace', { value: metrics.totals.grace })}</p>
              <p>{translate('metricsExpired', { value: metrics.totals.expired })}</p>
              <p>{translate('metricsSuspended', { value: metrics.totals.suspended })}</p>
              <p>{translate('metricsUnderReview', { value: metrics.totals.underReview })}</p>
            </div>
            <div className="rounded border border-gold-700/40 bg-black/40 p-3">
              <p className="text-xs uppercase tracking-[0.25em] text-gold-300">
                {translate('metricsOfflineExports')}
              </p>
              <p className="mt-2 text-gold-100">
                {translate('metricsOfflineEnabled', {
                  value: metrics.totals.offlineEnabled,
                })}
              </p>
              <p>{translate('metricsOfflineFailures', { value: metrics.offlineFailures })}</p>
              <p>{translate('metricsExportsPending', { value: metrics.exports.pending })}</p>
            </div>
            <div className="rounded border border-gold-700/40 bg-black/40 p-3">
              <p className="text-xs uppercase tracking-[0.25em] text-gold-300">
                {translate('metricsApiHealth')}
              </p>
              <p className="mt-2 text-gold-100">
                {translate('metricsErrorRate', {
                  value: (metrics.api.errorRate * 100).toFixed(1),
                })}
              </p>
              <p>{translate('metricsAvgLatency', { value: metrics.api.avgLatency })}</p>
            </div>
          </div>
          {chartData ? (
            <div className="rounded border border-gold-700/40 bg-black/40 p-4">
              <Line
                data={chartData}
                options={{
                  responsive: true,
                  scales: {
                    y: { position: 'left', ticks: { color: '#f6e4b5' } },
                    y1: {
                      position: 'right',
                      ticks: { color: '#f6e4b5' },
                      grid: { drawOnChartArea: false },
                    },
                    x: { ticks: { color: '#f6e4b5' } },
                  },
                  plugins: {
                    legend: { labels: { color: '#f6e4b5' } },
                  },
                }}
              />
            </div>
          ) : null}
          <div className="grid gap-3 text-xs text-gold-300 md:grid-cols-2">
            <div className="rounded border border-gold-700/40 bg-black/40 p-3">
              <p className="text-gold-100">{translate('metricsSlowEndpoints')}</p>
              {metrics.api.slowEndpoints.map((endpoint) => (
                <p key={endpoint.path}>
                  {endpoint.path} • {endpoint.avgDurationMs}ms ({endpoint.count})
                </p>
              ))}
            </div>
            <div className="rounded border border-gold-700/40 bg-black/40 p-3">
              <p className="text-gold-100">{translate('metricsStorageLeaders')}</p>
              {metrics.storage.topBusinesses.map((row) => (
                <p key={row.businessId}>
                  {row.name} • {row.sizeMb.toFixed(1)}MB
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gold-300">{translate('metricsUnavailable')}</p>
      )}
    </section>
  );
}
