'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';

export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export type Dependency = {
  key: string;
  label: string;
  status: HealthStatus;
  detail: Record<string, unknown>;
};

export type SlowEndpoint = {
  path: string;
  avgDurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  count: number;
  errorRate: number;
};

export type HealthMatrixData = {
  generatedAt: string;
  window: { start: string; end: string };
  dependencies: Dependency[];
  rollups: {
    healthy: number;
    warning: number;
    critical: number;
    overallStatus: HealthStatus;
  };
  telemetry: {
    api: {
      totalRequests: number;
      errorRate: number;
      avgLatencyMs: number;
      p95LatencyMs: number;
      p99LatencyMs: number;
      leaders: SlowEndpoint[];
    };
    syncRisk: {
      score: number;
      status: HealthStatus;
      failedActions24h: number;
      failedActions7d: number;
      staleActiveDevices: number;
      revokedDevices: number;
    };
    queuePressure: {
      score: number;
      status: HealthStatus;
      totalPending: number;
      exportsPending: number;
      supportPending: number;
      subscriptionsPending: number;
      exportsFailed: number;
    };
  };
  pressure: {
    underReviewBusinesses: number;
  };
};

export type MetricsSeriesPoint = {
  label: string;
  errorRate: number;
  avgLatency: number;
  offlineFailed: number;
  exportsPending: number;
};

export type MetricsData = {
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
    totalRequests: number;
    errorRate: number;
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
    slowEndpoints: SlowEndpoint[];
  };
  series: MetricsSeriesPoint[];
  range: { start: string; end: string };
  timestamp: string;
};

export type MetricsRangeKey = '24h' | '7d' | '30d' | 'custom';

export function useHealthMatrix() {
  const [matrix, setMatrix] = useState<HealthMatrixData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<MetricsRangeKey>('24h');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadMatrix = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const data = await apiFetch<HealthMatrixData>(
        '/platform/health/matrix',
        { token },
      );
      if (mountedRef.current) setMatrix(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load health matrix'));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    setIsLoadingMetrics(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (range === 'custom') {
        params.set('range', 'custom');
        if (customFrom) params.set('from', customFrom);
        if (customTo) params.set('to', customTo);
      } else {
        params.set('range', range);
      }
      const data = await apiFetch<MetricsData>(
        `/platform/metrics?${params.toString()}`,
        { token },
      );
      if (mountedRef.current) setMetrics(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load metrics'));
    } finally {
      if (mountedRef.current) setIsLoadingMetrics(false);
    }
  }, [range, customFrom, customTo]);

  // Auto-load on mount + whenever range changes (bug fix #3 —
  // previously clicking preset buttons set state but never triggered fetch)
  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const refreshAll = useCallback(() => {
    loadMatrix();
    loadMetrics();
  }, [loadMatrix, loadMetrics]);

  return {
    matrix,
    metrics,
    isLoading,
    isLoadingMetrics,
    error,
    setError,
    range,
    setRange,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    refreshAll,
  };
}
