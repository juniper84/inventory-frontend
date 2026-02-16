import { useCallback, useMemo } from 'react';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

type BusinessRiskSeed = {
  underReview?: boolean | null;
  status: string;
};

type MetricsSeed = {
  series: {
    label: string;
    errorRate: number;
    avgLatency: number;
    offlineFailed: number;
    exportsPending: number;
  }[];
};

type QueueSummaryPayloadSeed = {
  support: { total: number; byStatus: Record<string, number> };
  exports: { total: number; byStatus: Record<string, number> };
  subscriptions: { total: number; byStatus: Record<string, number> };
};

type OverviewSnapshotSeed = {
  queues: QueueSummaryPayloadSeed;
};

type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED' | 'CLOSED';

export function usePlatformConsolePresentation({
  t,
  metrics,
  businessTrendRange,
  queuesSummary,
  overviewSnapshot,
}: {
  t: Translate;
  metrics: MetricsSeed | null;
  businessTrendRange: '7d' | '30d';
  queuesSummary: QueueSummaryPayloadSeed | null;
  overviewSnapshot: OverviewSnapshotSeed | null;
}) {
  const formatDateLabel = useCallback(
    (value?: string | null) => {
      if (!value) {
        return t('notAvailable');
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return t('notAvailable');
      }
      return parsed.toLocaleDateString();
    },
    [t],
  );

  const getDaysRemaining = useCallback((value?: string | null) => {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    const diff = Math.ceil((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, []);

  const getBusinessRiskScore = useCallback((business: BusinessRiskSeed) => {
    let score = 15;
    if (business.underReview) score += 35;
    if (business.status === 'SUSPENDED') score += 35;
    if (business.status === 'GRACE') score += 20;
    if (business.status === 'EXPIRED') score += 30;
    if (business.status === 'ARCHIVED') score += 10;
    if (business.status === 'DELETED') score += 20;
    return Math.min(100, score);
  }, []);

  const businessTrendSeries = useMemo(() => {
    if (!metrics?.series?.length) {
      return [];
    }
    const points = businessTrendRange === '7d' ? 7 : 30;
    return metrics.series.slice(-points);
  }, [businessTrendRange, metrics]);

  const chartData = useMemo(() => {
    if (!metrics) {
      return null;
    }
    const labels = metrics.series.map((point) => point.label);
    return {
      labels,
      datasets: [
        {
          label: t('chartErrorRate'),
          data: metrics.series.map((point) => point.errorRate * 100),
          borderColor: '#d97706',
          backgroundColor: 'rgba(217, 119, 6, 0.3)',
          yAxisID: 'y',
        },
        {
          label: t('chartAvgLatency'),
          data: metrics.series.map((point) => point.avgLatency),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.2)',
          yAxisID: 'y1',
        },
      ],
    };
  }, [metrics, t]);

  const healthStatusLabel = useCallback(
    (status: 'HEALTHY' | 'WARNING' | 'CRITICAL') => {
      if (status === 'CRITICAL') return t('healthStatusCritical');
      if (status === 'WARNING') return t('healthStatusWarning');
      return t('healthStatusHealthy');
    },
    [t],
  );

  const incidentLaneDefs = useMemo(
    () => [
      { key: 'OPEN' as const, label: t('incidentStatusOpen') },
      { key: 'INVESTIGATING' as const, label: t('incidentStatusInvestigating') },
      { key: 'MITIGATED' as const, label: t('incidentStatusMitigated') },
      { key: 'RESOLVED' as const, label: t('incidentStatusResolved') },
      { key: 'CLOSED' as const, label: t('incidentStatusClosed') },
    ],
    [t],
  );

  const incidentStatusLabel = useCallback(
    (status: IncidentStatus) => {
      if (status === 'OPEN') return t('incidentStatusOpen');
      if (status === 'INVESTIGATING') return t('incidentStatusInvestigating');
      if (status === 'MITIGATED') return t('incidentStatusMitigated');
      if (status === 'RESOLVED') return t('incidentStatusResolved');
      return t('incidentStatusClosed');
    },
    [t],
  );

  const nextIncidentStatus = useCallback((status: IncidentStatus): IncidentStatus | null => {
    if (status === 'OPEN') return 'INVESTIGATING';
    if (status === 'INVESTIGATING') return 'MITIGATED';
    if (status === 'MITIGATED') return 'RESOLVED';
    if (status === 'RESOLVED') return 'CLOSED';
    return null;
  }, []);

  const overviewQueues = useMemo(
    () => queuesSummary ?? overviewSnapshot?.queues ?? null,
    [queuesSummary, overviewSnapshot],
  );

  const queueStatusLabel = useCallback(
    (status: string) => {
      if (status === 'PENDING') return t('statusPending');
      if (status === 'RUNNING') return t('statusRunning');
      if (status === 'FAILED') return t('statusFailed');
      if (status === 'COMPLETED') return t('statusCompleted');
      if (status === 'CANCELED') return t('statusCanceled');
      if (status === 'APPROVED') return t('statusApproved');
      if (status === 'REJECTED') return t('statusRejected');
      if (status === 'EXPIRED') return t('statusExpired');
      return status;
    },
    [t],
  );

  return {
    formatDateLabel,
    getDaysRemaining,
    getBusinessRiskScore,
    businessTrendSeries,
    chartData,
    healthStatusLabel,
    incidentLaneDefs,
    incidentStatusLabel,
    nextIncidentStatus,
    overviewQueues,
    queueStatusLabel,
  };
}
