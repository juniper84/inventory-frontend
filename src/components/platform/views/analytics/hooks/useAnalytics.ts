'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';

export type RangeKey = '7d' | '30d' | '90d' | '12m' | 'custom';

export type RevenueData = {
  mrr: number;
  arr: number;
  byTier: Record<string, number>;
  monthly: { month: string; collected: number; estimated: number }[];
  totalSubscribers: number;
  paidSubscribers: number;
  paidCount: number;
  complimentaryCount: number;
  totalCollected: number;
  generatedAt: string;
};

export type CohortsData = {
  cohorts: {
    month: string;
    count: number;
    byTier: Record<string, number>;
    active: number;
  }[];
  generatedAt: string;
};

export type ChurnData = {
  range: string;
  churnRate: number;
  churnedCount: number;
  monthlyChurn: { month: string; count: number; rate: number }[];
  recentlyChurned: {
    businessId: string;
    name: string;
    status: string;
    tier: string;
    churnedAt: string;
  }[];
  generatedAt: string;
};

export type ConversionsData = {
  conversionRate: number;
  totalConversions: number;
  totalTrialBusinesses: number;
  avgTrialDays: number | null;
  medianTrialDays: number | null;
  trialDurationDistribution: number[];
  funnel: {
    trialStarted: number;
    converted: number;
    dropOff: number;
  };
  monthlyConversions: {
    month: string;
    conversions: number;
    trialsStarted: number;
  }[];
  generatedAt: string;
};

export type PurchaseItem = {
  id: string;
  businessId: string;
  tier: string;
  months: number;
  durationDays: number;
  startsAt: string;
  expiresAt: string;
  isPaid: boolean;
  amountDue: number;
  reason: string | null;
  createdAt: string;
  business?: { name: string };
  platformAdmin?: { id: string; email: string };
};

export type PurchasesResponse = {
  items: PurchaseItem[];
  nextCursor?: string | null;
  summary: {
    totalPurchases: number;
    totalCollected: number;
    paidCount: number;
    complimentaryCount: number;
  };
};

export type PurchaseFilters = {
  isPaid: 'all' | 'paid' | 'complimentary';
  tier: string;
  from: string;
  to: string;
};

const INITIAL_PURCHASE_FILTERS: PurchaseFilters = {
  isPaid: 'all',
  tier: '',
  from: '',
  to: '',
};

