'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { notify } from '@/components/notifications/NotificationProvider';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { Banner } from '@/components/notifications/Banner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { formatEntityLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { useFormatDate } from '@/lib/business-context';
import {
  ListPage,
  Card,
  Icon,
  StatusBadge,
  EmptyState,
  Tabs,
} from '@/components/ui';
import type { IconName, TabItem } from '@/components/ui';
import { AttachmentUploadModal } from '@/components/attachments/AttachmentUploadModal';

// ─── Types ──────────────────────────────────────────────────────────────────

type Supplier = { id: string; name: string };
type Purchase = { id: string; status: string; createdAt?: string; supplier?: Supplier | null };
type PurchaseOrder = { id: string; status: string; createdAt?: string; supplier?: Supplier | null };
type Attachment = {
  id: string;
  filename: string;
  url: string;
  mimeType?: string | null;
  sizeMb?: string | null;
  status: string;
  version: number;
  createdAt: string;
};
type PresignResponse = { url: string; publicUrl: string; key: string };
type AttachmentVersion = {
  id: string;
  version: number;
  filename: string;
  url: string;
  sizeMb?: string | null;
  createdAt: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}

function getFileIcon(mimeType?: string | null): IconName {
  if (!mimeType) return 'File';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType === 'application/pdf') return 'FileText';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') return 'FileSpreadsheet';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'FileText';
  return 'File';
}

function getFileIconColor(mimeType?: string | null): string {
  if (!mimeType) return 'text-gold-400';
  if (mimeType.startsWith('image/')) return 'text-blue-400';
  if (mimeType === 'application/pdf') return 'text-red-400';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') return 'text-emerald-400';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'text-amber-400';
  return 'text-gold-400';
}

function isImageMime(mimeType?: string | null): boolean {
  return !!mimeType?.startsWith('image/');
}

