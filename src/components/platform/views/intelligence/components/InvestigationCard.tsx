'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { Investigation } from '../hooks/useAuditInvestigations';

type Props = {
  investigation: Investigation;
  locale: string;
  formatDateTime: (date: Date | string | null | undefined) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
};

function relativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function outcomeColor(outcome: string): string {
  if (outcome === 'SUCCESS') return 'text-emerald-300';
  if (outcome === 'FAILURE') return 'text-red-300';
  return 'text-zinc-300';
}

export function InvestigationCard({
  investigation,
  locale,
  formatDateTime,
  t,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const success = investigation.outcomes.SUCCESS ?? 0;
  const failure = investigation.outcomes.FAILURE ?? 0;

  // Resource summary — groups actions by resourceType
  const resourceSummary = investigation.actions.reduce<Record<string, number>>(
    (acc, action) => {
      acc[action.resourceType] = (acc[action.resourceType] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <Card
      padding="md"
      className="nvi-slide-in-bottom hover:border-[var(--pt-accent-border)] transition"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/${locale}/platform/businesses/${investigation.businessId}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--pt-text-1)] hover:text-[var(--pt-accent)] transition"
          >
            {investigation.businessName ??
              investigation.businessId.slice(0, 8)}
            <ExternalLink size={11} className="opacity-60" />
          </Link>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--pt-text-2)]">
              {investigation.groupType}
            </span>
            <span className="text-[10px] text-[var(--pt-text-muted)]">
              {investigation.count} {t('investigationEvents')}
            </span>
          </div>
        </div>

        {/* Outcome badges */}
        <div className="flex items-center gap-1.5">
          {success > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
              <CheckCircle2 size={9} />
              {success}
            </span>
          )}
          {failure > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-300">
              <XCircle size={9} />
              {failure}
            </span>
          )}
        </div>
      </div>

      {/* Resource pills */}
      <div className="mt-2 flex flex-wrap gap-1">
        {Object.entries(resourceSummary).map(([resource, count]) => (
          <span
            key={resource}
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 text-[9px] text-[var(--pt-text-2)]"
          >
            <span>{resource}</span>
            <span className="text-[var(--pt-text-muted)]">{count}</span>
          </span>
        ))}
      </div>

      {/* Time range */}
      <p
        className="mt-1.5 text-[10px] text-[var(--pt-text-muted)]"
        title={`${formatDateTime(investigation.startedAt)} → ${formatDateTime(investigation.latestAt)}`}
      >
        {relativeTime(investigation.startedAt)} →{' '}
        {relativeTime(investigation.latestAt)}
      </p>

      {/* Evidence trail (expandable; shows all events — bug fix #12) */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mt-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
      >
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        {t('investigationEvidenceTrail')} ({investigation.actions.length})
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {investigation.actions.map((action) => (
            <div
              key={action.id}
              className="flex items-start gap-2 rounded-md bg-white/[0.02] px-2 py-1"
            >
              <span
                className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  action.outcome === 'SUCCESS'
                    ? 'bg-emerald-400'
                    : action.outcome === 'FAILURE'
                      ? 'bg-red-400'
                      : 'bg-zinc-400'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-[var(--pt-text-1)]">
                    {action.action}
                  </span>
                  <span
                    className={`text-[9px] font-semibold ${outcomeColor(action.outcome)}`}
                  >
                    {action.outcome}
                  </span>
                </div>
                <p className="text-[9px] text-[var(--pt-text-muted)]">
                  {action.resourceType}
                  {action.resourceId ? ` · ${action.resourceId.slice(0, 8)}` : ''}
                </p>
              </div>
              <span
                className="text-[9px] text-[var(--pt-text-muted)] shrink-0"
                title={formatDateTime(action.createdAt)}
              >
                {relativeTime(action.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
