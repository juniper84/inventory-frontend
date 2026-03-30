'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';
import { TypeaheadInput } from '@/components/TypeaheadInput';

type SelectOption = { value: string; label: string };

type PlatformAuditLog = {
  id: string;
  action: string;
  platformAdminId?: string | null;
  adminEmail?: string | null;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type AuditInvestigation = {
  id: string;
  groupType: string;
  businessId: string;
  startedAt: string;
  latestAt: string;
  count: number;
  outcomes: Record<string, number>;
  resourceSummary: { resourceType: string; resourceId?: string | null; count: number }[];
  actions: {
    id: string;
    action: string;
    outcome: string;
    resourceType: string;
    createdAt: string;
  }[];
  relatedPlatformActions: {
    id: string;
    action: string;
    resourceType: string;
    reason?: string | null;
    createdAt: string;
  }[];
};

type AuditTab = 'activity' | 'investigations';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function groupTypeLabel(type: string): string {
  switch (type) {
    case 'correlation': return 'Correlated session';
    case 'request': return 'Single request';
    case 'session': return 'User session';
    case 'entry': return 'Single action';
    default: return type;
  }
}

function actionCategory(action: string): 'danger' | 'warning' | 'success' | 'info' | 'neutral' {
  if (/PURGE|DELETE|REVOKE|FORCE_LOGOUT|ARCHIVE/.test(action)) return 'danger';
  if (/SUSPEND|READ_ONLY|RATE_LIMIT|FLAG|REVIEW/.test(action)) return 'warning';
  if (/CREATE|PROVISION|RESTORE|ACTIVATE|APPROVE/.test(action)) return 'success';
  if (/UPDATE|CHANGE|EDIT|PATCH|PURCHASE|RECORD/.test(action)) return 'info';
  return 'neutral';
}

function ActionChip({ action }: { action: string }) {
  const cat = actionCategory(action);
  const cls = {
    danger:  'bg-red-500/10 text-red-400 border-red-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    info:    'bg-sky-500/10 text-sky-400 border-sky-500/20',
    neutral: 'bg-[color:var(--pt-bg-surface)] text-[color:var(--pt-text-2)] border-[color:var(--pt-accent-border)]',
  }[cat];
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${cls}`}>
      {action}
    </span>
  );
}

function OutcomeChip({ outcome, count }: { outcome: string; count: number }) {
  const cls =
    outcome === 'SUCCESS' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' :
    outcome === 'FAILURE' ? 'border-red-500/20 bg-red-500/10 text-red-400' :
    'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-2)]';
  const icon = outcome === 'SUCCESS' ? '✓' : outcome === 'FAILURE' ? '✗' : '·';
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {icon} {outcome}: {count}
    </span>
  );
}

export function PlatformAuditCommandSurface({
  show,
  t,
  locale,
  auditBusinessId,
  setAuditBusinessId,
  businessSelectOptions,
  auditAction,
  setAuditAction,
  auditActionOptions,
  auditOutcome,
  setAuditOutcome,
  fetchAuditLogs,
  loadingLogs,
  auditInvestigations,
  businessLookup,
  withAction,
  auditPage,
  hasNextAuditPage,
  onAuditNextPage,
  onAuditPrevPage,
  activityFeed,
  loadActivityFeed,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  locale: string;
  auditBusinessId: string;
  setAuditBusinessId: (value: string) => void;
  businessSelectOptions: SelectOption[];
  auditAction: string;
  setAuditAction: (value: string) => void;
  auditActionOptions: { id: string; label: string }[];
  auditOutcome: string;
  setAuditOutcome: (value: string) => void;
  fetchAuditLogs: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  loadingLogs: boolean;
  auditInvestigations: AuditInvestigation[];
  businessLookup: Map<string, { name: string }>;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  auditPage: number;
  hasNextAuditPage: boolean;
  onAuditNextPage: () => Promise<void>;
  onAuditPrevPage: () => Promise<void>;
  activityFeed: PlatformAuditLog[];
  loadActivityFeed: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<AuditTab>('activity');
  const [activitySearch, setActivitySearch] = useState('');

  // Load investigation data when switching to that tab for the first time
  useEffect(() => {
    if (show && activeTab === 'investigations' && auditInvestigations.length === 0) {
      fetchAuditLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, activeTab]);

  if (!show) return null;

  const filteredActivity = activitySearch
    ? activityFeed.filter(
        (log) =>
          log.action.toLowerCase().includes(activitySearch.toLowerCase()) ||
          log.resourceType.toLowerCase().includes(activitySearch.toLowerCase()) ||
          (log.reason ?? '').toLowerCase().includes(activitySearch.toLowerCase()),
      )
    : activityFeed;

  return (
    <section className="command-card p-6 space-y-5 nvi-reveal">

      {/* ── Header + Tab switcher ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">Intelligence</p>
          <h3 className="text-xl font-semibold text-[color:var(--pt-text-1)]">Audit</h3>
        </div>
        <div className="flex gap-0.5 rounded border border-[color:var(--pt-accent-border)] bg-[color:var(--pt-bg-deep)] p-0.5">
          {(['activity', 'investigations'] as AuditTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded px-3.5 py-1.5 text-[11px] font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-[color:var(--pt-accent)] text-black'
                  : 'text-[color:var(--pt-text-2)] hover:text-[color:var(--pt-text-1)]'
              }`}
            >
              {tab === 'activity' ? 'Admin Activity' : 'Investigations'}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB 1: Admin Activity ── */}
      {activeTab === 'activity' && (
        <div className="space-y-4">

          {/* Filter + Refresh */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              placeholder="Filter by action, resource, or reason…"
              className="flex-1 rounded border border-[color:var(--pt-accent-border)] bg-[color:var(--pt-bg-deep)] px-3 py-1.5 text-[12px] text-[color:var(--pt-text-1)] placeholder:text-[color:var(--pt-text-muted)] outline-none focus:border-[color:var(--pt-accent)]"
            />
            {activitySearch && (
              <button
                type="button"
                onClick={() => setActivitySearch('')}
                className="rounded border border-[color:var(--pt-accent-border)] px-2.5 py-1.5 text-[12px] text-[color:var(--pt-text-muted)] hover:text-[color:var(--pt-text-1)] transition-colors"
              >
                ×
              </button>
            )}
            <button
              type="button"
              onClick={() => withAction('audit:reload', loadActivityFeed)}
              className="inline-flex items-center gap-1.5 rounded border border-[color:var(--pt-accent-border)] px-3 py-1.5 text-[12px] text-[color:var(--pt-text-2)] transition-colors hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-1)]"
            >
              ↻ Refresh
            </button>
          </div>

          {/* Activity list */}
          {filteredActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded border border-[color:var(--pt-accent-border)] border-dashed py-12">
              <p className="text-[13px] text-[color:var(--pt-text-muted)]">
                {activitySearch ? 'No results match your filter.' : 'No admin activity recorded yet.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[color:var(--pt-accent-border)]/30 rounded border border-[color:var(--pt-accent-border)] overflow-hidden">
              {filteredActivity.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-[color:var(--pt-bg-surface)] transition-colors"
                >
                  {/* Left: action + resource */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ActionChip action={log.action} />
                      <span className="text-[11px] text-[color:var(--pt-text-2)]">
                        {log.resourceType}
                        {log.resourceId ? (
                          <span className="ml-1 font-mono text-[color:var(--pt-text-muted)]">
                            {log.resourceId.slice(0, 8)}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {log.reason ? (
                      <p className="text-[11px] text-[color:var(--pt-text-muted)] truncate">
                        {log.reason}
                      </p>
                    ) : null}
                  </div>

                  {/* Right: admin + time */}
                  <div className="shrink-0 text-right space-y-0.5">
                    {(log.adminEmail ?? log.platformAdminId) ? (
                      <p className="text-[10px] text-[color:var(--pt-text-muted)]">
                        {log.adminEmail ?? log.platformAdminId!.slice(0, 8)}
                      </p>
                    ) : null}
                    <p className="text-[10px] text-[color:var(--pt-text-muted)]">
                      {timeAgo(log.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-[color:var(--pt-text-muted)]">
            Showing last {activityFeed.length} admin actions
            {filteredActivity.length < activityFeed.length
              ? ` · ${filteredActivity.length} match filter`
              : null}
          </p>
        </div>
      )}

      {/* ── TAB 2: Business Investigations ── */}
      {activeTab === 'investigations' && (
        <div className="space-y-4">

          {/* Filters */}
          <form
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={fetchAuditLogs}
          >
            <SmartSelect
              instanceId="platform-audit-business"
              value={auditBusinessId}
              onChange={setAuditBusinessId}
              options={businessSelectOptions}
              placeholder="All businesses"
            />
            <TypeaheadInput
              value={auditAction}
              onChange={setAuditAction}
              onSelect={(option) => setAuditAction(option.label)}
              options={auditActionOptions}
              placeholder="Action type…"
              className="rounded border border-[color:var(--pt-accent-border)] bg-[color:var(--pt-bg-deep)] px-3 py-2 text-[12px] text-[color:var(--pt-text-1)]"
            />
            <SmartSelect
              instanceId="platform-audit-outcome"
              value={auditOutcome}
              onChange={setAuditOutcome}
              placeholder="All outcomes"
              options={[
                { value: '', label: 'All outcomes' },
                { value: 'SUCCESS', label: '✓ Success' },
                { value: 'FAILURE', label: '✗ Failure' },
              ]}
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded bg-[color:var(--pt-accent)] px-4 py-2 text-[12px] font-semibold text-black disabled:opacity-60"
              disabled={loadingLogs}
            >
              {loadingLogs ? <Spinner size="xs" variant="orbit" /> : null}
              {loadingLogs ? 'Loading…' : 'Search'}
            </button>
          </form>

          {/* Investigation cards */}
          <div className="space-y-3 nvi-stagger">
            {!loadingLogs && auditInvestigations.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded border border-[color:var(--pt-accent-border)] border-dashed py-12">
                <p className="text-[13px] text-[color:var(--pt-text-muted)]">
                  No investigations found. Adjust the filters and search.
                </p>
              </div>
            ) : null}

            {auditInvestigations.map((group) => {
              const businessName =
                businessLookup.get(group.businessId)?.name ?? group.businessId;

              return (
                <div
                  key={group.id}
                  className="rounded border border-[color:var(--pt-accent-border)] bg-[color:var(--pt-bg-card)] overflow-hidden"
                >
                  {/* Card header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--pt-accent-border)]/40 bg-[color:var(--pt-bg-surface)] px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[13px] font-semibold text-[color:var(--pt-text-1)] truncate">
                        {businessName}
                      </span>
                      <span className="shrink-0 rounded border border-[color:var(--pt-accent-border)] px-1.5 py-0.5 text-[10px] text-[color:var(--pt-text-muted)]">
                        {groupTypeLabel(group.groupType)}
                      </span>
                      <span className="shrink-0 text-[10px] text-[color:var(--pt-text-muted)]">
                        {group.count} event{group.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-[color:var(--pt-text-muted)]">
                        {new Date(group.startedAt).toLocaleString(locale, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' → '}
                        {new Date(group.latestAt).toLocaleString(locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 space-y-4">

                    {/* Outcome chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(group.outcomes).map(([outcome, count]) => (
                        <OutcomeChip
                          key={`${group.id}-${outcome}`}
                          outcome={outcome}
                          count={count}
                        />
                      ))}
                    </div>

                    {/* Resources + Evidence trail side by side */}
                    <div className="grid gap-4 sm:grid-cols-2">

                      {/* Resources touched */}
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-[color:var(--pt-text-muted)]">
                          Resources touched
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.resourceSummary.map((r) => (
                            <span
                              key={`${group.id}-${r.resourceType}-${r.resourceId ?? 'none'}`}
                              className="inline-flex items-center gap-1 rounded border border-[color:var(--pt-accent-border)] bg-[color:var(--pt-bg-surface)] px-2 py-0.5 text-[10px] text-[color:var(--pt-text-2)]"
                            >
                              {r.resourceType}
                              <span className="text-[color:var(--pt-text-muted)]">×{r.count}</span>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Evidence trail */}
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-[color:var(--pt-text-muted)]">
                          Evidence trail
                        </p>
                        <div className="space-y-1.5">
                          {group.actions.slice(0, 6).map((action) => (
                            <div key={action.id} className="flex items-center gap-2">
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  action.outcome === 'SUCCESS'
                                    ? 'bg-emerald-400'
                                    : action.outcome === 'FAILURE'
                                    ? 'bg-red-400'
                                    : 'bg-[color:var(--pt-text-muted)]'
                                }`}
                              />
                              <span className="flex-1 min-w-0 truncate font-mono text-[10px] text-[color:var(--pt-text-2)]">
                                {action.action}
                              </span>
                              <span className="shrink-0 text-[10px] text-[color:var(--pt-text-muted)]">
                                {new Date(action.createdAt).toLocaleString(locale, {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                            </div>
                          ))}
                          {group.actions.length > 6 ? (
                            <p className="text-[10px] text-[color:var(--pt-text-muted)]">
                              + {group.actions.length - 6} more
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Linked platform actions — only rendered if present */}
                    {group.relatedPlatformActions.length > 0 ? (
                      <div className="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-amber-400/70">
                          Linked admin actions
                        </p>
                        <div className="space-y-1.5">
                          {group.relatedPlatformActions.map((action) => (
                            <div key={action.id} className="flex items-start gap-2">
                              <span className="shrink-0 font-mono text-[10px] text-amber-300/80 truncate">
                                {action.action} · {action.resourceType}
                              </span>
                              {action.reason ? (
                                <span className="flex-1 truncate text-[10px] text-amber-400/50">
                                  {action.reason}
                                </span>
                              ) : null}
                              <span className="ml-auto shrink-0 text-[10px] text-amber-400/40">
                                {timeAgo(action.createdAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {(auditPage > 1 || hasNextAuditPage) ? (
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => withAction('audit:prev', () => onAuditPrevPage())}
                disabled={auditPage <= 1 || loadingLogs}
                className="inline-flex items-center gap-1.5 rounded border border-[color:var(--pt-accent-border)] px-3 py-1.5 text-[12px] text-[color:var(--pt-text-2)] transition-colors hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-1)] disabled:pointer-events-none disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="text-[12px] text-[color:var(--pt-text-muted)]">
                Page {auditPage}
              </span>
              <button
                type="button"
                onClick={() => withAction('audit:next', () => onAuditNextPage())}
                disabled={!hasNextAuditPage || loadingLogs}
                className="inline-flex items-center gap-1.5 rounded border border-[color:var(--pt-accent-border)] px-3 py-1.5 text-[12px] text-[color:var(--pt-text-2)] transition-colors hover:border-[color:var(--pt-accent-border-hi)] hover:text-[color:var(--pt-text-1)] disabled:pointer-events-none disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
