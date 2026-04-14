'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Users, ChevronUp, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { CohortHeatmap } from '../components/CohortHeatmap';
import type { CohortsData } from '../hooks/useAnalytics';

type Props = {
  data: CohortsData | null;
  isLoading: boolean;
};

type SortKey = 'month' | 'count' | 'active' | 'retention';
type SortDir = 'asc' | 'desc';

export function CohortsTab({ data, isLoading }: Props) {
  const t = useTranslations('platformConsole');
  const [sortKey, setSortKey] = useState<SortKey>('month');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sortedCohorts = useMemo(() => {
    if (!data) return [];
    const rows = [...data.cohorts];
    rows.sort((a, b) => {
      let aVal = 0;
      let bVal = 0;
      if (sortKey === 'month') {
        return sortDir === 'asc'
          ? a.month.localeCompare(b.month)
          : b.month.localeCompare(a.month);
      }
      if (sortKey === 'count') {
        aVal = a.count;
        bVal = b.count;
      } else if (sortKey === 'active') {
        aVal = a.active;
        bVal = b.active;
      } else {
        aVal = a.count > 0 ? a.active / a.count : 0;
        bVal = b.count > 0 ? b.active / b.count : 0;
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? (
      <ChevronUp size={10} className="inline" />
    ) : (
      <ChevronDown size={10} className="inline" />
    );
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-3 nvi-stagger">
        <div className="h-64 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
        <div className="h-48 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
      </div>
    );
  }

  if (!data || data.cohorts.length === 0) {
    return (
      <EmptyState
        icon={<Users size={28} className="text-[var(--pt-text-muted)]" />}
        title={t('cohortsEmptyTitle')}
        description={t('cohortsEmptyHint')}
      />
    );
  }

  return (
    <div className="space-y-4 nvi-stagger">
      <Card padding="md" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pt-accent)]/10">
            <Users size={14} className="text-[var(--pt-accent)]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
              {t('cohortsHeatmapTitle')}
            </h3>
            <p className="text-[10px] text-[var(--pt-text-muted)]">
              {t('cohortsHeatmapHint')}
            </p>
          </div>
        </div>
        <CohortHeatmap
          cohorts={data.cohorts}
          t={(key, values) => t(key, values)}
        />
      </Card>

      <Card padding="sm" className="nvi-slide-in-bottom">
        <div className="mb-2 px-2 pt-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-2)]">
            {t('cohortsTableTitle')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                <th
                  className="cursor-pointer px-2 py-1.5 hover:text-[var(--pt-text-1)]"
                  onClick={() => toggleSort('month')}
                >
                  {t('cohortsHeaderMonth')} <SortIcon col="month" />
                </th>
                <th
                  className="cursor-pointer px-2 py-1.5 hover:text-[var(--pt-text-1)]"
                  onClick={() => toggleSort('count')}
                >
                  {t('cohortsHeaderSignups')} <SortIcon col="count" />
                </th>
                <th
                  className="cursor-pointer px-2 py-1.5 hover:text-[var(--pt-text-1)]"
                  onClick={() => toggleSort('active')}
                >
                  {t('cohortsHeaderActive')} <SortIcon col="active" />
                </th>
                <th className="px-2 py-1.5">{t('cohortsHeaderByTier')}</th>
                <th
                  className="cursor-pointer px-2 py-1.5 hover:text-[var(--pt-text-1)]"
                  onClick={() => toggleSort('retention')}
                >
                  {t('cohortsHeaderRetention')} <SortIcon col="retention" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedCohorts.map((c) => {
                const retention =
                  c.count > 0 ? ((c.active / c.count) * 100).toFixed(0) : '0';
                return (
                  <tr
                    key={c.month}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition"
                  >
                    <td className="px-2 py-1.5 font-semibold text-[var(--pt-text-1)]">
                      {c.month}
                    </td>
                    <td className="px-2 py-1.5 text-[var(--pt-text-2)]">
                      {c.count}
                    </td>
                    <td className="px-2 py-1.5 text-emerald-400">
                      {c.active}
                    </td>
                    <td className="px-2 py-1.5 text-[10px] text-[var(--pt-text-muted)]">
                      {Object.entries(c.byTier)
                        .filter(([tier]) => tier !== 'NONE')
                        .map(([tier, count]) => `${tier}: ${count}`)
                        .join(' • ') || '—'}
                    </td>
                    <td className="px-2 py-1.5 font-semibold text-[var(--pt-accent)]">
                      {retention}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
