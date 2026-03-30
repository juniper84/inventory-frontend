import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useState } from 'react';
import { DateTimePickerInput } from '@/components/DateTimePickerInput';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';
import { TypeaheadInput } from '@/components/TypeaheadInput';
import { formatDateTimeWithTz } from '@/lib/date-format';

type BusinessOption = { id: string; label: string };

type AnnouncementFormState = {
  title: string;
  message: string;
  severity: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  targetBusinessIds: string[];
  targetTiers: string[];
  targetStatuses: string[];
};

type AudiencePreview = {
  estimatedReach: { total: number; explicit: number; segment: number };
  filters: { hasBroadcastScope: boolean };
  sampleBusinesses: { id: string; name: string }[];
};

type Announcement = {
  id: string;
  title: string;
  severity: string;
  startsAt: string;
  endsAt?: string | null;
  businessTargets: { businessId: string }[];
  segmentTargets: { type: 'TIER' | 'STATUS'; value: string }[];
};

type Timeline = {
  active: Announcement[];
  upcoming: Announcement[];
  ended: Announcement[];
};

const SEVERITY_PILL: Record<string, string> = {
  INFO: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  WARNING: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  SECURITY: 'border-red-500/40 bg-red-500/10 text-red-300',
  CRITICAL: 'border-red-500/40 bg-red-500/10 text-red-300',
};

