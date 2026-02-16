import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { DateTimePickerInput } from '@/components/DateTimePickerInput';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';
import { TypeaheadInput } from '@/components/TypeaheadInput';

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
  if (!show) {
    return null;
  }

  return (
    <section className="command-card p-6 space-y-4 nvi-reveal">
      <h3 className="text-xl font-semibold">{t('announcementsTitle')}</h3>
      <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={createAnnouncement}>
          <input
            value={announcementForm.title}
            onChange={(event) =>
              setAnnouncementForm((prev) => ({
                ...prev,
                title: event.target.value,
              }))
            }
            placeholder={t('titlePlaceholder')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 md:col-span-2"
          />
          <SmartSelect
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
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
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
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <DateTimePickerInput
            value={announcementForm.endsAt}
            onChange={(value) =>
              setAnnouncementForm((prev) => ({ ...prev, endsAt: value }))
            }
            placeholder={t('endsAtPlaceholder')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <textarea
            value={announcementForm.message}
            onChange={(event) =>
              setAnnouncementForm((prev) => ({ ...prev, message: event.target.value }))
            }
            placeholder={t('messagePlaceholder')}
            className="min-h-[120px] rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 md:col-span-2"
          />
          <div className="space-y-3 rounded border border-gold-700/40 bg-black/40 p-3 md:col-span-2">
            <p className="text-xs uppercase tracking-[0.3em] text-gold-400">
              {t('announcementTargeting')}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs text-gold-300">{t('targetBusinesses')}</p>
                <TypeaheadInput
                  value={announcementBusinessSearch}
                  onChange={setAnnouncementBusinessSearch}
                  onSelect={(option) => {
                    if (announcementForm.targetBusinessIds.includes(option.id)) {
                      return;
                    }
                    setAnnouncementForm((prev) => ({
                      ...prev,
                      targetBusinessIds: [...prev.targetBusinessIds, option.id],
                    }));
                    setAnnouncementBusinessSearch('');
                  }}
                  options={businessOptions}
                  placeholder={t('businessSearchPlaceholder')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                {announcementForm.targetBusinessIds.length ? (
                  <div className="flex flex-wrap gap-2">
                    {announcementForm.targetBusinessIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-2 rounded-full border border-gold-700/40 bg-black/60 px-3 py-1 text-xs text-gold-200"
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
                          className="text-gold-400 hover:text-gold-100"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gold-500">{t('allBusinesses')}</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs text-gold-300">{t('targetTiers')}</p>
                <div className="flex flex-wrap gap-2">
                  {announcementTierOptions.map((option) => {
                    const checked = announcementForm.targetTiers.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...announcementForm.targetTiers, option.value]
                              : announcementForm.targetTiers.filter(
                                  (value) => value !== option.value,
                                );
                            setAnnouncementForm((prev) => ({
                              ...prev,
                              targetTiers: next,
                            }));
                          }}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
                {!announcementForm.targetTiers.length ? (
                  <p className="text-xs text-gold-500">{t('allTiers')}</p>
                ) : null}
              </div>
              <div className="space-y-2 md:col-span-2">
                <p className="text-xs text-gold-300">{t('targetStatuses')}</p>
                <div className="flex flex-wrap gap-2">
                  {announcementStatusOptions.map((option) => {
                    const checked = announcementForm.targetStatuses.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...announcementForm.targetStatuses, option.value]
                              : announcementForm.targetStatuses.filter(
                                  (value) => value !== option.value,
                                );
                            setAnnouncementForm((prev) => ({
                              ...prev,
                              targetStatuses: next,
                            }));
                          }}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
                {!announcementForm.targetStatuses.length ? (
                  <p className="text-xs text-gold-500">{t('allStatuses')}</p>
                ) : null}
              </div>
            </div>
            <div className="rounded border border-gold-700/40 bg-black/50 p-3 text-xs text-gold-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-gold-200">{t('announcementAudiencePreview')}</p>
                <button
                  type="button"
                  onClick={previewAnnouncementAudience}
                  className="inline-flex items-center gap-2 rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100 disabled:opacity-60"
                  disabled={isPreviewingAnnouncementAudience}
                >
                  {isPreviewingAnnouncementAudience ? (
                    <Spinner size="xs" variant="grid" />
                  ) : null}
                  {isPreviewingAnnouncementAudience ? t('previewing') : t('previewAudience')}
                </button>
              </div>
              {announcementAudiencePreview ? (
                <div className="mt-2 space-y-1">
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
                  <p className="text-gold-500">
                    {announcementAudiencePreview.filters.hasBroadcastScope
                      ? t('announcementBroadcastScope')
                      : t('announcementSegmentScope')}
                  </p>
                  {announcementAudiencePreview.sampleBusinesses.length ? (
                    <p className="text-gold-400">
                      {t('announcementPreviewSample', {
                        value: announcementAudiencePreview.sampleBusinesses
                          .map((item) => item.name)
                          .join(', '),
                      })}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-gold-500">{t('announcementPreviewRequiredHint')}</p>
              )}
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70 md:col-span-2"
            disabled={
              isCreatingAnnouncement ||
              announcementPreviewSignature !== announcementTargetSignature
            }
          >
            {isCreatingAnnouncement ? <Spinner size="xs" variant="orbit" /> : null}
            {isCreatingAnnouncement ? t('publishing') : t('publishAnnouncement')}
          </button>
        </form>
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            { key: 'active', label: t('announcementLaneActive') },
            { key: 'upcoming', label: t('announcementLaneUpcoming') },
            { key: 'ended', label: t('announcementLaneEnded') },
          ].map((lane) => {
            const items =
              lane.key === 'active'
                ? announcementTimeline.active
                : lane.key === 'upcoming'
                  ? announcementTimeline.upcoming
                  : announcementTimeline.ended;
            return (
              <div
                key={lane.key}
                className="rounded border border-gold-700/40 bg-black/30 p-3 text-xs text-gold-300"
              >
                <p className="mb-2 font-semibold text-gold-100">
                  {lane.label} ({items.length})
                </p>
                <div className="space-y-2">
                  {items.map((announcement) => (
                    <div
                      key={announcement.id}
                      className="rounded border border-gold-700/40 bg-black/45 p-2"
                    >
                      <p className="text-gold-100">
                        {announcement.title} • {announcement.severity}
                      </p>
                      <p className="text-[11px] text-gold-500">
                        {new Date(announcement.startsAt).toLocaleString()} →{' '}
                        {announcement.endsAt
                          ? new Date(announcement.endsAt).toLocaleString()
                          : t('openEnded')}
                      </p>
                      <p className="text-[11px] text-gold-400">
                        {t('targetBusinessesLabel')}:{' '}
                        {announcement.businessTargets.length
                          ? announcement.businessTargets
                              .map((target) => {
                                const business = businessLookup.get(target.businessId);
                                return business?.name ?? target.businessId.slice(0, 6);
                              })
                              .filter(Boolean)
                              .join(', ')
                          : t('allBusinesses')}
                      </p>
                      <p className="text-[11px] text-gold-400">
                        {t('targetTiersLabel')}:{' '}
                        {announcement.segmentTargets.some((target) => target.type === 'TIER')
                          ? announcement.segmentTargets
                              .filter((target) => target.type === 'TIER')
                              .map((target) => target.value)
                              .join(', ')
                          : t('allTiers')}
                      </p>
                      <p className="text-[11px] text-gold-400">
                        {t('targetStatusesLabel')}:{' '}
                        {announcement.segmentTargets.some(
                          (target) => target.type === 'STATUS',
                        )
                          ? announcement.segmentTargets
                              .filter((target) => target.type === 'STATUS')
                              .map((target) => target.value)
                              .join(', ')
                          : t('allStatuses')}
                      </p>
                      {lane.key !== 'ended' ? (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => endAnnouncement(announcement.id)}
                            disabled={endingAnnouncementId === announcement.id}
                            className="inline-flex items-center gap-2 rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-200 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {endingAnnouncementId === announcement.id ? (
                              <Spinner size="xs" variant="orbit" />
                            ) : null}
                            {endingAnnouncementId === announcement.id
                              ? t('endingAnnouncement')
                              : t('endAnnouncement')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {!items.length ? <p className="text-gold-500">{t('announcementLaneEmpty')}</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