export function useAnalytics() {
  const [range, setRange] = useState<RangeKey>('30d');

  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [cohorts, setCohorts] = useState<CohortsData | null>(null);
  const [churn, setChurn] = useState<ChurnData | null>(null);
  const [conversions, setConversions] = useState<ConversionsData | null>(null);

  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [purchaseSummary, setPurchaseSummary] = useState<
    PurchasesResponse['summary'] | null
  >(null);
  const [purchaseFilters, setPurchaseFilters] = useState<PurchaseFilters>(
    INITIAL_PURCHASE_FILTERS,
  );
  const [appliedPurchaseFilters, setAppliedPurchaseFilters] =
    useState<PurchaseFilters>(INITIAL_PURCHASE_FILTERS);
  const [purchaseCursorStack, setPurchaseCursorStack] = useState<
    (string | null)[]
  >([null]);
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchaseNextCursor, setPurchaseNextCursor] = useState<string | null>(
    null,
  );

  const [isLoadingRevenue, setIsLoadingRevenue] = useState(false);
  const [isLoadingCohorts, setIsLoadingCohorts] = useState(false);
  const [isLoadingChurn, setIsLoadingChurn] = useState(false);
  const [isLoadingConversions, setIsLoadingConversions] = useState(false);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const rangeParam = range === '12m' ? '90d' : range === 'custom' ? '30d' : range;

  const loadRevenue = useCallback(async () => {
    setIsLoadingRevenue(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const data = await apiFetch<RevenueData>(
        `/platform/analytics/revenue?range=${rangeParam}`,
        { token },
      );
      if (mountedRef.current) setRevenue(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load revenue'));
    } finally {
      if (mountedRef.current) setIsLoadingRevenue(false);
    }
  }, [rangeParam]);

  const loadCohorts = useCallback(async () => {
    setIsLoadingCohorts(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const data = await apiFetch<CohortsData>(
        '/platform/analytics/cohorts',
        { token },
      );
      if (mountedRef.current) setCohorts(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load cohorts'));
    } finally {
      if (mountedRef.current) setIsLoadingCohorts(false);
    }
  }, []);

  const loadChurn = useCallback(async () => {
    setIsLoadingChurn(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const data = await apiFetch<ChurnData>(
        `/platform/analytics/churn?range=${rangeParam}`,
        { token },
      );
      if (mountedRef.current) setChurn(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load churn'));
    } finally {
      if (mountedRef.current) setIsLoadingChurn(false);
    }
  }, [rangeParam]);

  const loadConversions = useCallback(async () => {
    setIsLoadingConversions(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const data = await apiFetch<ConversionsData>(
        '/platform/analytics/conversions',
        { token },
      );
      if (mountedRef.current) setConversions(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load conversions'));
    } finally {
      if (mountedRef.current) setIsLoadingConversions(false);
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    setIsLoadingPurchases(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      const params = new URLSearchParams({ limit: '20' });
      const cursor =
        purchaseCursorStack[purchaseCursorStack.length - 1] ?? null;
      if (cursor) params.set('cursor', cursor);
      if (appliedPurchaseFilters.isPaid !== 'all') {
        params.set(
          'isPaid',
          appliedPurchaseFilters.isPaid === 'paid' ? 'true' : 'false',
        );
      }
      if (appliedPurchaseFilters.tier)
        params.set('tier', appliedPurchaseFilters.tier);
      if (appliedPurchaseFilters.from)
        params.set('from', appliedPurchaseFilters.from);
      if (appliedPurchaseFilters.to)
        params.set('to', appliedPurchaseFilters.to);
      const data = await apiFetch<PurchasesResponse>(
        `/platform/analytics/purchases?${params.toString()}`,
        { token },
      );
      if (!mountedRef.current) return;
      setPurchases(data.items ?? []);
      setPurchaseSummary(data.summary ?? null);
      setPurchaseNextCursor(data.nextCursor ?? null);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load purchases'));
    } finally {
      if (mountedRef.current) setIsLoadingPurchases(false);
    }
  }, [purchaseCursorStack, appliedPurchaseFilters]);

  // Auto-load all tabs on mount / when range changes
  useEffect(() => {
    loadRevenue();
    loadCohorts();
    loadChurn();
    loadConversions();
  }, [loadRevenue, loadCohorts, loadChurn, loadConversions]);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  const refreshAll = useCallback(() => {
    loadRevenue();
    loadCohorts();
    loadChurn();
    loadConversions();
    loadPurchases();
  }, [loadRevenue, loadCohorts, loadChurn, loadConversions, loadPurchases]);

  const applyPurchaseFilters = useCallback(() => {
    setPurchaseCursorStack([null]);
    setPurchasePage(1);
    setAppliedPurchaseFilters(purchaseFilters);
  }, [purchaseFilters]);

  const resetPurchaseFilters = useCallback(() => {
    setPurchaseFilters(INITIAL_PURCHASE_FILTERS);
    setAppliedPurchaseFilters(INITIAL_PURCHASE_FILTERS);
    setPurchaseCursorStack([null]);
    setPurchasePage(1);
  }, []);

  const nextPurchasePage = useCallback(() => {
    if (!purchaseNextCursor) return;
    setPurchaseCursorStack((prev) => [...prev, purchaseNextCursor]);
    setPurchasePage((p) => p + 1);
  }, [purchaseNextCursor]);

  const prevPurchasePage = useCallback(() => {
    setPurchaseCursorStack((prev) =>
      prev.length > 1 ? prev.slice(0, -1) : prev,
    );
    setPurchasePage((p) => Math.max(1, p - 1));
  }, []);

  return {
    range,
    setRange,
    revenue,
    cohorts,
    churn,
    conversions,
    isLoadingRevenue,
    isLoadingCohorts,
    isLoadingChurn,
    isLoadingConversions,
    error,
    setError,
    refreshAll,
    // Purchases
    purchases,
    purchaseSummary,
    isLoadingPurchases,
    purchaseFilters,
    setPurchaseFilters,
    applyPurchaseFilters,
    resetPurchaseFilters,
    purchasePage,
    hasNextPurchasePage: Boolean(purchaseNextCursor),
    hasPrevPurchasePage: purchasePage > 1,
    nextPurchasePage,
    prevPurchasePage,
  };
}
