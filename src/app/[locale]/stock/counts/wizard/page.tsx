'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { notify } from '@/components/notifications/NotificationProvider';
import { Banner } from '@/components/notifications/Banner';
import { PageHeader, Card, Icon, TextInput, WizardSteps, EmptyState, ProgressBar } from '@/components/ui';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { formatVariantLabel } from '@/lib/display';
import { useVariantSearch } from '@/lib/use-variant-search';

type Branch = { id: string; name: string };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name?: string | null };
};
type Batch = { id: string; code: string; expiryDate?: string | null };
type Snapshot = { branchId: string; variantId: string; quantity: number };

type CountLine = {
  id: string;
  branchId: string;
  variantId: string;
  countedQuantity: string;
  unitId: string;
  reason: string;
  batchId: string;
};

const stepKeys = ['counts', 'review'] as const;

function VarianceIndicator({ variance }: { variance: number }) {
  if (variance === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-semibold text-white/40 nvi-bounce-in">
        <Icon name="Check" size={12} className="text-white/40" />
        Match
      </span>
    );
  }
  if (variance > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 nvi-bounce-in">
        <Icon name="ArrowUp" size={12} className="text-emerald-400" />
        +{variance} surplus
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400 nvi-bounce-in">
      <Icon name="TriangleAlert" size={12} className="text-red-400" />
      {variance} shortage
    </span>
  );
}

