import { useMemo, useState } from 'react';
import { Spinner } from '@/components/Spinner';

type PlatformAuditLog = {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  platformAdminId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type ActivityGroup = {
  key: string;
  label: string;
  items: PlatformAuditLog[];
};

function formatActionLabel(action: string) {
  const overrides: Record<string, string> = {
    BUSINESS_STATUS_UPDATE: 'Business status update',
    BUSINESS_PURGE: 'Business purged',
    READ_ONLY_UPDATE: 'Read-only updated',
    SUBSCRIPTION_UPDATE: 'Subscription updated',
    SUPPORT_REQUEST_CREATE: 'Support request created',
    EXPORT_JOB_CANCEL: 'Export canceled',
    EXPORT_JOB_RETRY: 'Export retried',
    EXPORT_JOB_REQUEUE: 'Export requeued',
    INCIDENT_CREATE: 'Incident created',
    INCIDENT_TRANSITION: 'Incident transitioned',
    INCIDENT_NOTE_ADD: 'Incident note added',
  };
  if (overrides[action]) return overrides[action];
  return action
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatResourceLabel(resourceType: string) {
  return resourceType
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getEventTone(action: string) {
  if (/(PURGE|DELETE|FORCE_LOGOUT|SUSPEND|REVOKE)/.test(action)) return 'critical';
  if (/(READ_ONLY|GRACE|EXPIRED|ARCHIVE|RISK|FAILED|REJECT)/.test(action)) return 'warning';
  if (/(CREATE|APPROVE|RESTORE|RESOLVE|COMPLETE|DELIVER|ACTIVE|UPDATE)/.test(action))
    return 'positive';
  return 'neutral';
}

function getResourceGlyph(resourceType: string) {
  const normalized = resourceType.toLowerCase();
  if (normalized.includes('business')) return 'B';
  if (normalized.includes('subscription')) return 'S';
  if (normalized.includes('support')) return 'U';
  if (normalized.includes('export')) return 'E';
  if (normalized.includes('incident')) return 'I';
  if (normalized.includes('audit')) return 'A';
  if (normalized.includes('device')) return 'D';
  return 'P';
}

function readString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function createGroups(
  logs: PlatformAuditLog[],
  translate: (key: string, values?: Record<string, string | number>) => string,
  locale: string,
): ActivityGroup[] {
  const today = new Date();
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const yesterdayKey = todayKey - 24 * 60 * 60 * 1000;
  const grouped = new Map<string, ActivityGroup>();

  logs.forEach((log) => {
    const date = new Date(log.createdAt);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayKey = day.getTime();
    const key = day.toISOString().slice(0, 10);
    const label =
      dayKey === todayKey
        ? translate('activityGroupToday')
        : dayKey === yesterdayKey
          ? translate('activityGroupYesterday')
          : day.toLocaleDateString(locale, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
    const existing = grouped.get(key);
    if (existing) {
      existing.items.push(log);
      return;
    }
    grouped.set(key, { key, label, items: [log] });
  });

  return Array.from(grouped.values()).sort((a, b) => b.key.localeCompare(a.key));
}

function limitGroups(groups: ActivityGroup[], limit: number): ActivityGroup[] {
  if (limit <= 0) return [];
  let remaining = limit;
  const next: ActivityGroup[] = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    const slice = group.items.slice(0, remaining);
    if (slice.length) {
      next.push({ ...group, items: slice });
      remaining -= slice.length;
    }
  }
  return next;
}

export function PlatformActivitySection({
  t,
  show,
  locale,
  activityFeed,
  withAction,
  loadActivityFeed,
  actionLoading,
}: {
  t: unknown;
  show: boolean;
  locale: string;
  activityFeed: PlatformAuditLog[];
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  loadActivityFeed: () => Promise<void>;
  actionLoading: Record<string, boolean>;
}) {
  const translate = t as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const groups = createGroups(activityFeed, translate, locale);
  const [expanded, setExpanded] = useState(false);
  const MAX_VISIBLE = 10;
  const visibleGroups = useMemo(
    () => (expanded ? groups : limitGroups(groups, MAX_VISIBLE)),
    [expanded, groups],
  );
  const totalCount = activityFeed.length;
  const visibleCount = expanded ? totalCount : Math.min(totalCount, MAX_VISIBLE);

  if (!show) {
    return null;
  }

  return (
    <section className="command-card p-6 space-y-4 nvi-reveal">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">{translate('activityTitle')}</h3>
          <p className="text-xs uppercase tracking-[0.2em] text-gold-500">
            {translate('activitySubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => withAction('activity:refresh', loadActivityFeed)}
          className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
        >
          <span className="inline-flex items-center gap-2">
            {actionLoading['activity:refresh'] ? (
              <Spinner size="xs" variant="bars" />
            ) : null}
            {translate('refreshFeed')}
          </span>
        </button>
      </div>

      {totalCount ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gold-500">
          <p>{translate('activityShowing', { shown: visibleCount, total: totalCount })}</p>
          {totalCount > MAX_VISIBLE ? (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="rounded border border-gold-700/50 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-gold-200"
            >
              {expanded ? translate('activityShowLess') : translate('activityShowMore')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4 text-xs text-gold-300 nvi-stagger">
        {visibleGroups.map((group) => (
          <div key={group.key} className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.25em] text-gold-500">{group.label}</p>
            <div className="space-y-2">
              {group.items.map((log) => {
                const tone = getEventTone(log.action);
                const badgeClass =
                  tone === 'critical'
                    ? 'border-red-400/40 bg-red-500/15 text-red-200'
                    : tone === 'warning'
                      ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                      : tone === 'positive'
                        ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                        : 'border-gold-700/60 bg-gold-500/10 text-gold-100';
                const resourceName = readString(log.metadata, 'resourceName');
                const status = readString(log.metadata, 'status');
                const tier = readString(log.metadata, 'tier');
                const businessId = readString(log.metadata, 'businessId');

                return (
                  <div
                    key={log.id}
                    className="rounded border border-gold-700/40 bg-black/40 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded border text-[11px] font-semibold ${badgeClass}`}>
                          {getResourceGlyph(log.resourceType)}
                        </span>
                        <div>
                          <p className="text-sm text-gold-100">
                            {formatActionLabel(log.action)}
                          </p>
                          <p className="text-[11px] text-gold-400">
                            {formatResourceLabel(log.resourceType)}
                            {resourceName ? ` • ${resourceName}` : ''}
                          </p>
                        </div>
                      </div>
                      <p className="text-[11px] text-gold-500">
                        {new Date(log.createdAt).toLocaleTimeString(locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {log.resourceId ? (
                        <span className="rounded border border-gold-700/50 px-2 py-0.5">
                          {translate('activityResourceId', { value: log.resourceId })}
                        </span>
                      ) : null}
                      {businessId ? (
                        <span className="rounded border border-gold-700/50 px-2 py-0.5">
                          {translate('activityBusinessId', { value: businessId })}
                        </span>
                      ) : null}
                      {status ? (
                        <span className="rounded border border-gold-700/50 px-2 py-0.5">
                          {translate('activityStatus', { value: status })}
                        </span>
                      ) : null}
                      {tier ? (
                        <span className="rounded border border-gold-700/50 px-2 py-0.5">
                          {translate('activityTier', { value: tier })}
                        </span>
                      ) : null}
                      {log.platformAdminId ? (
                        <span className="rounded border border-gold-700/50 px-2 py-0.5">
                          {translate('activityOperator', { value: log.platformAdminId })}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-[11px] text-gold-300">
                      {log.reason
                        ? translate('reasonLabel', { reason: log.reason })
                        : translate('activityReasonEmpty')}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!visibleGroups.length ? (
          <p className="text-gold-400">{translate('noActivity')}</p>
        ) : null}
      </div>
    </section>
  );
}
