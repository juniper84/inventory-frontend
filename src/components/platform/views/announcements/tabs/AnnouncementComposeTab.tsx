'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Megaphone,
  Calendar,
  Target,
  Send,
  Globe,
  Filter,
  Building2,
  X,
  Info,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { Spinner } from '@/components/Spinner';
import { Checkbox } from '@/components/Checkbox';
import { TypeaheadInput } from '@/components/TypeaheadInput';
import { DateTimePickerInput } from '@/components/DateTimePickerInput';
import { apiFetch } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';
import {
  useAnnouncements,
  type AnnouncementSeverity,
} from '../hooks/useAnnouncements';
import { AnnouncementPreviewMock } from '../components/AnnouncementPreviewMock';
import { AudiencePreview } from '../components/AudiencePreview';

type BusinessOption = { id: string; name: string };

const TIERS = ['STARTER', 'BUSINESS', 'ENTERPRISE'] as const;
const STATUSES = ['ACTIVE', 'TRIAL', 'GRACE', 'EXPIRED', 'SUSPENDED'] as const;

const SEVERITY_PILL_STYLES: Record<
  AnnouncementSeverity,
  { active: string; idle: string }
> = {
  INFO: {
    active: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    idle: 'border-blue-500/20 text-blue-300/60 hover:border-blue-500/40',
  },
  WARNING: {
    active: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    idle: 'border-amber-500/20 text-amber-300/60 hover:border-amber-500/40',
  },
  SECURITY: {
    active: 'bg-red-500/25 text-red-300 border-red-500/50',
    idle: 'border-red-500/20 text-red-300/60 hover:border-red-500/40',
  },
};

const SEVERITY_ICON: Record<AnnouncementSeverity, typeof Info> = {
  INFO: Info,
  WARNING: AlertTriangle,
  SECURITY: ShieldAlert,
};

const DURATION_PILLS: { hours: number; label: string }[] = [
  { hours: 1, label: '1h' },
  { hours: 6, label: '6h' },
  { hours: 24, label: '24h' },
  { hours: 72, label: '3d' },
  { hours: 168, label: '7d' },
];

type Props = {
  ann: ReturnType<typeof useAnnouncements>;
};

