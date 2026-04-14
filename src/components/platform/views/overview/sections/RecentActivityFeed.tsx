'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';

type ActivityEntry = {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string | Date;
};

type Props = {
  activity: ActivityEntry[];
};

const TONE: Record<string, string> = {
  PURGE: 'text-red-400 bg-red-500/10',
  DELETE: 'text-red-400 bg-red-500/10',
  SUSPEND: 'text-red-400 bg-red-500/10',
  REJECT: 'text-red-400 bg-red-500/10',
  CREATE: 'text-emerald-400 bg-emerald-500/10',
  APPROVE: 'text-emerald-400 bg-emerald-500/10',
  RESTORE: 'text-emerald-400 bg-emerald-500/10',
  ACTIVATE: 'text-blue-400 bg-blue-500/10',
};

function getActionTone(action: string): string {
  for (const [key, value] of Object.entries(TONE)) {
    if (action.toUpperCase().includes(key)) return value;
  }
  return 'text-[var(--pt-accent)] bg-[var(--pt-accent-dim)]';
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function relativeTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const RESOURCE_GLYPH: Record<string, string> = {
  BUSINESS: 'B',
  SUBSCRIPTION: 'S',
  SUPPORT: 'U',
  SUPPORT_REQUEST: 'U',
  EXPORT: 'E',
  EXPORT_JOB: 'E',
  INCIDENT: 'I',
  DEVICE: 'D',
  ANNOUNCEMENT: 'A',
};

function getResourceLink(resourceType: string, resourceId: string, businessId: string | null, locale: string): string | null {
  const type = resourceType?.toUpperCase();
  if (type === 'BUSINESS' && resourceId) return `/${locale}/platform/businesses/${resourceId}`;
  if (businessId) return `/${locale}/platform/businesses/${businessId}`;
  if (type === 'INCIDENT') return `/${locale}/platform/operations`;
  if (type === 'EXPORT' || type === 'EXPORT_JOB') return `/${locale}/platform/operations`;
  if (type === 'SUPPORT' || type === 'SUPPORT_REQUEST') return `/${locale}/platform/access`;
  if (type === 'SUBSCRIPTION') return `/${locale}/platform/businesses`;
  if (type === 'ANNOUNCEMENT') return `/${locale}/platform/announcements`;
  return null;
}

export function RecentActivityFeed({ activity }: Props) {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();

  const items = activity.slice(0, 10);

  return (
    <Card padding="lg" className="nvi-slide-in-bottom">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-muted)]">
        {t('overviewActivityTitle')}
      </p>

      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-[var(--pt-text-muted)]">{t('overviewActivityEmpty')}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((entry) => {
            const tone = getActionTone(entry.action);
            const glyph = RESOURCE_GLYPH[entry.resourceType?.toUpperCase()] ?? 'P';
            const businessIdFromMeta = (entry.metadata as Record<string, string> | null)?.businessId ?? null;
            const link = entry.resourceId ? getResourceLink(entry.resourceType, entry.resourceId, businessIdFromMeta, params.locale) : null;
            const labelText = entry.resourceId
              ? `${entry.resourceType}: ${entry.resourceId.slice(0, 8)}…`
              : entry.resourceType;

            return (
              <div key={entry.id} className="flex items-start gap-2.5 text-xs">
                {/* Glyph badge */}
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold ${tone}`}>
                  {glyph}
                </span>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="text-[var(--pt-text-1)] leading-snug">
                    {formatAction(entry.action)}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    {link ? (
                      <Link
                        href={link}
                        className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-[var(--pt-accent)] hover:underline transition"
                      >
                        {labelText}
                      </Link>
                    ) : entry.resourceId ? (
                      <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-[var(--pt-text-muted)]">
                        {labelText}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Time */}
                <span className="shrink-0 text-[10px] text-[var(--pt-text-muted)] tabular-nums">
                  {relativeTime(entry.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Link
        href={`/${params.locale}/platform/intelligence`}
        className="mt-3 flex items-center justify-center gap-1 text-[10px] text-[var(--pt-accent)] hover:underline nvi-press"
      >
        {t('overviewActivityViewAll')} <ArrowRight size={10} />
      </Link>
    </Card>
  );
}
