'use client';

import { useTranslations } from 'next-intl';
import { Building2, Globe, History } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SmartSelect } from '@/components/SmartSelect';
import { Icon } from '@/components/ui/Icon';
import { CURRENCIES } from '@/lib/currencies';
import { useFormatDate } from '@/lib/business-context';
import { EmptyState } from '@/components/ui/EmptyState';
import type { useBusinessSettings } from '../hooks/useBusinessSettings';

const getTimezoneOptions = (): { value: string; label: string }[] => {
  try {
    const all = (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf('timeZone');
    const africa = all.filter((tz) => tz.startsWith('Africa/')).sort();
    const others = all.filter((tz) => !tz.startsWith('Africa/')).sort();
    return [...africa, ...others].map((tz) => ({ value: tz, label: tz }));
  } catch {
    return ['Africa/Dar_es_Salaam', 'Africa/Nairobi', 'Africa/Kampala', 'Africa/Kigali', 'Africa/Johannesburg', 'UTC']
      .map((tz) => ({ value: tz, label: tz }));
  }
};

const DATE_FORMAT_OPTIONS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY — e.g. 25/03/2026' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY — e.g. 03/25/2026' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD — e.g. 2026-03-25' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY — e.g. 25-03-2026' },
  { value: 'D MMM YYYY', label: 'D MMM YYYY — e.g. 25 Mar 2026' },
];

type Props = { ctx: ReturnType<typeof useBusinessSettings> };

export function GeneralTab({ ctx }: Props) {
  const t = useTranslations('businessSettingsPage');
  const { formatDateTime } = useFormatDate();
  const currencyLabel = CURRENCIES.find((c) => c.code === ctx.draftSettings?.localeSettings?.currency)?.label
    ?? ctx.draftSettings?.localeSettings?.currency ?? '—';

  return (
    <div className="space-y-4 nvi-stagger">
      {/* ── Business Info ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-blue-400">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
            <Building2 size={18} className="text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-nvi-text-primary">{t('profileTitle')}</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('kpiBusiness')}</p>
            <p className="text-sm text-nvi-text-primary">{ctx.business?.name ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">ID</p>
            <p className="text-sm font-mono text-nvi-text-secondary">{ctx.business?.id ?? '—'}</p>
          </div>
        </div>
      </Card>

      {/* ── Localization ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-purple-400">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/10">
            <Globe size={18} className="text-purple-400" />
          </div>
          <h3 className="text-base font-semibold text-nvi-text-primary">{t('localizationTitle')}</h3>
          {ctx.sectionTimestamp('localization') && (
            <span className="text-[10px] text-nvi-text-tertiary">{t('lastUpdated', { date: formatDateTime(ctx.sectionTimestamp('localization')!) })}</span>
          )}
        </div>
        <p className="mb-4 text-xs text-nvi-text-tertiary">{t('localizationHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Currency — read-only */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('currencyCode')}</p>
            <p className="text-sm text-nvi-text-primary">{currencyLabel}</p>
            <p className="text-[10px] text-nvi-text-tertiary">Multi-currency support coming soon.</p>
          </div>
          {/* Timezone */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('timezone')}</p>
            {ctx.isEditing && ctx.draftSettings ? (
              <SmartSelect
                instanceId="settings-timezone"
                value={ctx.draftSettings.localeSettings.timezone}
                onChange={(value) =>
                  ctx.setDraftSettings({
                    ...ctx.draftSettings!,
                    localeSettings: { ...ctx.draftSettings!.localeSettings, timezone: value },
                  })
                }
                options={getTimezoneOptions()}
                placeholder={t('timezone')}
              />
            ) : (
              <p className="text-sm text-nvi-text-primary">{ctx.draftSettings?.localeSettings?.timezone ?? '—'}</p>
            )}
          </div>
          {/* Date format */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('dateFormat')}</p>
            {ctx.isEditing && ctx.draftSettings ? (
              <SmartSelect
                instanceId="settings-dateformat"
                value={ctx.draftSettings.localeSettings.dateFormat}
                onChange={(value) =>
                  ctx.setDraftSettings({
                    ...ctx.draftSettings!,
                    localeSettings: { ...ctx.draftSettings!.localeSettings, dateFormat: value },
                  })
                }
                options={DATE_FORMAT_OPTIONS}
                placeholder={t('dateFormat')}
              />
            ) : (
              <p className="text-sm text-nvi-text-primary">{ctx.draftSettings?.localeSettings?.dateFormat ?? '—'}</p>
            )}
          </div>
        </div>
      </Card>

      {/* ── Changelog ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-amber-400">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
            <History size={18} className="text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-nvi-text-primary">{t('changelogTitle')}</h3>
        </div>
        {ctx.changelog.length > 0 ? (
          <div className="space-y-2">
            {ctx.changelog.map((entry, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-xs">
                <span className="font-medium text-nvi-text-primary">{entry.action}</span>
                <span className="text-nvi-text-tertiary">{formatDateTime(entry.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<History size={24} className="text-nvi-text-tertiary" />} title={t('changelogEmpty') || 'No changes recorded yet.'} />
        )}
      </Card>
    </div>
  );
}