export function PlatformAnnouncementsCommandSurface({
  show,
  t,
  announcementForm,
  setAnnouncementForm,
  createAnnouncement,
  announcementBusinessSearch,
  setAnnouncementBusinessSearch,
  businessOptions,
  businessLookup,
  announcementTierOptions,
  announcementStatusOptions,
  previewAnnouncementAudience,
  isPreviewingAnnouncementAudience,
  announcementAudiencePreview,
  isCreatingAnnouncement,
  announcementPreviewSignature,
  announcementTargetSignature,
  applyDefaultAnnouncementEnd,
  announcementTimeline,
  endingAnnouncementId,
  endAnnouncement,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  announcementForm: AnnouncementFormState;
  setAnnouncementForm: Dispatch<SetStateAction<AnnouncementFormState>>;
  createAnnouncement: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  announcementBusinessSearch: string;
  setAnnouncementBusinessSearch: (value: string) => void;
  businessOptions: BusinessOption[];
  businessLookup: Map<string, { name: string }>;
  announcementTierOptions: { value: string; label: string }[];
  announcementStatusOptions: { value: string; label: string }[];
  previewAnnouncementAudience: () => Promise<void>;
  isPreviewingAnnouncementAudience: boolean;
  announcementAudiencePreview: AudiencePreview | null;
  isCreatingAnnouncement: boolean;
  announcementPreviewSignature: string;
  announcementTargetSignature: string;
  applyDefaultAnnouncementEnd: (
    startsAt: string,
    currentEndsAt: string,
  ) => string;
  announcementTimeline: Timeline;
  endingAnnouncementId: string | null;
  endAnnouncement: (announcementId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<'COMPOSE' | 'TIMELINE'>('COMPOSE');

  if (!show) {
    return null;
  }

  const activeCount = announcementTimeline.active.length;

  return (
    <section className="command-card p-6 space-y-4 nvi-reveal">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">{t('announcementsTitle')}</h3>
        <div className="flex items-center gap-1 rounded border border-[color:var(--pt-accent-border)] p-0.5">
          {(['COMPOSE', 'TIMELINE'] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setTab(tabKey)}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === tabKey
                  ? 'bg-[var(--pt-accent)] text-black'
                  : 'text-[color:var(--pt-text-2)] hover:text-[color:var(--pt-text-1)]'
              }`}
            >
              {tabKey === 'COMPOSE' ? t('announcementsTabCompose') : t('announcementsTabTimeline')}
              {tabKey === 'TIMELINE' && activeCount > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                    tab === 'TIMELINE'
                      ? 'bg-black/20 text-black'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  {activeCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {tab === 'COMPOSE' ? (
        <form className="space-y-6" onSubmit={createAnnouncement}>
          {/* Content section */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">
              {t('announcementSectionContent')}
            </p>
            <input
              value={announcementForm.title}
              onChange={(event) =>
                setAnnouncementForm((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder={t('titlePlaceholder')}
              required
              className="w-full rounded border border-[color:var(--pt-accent-border)] bg-black px-3 py-2 text-[color:var(--pt-text-1)]"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <SmartSelect
                instanceId="platform-announcements-severity"
                value={announcementForm.severity}
                onChange={(value) =>
                  setAnnouncementForm((prev) => ({ ...prev, severity: value }))
                }
                options={[
                  { value: 'INFO', label: t('severityInfo') },
                  { value: 'WARNING', label: t('severityWarning') },
                  { value: 'SECURITY', label: t('severitySecurity') },
                ]}
              />
              <input
                value={announcementForm.reason}
                onChange={(event) =>
                  setAnnouncementForm((prev) => ({ ...prev, reason: event.target.value }))
                }
                placeholder={t('reasonPlaceholder')}
                className="rounded border border-[color:var(--pt-accent-border)] bg-black px-3 py-2 text-[color:var(--pt-text-1)]"
              />
            </div>
            <textarea
              value={announcementForm.message}
              onChange={(event) =>
                setAnnouncementForm((prev) => ({ ...prev, message: event.target.value }))
              }
              placeholder={t('messagePlaceholder')}
              required
              className="w-full min-h-[120px] rounded border border-[color:var(--pt-accent-border)] bg-black px-3 py-2 text-[color:var(--pt-text-1)]"
            />
          </div>

          {/* Schedule section */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">
              {t('announcementSectionSchedule')}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <DateTimePickerInput
                value={announcementForm.startsAt}
                onChange={(value) =>
                  setAnnouncementForm((prev) => ({
                    ...prev,
                    startsAt: value,
                    endsAt: applyDefaultAnnouncementEnd(value, prev.endsAt),
                  }))
                }
                placeholder={t('startsAtPlaceholder')}
                className="rounded border border-[color:var(--pt-accent-border)] bg-black px-3 py-2 text-[color:var(--pt-text-1)]"
              />
              <DateTimePickerInput
                value={announcementForm.endsAt}
                onChange={(value) =>
                  setAnnouncementForm((prev) => ({ ...prev, endsAt: value }))
                }
                placeholder={t('endsAtPlaceholder')}
                className="rounded border border-[color:var(--pt-accent-border)] bg-black px-3 py-2 text-[color:var(--pt-text-1)]"
              />
            </div>
          </div>

          {/* Targeting section */}
          <div className="space-y-3 rounded border border-[color:var(--pt-accent-border)] p-bg-card p-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">
              {t('announcementTargeting')}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="relative z-10 space-y-2">
                <p className="text-xs text-[color:var(--pt-text-2)]">{t('targetBusinesses')}</p>
                <TypeaheadInput
                  value={announcementBusinessSearch}
                  onChange={setAnnouncementBusinessSearch}
                  onSelect={(option) => {
                    if (announcementForm.targetBusinessIds.includes(option.id)) return;
                    setAnnouncementForm((prev) => ({
                      ...prev,
                      targetBusinessIds: [...prev.targetBusinessIds, option.id],
                    }));
                    setAnnouncementBusinessSearch('');
                  }}
                  options={businessOptions}
                  placeholder={t('businessSearchPlaceholder')}
                  className="rounded border border-[color:var(--pt-accent-border)] bg-black px-3 py-2 text-[color:var(--pt-text-1)]"
                />
                {announcementForm.targetBusinessIds.length ? (
                  <div className="flex flex-wrap gap-2">
                    {announcementForm.targetBusinessIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--pt-accent-border)] p-bg-card px-3 py-1 text-xs text-[color:var(--pt-text-1)]"
                      >
                        {businessLookup.get(id)?.name ?? id.slice(0, 6)}
                        <button
                          type="button"
                          onClick={() =>
                            setAnnouncementForm((prev) => ({
                              ...prev,
                              targetBusinessIds: prev.targetBusinessIds.filter(
                                (value) => value !== id,
                              ),
                            }))
                          }
                          className="text-[color:var(--pt-text-2)] hover:text-[color:var(--pt-text-1)]"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[color:var(--pt-text-muted)]">{t('allBusinesses')}</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs text-[color:var(--pt-text-2)]">{t('targetTiers')}</p>
                <div className="flex flex-wrap gap-2">
                  {announcementTierOptions.map((option) => {
                    const checked = announcementForm.targetTiers.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className="inline-flex items-center gap-2 rounded border border-[color:var(--pt-accent-border)] px-3 py-2 text-xs text-[color:var(--pt-text-1)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...announcementForm.targetTiers, option.value]
                              : announcementForm.targetTiers.filter((v) => v !== option.value);
                            setAnnouncementForm((prev) => ({ ...prev, targetTiers: next }));
                          }}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
                {!announcementForm.targetTiers.length ? (
                  <p className="text-xs text-[color:var(--pt-text-muted)]">{t('allTiers')}</p>
                ) : null}
              </div>
              <div className="space-y-2 md:col-span-2">
                <p className="text-xs text-[color:var(--pt-text-2)]">{t('targetStatuses')}</p>
                <div className="flex flex-wrap gap-2">
                  {announcementStatusOptions.map((option) => {
                    const checked = announcementForm.targetStatuses.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className="inline-flex items-center gap-2 rounded border border-[color:var(--pt-accent-border)] px-3 py-2 text-xs text-[color:var(--pt-text-1)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...announcementForm.targetStatuses, option.value]
                              : announcementForm.targetStatuses.filter((v) => v !== option.value);
                            setAnnouncementForm((prev) => ({ ...prev, targetStatuses: next }));
                          }}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
                {!announcementForm.targetStatuses.length ? (
                  <p className="text-xs text-[color:var(--pt-text-muted)]">{t('allStatuses')}</p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Audience preview */}
          <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-4 text-xs text-[color:var(--pt-text-2)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[color:var(--pt-text-1)]">{t('announcementAudiencePreview')}</p>
              <button
                type="button"
                onClick={previewAnnouncementAudience}
                className="inline-flex items-center gap-2 rounded border border-[color:var(--pt-accent-border-hi)] px-3 py-1 text-xs text-[color:var(--pt-text-1)] disabled:opacity-60"
                disabled={isPreviewingAnnouncementAudience}
              >
                {isPreviewingAnnouncementAudience ? <Spinner size="xs" variant="grid" /> : null}
                {isPreviewingAnnouncementAudience ? t('previewing') : t('previewAudience')}
              </button>
            </div>
            {announcementAudiencePreview ? (
              <div className="mt-3 space-y-1">
                <p>
                  {t('announcementPreviewReachTotal', {
                    value: announcementAudiencePreview.estimatedReach.total,
                  })}
                </p>
                <p>
                  {t('announcementPreviewReachBreakdown', {
                    explicit: announcementAudiencePreview.estimatedReach.explicit,
                    segment: announcementAudiencePreview.estimatedReach.segment,
                  })}
                </p>
                <p className="text-[color:var(--pt-text-muted)]">
                  {announcementAudiencePreview.filters.hasBroadcastScope
                    ? t('announcementBroadcastScope')
                    : t('announcementSegmentScope')}
                </p>
                {announcementAudiencePreview.sampleBusinesses.length ? (
                  <p className="text-[color:var(--pt-text-2)]">
                    {t('announcementPreviewSample', {
                      value: announcementAudiencePreview.sampleBusinesses
                        .map((item) => item.name)
                        .join(', '),
                    })}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-[color:var(--pt-text-muted)]">
                {t('announcementPreviewRequiredHint')}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded bg-[var(--pt-accent)] px-4 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={
              isCreatingAnnouncement ||
              announcementPreviewSignature !== announcementTargetSignature
            }
          >
            {isCreatingAnnouncement ? <Spinner size="xs" variant="orbit" /> : null}
            {isCreatingAnnouncement ? t('publishing') : t('publishAnnouncement')}
          </button>
        </form>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3 nvi-stagger">
          {(
            [
              { key: 'active', label: t('announcementLaneActive'), dot: 'bg-emerald-400' },
              { key: 'upcoming', label: t('announcementLaneUpcoming'), dot: 'bg-sky-400' },
              { key: 'ended', label: t('announcementLaneEnded'), dot: 'bg-[var(--pt-text-muted)]' },
            ] as { key: string; label: string; dot: string }[]
          ).map((lane) => {
            const items =
              lane.key === 'active'
                ? announcementTimeline.active
                : lane.key === 'upcoming'
                  ? announcementTimeline.upcoming
                  : announcementTimeline.ended;
            return (
              <div
                key={lane.key}
                className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep p-4 text-xs text-[color:var(--pt-text-2)]"
              >
                <div className="mb-4 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${lane.dot}`} />
                  <p className="text-[10px] uppercase tracking-[0.25em] text-[color:var(--pt-text-2)]">
                    {lane.label}
                  </p>
                  <span className="ml-auto rounded border border-[color:var(--pt-accent-border)] px-1.5 py-0.5 text-[10px] text-[color:var(--pt-text-muted)]">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {items.map((announcement) => (
                    <div
                      key={announcement.id}
                      className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium leading-snug text-[color:var(--pt-text-1)]">
                          {announcement.title}
                        </p>
                        <span
                          className={`inline-flex flex-shrink-0 items-center rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] ${
                            SEVERITY_PILL[announcement.severity] ??
                            'border-[color:var(--pt-accent-border)] text-[color:var(--pt-text-2)]'
                          }`}
                        >
                          {announcement.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-[color:var(--pt-text-muted)]">
                        {formatDateTimeWithTz(announcement.startsAt)} →{' '}
                        {announcement.endsAt
                          ? formatDateTimeWithTz(announcement.endsAt)
                          : t('openEnded')}
                      </p>
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        {announcement.businessTargets.length > 0 && (
                          <span className="rounded border border-[color:var(--pt-accent-border)] px-1.5 py-0.5 text-[color:var(--pt-text-2)]">
                            {announcement.businessTargets.length} {t('targetBusinessesLabel')}
                          </span>
                        )}
                        {announcement.segmentTargets
                          .filter((tgt) => tgt.type === 'TIER')
                          .map((tgt) => (
                            <span
                              key={tgt.value}
                              className="rounded border border-sky-700/40 px-1.5 py-0.5 text-sky-400"
                            >
                              {tgt.value}
                            </span>
                          ))}
                        {announcement.segmentTargets
                          .filter((tgt) => tgt.type === 'STATUS')
                          .map((tgt) => (
                            <span
                              key={tgt.value}
                              className="rounded border border-[color:var(--pt-accent-border)] px-1.5 py-0.5 text-[color:var(--pt-text-2)]"
                            >
                              {tgt.value}
                            </span>
                          ))}
                        {!announcement.businessTargets.length &&
                          !announcement.segmentTargets.length && (
                            <span className="rounded border border-emerald-700/40 px-1.5 py-0.5 text-emerald-400">
                              {t('allBusinesses')}
                            </span>
                          )}
                      </div>
                      {lane.key !== 'ended' && (
                        <button
                          type="button"
                          onClick={() => endAnnouncement(announcement.id)}
                          disabled={endingAnnouncementId === announcement.id}
                          className="inline-flex items-center gap-1.5 rounded border border-[color:var(--pt-accent-border)] px-2 py-1 text-[11px] text-[color:var(--pt-text-2)] transition-colors hover:border-[color:var(--pt-accent-border-hi)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {endingAnnouncementId === announcement.id ? (
                            <Spinner size="xs" variant="orbit" />
                          ) : null}
                          {endingAnnouncementId === announcement.id
                            ? t('endingAnnouncement')
                            : t('endAnnouncement')}
                        </button>
                      )}
                    </div>
                  ))}
                  {!items.length && (
                    <p className="text-[11px] text-[color:var(--pt-text-muted)]">
                      {t('announcementLaneEmpty')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
