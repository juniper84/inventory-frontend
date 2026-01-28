'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import { useToastState } from '@/lib/app-notifications';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { formatEntityLabel, formatVariantLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';

type Branch = { id: string; name: string };
type Variant = { id: string; name: string; product?: { name?: string | null } };
type Batch = { id: string; code: string; expiryDate?: string | null };
type TransferItemInput = { variantId: string; quantity: string; batchId: string };
type Transfer = {
  id: string;
  status: string;
  sourceBranchId: string;
  destinationBranchId: string;
  items: { id: string; variantId: string; quantity: string }[];
};
type SettingsResponse = {
  stockPolicies?: { batchTrackingEnabled?: boolean };
  localeSettings?: { currency?: string };
};

const steps = ['details', 'items', 'review', 'receive'] as const;

export default function TransferWizardPage() {
  const t = useTranslations('transferWizard');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const permissions = getPermissionSet();
  const canWrite = permissions.has('transfers.write');
  const [message, setMessage] = useToastState();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  const [step, setStep] = useState<(typeof steps)[number]>('details');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [batchTrackingEnabled, setBatchTrackingEnabled] = useState(false);
  const [batchOptions, setBatchOptions] = useState<Record<string, Batch[]>>({});
  const [createdTransfer, setCreatedTransfer] = useState<Transfer | null>(null);
  const [receiveLines, setReceiveLines] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    sourceBranchId: '',
    destinationBranchId: '',
    feeAmount: '',
    feeCurrency: '',
    feeCarrier: '',
    feeNote: '',
  });
  const [items, setItems] = useState<TransferItemInput[]>([
    { variantId: '', quantity: '', batchId: '' },
  ]);
  const activeBranch = useActiveBranch();

  const validItems = useMemo(
    () => items.filter((item) => item.variantId && item.quantity),
    [items],
  );

  useEffect(() => {
    if (activeBranch?.id && !form.sourceBranchId) {
      setForm((prev) => ({ ...prev, sourceBranchId: activeBranch.id }));
    }
  }, [activeBranch?.id, form.sourceBranchId]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const token = getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const [branchData, variantData, settings] = await Promise.all([
          apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
            token,
          }),
          apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
            token,
          }),
          apiFetch<SettingsResponse>('/settings', { token }),
        ]);
        setBranches(normalizePaginated(branchData).items);
        setVariants(normalizePaginated(variantData).items);
        setBatchTrackingEnabled(!!settings.stockPolicies?.batchTrackingEnabled);
        if (!form.feeCurrency && settings.localeSettings?.currency) {
          setForm((prev) => ({ ...prev, feeCurrency: settings.localeSettings?.currency ?? '' }));
        }
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
    load();
  }, []);

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

  const updateItem = (index: number, patch: Partial<TransferItemInput>) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { variantId: '', quantity: '', batchId: '' }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const createTransfer = async () => {
    const token = getAccessToken();
    if (!token || !form.sourceBranchId || !form.destinationBranchId || !validItems.length) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      const payloadItems = validItems.map((item) => ({
        variantId: item.variantId,
        quantity: Number(item.quantity),
        batchId: item.batchId || undefined,
      }));
      const result = await apiFetch<Transfer | { approvalRequired?: boolean; approvalId?: string }>(
        '/transfers',
        {
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
        },
      );
      if (result && typeof result === 'object' && 'approvalRequired' in result) {
        setApprovalNotice(t('approvalRequested', { id: result.approvalId ?? '' }));
        setIsCreating(false);
        return;
      }
      const created = result as Transfer;
      setCreatedTransfer(created);
      const quantities: Record<string, string> = {};
      created.items.forEach((item) => {
        quantities[item.id] = String(item.quantity);
      });
      setReceiveLines(quantities);
      setStep('receive');
      setMessage({ action: 'create', outcome: 'success', message: t('created') });
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('createFailed')),
      });
    } finally {
      setIsCreating(false);
    }
  };

  const approveTransfer = async () => {
    const token = getAccessToken();
    if (!token || !createdTransfer) {
      return;
    }
    setMessage(null);
    try {
      const result = await apiFetch<{ approvalRequired?: boolean; approvalId?: string }>(
        `/transfers/${createdTransfer.id}/approve`,
        { token, method: 'POST' },
      );
      if (result && typeof result === 'object' && 'approvalRequired' in result) {
        setApprovalNotice(t('approvalRequested', { id: result.approvalId ?? '' }));
      } else {
        setMessage({ action: 'approve', outcome: 'success', message: t('approved') });
        setCreatedTransfer((prev) => (prev ? { ...prev, status: 'IN_TRANSIT' } : prev));
      }
    } catch (err) {
      setMessage({
        action: 'approve',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('approveFailed')),
      });
    }
  };

  const receiveTransfer = async () => {
    const token = getAccessToken();
    if (!token || !createdTransfer) {
      return;
    }
    setIsReceiving(true);
    setMessage(null);
    try {
      const itemsPayload = createdTransfer.items
        .map((item) => ({
          transferItemId: item.id,
          quantity: Number(receiveLines[item.id] ?? item.quantity),
        }))
        .filter((item) => item.quantity);
      await apiFetch(`/transfers/${createdTransfer.id}/receive`, {
        token,
        method: 'POST',
        body: JSON.stringify({ items: itemsPayload }),
      });
      setMessage({ action: 'save', outcome: 'success', message: t('received') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('receiveFailed')),
      });
    } finally {
      setIsReceiving(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-500">{t('eyebrow')}</p>
          <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
          <p className="text-sm text-gold-300">{t('subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/transfers`}
          className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
        >
          {t('backToTransfers')}
        </Link>
      </div>

      {message ? <StatusBanner message={message} /> : null}
      {approvalNotice ? <StatusBanner message={approvalNotice} /> : null}

      <div className="flex flex-wrap gap-2 text-xs text-gold-300">
        {steps.map((entry) => (
          <span
            key={entry}
            className={`rounded-full border px-3 py-1 ${
              step === entry
                ? 'border-gold-500 text-gold-100'
                : 'border-gold-700/40 text-gold-400'
            }`}
          >
            {t(`${entry}Step`)}
          </span>
        ))}
      </div>

      {step === 'details' ? (
        <div className="command-card p-4 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('detailsTitle')}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <SmartSelect
              value={form.sourceBranchId}
              onChange={(value) => setForm((prev) => ({ ...prev, sourceBranchId: value }))}
              options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              placeholder={t('selectSource')}
              className="nvi-select-container"
            />
            <SmartSelect
              value={form.destinationBranchId}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, destinationBranchId: value }))
              }
              options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              placeholder={t('selectDestination')}
              className="nvi-select-container"
            />
            <input
              value={form.feeAmount}
              onChange={(event) => setForm((prev) => ({ ...prev, feeAmount: event.target.value }))}
              placeholder={t('feeAmount')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
            />
            <input
              value={form.feeCurrency}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, feeCurrency: event.target.value.toUpperCase() }))
              }
              placeholder={t('feeCurrency')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
            />
            <input
              value={form.feeCarrier}
              onChange={(event) => setForm((prev) => ({ ...prev, feeCarrier: event.target.value }))}
              placeholder={t('feeCarrier')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
            />
            <input
              value={form.feeNote}
              onChange={(event) => setForm((prev) => ({ ...prev, feeNote: event.target.value }))}
              placeholder={t('feeNote')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setStep('items')}
            disabled={!form.sourceBranchId || !form.destinationBranchId}
            className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {actions('next')}
          </button>
        </div>
      ) : null}

      {step === 'items' ? (
        <div className="command-card p-4 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('itemsTitle')}</h3>
          {items.map((item, index) => {
            const key = `${form.sourceBranchId}-${item.variantId}`;
            const options = batchOptions[key] ?? [];
            return (
              <div key={`${item.variantId}-${index}`} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
                <SmartSelect
                  value={item.variantId}
                  onChange={(value) => {
                    updateItem(index, { variantId: value, batchId: '' });
                    if (form.sourceBranchId) {
                      loadBatches(form.sourceBranchId, value).catch(() => undefined);
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
                  placeholder={t('selectVariant')}
                  className="nvi-select-container"
                />
                <input
                  value={item.quantity}
                  onChange={(event) => updateItem(index, { quantity: event.target.value })}
                  placeholder={t('quantity')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                />
                {batchTrackingEnabled ? (
                  <SmartSelect
                    value={item.batchId}
                    onChange={(value) => updateItem(index, { batchId: value })}
                    options={options.map((batch) => ({
                      value: batch.id,
                      label: batch.code,
                    }))}
                    placeholder={t('batchOptional')}
                    isClearable
                    className="nvi-select-container"
                  />
                ) : (
                  <div className="text-xs text-gold-400">{t('batchSkipped')}</div>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
                >
                  {actions('remove')}
                </button>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addItem}
              className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
            >
              {actions('add')}
            </button>
            <button
              type="button"
              onClick={() => setStep('review')}
              disabled={!validItems.length}
              className="rounded bg-gold-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-60"
            >
              {actions('next')}
            </button>
            <button
              type="button"
              onClick={() => setStep('details')}
              className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
            >
              {actions('back')}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="command-card p-4 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('reviewTitle')}</h3>
          {validItems.length ? (
            <div className="space-y-2 text-sm text-gold-200">
              {validItems.map((item, idx) => (
                <div key={`${item.variantId}-${idx}`} className="rounded border border-gold-700/40 bg-black/40 p-3">
                  <p className="text-gold-100">
                    {formatEntityLabel(
                      { name: variants.find((v) => v.id === item.variantId)?.name ?? null, id: item.variantId },
                      common('unknown'),
                    )}
                  </p>
                  <p className="text-xs text-gold-300">
                    {t('reviewLine', { qty: item.quantity })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <StatusBanner message={t('noItems')} />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={createTransfer}
              disabled={!canWrite || isCreating || !validItems.length}
              className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isCreating ? <Spinner size="xs" variant="dots" /> : null}
              {isCreating ? t('creating') : t('createTransfer')}
            </button>
            <button
              type="button"
              onClick={() => setStep('items')}
              className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
            >
              {actions('back')}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'receive' ? (
        <div className="command-card p-4 space-y-3 nvi-reveal">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-gold-100">{t('receiveTitle')}</h3>
            {createdTransfer ? (
              <span className="text-xs text-gold-400">
                {t('transferStatus', { status: createdTransfer.status })}
              </span>
            ) : null}
          </div>
          {createdTransfer ? (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={approveTransfer}
                  className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
                >
                  {t('approveTransfer')}
                </button>
                <Link
                  href={`/${locale}/transfers`}
                  className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
                >
                  {t('finishLater')}
                </Link>
              </div>
              <div className="space-y-2">
                {createdTransfer.items.map((item) => (
                  <div key={item.id} className="grid gap-2 md:grid-cols-[2fr_1fr]">
                    <div className="text-sm text-gold-200">
                      {formatEntityLabel(
                        { name: variants.find((v) => v.id === item.variantId)?.name ?? null, id: item.variantId },
                        common('unknown'),
                      )}
                    </div>
                    <input
                      value={receiveLines[item.id] ?? String(item.quantity)}
                      onChange={(event) =>
                        setReceiveLines((prev) => ({ ...prev, [item.id]: event.target.value }))
                      }
                      className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={receiveTransfer}
                disabled={!canWrite || isReceiving}
                className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                title={!canWrite ? noAccess('title') : undefined}
              >
                {isReceiving ? <Spinner size="xs" variant="orbit" /> : null}
                {isReceiving ? t('receiving') : t('receiveTransfer')}
              </button>
            </>
          ) : (
            <StatusBanner message={t('noTransfer')} />
          )}
        </div>
      ) : null}
    </section>
  );
}
