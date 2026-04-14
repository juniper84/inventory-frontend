'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { useToastState, messageText } from '@/lib/app-notifications';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { formatEntityLabel, formatVariantLabel } from '@/lib/display';
import { useVariantSearch } from '@/lib/use-variant-search';
import { getPermissionSet } from '@/lib/permissions';
import { PageHeader, Card, Icon, TextInput, WizardSteps, EmptyState, ProgressBar } from '@/components/ui';
import { Banner } from '@/components/notifications/Banner';

type Branch = { id: string; name: string };
type Variant = { id: string; name: string; product?: { name?: string | null } };
type Batch = { id: string; code: string; expiryDate?: string | null };
type TransferItemInput = { id: string; variantId: string; quantity: string; batchId: string };
type Transfer = {
  id: string;
  status: string;
  sourceBranchId: string;
  destinationBranchId: string;
  items: { id: string; variantId: string; quantity: string }[];
  feeAmount?: number | string | null;
  feeCurrency?: string | null;
  feeCarrier?: string | null;
  feeNote?: string | null;
  sourceBranch?: { id: string; name: string } | null;
  destinationBranch?: { id: string; name: string } | null;
  createdAt?: string;
};
type SettingsResponse = {
  stockPolicies?: { batchTrackingEnabled?: boolean };
  localeSettings?: { currency?: string };
};

const stepKeys = ['details', 'items', 'review', 'receive'] as const;

