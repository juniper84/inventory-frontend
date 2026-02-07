'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { useToastState } from '@/lib/app-notifications';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { StatusBanner } from '@/components/StatusBanner';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { formatEntityLabel, formatVariantLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

type Branch = { id: string; name: string };
type Supplier = { id: string; name: string; leadTimeDays?: number | null };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name?: string | null };
  defaultCost?: number | string | null;
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

const steps = ['details', 'lines', 'review', 'receive'] as const;

export default function PurchaseOrderWizardPage() {
  const t = useTranslations('purchaseOrderWizard');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const permissions = getPermissionSet();
  const canWrite = permissions.has('purchases.write');
  const [message, setMessage] = useToastState();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  const [step, setStep] = useState<(typeof steps)[number]>('details');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [batchTrackingEnabled, setBatchTrackingEnabled] = useState(false);
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
        setVariants(normalizePaginated(variantData).items);
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
    return <PageSkeleton />;
  }

  return (
    <section className="nvi-page">
      <PremiumPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="status-chip">Guided</span>
            <span className="status-chip">{step}</span>
          </>
        }
        actions={
          <Link
            href={`/${locale}/purchase-orders`}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
          >
            {t('backToOrders')}
          </Link>
        }
      />

      {message ? <StatusBanner message={message} /> : null}
      {approvalNotice ? <StatusBanner message={approvalNotice} /> : null}

      <div className="grid gap-3 md:grid-cols-3 nvi-stagger">
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            Current step
          </p>
          <p className="mt-2 text-lg font-semibold text-gold-100">{t(`${step}Step`)}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            Valid lines
          </p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{validLines.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">
            Created order
          </p>
          <p className="mt-2 text-lg font-semibold text-gold-100">
            {createdOrder?.status ?? 'Not created'}
          </p>
        </article>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-gold-300 command-card p-3 nvi-reveal nvi-panel">
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
        <div className="command-card p-4 space-y-3 nvi-reveal nvi-panel">
          <h3 className="text-lg font-semibold text-gold-100">{t('detailsTitle')}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <SmartSelect
              value={form.branchId}
              onChange={(value) => setForm((prev) => ({ ...prev, branchId: value }))}
              options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              placeholder={t('selectBranch')}
              className="nvi-select-container"
            />
            <SmartSelect
              value={form.supplierId}
              onChange={(value) => setForm((prev) => ({ ...prev, supplierId: value }))}
              options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              placeholder={t('selectSupplier')}
              className="nvi-select-container"
            />
            <DatePickerInput
              value={form.expectedAt}
              onChange={(value) => setForm((prev) => ({ ...prev, expectedAt: value }))}
              placeholder={t('expectedAt')}
            />
            <div className="text-xs text-gold-400">
              {supplierEta
                ? t('etaHint', { date: supplierEta.toLocaleDateString() })
                : t('etaFallback')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStep('lines')}
            disabled={!effectiveBranchId || !form.supplierId}
            className="nvi-cta rounded px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {actions('next')}
          </button>
        </div>
      ) : null}

      {step === 'lines' ? (
        <div className="command-card p-4 space-y-3 nvi-reveal nvi-panel">
          <h3 className="text-lg font-semibold text-gold-100">{t('linesTitle')}</h3>
          {lines.map((line) => (
            <div key={line.id} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <SmartSelect
                value={line.variantId}
                onChange={(value) => {
                  const variant = variants.find((item) => item.id === value);
                  updateLine(line.id, {
                    variantId: value,
                    unitId: variant?.sellUnitId || variant?.baseUnitId || '',
                    unitCost: String(variant?.defaultCost ?? line.unitCost ?? ''),
                  });
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
                value={line.quantity}
                onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                placeholder={t('quantity')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
              />
              <input
                value={line.unitCost}
                onChange={(event) => updateLine(line.id, { unitCost: event.target.value })}
                placeholder={t('unitCost')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
              />
              <SmartSelect
                value={line.unitId}
                onChange={(value) => updateLine(line.id, { unitId: value })}
                options={units.map((unit) => ({
                  value: unit.id,
                  label: buildUnitLabel(unit),
                }))}
                placeholder={t('unit')}
                className="nvi-select-container"
              />
              <button
                type="button"
                onClick={() => removeLine(line.id)}
                className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
              >
                {actions('remove')}
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addLine}
              className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
            >
              {actions('add')}
            </button>
            <button
              type="button"
              onClick={() => setStep('review')}
              disabled={!validLines.length}
              className="nvi-cta rounded px-4 py-2 text-xs font-semibold text-black disabled:opacity-60"
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
        <div className="command-card p-4 space-y-3 nvi-reveal nvi-panel">
          <h3 className="text-lg font-semibold text-gold-100">{t('reviewTitle')}</h3>
          <div className="text-sm text-gold-200">
            <p>
              {t('summaryBranch', {
                name: branches.find((b) => b.id === effectiveBranchId)?.name ?? '—',
              })}
            </p>
            <p>{t('summarySupplier', { name: suppliers.find((s) => s.id === form.supplierId)?.name ?? '—' })}</p>
            <p>
              {t('summaryExpected', {
                date: form.expectedAt ? new Date(form.expectedAt).toLocaleDateString() : '—',
              })}
            </p>
          </div>
          <div className="space-y-2 text-sm text-gold-300">
            {validLines.map((line) => (
              <div key={line.id} className="rounded border border-gold-700/40 bg-black/40 p-3">
                <p className="text-gold-100">{resolveVariantLabel(line.variantId)}</p>
                <p className="text-xs text-gold-300">
                  {t('summaryLine', {
                    qty: line.quantity,
                    unit: units.find((unit) => unit.id === line.unitId)
                      ? buildUnitLabel(units.find((unit) => unit.id === line.unitId) as Unit)
                      : line.unitId,
                    cost: line.unitCost,
                  })}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={createOrder}
              disabled={!canWrite || isCreating}
              className="nvi-cta rounded px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isCreating ? <Spinner size="xs" variant="dots" /> : null}
              {isCreating ? t('creating') : t('createOrder')}
            </button>
            <button
              type="button"
              onClick={() => setStep('lines')}
              className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
            >
              {actions('back')}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'receive' ? (
        <div className="command-card p-4 space-y-3 nvi-reveal nvi-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-gold-100">{t('receiveTitle')}</h3>
            {createdOrder ? (
              <span className="text-xs text-gold-400">
                {t('orderStatus', { status: createdOrder.status })}
              </span>
            ) : null}
          </div>
          {createdOrder ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={approveOrder}
                className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
              >
                {t('approveOrder')}
              </button>
              <Link
                href={`/${locale}/purchase-orders`}
                className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
              >
                {t('finishLater')}
              </Link>
            </div>
          ) : null}
          {receivingLines.length ? (
            <div className="space-y-2">
              {receivingLines.map((line) => (
                <div key={line.id} className="grid gap-2 md:grid-cols-3">
                  <div className="md:col-span-3 text-sm text-gold-200">
                    {resolveVariantLabel(line.variantId)}
                  </div>
                  <input
                    value={line.quantity}
                    onChange={(event) => updateReceivingLine(line.id, { quantity: event.target.value })}
                    placeholder={t('quantity')}
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                  />
                  <input
                    value={line.unitCost}
                    onChange={(event) => updateReceivingLine(line.id, { unitCost: event.target.value })}
                    placeholder={t('unitCost')}
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                  />
                  <SmartSelect
                    value={line.unitId}
                    onChange={(value) => updateReceivingLine(line.id, { unitId: value })}
                    options={units.map((unit) => ({
                      value: unit.id,
                      label: buildUnitLabel(unit),
                    }))}
                    placeholder={t('unit')}
                    className="nvi-select-container"
                  />
                  {batchTrackingEnabled ? (
                    <>
                      <input
                        value={line.batchCode}
                        onChange={(event) =>
                          updateReceivingLine(line.id, { batchCode: event.target.value })
                        }
                        placeholder={t('batchCode')}
                        className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                      />
                      <DatePickerInput
                        value={line.expiryDate}
                        onChange={(value) => updateReceivingLine(line.id, { expiryDate: value })}
                        placeholder={t('expiryDate')}
                      />
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <StatusBanner message={t('noLines')} />
          )}
          <button
            type="button"
            onClick={receiveStock}
            disabled={!canWrite || isReceiving || !createdOrder}
            className="nvi-cta rounded px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isReceiving ? <Spinner size="xs" variant="orbit" /> : null}
            {isReceiving ? t('receiving') : t('receiveStock')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
