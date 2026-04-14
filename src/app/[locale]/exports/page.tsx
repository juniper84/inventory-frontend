'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import {
  apiFetch,
  buildRequestHeaders,
  getApiErrorMessage,
  getApiErrorMessageFromResponse,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { PaginationControls } from '@/components/PaginationControls';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { DatePickerInput } from '@/components/DatePickerInput';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';

import { useFormatDate } from '@/lib/business-context';
import { Banner } from '@/components/notifications/Banner';
import {
  StatusBadge,
  ProgressBar,
  Card,
  Icon,
  PageHeader,
  EmptyState,
} from '@/components/ui';
import { ExportCreateModal } from '@/components/exports/ExportCreateModal';

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────────

export default function ExportsPage() {
  const t = useTranslations('exportsPage');
  const common = useTranslations('common');
  const actions = useTranslations('actions');
  const { formatDateTime } = useFormatDate();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDownloading, setIsDownloading] = useState<Record<string, boolean>>({});
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [total, setTotal] = useState<number | null>(null);
  const [exportType, setExportType] = useState('STOCK');
  const [exportFormat, setExportFormat] = useState('csv');
  const [auditAck, setAuditAck] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useToastState();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [workerStatus, setWorkerStatus] = useState<ExportWorkerStatus | null>(
    null,
  );
  const { activeBranch, resolveBranchId } = useBranchScope();
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    type: '',
    branchId: '',
    from: '',
    to: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);


  // ─── Memoized options ───────────────────────────────────────────────────

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
      { value: 'EXPORT_ON_EXIT', label: t('exportTypes.fullDataDump') },
    ],
    [t],
  );
  const exportFormatOptions = useMemo(
    () => [
      { value: 'csv', label: t('formatCsv') },
      { value: 'excel', label: t('formatExcel') },
      { value: 'pdf', label: t('formatPdf') },
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
      { value: '', label: common('globalBranch') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );

  // ─── Derived KPIs ──────────────────────────────────────────────────────

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status === 'PENDING' || j.status === 'RUNNING').length,
    [jobs],
  );
  const completedJobs = useMemo(
    () => jobs.filter((job) => job.status === 'COMPLETED').length,
    [jobs],
  );
  const failedJobs = useMemo(
    () => jobs.filter((job) => job.status === 'FAILED').length,
    [jobs],
  );

  // ─── Search sync ──────────────────────────────────────────────────────

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);



  // ─── Data loaders (unchanged logic) ───────────────────────────────────

  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const branchData = await apiFetch<PaginatedResponse<Branch> | Branch[]>(
        '/branches?limit=200',
        { token },
      );
      setBranches(normalizePaginated(branchData).items);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    }
  }, [setMessage, t]);

  const loadJobs = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    const effectivePageSize = nextPageSize ?? pageSize;
    const cursor =
      targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
    try {
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
        type: filters.type || undefined,
        branchId: resolveBranchId(filters.branchId) || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const data = await apiFetch<PaginatedResponse<ExportJob> | ExportJob[]>(
        `/exports/jobs${query}`,
        { token },
      );
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
  }, [pageSize, filters.search, filters.status, filters.type, filters.branchId, filters.from, filters.to, resolveBranchId, t, setMessage]);

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
    loadReferenceData();
  }, [loadReferenceData]);

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
    loadJobs,
  ]);

  useEffect(() => {
    if (activeBranch?.id && !branchId) {
      setBranchId(activeBranch.id);
    }
  }, [activeBranch?.id, branchId]);

  // ─── Actions (unchanged logic) ────────────────────────────────────────

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
          format: exportFormat,
          acknowledgement: exportType === 'AUDIT_LOGS' && auditAck ? 'YES' : undefined,
          branchId: resolveBranchId(branchId) || undefined,
        }),
      });
      await loadJobs();
      setCreateOpen(false);
      setMessage({
        action: 'export',
        outcome: 'success',
        message: exportType === 'EXPORT_ON_EXIT' ? t('exportOnExitQueued') : t('created'),
      });
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
      const msg = await getApiErrorMessageFromResponse(
        response,
        t('downloadFailed'),
      );
      setMessage({ action: 'export', outcome: 'failure', message: msg });
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


  // ─── Loading state ────────────────────────────────────────────────────

  if (isLoading && jobs.length === 0) {
    return <PageSkeleton />;
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <section className="nvi-page nvi-stagger">

      {/* ── Hero ── */}
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <span className="nvi-badge">{t('badgeQueueWatch')}</span>
        }
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-[var(--nvi-accent)] px-3 py-2 text-xs font-semibold text-black"
          >
            <Icon name="Plus" size={14} />
            {t('createExport')}
          </button>
        }
      />

      {/* ── KPI strip ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* Active jobs */}
        <div className="group relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] to-transparent p-4 transition-all hover:border-amber-500/30 hover:shadow-[0_0_24px_-6px_rgba(245,158,11,0.15)]">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
              <Icon name="Loader" size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-400/70">{t('kpiActiveJobs')}</p>
              <p className="text-2xl font-bold tabular-nums text-amber-300">{activeJobs}</p>
            </div>
          </div>
        </div>
        {/* Completed */}
        <div className="group relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] to-transparent p-4 transition-all hover:border-emerald-500/30 hover:shadow-[0_0_24px_-6px_rgba(16,185,129,0.15)]">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <Icon name="CircleCheck" size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-400/70">{t('kpiCompleted')}</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-300">{completedJobs}</p>
            </div>
          </div>
        </div>
        {/* Failed */}
        <div className="group relative overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/[0.06] to-transparent p-4 transition-all hover:border-red-500/30 hover:shadow-[0_0_24px_-6px_rgba(239,68,68,0.15)]">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/20">
              <Icon name="CircleX" size={20} className="text-red-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-red-400/70">{t('kpiFailed')}</p>
              <p className="text-2xl font-bold tabular-nums text-red-300">{failedJobs}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status banner ── */}
      {message ? <Banner severity={message.outcome === 'success' ? 'success' : message.outcome === 'failure' ? 'error' : 'info'} message={message.message} onDismiss={() => setMessage(null)} /> : null}

      {/* ── Worker status ── */}
      {workerStatus ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Icon name="Activity" size={14} className="text-[color:var(--muted)]" />
            <span className="text-xs font-medium text-[color:var(--foreground)]">{t('workerTitle')}</span>
          </div>
          <span className="h-3.5 w-px bg-[color:var(--border)]" />
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${workerStatus.enabled ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20' : 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${workerStatus.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {workerStatus.enabled ? t('workerEnabled') : t('workerDisabled')}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 ring-1 ring-amber-500/20">
              {workerStatus.queue.pending} pending
            </span>
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400 ring-1 ring-blue-500/20">
              {workerStatus.queue.running} running
            </span>
            {workerStatus.queue.failed > 0 ? (
              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400 ring-1 ring-red-500/20">
                {workerStatus.queue.failed} failed
              </span>
            ) : null}
          </div>
          {workerStatus.lastJob ? (
            <>
              <span className="h-3.5 w-px bg-[color:var(--border)]" />
              <span className="text-[10px] text-[color:var(--muted)]">
                {t('lastJob', {
                  type: workerStatus.lastJob.type,
                  status: workerStatus.lastJob.status,
                  date: formatDateTime(workerStatus.lastJob.createdAt),
                })}
              </span>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — Export Jobs
         ══════════════════════════════════════════════════════════════════ */}
      <div className="mt-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-[color:var(--muted)]">{t('sectionJobs')}</h2>
      </div>
      <Card padding="lg">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20">
                <Icon name="ListOrdered" size={20} className="text-blue-400" />
              </div>
              <h3 className="text-base font-bold text-[color:var(--foreground)]">{t('exportJobs')}</h3>
            </div>
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
              instanceId="exports-filter-status"
              value={filters.status}
              onChange={(value) => pushFilters({ status: value })}
              options={statusOptions}
              placeholder={common('status')}
              className="nvi-select-container"
            />
            <SmartSelect
              instanceId="exports-filter-type"
              value={filters.type}
              onChange={(value) => pushFilters({ type: value })}
              options={typeOptions}
              placeholder={common('type')}
              className="nvi-select-container"
            />
            <SmartSelect
              instanceId="exports-filter-branch"
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
              className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-[color:var(--foreground)]"
            />
            <DatePickerInput
              value={filters.to}
              onChange={(value) => pushFilters({ to: value })}
              placeholder={common('toDate')}
              className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-[color:var(--foreground)]"
            />
          </ListFilters>

          {/* Table view */}
          {viewMode === 'table' ? (
            !jobs.length ? (
              <EmptyState
                icon={<Icon name="FileX" size={32} className="text-[color:var(--muted)]" />}
                title={t('noJobs')}
                description={t('noJobsHint')}
              />
            ) : (
              <div className="overflow-auto text-sm">
                <table className="min-w-[720px] w-full text-left text-sm text-[color:var(--foreground)]">
                  <thead className="text-xs uppercase text-[color:var(--muted)]">
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
                      <tr key={job.id} className="border-t border-[color:var(--border)]">
                        <td className="px-3 py-2"><StatusBadge status={job.type} size="xs" /></td>
                        <td className="px-3 py-2"><StatusBadge status={job.status} size="xs" /></td>
                        <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                          {formatDateTime(job.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                          {job.completedAt
                            ? formatDateTime(job.completedAt)
                            : t('notCompleted')}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {job.metadata?.attachments?.length ?? 0}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => downloadJob(job.id, job.metadata?.filename)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] px-2.5 py-1 text-xs text-[color:var(--foreground)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-70"
                            disabled={isDownloading[job.id]}
                          >
                            {isDownloading[job.id] ? (
                              <Spinner size="xs" variant="dots" />
                            ) : (
                              <Icon name="Download" size={12} />
                            )}
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
            /* Card view */
            <div className="space-y-2">
              {jobs.map((job) => {
                const statusStyles: Record<string, { border: string; iconBg: string; iconColor: string; icon: 'Clock' | 'Loader' | 'CircleCheck' | 'CircleX' }> = {
                  PENDING:   { border: 'border-l-amber-400', iconBg: 'bg-amber-500/10 ring-1 ring-amber-500/20', iconColor: 'text-amber-400', icon: 'Clock' },
                  RUNNING:   { border: 'border-l-blue-400', iconBg: 'bg-blue-500/10 ring-1 ring-blue-500/20', iconColor: 'text-blue-400', icon: 'Loader' },
                  COMPLETED: { border: 'border-l-emerald-400', iconBg: 'bg-emerald-500/10 ring-1 ring-emerald-500/20', iconColor: 'text-emerald-400', icon: 'CircleCheck' },
                  FAILED:    { border: 'border-l-red-400', iconBg: 'bg-red-500/10 ring-1 ring-red-500/20', iconColor: 'text-red-400', icon: 'CircleX' },
                };
                const st = statusStyles[job.status] ?? statusStyles.PENDING;
                return (
                  <div
                    key={job.id}
                    className={`flex flex-wrap items-center gap-4 rounded-xl border border-[color:var(--border)] border-l-[3px] ${st.border} bg-[color:var(--surface)] px-4 py-3 transition-all hover:shadow-md hover:shadow-black/5`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${st.iconBg}`}>
                      <Icon name={st.icon} size={16} className={st.iconColor} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={job.type} size="xs" />
                        <StatusBadge status={job.status} size="xs" />
                        {(job.status === 'PENDING' || job.status === 'RUNNING') ? (
                          <Spinner size="xs" variant="dots" />
                        ) : null}
                      </div>
                      <p className="text-[11px] text-[color:var(--muted)]">
                        {formatDateTime(job.createdAt)}
                        {job.status === 'FAILED' ? (
                          <span className="ml-2 text-red-400">{t('statusLabel')}: {job.status}</span>
                        ) : null}
                      </p>
                      {job.status === 'RUNNING' ? (
                        <ProgressBar value={50} max={100} color="blue" height={4} />
                      ) : null}
                      {job.metadata?.attachments?.length ? (
                        <div className="text-xs text-[color:var(--muted)]">
                          <p>
                            {t('attachmentsBundled', {
                              count: job.metadata.attachments.length,
                            })}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {job.metadata.attachments.slice(0, 3).map((file, idx) => (
                              <a
                                key={`${file.url}-${idx}`}
                                href={file.url}
                                target="_blank"
                                rel="noreferrer"
                                className="underline underline-offset-4 hover:text-[color:var(--accent)]"
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
                    {job.status === 'COMPLETED' ? (
                      <button
                        type="button"
                        onClick={() => downloadJob(job.id, job.metadata?.filename)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/20 transition-all hover:bg-emerald-500/20 hover:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={isDownloading[job.id]}
                      >
                        {isDownloading[job.id] ? <Spinner size="xs" variant="dots" /> : <Icon name="Download" size={14} />}
                        {isDownloading[job.id] ? t('downloading') : actions('download')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => downloadJob(job.id, job.metadata?.filename)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--foreground)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={isDownloading[job.id]}
                      >
                        {isDownloading[job.id] ? <Spinner size="xs" variant="dots" /> : <Icon name="Download" size={14} />}
                        {isDownloading[job.id] ? t('downloading') : actions('download')}
                      </button>
                    )}
                  </div>
                );
              })}
              {!jobs.length ? (
                <EmptyState
                  icon={<Icon name="FileX" size={32} className="text-[color:var(--muted)]" />}
                  title={t('noJobs')}
                  description={t('noJobsHint')}
                />
              ) : null}
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
      </Card>

      <ExportCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        exportType={exportType}
        onExportTypeChange={setExportType}
        exportTypes={exportTypes}
        exportFormat={exportFormat}
        onExportFormatChange={setExportFormat}
        exportFormatOptions={exportFormatOptions}
        branchId={branchId}
        onBranchIdChange={setBranchId}
        branches={branches}
        auditAck={auditAck}
        onAuditAckChange={setAuditAck}
        onSubmit={createExport}
        isCreating={isCreating}
      />

    </section>
  );
}