export default function TransferWizardPage() {
  const t = useTranslations('transferWizard');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('transfers.write');
  const [message, setMessage] = useToastState();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  const [step, setStep] = useState<(typeof stepKeys)[number]>('details');
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
    { id: crypto.randomUUID(), variantId: '', quantity: '', batchId: '' },
  ]);
  const [recentTransfers, setRecentTransfers] = useState<Transfer[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [showRecentPicker, setShowRecentPicker] = useState(false);
  const { loadOptions: loadVariantOptions, seedCache: seedVariantCache, getVariantOption } = useVariantSearch();
  const { activeBranch, resolveBranchId } = useBranchScope();
  const effectiveSourceBranchId = resolveBranchId(form.sourceBranchId) || '';

  const stepIndex = stepKeys.indexOf(step);
  const stepLabels = useMemo(
    () => stepKeys.map((key) => t(`${key}Step`)),
    [t],
  );

  const sourceBranchName = useMemo(
    () => branches.find((b) => b.id === effectiveSourceBranchId)?.name ?? '',
    [branches, effectiveSourceBranchId],
  );
  const destBranchName = useMemo(
    () => branches.find((b) => b.id === form.destinationBranchId)?.name ?? '',
    [branches, form.destinationBranchId],
  );

  const fetchRecentTransfers = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setIsLoadingRecent(true);
    try {
      const data = await apiFetch<PaginatedResponse<Transfer> | Transfer[]>(
        '/transfers?limit=10',
        { token },
      );
      setRecentTransfers(normalizePaginated(data).items);
      setShowRecentPicker(true);
    } catch {
      setMessage({ action: 'load', outcome: 'failure', message: t('loadFailed') });
    } finally {
      setIsLoadingRecent(false);
    }
  }, [setMessage, t]);

  const copyFromTransfer = useCallback((transfer: Transfer) => {
    // Seed variant cache from the local variants list for any IDs in the transfer
    const transferVariantIds = new Set(transfer.items.map((i) => i.variantId).filter(Boolean));
    const seeds = variants.filter((v) => transferVariantIds.has(v.id));
    if (seeds.length) seedVariantCache(seeds);

    setForm({
      sourceBranchId: transfer.sourceBranchId ?? '',
      destinationBranchId: transfer.destinationBranchId ?? '',
      feeAmount: transfer.feeAmount ? String(transfer.feeAmount) : '',
      feeCurrency: transfer.feeCurrency ?? '',
      feeCarrier: transfer.feeCarrier ?? '',
      feeNote: transfer.feeNote ?? '',
    });
    setItems(
      transfer.items.length
        ? transfer.items.map((item) => ({
            id: crypto.randomUUID(),
            variantId: item.variantId,
            quantity: String(item.quantity),
            batchId: '',
          }))
        : [{ id: crypto.randomUUID(), variantId: '', quantity: '', batchId: '' }],
    );
    setShowRecentPicker(false);
    setMessage({ action: 'load', outcome: 'success', message: t('copiedFromTransfer') });
  }, [setMessage, t, variants, seedVariantCache]);

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
        const variantList = normalizePaginated(variantData).items;
        setVariants(variantList);
        seedVariantCache(variantList);
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
    const data = await apiFetch<Batch[] | PaginatedResponse<Batch>>(
      `/stock/batches?branchId=${branchId}&variantId=${variantId}`,
      { token },
    );
    setBatchOptions((prev) => ({ ...prev, [key]: normalizePaginated(data).items }));
  };

  const updateItem = (index: number, patch: Partial<TransferItemInput>) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { id: crypto.randomUUID(), variantId: '', quantity: '', batchId: '' }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const createTransfer = async () => {
    const token = getAccessToken();
    if (!token || !effectiveSourceBranchId || !form.destinationBranchId || !validItems.length) {
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
            sourceBranchId: effectiveSourceBranchId,
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
    return (
      <section className="nvi-page">
        <div className="flex items-center justify-center py-20">
          <Spinner size="md" variant="orbit" />
        </div>
      </section>
    );
  }

  return (
    <section className="nvi-page">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Link
            href={`/${locale}/transfers`}
            className="nvi-press inline-flex items-center gap-2 rounded-xl border border-nvi-border px-3 py-2 text-xs text-nvi-text-primary"
          >
            <Icon name="ChevronLeft" size={14} className="text-nvi-text-secondary" />
            {t('backToTransfers')}
          </Link>
        }
      />

      {message ? (
        <Banner
          message={messageText(message)}
          severity="info"
          onDismiss={() => setMessage(null)}
        />
      ) : null}
      {approvalNotice ? (
        <Banner message={approvalNotice} severity="warning" onDismiss={() => setApprovalNotice(null)} />
      ) : null}

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <Card padding="md" glow={false} as="article">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20">
              <Icon name="Package" size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-nvi-text-tertiary">{t('kpiDraftItems')}</p>
              <p className="text-2xl font-semibold text-nvi-text-primary">{items.length}</p>
            </div>
          </div>
        </Card>
        <Card padding="md" glow={false} as="article">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <Icon name="Check" size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-nvi-text-tertiary">{t('kpiValidItems')}</p>
              <p className="text-2xl font-semibold text-nvi-text-primary">{validItems.length}</p>
            </div>
          </div>
        </Card>
        <Card padding="md" glow={false} as="article">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
              <Icon name="DollarSign" size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-nvi-text-tertiary">{t('kpiCurrentStep')}</p>
              <p className="text-lg font-semibold text-nvi-text-primary">{t(`${step}Step`)}</p>
            </div>
          </div>
        </Card>
        <Card padding="md" glow={false} as="article">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 ring-1 ring-purple-500/20">
              <Icon name="ClipboardCheck" size={20} className="text-purple-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-nvi-text-tertiary">{t('kpiTransferCreated')}</p>
              <p className="text-lg font-semibold text-nvi-text-primary">
                {createdTransfer ? t('transferCreatedYes') : t('transferCreatedNo')}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Wizard step indicator */}
      <Card padding="md" glow={false}>
        <div className="space-y-3">
          <ProgressBar
            value={stepIndex + 1}
            max={stepKeys.length}
            height={6}
            color="accent"
            showValue
            formatValue={(v, m) => `${v} / ${m}`}
          />
          <WizardSteps steps={stepLabels} current={stepIndex} />
        </div>
      </Card>

      {/* Step 1: Details */}
      {step === 'details' ? (
        <Card padding="lg" className="space-y-4 nvi-slide-in-bottom">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-nvi-text-primary">{t('detailsTitle')}</h3>
            <button
              type="button"
              onClick={fetchRecentTransfers}
              disabled={isLoadingRecent}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-nvi-border px-3 py-1.5 text-xs text-nvi-text-primary disabled:opacity-60"
            >
              {isLoadingRecent ? <Spinner size="xs" variant="dots" /> : <Icon name="Copy" size={14} className="text-nvi-text-secondary" />}
              {isLoadingRecent ? t('loadingRecent') : t('copyFromPrevious')}
            </button>
          </div>

          {showRecentPicker ? (
            <Card padding="md" glow={false} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-nvi-text-tertiary">{t('recentTransfers')}</p>
              {recentTransfers.length === 0 ? (
                <EmptyState
                  icon={<Icon name="Truck" size={28} className="text-nvi-text-tertiary" />}
                  title={t('noRecentTransfers')}
                />
              ) : (
                <div className="space-y-1.5 nvi-stagger">
                  {recentTransfers.map((tr) => (
                    <button
                      key={tr.id}
                      type="button"
                      onClick={() => copyFromTransfer(tr)}
                      className="nvi-press nvi-card-hover flex w-full items-center gap-3 rounded-xl border border-nvi-border bg-nvi-surface p-3 text-left text-xs"
                    >
                      <Icon name="Building2" size={14} className="shrink-0 text-nvi-text-secondary" />
                      <span className="font-medium text-nvi-text-primary">
                        {tr.sourceBranch?.name || tr.sourceBranchId?.slice(0, 8)}
                      </span>
                      <Icon name="ArrowRight" size={12} className="shrink-0 text-nvi-text-tertiary" />
                      <span className="font-medium text-nvi-text-primary">
                        {tr.destinationBranch?.name || tr.destinationBranchId?.slice(0, 8)}
                      </span>
                      <span className="ml-auto text-nvi-text-tertiary">
                        {tr.items.length} {tr.items.length === 1 ? 'item' : 'items'}
                        {tr.feeAmount ? ` · Fee ${tr.feeAmount}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowRecentPicker(false)}
                className="nvi-press inline-flex items-center gap-1 text-xs text-nvi-text-secondary hover:text-nvi-text-primary"
              >
                <Icon name="X" size={12} />
                {common('close')}
              </button>
            </Card>
          ) : null}

          {/* Branch selectors with direction arrow */}
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 rounded-xl bg-blue-500/[0.04] p-3 ring-1 ring-blue-500/10">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/10">
                  <Icon name="Building2" size={13} className="text-blue-400" />
                </div>
                {t('selectSource')}
              </label>
              <SmartSelect
                instanceId="wizard-source-branch"
                value={form.sourceBranchId}
                onChange={(value) => setForm((prev) => ({ ...prev, sourceBranchId: value }))}
                options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                placeholder={t('selectSource')}
                className="nvi-select-container"
              />
            </div>
            <div className="hidden md:flex h-10 items-center justify-center px-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <Icon name="ArrowRight" size={16} className="text-emerald-400" />
              </div>
            </div>
            <div className="flex-1 rounded-xl bg-blue-500/[0.04] p-3 ring-1 ring-blue-500/10">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/10">
                  <Icon name="Building2" size={13} className="text-blue-400" />
                </div>
                {t('selectDestination')}
              </label>
              <SmartSelect
                instanceId="wizard-destination-branch"
                value={form.destinationBranchId}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, destinationBranchId: value }))
                }
                options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                placeholder={t('selectDestination')}
                className="nvi-select-container"
              />
            </div>
          </div>

          {/* Fee fields */}
          <div className="grid gap-3 md:grid-cols-2 rounded-xl border-l-2 border-l-amber-400 pl-4">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10">
                  <Icon name="DollarSign" size={13} className="text-amber-400" />
                </div>
                {t('feeAmount')}
              </label>
              <div className="flex items-center gap-2">
                <CurrencyInput
                  value={form.feeAmount}
                  onChange={(value) => setForm((prev) => ({ ...prev, feeAmount: value }))}
                  placeholder={t('feeAmount')}
                  className="flex-1 rounded-xl border border-nvi-border bg-black px-3 py-2 text-sm text-nvi-text-primary"
                />
                <span className="shrink-0 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">{form.feeCurrency || 'TZS'}</span>
              </div>
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10">
                  <Icon name="Truck" size={13} className="text-amber-400" />
                </div>
                {t('feeCarrier')}
              </label>
              <TextInput
                value={form.feeCarrier}
                onChange={(event) => setForm((prev) => ({ ...prev, feeCarrier: event.target.value }))}
                placeholder={t('feeCarrier')}
              />
            </div>
            <div className="md:col-span-2">
              <TextInput
                label={t('feeNote')}
                value={form.feeNote}
                onChange={(event) => setForm((prev) => ({ ...prev, feeNote: event.target.value }))}
                placeholder={t('feeNote')}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStep('items')}
            disabled={!effectiveSourceBranchId || !form.destinationBranchId}
            className="nvi-press inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500 disabled:opacity-60"
          >
            {actions('next')}
            <Icon name="ChevronRight" size={16} />
          </button>
        </Card>
      ) : null}

      {/* Step 2: Items */}
      {step === 'items' ? (
        <Card padding="lg" className="space-y-4 nvi-slide-in-bottom">
          <h3 className="text-lg font-semibold text-nvi-text-primary">{t('itemsTitle')}</h3>
          <div className="flex items-start gap-2 rounded-xl bg-blue-500/[0.04] border border-blue-500/15 px-3 py-2 text-[11px] text-blue-300/80">
            <Icon name="Info" size={14} className="mt-0.5 shrink-0 text-blue-400" />
            <div>
              <p className="font-medium text-blue-300">{t('unitHintTitle')}</p>
              <p className="mt-0.5">{t('unitHintTransfer')}</p>
            </div>
          </div>
          <div className="space-y-3 nvi-stagger">
            {items.map((item, index) => {
              const key = `${effectiveSourceBranchId}-${item.variantId}`;
              const options = batchOptions[key] ?? [];
              return (
                <div key={item.id} className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06] space-y-3 transition-colors hover:bg-white/[0.05]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 mt-0.5">
                      <Icon name="Package" size={16} className="text-blue-400" />
                    </div>
                    <div className="flex-1 grid gap-3 md:grid-cols-[2fr_1fr]">
                      <AsyncSmartSelect
                        instanceId={`wizard-item-${item.id}-variant`}
                        value={getVariantOption(item.variantId)}
                        loadOptions={loadVariantOptions}
                        defaultOptions={variants.map((v) => ({
                          value: v.id,
                          label: formatVariantLabel({
                            id: v.id,
                            name: v.name,
                            productName: v.product?.name ?? null,
                          }),
                        }))}
                        onChange={(opt) => {
                          const value = opt?.value ?? '';
                          updateItem(index, { variantId: value, batchId: '' });
                          if (effectiveSourceBranchId) {
                            loadBatches(effectiveSourceBranchId, value).catch(() => undefined);
                          }
                        }}
                        placeholder={t('selectVariant')}
                        isClearable
                        className="nvi-select-container"
                      />
                      <TextInput
                        label={t('quantity')}
                        type="number"
                        value={item.quantity}
                        onChange={(event) => updateItem(index, { quantity: event.target.value })}
                        placeholder={t('quantity')}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="nvi-press flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20 mt-0.5 transition-colors"
                      title={actions('remove')}
                    >
                      <Icon name="Trash2" size={14} />
                    </button>
                  </div>
                  {batchTrackingEnabled ? (
                    <div className="ml-11">
                      <SmartSelect
                        instanceId={`wizard-item-${item.id}-batch`}
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
                    </div>
                  ) : (
                    <p className="ml-11 text-xs text-nvi-text-tertiary">{t('batchSkipped')}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addItem}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
            >
              <Icon name="Plus" size={14} className="text-emerald-400" />
              {actions('add')}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-nvi-border pt-4">
            <button
              type="button"
              onClick={() => setStep('details')}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-nvi-border px-4 py-2 text-xs text-nvi-text-secondary hover:text-nvi-text-primary transition-colors"
            >
              <Icon name="ChevronLeft" size={14} />
              {actions('back')}
            </button>
            <button
              type="button"
              onClick={() => setStep('review')}
              disabled={!validItems.length}
              className="nvi-press inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500 disabled:opacity-60"
            >
              {actions('next')}
              <Icon name="ChevronRight" size={16} />
            </button>
          </div>
        </Card>
      ) : null}

      {/* Step 3: Review (transfer manifest) */}
      {step === 'review' ? (
        <Card padding="lg" className="space-y-4 nvi-slide-in-bottom">
          <h3 className="text-lg font-semibold text-nvi-text-primary">{t('reviewTitle')}</h3>

          {validItems.length ? (
            <>
              {/* Route visual */}
              <div className="rounded-xl bg-blue-500/[0.03] p-4 ring-1 ring-blue-500/10">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20">
                      <Icon name="Building2" size={18} className="text-blue-400" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-blue-400/70">{t('selectSource')}</p>
                      <p className="text-sm font-semibold text-nvi-text-primary">{sourceBranchName || '---'}</p>
                    </div>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
                    <Icon name="ArrowRight" size={16} className="text-emerald-400" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                      <Icon name="Building2" size={18} className="text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-emerald-400/70">{t('selectDestination')}</p>
                      <p className="text-sm font-semibold text-nvi-text-primary">{destBranchName || '---'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items list */}
              <div className="space-y-2 nvi-stagger">
                {validItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
                      <Icon name="Package" size={14} className="text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-nvi-text-primary">
                        {formatEntityLabel(
                          { name: variants.find((v) => v.id === item.variantId)?.name ?? null, id: item.variantId },
                          common('unknown'),
                        )}
                      </p>
                    </div>
                    <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                      {t('reviewLine', { qty: item.quantity })}
                    </span>
                  </div>
                ))}
              </div>

              {/* Totals - hero */}
              <div className="rounded-xl bg-gradient-to-br from-emerald-500/[0.06] to-blue-500/[0.04] p-5 ring-1 ring-emerald-500/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-nvi-text-secondary">{t('totalQuantity') || 'Total quantity'}</span>
                  <span className="text-2xl font-bold text-emerald-400">
                    {validItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)}
                  </span>
                </div>
                {form.feeAmount ? (
                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-nvi-text-secondary">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10">
                        <Icon name="DollarSign" size={13} className="text-amber-400" />
                      </div>
                      {t('feeAmount') || 'Transfer fee'}
                    </span>
                    <span className="text-xl font-bold text-amber-400">
                      {Number(form.feeAmount).toLocaleString()} {form.feeCurrency || 'TZS'}
                    </span>
                  </div>
                ) : null}
                {form.feeCarrier ? (
                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                    <span className="flex items-center gap-1.5 text-sm text-nvi-text-secondary">
                      <Icon name="Truck" size={14} className="text-nvi-text-tertiary" />
                      {t('feeCarrier')}
                    </span>
                    <span className="text-sm font-medium text-nvi-text-primary">{form.feeCarrier}</span>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Icon name="Package" size={32} className="text-nvi-text-tertiary" />}
              title={t('noItems')}
              description={t('noItems')}
            />
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-nvi-border pt-4">
            <button
              type="button"
              onClick={() => setStep('items')}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-nvi-border px-4 py-2 text-xs text-nvi-text-secondary hover:text-nvi-text-primary transition-colors"
            >
              <Icon name="ChevronLeft" size={14} />
              {actions('back')}
            </button>
            <button
              type="button"
              onClick={createTransfer}
              disabled={!canWrite || isCreating || !validItems.length}
              className="nvi-press inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-500 disabled:opacity-60"
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isCreating ? <Spinner size="xs" variant="dots" /> : <Icon name="Send" size={16} />}
              {isCreating ? t('creating') : t('createTransfer')}
            </button>
          </div>
        </Card>
      ) : null}

      {/* Step 4: Receive */}
      {step === 'receive' ? (
        <Card padding="lg" className="space-y-4 nvi-slide-in-bottom">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-nvi-text-primary">
              <Icon name="ClipboardCheck" size={20} className="text-nvi-accent" />
              {t('receiveTitle')}
            </h3>
            {createdTransfer ? (
              <span className="rounded-lg bg-nvi-surface-alt px-2.5 py-1 text-xs font-medium text-nvi-text-secondary">
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
                  className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-nvi-border px-3 py-2 text-xs text-nvi-text-primary hover:border-emerald-500/40"
                >
                  <Icon name="Check" size={14} className="text-emerald-400" />
                  {t('approveTransfer')}
                </button>
                <Link
                  href={`/${locale}/transfers`}
                  className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-nvi-border px-3 py-2 text-xs text-nvi-text-primary"
                >
                  <Icon name="X" size={14} className="text-nvi-text-secondary" />
                  {t('finishLater')}
                </Link>
              </div>

              <div className="space-y-3 nvi-stagger">
                {createdTransfer.items.map((item) => {
                  const expectedQty = Number(item.quantity) || 0;
                  const receivedQty = Number(receiveLines[item.id] ?? item.quantity) || 0;
                  const pct = expectedQty > 0 ? Math.round((receivedQty / expectedQty) * 100) : 0;
                  const barColor = pct > 80 ? 'green' as const : pct >= 50 ? 'amber' as const : 'red' as const;
                  const barTextColor = pct > 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400';
                  const barBgTint = pct > 80 ? 'bg-emerald-500/[0.04] ring-emerald-500/10' : pct >= 50 ? 'bg-amber-500/[0.04] ring-amber-500/10' : 'bg-red-500/[0.04] ring-red-500/10';
                  return (
                    <div key={item.id} className={`rounded-xl ${barBgTint} ring-1 p-4 space-y-3 transition-colors`}>
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20">
                          <Icon name="Package" size={16} className="text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-nvi-text-primary">
                            {formatEntityLabel(
                              { name: variants.find((v) => v.id === item.variantId)?.name ?? null, id: item.variantId },
                              common('unknown'),
                            )}
                          </p>
                          <div className="mt-1.5 flex items-center gap-3">
                            <div className="flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1">
                              <span className="text-[10px] uppercase tracking-wider text-nvi-text-tertiary">{common('expected') || 'Expected'}</span>
                              <span className="text-xs font-bold text-nvi-text-primary">{expectedQty}</span>
                            </div>
                            <Icon name="ArrowRight" size={12} className="text-nvi-text-tertiary" />
                            <div className={`flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1`}>
                              <span className="text-[10px] uppercase tracking-wider text-nvi-text-tertiary">Received</span>
                              <span className={`text-xs font-bold ${barTextColor}`}>{receivedQty}</span>
                            </div>
                          </div>
                        </div>
                        <div className="w-24 shrink-0">
                          <TextInput
                            type="number"
                            value={receiveLines[item.id] ?? String(item.quantity)}
                            onChange={(event) =>
                              setReceiveLines((prev) => ({ ...prev, [item.id]: event.target.value }))
                            }
                            placeholder={String(expectedQty)}
                          />
                        </div>
                      </div>
                      <div className="nvi-bounce-in">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="text-nvi-text-tertiary">{receivedQty} / {expectedQty}</span>
                          <span className={`font-bold ${barTextColor}`}>{pct}%</span>
                        </div>
                        <ProgressBar
                          value={receivedQty}
                          max={expectedQty}
                          height={5}
                          color={barColor}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={receiveTransfer}
                disabled={!canWrite || isReceiving}
                className="nvi-press inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-500 disabled:opacity-60"
                title={!canWrite ? noAccess('title') : undefined}
              >
                {isReceiving ? <Spinner size="xs" variant="orbit" /> : <Icon name="ClipboardCheck" size={16} />}
                {isReceiving ? t('receiving') : t('receiveTransfer')}
              </button>
            </>
          ) : (
            <EmptyState
              icon={<Icon name="Truck" size={32} className="text-nvi-text-tertiary" />}
              title={t('noTransfer')}
            />
          )}
        </Card>
      ) : null}
    </section>
  );
}
