'use client';

import { useTranslations } from 'next-intl';
import {
  Filter as FilterIcon,
  Megaphone,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SmartSelect } from '@/components/SmartSelect';
import { useFormatDate } from '@/lib/business-context';
import {
  useAnnouncements,
  type AnnouncementSeverity,
} from '../hooks/useAnnouncements';
import { AnnouncementCard } from '../components/AnnouncementCard';

type Props = {
  ann: ReturnType<typeof useAnnouncements>;
  onSwitchToCompose: () => void;
};

export function AnnouncementTimelineTab({ ann, onSwitchToCompose }: Props) {
  const t = useTranslations('platformConsole');
  const { formatDateTime } = useFormatDate();

  const STATUS_TABS: { key: 'ALL' | 'active' | 'upcoming' | 'ended'; label: string }[] = [
    { key: 'ALL', label: t('timelineFilterAll') },
    { key: 'active', label: t('cardLifecycle.active') },
    { key: 'upcoming', label: t('cardLifecycle.upcoming') },
    { key: 'ended', label: t('cardLifecycle.ended') },
  ];

  const severityOptions = [
    { value: 'INFO', label: 'INFO' },
    { value: 'WARNING', label: 'WARNING' },
    { value: 'SECURITY', label: 'SECURITY' },
  ];

  return (
    <div className="space-y-4 nvi-stagger">
      {/* Filters */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-2">
          <FilterIcon size={12} className="text-[var(--pt-text-muted)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-2)]">
            {t('timelineFiltersTitle')}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_TABS.map((tab) => {
            const isActive = ann.filters.status === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  ann.setFilters((f) => ({ ...f, status: tab.key }));
                  ann.applyFilters();
                }}
                className={`rounded-md px-2 py-1 text-[10px] font-semibold transition nvi-press ${
                  isActive
                    ? 'bg-[var(--pt-accent)] text-black'
                    : 'bg-white/[0.04] text-[var(--pt-text-2)] hover:bg-white/[0.08]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('timelineFilterSeverity')}
            </label>
            <SmartSelect
              instanceId="announcement-filter-severity"
              value={ann.filters.severity}
              onChange={(value) =>
                ann.setFilters((f) => ({
                  ...f,
                  severity: value as AnnouncementSeverity | '',
                }))
              }
              options={severityOptions}
              placeholder={t('timelineFilterSeverityPlaceholder')}
              isClearable
            />
          </div>
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={ann.applyFilters}
              className="flex-1 rounded-lg bg-[var(--pt-accent)] px-3 py-1.5 text-[10px] font-semibold text-black nvi-press"
            >
              {t('timelineFilterApply')}
            </button>
            <button
              type="button"
              onClick={ann.resetFilters}
              className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[10px] text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)] nvi-press"
            >
              {t('timelineFilterReset')}
            </button>
          </div>
        </div>
      </Card>

      {/* Error */}
      {ann.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-2 text-[10px] text-red-300">
          {ann.error}
        </div>
      )}

      {/* List */}
      {ann.isLoading ? (
        <div className="space-y-2 nvi-stagger">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]"
            />
          ))}
        </div>
      ) : ann.items.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={28} className="text-[var(--pt-text-muted)]" />}
          title={t('timelineEmptyTitle')}
          description={t('timelineEmptyHint')}
        />
      ) : (
        <div className="space-y-2 nvi-stagger">
          {ann.items.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              isEditing={ann.editingId === announcement.id}
              isSavingEdit={ann.savingEditId === announcement.id}
              isEnding={ann.endingId === announcement.id}
              isDeleting={ann.deletingId === announcement.id}
              onStartEdit={() => ann.setEditingId(announcement.id)}
              onCancelEdit={() => ann.setEditingId(null)}
              onSaveEdit={(patch) =>
                ann.updateAnnouncement(announcement.id, patch)
              }
              onEnd={() => ann.endAnnouncement(announcement.id)}
              onDelete={() => ann.deleteAnnouncement(announcement.id)}
              onDuplicate={() => {
                ann.duplicateFromAnnouncement(announcement);
                onSwitchToCompose();
              }}
              formatDateTime={formatDateTime}
              t={(key, values) => t(key, values)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(ann.hasNextPage || ann.hasPrevPage) && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={ann.prevPage}
            disabled={!ann.hasPrevPage}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] disabled:opacity-30 nvi-press"
          >
            <ChevronLeft size={11} />
            {t('prevPage')}
          </button>
          <span className="text-[10px] text-[var(--pt-text-muted)]">
            {t('pageLabel', { page: ann.page })}
          </span>
          <button
            type="button"
            onClick={ann.nextPage}
            disabled={!ann.hasNextPage}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] disabled:opacity-30 nvi-press"
          >
            {t('nextPage')}
            <ChevronRight size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