function formatFileSize(sizeMb?: string | null): string {
  if (!sizeMb) return '\u2014';
  const mb = Number(sizeMb);
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AttachmentsPage() {
  const t = useTranslations('attachmentsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const locale = useLocale();
  const { formatDate } = useFormatDate();
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('attachments.write');

  // ─── State ──────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [message, setMessage] = useState<{ action: string; outcome: string; message: string } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState<number | null>(null);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({ 1: null });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [targetType, setTargetType] = useState<'purchase' | 'purchaseOrder'>('purchase');
  const [targetId, setTargetId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadFormOpen, setUploadFormOpen] = useState(false);
  const [fileFilter, setFileFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [versionMap, setVersionMap] = useState<Record<string, { loading: boolean; versions: AttachmentVersion[]; error?: string }>>({});

  // ─── Derived ────────────────────────────────────────────────────────────
  const activeAttachments = attachments.filter((a) => a.status === 'ACTIVE').length;
  const imageCount = attachments.filter((a) => isImageMime(a.mimeType)).length;
  const totalSizeMb = attachments.reduce((sum, a) => sum + Number(a.sizeMb ?? 0), 0);

  const filteredAttachments = attachments.filter((a) => {
    if (fileFilter === 'all') return true;
    if (fileFilter === 'images') return a.mimeType?.startsWith('image/');
    if (fileFilter === 'documents') return /pdf|doc|docx/.test(a.mimeType ?? '');
    if (fileFilter === 'spreadsheets') return /xls|xlsx|csv/.test(a.mimeType ?? '');
    return true;
  });

  const fileTabs: TabItem[] = [
    { id: 'all', label: t('filterAll') },
    { id: 'images', label: t('filterImages') },
    { id: 'documents', label: t('filterDocuments') },
    { id: 'spreadsheets', label: t('filterSpreadsheets') },
  ];

  const formatDocLabel = (doc: Purchase | PurchaseOrder) => {
    const dateLabel = doc.createdAt ? formatDate(doc.createdAt) : null;
    const parts = [doc.supplier?.name ?? null, dateLabel, doc.status].filter(Boolean);
    return parts.length
      ? parts.join(' \u00B7 ')
      : formatEntityLabel({ id: doc.id }, common('unknown'));
  };

  const handleFileSelected = (f: File) => {
    setFile(f);
  };

  // ─── Data loading ───────────────────────────────────────────────────────
  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const [purchaseData, poData] = await Promise.all([
        apiFetch<PaginatedResponse<Purchase> | Purchase[]>('/purchases?limit=200', { token }),
        apiFetch<PaginatedResponse<PurchaseOrder> | PurchaseOrder[]>('/purchase-orders?limit=200', { token }),
      ]);
      setPurchases(normalizePaginated(purchaseData).items);
      setPurchaseOrders(normalizePaginated(poData).items);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    }
  }, [setMessage, t]);

  const load = async (
    selectedId?: string,
    selectedType?: string,
    targetPage = 1,
    nextPageSize?: number,
  ) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const id = selectedId ?? targetId;
      const type = selectedType ?? targetType;
      if (!id) {
        setAttachments([]);
        setNextCursor(null);
        setTotal(null);
        return;
      }
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor = targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
      const params =
        type === 'purchase'
          ? { purchaseId: id }
          : { purchaseOrderId: id };
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
        ...params,
      });
      const attachmentData = await apiFetch<
        PaginatedResponse<Attachment> | Attachment[]
      >(
        `/attachments${query}`,
        { token },
      );
      const attachmentResult = normalizePaginated(attachmentData);
      setAttachments(attachmentResult.items);
      setNextCursor(attachmentResult.nextCursor);
      if (typeof attachmentResult.total === 'number') {
        setTotal(attachmentResult.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (attachmentResult.nextCursor) {
          nextState[targetPage + 1] = attachmentResult.nextCursor;
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

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    load();
  }, []);

  // ─── Upload ─────────────────────────────────────────────────────────────
  const upload = async () => {
    const token = getAccessToken();
    if (!token || !file || !targetId) {
      return;
    }
    setMessage(null);
    setIsUploading(true);
    try {
      const presign = await apiFetch<PresignResponse>('/attachments/presign', {
        token,
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          purchaseId: targetType === 'purchase' ? targetId : undefined,
          purchaseOrderId: targetType === 'purchaseOrder' ? targetId : undefined,
        }),
      });
      const uploadResponse = await fetch(presign.url, {
        method: 'PUT',
        headers: file.type ? { 'Content-Type': file.type } : {},
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error(t('uploadFailed'));
      }
      await apiFetch('/attachments', {
        token,
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          storageKey: presign.key,
          url: presign.publicUrl,
          sizeMb: Number((file.size / (1024 * 1024)).toFixed(2)),
          mimeType: file.type || undefined,
          purchaseId: targetType === 'purchase' ? targetId : undefined,
          purchaseOrderId: targetType === 'purchaseOrder' ? targetId : undefined,
        }),
      });
      setFile(null);
      setUploadFormOpen(false);
      setMessage({ action: 'create', outcome: 'success', message: t('uploaded') });
      await load(targetId, targetType, 1);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('uploadFailed')),
      });
    } finally {
      setIsUploading(false);
    }
  };

  // ─── Remove ─────────────────────────────────────────────────────────────
  const remove = async (id: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const ok = await notify.confirm({
      title: t('removeConfirmTitle'),
      message: t('removeConfirmMessage'),
      confirmText: t('removeConfirmButton'),
    });
    if (!ok) return;
    setMessage(null);
    setRemovingId(id);
    try {
      await apiFetch(`/attachments/${id}/remove`, { token, method: 'POST' });
      setMessage({ action: 'delete', outcome: 'success', message: t('removed') });
      await load();
    } catch (err) {
      setMessage({
        action: 'delete',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('removeFailed')),
      });
    } finally {
      setRemovingId(null);
    }
  };

  // ─── Selection ──────────────────────────────────────────────────────────
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const allIds = filteredAttachments.map((a) => a.id);
      const allSelected = allIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(allIds);
    });
  };

  const bulkDownload = async () => {
    const token = getAccessToken();
    if (!token || selectedIds.size === 0) return;
    setIsBulkDownloading(true);
    try {
      const result = await apiFetch<{ zipUrl: string }>('/attachments/bulk-download', {
        token,
        method: 'POST',
        body: JSON.stringify({ attachmentIds: Array.from(selectedIds) }),
      });
      window.open(result.zipUrl, '_blank');
      setSelectedIds(new Set());
      setMessage({ action: 'load', outcome: 'success', message: t('bulkDownloadStarted') });
    } catch (err) {
      setMessage({ action: 'load', outcome: 'failure', message: getApiErrorMessage(err, t('bulkDownloadFailed')) });
    } finally {
      setIsBulkDownloading(false);
    }
  };

  // ─── Versions ───────────────────────────────────────────────────────────
  const toggleVersions = async (attachmentId: string) => {
    const existing = versionMap[attachmentId];
    if (existing && !existing.loading) {
      setVersionMap((prev) => {
        const next = { ...prev };
        delete next[attachmentId];
        return next;
      });
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setVersionMap((prev) => ({ ...prev, [attachmentId]: { loading: true, versions: [] } }));
    try {
      const versions = await apiFetch<AttachmentVersion[]>(`/attachments/${attachmentId}/versions`, { token });
      setVersionMap((prev) => ({ ...prev, [attachmentId]: { loading: false, versions } }));
    } catch (err) {
      setVersionMap((prev) => ({ ...prev, [attachmentId]: { loading: false, versions: [], error: getApiErrorMessage(err, t('versionsFailed')) } }));
    }
  };

  // ─── KPI strip ──────────────────────────────────────────────────────────
  const kpis = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      {([
        { label: t('kpiTotalFiles'), value: attachments.length, icon: 'Paperclip' as IconName, tone: 'accent' },
        { label: t('kpiImages'), value: imageCount, icon: 'Image' as IconName, tone: 'blue' },
        { label: t('kpiTotalSize'), value: totalSizeMb < 1 ? `${Math.round(totalSizeMb * 1024)} KB` : `${totalSizeMb.toFixed(1)} MB`, icon: 'HardDrive' as IconName, tone: 'amber' },
        { label: t('kpiActive'), value: activeAttachments, icon: 'CircleCheck' as IconName, tone: 'emerald' },
      ] as const).map((kpi) => (
        <Card key={kpi.label} padding="md" as="article">
          <div className="flex items-center gap-3">
            <div className={`nvi-kpi-icon nvi-kpi-icon--${kpi.tone} shrink-0`}>
              <Icon name={kpi.icon} size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--nvi-text-muted)]">{kpi.label}</p>
              <p className="mt-0.5 text-2xl font-semibold text-[var(--nvi-text-primary)]">{kpi.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  // ─── Upload modal ───────────────────────────────────────────────────────
  const uploadModal = (
    <AttachmentUploadModal
      open={uploadFormOpen}
      onClose={() => setUploadFormOpen(false)}
      targetType={targetType}
      onTargetTypeChange={(value) => {
        setTargetType(value);
        setTargetId('');
        setNextCursor(null);
      }}
      targetId={targetId}
      onTargetIdChange={(value) => {
        setTargetId(value);
        setNextCursor(null);
        setPage(1);
        setPageCursors({ 1: null });
        setTotal(null);
        if (value) {
          load(value, targetType, 1).catch((err) =>
            setMessage({ action: 'load', outcome: 'failure', message: getApiErrorMessage(err, t('loadFailed')) }),
          );
        }
      }}
      purchases={purchases}
      purchaseOrders={purchaseOrders}
      formatDocLabel={formatDocLabel}
      file={file}
      onFileSelected={handleFileSelected}
      onClearFile={() => setFile(null)}
      isDragging={isDragging}
      onDragStateChange={setIsDragging}
      getFileIcon={getFileIcon}
      getFileIconColor={getFileIconColor}
      onSubmit={upload}
      isUploading={isUploading}
      canWrite={canWrite}
    />
  );

  // ─── Bulk action bar ───────────────────────────────────────────────────
  const bulkBar = selectedIds.size > 0 ? (
    <div className="flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-2.5">
      <Icon name="SquareCheck" size={16} className="text-blue-400" />
      <span className="text-sm text-[var(--nvi-text-secondary)]">
        {t('selectedCount', { count: selectedIds.size })}
      </span>
      <button
        type="button"
        onClick={bulkDownload}
        disabled={isBulkDownloading}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--nvi-border)] bg-[var(--nvi-bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--nvi-text-primary)] transition-colors hover:border-gold-500/40 disabled:opacity-60"
      >
        {isBulkDownloading ? <Spinner size="xs" variant="pulse" /> : <Icon name="Download" size={14} />}
        {t('downloadSelected')}
      </button>
      <button
        type="button"
        onClick={() => setSelectedIds(new Set())}
        className="text-[var(--nvi-text-muted)] hover:text-[var(--nvi-text-primary)] transition-colors"
      >
        <Icon name="X" size={14} />
      </button>
    </div>
  ) : null;

  // ─── File gallery card ─────────────────────────────────────────────────
  const renderFileCard = (attachment: Attachment) => {
    const isImage = isImageMime(attachment.mimeType);
    const versionsData = versionMap[attachment.id];
    const isVersionsOpen = !!versionsData;

    return (
      <div key={attachment.id} className="nvi-card nvi-card--glow nvi-card-hover overflow-hidden nvi-reveal">
        {/* Thumbnail / icon area */}
        <div className="relative">
          {isImage ? (
            <div className="nvi-img-zoom aspect-[16/10] bg-black/40">
              <img
                src={attachment.url}
                alt={attachment.filename}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-[var(--nvi-bg-elevated)] to-black/60">
              <Icon name={getFileIcon(attachment.mimeType)} size={48} className={getFileIconColor(attachment.mimeType)} />
            </div>
          )}

          {/* Select checkbox overlay */}
          <label className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-black/50 backdrop-blur-sm cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.has(attachment.id)}
              onChange={() => toggleSelected(attachment.id)}
              className="accent-gold-400"
            />
          </label>

          {/* Version badge */}
          {attachment.version > 1 ? (
            <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-gold-300 backdrop-blur-sm">
              v{attachment.version}
            </span>
          ) : null}
        </div>

        {/* Card body */}
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--nvi-text-primary)]">
                {attachment.filename}
              </p>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--nvi-text-muted)]">
                <span>{formatFileSize(attachment.sizeMb)}</span>
                <span className="opacity-40">|</span>
                <span>{relativeTime(attachment.createdAt)}</span>
              </div>
            </div>
            <StatusBadge
              status={attachment.status}
              label={attachment.status === 'ACTIVE' ? t('statusActive') : attachment.status === 'REMOVED' ? t('statusRemoved') : attachment.status}
              size="xs"
            />
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-2">
            <a
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--nvi-border)] px-3 py-1.5 text-xs font-medium text-[var(--nvi-text-primary)] transition-colors hover:border-gold-500/40"
            >
              <Icon name="Download" size={12} />
              {t('download')}
            </a>
            <button
              type="button"
              onClick={() => toggleVersions(attachment.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text-secondary)] transition-colors hover:border-gold-500/40"
            >
              <Icon name="History" size={12} />
              {isVersionsOpen ? t('hideVersions') : t('versions')}
            </button>
            <button
              type="button"
              onClick={() => remove(attachment.id)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-red-400/70 transition-colors hover:border-red-500/40 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={removingId === attachment.id || !canWrite}
              title={!canWrite ? noAccess('title') : undefined}
            >
              {removingId === attachment.id ? (
                <Spinner size="xs" variant="dots" />
              ) : (
                <Icon name="Trash2" size={12} />
              )}
              {removingId === attachment.id ? t('removing') : actions('remove')}
            </button>
          </div>

          {/* Version history panel */}
          {isVersionsOpen ? (
            <div className="nvi-expand rounded-lg border border-[var(--nvi-border)] bg-[var(--nvi-bg-elevated)] p-3">
              {versionsData.loading ? (
                <div className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
                  <Spinner size="xs" variant="dots" />
                  {t('loadingVersions')}
                </div>
              ) : versionsData.error ? (
                <p className="text-xs text-red-400">{versionsData.error}</p>
              ) : versionsData.versions.length === 0 ? (
                <p className="text-xs text-[var(--nvi-text-muted)]">{t('noVersions')}</p>
              ) : (
                <ul className="space-y-2">
                  {versionsData.versions.map((v) => (
                    <li key={v.id} className="flex items-center gap-3 text-xs">
                      <span className="rounded bg-gold-400/10 px-1.5 py-0.5 text-[10px] font-medium text-gold-400">v{v.version}</span>
                      <span className="min-w-0 flex-1 truncate text-[var(--nvi-text-secondary)]">{v.filename}</span>
                      <span className="shrink-0 text-[var(--nvi-text-muted)]">{relativeTime(v.createdAt)}</span>
                      <a href={v.url} target="_blank" rel="noreferrer" className="shrink-0 text-gold-400 hover:text-gold-200 transition-colors">
                        <Icon name="ExternalLink" size={12} />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  // ─── Table view ─────────────────────────────────────────────────────────
  const tableView = (
    <Card padding="sm">
      <table className="min-w-[700px] w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--nvi-border)]">
            <th className="w-8 px-3 py-2.5">
              <input
                type="checkbox"
                checked={filteredAttachments.length > 0 && filteredAttachments.every((a) => selectedIds.has(a.id))}
                onChange={toggleSelectAll}
                className="accent-gold-400"
              />
            </th>
            <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider text-[var(--nvi-text-muted)]">{t('filename')}</th>
            <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider text-[var(--nvi-text-muted)]">{t('mimeType')}</th>
            <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider text-[var(--nvi-text-muted)]">{t('size')}</th>
            <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider text-[var(--nvi-text-muted)]">{t('versionLabel')}</th>
            <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider text-[var(--nvi-text-muted)]">{t('statusLabel')}</th>
            <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider text-[var(--nvi-text-muted)]">{t('createdAt')}</th>
            <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider text-[var(--nvi-text-muted)]">{t('actionsLabel')}</th>
          </tr>
        </thead>
        <tbody>
          {filteredAttachments.map((attachment) => {
            const versionsData = versionMap[attachment.id];
            return (
              <tr key={attachment.id} className="border-b border-[var(--nvi-border)] last:border-0 transition-colors hover:bg-white/[0.02]">
                <td className="px-3 py-3">
                  <input type="checkbox" checked={selectedIds.has(attachment.id)} onChange={() => toggleSelected(attachment.id)} className="accent-gold-400" />
                </td>
                <td className="max-w-[200px] px-3 py-3">
                  <div className="flex items-center gap-2">
                    {isImageMime(attachment.mimeType) ? (
                      <div className="nvi-img-zoom h-8 w-8 shrink-0 overflow-hidden rounded">
                        <img src={attachment.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      </div>
                    ) : (
                      <Icon name={getFileIcon(attachment.mimeType)} size={16} className={getFileIconColor(attachment.mimeType)} />
                    )}
                    <span className="truncate font-medium text-[var(--nvi-text-primary)]">{attachment.filename}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-[var(--nvi-text-muted)]">{attachment.mimeType ?? '\u2014'}</td>
                <td className="px-3 py-3 text-xs text-[var(--nvi-text-secondary)]">{formatFileSize(attachment.sizeMb)}</td>
                <td className="px-3 py-3">
                  <span className="rounded bg-gold-400/10 px-1.5 py-0.5 text-[10px] font-medium text-gold-400">v{attachment.version}</span>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge
                    status={attachment.status}
                    label={attachment.status === 'ACTIVE' ? t('statusActive') : attachment.status === 'REMOVED' ? t('statusRemoved') : attachment.status}
                    size="xs"
                  />
                </td>
                <td className="px-3 py-3 text-xs text-[var(--nvi-text-muted)]">{relativeTime(attachment.createdAt)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md p-1.5 text-[var(--nvi-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--nvi-text-primary)]"
                      title={t('download')}
                    >
                      <Icon name="Download" size={14} />
                    </a>
                    <button
                      type="button"
                      onClick={() => toggleVersions(attachment.id)}
                      className="rounded-md p-1.5 text-[var(--nvi-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--nvi-text-primary)]"
                      title={versionsData ? t('hideVersions') : t('versions')}
                    >
                      <Icon name="History" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(attachment.id)}
                      className="rounded-md p-1.5 text-[var(--nvi-text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={removingId === attachment.id || !canWrite}
                      title={!canWrite ? noAccess('title') : actions('remove')}
                    >
                      {removingId === attachment.id ? <Spinner size="xs" variant="dots" /> : <Icon name="Trash2" size={14} />}
                    </button>
                  </div>
                  {/* Inline version panel for table row */}
                  {versionsData ? (
                    <div className="mt-2 rounded-lg border border-[var(--nvi-border)] bg-[var(--nvi-bg-elevated)] p-2 nvi-expand">
                      {versionsData.loading ? (
                        <div className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
                          <Spinner size="xs" variant="dots" /> {t('loadingVersions')}
                        </div>
                      ) : versionsData.error ? (
                        <p className="text-xs text-red-400">{versionsData.error}</p>
                      ) : versionsData.versions.length === 0 ? (
                        <p className="text-xs text-[var(--nvi-text-muted)]">{t('noVersions')}</p>
                      ) : (
                        <ul className="space-y-1">
                          {versionsData.versions.map((v) => (
                            <li key={v.id} className="flex items-center gap-2 text-xs">
                              <span className="rounded bg-gold-400/10 px-1.5 py-0.5 text-[10px] font-medium text-gold-400">v{v.version}</span>
                              <span className="text-[var(--nvi-text-secondary)]">{v.filename}</span>
                              <span className="text-[var(--nvi-text-muted)]">{relativeTime(v.createdAt)}</span>
                              <a href={v.url} target="_blank" rel="noreferrer" className="text-gold-400 hover:text-gold-200">
                                <Icon name="ExternalLink" size={12} />
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );

  // ─── Cards view ─────────────────────────────────────────────────────────
  const cardsView = (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 nvi-stagger">
      {filteredAttachments.map(renderFileCard)}
    </div>
  );

  // ─── Filter tabs + select-all ──────────────────────────────────────────
  const filterBar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs
        tabs={fileTabs}
        activeId={fileFilter}
        onSelect={(tab) => setFileFilter(tab.id)}
      />
      {filteredAttachments.length > 0 ? (
        <label className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filteredAttachments.length > 0 && filteredAttachments.every((a) => selectedIds.has(a.id))}
            onChange={toggleSelectAll}
            className="accent-gold-400"
          />
          {t('selectAll')}
        </label>
      ) : null}
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <>
    <ListPage
      eyebrow={t('eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      badges={
        <>
          <StatusBadge status="INFO" label={t('badgeAttachments')} size="sm" />
          <StatusBadge
            status={targetType === 'purchase' ? 'ACTIVE' : 'PENDING'}
            label={targetType === 'purchase' ? t('purchase') : t('purchaseOrder')}
            size="sm"
          />
        </>
      }
      headerActions={
        <>
          {canWrite ? (
            <button
              type="button"
              onClick={() => setUploadFormOpen(true)}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-[var(--nvi-accent)] px-3 py-2 text-xs font-semibold text-black"
            >
              <Icon name="Upload" size={14} />
              {t('uploadTitle')}
            </button>
          ) : null}
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </>
      }
      banner={
        <>
          {message ? (
            <Banner
              message={message.message}
              severity={message.outcome === 'failure' ? 'error' : 'success'}
              onDismiss={() => setMessage(null)}
            />
          ) : null}
          {bulkBar}
        </>
      }
      kpis={kpis}
      filters={filterBar}
      viewMode={viewMode}
      table={tableView}
      cards={cardsView}
      isEmpty={!filteredAttachments.length}
      emptyIcon={<Icon name="Paperclip" size={40} className="text-gold-500/40" />}
      emptyTitle={t('emptyTitle')}
      emptyDescription={t('emptyDescription')}
      isLoading={isLoading}
      pagination={
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          itemCount={filteredAttachments.length}
          availablePages={Object.keys(pageCursors).map(Number)}
          hasNext={!!nextCursor}
          hasPrev={page > 1}
          isLoading={isLoading}
          onPageChange={(p) => load(targetId, targetType, p)}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setPageCursors({ 1: null });
            setTotal(null);
            load(targetId, targetType, 1, size);
          }}
        />
      }
    />
    {uploadModal}
    </>
  );
}
