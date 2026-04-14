'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Megaphone,
  Calendar,
  Users,
  Archive,
  PenSquare,
  ListChecks,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/notifications/Banner';
import { FlipCounter } from '@/components/analog/FlipCounter';
import { useAnnouncements } from './hooks/useAnnouncements';
import { AnnouncementComposeTab } from './tabs/AnnouncementComposeTab';
import { AnnouncementTimelineTab } from './tabs/AnnouncementTimelineTab';

type TabKey = 'compose' | 'timeline';

export function AnnouncementsView() {
  const t = useTranslations('platformConsole');
  const ann = useAnnouncements();
  const [activeTab, setActiveTab] = useState<TabKey>('compose');
  const [bannerError, setBannerError] = useState<string | null>(null);

  // surface hook errors via the local banner so the user sees them
  if (ann.error && ann.error !== bannerError) {
    setBannerError(ann.error);
  }

  // Total reach is computed from active announcement audience snapshots —
  // since we don't store snapshots, count active items as a proxy.
  const totalReach = ann.activeCount;

  return (
    <div className="space-y-4 nvi-stagger">
      <PageHeader
        title={t('announcementsTitleNew')}
        subtitle={t('announcementsSubtitle')}
      />

      {bannerError && (
        <Banner
          severity="error"
          message={bannerError}
          onDismiss={() => setBannerError(null)}
        />
      )}

      {/* KPI strip */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 nvi-stagger">
        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
              <Megaphone size={14} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('kpiActiveNow')}
              </p>
              <FlipCounter value={ann.activeCount} size="md" digits={3} />
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
              <Calendar size={14} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('kpiScheduled')}
              </p>
              <FlipCounter value={ann.upcomingCount} size="md" digits={3} />
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-500/10">
              <Users size={14} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('kpiTotalReach')}
              </p>
              <FlipCounter value={totalReach} size="md" digits={3} />
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-500/10">
              <Archive size={14} className="text-zinc-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('kpiEndedThisMonth')}
              </p>
              <FlipCounter value={ann.endedThisMonth} size="md" digits={3} />
            </div>
          </div>
        </Card>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('compose')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'compose'
              ? 'bg-[var(--pt-accent)] text-black'
              : 'text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)]'
          }`}
        >
          <PenSquare size={12} />
          {t('tabCompose')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('timeline')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'timeline'
              ? 'bg-[var(--pt-accent)] text-black'
              : 'text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)]'
          }`}
        >
          <ListChecks size={12} />
          {t('tabTimeline')}
          {ann.activeCount > 0 && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold leading-none ${
                activeTab === 'timeline'
                  ? 'bg-black/20 text-black'
                  : 'bg-emerald-500/15 text-emerald-300'
              }`}
            >
              {ann.activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'compose' && <AnnouncementComposeTab ann={ann} />}
      {activeTab === 'timeline' && (
        <AnnouncementTimelineTab
          ann={ann}
          onSwitchToCompose={() => setActiveTab('compose')}
        />
      )}
    </div>
  );
}
