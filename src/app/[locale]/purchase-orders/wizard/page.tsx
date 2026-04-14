'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { useToastState } from '@/lib/app-notifications';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { CurrencyInput } from '@/components/CurrencyInput';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { formatEntityLabel, formatVariantLabel } from '@/lib/display';
import { useVariantSearch } from '@/lib/use-variant-search';
import { getPermissionSet } from '@/lib/permissions';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { useFormatDate } from '@/lib/business-context';
import { PageHeader, Card, Icon, TextInput, WizardSteps, EmptyState, ProgressBar } from '@/components/ui';
import { Banner } from '@/components/notifications/Banner';

type Branch = { id: string; name: string };
type Supplier = { id: string; name: string; leadTimeDays?: number | null };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name?: string | null };
  defaultCost?: number | string | null;
  imageUrl?: string | null;
};
type PurchaseOrderLine = {
  id: string;
  variantId: string;
  quantity: string;
  unitCost: string;
  unitId: string;
};
type PurchaseOrder = {
  id: string;
  status: string;
  branchId: string;
  supplierId: string;
  expectedAt?: string | null;
  lines: { variantId: string; quantity: string; unitCost: string; unitId?: string }[];
};
type SettingsResponse = {
  stockPolicies?: { batchTrackingEnabled?: boolean };
};
type ReceiveLine = {
  id: string;
  variantId: string;
  quantity: string;
  unitCost: string;
  unitId: string;
  batchCode: string;
  expiryDate: string;
};

const stepKeys = ['details', 'lines', 'review', 'receive'] as const;