export function AnnouncementComposeTab({ ann }: Props) {
  const t = useTranslations('platformConsole');
  const [businessOptions, setBusinessOptions] = useState<BusinessOption[]>([]);
  const [businessSearch, setBusinessSearch] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const token = getPlatformAccessToken();
        if (!token) return;
        const data = await apiFetch<{ items: BusinessOption[] }>(
          '/platform/businesses?limit=200',
          { token },
        );
        setBusinessOptions(data.items ?? []);
      } catch {
        /* silent */
      }
    };
    load();
  }, []);

  const businessNameById = useMemo(() => {
    const map = new Map<string, string>();
    businessOptions.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [businessOptions]);

  const typeaheadOptions = useMemo(() => {
    const search = businessSearch.toLowerCase();
    return businessOptions
      .filter(
        (b) =>
          !ann.form.targetBusinessIds.includes(b.id) &&
          (search === '' || b.name.toLowerCase().includes(search)),
      )
      .slice(0, 10)
      .map((b) => ({ id: b.id, label: b.name }));
  }, [businessOptions, businessSearch, ann.form.targetBusinessIds]);

  const handleConfirmPublish = async () => {
    setShowConfirm(false);
    await ann.createAnnouncement();
  };

  const isReadyToPreview =
    ann.form.scope === 'broadcast' ||
    (ann.form.scope === 'segment' &&
      (ann.form.targetTiers.length > 0 ||
        ann.form.targetStatuses.length > 0)) ||
    (ann.form.scope === 'specific' && ann.form.targetBusinessIds.length > 0);

  const canPublish =
    ann.form.title.trim() &&
    ann.form.message.trim() &&
    ann.audience !== null &&
    !ann.targetingChanged &&
    !ann.isCreating;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Confirm publish modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card padding="lg" className="max-w-md w-full nvi-slide-in-bottom">
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)] mb-2">
              {t('composeConfirmTitle')}
            </h3>
            <p className="text-xs text-[var(--pt-text-2)] mb-4">
              {t('composeConfirmDescription', {
                count: ann.audience?.estimatedReach.total ?? 0,
              })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
              >
                {t('composeConfirmCancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={ann.isCreating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50 nvi-press"
              >
                {ann.isCreating ? (
                  <Spinner size="xs" variant="dots" />
                ) : (
                  <Send size={12} />
                )}
                {t('composePublishConfirm')}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* LEFT: Form (2/3 width) */}
      <div className="lg:col-span-2 space-y-4 nvi-stagger">
        {/* Content section */}
        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pt-accent)]/10">
              <Megaphone size={14} className="text-[var(--pt-accent)]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
                {t('composeContentTitle')}
              </h3>
              <p className="text-[10px] text-[var(--pt-text-muted)]">
                {t('composeContentHint')}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <TextInput
              label={t('composeFieldTitleLabel')}
              value={ann.form.title}
              onChange={(e) =>
                ann.setForm((f) => ({ ...f, title: e.target.value }))
              }
              placeholder={t('composeFieldTitlePlaceholder')}
            />

            <div>
              <label className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('composeFieldSeverityLabel')}
              </label>
              <div className="mt-1 grid grid-cols-3 gap-1.5">
                {(['INFO', 'WARNING', 'SECURITY'] as AnnouncementSeverity[]).map(
                  (sev) => {
                    const isActive = ann.form.severity === sev;
                    const Icon = SEVERITY_ICON[sev];
                    return (
                      <button
                        key={sev}
                        type="button"
                        onClick={() =>
                          ann.setForm((f) => ({ ...f, severity: sev }))
                        }
                        className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[10px] font-semibold transition nvi-press ${
                          isActive
                            ? SEVERITY_PILL_STYLES[sev].active
                            : SEVERITY_PILL_STYLES[sev].idle
                        }`}
                      >
                        <Icon size={11} />
                        {sev}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <div>
              <label className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('composeFieldMessageLabel')}
              </label>
              <Textarea
                value={ann.form.message}
                onChange={(e) =>
                  ann.setForm((f) => ({ ...f, message: e.target.value }))
                }
                placeholder={t('composeFieldMessagePlaceholder')}
                rows={4}
              />
              <p className="mt-1 text-right text-[9px] text-[var(--pt-text-muted)]">
                {ann.form.message.length} {t('composeMessageChars')}
              </p>
            </div>

            <TextInput
              label={t('composeFieldReasonLabel')}
              value={ann.form.reason}
              onChange={(e) =>
                ann.setForm((f) => ({ ...f, reason: e.target.value }))
              }
              placeholder={t('composeFieldReasonPlaceholder')}
            />
          </div>
        </Card>

        {/* Schedule section */}
        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
              <Calendar size={14} className="text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
              {t('composeScheduleTitle')}
            </h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={ann.form.publishImmediately}
                onChange={(checked) =>
                  ann.setForm((f) => ({ ...f, publishImmediately: checked }))
                }
              />
              <span className="text-xs text-[var(--pt-text-1)]">
                {t('composePublishImmediately')}
              </span>
            </div>

            {!ann.form.publishImmediately && (
              <div>
                <label className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                  {t('composeStartsAtLabel')}
                </label>
                <DateTimePickerInput
                  value={ann.form.startsAt}
                  onChange={(value) =>
                    ann.setForm((f) => ({ ...f, startsAt: value }))
                  }
                  placeholder={t('composeStartsAtPlaceholder')}
                />
              </div>
            )}

            <div>
              <label className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('composeEndModeLabel')}
              </label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(['never', 'duration', 'date'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      ann.setForm((f) => ({ ...f, endMode: mode }))
                    }
                    className={`rounded-md px-2 py-1 text-[10px] font-semibold transition nvi-press ${
                      ann.form.endMode === mode
                        ? 'bg-[var(--pt-accent)] text-black'
                        : 'bg-white/[0.04] text-[var(--pt-text-2)] hover:bg-white/[0.08]'
                    }`}
                  >
                    {t(`composeEndMode.${mode}`)}
                  </button>
                ))}
              </div>
            </div>

            {ann.form.endMode === 'duration' && (
              <div>
                <label className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                  {t('composeDurationLabel')}
                </label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {DURATION_PILLS.map((pill) => (
                    <button
                      key={pill.hours}
                      type="button"
                      onClick={() =>
                        ann.setForm((f) => ({
                          ...f,
                          endDurationHours: pill.hours,
                        }))
                      }
                      className={`rounded-md px-2 py-1 text-[10px] font-semibold transition nvi-press ${
                        ann.form.endDurationHours === pill.hours
                          ? 'bg-[var(--pt-accent)] text-black'
                          : 'bg-white/[0.04] text-[var(--pt-text-2)] hover:bg-white/[0.08]'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ann.form.endMode === 'date' && (
              <div>
                <label className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                  {t('composeEndsAtLabel')}
                </label>
                <DateTimePickerInput
                  value={ann.form.endsAt}
                  onChange={(value) =>
                    ann.setForm((f) => ({ ...f, endsAt: value }))
                  }
                  placeholder={t('composeEndsAtPlaceholder')}
                />
              </div>
            )}
          </div>
        </Card>

        {/* Targeting section */}
        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
              <Target size={14} className="text-purple-400" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
              {t('composeTargetingTitle')}
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { key: 'broadcast', icon: Globe, label: t('composeScopeBroadcast') },
                { key: 'segment', icon: Filter, label: t('composeScopeSegment') },
                {
                  key: 'specific',
                  icon: Building2,
                  label: t('composeScopeSpecific'),
                },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const isActive = ann.form.scope === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => ann.setForm((f) => ({ ...f, scope: opt.key }))}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition nvi-press ${
                    isActive
                      ? 'border-[var(--pt-accent)] bg-[var(--pt-accent)]/10'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                  }`}
                >
                  <Icon
                    size={16}
                    className={
                      isActive
                        ? 'text-[var(--pt-accent)]'
                        : 'text-[var(--pt-text-muted)]'
                    }
                  />
                  <span
                    className={`text-[10px] font-semibold ${
                      isActive
                        ? 'text-[var(--pt-accent)]'
                        : 'text-[var(--pt-text-2)]'
                    }`}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>

          {ann.form.scope === 'segment' && (
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)] mb-1.5">
                  {t('composeSegmentTiers')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {TIERS.map((tier) => (
                    <label
                      key={tier}
                      className="inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Checkbox
                        checked={ann.form.targetTiers.includes(tier)}
                        onChange={(checked) =>
                          ann.setForm((f) => ({
                            ...f,
                            targetTiers: checked
                              ? [...f.targetTiers, tier]
                              : f.targetTiers.filter((t) => t !== tier),
                          }))
                        }
                      />
                      <span className="text-[10px] text-[var(--pt-text-2)]">
                        {tier}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)] mb-1.5">
                  {t('composeSegmentStatuses')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((st) => (
                    <label
                      key={st}
                      className="inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Checkbox
                        checked={ann.form.targetStatuses.includes(st)}
                        onChange={(checked) =>
                          ann.setForm((f) => ({
                            ...f,
                            targetStatuses: checked
                              ? [...f.targetStatuses, st]
                              : f.targetStatuses.filter((s) => s !== st),
                          }))
                        }
                      />
                      <span className="text-[10px] text-[var(--pt-text-2)]">
                        {st}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {ann.form.scope === 'specific' && (
            <div className="mt-3 space-y-2">
              <TypeaheadInput
                value={businessSearch}
                onChange={setBusinessSearch}
                onSelect={(option) => {
                  ann.setForm((f) => ({
                    ...f,
                    targetBusinessIds: f.targetBusinessIds.includes(option.id)
                      ? f.targetBusinessIds
                      : [...f.targetBusinessIds, option.id],
                  }));
                  setBusinessSearch('');
                }}
                options={typeaheadOptions}
                placeholder={t('composeTypeaheadPlaceholder')}
              />
              {ann.form.targetBusinessIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ann.form.targetBusinessIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-[var(--pt-text-1)]"
                    >
                      {businessNameById.get(id) ?? id.slice(0, 8)}
                      <button
                        type="button"
                        onClick={() =>
                          ann.setForm((f) => ({
                            ...f,
                            targetBusinessIds: f.targetBusinessIds.filter(
                              (b) => b !== id,
                            ),
                          }))
                        }
                        className="text-[var(--pt-text-muted)] hover:text-red-300"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Audience preview + publish */}
        <Card padding="md" className="nvi-slide-in-bottom">
          <AudiencePreview
            audience={ann.audience}
            isPreviewing={ann.isPreviewing}
            targetingChanged={ann.targetingChanged}
            onPreview={ann.previewAudience}
            t={(key, values) => t(key, values)}
          />

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={!canPublish || !isReadyToPreview}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-4 py-2 text-xs font-bold text-black disabled:opacity-40 nvi-press"
            >
              {ann.isCreating ? (
                <Spinner size="xs" variant="dots" />
              ) : (
                <Send size={12} />
              )}
              {t('composePublish')}
            </button>
          </div>
        </Card>
      </div>

      {/* RIGHT: Live preview (1/3 width) */}
      <div className="lg:col-span-1">
        <div className="lg:sticky lg:top-4">
          <Card padding="md" className="nvi-slide-in-bottom">
            <AnnouncementPreviewMock
              form={ann.form}
              t={(key, values) => t(key, values)}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
