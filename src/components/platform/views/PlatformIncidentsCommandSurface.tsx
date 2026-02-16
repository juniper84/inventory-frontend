import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import type { Dispatch, SetStateAction } from 'react';

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
  nextIncidentCursor,
  isLoadingMoreIncidents,
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
  nextIncidentCursor: string | null;
  isLoadingMoreIncidents: boolean;
}) {
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
          className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
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
          value={incidentFilters.status}
          onChange={(value) =>
            setIncidentFilters((prev) => ({ ...prev, status: value }))
          }
          options={incidentStatusOptions}
          placeholder={t('allStatuses')}
        />
        <SmartSelect
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
          className="rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black"
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
          value={incidentForm.businessId}
          onChange={(value) =>
            setIncidentForm((prev) => ({ ...prev, businessId: value }))
          }
          options={businessSelectOptions}
          placeholder={t('selectBusinessToFlag')}
        />
        <SmartSelect
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
          placeholder={t('reviewFlagReasonPlaceholder')}
          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <button
          type="button"
          onClick={() =>
            withAction('incidents:create', () => createIncidentRecord())
          }
          className="rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black"
        >
          <span className="inline-flex items-center gap-2">
            {actionLoading['incidents:create'] ? (
              <Spinner size="xs" variant="ring" />
            ) : null}
            {t('flagForReview')}
          </span>
        </button>
      </div>
      <div className="grid gap-3 xl:grid-cols-5">
        {incidentLaneDefs.map((lane) => (
          <div
            key={lane.key}
            className="rounded border border-gold-700/40 bg-black/25 p-3 text-xs text-gold-300"
          >
            <p className="mb-2 font-semibold text-gold-100">
              {lane.label} ({incidentLaneMap[lane.key]?.length ?? 0})
            </p>
            <div className="space-y-2">
              {(incidentLaneMap[lane.key] ?? []).map((incident) => {
                const nextStatus = nextIncidentStatus(incident.status);
                const noteValue = incidentNotes[incident.id] ?? '';
                return (
                  <div
                    key={incident.id}
                    className="rounded border border-gold-700/40 bg-black/40 p-2"
                  >
                    <p className="text-gold-100">
                      {incident.business?.name ?? t('businessLabel')}
                    </p>
                    <p className="text-[11px] text-gold-500">{incident.businessId}</p>
                    <p className="text-[11px]">
                      {t('incidentSeverityLabel', { value: incident.severity })}
                    </p>
                    <p className="text-[11px]">
                      {t('incidentStatusLabel', {
                        value: incidentStatusLabel(incident.status),
                      })}
                    </p>
                    <p className="text-[11px] text-gold-500">
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
                        className="rounded border border-gold-700/50 px-2 py-1 text-[11px]"
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
                      className="mt-2 w-full rounded border border-gold-700/50 bg-black px-2 py-1 text-[11px] text-gold-100"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          withAction(`incident:note:${incident.id}`, () =>
                            addIncidentNoteRecord(incident.id),
                          )
                        }
                        className="rounded border border-gold-700/50 px-2 py-1 text-[11px]"
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
                          className="rounded border border-gold-700/50 px-2 py-1 text-[11px]"
                        >
                          {t('incidentMoveTo', {
                            status: incidentStatusLabel(nextStatus),
                          })}
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-1">
                      {(incident.events ?? []).slice(0, 2).map((event) => (
                        <p key={event.id} className="text-[11px] text-gold-500">
                          {event.eventType}
                          {event.note ? ` • ${event.note}` : ''}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!incidentLaneMap[lane.key]?.length ? (
                <p className="text-[11px] text-gold-500">{t('laneEmpty')}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
        {!incidents.length && !isLoadingIncidents ? (
          <p className="text-gold-400">{t('noIncidents')}</p>
        ) : null}
        {nextIncidentCursor ? (
          <button
            type="button"
            onClick={() =>
              withAction('incidents:loadMore', () =>
                loadIncidents(nextIncidentCursor, true),
              )
            }
            className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:opacity-70"
            disabled={isLoadingMoreIncidents}
          >
            {isLoadingMoreIncidents ? <Spinner size="xs" variant="grid" /> : null}
            {t('loadMore')}
          </button>
        ) : null}
      </div>
    </section>
  );
}
