'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, ChevronDown, ChevronUp, UserCog } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFormatDate } from '@/lib/business-context';
import {
  useAdminActivity,
  type AdminActivityEntry,
} from '../hooks/useAuditInvestigations';

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function actionChipColor(action: string): string {
  if (action.includes('APPROVE') || action.includes('CREATE'))
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (action.includes('DELETE') || action.includes('PURGE'))
    return 'bg-red-500/15 text-red-300 border-red-500/30';
  if (action.includes('REJECT') || action.includes('SUSPEND'))
    return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-white/[0.04] text-[var(--pt-text-2)] border-white/[0.06]';
}

export function AdminActivityTab() {
  const t = useTranslations('platformConsole');
  const { formatDateTime } = useFormatDate();
  const activity = useAdminActivity();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3 nvi-stagger">
      {/* Search bar */}
      <Card padding="md">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-2.5 text-[var(--pt-text-muted)] pointer-events-none"
          />
          <TextInput
            type="search"
            value={activity.search}
            onChange={(e) => activity.setSearch(e.target.value)}
            placeholder={t('adminActivitySearchPlaceholder')}
            className="pl-7"
          />
        </div>
      </Card>

      {/* List */}
      {activity.isLoading && activity.items.length === 0 ? (
        <div className="space-y-2 nvi-stagger">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]"
            />
          ))}
        </div>
      ) : activity.items.length === 0 ? (
        <EmptyState
          icon={<UserCog size={28} className="text-[var(--pt-text-muted)]" />}
          title={t('adminActivityEmptyTitle')}
          description={t('adminActivityEmptyHint')}
        />
      ) : (
        <Card padding="sm" className="nvi-slide-in-bottom">
          <ul className="divide-y divide-white/[0.04]">
            {activity.items.map((entry: AdminActivityEntry) => {
              const isExpanded = expandedIds.has(entry.id);
              const hasMetadata =
                entry.metadata && Object.keys(entry.metadata).length > 0;
              return (
                <li key={entry.id} className="px-2 py-2">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--pt-accent)]/10">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--pt-accent)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${actionChipColor(entry.action)}`}
                        >
                          {entry.action}
                        </span>
                        <span className="text-[10px] text-[var(--pt-text-muted)]">
                          {entry.resourceType}
                          {entry.resourceId
                            ? ` · ${entry.resourceId.slice(0, 8)}`
                            : ''}
                        </span>
                      </div>
                      {entry.reason && (
                        <p className="mt-0.5 text-[10px] text-[var(--pt-text-2)] italic">
                          {entry.reason}
                        </p>
                      )}
                      {hasMetadata && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(entry.id)}
                          className="mt-1 inline-flex items-center gap-0.5 text-[9px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
                        >
                          {isExpanded ? (
                            <ChevronUp size={9} />
                          ) : (
                            <ChevronDown size={9} />
                          )}
                          {t('adminActivityMetadata')}
                        </button>
                      )}
                      {isExpanded && entry.metadata && (
                        <div className="mt-1 rounded-md border border-white/[0.04] bg-white/[0.02] p-1.5 text-[9px] font-mono text-[var(--pt-text-2)]">
                          {Object.entries(entry.metadata).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2">
                              <span className="text-[var(--pt-text-muted)]">
                                {k}:
                              </span>
                              <span className="truncate">
                                {typeof v === 'object'
                                  ? JSON.stringify(v)
                                  : String(v ?? '—')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <span
                      className="text-[9px] text-[var(--pt-text-muted)] shrink-0"
                      title={formatDateTime(entry.createdAt)}
                    >
                      {relativeTime(entry.createdAt)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
