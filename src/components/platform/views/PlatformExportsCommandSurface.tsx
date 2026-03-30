import type { Dispatch, SetStateAction } from 'react';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';

type SelectOption = { value: string; label: string };

type ExportJob = {
  id: string;
  businessId: string;
  type: string;
  status: string;
  createdAt: string;
  lastError?: string | null;
  business?: { name: string };
};

type ExportQueueStats = {
  total: number;
  byStatus: Record<string, number>;
};

type ExportFiltersState = {
  businessId: string;
  status: string;
  type: string;
};

type ExportDeliveryFormState = {
  exportJobId: string;
  reason: string;
};

export function PlatformExportsCommandSurface({
  show,
  t,
  withAction,
  loadExportJobs,
  loadExportQueueStats,
  isLoadingExports,
  exportFilters,
  setExportFilters,
  businessSelectOptions,
  actionLoading,
  exportQueueStats,
  exportLaneDefs,
  exportLaneJobs,
  isLoadingExportStats,
  exportJobs,
  exportPage,
  hasNextExportPage,
  onExportNextPage,
  onExportPrevPage,
  retryExportJob,
  requeueExportJob,
  cancelExportJob,
  exportDeliveryBusinessId,
  setExportDeliveryBusinessId,
  setMessage,
  exportOnExit,
  exportDeliveryForm,
  setExportDeliveryForm,
  markExportDelivered,
  isMarkingExportDelivered,
  showDelivery,
  locale,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  locale: string;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  loadExportJobs: (cursor?: string, append?: boolean) => Promise<void>;
  loadExportQueueStats: () => Promise<void>;
  isLoadingExports: boolean;
  exportFilters: ExportFiltersState;
  setExportFilters: Dispatch<SetStateAction<ExportFiltersState>>;
  businessSelectOptions: SelectOption[];
  actionLoading: Record<string, boolean>;
  exportQueueStats: ExportQueueStats | null;
  exportLaneDefs: { key: string; label: string }[];
  exportLaneJobs: Record<string, ExportJob[]>;
  isLoadingExportStats: boolean;
  exportJobs: ExportJob[];
  exportPage: number;
  hasNextExportPage: boolean;
  onExportNextPage: () => Promise<void>;
  onExportPrevPage: () => Promise<void>;
  retryExportJob: (jobId: string) => Promise<void>;
  requeueExportJob: (jobId: string) => Promise<void>;
  cancelExportJob: (jobId: string) => Promise<void>;
  exportDeliveryBusinessId: string;
  setExportDeliveryBusinessId: (value: string) => void;
  setMessage: (message: string) => void;
  exportOnExit: (businessId: string) => Promise<void>;
  exportDeliveryForm: ExportDeliveryFormState;
  setExportDeliveryForm: Dispatch<SetStateAction<ExportDeliveryFormState>>;
  markExportDelivered: () => Promise<void>;
  isMarkingExportDelivered: boolean;
  showDelivery?: boolean;
}) {
  if (!show) {
    return null;
  }

  return (
    <>
      <section className="command-card p-6 space-y-4 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">{t('exportQueueTitle')}</h3>
          <button
            type="button"
            onClick={() =>
              withAction('exports:refresh', () =>
                Promise.all([loadExportJobs(), loadExportQueueStats()]).then(
                  () => undefined,
                ),
              )
            }
            className="rounded border border-[color:var(--pt-accent-border-hi)] px-3 py-1 text-xs text-[color:var(--pt-text-1)]"
            disabled={isLoadingExports}
          >
            <span className="inline-flex items-center gap-2">
              {isLoadingExports ? <Spinner size="xs" variant="orbit" /> : null}
              {isLoadingExports ? t('loading') : t('refresh')}
            </span>
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
          <SmartSelect
            instanceId="platform-exports-filter-business"
            value={exportFilters.businessId}
            onChange={(value) =>
              setExportFilters((prev) => ({ ...prev, businessId: value }))
            }
            options={[
              { value: '', label: t('allBusinesses') },
              ...businessSelectOptions,
            ]}
            placeholder={t('filterByBusiness')}
          />
          <SmartSelect
            instanceId="platform-exports-filter-status"
            value={exportFilters.status}
            onChange={(value) =>
              setExportFilters((prev) => ({ ...prev, status: value }))
            }
            options={[
              { value: '', label: t('allStatuses') },
              { value: 'PENDING', label: t('statusPending') },
              { value: 'RUNNING', label: t('statusRunning') },
              { value: 'COMPLETED', label: t('statusCompleted') },
              { value: 'FAILED', label: t('statusFailed') },
              { value: 'CANCELED', label: t('statusCanceled') },
            ]}
          />
          <SmartSelect
            instanceId="platform-exports-filter-type"
            value={exportFilters.type}
            onChange={(value) =>
              setExportFilters((prev) => ({ ...prev, type: value }))
            }
            options={[
              { value: '', label: t('allTypes') },
              { value: 'STOCK', label: t('exportTypeStock') },
              { value: 'PRODUCTS', label: t('exportTypeProducts') },
              { value: 'OPENING_STOCK', label: t('exportTypeOpeningStock') },
              { value: 'PRICE_UPDATES', label: t('exportTypePriceUpdates') },
              { value: 'SUPPLIERS', label: t('exportTypeSuppliers') },
              { value: 'BRANCHES', label: t('exportTypeBranches') },
              { value: 'USERS', label: t('exportTypeUsers') },
              { value: 'AUDIT_LOGS', label: t('exportTypeAuditLogs') },
              { value: 'CUSTOMER_REPORTS', label: t('exportTypeCustomerReports') },
              { value: 'EXPORT_ON_EXIT', label: t('exportTypeExit') },
            ]}
          />
          <button
            type="button"
            onClick={() =>
              withAction('exports:apply', () =>
                Promise.all([loadExportJobs(), loadExportQueueStats()]).then(
                  () => undefined,
                ),
              )
            }
            className="rounded bg-[var(--pt-accent)] px-3 py-2 text-sm font-semibold text-black"
          >
            <span className="inline-flex items-center gap-2">
              {actionLoading['exports:apply'] ? (
                <Spinner size="xs" variant="ring" />
              ) : null}
              {t('applyFilters')}
            </span>
          </button>
        </div>
        <div className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep p-3 text-xs text-[color:var(--pt-text-2)]">
          <p className="text-[color:var(--pt-text-1)]">
            {t('exportQueueTotal', { value: exportQueueStats?.total ?? 0 })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {exportLaneDefs.map((lane) => (
              <span
                key={lane.key}
                className="rounded border border-[color:var(--pt-accent-border)] px-2 py-1 text-[11px]"
              >
                {lane.label}: {exportQueueStats?.byStatus[lane.key] ?? 0}
              </span>
            ))}
            {isLoadingExportStats ? <Spinner size="xs" variant="grid" /> : null}
          </div>
        </div>
        <div className="overflow-x-auto">
        <div className="grid gap-3 grid-cols-5 min-w-[680px]">
          {exportLaneDefs.map((lane) => (
            <div
              key={lane.key}
              className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep p-3 text-xs text-[color:var(--pt-text-2)]"
            >
              <p className="mb-2 font-semibold text-[color:var(--pt-text-1)]">
                {lane.label} ({exportLaneJobs[lane.key]?.length ?? 0})
              </p>
              <div className="space-y-2">
                {(exportLaneJobs[lane.key] ?? []).map((job) => (
                  <div
                    key={job.id}
                    className="rounded border border-[color:var(--pt-accent-border)] p-bg-card p-2"
                  >
                    <p className="text-[color:var(--pt-text-1)]">{job.business?.name ?? t('businessLabel')}</p>
                    <p className="text-[11px]">{job.type}</p>
                    <p className="text-[11px] text-[color:var(--pt-text-muted)]">{job.businessId}</p>
                    <p className="text-[11px] text-[color:var(--pt-text-muted)]">
                      {t('exportCreated', {
                        value: new Date(job.createdAt).toLocaleString(locale),
                      })}
                    </p>
                    {job.lastError ? (
                      <p className="text-amber-200">
                        {t('lastErrorLabel', { error: job.lastError })}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {job.status === 'FAILED' ? (
                        <button
                          type="button"
                          onClick={() =>
                            withAction(`exports:retry:${job.id}`, () =>
                              retryExportJob(job.id),
                            )
                          }
                          className="rounded border border-[color:var(--pt-accent-border)] px-2 py-1 text-[11px]"
                        >
                          {t('exportRetryAction')}
                        </button>
                      ) : null}
                      {job.status !== 'RUNNING' ? (
                        <button
                          type="button"
                          onClick={() =>
                            withAction(`exports:requeue:${job.id}`, () =>
                              requeueExportJob(job.id),
                            )
                          }
                          className="rounded border border-[color:var(--pt-accent-border)] px-2 py-1 text-[11px]"
                        >
                          {t('exportRequeueAction')}
                        </button>
                      ) : null}
                      {job.status === 'PENDING' ? (
                        <button
                          type="button"
                          onClick={() =>
                            withAction(`exports:cancel:${job.id}`, () =>
                              cancelExportJob(job.id),
                            )
                          }
                          className="rounded border border-[color:var(--pt-accent-border)] px-2 py-1 text-[11px]"
                        >
                          {t('exportCancelAction')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {!exportLaneJobs[lane.key]?.length ? (
                  <p className="text-[11px] text-[color:var(--pt-text-muted)]">{t('laneEmpty')}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        </div>
        <div className="space-y-2 text-xs text-[color:var(--pt-text-2)] nvi-stagger">
          {!exportJobs.length ? <p className="text-[color:var(--pt-text-2)]">{t('noExportJobs')}</p> : null}
          {(exportPage > 1 || hasNextExportPage) ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => withAction('exports:prev', () => onExportPrevPage())}
                className="inline-flex items-center gap-1 rounded border border-[color:var(--pt-accent-border)] px-3 py-1 text-xs text-[color:var(--pt-text-1)] disabled:opacity-40"
                disabled={exportPage <= 1 || isLoadingExports}
              >
                {t('prevPage')}
              </button>
              <span className="text-[color:var(--pt-text-muted)]">{t('pageLabel', { page: exportPage })}</span>
              <button
                type="button"
                onClick={() => withAction('exports:next', () => onExportNextPage())}
                className="inline-flex items-center gap-1 rounded border border-[color:var(--pt-accent-border)] px-3 py-1 text-xs text-[color:var(--pt-text-1)] disabled:opacity-40"
                disabled={!hasNextExportPage || isLoadingExports}
              >
                {t('nextPage')}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {showDelivery !== false && (
      <section className="command-card p-6 space-y-4 nvi-reveal">
        <h3 className="text-xl font-semibold">{t('exportDeliveryTitle')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            instanceId="platform-exports-delivery-business"
            value={exportDeliveryBusinessId}
            onChange={setExportDeliveryBusinessId}
            options={businessSelectOptions}
            placeholder={t('selectBusiness')}
          />
          <button
            type="button"
            onClick={() => {
              if (!exportDeliveryBusinessId) {
                setMessage(t('selectBusinessRequestExport'));
                return;
              }
              withAction(`exports:request:${exportDeliveryBusinessId}`, () =>
                exportOnExit(exportDeliveryBusinessId),
              );
            }}
            className="rounded border border-[color:var(--pt-accent-border)] px-3 py-2 text-sm font-semibold text-[color:var(--pt-text-1)]"
          >
            <span className="inline-flex items-center gap-2">
              {actionLoading[`exports:request:${exportDeliveryBusinessId}`] ? (
                <Spinner size="xs" variant="pulse" />
              ) : null}
              {t('requestExportOnExit')}
            </span>
          </button>
          <input
            value={exportDeliveryForm.exportJobId}
            onChange={(event) =>
              setExportDeliveryForm((prev) => ({
                ...prev,
                exportJobId: event.target.value,
              }))
            }
            placeholder={t('exportJobIdPlaceholder')}
            className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
          />
          <input
            value={exportDeliveryForm.reason}
            onChange={(event) =>
              setExportDeliveryForm((prev) => ({
                ...prev,
                reason: event.target.value,
              }))
            }
            placeholder={t('deliveryReasonPlaceholder')}
            className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
          />
          <button
            type="button"
            onClick={markExportDelivered}
            className="inline-flex items-center gap-2 rounded bg-[var(--pt-accent)] px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isMarkingExportDelivered}
          >
            {isMarkingExportDelivered ? <Spinner size="xs" variant="orbit" /> : null}
            {isMarkingExportDelivered ? t('markingDelivered') : t('markDelivered')}
          </button>
        </div>
      </section>
      )}
    </>
  );
}
