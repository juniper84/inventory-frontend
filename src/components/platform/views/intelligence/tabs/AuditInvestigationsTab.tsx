'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  Search,
  Filter as FilterIcon,
  ChevronLeft,
  ChevronRight,
  FileSearch,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { SmartSelect } from '@/components/SmartSelect';
import { DateTimePickerInput } from '@/components/DateTimePickerInput';
import { apiFetch } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';
import { useFormatDate } from '@/lib/business-context';
import { useAuditInvestigations } from '../hooks/useAuditInvestigations';
import { InvestigationCard } from '../components/InvestigationCard';

type BusinessOption = { value: string; label: string };

export function AuditInvestigationsTab() {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const { formatDateTime } = useFormatDate();
  const investigations = useAuditInvestigations();
  const [businessOptions, setBusinessOptions] = useState<BusinessOption[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const token = getPlatformAccessToken();
        if (!token) return;
        const data = await apiFetch<{ items: { id: string; name: string }[] }>(
          '/platform/businesses?limit=200',
          { token },
        );
        setBusinessOptions(
          (data.items ?? []).map((b) => ({ value: b.id, label: b.name })),
        );
      } catch {
        /* silent */
      }
    };
    load();
  }, []);

  const outcomeOptions = [
    { value: 'ALL', label: t('investigationOutcomeAll') },
    { value: 'SUCCESS', label: t('investigationOutcomeSuccess') },
    { value: 'FAILURE', label: t('investigationOutcomeFailure') },
  ];

  const businessNameById = new Map(
    businessOptions.map((b) => [b.value, b.label]),
  );

  return (
    <div className="space-y-4 nvi-stagger">
      {/* Filter bar */}
      <Card padding="md">
        <div className="mb-2 flex items-center gap-2">
          <FilterIcon size={12} className="text-[var(--pt-text-muted)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-2)]">
            {t('investigationFiltersTitle')}
          </h3>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('investigationFilterBusiness')}
            </label>
            <SmartSelect
              instanceId="investigation-filter-business"
              value={investigations.filters.businessId}
              onChange={(value) =>
                investigations.setFilters((f) => ({ ...f, businessId: value }))
              }
              options={businessOptions}
              placeholder={t('investigationFilterBusinessPlaceholder')}
              isClearable
            />
          </div>
          <div>
            <TextInput
              label={t('investigationFilterAction')}
              value={investigations.filters.action}
              onChange={(e) =>
                investigations.setFilters((f) => ({
                  ...f,
                  action: e.target.value,
                }))
              }
              placeholder={t('investigationFilterActionPlaceholder')}
            />
          </div>
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('investigationFilterOutcome')}
            </label>
            <SmartSelect
              instanceId="investigation-filter-outcome"
              value={investigations.filters.outcome}
              onChange={(value) =>
                investigations.setFilters((f) => ({
                  ...f,
                  outcome: value as typeof f.outcome,
                }))
              }
              options={outcomeOptions}
            />
          </div>
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('investigationFilterFrom')}
            </label>
            <DateTimePickerInput
              value={investigations.filters.from}
              onChange={(value) =>
                investigations.setFilters((f) => ({ ...f, from: value }))
              }
            />
          </div>
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('investigationFilterTo')}
            </label>
            <DateTimePickerInput
              value={investigations.filters.to}
              onChange={(value) =>
                investigations.setFilters((f) => ({ ...f, to: value }))
              }
            />
          </div>
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={investigations.applyFilters}
              className="flex-1 rounded-lg bg-[var(--pt-accent)] px-3 py-1.5 text-[10px] font-semibold text-black nvi-press"
            >
              {t('investigationFilterApply')}
            </button>
            <button
              type="button"
              onClick={investigations.resetFilters}
              className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[10px] text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)] nvi-press"
            >
              {t('investigationFilterReset')}
            </button>
          </div>
        </div>
      </Card>

      {/* Error */}
      {investigations.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-2 text-[10px] text-red-300">
          {investigations.error}
        </div>
      )}

      {/* List */}
      {investigations.isLoading ? (
        <div className="space-y-2 nvi-stagger">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]"
            />
          ))}
        </div>
      ) : investigations.items.length === 0 ? (
        <EmptyState
          icon={<FileSearch size={28} className="text-[var(--pt-text-muted)]" />}
          title={t('investigationEmptyTitle')}
          description={t('investigationEmptyHint')}
        />
      ) : (
        <div className="space-y-2 nvi-stagger">
          {investigations.items.map((investigation) => (
            <InvestigationCard
              key={investigation.id}
              investigation={{
                ...investigation,
                businessName: businessNameById.get(investigation.businessId),
              }}
              locale={locale}
              formatDateTime={formatDateTime}
              t={(key, values) => t(key, values)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(investigations.hasNextPage || investigations.hasPrevPage) && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={investigations.prevPage}
            disabled={!investigations.hasPrevPage}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] disabled:opacity-30 nvi-press"
          >
            <ChevronLeft size={11} />
            {t('prevPage')}
          </button>
          <span className="text-[10px] text-[var(--pt-text-muted)]">
            {t('pageLabel', { page: investigations.page })}
          </span>
          <button
            type="button"
            onClick={investigations.nextPage}
            disabled={!investigations.hasNextPage}
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
