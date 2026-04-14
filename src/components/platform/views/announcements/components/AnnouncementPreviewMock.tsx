'use client';

import { Megaphone, Info, AlertTriangle, ShieldAlert } from 'lucide-react';
import type {
  AnnouncementForm,
  AnnouncementSeverity,
} from '../hooks/useAnnouncements';

type Props = {
  form: AnnouncementForm;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const SEVERITY_BAR: Record<AnnouncementSeverity, string> = {
  INFO: 'bg-blue-500',
  WARNING: 'bg-amber-500',
  SECURITY: 'bg-red-500',
};

const SEVERITY_ICON_BG: Record<AnnouncementSeverity, string> = {
  INFO: 'bg-blue-500/15 text-blue-300',
  WARNING: 'bg-amber-500/15 text-amber-300',
  SECURITY: 'bg-red-500/15 text-red-300',
};

const SEVERITY_ICON: Record<AnnouncementSeverity, typeof Info> = {
  INFO: Info,
  WARNING: AlertTriangle,
  SECURITY: ShieldAlert,
};

/**
 * Visual mock of how the announcement appears in the business app's
 * notification panel. Updates live as the admin types.
 */
export function AnnouncementPreviewMock({ form, t }: Props) {
  const Icon = SEVERITY_ICON[form.severity];
  const previewTitle = form.title.trim() || t('previewMockEmptyTitle');
  const previewMessage = form.message.trim() || t('previewMockEmptyMessage');
  const isEmpty = !form.title.trim() && !form.message.trim();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
        <Megaphone size={11} />
        {t('previewMockHeader')}
      </div>

      {/* Mock business-side card */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0a] shadow-2xl">
        {/* Severity color bar */}
        <div className={`h-1 w-full ${SEVERITY_BAR[form.severity]}`} />

        <div className="p-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${SEVERITY_ICON_BG[form.severity]}`}
            >
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--pt-text-muted)]">
                {form.severity}
              </p>
              <h3
                className={`mt-0.5 text-sm font-bold ${
                  isEmpty
                    ? 'text-[var(--pt-text-muted)] italic'
                    : 'text-[var(--pt-text-1)]'
                }`}
              >
                {previewTitle}
              </h3>
              <p
                className={`mt-2 text-xs whitespace-pre-wrap ${
                  isEmpty
                    ? 'text-[var(--pt-text-muted)] italic'
                    : 'text-[var(--pt-text-2)]'
                }`}
              >
                {previewMessage}
              </p>
              {form.publishImmediately && (
                <p className="mt-3 text-[10px] text-[var(--pt-text-muted)]">
                  {t('previewMockPublishedNow')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-[var(--pt-text-muted)] leading-snug">
        {t('previewMockReplaceWarning')}
      </p>
    </div>
  );
}
