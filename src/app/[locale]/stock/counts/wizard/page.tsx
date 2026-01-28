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
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { formatEntityLabel, formatVariantLabel } from '@/lib/display';

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

const steps = ['counts', 'review'] as const;

export default function StockCountWizardPage() {
  const t = useTranslations('stockCountWizard');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const permissions = getPermissionSet();
  const canWrite = permissions.has('stock.write');
  const [message, setMessage] = useToastState();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<(typeof steps)[number]>('counts');
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
  const activeBranch = useActiveBranch();

  const validLines = useMemo(
    () =>
      lines.filter(
        (line) => line.branchId && line.variantId && line.countedQuantity,
      ),
    [lines],
  );

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
        setVariants(normalizePaginated(variantData).items);
        setSnapshots(normalizePaginated(stockData).items);
        setUnits(unitList);
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
        branchId: activeBranch?.id ?? '',
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
    const data = await apiFetch<Batch[]>(
      `/stock/batches?branchId=${branchId}&variantId=${variantId}`,
      { token },
    );
    setBatchOptions((prev) => ({ ...prev, [key]: data }));
  };

  const submit = async () => {
    const token = getAccessToken();
    if (!token || !validLines.length) {
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      for (const line of validLines) {
        await apiFetch('/stock/counts', {
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
        });
      }
      setLines([
        {
          id: crypto.randomUUID(),
          branchId: activeBranch?.id ?? '',
          variantId: '',
          countedQuantity: '',
          unitId: '',
          reason: '',
          batchId: '',
        },
      ]);
      setMessage({ action: 'save', outcome: 'success', message: t('submitted') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('submitFailed')),
      });
    } finally {
      setIsSubmitting(false);
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
          href={`/${locale}/stock/counts`}
          className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
        >
          {t('backToCounts')}
        </Link>
      </div>

      {message ? <StatusBanner message={message} /> : null}

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

      {step === 'counts' ? (
        <div className="command-card p-4 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('countsTitle')}</h3>
          {lines.map((line) => {
            const key = `${line.branchId}-${line.variantId}`;
            const options = batchOptions[key] ?? [];
            const expected = snapshots.find(
              (item) => item.branchId === line.branchId && item.variantId === line.variantId,
            )?.quantity;
            return (
              <div key={line.id} className="rounded border border-gold-700/30 bg-black/40 p-3 space-y-2">
                <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
                  <SmartSelect
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
                  <SmartSelect
                    value={line.variantId}
                    onChange={(value) => {
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
                    value={line.countedQuantity}
                    onChange={(event) =>
                      updateLine(line.id, { countedQuantity: event.target.value })
                    }
                    placeholder={t('countedQuantity')}
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
                  >
                    {actions('remove')}
                  </button>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
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
                  <SmartSelect
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
                  <input
                    value={line.reason}
                    onChange={(event) => updateLine(line.id, { reason: event.target.value })}
                    placeholder={t('reason')}
                    className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                  />
                </div>
                <div className="text-xs text-gold-400">
                  {t('expectedHint', {
                    value: expected ?? '—',
                  })}
                </div>
              </div>
            );
          })}
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
              className="rounded bg-gold-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-60"
            >
              {actions('next')}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="command-card p-4 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('reviewTitle')}</h3>
          {validLines.length ? (
            <div className="space-y-2 text-sm text-gold-200">
              {validLines.map((line) => (
                <div key={line.id} className="rounded border border-gold-700/40 bg-black/40 p-3">
                  <p className="text-gold-100">
                    {(() => {
                      const variant = variants.find(
                        (item) => item.id === line.variantId,
                      );
                      return variant
                        ? formatVariantLabel(
                            {
                              id: variant.id,
                              name: variant.name,
                              productName: variant.product?.name ?? null,
                            },
                            common('unknown'),
                          )
                        : common('unknown');
                    })()}
                  </p>
                  <p className="text-xs text-gold-300">
                    {t('reviewLine', {
                      qty: line.countedQuantity,
                      unit:
                        units.find((unit) => unit.id === line.unitId)
                          ? buildUnitLabel(units.find((unit) => unit.id === line.unitId) as Unit)
                          : line.unitId,
                      branch:
                        branches.find((branch) => branch.id === line.branchId)?.name ?? '—',
                    })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <StatusBanner message={t('noLines')} />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={!canWrite || isSubmitting || !validLines.length}
              className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isSubmitting ? <Spinner size="xs" variant="dots" /> : null}
              {isSubmitting ? t('submitting') : t('submitCounts')}
            </button>
            <button
              type="button"
              onClick={() => setStep('counts')}
              className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
            >
              {actions('back')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
