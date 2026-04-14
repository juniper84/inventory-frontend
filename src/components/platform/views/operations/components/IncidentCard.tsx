'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Send,
  Plus,
  AlertTriangle,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Wrench,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import {
  type Incident,
  type IncidentStatus,
  type IncidentSeverity,
  INCIDENT_TRANSITIONS,
} from '../hooks/useIncidents';

type Props = {
  incident: Incident;
  locale: string;
  isTransitioning: boolean;
  isAddingNote: boolean;
  isSavingSeverity: boolean;
  onTransition: (
    toStatus: IncidentStatus,
    reason: string,
    note?: string,
  ) => void;
  onAddNote: (note: string) => void;
  onUpdateSeverity: (severity: IncidentSeverity) => void;
  formatDateTime: (date: Date | string | null | undefined) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  LOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  CRITICAL: 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse',
};

const STATUS_ICON: Record<IncidentStatus, typeof AlertTriangle> = {
  OPEN: AlertTriangle,
  INVESTIGATING: Activity,
  MITIGATED: Wrench,
  RESOLVED: CheckCircle,
  CLOSED: XCircle,
};

const STATUS_COLOR: Record<IncidentStatus, string> = {
  OPEN: 'text-red-400 bg-red-500/15',
  INVESTIGATING: 'text-amber-400 bg-amber-500/15',
  MITIGATED: 'text-blue-400 bg-blue-500/15',
  RESOLVED: 'text-emerald-400 bg-emerald-500/15',
  CLOSED: 'text-zinc-400 bg-zinc-500/15',
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

export function IncidentCard({
  incident,
  locale,
  isTransitioning,
  isAddingNote,
  isSavingSeverity,
  onTransition,
  onAddNote,
  onUpdateSeverity,
  formatDateTime,
  t,
}: Props) {
  const [reasonExpanded, setReasonExpanded] = useState(false);
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [transitionTarget, setTransitionTarget] =
    useState<IncidentStatus | null>(null);
  const [transitionReason, setTransitionReason] = useState('');
  const [transitionNote, setTransitionNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [severityFlash, setSeverityFlash] = useState(false);

  const StatusIcon = STATUS_ICON[incident.status];
  const businessName = incident.business?.name ?? incident.businessId;
  const validTransitions = INCIDENT_TRANSITIONS[incident.status];

  const severityOptions = [
    { value: 'LOW', label: t('severityLow') },
    { value: 'MEDIUM', label: t('severityMedium') },
    { value: 'HIGH', label: t('severityHigh') },
    { value: 'CRITICAL', label: t('severityCritical') },
  ];

  const handleSeverityChange = async (value: string) => {
    const sev = value as IncidentSeverity;
    if (sev === incident.severity) return;
    await onUpdateSeverity(sev);
    setSeverityFlash(true);
    setTimeout(() => setSeverityFlash(false), 1200);
  };

  const handleTransitionSubmit = () => {
    if (!transitionTarget || !transitionReason.trim()) return;
    onTransition(
      transitionTarget,
      transitionReason,
      transitionNote || undefined,
    );
    setTransitionTarget(null);
    setTransitionReason('');
    setTransitionNote('');
  };

  const handleNoteSubmit = () => {
    if (!noteDraft.trim()) return;
    onAddNote(noteDraft);
    setNoteDraft('');
    setShowNoteInput(false);
  };

  return (
    <Card
      padding="md"
      className={`nvi-slide-in-bottom hover:border-[var(--pt-accent-border)] transition ${
        severityFlash ? 'nvi-save-flash' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {/* Severity dot */}
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${SEVERITY_COLOR[incident.severity]}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {incident.severity}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)] truncate">
              {incident.title || incident.reason}
            </h3>
            <Link
              href={`/${locale}/platform/businesses/${incident.businessId}`}
              className="inline-flex items-center gap-0.5 text-[10px] text-[var(--pt-text-muted)] hover:text-[var(--pt-accent)] transition"
            >
              {businessName}
              <ExternalLink size={9} />
            </Link>
          </div>
        </div>

        {/* Status pill */}
        <div
          className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[incident.status]}`}
        >
          <StatusIcon size={11} />
          {t(`incidentStatus.${incident.status}`)}
        </div>
      </div>

      {/* Reason body (expandable) */}
      {incident.title && (
        <div className="mt-2">
          <p
            className={`text-xs text-[var(--pt-text-2)] ${
              reasonExpanded ? '' : 'line-clamp-2'
            }`}
          >
            {incident.reason}
          </p>
          {incident.reason.length > 100 && (
            <button
              type="button"
              onClick={() => setReasonExpanded((e) => !e)}
              className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
            >
              {reasonExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {reasonExpanded ? t('cardLessText') : t('cardMoreText')}
            </button>
          )}
        </div>
      )}

      {/* Meta row */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--pt-text-muted)]">
        <span className="inline-flex items-center gap-1">
          <Clock size={10} />
          {t('opIncidentOpened')}: {relativeTime(incident.openedAt)}
        </span>
        <span title={formatDateTime(incident.openedAt)}>
          {formatDateTime(incident.openedAt)}
        </span>
        {incident.closedAt && (
          <span className="text-emerald-400">
            {t('opIncidentClosed')}: {relativeTime(incident.closedAt)}
          </span>
        )}
        <span className="rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5">
          {incident.source}
        </span>
      </div>

      {/* Severity edit */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
          {t('incidentSeverity')}:
        </span>
        <div className="flex-1 max-w-[160px]">
          <SmartSelect
            instanceId={`incident-severity-${incident.id}`}
            value={incident.severity}
            onChange={handleSeverityChange}
            options={severityOptions}
            isDisabled={isSavingSeverity}
          />
        </div>
        {isSavingSeverity && <Spinner size="xs" variant="dots" />}
      </div>

      {/* State machine transitions */}
      {validTransitions.length > 0 && !transitionTarget && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)] mb-1.5">
            {t('opIncidentMoveTo')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {validTransitions.map((target) => {
              const TargetIcon = STATUS_ICON[target];
              return (
                <button
                  key={target}
                  type="button"
                  onClick={() => setTransitionTarget(target)}
                  disabled={isTransitioning}
                  className={`inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-[var(--pt-text-2)] hover:border-[var(--pt-accent-border)] hover:text-[var(--pt-text-1)] disabled:opacity-50 nvi-press`}
                >
                  <TargetIcon size={11} />
                  {t(`incidentStatus.${target}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Transition form (inline) */}
      {transitionTarget && (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2">
          <p className="text-[10px] font-semibold text-amber-300">
            {t('incidentTransitionTo', {
              status: t(`incidentStatus.${transitionTarget}`),
            })}
          </p>
          <TextInput
            value={transitionReason}
            onChange={(e) => setTransitionReason(e.target.value)}
            placeholder={t('incidentTransitionReasonPlaceholder')}
          />
          <TextInput
            value={transitionNote}
            onChange={(e) => setTransitionNote(e.target.value)}
            placeholder={t('incidentTransitionNotePlaceholder')}
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setTransitionTarget(null);
                setTransitionReason('');
                setTransitionNote('');
              }}
              className="rounded-md px-2 py-1 text-[10px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
            >
              {t('cardCancel')}
            </button>
            <button
              type="button"
              onClick={handleTransitionSubmit}
              disabled={!transitionReason.trim() || isTransitioning}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--pt-accent)] px-2 py-1 text-[10px] font-semibold text-black disabled:opacity-50 nvi-press"
            >
              {isTransitioning ? (
                <Spinner size="xs" variant="dots" />
              ) : (
                <Send size={11} />
              )}
              {t('incidentTransitionConfirm')}
            </button>
          </div>
        </div>
      )}

      {/* Add Note (separate from transition) */}
      {!showNoteInput && !transitionTarget && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowNoteInput(true)}
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)] nvi-press"
          >
            <Plus size={11} />
            {t('opIncidentAddNote')}
          </button>
        </div>
      )}

      {showNoteInput && (
        <div className="mt-2 space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
          <TextInput
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder={t('incidentAddNotePlaceholder')}
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setShowNoteInput(false);
                setNoteDraft('');
              }}
              className="rounded-md px-2 py-1 text-[10px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
            >
              {t('cardCancel')}
            </button>
            <button
              type="button"
              onClick={handleNoteSubmit}
              disabled={!noteDraft.trim() || isAddingNote}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--pt-accent)] px-2 py-1 text-[10px] font-semibold text-black disabled:opacity-50 nvi-press"
            >
              {isAddingNote ? (
                <Spinner size="xs" variant="dots" />
              ) : (
                <Send size={11} />
              )}
              {t('incidentAddNoteConfirm')}
            </button>
          </div>
        </div>
      )}

      {/* Event timeline (expandable, all events not capped at 2) */}
      {incident.events && incident.events.length > 0 && (
        <div className="mt-3 border-t border-white/[0.06] pt-2">
          <button
            type="button"
            onClick={() => setEventsExpanded((e) => !e)}
            className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
          >
            {eventsExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {t('incidentEvents', { count: incident.events.length })}
          </button>
          {eventsExpanded && (
            <div className="mt-2 space-y-1.5">
              {incident.events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-2 rounded-md bg-white/[0.02] px-2 py-1"
                >
                  <span className="rounded-md bg-white/[0.06] px-1 py-0.5 text-[8px] font-semibold uppercase text-[var(--pt-text-2)]">
                    {event.eventType}
                  </span>
                  <div className="flex-1 min-w-0">
                    {event.note && (
                      <p className="text-[10px] text-[var(--pt-text-1)]">
                        {event.note}
                      </p>
                    )}
                    {event.fromStatus && event.toStatus && (
                      <p className="text-[9px] text-[var(--pt-text-muted)]">
                        {event.fromStatus} → {event.toStatus}
                      </p>
                    )}
                  </div>
                  <span
                    className="text-[9px] text-[var(--pt-text-muted)]"
                    title={formatDateTime(event.createdAt)}
                  >
                    {relativeTime(event.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
