'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch } from '@/lib/api';
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
import { formatEntityLabel, formatVariantLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';

type Branch = { id: string; name: string };
type Variant = { id: string; name: string; product?: { name?: string | null } };
type Batch = { id: string; code: string; expiryDate?: string | null };

type TransferItem = {
  id: string;
  variantId: string;
  quantity: number | string;
  receivedQuantity: number | string;
  batchId?: string | null;
  variant?: Variant | null;
  batch?: Batch | null;
};

type Transfer = {
  id: string;
  status: string;
  sourceBranch?: Branch | null;
  destinationBranch?: Branch | null;
  items: TransferItem[];
  feeAmount?: number | string | null;
  feeCurrency?: string | null;
  feeCarrier?: string | null;
  feeNote?: string | null;
  createdAt: string;
};

type SettingsResponse = {
  stockPolicies?: {
    batchTrackingEnabled?: boolean;
    transferBatchPolicy?: 'PRESERVE' | 'RECREATE';
  };
  localeSettings?: {
    currency?: string;
  };
};

export default function TransfersPage() {
  const t = useTranslations('transfersPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const permissions = getPermissionSet();
  const canWrite = permissions.has('transfers.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [actionBusy, setActionBusy] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [message, setMessage] = useToastState();
  const [batchTrackingEnabled, setBatchTrackingEnabled] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const [total, setTotal] = useState<number | null>(null);
  const [items, setItems] = useState<
    { variantId: string; quantity: string; batchId: string }[]
  >([{ variantId: '', quantity: '', batchId: '' }]);
  const [form, setForm] = useState({
    sourceBranchId: '',
    destinationBranchId: '',
    feeAmount: '',
    feeCurrency: '',
    feeCarrier: '',
    feeNote: '',
  });
  const [batchOptions, setBatchOptions] = useState<Record<string, Batch[]>>({});
  const [receiveQuantities, setReceiveQuantities] = useState<
    Record<string, Record<string, string>>
  >({});
  const activeBranch = useActiveBranch();

  const load = async (targetPage = 1, nextPageSize?: number) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor =
        targetPage === 1 ? null : pageCursors[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const [branchData, variantData, transferData, settings] =
        await Promise.all([
          apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
            token,
          }),
          apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
            token,
          }),
          apiFetch<PaginatedResponse<Transfer> | Transfer[]>(
            `/transfers${query}`,
            { token },
          ),
          apiFetch<SettingsResponse>('/settings', { token }),
        ]);
      setBranches(normalizePaginated(branchData).items);
      setVariants(normalizePaginated(variantData).items);
      const transferResult = normalizePaginated(transferData);
      setTransfers(transferResult.items);
      setNextCursor(transferResult.nextCursor);
      if (typeof transferResult.total === 'number') {
        setTotal(transferResult.total);
      }
    setPage(targetPage);
    setPageCursors((prev) => {
      const nextState: Record<number, string | null> =
        targetPage === 1 ? { 1: null } : { ...prev };
      if (transferResult.nextCursor) {
        nextState[targetPage + 1] = transferResult.nextCursor;
      }
      return nextState;
    });
      setBatchTrackingEnabled(!!settings.stockPolicies?.batchTrackingEnabled);
      if (!form.feeCurrency && settings.localeSettings?.currency) {
        setForm((prev) => ({ ...prev, feeCurrency: settings.localeSettings?.currency ?? '' }));
      }
    } catch {
      setMessage({ action: 'load', outcome: 'failure', message: t('loadFailed') });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, []);

  useEffect(() => {
    if (activeBranch?.id && !form.sourceBranchId) {
      setForm((prev) => ({ ...prev, sourceBranchId: activeBranch.id }));
    }
  }, [activeBranch?.id, form.sourceBranchId]);

  const loadBatches = async (branchId: string, variantId: string) => {
    const token = getAccessToken();
    if (!token || !branchId || !variantId) {
      return;
    }
    const key = `${branchId}-${variantId}`;
    const data = await apiFetch<Batch[]>(
      `/stock/batches?branchId=${branchId}&variantId=${variantId}`,
      { token },
    );
    setBatchOptions((prev) => ({ ...prev, [key]: data }));
  };

  const updateItem = (
    index: number,
    data: Partial<{ variantId: string; quantity: string; batchId: string }>,
  ) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...data };
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { variantId: '', quantity: '', batchId: '' }]);
  };

  const submitTransfer = async () => {
    const token = getAccessToken();
    if (!token || !form.sourceBranchId || !form.destinationBranchId) {
      return;
    }
    const payloadItems = items
      .filter((item) => item.variantId && item.quantity)
      .map((item) => ({
        variantId: item.variantId,
        quantity: Number(item.quantity),
        batchId: item.batchId || undefined,
      }));
    if (payloadItems.length === 0) {
      setMessage({ action: 'save', outcome: 'warning', message: t('itemRequired') });
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      await apiFetch('/transfers', {
        token,
        method: 'POST',
        body: JSON.stringify({
          sourceBranchId: form.sourceBranchId,
          destinationBranchId: form.destinationBranchId,
          items: payloadItems,
          feeAmount: form.feeAmount ? Number(form.feeAmount) : undefined,
          feeCurrency: form.feeCurrency || undefined,
          feeCarrier: form.feeCarrier || undefined,
          feeNote: form.feeNote || undefined,
        }),
      });
      setForm({
        sourceBranchId: '',
        destinationBranchId: '',
        feeAmount: '',
        feeCurrency: form.feeCurrency,
        feeCarrier: '',
        feeNote: '',
      });
      setItems([{ variantId: '', quantity: '', batchId: '' }]);
      await load(1);
      setMessage({ action: 'create', outcome: 'success', message: t('created') });
    } catch (err) {
      setMessage({ action: 'create', outcome: 'failure', message: t('createFailed') });
    } finally {
      setIsCreating(false);
    }
  };

  const approveTransfer = async (transferId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setActionBusy((prev) => ({ ...prev, [transferId]: 'approve' }));
    try {
      const result = await apiFetch<{ approvalRequired?: boolean }>(
        `/transfers/${transferId}/approve`,
        { token, method: 'POST' },
      );
      if (result?.approvalRequired) {
        setMessage({ action: 'approve', outcome: 'warning', message: t('approveNeedsApproval') });
      } else {
        setMessage({ action: 'approve', outcome: 'success', message: t('approved') });
      }
      await load(page);
    } finally {
      setActionBusy((prev) => {
        const next = { ...prev };
        delete next[transferId];
        return next;
      });
    }
  };

  const cancelTransfer = async (transferId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setActionBusy((prev) => ({ ...prev, [transferId]: 'cancel' }));
    try {
      await apiFetch(`/transfers/${transferId}/cancel`, {
        token,
        method: 'POST',
      });
      await load(page);
      setMessage({ action: 'update', outcome: 'success', message: t('cancelled') });
    } finally {
      setActionBusy((prev) => {
        const next = { ...prev };
        delete next[transferId];
        return next;
      });
    }
  };

  const receiveTransfer = async (transferId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setActionBusy((prev) => ({ ...prev, [transferId]: 'receive' }));
    const quantities = receiveQuantities[transferId];
    const itemsPayload = quantities
      ? Object.entries(quantities)
          .filter(([_, qty]) => qty)
          .map(([transferItemId, qty]) => ({
            transferItemId,
            quantity: Number(qty),
          }))
      : [];
    try {
      await apiFetch(`/transfers/${transferId}/receive`, {
        token,
        method: 'POST',
        body: itemsPayload.length ? JSON.stringify({ items: itemsPayload }) : '{}',
      });
      await load(page);
      setMessage({ action: 'update', outcome: 'success', message: t('received') });
    } finally {
      setActionBusy((prev) => {
        const next = { ...prev };
        delete next[transferId];
        return next;
      });
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
          <p className="text-sm text-gold-300">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/${locale}/transfers/wizard`}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
          >
            {t('openWizard')}
          </Link>
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </div>
      </div>
      {message ? <StatusBanner message={message} /> : null}

      <div className="command-card p-4 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('newTransfer')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            value={form.sourceBranchId}
            onChange={(value) =>
              setForm({ ...form, sourceBranchId: value })
            }
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            placeholder={t('sourceBranch')}
            isClearable
            className="nvi-select-container"
          />
          <SmartSelect
            value={form.destinationBranchId}
            onChange={(value) =>
              setForm({ ...form, destinationBranchId: value })
            }
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            placeholder={t('destinationBranch')}
            isClearable
            className="nvi-select-container"
          />
        </div>

        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={`item-${index}`}
              className="grid gap-3 md:grid-cols-3"
            >
              <SmartSelect
                value={item.variantId}
                onChange={(value) => {
                  updateItem(index, { variantId: value, batchId: '' });
                  if (form.sourceBranchId && value && batchTrackingEnabled) {
                    loadBatches(form.sourceBranchId, value).catch(() => null);
                  }
                }}
                options={variants.map((variant) => ({
                  value: variant.id,
                  label: formatVariantLabel({
                    id: variant.id,
                    name: variant.name,
                    productName: variant.product?.name ?? null,
                  }),
                }))}
                placeholder={t('variant')}
                isClearable
                className="nvi-select-container"
              />
              <input
                value={item.quantity}
                onChange={(event) =>
                  updateItem(index, { quantity: event.target.value })
                }
                placeholder={t('quantity')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <SmartSelect
                value={item.batchId ?? ''}
                onChange={(value) => updateItem(index, { batchId: value })}
                options={(
                  batchOptions[`${form.sourceBranchId}-${item.variantId}`] || []
                ).map((batch) => ({
                  value: batch.id,
                  label: batch.code,
                }))}
                placeholder={
                  batchTrackingEnabled
                    ? t('batchOptional')
                    : t('batchDisabled')
                }
                isClearable
                isDisabled={!batchTrackingEnabled}
                className="nvi-select-container"
              />
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.feeAmount}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, feeAmount: event.target.value }))
            }
            placeholder={t('transferFeeAmount')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.feeCurrency}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                feeCurrency: event.target.value.toUpperCase(),
              }))
            }
            placeholder={t('transferFeeCurrency')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.feeCarrier}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, feeCarrier: event.target.value }))
            }
            placeholder={t('transferFeeCarrier')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.feeNote}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, feeNote: event.target.value }))
            }
            placeholder={t('transferFeeNote')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={addItem}
            className="rounded border border-gold-700/50 px-3 py-2 text-sm text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {t('addItem')}
          </button>
          <button
            onClick={submitTransfer}
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite || isCreating}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isCreating ? <Spinner size="xs" variant="orbit" /> : null}
            {isCreating ? t('creating') : t('createTransfer')}
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="command-card p-4 nvi-reveal">
          {transfers.length === 0 ? (
            <StatusBanner message={t('noTransfers')} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('sourceBranch')}</th>
                    <th className="px-3 py-2">{t('destinationBranch')}</th>
                    <th className="px-3 py-2">{t('statusLabel')}</th>
                    <th className="px-3 py-2">{t('createdAt')}</th>
                    <th className="px-3 py-2">{t('items')}</th>
                    <th className="px-3 py-2">{t('transferFeeAmount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((transfer) => (
                    <tr key={transfer.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2">
                        {transfer.sourceBranch?.name || common('unknown')}
                      </td>
                      <td className="px-3 py-2">
                        {transfer.destinationBranch?.name || common('unknown')}
                      </td>
                      <td className="px-3 py-2">{transfer.status}</td>
                      <td className="px-3 py-2">
                        {new Date(transfer.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">{transfer.items.length}</td>
                      <td className="px-3 py-2">
                        {transfer.feeAmount
                          ? `${transfer.feeAmount} ${transfer.feeCurrency ?? ''}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
      <div className="space-y-4">
        {transfers.length === 0 ? (
          <StatusBanner message={t('noTransfers')} />
        ) : (
          transfers.map((transfer) => (
          <div
            key={transfer.id}
            className="command-card p-4 space-y-3 nvi-reveal"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm text-gold-100">
                  {transfer.sourceBranch?.name || common('unknown')} →{' '}
                  {transfer.destinationBranch?.name || common('unknown')}
                </p>
                <p className="text-xs text-gold-400">
                  {transfer.status} ·{' '}
                  {new Date(transfer.createdAt).toLocaleString()}
                </p>
                {transfer.feeAmount ? (
                  <p className="text-xs text-gold-300">
                    {t('transferFeeSummary', {
                      amount: transfer.feeAmount,
                      currency: transfer.feeCurrency ?? '',
                    })}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => approveTransfer(transfer.id)}
                  className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={!canWrite || actionBusy[transfer.id] === 'approve'}
                  title={!canWrite ? noAccess('title') : undefined}
                >
                  {actionBusy[transfer.id] === 'approve' ? (
                    <Spinner size="xs" variant="pulse" />
                  ) : null}
                  {actionBusy[transfer.id] === 'approve'
                    ? t('approving')
                    : actions('approve')}
                </button>
                <button
                  onClick={() => receiveTransfer(transfer.id)}
                  className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={!canWrite || actionBusy[transfer.id] === 'receive'}
                  title={!canWrite ? noAccess('title') : undefined}
                >
                  {actionBusy[transfer.id] === 'receive' ? (
                    <Spinner size="xs" variant="grid" />
                  ) : null}
                  {actionBusy[transfer.id] === 'receive'
                    ? t('receiving')
                    : t('receive')}
                </button>
                <button
                  onClick={() => cancelTransfer(transfer.id)}
                  className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={!canWrite || actionBusy[transfer.id] === 'cancel'}
                  title={!canWrite ? noAccess('title') : undefined}
                >
                  {actionBusy[transfer.id] === 'cancel' ? (
                    <Spinner size="xs" variant="dots" />
                  ) : null}
                  {actionBusy[transfer.id] === 'cancel'
                    ? t('canceling')
                    : actions('cancel')}
                </button>
              </div>
            </div>
            <div className="space-y-2 text-xs text-gold-200">
              {transfer.items.map((item) => {
                const remaining =
                  Number(item.quantity) - Number(item.receivedQuantity || 0);
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-gold-700/30 pt-2"
                  >
                    <div>
                      <p>
                        {formatVariantLabel(
                          {
                            id: item.variantId ?? null,
                            name: item.variant?.name ?? null,
                            productName: item.variant?.product?.name ?? null,
                          },
                          common('unknown'),
                        )}
                      </p>
                      <p className="text-gold-400">
                        {t('itemSummary', {
                          qty: item.quantity,
                          received: item.receivedQuantity,
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={
                          receiveQuantities[transfer.id]?.[item.id] || ''
                        }
                        onChange={(event) =>
                          setReceiveQuantities((prev) => ({
                            ...prev,
                            [transfer.id]: {
                              ...prev[transfer.id],
                              [item.id]: event.target.value,
                            },
                          }))
                        }
                        placeholder={t('remaining', { value: remaining })}
                        className="rounded border border-gold-700/50 bg-black px-2 py-1 text-xs text-gold-100"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          ))
        )}
      </div>
      )}
      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        itemCount={transfers.length}
        availablePages={Object.keys(pageCursors).map((value) => Number(value))}
        hasNext={Boolean(nextCursor)}
        hasPrev={page > 1}
        isLoading={isLoading}
        onPageChange={(targetPage) => load(targetPage)}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setTotal(null);
          setPage(1);
          setPageCursors({ 1: null });
          load(1, nextPageSize);
        }}
      />
    </section>
  );
}
