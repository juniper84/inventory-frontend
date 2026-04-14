'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';
import { usePlatformEventStream } from '@/components/platform/hooks/usePlatformEventStream';
import type { OverviewSnapshot } from '@/components/platform/types';

export type SystemStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export type AttentionFlag = {
  key: string;
  active: boolean;
  count: number;
  severity: 'critical' | 'warning';
  href: string;
};

export function useOverviewDashboard() {
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mountedRef = useRef(true);

  // Tick every 30s so the stale indicator color shifts as time passes
  useEffect(() => {
    const interval = setInterval(() => {
      if (mountedRef.current) setNow(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadSnapshot = useCallback(async () => {
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const data = await apiFetch<OverviewSnapshot>('/platform/overview/snapshot?range=24h', { token });
      if (mountedRef.current) {
        setSnapshot(data);
        setLastRefreshed(new Date());
      }
    } catch {
      // Silently fail — stale indicator will show outdated data
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  // Auto-load on mount
  useEffect(() => {
    mountedRef.current = true;
    loadSnapshot();
    return () => { mountedRef.current = false; };
  }, [loadSnapshot]);

  // SSE — refresh snapshot on relevant events
  usePlatformEventStream({
    onSubscriptionRequestCreated: () => loadSnapshot(),
    onIncidentCreated: () => loadSnapshot(),
    onIncidentTransitioned: () => loadSnapshot(),
    onExportFailed: () => loadSnapshot(),
    onBusinessReviewFlagged: () => loadSnapshot(),
  });

  // ── Derived state ──

  const kpis = snapshot?.kpis ?? null;
  const anomalies = snapshot?.anomalies ?? null;
  const distributions = snapshot?.distributions ?? null;
  const signals = snapshot?.signals ?? null;
  const queues = snapshot?.queues ?? null;
  const activity = snapshot?.activity ?? [];
  const series = snapshot?.series ?? [];

  // Attention flags
  const attentionFlags = useMemo<AttentionFlag[]>(() => {
    if (!kpis || !anomalies || !signals) return [];
    return [
      {
        key: 'underReview',
        active: kpis.underReview > 0,
        count: kpis.underReview,
        severity: 'warning' as const,
        href: '/platform/businesses',
      },
      {
        key: 'offlineFailures',
        active: anomalies.offlineFailures > 0,
        count: anomalies.offlineFailures,
        severity: 'critical' as const,
        href: '/platform/intelligence',
      },
      {
        key: 'exportsPending',
        active: anomalies.exportsPending > 0,
        count: anomalies.exportsPending,
        severity: 'warning' as const,
        href: '/platform/operations',
      },
      {
        key: 'apiErrorRate',
        active: anomalies.apiErrorRate > 0.05,
        count: Math.round(anomalies.apiErrorRate * 100),
        severity: 'critical' as const,
        href: '/platform/intelligence',
      },
      {
        key: 'queuePressure',
        active: signals.queuePressureTotal > 5,
        count: signals.queuePressureTotal,
        severity: 'warning' as const,
        href: '/platform/operations',
      },
      {
        key: 'exportsFailed',
        active: signals.exportsFailed > 0,
        count: signals.exportsFailed,
        severity: 'critical' as const,
        href: '/platform/operations',
      },
      {
        key: 'activeAnnouncements',
        active: (anomalies.activeAnnouncements ?? 0) > 0,
        count: anomalies.activeAnnouncements ?? 0,
        severity: 'warning' as const,
        href: '/platform/announcements',
      },
    ];
  }, [kpis, anomalies, signals]);

  const activeFlags = attentionFlags.filter((f) => f.active);
  const inactiveCount = attentionFlags.filter((f) => !f.active).length;

  // System status — aggregated from flags
  const systemStatus = useMemo<SystemStatus>(() => {
    if (activeFlags.some((f) => f.severity === 'critical')) return 'CRITICAL';
    if (activeFlags.length > 0) return 'WARNING';
    return 'HEALTHY';
  }, [activeFlags]);

  // Stale indicator — recomputes as `now` ticks every 30s
  const staleMinutes = useMemo(() => {
    if (!lastRefreshed) return null;
    return Math.floor((now - lastRefreshed.getTime()) / 60000);
  }, [lastRefreshed, now]);

  // Sparkline data from series (error rate)
  const sparklineData = useMemo(() => {
    if (!series.length) return [];
    const last7 = series.slice(-7);
    return last7.map((s: { errorRate: number }) => s.errorRate);
  }, [series]);

  // Greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'greetingMorning';
    if (hour < 17) return 'greetingAfternoon';
    return 'greetingEvening';
  }, []);

  return {
    snapshot,
    isLoading,
    lastRefreshed,
    staleMinutes,
    loadSnapshot,
    // KPIs & data
    kpis,
    anomalies,
    distributions,
    signals,
    queues,
    activity,
    series,
    // Derived
    systemStatus,
    attentionFlags,
    activeFlags,
    inactiveCount,
    sparklineData,
    greeting,
  };
}
