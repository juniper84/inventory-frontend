/* ── Platform shared types ──
   Canonical type definitions for the platform admin console.
   Import from here instead of re-declaring in individual files. */

export type PlatformView =
  | 'overview'
  | 'businesses'
  | 'operations'
  | 'access'
  | 'announcements'
  | 'analytics'
  | 'intelligence';

export type Business = {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  lastActivityAt?: string | null;
  underReview?: boolean | null;
  reviewReason?: string | null;
  reviewSeverity?: string | null;
  subscription?: {
    tier: string;
    status: string;
    trialEndsAt?: string | null;
    graceEndsAt?: string | null;
    expiresAt?: string | null;
  } | null;
  settings?: {
    readOnlyEnabled?: boolean;
    readOnlyReason?: string | null;
  } | null;
  counts?: { branches: number; users: number; offlineDevices: number };
  systemOwner?: { name: string; email: string; phone: string | null } | null;
  healthScore?: number;
};

export type BusinessesCounts = {
  total: number;
  byStatus: Record<string, number>;
  underReview: number;
};

export type BusinessWorkspace = {
  business: {
    id: string;
    name: string;
    status: string;
    defaultLanguage?: string;
    underReview?: boolean | null;
    reviewReason?: string | null;
    reviewSeverity?: string | null;
    createdAt?: string;
    updatedAt?: string;
    lastActivityAt?: string | null;
  };
  subscription?: {
    tier?: string | null;
    status?: string | null;
    trialEndsAt?: string | null;
    graceEndsAt?: string | null;
    expiresAt?: string | null;
    createdAt?: string | null;
  } | null;
  settings?: {
    readOnlyEnabled?: boolean;
    readOnlyReason?: string | null;
    rateLimitOverride?: Record<string, unknown> | null;
    onboarding?: Record<string, unknown> | null;
    onboardingCompletedAt?: string | null;
  } | null;
  systemOwner?: { name: string; email: string; phone: string | null } | null;
  counts?: {
    branches: number;
    users: number;
    offlineDevices: number;
  };
  risk?: {
    subscriptionStatus?: string;
    offlineFailed?: number;
    exportsPending?: number;
    score?: number;
  } | null;
  queues?: {
    pendingSupport: number;
    pendingExports: number;
    pendingSubscriptionRequests: number;
  } | null;
  devices?: {
    id: string;
    deviceName?: string | null;
    status: string;
    userId?: string;
    createdAt?: string;
    lastSeenAt?: string | null;
    revokedAt?: string | null;
  }[];
  recentAdminActions?: {
    id: string;
    action: string;
    outcome: string;
    resourceType: string;
    resourceId?: string | null;
    reason?: string | null;
    createdAt: string;
  }[];
  generatedAt?: string;
};

export type PlatformBusinessNote = {
  id: string;
  businessId: string;
  platformAdminId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  platformAdmin?: { id: string; email: string } | null;
};

export type PlatformAuditLog = {
  id: string;
  action: string;
  platformAdminId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  action: string;
  outcome: string;
  resourceType: string;
  createdAt: string;
};

export type AuditInvestigation = {
  id: string;
  key: string;
  groupType: 'correlation' | 'request' | 'session' | 'entry';
  businessId: string;
  startedAt: string;
  latestAt: string;
  count: number;
  outcomes: Record<string, number>;
  actions: {
    id: string;
    action: string;
    outcome: string;
    resourceType: string;
    resourceId?: string | null;
    createdAt: string;
  }[];
  resourceSummary: {
    resourceType: string;
    resourceId?: string | null;
    count: number;
  }[];
  relatedPlatformActions: {
    id: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    reason?: string | null;
    createdAt: string;
    metadata?: Record<string, unknown> | null;
  }[];
};

export type Metrics = {
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
  series: {
    label: string;
    errorRate: number;
    avgLatency: number;
    offlineFailed: number;
    exportsPending: number;
  }[];
  range: { start: string; end: string };
  timestamp: string;
};

export type HealthMatrix = {
  generatedAt: string;
  window: { start: string; end: string };
  dependencies: {
    key: string;
    label: string;
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    detail: Record<string, unknown>;
  }[];
  rollups?: {
    healthy: number;
    warning: number;
    critical: number;
    overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  };
  telemetry?: {
    api?: {
      totalRequests: number;
      errorRate: number;
      avgLatencyMs: number;
      p95LatencyMs: number;
      p99LatencyMs: number;
      leaders: {
        path: string;
        avgDurationMs: number;
        p95DurationMs: number;
        p99DurationMs: number;
        count: number;
        errorRate: number;
      }[];
    };
    syncRisk?: {
      score: number;
      status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
      failedActions24h: number;
      failedActions7d: number;
      staleActiveDevices: number;
      revokedDevices: number;
    };
    queuePressure?: {
      score: number;
      status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
      totalPending: number;
      exportsPending: number;
      supportPending: number;
      subscriptionsPending: number;
      exportsFailed: number;
    };
  };
};

export type QueueSummary = {
  total: number;
  actionable: number;
  byStatus: Record<string, number>;
};

export type QueueSummaryPayload = {
  support: QueueSummary;
  exports: QueueSummary;
  subscriptions: QueueSummary;
};

export type OverviewSnapshot = {
  generatedAt: string;
  range?: { start: string; end: string };
  kpis: {
    businesses: number;
    activeBusinesses: number;
    underReview: number;
    offlineEnabled: number;
    totalStorageMb: number;
    totalUsers: number;
    activeUsers: number;
  };
  anomalies: {
    offlineFailures: number;
    exportsPending: number;
    apiErrorRate: number;
    apiAvgLatencyMs: number;
    activeAnnouncements: number;
  };
  distributions?: {
    tiers?: { tier: string; count: number }[];
    businessStatuses?: { status: string; count: number }[];
    underReview?: number;
    users?: {
      active: number;
      inactive: number;
      pending: number;
      total: number;
    };
  };
  signals?: {
    queuePressureTotal: number;
    exportsFailed: number;
    apiTotalRequests: number;
  };
  queues: QueueSummaryPayload;
  activity: {
    id: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
  }[];
  series?: {
    label: string;
    errorRate: number;
    avgLatency: number;
    offlineFailed: number;
    exportsPending: number;
  }[];
};
