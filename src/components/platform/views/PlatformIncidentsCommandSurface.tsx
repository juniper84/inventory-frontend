import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import type { Dispatch, SetStateAction } from 'react';
import { formatEnum } from '@/lib/format-enum';

type SelectOption = { value: string; label: string };

type Incident = {
  id: string;
  businessId: string;
  status: 'OPEN' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED' | 'CLOSED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  openedAt: string;
  business?: { name: string } | null;
  events?: { id: string; eventType: string; note?: string | null }[];
};

export function PlatformIncidentsCommandSurface({
  show,
  t,
  locale,
  withAction,
  loadIncidents,
  isLoadingIncidents,
  incidentFilters,
  setIncidentFilters,
  businessSelectOptions,
  incidentStatusOptions,
  incidentSeverityOptions,
  actionLoading,
  applyIncidentFilters,
  incidentForm,
  setIncidentForm,
  createIncidentRecord,
  incidentLaneDefs,
  incidentLaneMap,
  nextIncidentStatus,
  incidentNotes,
  setIncidentNotes,
  incidentSeverityEdits,
  setIncidentSeverityEdits,
  updateIncidentRecord,
  addIncidentNoteRecord,
  transitionIncidentRecord,
  incidentStatusLabel,
  incidents,
  incidentPage,
  hasNextIncidentPage,
  onIncidentNextPage,
  onIncidentPrevPage,
  onOpenSupportSession,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  locale: string;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  loadIncidents: (cursor?: string, append?: boolean) => Promise<void>;
  isLoadingIncidents: boolean;
  incidentFilters: { businessId: string; status: string; severity: string };
  setIncidentFilters: Dispatch<
    SetStateAction<{ businessId: string; status: string; severity: string }>
  >;
  businessSelectOptions: SelectOption[];
  incidentStatusOptions: SelectOption[];
  incidentSeverityOptions: SelectOption[];
  actionLoading: Record<string, boolean>;
  applyIncidentFilters: () => Promise<void>;
  incidentForm: { businessId: string; reason: string; severity: string };
  setIncidentForm: Dispatch<
    SetStateAction<{ businessId: string; reason: string; severity: string }>
  >;
  createIncidentRecord: () => Promise<void>;
  incidentLaneDefs: {
    key: Incident['status'];
    label: string;
  }[];
  incidentLaneMap: Record<Incident['status'], Incident[]>;
  nextIncidentStatus: (
    status: Incident['status'],
  ) => Incident['status'] | null;
  incidentNotes: Record<string, string>;
  setIncidentNotes: Dispatch<SetStateAction<Record<string, string>>>;
  incidentSeverityEdits: Record<string, Incident['severity']>;
  setIncidentSeverityEdits: Dispatch<
    SetStateAction<Record<string, Incident['severity']>>
  >;
  updateIncidentRecord: (
    incidentId: string,
    payload: { severity?: Incident['severity'] },
  ) => Promise<void>;
  addIncidentNoteRecord: (incidentId: string) => Promise<void>;
  transitionIncidentRecord: (
    incidentId: string,
    toStatus: Incident['status'],
  ) => Promise<void>;
  incidentStatusLabel: (status: Incident['status']) => string;
  incidents: Incident[];
  incidentPage: number;
  hasNextIncidentPage: boolean;
  onIncidentNextPage: () => Promise<void>;
  onIncidentPrevPage: () => Promise<void>;
  onOpenSupportSession?: (businessId: string, severity: string, reason: string) => void;
}) {
  const severityLabels: Record<string, string> = {
    LOW: t('severityLow'),
    MEDIUM: t('severityMedium'),
    HIGH: t('severityHigh'),
    CRITICAL: t('severityCritical'),
  };

  if (!show) {
    return null;
  }

  return (
    <section className="command-card p-6 space-y-4 nvi-reveal">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">{t('incidentsTitle')}</h3>
        <button
          type="button"
          onClick={() => withAction('incidents:refresh', () => loadIncidents())}
          className="rounded border border-[color:var(--pt-accent-border-hi)] px-3 py-1 text-xs text-[color:var(--pt-text-1)]"
          disabled={isLoadingIncidents}
        >
          <span className="inline-flex items-center gap-2">
            {isLoadingIncidents ? <Spinner size="xs" variant="orbit" /> : null}
            {isLoadingIncidents ? t('loading') : t('refresh')}
          </span>
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
        <SmartSelect
          instanceId="platform-incidents-filter-business"
          value={incidentFilters.businessId}
          onChange={(value) =>
            setIncidentFilters((prev) => ({ ...prev, businessId: value }))
          }
          options={[
            { value: '', label: t('allBusinesses') },
            ...businessSelectOptions,
          ]}
          placeholder={t('filterByBusiness')}
        />
        <SmartSelect
          instanceId="platform-incidents-filter-status"
          value={incidentFilters.status}
          onChange={(value) =>
            setIncidentFilters((prev) => ({ ...prev, status: value }))
          }
          options={incidentStatusOptions}
          placeholder={t('allStatuses')}
        />
        <SmartSelect
          instanceId="platform-incidents-filter-severity"
          value={incidentFilters.severity}
          onChange={(value) =>
            setIncidentFilters((prev) => ({ ...prev, severity: value }))
          }
          options={[
            { value: '', label: t('allSeverities') },
            ...incidentSeverityOptions,
          ]}
          placeholder={t('incidentSeverityPlaceholder')}
        />
        <button
          type="button"
          onClick={() => withAction('incidents:apply', () => applyIncidentFilters())}
          className="rounded bg-[var(--pt-accent)] px-3 py-2 text-sm font-semibold text-black"
        >
          <span className="inline-flex items-center gap-2">
            {actionLoading['incidents:apply'] ? (
              <Spinner size="xs" variant="ring" />
            ) : null}
            {t('applyFilters')}
          </span>
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_2fr_auto]">
        <SmartSelect
          instanceId="platform-incidents-create-business"
          value={incidentForm.businessId}
          onChange={(value) =>
            setIncidentForm((prev) => ({ ...prev, businessId: value }))
          }
          options={businessSelectOptions}
          placeholder={t('selectBusiness')}
        />
        <SmartSelect
          instanceId="platform-incidents-create-severity"
          value={incidentForm.severity}
          onChange={(value) =>
            setIncidentForm((prev) => ({ ...prev, severity: value }))
          }
          options={incidentSeverityOptions}
          placeholder={t('incidentSeverityPlaceholder')}
        />
        <input
          value={incidentForm.reason}
          onChange={(event) =>
            setIncidentForm((prev) => ({ ...prev, reason: event.target.value }))
          }
          placeholder={t('incidentReasonPlaceholder')}
          className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
        />
        <button
          type="button"
          onClick={() =>
            withAction('incidents:create', () => createIncidentRecord())
          }
          className="rounded bg-[var(--pt-accent)] px-3 py-2 text-sm font-semibold text-black"
        >
          <span className="inline-flex items-center gap-2">
            {actionLoading['incidents:create'] ? (
              <Spinner size="xs" variant="ring" />
            ) : null}
            {t('createIncidentAction')}
          </span>
        </button>
      </div>
      <div className="overflow-x-auto">
      <div className="grid gap-3 grid-cols-5 min-w-[680px]">
        {incidentLaneDefs.map((lane) => (
          <div
            key={lane.key}
            className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3 text-xs text-[color:var(--pt-text-2)]"
          >
            <p className="mb-2 font-semibold text-[color:var(--pt-text-1)]">
              {lane.label} ({incidentLaneMap[lane.key]?.length ?? 0})
            </p>
            <div className="space-y-2">
              {(incidentLaneMap[lane.key] ?? []).map((incident) => {
                const nextStatus = nextIncidentStatus(incident.status);
                const noteValue = incidentNotes[incident.id] ?? '';
                return (
                  <div
                    key={incident.id}
                    className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-2"
                  >
                    <p className="text-[color:var(--pt-text-1)]">
                      {incident.business?.name ?? t('businessLabel')}
                    </p>
                    <p className="text-[11px] text-[color:var(--pt-text-muted)]">{incident.businessId}</p>
                    <p className="text-[11px]">
                      {t('incidentSeverityLabel', { value: formatEnum(severityLabels, incident.severity) })}
                    </p>
                    <p className="text-[11px]">
                      {t('incidentStatusLabel', {
                        value: incidentStatusLabel(incident.status),
                      })}
                    </p>
                    <p className="text-[11px] text-[color:var(--pt-text-muted)]">
                      {t('incidentOpenedAtLabel', {
                        value: new Date(incident.openedAt).toLocaleString(locale),
                      })}
                    </p>
                    <p className="mt-1 text-amber-200">
                      {t('riskFlagged', {
                        reason: incident.reason || t('notAvailable'),
                      })}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <SmartSelect
                        instanceId={`platform-incident-severity-${incident.id}`}
                        value={incidentSeverityEdits[incident.id] ?? incident.severity}
                        onChange={(value) =>
                          setIncidentSeverityEdits((prev) => ({
                            ...prev,
                            [incident.id]: value as Incident['severity'],
                          }))
                        }
                        options={incidentSeverityOptions}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          withAction(`incident:severity:${incident.id}`, () =>
                            updateIncidentRecord(incident.id, {
                              severity:
                                incidentSeverityEdits[incident.id] ??
                                incident.severity,
                            }),
                          )
                        }
                        className="rounded border border-[color:var(--pt-accent-border)] px-2 py-1 text-[11px]"
                      >
                        {t('saveAction')}
                      </button>
                    </div>
                    <input
                      value={noteValue}
                      onChange={(event) =>
                        setIncidentNotes((prev) => ({
                          ...prev,
                          [incident.id]: event.target.value,
                        }))
                      }
                      placeholder={t('actionReasonPlaceholder')}
                      className="mt-2 w-full rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-2 py-1 text-[11px] text-[color:var(--pt-text-1)]"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          withAction(`incident:note:${incident.id}`, () =>
                            addIncidentNoteRecord(incident.id),
                          )
                        }
                        className="rounded border border-[color:var(--pt-accent-border)] px-2 py-1 text-[11px]"
                      >
                        {t('incidentAddNote')}
                      </button>
                      {nextStatus ? (
                        <button
                          type="button"
                          onClick={() =>
                            withAction(`incident:transition:${incident.id}`, () =>
                              transitionIncidentRecord(incident.id, nextStatus),
                            )
                          }
                          className="rounded border border-[color:var(--pt-accent-border)] px-2 py-1 text-[11px]"
                        >
                          {t('incidentMoveTo', {
                            status: incidentStatusLabel(nextStatus),
                          })}
                        </button>
                      ) : null}
                      {onOpenSupportSession ? (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenSupportSession(
                              incident.businessId,
                              incident.severity,
                              incident.reason,
                            )
                          }
                          className="rounded border border-sky-700/50 px-2 py-1 text-[11px] text-sky-300"
                        >
                          {t('incidentOpenSupportSession')}
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-1">
                      {(incident.events ?? []).slice(0, 2).map((event) => (
                        <p key={event.id} className="text-[11px] text-[color:var(--pt-text-muted)]">
                          {event.eventType}
                          {event.note ? ` • ${event.note}` : ''}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!incidentLaneMap[lane.key]?.length ? (
                <p className="text-[11px] text-[color:var(--pt-text-muted)]">{t('laneEmpty')}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      </div>
      <div className="space-y-2 text-xs text-[color:var(--pt-text-2)] nvi-stagger">
        {!incidents.length && !isLoadingIncidents ? (
          <p className="text-[color:var(--pt-text-2)]">{t('noIncidents')}</p>
        ) : null}
        {(incidentPage > 1 || hasNextIncidentPage) ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => withAction('incidents:prev', () => onIncidentPrevPage())}
              className="inline-flex items-center gap-1 rounded border border-[color:var(--pt-accent-border)] px-3 py-1 text-xs text-[color:var(--pt-text-1)] disabled:opacity-40"
              disabled={incidentPage <= 1 || isLoadingIncidents}
            >
              {t('prevPage')}
            </button>
            <span className="text-[color:var(--pt-text-muted)]">{t('pageLabel', { page: incidentPage })}</span>
            <button
              type="button"
              onClick={() => withAction('incidents:next', () => onIncidentNextPage())}
              className="inline-flex items-center gap-1 rounded border border-[color:var(--pt-accent-border)] px-3 py-1 text-xs text-[color:var(--pt-text-1)] disabled:opacity-40"
              disabled={!hasNextIncidentPage || isLoadingIncidents}
            >
              {t('nextPage')}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
