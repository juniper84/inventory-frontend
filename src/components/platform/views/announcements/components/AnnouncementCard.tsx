'use client';

import { useState } from 'react';
import {
  Megaphone,
  Info,
  AlertTriangle,
  ShieldAlert,
  Edit3,
  Square,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  Globe,
  Building2,
  Filter,
  Save,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { Spinner } from '@/components/Spinner';
import type {
  Announcement,
  AnnouncementSeverity,
} from '../hooks/useAnnouncements';

type Lifecycle = 'active' | 'upcoming' | 'ended';

type Props = {
  announcement: Announcement;
  isEditing: boolean;
  isSavingEdit: boolean;
  isEnding: boolean;
  isDeleting: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (patch: {
    title: string;
    message: string;
    severity: AnnouncementSeverity;
    reason: string | null;
  }) => void;
  onEnd: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  formatDateTime: (date: Date | string | null | undefined) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const SEVERITY_COLOR: Record<AnnouncementSeverity, string> = {
  INFO: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  WARNING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  SECURITY: 'bg-red-500/20 text-red-300 border-red-500/40',
};

const SEVERITY_ICON: Record<AnnouncementSeverity, typeof Info> = {
  INFO: Info,
  WARNING: AlertTriangle,
  SECURITY: ShieldAlert,
};

const LIFECYCLE_STYLE: Record<Lifecycle, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  upcoming: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  ended: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

function getLifecycle(announcement: Announcement): Lifecycle {
  const now = Date.now();
  const start = new Date(announcement.startsAt).getTime();
  if (start > now) return 'upcoming';
  const end = announcement.endsAt
    ? new Date(announcement.endsAt).getTime()
    : null;
  if (end !== null && end < now) return 'ended';
  return 'active';
}

export function AnnouncementCard({
  announcement,
  isEditing,
  isSavingEdit,
  isEnding,
  isDeleting,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEnd,
  onDelete,
  onDuplicate,
  formatDateTime,
  t,
}: Props) {
  const [messageExpanded, setMessageExpanded] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editTitle, setEditTitle] = useState(announcement.title);
  const [editMessage, setEditMessage] = useState(announcement.message);
  const [editSeverity, setEditSeverity] = useState<AnnouncementSeverity>(
    announcement.severity,
  );
  const [editReason, setEditReason] = useState(announcement.reason ?? '');

  const lifecycle = getLifecycle(announcement);
  const Icon = SEVERITY_ICON[announcement.severity];
  const canEdit = lifecycle === 'active' || lifecycle === 'upcoming';
  const canEnd = lifecycle === 'active';
  const canDelete = lifecycle === 'ended';
  const canDuplicate = lifecycle === 'ended';

  const tierTargets = announcement.segmentTargets.filter(
    (s) => s.type === 'TIER',
  );
  const statusTargets = announcement.segmentTargets.filter(
    (s) => s.type === 'STATUS',
  );
  const isBroadcast =
    announcement.businessTargets.length === 0 &&
    tierTargets.length === 0 &&
    statusTargets.length === 0;

  const handleSaveEdit = () => {
    onSaveEdit({
      title: editTitle.trim(),
      message: editMessage.trim(),
      severity: editSeverity,
      reason: editReason.trim() || null,
    });
  };

  return (
    <Card
      padding="md"
      className="nvi-slide-in-bottom hover:border-[var(--pt-accent-border)] transition"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <div
            className={`mt-0.5 inline-flex items-center justify-center rounded-md border h-5 w-5 ${SEVERITY_COLOR[announcement.severity]}`}
          >
            <Icon size={11} />
          </div>
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <TextInput
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={t('cardEditTitlePlaceholder')}
              />
            ) : (
              <h3 className="text-sm font-semibold text-[var(--pt-text-1)] truncate">
                {announcement.title}
              </h3>
            )}
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${LIFECYCLE_STYLE[lifecycle]}`}
              >
                {lifecycle === 'active' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
                {t(`cardLifecycle.${lifecycle}`)}
              </span>
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${SEVERITY_COLOR[announcement.severity]}`}
              >
                {announcement.severity}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Severity selector (edit only) */}
      {isEditing && (
        <div className="mt-3 flex gap-1.5">
          {(['INFO', 'WARNING', 'SECURITY'] as AnnouncementSeverity[]).map(
            (sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setEditSeverity(sev)}
                className={`flex-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition nvi-press ${
                  editSeverity === sev
                    ? SEVERITY_COLOR[sev]
                    : 'border-white/[0.06] bg-white/[0.02] text-[var(--pt-text-muted)]'
                }`}
              >
                {sev}
              </button>
            ),
          )}
        </div>
      )}

      {/* Body */}
      <div className="mt-2">
        {isEditing ? (
          <Textarea
            value={editMessage}
            onChange={(e) => setEditMessage(e.target.value)}
            placeholder={t('cardEditMessagePlaceholder')}
            rows={3}
          />
        ) : (
          <>
            <p
              className={`text-xs text-[var(--pt-text-2)] whitespace-pre-wrap ${
                messageExpanded ? '' : 'line-clamp-2'
              }`}
            >
              {announcement.message}
            </p>
            {announcement.message.length > 120 && (
              <button
                type="button"
                onClick={() => setMessageExpanded((e) => !e)}
                className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
              >
                {messageExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {messageExpanded ? t('cardLess') : t('cardMore')}
              </button>
            )}
          </>
        )}
      </div>

      {isEditing && (
        <div className="mt-2">
          <TextInput
            label={t('cardEditReasonLabel')}
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            placeholder={t('cardEditReasonPlaceholder')}
          />
        </div>
      )}

      {!isEditing && announcement.reason && (
        <p className="mt-1.5 text-[10px] italic text-[var(--pt-text-muted)]">
          {t('cardReasonPrefix')}: {announcement.reason}
        </p>
      )}

      {/* Targeting + dates */}
      {!isEditing && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {isBroadcast ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--pt-accent)]/10 border border-[var(--pt-accent)]/30 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--pt-accent)]">
                <Globe size={9} />
                {t('cardBroadcast')}
              </span>
            ) : (
              <>
                {announcement.businessTargets.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 text-[9px] text-[var(--pt-text-2)]">
                    <Building2 size={9} />
                    {t('cardSpecificBusinesses', {
                      count: announcement.businessTargets.length,
                    })}
                  </span>
                )}
                {tierTargets.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 text-[9px] text-[var(--pt-text-2)]">
                    <Filter size={9} />
                    {tierTargets.map((s) => s.value).join(', ')}
                  </span>
                )}
                {statusTargets.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 text-[9px] text-[var(--pt-text-2)]">
                    {statusTargets.map((s) => s.value).join(', ')}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--pt-text-muted)]">
            <span>
              {t('cardStarts')}: {formatDateTime(announcement.startsAt)}
            </span>
            <span>
              {t('cardEnds')}:{' '}
              {announcement.endsAt
                ? formatDateTime(announcement.endsAt)
                : t('cardOpenEnded')}
            </span>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={
                !editTitle.trim() || !editMessage.trim() || isSavingEdit
              }
              className="inline-flex items-center gap-1 rounded-md bg-[var(--pt-accent)] px-2 py-1 text-[10px] font-semibold text-black disabled:opacity-50 nvi-press"
            >
              {isSavingEdit ? (
                <Spinner size="xs" variant="dots" />
              ) : (
                <Save size={11} />
              )}
              {t('cardSaveEdit')}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)] nvi-press"
            >
              <X size={11} />
              {t('cardCancelEdit')}
            </button>
          </>
        ) : (
          <>
            {canEdit && (
              <button
                type="button"
                onClick={onStartEdit}
                className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)] nvi-press"
              >
                <Edit3 size={11} />
                {t('cardEdit')}
              </button>
            )}
            {canEnd && (
              <button
                type="button"
                onClick={() => {
                  if (confirmEnd) {
                    onEnd();
                    setConfirmEnd(false);
                  } else {
                    setConfirmEnd(true);
                    setTimeout(() => setConfirmEnd(false), 4000);
                  }
                }}
                disabled={isEnding}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold disabled:opacity-50 nvi-press ${
                  confirmEnd
                    ? 'border-red-500/40 bg-red-500/15 text-red-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                }`}
              >
                {isEnding ? (
                  <Spinner size="xs" variant="dots" />
                ) : (
                  <Square size={11} />
                )}
                {confirmEnd ? t('cardEndConfirm') : t('cardEnd')}
              </button>
            )}
            {canDuplicate && (
              <button
                type="button"
                onClick={onDuplicate}
                className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/20 nvi-press"
              >
                <Copy size={11} />
                {t('cardDuplicate')}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirmDelete) {
                    onDelete();
                    setConfirmDelete(false);
                  } else {
                    setConfirmDelete(true);
                    setTimeout(() => setConfirmDelete(false), 4000);
                  }
                }}
                disabled={isDeleting}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold disabled:opacity-50 nvi-press ${
                  confirmDelete
                    ? 'border-red-500/50 bg-red-500/20 text-red-200'
                    : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                }`}
              >
                {isDeleting ? (
                  <Spinner size="xs" variant="dots" />
                ) : (
                  <Trash2 size={11} />
                )}
                {confirmDelete ? t('cardDeleteConfirm') : t('cardDelete')}
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
