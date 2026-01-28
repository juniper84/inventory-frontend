'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import {
  apiFetch,
  buildRequestHeaders,
  getApiErrorMessage,
  getApiErrorMessageFromResponse,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { DatePickerInput } from '@/components/DatePickerInput';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type ExportJob = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
  metadata?: {
    filename?: string;
    files?: { filename: string; csv: string }[];
    attachments?: { filename: string; url: string }[];
    zipUrl?: string;
  };
};

type Branch = { id: string; name: string };

type ExportWorkerStatus = {
  enabled: boolean;
  intervalMs: number;
  maxAttempts: number;
  queue: {
    pending: number;
    running: number;
    failed: number;
  };
  lastJob?: {
    id: string;
    type: string;
    status: string;
    createdAt: string;
    completedAt?: string | null;
  } | null;
};

type ImportPreview = {
  validRows: number;
  invalidRows: number;
  errors: { row: number; message: string }[];
  preview: Record<string, unknown>[];
};

export default function ExportsPage() {
  const t = useTranslations('exportsPage');
  const common = useTranslations('common');
  const actions = useTranslations('actions');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDownloading, setIsDownloading] = useState<Record<string, boolean>>({});
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const [total, setTotal] = useState<number | null>(null);
  const [exportType, setExportType] = useState('STOCK');
  const [auditAck, setAuditAck] = useState(false);
  const [message, setMessage] = useToastState();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [importType, setImportType] = useState('products');
  const [importCsv, setImportCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [workerStatus, setWorkerStatus] = useState<ExportWorkerStatus | null>(
    null,
  );
  const activeBranch = useActiveBranch();
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    type: '',
    branchId: '',
    from: '',
    to: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);
  const exportTypes = useMemo(
    () => [
      { value: 'STOCK', label: t('exportTypes.stock') },
      { value: 'PRODUCTS', label: t('exportTypes.products') },
      { value: 'OPENING_STOCK', label: t('exportTypes.openingStock') },
      { value: 'PRICE_UPDATES', label: t('exportTypes.priceUpdates') },
      { value: 'SUPPLIERS', label: t('exportTypes.suppliers') },
      { value: 'BRANCHES', label: t('exportTypes.branches') },
      { value: 'USERS', label: t('exportTypes.users') },
      { value: 'CUSTOMER_REPORTS', label: t('exportTypes.customerReports') },
      { value: 'AUDIT_LOGS', label: t('exportTypes.auditLogs') },
    ],
    [t],
  );
  const typeOptions = useMemo(
    () => [
      { value: '', label: common('allTypes') },
      ...exportTypes,
    ],
    [common, exportTypes],
  );
  const importTypes = useMemo(
    () => [
      { value: 'categories', label: t('importTypes.categories') },
      { value: 'products', label: t('importTypes.products') },
      { value: 'opening_stock', label: t('importTypes.openingStock') },
      { value: 'price_updates', label: t('importTypes.priceUpdates') },
      { value: 'status_updates', label: t('importTypes.statusUpdates') },
      { value: 'suppliers', label: t('importTypes.suppliers') },
      { value: 'branches', label: t('importTypes.branches') },
      { value: 'users', label: t('importTypes.users') },
    ],
    [t],
  );

  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'PENDING', label: common('statusPending') },
      { value: 'RUNNING', label: common('statusRunning') },
      { value: 'COMPLETED', label: common('statusCompleted') },
      { value: 'FAILED', label: common('statusFailed') },
    ],
    [common],
  );

  const branchOptions = useMemo(
    () => [
      { value: '', label: common('allBranches') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

  const loadJobs = async (targetPage = 1, nextPageSize?: number) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    const effectivePageSize = nextPageSize ?? pageSize;
    const cursor =
      targetPage === 1 ? null : pageCursors[targetPage] ?? null;
    try {
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
        type: filters.type || undefined,
        branchId: filters.branchId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const [branchData, data] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<ExportJob> | ExportJob[]>(`/exports/jobs${query}`, {
          token,
        }),
      ]);
      setBranches(normalizePaginated(branchData).items);
      const result = normalizePaginated(data);
      setJobs(result.items);
      setNextCursor(result.nextCursor);
      if (typeof result.total === 'number') {
        setTotal(result.total);
      }
    setPage(targetPage);
    setPageCursors((prev) => {
      const nextState: Record<number, string | null> =
        targetPage === 1 ? { 1: null } : { ...prev };
      if (result.nextCursor) {
        nextState[targetPage + 1] = result.nextCursor;
      }
      return nextState;
    });
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadWorkerStatus = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    try {
      const status = await apiFetch<ExportWorkerStatus>('/exports/worker/status', {
        token,
      });
      setWorkerStatus(status);
    } catch (err) {
      console.warn('Failed to load export worker status', err);
      setWorkerStatus(null);
    }
  };

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    loadJobs(1);
    loadWorkerStatus();
  }, [
    filters.search,
    filters.status,
    filters.type,
    filters.branchId,
    filters.from,
    filters.to,
  ]);

  useEffect(() => {
    if (activeBranch?.id && !branchId) {
      setBranchId(activeBranch.id);
    }
  }, [activeBranch?.id, branchId]);

  const createExport = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      await apiFetch('/exports/jobs', {
        token,
        method: 'POST',
        body: JSON.stringify({
          type: exportType,
          acknowledgement: exportType === 'AUDIT_LOGS' && auditAck ? 'YES' : undefined,
          branchId: branchId || undefined,
        }),
      });
      await loadJobs();
      setMessage({ action: 'export', outcome: 'success', message: t('created') });
    } catch (err) {
      setMessage({
        action: 'export',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('createFailed')),
      });
    } finally {
      setIsCreating(false);
    }
  };

  const downloadJob = async (jobId: string, filename?: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsDownloading((prev) => ({ ...prev, [jobId]: true }));
    const base =
      process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';
    const { headers } = buildRequestHeaders(token);
    const response = await fetch(`${base}/exports/jobs/${jobId}/download`, {
      headers,
    });
    if (!response.ok) {
      const message = await getApiErrorMessageFromResponse(
        response,
        t('downloadFailed'),
      );
      setMessage({ action: 'export', outcome: 'failure', message });
      setIsDownloading((prev) => ({ ...prev, [jobId]: false }));
      return;
    }
    const data = (await response.json()) as {
      csv?: string;
      filename?: string;
      files?: { filename: string; csv: string }[];
      attachments?: { filename: string; url: string }[];
      zipUrl?: string;
    };
    if (data.zipUrl) {
      const link = document.createElement('a');
      link.href = data.zipUrl;
      link.download = filename || t('exportZip');
      link.click();
      setIsDownloading((prev) => ({ ...prev, [jobId]: false }));
      return;
    }
    const files = data.files && data.files.length ? data.files : null;
    if (files) {
      files.forEach((file) => {
        const blob = new Blob([file.csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.filename;
        link.click();
        URL.revokeObjectURL(url);
      });
      if (data.attachments?.length) {
        setMessage({ action: 'save', outcome: 'info', message: t('attachmentsLinked') });
      }
    } else if (data.csv) {
      const blob = new Blob([data.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || data.filename || t('exportCsv');
      link.click();
      URL.revokeObjectURL(url);
    } else {
      setMessage({ action: 'save', outcome: 'info', message: t('noCsvFound') });
      setIsDownloading((prev) => ({ ...prev, [jobId]: false }));
      return;
    }
    setIsDownloading((prev) => ({ ...prev, [jobId]: false }));
  };

  const previewImport = async () => {
    const token = getAccessToken();
    if (!token || !importCsv.trim()) {
      return;
    }
    setMessage(null);
    setIsPreviewing(true);
    try {
      const result = await apiFetch<ImportPreview>('/imports/preview', {
        token,
        method: 'POST',
        body: JSON.stringify({ type: importType, csv: importCsv }),
      });
      setPreview(result);
      setMessage({ action: 'import', outcome: 'success', message: t('previewReady') });
    } catch (err) {
      setMessage({
        action: 'import',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('previewFailed')),
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const applyImport = async () => {
    const token = getAccessToken();
    if (!token || !importCsv.trim()) {
      return;
    }
    setMessage(null);
    setIsApplying(true);
    try {
      const result = await apiFetch<ImportPreview>('/imports/apply', {
        token,
        method: 'POST',
        body: JSON.stringify({ type: importType, csv: importCsv }),
      });
      setPreview(result);
      setMessage({ action: 'import', outcome: 'success', message: t('applySuccess') });
    } catch (err) {
      setMessage({
        action: 'import',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('applyFailed')),
      });
    } finally {
      setIsApplying(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
      <p className="text-sm text-gold-300">
        {t('subtitle')}
      </p>
      {message ? <StatusBanner message={message} /> : null}
      {workerStatus ? (
        <div className="command-card p-4 text-sm text-gold-200 nvi-reveal">
          <p className="text-gold-100 font-semibold">{t('workerTitle')}</p>
          <p>
            {t('workerStatus')}:{' '}
            <span className="text-gold-100">
              {workerStatus.enabled ? t('workerEnabled') : t('workerDisabled')}
            </span>{' '}
            • {t('workerInterval', { seconds: Math.round(workerStatus.intervalMs / 1000) })} •{' '}
            {t('workerMaxAttempts', { count: workerStatus.maxAttempts })}
          </p>
          <p>
            {t('queueLabel', {
              pending: workerStatus.queue.pending,
              running: workerStatus.queue.running,
              failed: workerStatus.queue.failed,
            })}
          </p>
          {workerStatus.lastJob ? (
            <p className="text-xs text-gold-400">
              {t('lastJob', {
                type: workerStatus.lastJob.type,
                status: workerStatus.lastJob.status,
                date: new Date(workerStatus.lastJob.createdAt).toLocaleString(),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('createExport')}</h3>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px]">
            <SmartSelect
              value={exportType}
              onChange={setExportType}
              options={exportTypes}
              className="nvi-select-container"
            />
          </div>
          <div className="min-w-[220px]">
            <SmartSelect
              value={branchId}
              onChange={(value) => setBranchId(value)}
              options={branches.map((branch) => ({
                value: branch.id,
                label: branch.name,
              }))}
              placeholder={common('branch')}
              isClearable
              className="nvi-select-container"
            />
          </div>
          {exportType === 'AUDIT_LOGS' ? (
            <label className="flex items-center gap-2 text-xs text-gold-200">
              <input
                type="checkbox"
                checked={auditAck}
                onChange={(event) => setAuditAck(event.target.checked)}
              />
              {t('auditAck')}
            </label>
          ) : null}
          <button
            type="button"
            onClick={createExport}
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isCreating}
          >
            {isCreating ? <Spinner size="xs" variant="orbit" /> : null}
            {isCreating ? t('running') : t('runExport')}
          </button>
        </div>
      </div>

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-gold-100">{t('exportJobs')}</h3>
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </div>
        <ListFilters
          searchValue={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={() => pushFilters({ search: searchDraft })}
          onReset={() => resetFilters()}
          isLoading={isLoading}
          showAdvanced={showAdvanced}
          onToggleAdvanced={() => setShowAdvanced((prev) => !prev)}
        >
          <SmartSelect
            value={filters.status}
            onChange={(value) => pushFilters({ status: value })}
            options={statusOptions}
            placeholder={common('status')}
            className="nvi-select-container"
          />
          <SmartSelect
            value={filters.type}
            onChange={(value) => pushFilters({ type: value })}
            options={typeOptions}
            placeholder={common('type')}
            className="nvi-select-container"
          />
          <SmartSelect
            value={filters.branchId}
            onChange={(value) => pushFilters({ branchId: value })}
            options={branchOptions}
            placeholder={common('branch')}
            className="nvi-select-container"
          />
          <DatePickerInput
            value={filters.from}
            onChange={(value) => pushFilters({ from: value })}
            placeholder={common('fromDate')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <DatePickerInput
            value={filters.to}
            onChange={(value) => pushFilters({ to: value })}
            placeholder={common('toDate')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </ListFilters>
        {viewMode === 'table' ? (
          !jobs.length ? (
            <StatusBanner message={t('noJobs')} />
          ) : (
            <div className="overflow-auto text-sm text-gold-200">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('typeLabel')}</th>
                    <th className="px-3 py-2">{t('statusLabel')}</th>
                    <th className="px-3 py-2">{t('createdAt')}</th>
                    <th className="px-3 py-2">{t('completedAt')}</th>
                    <th className="px-3 py-2">{t('attachmentsLabel')}</th>
                    <th className="px-3 py-2">{t('actionsLabel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2 font-semibold">{job.type}</td>
                      <td className="px-3 py-2">{job.status}</td>
                      <td className="px-3 py-2">
                        {new Date(job.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {job.completedAt
                          ? new Date(job.completedAt).toLocaleString()
                          : t('notCompleted')}
                      </td>
                      <td className="px-3 py-2">
                        {job.metadata?.attachments?.length ?? 0}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => downloadJob(job.id, job.metadata?.filename)}
                          className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                          disabled={isDownloading[job.id]}
                        >
                          {isDownloading[job.id] ? (
                            <Spinner size="xs" variant="dots" />
                          ) : null}
                          {isDownloading[job.id] ? t('downloading') : actions('download')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="space-y-2 text-sm text-gold-200">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-gold-700/40 bg-black/40 px-3 py-2"
              >
                <div>
                  <p className="text-gold-100">
                    {job.type} • {job.status}
                  </p>
                  <p className="text-xs text-gold-400">
                    {new Date(job.createdAt).toLocaleString()}
                  </p>
                  {job.metadata?.attachments?.length ? (
                    <div className="text-xs text-gold-300">
                      <p>
                        {t('attachmentsBundled', {
                          count: job.metadata.attachments.length,
                        })}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {job.metadata.attachments.slice(0, 3).map((file) => (
                          <a
                            key={file.url}
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-4"
                          >
                            {file.filename}
                          </a>
                        ))}
                        {job.metadata.attachments.length > 3 ? (
                          <span>
                            {t('attachmentsMore', {
                              count: job.metadata.attachments.length - 3,
                            })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => downloadJob(job.id, job.metadata?.filename)}
                  className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isDownloading[job.id]}
                >
                  {isDownloading[job.id] ? <Spinner size="xs" variant="dots" /> : null}
                  {isDownloading[job.id] ? t('downloading') : actions('download')}
                </button>
              </div>
            ))}
            {!jobs.length ? <StatusBanner message={t('noJobs')} /> : null}
          </div>
        )}
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          itemCount={jobs.length}
          availablePages={Object.keys(pageCursors).map(Number)}
          hasNext={Boolean(nextCursor)}
          hasPrev={page > 1}
          isLoading={isLoading}
          onPageChange={(nextPage) => loadJobs(nextPage)}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setPageCursors({ 1: null });
            setTotal(null);
            loadJobs(1, size);
          }}
        />
      </div>

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('importPreview')}</h3>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px]">
            <SmartSelect
              value={importType}
              onChange={setImportType}
              options={importTypes}
              className="nvi-select-container"
            />
          </div>
          <button
            type="button"
            onClick={previewImport}
            className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isPreviewing}
          >
            {isPreviewing ? <Spinner size="xs" variant="grid" /> : null}
            {isPreviewing ? t('previewing') : t('previewImport')}
          </button>
          <button
            type="button"
            onClick={applyImport}
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isApplying}
          >
            {isApplying ? <Spinner size="xs" variant="pulse" /> : null}
            {isApplying ? t('applying') : t('applyImport')}
          </button>
        </div>
        <textarea
          value={importCsv}
          onChange={(event) => setImportCsv(event.target.value)}
          rows={6}
          placeholder={t('csvPlaceholder')}
          className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
        />
        {preview ? (
          <div className="space-y-2 text-sm text-gold-200">
            <p>
              {t('previewCounts', {
                valid: preview.validRows,
                invalid: preview.invalidRows,
              })}
            </p>
            {preview.errors.length ? (
              <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                {preview.errors.map((err) => (
                  <div key={`${err.row}-${err.message}`}>
                    {t('previewRowError', { row: err.row, message: err.message })}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
