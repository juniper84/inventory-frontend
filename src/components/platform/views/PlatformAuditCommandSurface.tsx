import type { FormEvent } from 'react';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';
import { TypeaheadInput } from '@/components/TypeaheadInput';
import { formatEntityLabel } from '@/lib/display';

type SelectOption = { value: string; label: string };

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

export function PlatformAuditCommandSurface({
  show,
  t,
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
  nextAuditInvestigationCursor,
  withAction,
  isLoadingMoreAudit,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  auditBusinessId: string;
  setAuditBusinessId: (value: string) => void;
  businessSelectOptions: SelectOption[];
  auditAction: string;
  setAuditAction: (value: string) => void;
  auditActionOptions: { id: string; label: string }[];
  auditOutcome: string;
  setAuditOutcome: (value: string) => void;
  fetchAuditLogs: (
    event?: FormEvent<HTMLFormElement>,
    cursor?: string,
    append?: boolean,
  ) => Promise<void>;
  loadingLogs: boolean;
  auditInvestigations: AuditInvestigation[];
  businessLookup: Map<string, { name: string }>;
  nextAuditInvestigationCursor: string | null;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  isLoadingMoreAudit: boolean;
}) {
  if (!show) {
    return null;
  }

  return (
    <section className="command-card p-6 space-y-4 nvi-reveal">
      <h3 className="text-xl font-semibold">{t('platformAuditTitle')}</h3>
      <form className="grid gap-3 md:grid-cols-4" onSubmit={fetchAuditLogs}>
        <SmartSelect
          value={auditBusinessId}
          onChange={setAuditBusinessId}
          options={businessSelectOptions}
          placeholder={t('selectBusiness')}
        />
        <TypeaheadInput
          value={auditAction}
          onChange={setAuditAction}
          onSelect={(option) => setAuditAction(option.label)}
          options={auditActionOptions}
          placeholder={t('actionFilter')}
          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <SmartSelect
          value={auditOutcome}
          onChange={(value) => setAuditOutcome(value)}
          placeholder={t('allOutcomes')}
          options={[
            { value: '', label: t('allOutcomes') },
            { value: 'SUCCESS', label: t('success') },
            { value: 'FAILURE', label: t('failure') },
          ]}
        />
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black"
        >
          {loadingLogs ? <Spinner size="xs" variant="orbit" /> : null}
          {loadingLogs ? t('loading') : t('loadLogs')}
        </button>
      </form>
      <div className="space-y-3 text-xs text-gold-300 nvi-stagger">
        {auditInvestigations.map((group) => (
          <div
            key={group.id}
            className="rounded border border-gold-700/40 bg-black/40 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-gold-100">
                {t('auditGroupSummary', {
                  type: group.groupType,
                  count: group.count,
                })}
              </p>
              <p className="text-gold-500">
                {new Date(group.startedAt).toLocaleString()} →{' '}
                {new Date(group.latestAt).toLocaleString()}
              </p>
            </div>
            <p className="text-[11px] text-gold-500">
              {t('auditBusinessLabel', {
                value: businessLookup.get(group.businessId)?.name ?? group.businessId,
              })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(group.outcomes).map(([outcome, count]) => (
                <span
                  key={`${group.id}-${outcome}`}
                  className="rounded border border-gold-700/50 px-2 py-1 text-[11px]"
                >
                  {outcome}: {count}
                </span>
              ))}
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-gold-200">{t('auditResourceSummary')}</p>
              {group.resourceSummary.map((resource) => (
                <p
                  key={`${group.id}-${resource.resourceType}-${resource.resourceId ?? 'none'}`}
                  className="text-[11px] text-gold-400"
                >
                  {resource.resourceType}
                  {resource.resourceId
                    ? ` (${formatEntityLabel({ id: resource.resourceId }, resource.resourceId)})`
                    : ''}{' '}
                  • {resource.count}
                </p>
              ))}
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-gold-200">{t('auditEvidenceTrail')}</p>
              {group.actions.slice(0, 8).map((action) => (
                <p key={action.id} className="text-[11px] text-gold-400">
                  {action.action} • {action.outcome} • {action.resourceType} •{' '}
                  {new Date(action.createdAt).toLocaleString()}
                </p>
              ))}
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-gold-200">{t('auditLinkedPlatformActions')}</p>
              {group.relatedPlatformActions.length ? (
                group.relatedPlatformActions.map((action) => (
                  <p key={action.id} className="text-[11px] text-gold-400">
                    {action.action} • {action.resourceType}
                    {action.reason ? ` • ${action.reason}` : ''} •{' '}
                    {new Date(action.createdAt).toLocaleString()}
                  </p>
                ))
              ) : (
                <p className="text-[11px] text-gold-500">
                  {t('auditNoLinkedPlatformActions')}
                </p>
              )}
            </div>
          </div>
        ))}
        {!auditInvestigations.length ? (
          <p className="text-gold-400">{t('auditNoInvestigations')}</p>
        ) : null}
        {nextAuditInvestigationCursor ? (
          <button
            type="button"
            onClick={() =>
              withAction('audit:loadMore', () =>
                fetchAuditLogs(undefined, nextAuditInvestigationCursor, true),
              )
            }
            className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
            disabled={isLoadingMoreAudit}
          >
            {isLoadingMoreAudit ? <Spinner size="xs" variant="grid" /> : null}
            {t('loadMoreLogs')}
          </button>
        ) : null}
      </div>
    </section>
  );
}
