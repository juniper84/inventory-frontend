import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { DateTimePickerInput } from '@/components/DateTimePickerInput';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';

type SelectOption = { value: string; label: string };

type SupportRequest = {
  id: string;
  businessId: string;
  reason: string;
  severity: string;
  priority: string;
  status: string;
  requestedAt: string;
  durationHours?: number | null;
  scope?: string[] | null;
  sessions?: { expiresAt: string }[];
};

type SupportSession = {
  id: string;
  businessId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  request?: { severity?: string; priority?: string } | null;
};

type SubscriptionRequest = {
  id: string;
  businessId: string;
  type: string;
  requestedTier?: string | null;
  status: string;
  reason?: string | null;
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
  nextSupportCursor,
  loadSupportRequests,
  isLoadingMoreSupport,
  supportSessions,
  supportSessionReasons,
  setSupportSessionReasons,
  revokeSupportSession,
  revokingSupportSessionId,
  nextSupportSessionCursor,
  loadSupportSessions,
  isLoadingMoreSupportSessions,
  subscriptionRequests,
  subscriptionResponseNotes,
  setSubscriptionResponseNotes,
  withAction,
  updateSubscriptionRequest,
  actionLoading,
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
  nextSupportCursor: string | null;
  loadSupportRequests: (cursor?: string, append?: boolean) => Promise<void>;
  isLoadingMoreSupport: boolean;
  supportSessions: SupportSession[];
  supportSessionReasons: Record<string, string>;
  setSupportSessionReasons: Dispatch<SetStateAction<Record<string, string>>>;
  revokeSupportSession: (sessionId: string) => void | Promise<void>;
  revokingSupportSessionId: string | null;
  nextSupportSessionCursor: string | null;
  loadSupportSessions: (cursor?: string, append?: boolean) => Promise<void>;
  isLoadingMoreSupportSessions: boolean;
  subscriptionRequests: SubscriptionRequest[];
  subscriptionResponseNotes: Record<string, string>;
  setSubscriptionResponseNotes: Dispatch<SetStateAction<Record<string, string>>>;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  updateSubscriptionRequest: (
    requestId: string,
    action: 'approve' | 'reject',
  ) => Promise<void>;
  actionLoading: Record<string, boolean>;
}) {
  if (!show) {
    return null;
  }

  return (
    <>
      <section className="command-card p-6 space-y-4 nvi-reveal">
        <h3 className="text-xl font-semibold">{t('supportAccessTitle')}</h3>

        <form className="space-y-3" onSubmit={requestSupport}>
          <div className="grid gap-3 md:grid-cols-5">
            <SmartSelect
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
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 md:col-span-2"
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
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <SmartSelect
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
          <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
            <span className="text-gold-400">{t('supportScopeLabel')}</span>
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
            <p className="text-[11px] text-gold-500">{t('supportScopeHint')}</p>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={requestingSupport}
          >
            {requestingSupport ? <Spinner size="xs" variant="orbit" /> : null}
            {requestingSupport ? t('requesting') : t('createSupportRequest')}
          </button>
        </form>

        <div className="grid gap-3 md:grid-cols-4">
          <SmartSelect
            value={supportFilters.status}
            onChange={(value) =>
              setSupportFilters((prev) => ({ ...prev, status: value }))
            }
            options={supportStatusOptions}
          />
          <SmartSelect
            value={supportFilters.businessId}
            onChange={(value) =>
              setSupportFilters((prev) => ({ ...prev, businessId: value }))
            }
            options={[{ value: '', label: t('allBusinesses') }, ...businessSelectOptions]}
          />
          <SmartSelect
            value={supportFilters.severity}
            onChange={(value) =>
              setSupportFilters((prev) => ({ ...prev, severity: value }))
            }
            options={supportSeverityOptions}
          />
          <SmartSelect
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
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
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
          className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
        >
          {t('applyFilters')}
        </button>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gold-200">
            {t('supportRequestQueueTitle')}
          </h4>
          {supportRequests.map((request) => (
            <div
              key={request.id}
              className="rounded border border-gold-700/40 bg-black/40 p-3 text-xs text-gold-300"
            >
              <p className="text-gold-100">
                {request.businessId} • {request.status} • {request.severity} •{' '}
                {request.priority}
              </p>
              <p>{request.reason}</p>
              <p className="text-[11px] text-gold-500">
                {t('supportRequestedAtLabel', {
                  value: new Date(request.requestedAt).toLocaleString(locale),
                })}
              </p>
              <p className="text-[11px] text-gold-400">
                {t('supportScopeSummary', {
                  value: request.scope?.length
                    ? request.scope.join(', ')
                    : t('supportScopeAll'),
                })}
              </p>
              {request.durationHours ? (
                <p className="text-[11px] text-gold-400">
                  {t('supportDurationSummary', { value: request.durationHours })}
                </p>
              ) : null}
              {request.sessions?.[0] ? (
                <p className="text-[11px] text-gold-500">
                  {t('supportActiveSessionSummary', {
                    value: new Date(request.sessions[0].expiresAt).toLocaleString(
                      locale,
                    ),
                  })}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => activateSupport(request.id)}
                className="mt-2 inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:opacity-70"
                disabled={activatingSupportId === request.id || request.status !== 'APPROVED'}
              >
                {activatingSupportId === request.id ? (
                  <Spinner size="xs" variant="grid" />
                ) : null}
                {t('activate')}
              </button>
            </div>
          ))}
          {nextSupportCursor ? (
            <button
              type="button"
              onClick={() => loadSupportRequests(nextSupportCursor, true)}
              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:opacity-70"
              disabled={isLoadingMoreSupport}
            >
              {isLoadingMoreSupport ? <Spinner size="xs" variant="grid" /> : null}
              {t('loadMore')}
            </button>
          ) : null}
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gold-200">
            {t('supportSessionsTitle')}
          </h4>
          {supportSessions.length ? (
            supportSessions.map((session) => (
              <div
                key={session.id}
                className="rounded border border-gold-700/40 bg-black/40 p-3 text-xs text-gold-300"
              >
                <p className="text-gold-100">
                  {session.businessId} • {session.request?.severity ?? 'MEDIUM'} •{' '}
                  {session.request?.priority ?? 'MEDIUM'}
                </p>
                <p className="text-[11px] text-gold-500">
                  {t('supportSessionLifecycle', {
                    created: new Date(session.createdAt).toLocaleString(locale),
                    expires: new Date(session.expiresAt).toLocaleString(locale),
                  })}
                </p>
                <p className="text-[11px] text-gold-500">
                  {session.revokedAt
                    ? t('supportSessionRevokedAt', {
                        value: new Date(session.revokedAt).toLocaleString(locale),
                      })
                    : t('supportSessionActive')}
                </p>
                {!session.revokedAt ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={supportSessionReasons[session.id] ?? ''}
                      onChange={(event) =>
                        setSupportSessionReasons((prev) => ({
                          ...prev,
                          [session.id]: event.target.value,
                        }))
                      }
                      placeholder={t('supportSessionRevokeReasonPlaceholder')}
                      className="min-w-[240px] flex-1 rounded border border-gold-700/50 bg-black px-3 py-1 text-gold-100"
                    />
                    <button
                      type="button"
                      onClick={() => revokeSupportSession(session.id)}
                      className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:opacity-70"
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
            ))
          ) : (
            <p className="text-xs text-gold-400">{t('noSupportSessions')}</p>
          )}
          {nextSupportSessionCursor ? (
            <button
              type="button"
              onClick={() => loadSupportSessions(nextSupportSessionCursor, true)}
              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:opacity-70"
              disabled={isLoadingMoreSupportSessions}
            >
              {isLoadingMoreSupportSessions ? <Spinner size="xs" variant="grid" /> : null}
              {t('loadMore')}
            </button>
          ) : null}
        </div>
      </section>

      <section className="command-card p-6 space-y-4 nvi-reveal">
        <h3 className="text-xl font-semibold">{t('subscriptionRequestsTitle')}</h3>
        <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
          {subscriptionRequests.map((request) => (
            <div
              key={request.id}
              className="rounded border border-gold-700/40 bg-black/40 p-3"
            >
              <p className="text-gold-100">
                {request.businessId} • {request.type}
                {request.requestedTier ? ` (${request.requestedTier})` : ''}
              </p>
              <p>{t('statusLabel', { status: request.status })}</p>
              {request.reason ? <p>{t('reasonLabel', { reason: request.reason })}</p> : null}
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
                  className="rounded border border-gold-700/50 bg-black px-3 py-1 text-xs text-gold-100"
                />
                <button
                  type="button"
                  onClick={() =>
                    withAction(`subscription:approve:${request.id}`, () =>
                      updateSubscriptionRequest(request.id, 'approve'),
                    )
                  }
                  className="rounded bg-gold-500 px-3 py-1 text-xs font-semibold text-black"
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
                  className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
                >
                  <span className="inline-flex items-center gap-2">
                    {actionLoading[`subscription:reject:${request.id}`] ? (
                      <Spinner size="xs" variant="bars" />
                    ) : null}
                    {actions('reject')}
                  </span>
                </button>
              </div>
            </div>
          ))}
          {!subscriptionRequests.length ? (
            <p className="text-gold-400">{t('noSubscriptionRequests')}</p>
          ) : null}
        </div>
      </section>
    </>
  );
}
