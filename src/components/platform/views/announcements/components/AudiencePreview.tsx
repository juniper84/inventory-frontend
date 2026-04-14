'use client';

import { Users, Globe, Filter, Building2 } from 'lucide-react';
import { Spinner } from '@/components/Spinner';
import type { AudiencePreview as AudienceData } from '../hooks/useAnnouncements';

type Props = {
  audience: AudienceData | null;
  isPreviewing: boolean;
  targetingChanged: boolean;
  onPreview: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

export function AudiencePreview({
  audience,
  isPreviewing,
  targetingChanged,
  onPreview,
  t,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={12} className="text-[var(--pt-text-muted)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-2)]">
            {t('audiencePreviewTitle')}
          </h3>
        </div>
        <button
          type="button"
          onClick={onPreview}
          disabled={isPreviewing}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] font-semibold text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)] disabled:opacity-50 nvi-press"
        >
          {isPreviewing ? <Spinner size="xs" variant="dots" /> : <Users size={11} />}
          {audience ? t('audienceRePreview') : t('audiencePreviewButton')}
        </button>
      </div>

      {targetingChanged && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2 text-[10px] text-amber-300">
          {t('audienceTargetingChanged')}
        </div>
      )}

      {audience ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('audienceTotal')}
              </p>
              <p className="text-lg font-bold text-[var(--pt-accent)]">
                {audience.estimatedReach.total}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('audienceExplicit')}
              </p>
              <p className="text-lg font-bold text-[var(--pt-text-1)]">
                {audience.estimatedReach.explicit}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('audienceSegment')}
              </p>
              <p className="text-lg font-bold text-[var(--pt-text-1)]">
                {audience.estimatedReach.segment}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-[var(--pt-text-muted)]">
            {audience.filters.hasBroadcastScope ? (
              <>
                <Globe size={10} />
                {t('audienceScopeBroadcast')}
              </>
            ) : audience.filters.targetTiers.length ||
              audience.filters.targetStatuses.length ? (
              <>
                <Filter size={10} />
                {t('audienceScopeSegment')}
              </>
            ) : (
              <>
                <Building2 size={10} />
                {t('audienceScopeSpecific')}
              </>
            )}
          </div>

          {audience.sampleBusinesses.length > 0 && (
            <div>
              <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)] mb-1">
                {t('audienceSampleTitle')}
              </p>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-white/[0.06] bg-white/[0.02]">
                {audience.sampleBusinesses.map((biz) => (
                  <div
                    key={biz.id}
                    className="flex items-center justify-between border-b border-white/[0.04] px-2 py-1 last:border-b-0 text-[10px]"
                  >
                    <span className="text-[var(--pt-text-1)] truncate">
                      {biz.name}
                    </span>
                    <span className="text-[var(--pt-text-muted)]">
                      {biz.subscriptionTier} • {biz.businessStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-[var(--pt-text-muted)] italic">
          {t('audiencePreviewHint')}
        </p>
      )}
    </div>
  );
}
