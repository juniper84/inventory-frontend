import { useMemo, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { buildCursorQuery, normalizePaginated, type PaginatedResponse } from '@/lib/pagination';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

type PlatformIncident = {
  id: string;
  businessId: string;
  status: 'OPEN' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED' | 'CLOSED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title?: string | null;
  reason: string;
  source: string;
  ownerPlatformAdminId?: string | null;
  createdByPlatformAdminId?: string | null;
  openedAt: string;
  closedAt?: string | null;
  updatedAt: string;
  business?: { name: string } | null;
  events?: {
    id: string;
    eventType: string;
    note?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    createdAt: string;
    createdByAdminId?: string | null;
  }[];
};

export function usePlatformIncidents({
  token,
  t,
  setMessage,
}: {
  token: string | null;
  t: Translate;
  setMessage: (value: string | null) => void;
}) {
  const [incidents, setIncidents] = useState<PlatformIncident[]>([]);
  const [nextIncidentCursor, setNextIncidentCursor] = useState<string | null>(null);
  const [isLoadingIncidents, setIsLoadingIncidents] = useState(false);
  const [isLoadingMoreIncidents, setIsLoadingMoreIncidents] = useState(false);
  const [incidentFilters, setIncidentFilters] = useState({
    businessId: '',
    status: '',
    severity: '',
  });
  const [incidentForm, setIncidentForm] = useState({
    businessId: '',
    reason: '',
    severity: 'MEDIUM',
  });
  const [incidentNotes, setIncidentNotes] = useState<Record<string, string>>({});
  const [incidentSeverityEdits, setIncidentSeverityEdits] = useState<
    Record<string, PlatformIncident['severity']>
  >({});

  const loadIncidents = async (cursor?: string, append = false) => {
    if (!token) {
      return;
    }
    if (append) {
      setIsLoadingMoreIncidents(true);
    } else {
      setIsLoadingIncidents(true);
    }
    try {
      const query = buildCursorQuery({
        limit: 20,
        cursor,
        businessId: incidentFilters.businessId || undefined,
        status: incidentFilters.status || undefined,
        severity: incidentFilters.severity || undefined,
      });
      const response = await apiFetch<
        PaginatedResponse<PlatformIncident> | PlatformIncident[]
      >(`/platform/incidents${query}`, { token });
      const result = normalizePaginated(response);
      setIncidents((prev) => (append ? [...prev, ...result.items] : result.items));
      setNextIncidentCursor(result.nextCursor);
      setIncidentSeverityEdits((prev) => {
        const next = append ? { ...prev } : {};
        result.items.forEach((incident) => {
          if (!next[incident.id]) {
            next[incident.id] = incident.severity;
          }
        });
        return next;
      });
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('loadIncidentsFailed')));
    } finally {
      if (append) {
        setIsLoadingMoreIncidents(false);
      } else {
        setIsLoadingIncidents(false);
      }
    }
  };

  const applyIncidentFilters = async () => {
    await loadIncidents();
  };

  const createIncidentRecord = async () => {
    if (!token || !incidentForm.businessId || !incidentForm.reason.trim()) {
      setMessage(t('incidentCreateValidation'));
      return;
    }
    try {
      await apiFetch('/platform/incidents', {
        token,
        method: 'POST',
        body: JSON.stringify({
          businessId: incidentForm.businessId,
          reason: incidentForm.reason.trim(),
          severity: incidentForm.severity,
        }),
      });
      setIncidentForm({ businessId: '', reason: '', severity: 'MEDIUM' });
      await loadIncidents();
      setMessage(t('incidentCreated'));
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('incidentCreateFailed')));
    }
  };

  const transitionIncidentRecord = async (
    incidentId: string,
    toStatus: PlatformIncident['status'],
  ) => {
    if (!token) {
      return;
    }
    try {
      await apiFetch(`/platform/incidents/${incidentId}/transition`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          toStatus,
          note: incidentNotes[incidentId] || undefined,
        }),
      });
      await loadIncidents();
      setMessage(t('incidentTransitionSaved'));
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('incidentTransitionFailed')));
    }
  };

  const addIncidentNoteRecord = async (incidentId: string) => {
    if (!token) {
      return;
    }
    const note = incidentNotes[incidentId]?.trim();
    if (!note) {
      setMessage(t('incidentNoteRequired'));
      return;
    }
    try {
      await apiFetch(`/platform/incidents/${incidentId}/note`, {
        token,
        method: 'POST',
        body: JSON.stringify({ note }),
      });
      setIncidentNotes((prev) => ({ ...prev, [incidentId]: '' }));
      await loadIncidents();
      setMessage(t('incidentNoteAdded'));
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('incidentNoteFailed')));
    }
  };

  const updateIncidentRecord = async (
    incidentId: string,
    payload: {
      severity?: PlatformIncident['severity'];
      ownerPlatformAdminId?: string | null;
      reason?: string;
      title?: string | null;
    },
  ) => {
    if (!token) {
      return;
    }
    try {
      await apiFetch(`/platform/incidents/${incidentId}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await loadIncidents();
      setMessage(t('incidentUpdated'));
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('incidentUpdateFailed')));
    }
  };

  const incidentLaneMap = useMemo(() => {
    const lanes: Record<PlatformIncident['status'], PlatformIncident[]> = {
      OPEN: [],
      INVESTIGATING: [],
      MITIGATED: [],
      RESOLVED: [],
      CLOSED: [],
    };
    incidents.forEach((incident) => {
      lanes[incident.status]?.push(incident);
    });
    return lanes;
  }, [incidents]);

  return {
    incidents,
    nextIncidentCursor,
    isLoadingIncidents,
    isLoadingMoreIncidents,
    incidentFilters,
    setIncidentFilters,
    incidentForm,
    setIncidentForm,
    incidentNotes,
    setIncidentNotes,
    incidentSeverityEdits,
    setIncidentSeverityEdits,
    loadIncidents,
    applyIncidentFilters,
    createIncidentRecord,
    transitionIncidentRecord,
    addIncidentNoteRecord,
    updateIncidentRecord,
    incidentLaneMap,
  };
}
