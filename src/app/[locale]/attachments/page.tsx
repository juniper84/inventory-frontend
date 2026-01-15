'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatEntityLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';

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

export default function AttachmentsPage() {
  const t = useTranslations('attachmentsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('attachments.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [message, setMessage] = useToastState();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [targetType, setTargetType] = useState<'purchase' | 'purchaseOrder'>(
    'purchase',
  );
  const [targetId, setTargetId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const formatDocLabel = (doc: Purchase | PurchaseOrder) => {
    const dateLabel = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : null;
    const parts = [doc.supplier?.name ?? null, dateLabel, doc.status].filter(Boolean);
    return parts.length
      ? parts.join(' • ')
      : formatEntityLabel({ id: doc.id }, common('unknown'));
  };

  const load = async (
    selectedId?: string,
    selectedType?: string,
    cursor?: string,
    append = false,
  ) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    const token = getAccessToken();
    if (!token) {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
      return;
    }
    try {
      const [purchaseData, poData] = await Promise.all([
        apiFetch<PaginatedResponse<Purchase> | Purchase[]>('/purchases?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<PurchaseOrder> | PurchaseOrder[]>(
          '/purchase-orders?limit=200',
          { token },
        ),
      ]);
      setPurchases(normalizePaginated(purchaseData).items);
      setPurchaseOrders(normalizePaginated(poData).items);

      const id = selectedId ?? targetId;
      const type = selectedType ?? targetType;
      if (!id) {
        setAttachments([]);
        setNextCursor(null);
        return;
      }
      const params =
        type === 'purchase'
          ? { purchaseId: id }
          : { purchaseOrderId: id };
      const query = buildCursorQuery({ limit: 20, cursor, ...params });
      const attachmentData = await apiFetch<
        PaginatedResponse<Attachment> | Attachment[]
      >(
        `/attachments${query}`,
        { token },
      );
      const attachmentResult = normalizePaginated(attachmentData);
      setAttachments((prev) =>
        append ? [...prev, ...attachmentResult.items] : attachmentResult.items,
      );
      setNextCursor(attachmentResult.nextCursor);
    } catch {
      setMessage({ action: 'load', outcome: 'failure', message: t('loadFailed') });
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    load();
  }, []);

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
      await fetch(presign.url, {
        method: 'PUT',
        headers: file.type ? { 'Content-Type': file.type } : {},
        body: file,
      });
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
      setMessage({ action: 'create', outcome: 'success', message: t('uploaded') });
      await load(targetId, targetType);
    } catch {
      setMessage({ action: 'load', outcome: 'failure', message: t('uploadFailed') });
    } finally {
      setIsUploading(false);
    }
  };

  const remove = async (id: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setMessage(null);
    setRemovingId(id);
    try {
      await apiFetch(`/attachments/${id}/remove`, { token, method: 'POST' });
      setMessage({ action: 'delete', outcome: 'success', message: t('removed') });
      await load();
    } catch {
      setMessage({ action: 'delete', outcome: 'failure', message: t('removeFailed') });
    } finally {
      setRemovingId(null);
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

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('uploadTitle')}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <SmartSelect
            value={targetType}
            onChange={(value) => {
              setTargetType(value as 'purchase' | 'purchaseOrder');
              setTargetId('');
              setNextCursor(null);
            }}
            options={[
              { value: 'purchase', label: t('purchase') },
              { value: 'purchaseOrder', label: t('purchaseOrder') },
            ]}
          />
          <SmartSelect
            value={targetId}
            onChange={(value) => {
              setTargetId(value);
              setNextCursor(null);
              if (value) {
                load(value, targetType).catch(() =>
                  setMessage(t('loadFailed')),
                );
              }
            }}
            placeholder={t('selectDocument')}
            options={(targetType === 'purchase' ? purchases : purchaseOrders).map(
              (item) => ({
                value: item.id,
                label: formatDocLabel(item),
              }),
            )}
            isClearable
            className="md:col-span-2"
          />
        </div>
        <input
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          className="text-sm text-gold-200"
        />
        <button
          type="button"
          onClick={upload}
          className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isUploading || !canWrite}
          title={!canWrite ? noAccess('title') : undefined}
        >
          {isUploading ? <Spinner size="xs" variant="orbit" /> : null}
          {isUploading ? t('uploading') : actions('upload')}
        </button>
      </div>

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-gold-100">{t('listTitle')}</h3>
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </div>
        {viewMode === 'table' ? (
          !attachments.length ? (
            <StatusBanner message={t('empty')} />
          ) : (
            <div className="overflow-auto text-sm text-gold-200">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('filename')}</th>
                    <th className="px-3 py-2">{t('mimeType')}</th>
                    <th className="px-3 py-2">{t('size')}</th>
                    <th className="px-3 py-2">{t('versionLabel')}</th>
                    <th className="px-3 py-2">{t('statusLabel')}</th>
                    <th className="px-3 py-2">{t('createdAt')}</th>
                    <th className="px-3 py-2">{t('actionsLabel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {attachments.map((attachment) => (
                    <tr key={attachment.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2 font-semibold">{attachment.filename}</td>
                      <td className="px-3 py-2">
                        {attachment.mimeType ?? common('unknown')}
                      </td>
                      <td className="px-3 py-2">
                        {attachment.sizeMb ? `${attachment.sizeMb} MB` : common('unknown')}
                      </td>
                      <td className="px-3 py-2">v{attachment.version}</td>
                      <td className="px-3 py-2">{attachment.status}</td>
                      <td className="px-3 py-2">
                        {new Date(attachment.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 text-xs">
                          <a
                            href={attachment.url}
                            className="rounded border border-gold-700/50 px-3 py-1 text-gold-100"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t('open')}
                          </a>
                          <button
                            type="button"
                            onClick={() => remove(attachment.id)}
                            className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                            disabled={removingId === attachment.id || !canWrite}
                            title={!canWrite ? noAccess('title') : undefined}
                          >
                            {removingId === attachment.id ? (
                              <Spinner size="xs" variant="dots" />
                            ) : null}
                            {removingId === attachment.id ? t('removing') : actions('remove')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="space-y-2 text-sm text-gold-200">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="rounded border border-gold-700/40 bg-black/40 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-gold-100">{attachment.filename}</p>
                    <p className="text-xs text-gold-400">
                      {attachment.mimeType ?? common('unknown')} • v{attachment.version}{' '}
                      • {attachment.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <a
                      href={attachment.url}
                      className="rounded border border-gold-700/50 px-3 py-1 text-gold-100"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('open')}
                    </a>
                    <button
                      type="button"
                      onClick={() => remove(attachment.id)}
                      className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={removingId === attachment.id || !canWrite}
                      title={!canWrite ? noAccess('title') : undefined}
                    >
                      {removingId === attachment.id ? (
                        <Spinner size="xs" variant="dots" />
                      ) : null}
                      {removingId === attachment.id ? t('removing') : actions('remove')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!attachments.length ? (
              <StatusBanner message={t('empty')} />
            ) : null}
          </div>
        )}
        {nextCursor ? (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => load(targetId, targetType, nextCursor, true)}
              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-4 py-2 text-sm text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isLoadingMore}
            >
              {isLoadingMore ? <Spinner size="xs" variant="grid" /> : null}
              {isLoadingMore ? actions('loading') : actions('loadMore')}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
