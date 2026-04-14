import { useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { DateTimePickerInput } from '@/components/DateTimePickerInput';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';
import { formatEnum } from '@/lib/format-enum';

type SelectOption = { value: string; label: string };

type SupportRequest = {
  id: string;
  businessId: string;
  business?: { name: string } | null;
  reason: string;
  severity: string;
  priority: string;
  status: string;
  requestedAt: string;
  durationHours?: number | null;
  scope?: string[] | null;
  sessions?: { expiresAt: string; revokedAt?: string | null }[];
};

type SupportSession = {
  id: string;
  businessId: string;
  business?: { name: string } | null;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  request?: { severity?: string; priority?: string; reason?: string } | null;
};

type SubscriptionRequest = {
  id: string;
  businessId: string;
  type: string;
  requestedTier?: string | null;
  requestedDurationMonths?: number | null;
  status: string;
  reason?: string | null;
  approvedDurationMonths?: number | null;
  approvedTier?: string | null;
  isPaid?: boolean | null;
  amountDue?: number | null;
};

type SubscriptionApprovalForm = {
  durationMonths: string;
  isPaid: boolean;
  amountDue: string;
  tier: string;
};

type SupportFormState = {
  businessId: string;
  reason: string;
  durationHours: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  scope: string[];
};

type SupportFiltersState = {
  status: string;
  businessId: string;
  platformAdminId: string;
  severity: string;
  priority: string;
  requestedFrom: string;
  requestedTo: string;
  activeOnly: string;
};

type AccessTab = 'REQUESTS' | 'SESSIONS' | 'SUBSCRIPTIONS';

export function PlatformSupportCommandSurface({
  show,
  t,
  actions,
  locale,
  supportForm,
  setSupportForm,
  supportScopeOptions,
  supportSeverityOptions,
  supportPriorityOptions,
  supportStatusOptions,
  supportFilters,
  setSupportFilters,
  businessSelectOptions,
  requestSupport,
  requestingSupport,
  applySupportFilters,
  supportRequests,
  activateSupport,
  activatingSupportId,
  supportPage,
  hasNextSupportPage,
  onSupportNextPage,
  onSupportPrevPage,
  supportSessions,
  supportSessionReasons,
  setSupportSessionReasons,
  revokeSupportSession,
  revokingSupportSessionId,
  supportSessionPage,
  hasNextSupportSessionPage,
  onSupportSessionNextPage,
  onSupportSessionPrevPage,
  subscriptionRequests,
  subscriptionResponseNotes,
  setSubscriptionResponseNotes,
  subscriptionApprovalForms,
  setSubscriptionApprovalForms,
  withAction,
  updateSubscriptionRequest,
  actionLoading,
  pendingSupportLogin,
  loggingInAsSupport,
  loginAsSupport,
  clearPendingSupportLogin,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  actions: (key: string) => string;
  locale: string;
  supportForm: SupportFormState;
  setSupportForm: Dispatch<SetStateAction<SupportFormState>>;
  supportScopeOptions: SelectOption[];
  supportSeverityOptions: SelectOption[];
  supportPriorityOptions: SelectOption[];
  supportStatusOptions: SelectOption[];
  supportFilters: SupportFiltersState;
  setSupportFilters: Dispatch<SetStateAction<SupportFiltersState>>;
  businessSelectOptions: SelectOption[];
  requestSupport: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  requestingSupport: boolean;
  applySupportFilters: () => void | Promise<void>;
  supportRequests: SupportRequest[];
  activateSupport: (requestId: string) => void | Promise<void>;
  activatingSupportId: string | null;
  supportPage: number;
  hasNextSupportPage: boolean;
  onSupportNextPage: () => Promise<void>;
  onSupportPrevPage: () => Promise<void>;
  supportSessions: SupportSession[];
  supportSessionReasons: Record<string, string>;
  setSupportSessionReasons: Dispatch<SetStateAction<Record<string, string>>>;
  revokeSupportSession: (sessionId: string) => void | Promise<void>;
  revokingSupportSessionId: string | null;
  supportSessionPage: number;
  hasNextSupportSessionPage: boolean;
  onSupportSessionNextPage: () => Promise<void>;
  onSupportSessionPrevPage: () => Promise<void>;
  subscriptionRequests: SubscriptionRequest[];
  subscriptionResponseNotes: Record<string, string>;
  setSubscriptionResponseNotes: Dispatch<SetStateAction<Record<string, string>>>;
  subscriptionApprovalForms: Record<string, SubscriptionApprovalForm>;
  setSubscriptionApprovalForms: Dispatch<SetStateAction<Record<string, SubscriptionApprovalForm>>>;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  updateSubscriptionRequest: (
    requestId: string,
    action: 'approve' | 'reject',
  ) => Promise<void>;
  actionLoading: Record<string, boolean>;
  pendingSupportLogin: { token: string; businessId: string; expiresAt: string } | null;
  loggingInAsSupport: boolean;
  loginAsSupport: (locale: string) => Promise<void>;
  clearPendingSupportLogin: () => void;
}) {
  const supportStatusLabels: Record<string, string> = {
    PENDING: t('statusPending'),
    APPROVED: t('statusApproved'),
    REJECTED: t('statusRejected'),
    ACTIVE: t('statusActive'),
    EXPIRED: t('statusExpired'),
  };
  const severityLabels: Record<string, string> = {
    LOW: t('severityLow'),
    MEDIUM: t('severityMedium'),
    HIGH: t('severityHigh'),
    CRITICAL: t('severityCritical'),
  };
  const priorityLabels: Record<string, string> = {
    LOW: t('priorityLow'),
    MEDIUM: t('priorityMedium'),
    HIGH: t('priorityHigh'),
    URGENT: t('priorityUrgent'),
  };

  // Badge colour helpers
  const severityColor: Record<string, string> = {
    LOW: 'bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-2)]',
    MEDIUM: 'bg-yellow-500/15 text-yellow-400',
    HIGH: 'bg-orange-500/15 text-orange-400',
    CRITICAL: 'bg-red-500/20 text-red-400',
  };
  const priorityColor: Record<string, string> = {
    LOW: 'bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-2)]',
    MEDIUM: 'bg-yellow-500/15 text-yellow-400',
    HIGH: 'bg-orange-500/15 text-orange-400',
    URGENT: 'bg-red-500/20 text-red-400',
  };
  const statusColor: Record<string, string> = {
    PENDING: 'bg-yellow-500/15 text-yellow-400',
    APPROVED: 'bg-emerald-500/15 text-emerald-400',
    REJECTED: 'bg-red-500/15 text-red-400',
    ACTIVE: 'bg-emerald-500/15 text-emerald-400',
    EXPIRED: 'bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-muted)]',
  };

  const [activeTab, setActiveTab] = useState<AccessTab>('REQUESTS');

  if (!show) {
    return null;
  }

  const tabDefs: { key: AccessTab; label: string; count: number }[] = [
    { key: 'REQUESTS', label: t('supportRequestQueueTitle'), count: supportRequests.length },
    { key: 'SESSIONS', label: t('supportSessionsTitle'), count: supportSessions.length },
    { key: 'SUBSCRIPTIONS', label: t('subscriptionRequestsTitle'), count: subscriptionRequests.length },
  ];

  return (
    <section className="command-card p-6 space-y-4 nvi-reveal">
      {/* Segmented tab bar with live count badges */}
      <div className="flex flex-wrap items-center gap-1 rounded border border-[color:var(--pt-accent-border)] p-0.5 w-fit">
        {tabDefs.map(({ key, label, count }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--pt-accent)] text-black'
                  : 'text-[color:var(--pt-text-2)] hover:text-[color:var(--pt-text-1)]'
              }`}
            >
              {label}
              {count > 0 ? (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                    isActive
                      ? 'bg-black/20 text-black'
                      : 'bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-1)]'
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* REQUESTS tab — Create form + filters + request queue */}
      {activeTab === 'REQUESTS' && (
        <div className="space-y-4">
          <form className="space-y-3" onSubmit={requestSupport}>
            <div className="grid gap-3 md:grid-cols-5">
              <SmartSelect
                instanceId="platform-support-form-business"
                value={supportForm.businessId}
                onChange={(value) =>
                  setSupportForm((prev) => ({ ...prev, businessId: value }))
                }
                options={businessSelectOptions}
                placeholder={t('selectBusiness')}
              />
              <input
                value={supportForm.reason}
                onChange={(event) =>
                  setSupportForm((prev) => ({ ...prev, reason: event.target.value }))
                }
                placeholder={t('reasonPlaceholder')}
                className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)] md:col-span-2"
              />
              <input
                value={supportForm.durationHours}
                onChange={(event) =>
                  setSupportForm((prev) => ({
                    ...prev,
                    durationHours: event.target.value,
                  }))
                }
                placeholder={t('supportDurationPlaceholder')}
                className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
              />
              <SmartSelect
                instanceId="platform-support-form-severity"
                value={supportForm.severity}
                onChange={(value) =>
                  setSupportForm((prev) => ({
                    ...prev,
                    severity: value as SupportFormState['severity'],
                  }))
                }
                options={supportSeverityOptions.filter((option) => option.value)}
              />
              <SmartSelect
                instanceId="platform-support-form-priority"
                value={supportForm.priority}
                onChange={(value) =>
                  setSupportForm((prev) => ({
                    ...prev,
                    priority: value as SupportFormState['priority'],
                  }))
                }
                options={supportPriorityOptions.filter((option) => option.value)}
              />
            </div>
            <div className="space-y-2 text-xs text-[color:var(--pt-text-2)] nvi-stagger">
              <span className="text-[color:var(--pt-text-2)]">{t('supportScopeLabel')}</span>
              <div className="flex flex-wrap gap-3">
                {supportScopeOptions.map((option) => (
                  <label key={option.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={supportForm.scope.includes(option.value)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...supportForm.scope, option.value]
                          : supportForm.scope.filter((value) => value !== option.value);
                        setSupportForm((prev) => ({ ...prev, scope: next }));
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-[color:var(--pt-text-muted)]">{t('supportScopeHint')}</p>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded bg-[var(--pt-accent)] px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
              disabled={requestingSupport}
            >
              {requestingSupport ? <Spinner size="xs" variant="orbit" /> : null}
              {requestingSupport ? t('requesting') : t('createSupportRequest')}
            </button>
          </form>

          <div className="border-t border-[color:var(--pt-accent-border)] pt-4">
            <div className="grid gap-3 md:grid-cols-4">
              <SmartSelect
                instanceId="platform-support-filter-status"
                value={supportFilters.status}
                onChange={(value) =>
                  setSupportFilters((prev) => ({ ...prev, status: value }))
                }
                options={supportStatusOptions}
              />
              <SmartSelect
                instanceId="platform-support-filter-business"
                value={supportFilters.businessId}
                onChange={(value) =>
                  setSupportFilters((prev) => ({ ...prev, businessId: value }))
                }
                options={[{ value: '', label: t('allBusinesses') }, ...businessSelectOptions]}
              />
              <SmartSelect
                instanceId="platform-support-filter-severity"
                value={supportFilters.severity}
                onChange={(value) =>
                  setSupportFilters((prev) => ({ ...prev, severity: value }))
                }
                options={supportSeverityOptions}
              />
              <SmartSelect
                instanceId="platform-support-filter-priority"
                value={supportFilters.priority}
                onChange={(value) =>
                  setSupportFilters((prev) => ({ ...prev, priority: value }))
                }
                options={supportPriorityOptions}
              />
              <input
                value={supportFilters.platformAdminId}
                onChange={(event) =>
                  setSupportFilters((prev) => ({
                    ...prev,
                    platformAdminId: event.target.value,
                  }))
                }
                placeholder={t('platformAdminIdPlaceholder')}
                className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
              />
              <DateTimePickerInput
                value={supportFilters.requestedFrom}
                onChange={(value) =>
                  setSupportFilters((prev) => ({ ...prev, requestedFrom: value }))
                }
                placeholder={t('supportRequestedFrom')}
              />
              <DateTimePickerInput
                value={supportFilters.requestedTo}
                onChange={(value) =>
                  setSupportFilters((prev) => ({ ...prev, requestedTo: value }))
                }
                placeholder={t('supportRequestedTo')}
              />
              <SmartSelect
                instanceId="platform-support-filter-active-only"
                value={supportFilters.activeOnly}
                onChange={(value) =>
                  setSupportFilters((prev) => ({ ...prev, activeOnly: value }))
                }
                options={[
                  { value: 'true', label: t('supportSessionsActiveOnly') },
                  { value: 'false', label: t('supportSessionsAll') },
                ]}
              />
            </div>
            <button
              type="button"
              onClick={() => applySupportFilters()}
              className="mt-3 inline-flex items-center gap-2 rounded border border-[color:var(--pt-accent-border)] px-3 py-1 text-xs text-[color:var(--pt-text-1)]"
            >
              {t('applyFilters')}
            </button>
          </div>

          <div className="space-y-3">
            {supportRequests.map((request) => {
              const activeSession = request.sessions?.[0] && !request.sessions[0].revokedAt && new Date(request.sessions[0].expiresAt) > new Date()
                ? request.sessions[0]
                : null;
              return (
                <div
                  key={request.id}
                  className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3 space-y-2"
                >
                  {/* Header row: business name + badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[color:var(--pt-text-1)]">
                      {request.business?.name ?? request.businessId}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${statusColor[request.status] ?? 'bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-2)]'}`}>
                      {formatEnum(supportStatusLabels, request.status)}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${severityColor[request.severity] ?? ''}`}>
                      {formatEnum(severityLabels, request.severity)}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${priorityColor[request.priority] ?? ''}`}>
                      {formatEnum(priorityLabels, request.priority)}
                    </span>
                  </div>
                  {/* Reason */}
                  <p className="text-xs text-[color:var(--pt-text-2)]">{request.reason}</p>
                  {/* Meta row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[color:var(--pt-text-muted)]">
                    <span>
                      {t('supportRequestedAtLabel', {
                        value: new Date(request.requestedAt).toLocaleString(locale),
                      })}
                    </span>
                    {request.durationHours ? (
                      <span>{t('supportDurationSummary', { value: request.durationHours })}</span>
                    ) : null}
                    <span>
                      {t('supportScopeSummary', {
                        value: request.scope?.length ? request.scope.join(', ') : t('supportScopeAll'),
                      })}
                    </span>
                  </div>
                  {/* Active session indicator */}
                  {activeSession ? (
                    <p className="text-[11px] font-medium text-emerald-400">
                      {t('supportActiveSessionSummary', {
                        value: new Date(activeSession.expiresAt).toLocaleString(locale),
                      })}
                    </p>
                  ) : null}
                  {/* Action */}
                  {request.status === 'APPROVED' ? (
                    activeSession ? (
                      <p className="text-[11px] text-[color:var(--pt-text-muted)]">
                        {t('supportSessionAlreadyActive')}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => activateSupport(request.id)}
                        className="mt-1 inline-flex items-center gap-2 rounded border border-[color:var(--pt-accent-border)] px-3 py-1 text-xs text-[color:var(--pt-text-1)] disabled:opacity-70"
                        disabled={activatingSupportId === request.id}
                      >
                        {activatingSupportId === request.id ? (
                          <Spinner size="xs" variant="grid" />
                        ) : null}
                        {t('activate')}
                      </button>
                    )
                  ) : null}
                </div>
              );
            })}
            {!supportRequests.length ? (
              <p className="text-xs text-[color:var(--pt-text-2)]">{t('noSupportRequests')}</p>
            ) : null}
            {(supportPage > 1 || hasNextSupportPage) ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onSupportPrevPage()} className="inline-flex items-center gap-1 rounded border border-[color:var(--pt-accent-border)] px-3 py-1 text-xs text-[color:var(--pt-text-1)] disabled:opacity-40" disabled={supportPage <= 1}>{t('prevPage')}</button>
                <span className="text-[color:var(--pt-text-muted)]">{t('pageLabel', { page: supportPage })}</span>
                <button type="button" onClick={() => onSupportNextPage()} className="inline-flex items-center gap-1 rounded border border-[color:var(--pt-accent-border)] px-3 py-1 text-xs text-[color:var(--pt-text-1)] disabled:opacity-40" disabled={!hasNextSupportPage}>{t('nextPage')}</button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* SESSIONS tab — Active support sessions */}
      {activeTab === 'SESSIONS' && (
        <div className="space-y-3">
          {supportSessions.length ? (
            supportSessions.map((session) => {
              const isActive = !session.revokedAt && new Date(session.expiresAt) > new Date();
              const sev = session.request?.severity ?? 'MEDIUM';
              const pri = session.request?.priority ?? 'MEDIUM';
              return (
                <div
                  key={session.id}
                  className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3 space-y-2"
                >
                  {/* Header: business name + severity/priority badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[color:var(--pt-text-1)]">
                      {session.business?.name ?? session.businessId}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${isActive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[var(--pt-accent-dim)] text-[color:var(--pt-text-muted)]'}`}>
                      {isActive ? t('supportSessionActive') : session.revokedAt ? t('supportSessionStatusRevoked') : t('statusExpired')}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${severityColor[sev] ?? ''}`}>
                      {formatEnum(severityLabels, sev)}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${priorityColor[pri] ?? ''}`}>
                      {formatEnum(priorityLabels, pri)}
                    </span>
                  </div>
                  {/* Reason from the original request */}
                  {session.request?.reason ? (
                    <p className="text-xs text-[color:var(--pt-text-2)]">{session.request.reason}</p>
                  ) : null}
                  {/* Lifecycle dates */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[color:var(--pt-text-muted)]">
                    <span>
                      {t('supportSessionLifecycle', {
                        created: new Date(session.createdAt).toLocaleString(locale),
                        expires: new Date(session.expiresAt).toLocaleString(locale),
                      })}
                    </span>
                    {session.revokedAt ? (
                      <span className="text-red-400">
                        {t('supportSessionRevokedAt', {
                          value: new Date(session.revokedAt).toLocaleString(locale),
                        })}
                      </span>
                    ) : null}
                  </div>
                  {/* Revoke action — only for active sessions */}
                  {isActive ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      <input
                        value={supportSessionReasons[session.id] ?? ''}
                        onChange={(event) =>
                          setSupportSessionReasons((prev) => ({
                            ...prev,
                            [session.id]: event.target.value,
                          }))
                        }
                        placeholder={t('supportSessionRevokeReasonPlaceholder')}
                        className="min-w-[240px] flex-1 rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-1 text-xs text-[color:var(--pt-text-1)]"
                      />
                      <button
                        type="button"
                        onClick={() => revokeSupportSession(session.id)}
                        className="inline-flex items-center gap-2 rounded border border-red-500/40 px-3 py-1 text-xs text-red-400 disabled:opacity-70"
                        disabled={revokingSupportSessionId === session.id}
                      >
                        {revokingSupportSessionId === session.id ? (
                          <Spinner size="xs" variant="grid" />
                        ) : null}
                        {t('revoke')}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="text-xs text-[color:var(--pt-text-2)]">{t('noSupportSessions')}</p>
          )}
          {(supportSessionPage > 1 || hasNextSupportSessionPage) ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onSupportSessionPrevPage()} className="inline-flex items-center gap-1 rounded border border-[color:var(--pt-accent-border)] px-3 py-1 text-xs text-[color:var(--pt-text-1)] disabled:opacity-40" disabled={supportSessionPage <= 1}>{t('prevPage')}</button>
              <span className="text-[color:var(--pt-text-muted)]">{t('pageLabel', { page: supportSessionPage })}</span>
              <button type="button" onClick={() => onSupportSessionNextPage()} className="inline-flex items-center gap-1 rounded border border-[color:var(--pt-accent-border)] px-3 py-1 text-xs text-[color:var(--pt-text-1)] disabled:opacity-40" disabled={!hasNextSupportSessionPage}>{t('nextPage')}</button>
            </div>
          ) : null}
        </div>
      )}

      {/* Support login modal — appears after a request is activated */}
      {pendingSupportLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-[color:var(--pt-accent-border)] bg-[var(--pt-bg-surface)] p-6 shadow-2xl space-y-4">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--pt-accent)]">
                {t('supportSessionReady')}
              </p>
              <h3 className="text-base font-semibold text-[color:var(--pt-text-1)]">
                {t('supportLoginModalTitle')}
              </h3>
              <p className="text-xs text-[color:var(--pt-text-2)]">
                {t('supportLoginBusiness', { businessId: pendingSupportLogin.businessId })}
              </p>
              <p className="text-[11px] text-[color:var(--pt-text-muted)]">
                {t('supportLoginExpires', {
                  value: new Date(pendingSupportLogin.expiresAt).toLocaleString(locale),
                })}
              </p>
            </div>
            <p className="text-xs text-[color:var(--pt-text-2)] leading-relaxed">
              {t('supportLoginModalBody')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loginAsSupport(locale)}
                disabled={loggingInAsSupport}
                className="inline-flex items-center gap-2 rounded bg-[var(--pt-accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-70"
              >
                {loggingInAsSupport ? <Spinner size="xs" variant="orbit" /> : null}
                {loggingInAsSupport ? t('loggingInAsSupport') : t('supportLoginOpenBusiness')}
              </button>
              <button
                type="button"
                onClick={() => clearPendingSupportLogin()}
                disabled={loggingInAsSupport}
                className="inline-flex items-center gap-2 rounded border border-[color:var(--pt-accent-border)] px-4 py-2 text-sm text-[color:var(--pt-text-1)] disabled:opacity-70"
              >
                {t('supportLoginDismiss')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBSCRIPTIONS tab — Subscription upgrade/downgrade requests */}
      {activeTab === 'SUBSCRIPTIONS' && (
        <div className="space-y-3 text-xs text-[color:var(--pt-text-2)] nvi-stagger">
          {subscriptionRequests.map((request) => {
            const form = subscriptionApprovalForms[request.id] ?? {
              durationMonths: String(request.requestedDurationMonths ?? 1),
              isPaid: true,
              amountDue: '',
              tier: request.requestedTier ?? '',
            };
            const isPending = request.status === 'PENDING';
            const effectiveDuration = parseInt(form.durationMonths, 10) || 1;
            const previewExpiry = new Date();
            previewExpiry.setMonth(previewExpiry.getMonth() + effectiveDuration);

            return (
            <div
              key={request.id}
              className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3"
            >
              <p className="text-[color:var(--pt-text-1)]">
                {request.businessId} • {request.type}
                {request.requestedTier ? ` (${request.requestedTier})` : ''}
                {request.requestedDurationMonths ? ` • ${request.requestedDurationMonths} months` : ''}
              </p>
              <p>{t('statusLabel', { status: request.status })}</p>
              {request.reason ? <p>{t('reasonLabel', { reason: request.reason })}</p> : null}

              {isPending && request.type !== 'CANCEL' && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="text-[10px] text-[color:var(--pt-text-2)]">{t('subscriptionDuration')}</label>
                    <select
                      value={form.durationMonths}
                      onChange={(e) =>
                        setSubscriptionApprovalForms((prev) => ({
                          ...prev,
                          [request.id]: { ...form, durationMonths: e.target.value },
                        }))
                      }
                      className="mt-0.5 w-full rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-2 py-1 text-xs text-[color:var(--pt-text-1)]"
                    >
                      <option value="1">{t('1month')}</option>
                      <option value="3">{t('3months')}</option>
                      <option value="6">{t('6months')}</option>
                      <option value="12">{t('12months')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[color:var(--pt-text-2)]">{t('approvalTierLabel')}</label>
                    <select
                      value={form.tier}
                      onChange={(e) =>
                        setSubscriptionApprovalForms((prev) => ({
                          ...prev,
                          [request.id]: { ...form, tier: e.target.value },
                        }))
                      }
                      className="mt-0.5 w-full rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-2 py-1 text-xs text-[color:var(--pt-text-1)]"
                    >
                      <option value="STARTER">{t('tierStarter')}</option>
                      <option value="BUSINESS">{t('tierBusiness')}</option>
                      <option value="ENTERPRISE">{t('tierEnterprise')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[color:var(--pt-text-2)]">{t('approvalPaidLabel')}</label>
                    <div className="mt-0.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSubscriptionApprovalForms((prev) => ({
                            ...prev,
                            [request.id]: { ...form, isPaid: !form.isPaid },
                          }))
                        }
                        className={`rounded px-2 py-1 text-xs font-semibold ${form.isPaid ? 'bg-[var(--pt-accent)] text-black' : 'border border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-1)]'}`}
                      >
                        {form.isPaid ? t('approvalPaid') : t('approvalComplimentary')}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-[color:var(--pt-text-2)]">{t('approvalAmountLabel')}</label>
                    <input
                      type="number"
                      min="0"
                      value={form.amountDue}
                      onChange={(e) =>
                        setSubscriptionApprovalForms((prev) => ({
                          ...prev,
                          [request.id]: { ...form, amountDue: e.target.value },
                        }))
                      }
                      placeholder="0"
                      className="mt-0.5 w-full rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-2 py-1 text-xs text-[color:var(--pt-text-1)]"
                    />
                  </div>
                </div>
              )}

              {isPending && request.type !== 'CANCEL' && (
                <p className="mt-1 text-[10px] text-[color:var(--pt-text-2)]">
                  {t('approvalExpiryPreview', { date: previewExpiry.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) })}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={subscriptionResponseNotes[request.id] ?? ''}
                  onChange={(event) =>
                    setSubscriptionResponseNotes((prev) => ({
                      ...prev,
                      [request.id]: event.target.value,
                    }))
                  }
                  placeholder={t('responseNotePlaceholder')}
                  className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-1 text-xs text-[color:var(--pt-text-1)]"
                />
                {isPending && (
                  <>
                <button
                  type="button"
                  onClick={() =>
                    withAction(`subscription:approve:${request.id}`, () =>
                      updateSubscriptionRequest(request.id, 'approve'),
                    )
                  }
                  className="rounded bg-[var(--pt-accent)] px-3 py-1 text-xs font-semibold text-black"
                >
                  <span className="inline-flex items-center gap-2">
                    {actionLoading[`subscription:approve:${request.id}`] ? (
                      <Spinner size="xs" variant="dots" />
                    ) : null}
                    {actions('approve')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    withAction(`subscription:reject:${request.id}`, () =>
                      updateSubscriptionRequest(request.id, 'reject'),
                    )
                  }
                  className="rounded border border-[color:var(--pt-accent-border-hi)] px-3 py-1 text-xs text-[color:var(--pt-text-1)]"
                >
                  <span className="inline-flex items-center gap-2">
                    {actionLoading[`subscription:reject:${request.id}`] ? (
                      <Spinner size="xs" variant="bars" />
                    ) : null}
                    {actions('reject')}
                  </span>
                </button>
                  </>
                )}
              </div>
            </div>
            );
          })}
          {!subscriptionRequests.length ? (
            <p className="text-[color:var(--pt-text-2)]">{t('noSubscriptionRequests')}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