export default function PurchaseOrderWizardPage() {
  const t = useTranslations('purchaseOrderWizard');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const { formatDate } = useFormatDate();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('purchases.write');
  const [message, setMessage] = useToastState();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  const [step, setStep] = useState<(typeof stepKeys)[number]>('details');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [batchTrackingEnabled, setBatchTrackingEnabled] = useState(false);
  const [generatingCodeForLine, setGeneratingCodeForLine] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<PurchaseOrder | null>(null);
  const [form, setForm] = useState({
    branchId: '',
    supplierId: '',
    expectedAt: '',
  });
  const [lines, setLines] = useState<PurchaseOrderLine[]>([
    { id: crypto.randomUUID(), variantId: '', quantity: '', unitCost: '', unitId: '' },
  ]);
  const [receivingLines, setReceivingLines] = useState<ReceiveLine[]>([]);
  const { activeBranch, resolveBranchId } = useBranchScope();
  const effectiveBranchId = resolveBranchId(form.branchId) || '';
  const { loadOptions: loadVariantOptions, seedCache: seedVariantCache, getVariantOption, getVariantData } = useVariantSearch();

  const getUnitOptionsForVariant = useCallback(
    (variantId: string) => {
      const allOpts = units.map((u) => ({ value: u.id, label: buildUnitLabel(u) }));
      if (!variantId) return allOpts;
      const variant = getVariantData(variantId) ?? variants.find((v) => v.id === variantId);
      if (!variant) return allOpts;
      const validIds = new Set<string>();
      if (variant.baseUnitId) validIds.add(variant.baseUnitId);
      if (variant.sellUnitId) validIds.add(variant.sellUnitId);
      if (validIds.size === 0) return allOpts;
      return units
        .filter((u) => validIds.has(u.id))
        .map((u) => ({
          value: u.id,
          label: `${buildUnitLabel(u)}${u.id === variant.baseUnitId ? ` (${t('unitBase')})` : u.id === variant.sellUnitId ? ` (${t('unitSell')})` : ''}`,
        }));
    },
    [units, variants, getVariantData, t],
  );

  const stepIndex = stepKeys.indexOf(step);
  const stepLabels = useMemo(
    () => stepKeys.map((key) => t(`${key}Step`)),
    [t],
  );

  const selectedSupplier = suppliers.find((supplier) => supplier.id === form.supplierId);
  const supplierEta =
    selectedSupplier?.leadTimeDays && selectedSupplier.leadTimeDays > 0
      ? new Date(Date.now() + selectedSupplier.leadTimeDays * 24 * 60 * 60 * 1000)
      : null;

  const validLines = useMemo(
    () =>
      lines.filter(
        (line) => line.variantId && line.quantity && line.unitCost,
      ),
    [lines],
  );

  const orderTotal = useMemo(
    () => validLines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitCost), 0),
    [validLines],
  );

  const selectedBranchName = useMemo(
    () => branches.find((b) => b.id === effectiveBranchId)?.name ?? '',
    [branches, effectiveBranchId],
  );
  const selectedSupplierName = useMemo(
    () => suppliers.find((s) => s.id === form.supplierId)?.name ?? '',
    [suppliers, form.supplierId],
  );

  const resolveVariantLabel = (variantId: string) => {
    const variant = variants.find((item) => item.id === variantId);
    if (!variant) {
      return formatEntityLabel({ id: variantId }, common('unknown'));
    }
    return formatVariantLabel(
      {
        id: variant.id,
        name: variant.name,
        productName: variant.product?.name ?? null,
      },
      common('unknown'),
    );
  };

  useEffect(() => {
    if (activeBranch?.id && !form.branchId) {
      setForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
  }, [activeBranch?.id, form.branchId]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const token = getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const [branchData, supplierData, variantData, unitList, settings] =
          await Promise.all([
            apiFetch<PaginatedResponse<Branch> | Branch[]>(
              '/branches?limit=200',
              { token },
            ),
            apiFetch<PaginatedResponse<Supplier> | Supplier[]>(
              '/suppliers?limit=200',
              { token },
            ),
            apiFetch<PaginatedResponse<Variant> | Variant[]>(
              '/variants?limit=200',
              { token },
            ),
            loadUnits(token),
            apiFetch<SettingsResponse>('/settings', { token }),
          ]);
        setBranches(normalizePaginated(branchData).items);
        setSuppliers(normalizePaginated(supplierData).items);
        const variantList = normalizePaginated(variantData).items;
        setVariants(variantList);
        seedVariantCache(variantList);
        setUnits(unitList);
        setBatchTrackingEnabled(!!settings.stockPolicies?.batchTrackingEnabled);
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

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), variantId: '', quantity: '', unitCost: '', unitId: '' },
    ]);
  };

  const updateLine = (id: string, patch: Partial<PurchaseOrderLine>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((line) => line.id !== id));
  };

  const createOrder = async () => {
    const token = getAccessToken();
    if (!token || !effectiveBranchId || !form.supplierId) {
      return;
    }
    if (!validLines.length) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      const payloadLines = validLines.map((line) => ({
        variantId: line.variantId,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
        unitId: line.unitId || undefined,
      }));
      const result = await apiFetch<PurchaseOrder | { approvalRequired?: boolean; approvalId?: string }>(
        '/purchase-orders',
        {
          token,
          method: 'POST',
          body: JSON.stringify({
            branchId: effectiveBranchId,
            supplierId: form.supplierId,
            expectedAt: form.expectedAt || undefined,
            lines: payloadLines,
          }),
        },
      );
      if (result && typeof result === 'object' && 'approvalRequired' in result) {
        setApprovalNotice(t('approvalRequested', { id: result.approvalId ?? '' }));
        setIsCreating(false);
        return;
      }
      const created = result as PurchaseOrder;
      setCreatedOrder(created);
      setReceivingLines(
        created.lines.map((line) => ({
          id: crypto.randomUUID(),
          variantId: line.variantId,
          quantity: String(line.quantity),
          unitCost: String(line.unitCost),
          unitId: line.unitId ?? '',
          batchCode: '',
          expiryDate: '',
        })),
      );
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

  const approveOrder = async () => {
    const token = getAccessToken();
    if (!token || !createdOrder) {
      return;
    }
    setMessage(null);
    try {
      const result = await apiFetch<{ approvalRequired?: boolean; approvalId?: string }>(
        `/purchase-orders/${createdOrder.id}/approve`,
        { token, method: 'POST' },
      );
      if (result && typeof result === 'object' && 'approvalRequired' in result) {
        setApprovalNotice(t('approvalRequested', { id: result.approvalId ?? '' }));
      } else {
        setMessage({ action: 'approve', outcome: 'success', message: t('approved') });
        setCreatedOrder((prev) => (prev ? { ...prev, status: 'APPROVED' } : prev));
      }
    } catch (err) {
      setMessage({
        action: 'approve',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('approveFailed')),
      });
    }
  };

  const generateBatchCodeForLine = async (lineId: string) => {
    const token = getAccessToken();
    if (!token || !effectiveBranchId) return;
    setGeneratingCodeForLine(lineId);
    try {
      const result = await apiFetch<{ code: string }>('/stock/batches/generate-code', {
        token,
        method: 'POST',
        body: JSON.stringify({ branchId: effectiveBranchId }),
      });
      setReceivingLines((prev) =>
        prev.map((line) => (line.id === lineId ? { ...line, batchCode: result.code } : line)),
      );
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, 'Failed to generate batch code'),
      });
    } finally {
      setGeneratingCodeForLine(null);
    }
  };

  const updateReceivingLine = (id: string, patch: Partial<ReceiveLine>) => {
    setReceivingLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const receiveStock = async () => {
    const token = getAccessToken();
    if (!token || !createdOrder) {
      return;
    }
    const payloadLines = receivingLines
      .filter((line) => line.variantId && line.quantity && line.unitCost)
      .map((line) => ({
        variantId: line.variantId,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
        unitId: line.unitId || undefined,
        batchCode: line.batchCode || undefined,
        expiryDate: line.expiryDate || undefined,
      }));
    if (!payloadLines.length) {
      return;
    }
    setIsReceiving(true);
    setMessage(null);
    try {
      await apiFetch('/receiving', {
        token,
        method: 'POST',
        body: JSON.stringify({
          purchaseOrderId: createdOrder.id,
          lines: payloadLines,
        }),
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
            href={`/${locale}/purchase-orders`}
            className="nvi-press inline-flex items-center gap-2 rounded-xl border border-nvi-border px-3 py-2 text-xs text-nvi-text-primary"
          >
            <Icon name="ChevronLeft" size={14} className="text-nvi-text-secondary" />
            {t('backToOrders')}
          </Link>
        }
      />

      {message ? (
        <Banner
          message={message}
          severity="info"
          onDismiss={() => setMessage(null)}
        />
      ) : null}
      {approvalNotice ? (
        <Banner message={approvalNotice} severity="warning" onDismiss={() => setApprovalNotice(null)} />
      ) : null}

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 nvi-stagger">
        <Card padding="md" glow={false} as="article">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <Icon name="ClipboardList" size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-nvi-text-tertiary">{t('kpiCurrentStep')}</p>
              <p className="text-lg font-semibold text-nvi-text-primary">{t(`${step}Step`)}</p>
            </div>
          </div>
        </Card>
        <Card padding="md" glow={false} as="article">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Icon name="Check" size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-nvi-text-tertiary">{t('kpiValidLines')}</p>
              <p className="text-2xl font-semibold text-nvi-text-primary">{validLines.length}</p>
            </div>
          </div>
        </Card>
        <Card padding="md" glow={false} as="article">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-400/10">
              <Icon name="DollarSign" size={20} className="text-gold-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-nvi-text-tertiary">
                {common('total') || 'Order total'}
              </p>
              <p className="text-2xl font-semibold text-nvi-text-primary">
                {orderTotal.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          <h3 className="text-lg font-semibold text-nvi-text-primary">{t('detailsTitle')}</h3>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Supplier selector */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
                <Icon name="Truck" size={14} className="text-nvi-text-secondary" />
                {t('selectSupplier')}
              </label>
              <SmartSelect
                instanceId="wizard-supplier"
                value={form.supplierId}
                onChange={(value) => setForm((prev) => ({ ...prev, supplierId: value }))}
                options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
                placeholder={t('selectSupplier')}
                className="nvi-select-container"
              />
            </div>

            {/* Branch selector */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
                <Icon name="Building2" size={14} className="text-nvi-text-secondary" />
                {t('selectBranch')}
              </label>
              <SmartSelect
                instanceId="wizard-branch"
                value={form.branchId}
                onChange={(value) => setForm((prev) => ({ ...prev, branchId: value }))}
                options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                placeholder={t('selectBranch')}
                className="nvi-select-container"
              />
            </div>

            {/* Expected date */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
                <Icon name="CalendarClock" size={14} className="text-nvi-text-secondary" />
                {t('expectedAt')}
              </label>
              <DatePickerInput
                value={form.expectedAt}
                onChange={(value) => setForm((prev) => ({ ...prev, expectedAt: value }))}
                placeholder={t('expectedAt')}
              />
            </div>

            {/* Supplier lead time hint */}
            <div className="flex items-center">
              {supplierEta ? (
                <Card padding="sm" glow={false} className="flex items-center gap-2 w-full nvi-bounce-in">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                    <Icon name="Lightbulb" size={16} className="text-amber-400" />
                  </div>
                  <p className="text-xs text-nvi-text-secondary">
                    {t('etaHint', { date: formatDate(supplierEta) })}
                  </p>
                </Card>
              ) : (
                <p className="text-xs text-nvi-text-tertiary">{t('etaFallback')}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStep('lines')}
            disabled={!effectiveBranchId || !form.supplierId}
            className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
          >
            {actions('next')}
            <Icon name="ChevronRight" size={16} />
          </button>
        </Card>
      ) : null}

      {/* Step 2: Lines */}
      {step === 'lines' ? (
        <Card padding="lg" className="space-y-4 nvi-slide-in-bottom">
          <h3 className="text-lg font-semibold text-nvi-text-primary">{t('linesTitle')}</h3>

          <div className="space-y-3 nvi-stagger">
            {lines.map((line) => {
              const lineVariant = variants.find((v) => v.id === line.variantId);
              return (
                <Card key={line.id} padding="md" glow={false} className="nvi-card-hover space-y-3">
                  <div className="flex items-start gap-3">
                    {/* Variant image or icon */}
                    {lineVariant?.imageUrl ? (
                      <img
                        src={lineVariant.imageUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg border border-nvi-border object-cover mt-0.5"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-400/10 mt-0.5">
                        <Icon name="Package" size={18} className="text-gold-400" />
                      </div>
                    )}

                    <div className="flex-1 grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
                      {/* Variant search */}
                      <AsyncSmartSelect
                        instanceId={`wizard-line-${line.id}-variant`}
                        value={getVariantOption(line.variantId)}
                        loadOptions={loadVariantOptions}
                        defaultOptions={variants.map((variant) => ({
                          value: variant.id,
                          label: formatVariantLabel({
                            id: variant.id,
                            name: variant.name,
                            productName: variant.product?.name ?? null,
                          }),
                        }))}
                        onChange={(opt) => {
                          const variantId = opt?.value ?? '';
                          const variant = getVariantData(variantId);
                          updateLine(line.id, {
                            variantId,
                            unitId: variant?.sellUnitId || variant?.baseUnitId || '',
                            unitCost: String(variant?.defaultCost ?? line.unitCost ?? ''),
                          });
                        }}
                        placeholder={t('selectVariant')}
                        isClearable
                        className="nvi-select-container"
                      />

                      {/* Quantity */}
                      <TextInput
                        label={t('quantity')}
                        type="number"
                        value={line.quantity}
                        onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                        placeholder={t('quantity')}
                      />

                      {/* Unit cost */}
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
                          {t('unitCost')}
                        </label>
                        <CurrencyInput
                          value={line.unitCost}
                          onChange={(value) => updateLine(line.id, { unitCost: value })}
                          placeholder={t('unitCost')}
                          className="rounded-xl border border-nvi-border bg-black px-3 py-2 text-sm text-nvi-text-primary"
                        />
                      </div>

                      {/* Unit */}
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
                          {t('unit')}
                        </label>
                        <SmartSelect
                          instanceId={`wizard-line-${line.id}-unit`}
                          value={line.unitId}
                          onChange={(value) => updateLine(line.id, { unitId: value })}
                          options={getUnitOptionsForVariant(line.variantId)}
                          placeholder={t('unit')}
                          className="nvi-select-container"
                        />
                      </div>
                    </div>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="nvi-press flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 mt-0.5"
                      title={actions('remove')}
                    >
                      <Icon name="Trash2" size={14} />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Unit hint */}
          <div className="flex items-start gap-2 rounded-xl bg-blue-500/[0.04] border border-blue-500/15 px-3 py-2 text-[11px] text-blue-300/80">
            <Icon name="Info" size={14} className="mt-0.5 shrink-0 text-blue-400" />
            <div>
              <p className="font-medium text-blue-300">{t('unitHintTitle')}</p>
              <p className="mt-0.5">{t('unitHintPurchase')}</p>
            </div>
          </div>

          {/* Reorder suggestions hint */}
          <Card padding="sm" glow={false} className="flex items-center gap-2">
            <Icon name="Lightbulb" size={14} className="shrink-0 text-amber-400" />
            <p className="text-xs text-nvi-text-secondary">
              {t('reorderSuggestionsHint')}{' '}
              <Link
                href={`/${locale}/purchase-orders`}
                className="underline text-nvi-text-primary hover:text-gold-400"
              >
                {t('reorderSuggestionsLink')}
              </Link>
            </p>
          </Card>

          {/* Add + navigation */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addLine}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-nvi-border px-3 py-2 text-xs text-nvi-text-primary hover:border-gold-400/40"
            >
              <Icon name="Plus" size={14} className="text-gold-400" />
              {actions('add')}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-nvi-border pt-4">
            <button
              type="button"
              onClick={() => setStep('details')}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-nvi-border px-4 py-2 text-xs text-nvi-text-primary"
            >
              <Icon name="ChevronLeft" size={14} />
              {actions('back')}
            </button>
            <button
              type="button"
              onClick={() => setStep('review')}
              disabled={!validLines.length}
              className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
            >
              {actions('next')}
              <Icon name="ChevronRight" size={16} />
            </button>
          </div>
        </Card>
      ) : null}

      {/* Step 3: Review (order manifest) */}
      {step === 'review' ? (
        <Card padding="lg" className="space-y-4 nvi-slide-in-bottom">
          <h3 className="text-lg font-semibold text-nvi-text-primary">{t('reviewTitle')}</h3>

          {/* Supplier + branch info card */}
          <Card padding="md" glow={false} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
                <Icon name="Truck" size={18} className="text-blue-400" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-nvi-text-tertiary">{t('selectSupplier')}</p>
                <p className="text-sm font-semibold text-nvi-text-primary">{selectedSupplierName || '---'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
                <Icon name="MapPin" size={18} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-nvi-text-tertiary">{t('selectBranch')}</p>
                <p className="text-sm font-semibold text-nvi-text-primary">{selectedBranchName || '---'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
                <Icon name="CalendarClock" size={18} className="text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-nvi-text-tertiary">{t('expectedAt')}</p>
                <p className="text-sm font-semibold text-nvi-text-primary">
                  {form.expectedAt ? formatDate(form.expectedAt) : '---'}
                </p>
              </div>
            </div>
          </Card>

          {/* Line items */}
          <div className="space-y-2 nvi-stagger">
            {validLines.map((line) => (
              <Card key={line.id} padding="sm" glow={false} className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-400/10">
                  <Icon name="Package" size={14} className="text-gold-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-nvi-text-primary truncate">
                    {resolveVariantLabel(line.variantId)}
                  </p>
                  <p className="text-xs text-nvi-text-tertiary">
                    {t('summaryLine', {
                      qty: line.quantity,
                      unit: units.find((unit) => unit.id === line.unitId)
                        ? buildUnitLabel(units.find((unit) => unit.id === line.unitId) as Unit)
                        : line.unitId,
                      cost: Number(line.unitCost).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    })}
                  </p>
                </div>
                <span className="shrink-0 rounded-lg bg-nvi-surface-alt px-2.5 py-1 text-xs font-semibold text-nvi-text-primary">
                  {(Number(line.quantity) * Number(line.unitCost)).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </Card>
            ))}
          </div>

          {/* Grand total */}
          <Card padding="md" glow={false}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-nvi-text-secondary">
                <Icon name="DollarSign" size={16} className="text-gold-400" />
                {common('total') || 'Order total'}
              </span>
              <span className="text-xl font-bold text-nvi-text-primary">
                {orderTotal.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 border-t border-nvi-border pt-4">
            <button
              type="button"
              onClick={() => setStep('lines')}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-nvi-border px-4 py-2 text-xs text-nvi-text-primary"
            >
              <Icon name="ChevronLeft" size={14} />
              {actions('back')}
            </button>
            <button
              type="button"
              onClick={createOrder}
              disabled={!canWrite || isCreating}
              className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isCreating ? <Spinner size="xs" variant="dots" /> : <Icon name="Send" size={16} />}
              {isCreating ? t('creating') : t('createOrder')}
            </button>
          </div>
        </Card>
      ) : null}

      {/* Step 4: Receive */}
      {step === 'receive' ? (
        <Card padding="lg" className="space-y-4 nvi-slide-in-bottom">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-nvi-text-primary">{t('receiveTitle')}</h3>
            {createdOrder ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-nvi-surface-alt px-2.5 py-1 text-xs font-medium text-nvi-text-secondary">
                <Icon name="ClipboardCheck" size={12} className="text-nvi-text-tertiary" />
                {t('orderStatus', { status: createdOrder.status })}
              </span>
            ) : null}
          </div>

          {createdOrder ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={approveOrder}
                className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-nvi-border px-3 py-2 text-xs text-nvi-text-primary hover:border-emerald-500/40"
              >
                <Icon name="Check" size={14} className="text-emerald-400" />
                {t('approveOrder')}
              </button>
              <Link
                href={`/${locale}/purchase-orders`}
                className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-nvi-border px-3 py-2 text-xs text-nvi-text-primary"
              >
                <Icon name="X" size={14} className="text-nvi-text-secondary" />
                {t('finishLater')}
              </Link>
            </div>
          ) : null}

          {!approvalNotice ? (
            <>
              {receivingLines.length ? (
                <div className="space-y-3 nvi-stagger">
                  {receivingLines.map((line) => {
                    const expectedQty = Number(line.quantity);
                    const receivedQty = Number(line.quantity) || 0;
                    const completionPct = expectedQty > 0 ? Math.min(Math.round((receivedQty / expectedQty) * 100), 100) : 0;

                    return (
                      <Card key={line.id} padding="md" glow={false} className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-nvi-text-primary">
                            {resolveVariantLabel(line.variantId)}
                          </p>
                          <span className="shrink-0 text-xs text-nvi-text-tertiary">
                            {t('summaryLine', {
                              qty: line.quantity,
                              unit: units.find((unit) => unit.id === line.unitId)
                                ? buildUnitLabel(units.find((unit) => unit.id === line.unitId) as Unit)
                                : line.unitId,
                              cost: Number(line.unitCost).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                            })}
                          </span>
                        </div>

                        {/* Completion progress */}
                        <ProgressBar
                          value={completionPct}
                          max={100}
                          height={4}
                          color={completionPct >= 100 ? 'green' : completionPct > 0 ? 'amber' : 'red'}
                          showPercent
                          className="nvi-bounce-in"
                        />

                        <div className="grid gap-3 md:grid-cols-3">
                          <TextInput
                            label={t('quantity')}
                            type="number"
                            value={line.quantity}
                            onChange={(event) => updateReceivingLine(line.id, { quantity: event.target.value })}
                            placeholder={t('quantity')}
                          />
                          <div>
                            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
                              {t('unitCost')}
                            </label>
                            <CurrencyInput
                              value={line.unitCost}
                              onChange={(value) => updateReceivingLine(line.id, { unitCost: value })}
                              placeholder={t('unitCost')}
                              className="rounded-xl border border-nvi-border bg-black px-3 py-2 text-sm text-nvi-text-primary"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
                              {t('unit')}
                            </label>
                            <SmartSelect
                              instanceId={`wizard-receive-line-${line.id}-unit`}
                              value={line.unitId}
                              onChange={(value) => updateReceivingLine(line.id, { unitId: value })}
                              options={getUnitOptionsForVariant(line.variantId)}
                              placeholder={t('unit')}
                              className="nvi-select-container"
                            />
                          </div>
                        </div>

                        {batchTrackingEnabled ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="flex items-end gap-1.5">
                              <div className="flex-1">
                                <TextInput
                                  label={t('batchCode')}
                                  value={line.batchCode}
                                  onChange={(event) =>
                                    updateReceivingLine(line.id, { batchCode: event.target.value })
                                  }
                                  placeholder={t('batchCode')}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => generateBatchCodeForLine(line.id)}
                                disabled={generatingCodeForLine === line.id || !effectiveBranchId}
                                className="nvi-press shrink-0 rounded-xl border border-nvi-border p-2 text-nvi-text-tertiary transition-colors hover:border-gold-500/50 hover:text-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
                                title="Generate batch code"
                              >
                                {generatingCodeForLine === line.id ? <Spinner size="xs" variant="orbit" /> : <Icon name="Wand" size={16} />}
                              </button>
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
                                {t('expiryDate')}
                              </label>
                              <DatePickerInput
                                value={line.expiryDate}
                                onChange={(value) => updateReceivingLine(line.id, { expiryDate: value })}
                                placeholder={t('expiryDate')}
                              />
                            </div>
                          </div>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={<Icon name="Package" size={28} className="text-nvi-text-tertiary" />}
                  title={t('noLines')}
                />
              )}

              <div className="flex items-start gap-2 rounded-xl bg-blue-500/[0.04] border border-blue-500/15 px-3 py-2 text-[11px] text-blue-300/80">
                <Icon name="Info" size={14} className="mt-0.5 shrink-0 text-blue-400" />
                <div>
                  <p className="font-medium text-blue-300">{t('unitHintTitle')}</p>
                  <p className="mt-0.5">{t('unitHintPurchase')}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={receiveStock}
                disabled={!canWrite || isReceiving || !createdOrder}
                className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
                title={!canWrite ? noAccess('title') : undefined}
              >
                {isReceiving ? <Spinner size="xs" variant="orbit" /> : <Icon name="Check" size={16} />}
                {isReceiving ? t('receiving') : t('receiveStock')}
              </button>
            </>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}