export default function StockCountWizardPage() {
  const t = useTranslations('stockCountWizard');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('stock.write');
  const [bannerMsg, setBannerMsg] = useState<{ text: string; severity: 'success' | 'error' | 'warning' | 'info' } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<(typeof stepKeys)[number]>('counts');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [batchOptions, setBatchOptions] = useState<Record<string, Batch[]>>({});
  const [lines, setLines] = useState<CountLine[]>([
    {
      id: crypto.randomUUID(),
      branchId: '',
      variantId: '',
      countedQuantity: '',
      unitId: '',
      reason: '',
      batchId: '',
    },
  ]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const { activeBranch, resolveBranchId } = useBranchScope();
  const { loadOptions: loadVariantOptions, seedCache: seedVariantCache, getVariantOption } = useVariantSearch();

  const stepIndex = stepKeys.indexOf(step);
  const stepLabels = useMemo(() => stepKeys.map((k) => t(`${k}Step`)), [t]);

  const getUnitOptionsForVariant = useCallback(
    (variantId: string) => {
      if (!variantId) return units.map((u) => ({ value: u.id, label: buildUnitLabel(u) }));
      const variant = variants.find((v) => v.id === variantId);
      if (!variant) return units.map((u) => ({ value: u.id, label: buildUnitLabel(u) }));

      const validIds = new Set<string>();
      if (variant.baseUnitId) validIds.add(variant.baseUnitId);
      if (variant.sellUnitId) validIds.add(variant.sellUnitId);

      if (validIds.size === 0) return units.map((u) => ({ value: u.id, label: buildUnitLabel(u) }));

      return units
        .filter((u) => validIds.has(u.id))
        .map((u) => ({
          value: u.id,
          label: `${buildUnitLabel(u)}${u.id === variant.baseUnitId ? ` (${t('unitBase')})` : u.id === variant.sellUnitId ? ` (${t('unitSell')})` : ''}`,
        }));
    },
    [variants, units, t],
  );

  const validLines = useMemo(
    () =>
      lines.filter(
        (line) => line.branchId && line.variantId && line.countedQuantity,
      ),
    [lines],
  );

  const invalidLines = useMemo(
    () =>
      lines.filter(
        (line) => !(line.branchId && line.variantId && line.countedQuantity),
      ),
    [lines],
  );

  const handleBarcodeLookup = useCallback(async () => {
    const code = barcodeInput.trim();
    if (!code) return;
    const token = getAccessToken();
    if (!token) return;
    try {
      const data = await apiFetch<{
        variantId: string;
        code: string;
        variant?: { name?: string | null; product?: { name?: string | null } | null } | null;
      }>(`/barcodes/lookup?code=${encodeURIComponent(code)}`, { token });
      const variant = variants.find((v) => v.id === data.variantId);
      const newLine: CountLine = {
        id: crypto.randomUUID(),
        branchId: resolveBranchId(activeBranch?.id) || '',
        variantId: data.variantId,
        countedQuantity: '',
        unitId: variant?.sellUnitId || variant?.baseUnitId || '',
        reason: '',
        batchId: '',
      };
      setLines((prev) => [...prev, newLine]);
      setBarcodeInput('');
      notify.success(t('barcodeAdded'));
    } catch {
      notify.warning(t('barcodeLookupFailed'));
    }
  }, [barcodeInput, variants, activeBranch?.id, resolveBranchId, t]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const token = getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const [branchData, variantData, stockData, unitList] = await Promise.all([
          apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
            token,
          }),
          apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
            token,
          }),
          apiFetch<PaginatedResponse<Snapshot> | Snapshot[]>('/stock?limit=200', {
            token,
          }),
          loadUnits(token),
        ]);
        setBranches(normalizePaginated(branchData).items);
        const variantList = normalizePaginated(variantData).items;
        setVariants(variantList);
        seedVariantCache(variantList);
        setSnapshots(normalizePaginated(stockData).items);
        setUnits(unitList);
      } catch (err) {
        setBannerMsg({
          text: getApiErrorMessage(err, t('loadFailed')),
          severity: 'error',
        });
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!activeBranch?.id) {
      return;
    }
    setLines((prev) =>
      prev.map((line) =>
        line.branchId ? line : { ...line, branchId: activeBranch.id },
      ),
    );
  }, [activeBranch?.id]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        branchId: resolveBranchId(activeBranch?.id) || '',
        variantId: '',
        countedQuantity: '',
        unitId: '',
        reason: '',
        batchId: '',
      },
    ]);
  };

  const updateLine = (id: string, patch: Partial<CountLine>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((line) => line.id !== id));
  };

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

  const submit = async () => {
    const token = getAccessToken();
    if (!token || !validLines.length) {
      return;
    }
    setIsSubmitting(true);
    setBannerMsg(null);
    try {
      await Promise.all(
        validLines.map((line) =>
          apiFetch('/stock/counts', {
            token,
            method: 'POST',
            body: JSON.stringify({
              branchId: line.branchId,
              variantId: line.variantId,
              countedQuantity: Number(line.countedQuantity),
              unitId: line.unitId || undefined,
              reason: line.reason || undefined,
              batchId: line.batchId || undefined,
            }),
          }),
        ),
      );
      const remaining = invalidLines.length
        ? invalidLines
        : [
            {
              id: crypto.randomUUID(),
              branchId: resolveBranchId(activeBranch?.id) || '',
              variantId: '',
              countedQuantity: '',
              unitId: '',
              reason: '',
              batchId: '',
            },
          ];
      setLines(remaining);
      if (invalidLines.length) {
        setStep('counts');
      }
      notify.success(t('submitted'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('submitFailed')));
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Loading skeleton                                                     */
  /* ------------------------------------------------------------------ */
  if (isLoading) {
    return (
      <section className="nvi-page">
        <div className="nvi-hero nvi-reveal">
          <div className="nvi-hero__copy">
            <div className="h-3 w-24 rounded-xl bg-gold-800/40 nvi-skeleton-pulse" />
            <div className="mt-2 h-6 w-56 rounded-xl bg-gold-800/30 nvi-skeleton-pulse" />
            <div className="mt-2 h-3 w-40 rounded-xl bg-gold-800/20 nvi-skeleton-pulse" />
          </div>
        </div>
        <Card padding="lg" className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-gold-800/10 nvi-skeleton-pulse" />
          ))}
        </Card>
      </section>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                               */
  /* ------------------------------------------------------------------ */
  return (
    <section className="nvi-page">
      {/* Hero */}
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Link
            href={`/${locale}/stock/counts`}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-gold-700/50 px-3 py-2 text-xs font-medium text-gold-100 transition-colors hover:border-gold-500/60"
          >
            <Icon name="ChevronLeft" size={14} className="text-gold-400" />
            {t('backToCounts')}
          </Link>
        }
      />

      {/* Banner */}
      {bannerMsg ? (
        <Banner
          message={bannerMsg.text}
          severity={bannerMsg.severity}
          onDismiss={() => setBannerMsg(null)}
        />
      ) : null}

      {/* KPI strip */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <Card as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
              <Icon name="ClipboardCheck" size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiDraftLines')}</p>
              <p className="mt-1 text-2xl font-bold text-emerald-300">{lines.length}</p>
            </div>
          </div>
        </Card>
        <Card as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20">
              <Icon name="Check" size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiValidLines')}</p>
              <p className="mt-1 text-2xl font-bold text-blue-300">{validLines.length}</p>
            </div>
          </div>
        </Card>
        <Card as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
              <Icon name="Layers" size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiCurrentStep')}</p>
              <p className="mt-1 text-lg font-bold text-amber-300">{t(`${step}Step`)}</p>
            </div>
          </div>
        </Card>
        <Card as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/20">
              <Icon name="Building2" size={20} className="text-purple-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiBranches')}</p>
              <p className="mt-1 text-2xl font-bold text-purple-300">{branches.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Step indicator */}
      <Card padding="md" className="space-y-3">
        <ProgressBar value={stepIndex + 1} max={stepKeys.length} height={6} color="accent" />
        <WizardSteps steps={stepLabels} current={stepIndex} />
      </Card>

      {/* ============================================================ */}
      {/* Step 1: Counts                                                */}
      {/* ============================================================ */}
      {step === 'counts' ? (
        <Card padding="lg" className="space-y-4 border-l-2 border-l-blue-400 nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <Icon name="ClipboardCheck" size={20} className="text-blue-400" />
            <h3 className="text-lg font-semibold text-gold-100">{t('countsTitle')}</h3>
          </div>

          {/* Barcode scanner */}
          <div className="flex items-end gap-2 rounded-xl border-l-2 border-l-blue-400 bg-blue-500/[0.04] pl-3">
            <div className="flex-1">
              <TextInput
                label={t('barcodeInput')}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleBarcodeLookup();
                  }
                }}
                placeholder={t('barcodeInput')}
              />
            </div>
            <button
              type="button"
              onClick={handleBarcodeLookup}
              disabled={!barcodeInput.trim()}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-200 transition-colors hover:border-blue-400/60 hover:bg-blue-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="Scan" size={14} className="text-blue-400" />
              {t('barcodeInput')}
            </button>
          </div>

          {/* Unit hint */}
          <div className="flex items-start gap-2 rounded-xl bg-blue-500/[0.04] border border-blue-500/15 px-3 py-2 text-[11px] text-blue-300/80">
            <Icon name="Info" size={14} className="mt-0.5 shrink-0 text-blue-400" />
            <div>
              <p className="font-medium text-blue-300">{t('unitHintTitle')}</p>
              <p className="mt-0.5">{t('unitHintCount')}</p>
            </div>
          </div>

          {/* Count lines */}
          <div className="space-y-3 nvi-stagger">
            {lines.map((line) => {
              const key = `${line.branchId}-${line.variantId}`;
              const options = batchOptions[key] ?? [];
              const expected = snapshots.find(
                (item) => item.branchId === line.branchId && item.variantId === line.variantId,
              )?.quantity;
              const counted = line.countedQuantity ? Number(line.countedQuantity) : null;
              const variance = expected != null && counted != null ? counted - expected : null;

              return (
                <Card key={line.id} padding="md" className="space-y-3 nvi-card-hover" glow={false}>
                  {/* Row 1: Branch, Variant, Quantity, Remove */}
                  <div className="grid gap-3 md:grid-cols-[2fr_2fr_1fr_auto]">
                    <SmartSelect
                      instanceId={`count-wizard-${line.id}-branch`}
                      value={line.branchId}
                      onChange={(value) => {
                        updateLine(line.id, { branchId: value, batchId: '' });
                        if (line.variantId) {
                          loadBatches(value, line.variantId).catch(() => undefined);
                        }
                      }}
                      options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                      placeholder={t('selectBranch')}
                      className="nvi-select-container"
                    />
                    <AsyncSmartSelect
                      instanceId={`count-wizard-${line.id}-variant`}
                      value={getVariantOption(line.variantId)}
                      loadOptions={loadVariantOptions}
                      defaultOptions={variants.map((v) => ({
                        value: v.id,
                        label: formatVariantLabel({ id: v.id, name: v.name, productName: v.product?.name ?? null }),
                      }))}
                      onChange={(opt) => {
                        const value = opt?.value ?? '';
                        const variant = variants.find((item) => item.id === value);
                        updateLine(line.id, {
                          variantId: value,
                          unitId: variant?.sellUnitId || variant?.baseUnitId || '',
                          batchId: '',
                        });
                        if (line.branchId) {
                          loadBatches(line.branchId, value).catch(() => undefined);
                        }
                      }}
                      placeholder={t('selectVariant')}
                      isClearable
                      className="nvi-select-container"
                    />
                    <TextInput
                      label={t('countedQuantity')}
                      type="number"
                      value={line.countedQuantity}
                      onChange={(event) =>
                        updateLine(line.id, { countedQuantity: event.target.value })
                      }
                      placeholder="0"
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="nvi-press mt-auto flex h-[38px] items-center justify-center gap-1.5 rounded-xl border border-red-700/40 px-3 text-xs font-medium text-red-400 transition-colors hover:border-red-500/60 hover:bg-red-500/5"
                      title={actions('remove')}
                    >
                      <Icon name="Trash2" size={14} />
                    </button>
                  </div>

                  {/* Row 2: Unit, Batch, Reason */}
                  <div className="grid gap-3 md:grid-cols-3">
                    <SmartSelect
                      instanceId={`count-wizard-${line.id}-unit`}
                      value={line.unitId}
                      onChange={(value) => updateLine(line.id, { unitId: value })}
                      options={getUnitOptionsForVariant(line.variantId)}
                      placeholder={t('unit')}
                      className="nvi-select-container"
                    />
                    <SmartSelect
                      instanceId={`count-wizard-${line.id}-batch`}
                      value={line.batchId}
                      onChange={(value) => updateLine(line.id, { batchId: value })}
                      options={options.map((batch) => ({
                        value: batch.id,
                        label: `${batch.code}${
                          batch.expiryDate
                            ? ` (${t('expiresShort', { date: batch.expiryDate.slice(0, 10) })})`
                            : ''
                        }`,
                      }))}
                      placeholder={t('batchOptional')}
                      isClearable
                      className="nvi-select-container"
                    />
                    <TextInput
                      label={t('reason')}
                      value={line.reason}
                      onChange={(event) => updateLine(line.id, { reason: event.target.value })}
                      placeholder={t('reason')}
                    />
                  </div>

                  {/* Variance row */}
                  <div className="flex items-center gap-3 border-t border-gold-700/20 pt-2">
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-gold-800/30 px-2.5 py-1 text-xs text-gold-300">
                      <Icon name="Package" size={12} className="text-gold-500" />
                      {t('expectedHint', { value: expected ?? '\u2014' })}
                    </span>
                    {counted != null && (
                      <span className={`text-xl font-bold ${
                        variance == null
                          ? 'text-gold-100'
                          : variance === 0
                            ? 'text-white/40'
                            : variance > 0
                              ? 'text-emerald-400'
                              : 'text-red-400'
                      }`}>
                        {line.countedQuantity}
                      </span>
                    )}
                    {variance != null ? <VarianceIndicator variance={variance} /> : null}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={addLine}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2 text-xs font-medium text-gold-100 transition-colors hover:bg-white/[0.07]"
            >
              <Icon name="Plus" size={14} className="text-gold-400" />
              {actions('add')}
            </button>
            <button
              type="button"
              onClick={() => setStep('review')}
              disabled={!validLines.length}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {actions('next')}
              <Icon name="ChevronRight" size={14} />
            </button>
          </div>
        </Card>
      ) : null}

      {/* ============================================================ */}
      {/* Step 2: Review                                                */}
      {/* ============================================================ */}
      {step === 'review' ? (
        <Card padding="lg" className="space-y-4 border-l-2 border-l-emerald-400 nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <Icon name="ClipboardCheck" size={20} className="text-emerald-400" />
            <h3 className="text-lg font-semibold text-gold-100">{t('reviewTitle')}</h3>
          </div>

          {/* Partial submit warning */}
          {invalidLines.length > 0 && validLines.length > 0 ? (
            <Banner
              message={t('partialSubmitNote', { valid: validLines.length, invalid: invalidLines.length })}
              severity="warning"
            />
          ) : null}

          {/* Valid lines */}
          {validLines.length ? (
            <div className="space-y-3 nvi-stagger">
              {validLines.map((line) => {
                const expected = snapshots.find(
                  (item) => item.branchId === line.branchId && item.variantId === line.variantId,
                )?.quantity;
                const counted = Number(line.countedQuantity);
                const variance = expected != null ? counted - expected : null;
                const variantObj = variants.find((item) => item.id === line.variantId);
                const variantName = variantObj
                  ? formatVariantLabel(
                      { id: variantObj.id, name: variantObj.name, productName: variantObj.product?.name ?? null },
                      common('unknown'),
                    )
                  : common('unknown');
                const unitLabel = units.find((u) => u.id === line.unitId)
                  ? buildUnitLabel(units.find((u) => u.id === line.unitId) as Unit)
                  : line.unitId;
                const branchName = branches.find((b) => b.id === line.branchId)?.name ?? '\u2014';

                return (
                  <Card key={line.id} padding="md" glow={false} className="nvi-card-hover">
                    {/* Top: name + quantity hero + variance badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gold-100 truncate">{variantName}</p>
                        <p className="mt-0.5 text-xs text-gold-400">
                          {t('reviewLine', { qty: line.countedQuantity, unit: unitLabel, branch: branchName })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xl font-bold ${
                          variance == null
                            ? 'text-gold-100'
                            : variance === 0
                              ? 'text-white/40'
                              : variance > 0
                                ? 'text-emerald-400'
                                : 'text-red-400'
                        }`}>
                          {line.countedQuantity}
                        </span>
                        {variance != null ? <VarianceIndicator variance={variance} /> : null}
                      </div>
                    </div>

                    {/* Expected vs Counted comparison */}
                    {expected != null ? (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-gold-900/30 px-3 py-2 text-xs">
                        <span className="text-gold-400">Expected: <strong className="text-gold-200">{expected}</strong></span>
                        <Icon name="ChevronRight" size={12} className="text-gold-600" />
                        <span className="text-gold-400">Counted: <strong className="text-gold-200">{line.countedQuantity}</strong></span>
                        {variance != null ? (
                          <span className={`ml-auto font-bold ${
                            variance === 0
                              ? 'text-white/40'
                              : variance > 0
                                ? 'text-emerald-400'
                                : 'text-red-400'
                          }`}>
                            {variance > 0 ? '+' : ''}{variance}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-gold-500">
                        <Icon name="Package" size={12} className="text-gold-600 nvi-float" />
                        {t('expectedHint', { value: '\u2014' })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Icon name="Package" size={32} className="text-gold-500/40 nvi-float" />}
              title={t('noLines')}
            />
          )}

          {/* Invalid lines */}
          {invalidLines.length > 0 ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-400">
                <Icon name="TriangleAlert" size={12} />
                {t('invalidLineLabel')}
              </p>
              {invalidLines.map((line) => (
                <Card key={line.id} padding="sm" glow={false} className="border-red-700/30 bg-red-900/5">
                  <p className="text-xs text-gold-300">
                    {line.variantId
                      ? formatVariantLabel(
                          {
                            id: line.variantId,
                            name: variants.find((v) => v.id === line.variantId)?.name ?? null,
                            productName: variants.find((v) => v.id === line.variantId)?.product?.name ?? null,
                          },
                          common('unknown'),
                        )
                      : common('unknown')}
                    {' \u2014 '}
                    {!line.branchId ? t('selectBranch') : ''}
                    {!line.variantId ? t('selectVariant') : ''}
                    {!line.countedQuantity ? t('countedQuantity') : ''}
                  </p>
                </Card>
              ))}
            </div>
          ) : null}

          {/* Navigation */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep('counts')}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2 text-xs font-medium text-gold-100 transition-colors hover:bg-white/[0.07]"
            >
              <Icon name="ChevronLeft" size={14} className="text-gold-400" />
              {actions('back')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canWrite || isSubmitting || !validLines.length}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isSubmitting ? <Spinner size="xs" variant="dots" /> : <Icon name="Check" size={14} />}
              {isSubmitting
                ? t('submitting')
                : invalidLines.length > 0
                  ? t('submitValidOnly')
                  : t('submitCounts')}
            </button>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
