'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Megaphone,
  Info,
  AlertTriangle,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { useFormatDate } from '@/lib/business-context';

export type BusinessAnnouncement = {
  id: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'SECURITY';
  startsAt: string;
  endsAt?: string | null;
};

const SEVERITY_BAR: Record<BusinessAnnouncement['severity'], string> = {
  INFO: 'bg-blue-500',
  WARNING: 'bg-amber-500',
  SECURITY: 'bg-red-500',
};

const SEVERITY_ICON_BG: Record<BusinessAnnouncement['severity'], string> = {
  INFO: 'bg-blue-500/15 text-blue-300',
  WARNING: 'bg-amber-500/15 text-amber-300',
  SECURITY: 'bg-red-500/15 text-red-300',
};

const SEVERITY_ICON: Record<BusinessAnnouncement['severity'], typeof Info> = {
  INFO: Info,
  WARNING: AlertTriangle,
  SECURITY: ShieldAlert,
};

const STORAGE_KEY = 'nvi.dismissedAnnouncements';

/**
 * localStorage helpers for dismissed announcement IDs.
 * Stored as JSON array of IDs. Cleaned up when announcements end.
 */
export function getDismissedAnnouncementIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

export function addDismissedAnnouncementId(id: string): void {
  if (typeof window === 'undefined') return;
  const current = getDismissedAnnouncementIds();
  if (current.includes(id)) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, id]));
}

export function pruneDismissedAnnouncementIds(activeIds: string[]): void {
  if (typeof window === 'undefined') return;
  const current = getDismissedAnnouncementIds();
  const activeSet = new Set(activeIds);
  const next = current.filter((id) => activeSet.has(id));
  if (next.length !== current.length) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}

type Props = {
  announcements: BusinessAnnouncement[];
  // 'unseen' shows only those not yet dismissed; 'all' shows everything (review mode)
  mode: 'unseen' | 'all';
  onClose: () => void;
};

export function AnnouncementOverlay({ announcements, mode, onClose }: Props) {
  const t = useTranslations('notifications');
  const { formatDateTime } = useFormatDate();
  const [index, setIndex] = useState(0);

  // Filter by mode at render time so dismissals re-evaluate immediately
  const visible = useMemo(() => {
    if (mode === 'all') return announcements;
    const dismissed = new Set(getDismissedAnnouncementIds());
    return announcements.filter((a) => !dismissed.has(a.id));
  }, [announcements, mode]);

  // Reset index if it falls out of range after dismissal
  useEffect(() => {
    if (index >= visible.length && visible.length > 0) {
      setIndex(visible.length - 1);
    }
  }, [visible.length, index]);

  // Auto-close when nothing left to show
  useEffect(() => {
    if (visible.length === 0) {
      onClose();
    }
  }, [visible.length, onClose]);

  if (visible.length === 0) return null;

  const current = visible[Math.min(index, visible.length - 1)];
  if (!current) return null;
  const Icon = SEVERITY_ICON[current.severity];
  const total = visible.length;

  const handleDismiss = () => {
    addDismissedAnnouncementId(current.id);
    if (mode === 'unseen') {
      // Force re-render via state change — visible is recomputed each render
      // and the useEffect above closes when empty. Just nudge the index.
      if (index >= total - 1) {
        setIndex(0);
      }
      // Trigger re-render
      setIndex((i) => i);
    } else {
      // In 'all' mode, advance to next
      if (index < total - 1) {
        setIndex(index + 1);
      } else {
        onClose();
      }
    }
  };

  const handlePrev = () => {
    setIndex((i) => Math.max(0, i - 1));
  };

  const handleNext = () => {
    setIndex((i) => Math.min(total - 1, i + 1));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div
        className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        {/* Severity bar */}
        <div className={`h-1.5 w-full ${SEVERITY_BAR[current.severity]}`} />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${SEVERITY_ICON_BG[current.severity]}`}
            >
              <Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.25em] text-[color:var(--muted)]">
                <Megaphone size={10} className="mr-1 inline" />
                {t('announcement')} • {current.severity}
              </p>
              <h3 className="mt-1 text-lg font-bold text-[color:var(--foreground)]">
                {current.title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[40vh] overflow-y-auto px-5 py-4">
          <p className="text-sm text-[color:var(--foreground)] whitespace-pre-wrap">
            {current.message}
          </p>
          <p className="mt-3 text-[11px] text-[color:var(--muted)]">
            {formatDateTime(current.startsAt)}
          </p>
        </div>

        {/* Footer with prev/next + dismiss */}
        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border)] bg-black/20 px-5 py-3">
          {total > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={index === 0}
                className="rounded-md border border-[color:var(--border)] p-1 text-[color:var(--muted)] disabled:opacity-30 hover:text-[color:var(--foreground)]"
                aria-label={t('prevAnnouncement')}
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[11px] text-[color:var(--muted)] tabular-nums">
                {t('announcementCounter', { current: index + 1, total })}
              </span>
              <button
                type="button"
                onClick={handleNext}
                disabled={index >= total - 1}
                className="rounded-md border border-[color:var(--border)] p-1 text-[color:var(--muted)] disabled:opacity-30 hover:text-[color:var(--foreground)]"
                aria-label={t('nextAnnouncement')}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={mode === 'unseen' ? handleDismiss : onClose}
            className="rounded-md border border-[color:var(--border)] bg-[color:var(--accent)] px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90"
          >
            {mode === 'unseen' ? t('dismiss') : t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
