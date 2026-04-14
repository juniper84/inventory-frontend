'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  Download,
  Filter as FilterIcon,
  ChevronLeft,
  ChevronRight,
  Package,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { useFormatDate } from '@/lib/business-context';
import { apiFetch } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';
import {
  useExportJobs,
  type ExportJobStatus,
} from '../hooks/useExportJobs';
import { ExportJobCard } from '../components/ExportJobCard';

type BusinessOption = { value: string; label: string };

type Props = {
  showExportOnExit: boolean;
  onCloseExportOnExit: () => void;
};

export function ExportsTab({ showExportOnExit, onCloseExportOnExit }: Props) {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const exp = useExportJobs();
  const { formatDateTime } = useFormatDate();

  const [businessOptions, setBusinessOptions] = useState<BusinessOption[]>([]);
  const [exitBusinessId, setExitBusinessId] = useState('');
  const [exitReason, setExitReason] = useState('');

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

  const STATUS_TABS: { key: 'ALL' | ExportJobStatus; label: string }[] = [
    { key: 'ALL', label: t('exportFilterAll') },
    { key: 'PENDING', label: t('exportStatus.PENDING') },
    { key: 'RUNNING', label: t('exportStatus.RUNNING') },
    { key: 'COMPLETED', label: t('exportStatus.COMPLETED') },
    { key: 'FAILED', label: t('exportStatus.FAILED') },
    { key: 'CANCELED', label: t('exportStatus.CANCELED') },
  ];

  const TYPE_OPTIONS = useMemo(
    () => [
      { value: 'STOCK', label: 'STOCK' },
      { value: 'PRODUCTS', label: 'PRODUCTS' },
      { value: 'SALES', label: 'SALES' },
      { value: 'CUSTOMERS', label: 'CUSTOMERS' },
      { value: 'AUDIT_LOGS', label: 'AUDIT_LOGS' },
    ],
    [],
  );

  const handleExitSubmit = async () => {
    const ok = await exp.requestExportOnExit(exitBusinessId, exitReason);
    if (ok) {
      setExitBusinessId('');
      setExitReason('');
      onCloseExportOnExit();
    }
  };

  return (
    <div className="space-y-4 nvi-stagger">
      {/* Export on Exit slide-down (controlled by parent header button) */}
      {showExportOnExit && (
        <Card padding="md" className="nvi-slide-in-bottom border-l-2 border-l-amber-400">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <Download size={14} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
                  {t('exportOnExitTitle')}
                </h3>
                <p className="text-[10px] text-[var(--pt-text-muted)]">
                  {t('exportOnExitHint')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCloseExportOnExit}
              className="text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
            >
              <X size={14} />
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <label className="text-[9px] text-[var(--pt-text-muted)]">
                {t('exportOnExitBusinessLabel')}
              </label>
              <SmartSelect
                instanceId="export-on-exit-business"
                value={exitBusinessId}
                onChange={setExitBusinessId}
                options={businessOptions}
                placeholder={t('selectBusinessPlaceholder')}
              />
            </div>
            <div>
              <TextInput
                label={t('exportOnExitReasonLabel')}
                value={exitReason}
                onChange={(e) => setExitReason(e.target.value)}
                placeholder={t('exportOnExitReasonPlaceholder')}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleExitSubmit}
              disabled={
                !exitBusinessId || !exitReason.trim() || exp.exportingOnExit
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50 nvi-press"
            >
              {exp.exportingOnExit ? (
                <Spinner size="xs" variant="dots" />
              ) : (
                <Download size={12} />
              )}
              {t('exportOnExitSubmit')}
            </button>
          </div>
        </Card>
      )}

      {/* Filters + stats */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-2">
          <FilterIcon size={12} className="text-[var(--pt-text-muted)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-2)]">
            {t('exportFiltersTitle')}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_TABS.map((tab) => {
            const isActive = exp.filters.status === tab.key;
            const count =
              tab.key === 'ALL'
                ? (exp.stats?.total ?? 0)
                : (exp.stats?.byStatus[tab.key] ?? 0);
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  exp.setFilters((f) => ({ ...f, status: tab.key }));
                  exp.applyFilters();
                }}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition nvi-press ${
                  isActive
                    ? 'bg-[var(--pt-accent)] text-black'
                    : 'bg-white/[0.04] text-[var(--pt-text-2)] hover:bg-white/[0.08]'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={`rounded px-1 py-0 text-[9px] ${
                      isActive
                        ? 'bg-black/20 text-black'
                        : 'bg-white/[0.08] text-[var(--pt-text-2)]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('exportFilterBusiness')}
            </label>
            <SmartSelect
              instanceId="export-filter-business"
              value={exp.filters.businessId}
              onChange={(value) =>
                exp.setFilters((f) => ({ ...f, businessId: value }))
              }
              options={businessOptions}
              placeholder={t('exportFilterBusinessPlaceholder')}
              isClearable
            />
          </div>
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('exportFilterType')}
            </label>
            <SmartSelect
              instanceId="export-filter-type"
              value={exp.filters.type}
              onChange={(value) =>
                exp.setFilters((f) => ({ ...f, type: value }))
              }
              options={TYPE_OPTIONS}
              placeholder={t('exportFilterTypePlaceholder')}
              isClearable
            />
          </div>
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={exp.applyFilters}
              className="flex-1 rounded-lg bg-[var(--pt-accent)] px-3 py-1.5 text-[10px] font-semibold text-black nvi-press"
            >
              {t('exportFilterApply')}
            </button>
            <button
              type="button"
              onClick={exp.resetFilters}
              className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[10px] text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)] nvi-press"
            >
              {t('exportFilterReset')}
            </button>
          </div>
        </div>

        {/* Stats: byType breakdown — bug fix #6 */}
        {exp.stats && Object.keys(exp.stats.byType).length > 0 && (
          <div className="mt-3 border-t border-white/[0.06] pt-2">
            <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)] mb-1">
              {t('exportStatsByType', { total: exp.stats.total })}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(exp.stats.byType).map(([type, data]) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 text-[9px]"
                >
                  <span className="font-semibold text-[var(--pt-text-1)]">
                    {type}
                  </span>
                  <span className="text-[var(--pt-text-muted)]">
                    {data.total}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Error */}
      {exp.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-2 text-[10px] text-red-300">
          {exp.error}
        </div>
      )}

      {/* List */}
      {exp.isLoading ? (
        <div className="space-y-2 nvi-stagger">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]"
            />
          ))}
        </div>
      ) : exp.jobs.length === 0 ? (
        <EmptyState
          icon={<Package size={28} className="text-[var(--pt-text-muted)]" />}
          title={t('opExportsEmptyTitle')}
          description={t('opExportsEmptyHint')}
        />
      ) : (
        <div className="space-y-2 nvi-stagger">
          {exp.jobs.map((job) => (
            <ExportJobCard
              key={job.id}
              job={job}
              locale={locale}
              isActioning={exp.actioningId === job.id}
              actionType={exp.actioningId === job.id ? exp.actionType : null}
              onRetry={(reason) => exp.performAction(job.id, 'retry', reason)}
              onRequeue={(reason) =>
                exp.performAction(job.id, 'requeue', reason)
              }
              onCancel={(reason) => exp.performAction(job.id, 'cancel', reason)}
              onMarkDelivered={(reason) => exp.markDelivered(job.id, reason)}
              formatDateTime={formatDateTime}
              t={(key, values) => t(key, values)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(exp.hasNextPage || exp.hasPrevPage) && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={exp.prevPage}
            disabled={!exp.hasPrevPage}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] disabled:opacity-30 nvi-press"
          >
            <ChevronLeft size={11} />
            {t('prevPage')}
          </button>
          <span className="text-[10px] text-[var(--pt-text-muted)]">
            {t('pageLabel', { page: exp.page })}
          </span>
          <button
            type="button"
            onClick={exp.nextPage}
            disabled={!exp.hasNextPage}
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
