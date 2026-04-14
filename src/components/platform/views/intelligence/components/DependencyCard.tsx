'use client';

import { useState } from 'react';
import {
  Server,
  Cloud,
  Package,
  LifeBuoy,
  CreditCard,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { RingGauge } from '@/components/RingGauge';
import type {
  Dependency,
  HealthStatus,
} from '../hooks/useHealthMatrix';

type Props = {
  dependency: Dependency;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const STATUS_BORDER: Record<HealthStatus, string> = {
  HEALTHY: 'border-emerald-500/25',
  WARNING: 'border-amber-500/30',
  CRITICAL: 'border-red-500/40',
};

const STATUS_DOT: Record<HealthStatus, string> = {
  HEALTHY: 'bg-emerald-400',
  WARNING: 'bg-amber-400',
  CRITICAL: 'bg-red-400 animate-pulse',
};

const STATUS_BG: Record<HealthStatus, string> = {
  HEALTHY: 'bg-emerald-500/5',
  WARNING: 'bg-amber-500/5',
  CRITICAL: 'bg-red-500/5',
};

const DEP_ICONS: Record<string, typeof Server> = {
  api: Server,
  offline: Cloud,
  exports: Package,
  support: LifeBuoy,
  subscriptions: CreditCard,
};

export function DependencyCard({ dependency, t }: Props) {
  const [expanded, setExpanded] = useState(false);
  const Icon = DEP_ICONS[dependency.key] ?? Server;
  const detail = dependency.detail as Record<string, number | unknown>;

  return (
    <Card
      padding="md"
      className={`nvi-slide-in-bottom border ${STATUS_BORDER[dependency.status]} ${STATUS_BG[dependency.status]}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
            <Icon size={14} className="text-[var(--pt-text-1)]" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[var(--pt-text-1)]">
              {dependency.label}
            </h3>
            <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
              {t(`dependencyStatus.${dependency.status}`)}
            </p>
          </div>
        </div>
        <span
          className={`h-2 w-2 rounded-full ${STATUS_DOT[dependency.status]}`}
        />
      </div>

      {/* Per-dependency content */}
      <div className="mt-3">
        {dependency.key === 'api' && (
          <div className="flex items-center gap-3">
            <RingGauge
              value={Math.round(((detail.errorRate as number) ?? 0) * 10000) / 100}
              max={10}
              size={56}
              color={
                dependency.status === 'CRITICAL'
                  ? 'var(--pt-danger, #e05252)'
                  : dependency.status === 'WARNING'
                    ? 'var(--pt-warning, #e09a2a)'
                    : 'var(--pt-accent, #c9a84c)'
              }
              label={`${(((detail.errorRate as number) ?? 0) * 100).toFixed(2)}%`}
            />
            <div className="flex-1 space-y-0.5 text-[10px]">
              <p className="text-[var(--pt-text-muted)]">
                {t('dependencyAvgLatency')}:{' '}
                <span className="font-semibold text-[var(--pt-text-1)]">
                  {Number(detail.avgLatencyMs ?? 0)}ms
                </span>
              </p>
              <p className="text-[var(--pt-text-muted)]">
                p95:{' '}
                <span className="font-semibold text-[var(--pt-text-1)]">
                  {Number(detail.p95LatencyMs ?? 0)}ms
                </span>
              </p>
              <p className="text-[var(--pt-text-muted)]">
                p99:{' '}
                <span className="font-semibold text-[var(--pt-text-1)]">
                  {Number(detail.p99LatencyMs ?? 0)}ms
                </span>
              </p>
            </div>
          </div>
        )}

        {dependency.key === 'offline' && (
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <p className="text-[var(--pt-text-muted)]">
                {t('dependencyFailed24h')}
              </p>
              <p className="text-sm font-bold text-[var(--pt-text-1)]">
                {Number(detail.failedActions24h ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[var(--pt-text-muted)]">
                {t('dependencyFailed7d')}
              </p>
              <p className="text-sm font-bold text-[var(--pt-text-1)]">
                {Number(detail.failedActions7d ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[var(--pt-text-muted)]">
                {t('dependencyStaleDevices')}
              </p>
              <p className="text-sm font-bold text-[var(--pt-text-1)]">
                {Number(detail.staleActiveDevices ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[var(--pt-text-muted)]">
                {t('dependencyRevokedDevices')}
              </p>
              <p className="text-sm font-bold text-[var(--pt-text-1)]">
                {Number(detail.revokedDevices ?? 0)}
              </p>
            </div>
          </div>
        )}

        {(dependency.key === 'exports' ||
          dependency.key === 'support' ||
          dependency.key === 'subscriptions') && (
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
              {t('dependencyPending')}
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--pt-text-1)]">
              {Number(detail.pending ?? 0)}
            </p>
          </div>
        )}
      </div>

      {/* Expand: raw detail preview (formatted, not JSON dump) */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mt-2 inline-flex items-center gap-0.5 text-[9px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
      >
        {expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
        {expanded ? t('dependencyLess') : t('dependencyMore')}
      </button>
      {expanded && (
        <div className="mt-1.5 rounded-md border border-white/[0.04] bg-white/[0.02] p-1.5 text-[9px] text-[var(--pt-text-2)] font-mono">
          {Object.entries(detail)
            .filter(([, v]) => typeof v !== 'object')
            .map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-[var(--pt-text-muted)]">{k}:</span>
                <span>{String(v ?? '—')}</span>
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}
