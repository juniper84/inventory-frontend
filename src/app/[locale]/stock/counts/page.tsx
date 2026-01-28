'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { formatVariantLabel } from '@/lib/display';

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
type StockMovement = {
  id: string;
  movementType: string;
  quantity: string;
  unitId?: string | null;
  reason?: string | null;
  createdAt: string;
  branch?: { id: string; name: string } | null;
  variant?: { id: string; name: string; product?: { name?: string | null } | null } | null;
};

export default function StockCountsPage() {
  const t = useTranslations('stockCountsPage');
  const actions = useTranslations('actions');
  const noAccess = useTranslations('noAccess');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const permissions = getPermissionSet();
  const canWrite = permissions.has('stock.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [message, setMessage] = useToastState();
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [recentCounts, setRecentCounts] = useState<StockMovement[]>([]);
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);
  const [form, setForm] = useState({
    branchId: '',
    variantId: '',
    countedQuantity: '',
    unitId: '',
    reason: '',
    batchId: '',
  });
  const activeBranch = useActiveBranch();

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
    const loadCounts = async () => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setIsLoadingCounts(true);
      try {
        const query = buildCursorQuery({
          limit: 50,
          branchId: form.branchId || undefined,
        });
        const data = await apiFetch<
          PaginatedResponse<StockMovement> | StockMovement[]
        >(`/stock/movements${query}`, { token });
        const items = normalizePaginated(data).items.filter(
          (movement) => movement.movementType === 'STOCK_COUNT_VARIANCE',
        );
        setRecentCounts(items);
      } catch (err) {
        console.warn('Failed to load stock counts', err);
        setRecentCounts([]);
      } finally {
        setIsLoadingCounts(false);
      }
    };
    loadCounts();
  }, [form.branchId]);

  useEffect(() => {
    if (activeBranch?.id && !form.branchId) {
      setForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
  }, [activeBranch?.id, form.branchId]);

  useEffect(() => {
    const loadBatches = async () => {
      const token = getAccessToken();
      if (!token || !form.branchId || !form.variantId) {
        setBatches([]);
        return;
      }
      const data = await apiFetch<Batch[]>(
        `/stock/batches?branchId=${form.branchId}&variantId=${form.variantId}`,
        { token },
      );
      setBatches(data);
    };
    loadBatches().catch(() => setBatches([]));
  }, [form.branchId, form.variantId]);

  useEffect(() => {
    if (!form.variantId) {
      return;
    }
    const variant = variants.find((item) => item.id === form.variantId);
    if (!variant) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      unitId: prev.unitId || variant.sellUnitId || variant.baseUnitId || '',
    }));
  }, [form.variantId, variants]);

  const expected = snapshots.find(
    (item) => item.branchId === form.branchId && item.variantId === form.variantId,
  )?.quantity;

  const submit = async () => {
    const token = getAccessToken();
    if (!token || !form.branchId || !form.variantId || !form.countedQuantity) {
      return;
    }
    setMessage(null);
    setIsSubmitting(true);
    try {
      await apiFetch('/stock/counts', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: form.branchId,
          variantId: form.variantId,
          countedQuantity: Number(form.countedQuantity),
          unitId: form.unitId || undefined,
          reason: form.reason || undefined,
          batchId: form.batchId || undefined,
        }),
      });
      setForm({
        branchId: '',
        variantId: '',
        countedQuantity: '',
        unitId: '',
        reason: '',
        batchId: '',
      });
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
          <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
          <p className="text-sm text-gold-300">{t('subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/stock/counts/wizard`}
          className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
        >
          {t('openWizard')}
        </Link>
      </div>
      {message ? <StatusBanner message={message} /> : null}
      <div className="command-card p-6 space-y-3 nvi-reveal">
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            value={form.branchId}
            onChange={(value) => setForm({ ...form, branchId: value })}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            placeholder={t('selectBranch')}
            isClearable
            className="nvi-select-container"
          />
          <SmartSelect
            value={form.variantId}
            onChange={(value) => setForm({ ...form, variantId: value })}
            options={variants.map((variant) => ({
              value: variant.id,
              label: formatVariantLabel({
                id: variant.id,
                name: variant.name,
                productName: variant.product?.name ?? null,
              }),
            }))}
            placeholder={t('selectVariant')}
            isClearable
            className="nvi-select-container"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={form.countedQuantity}
            onChange={(event) =>
              setForm({ ...form, countedQuantity: event.target.value })
            }
            placeholder={t('countedQuantity')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <SmartSelect
            value={form.unitId}
            onChange={(value) => setForm({ ...form, unitId: value })}
            options={units.map((unit) => ({
              value: unit.id,
              label: buildUnitLabel(unit),
            }))}
            placeholder={t('unit')}
            isClearable
            className="nvi-select-container"
          />
          <input
            value={expected ?? ''}
            readOnly
            placeholder={t('expectedQuantity')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-500"
          />
          <SmartSelect
            value={form.batchId}
            onChange={(value) => setForm({ ...form, batchId: value })}
            options={batches.map((batch) => ({
              value: batch.id,
              label: `${batch.code}${
                batch.expiryDate
                  ? ` (${t('expiresShort', { date: batch.expiryDate.slice(0, 10) })})`
                  : ''
              }`,
            }))}
            placeholder={t('noBatch')}
            isClearable
            className="nvi-select-container"
          />
        </div>
        <input
          value={form.reason}
          onChange={(event) => setForm({ ...form, reason: event.target.value })}
          placeholder={t('reason')}
          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <button
          onClick={submit}
          className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting || !canWrite}
          title={!canWrite ? noAccess('title') : undefined}
        >
          {isSubmitting ? <Spinner size="xs" variant="orbit" /> : null}
          {isSubmitting ? t('submitting') : t('submitCount')}
        </button>
      </div>
      <div className="command-card p-6 space-y-3 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-gold-100">{t('recentTitle')}</h3>
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </div>
        {isLoadingCounts ? (
          <div className="flex items-center gap-2 text-xs text-gold-300">
            <Spinner size="xs" variant="orbit" /> {t('loadingCounts')}
          </div>
        ) : viewMode === 'table' ? (
          !recentCounts.length ? (
            <StatusBanner message={t('noCounts')} />
          ) : (
            <div className="overflow-auto text-sm text-gold-200">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('variant')}</th>
                    <th className="px-3 py-2">{t('quantity')}</th>
                    <th className="px-3 py-2">{t('unit')}</th>
                    <th className="px-3 py-2">{t('branch')}</th>
                    <th className="px-3 py-2">{t('reason')}</th>
                    <th className="px-3 py-2">{t('createdAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCounts.map((movement) => {
                    const unit = movement.unitId
                      ? units.find((item) => item.id === movement.unitId) ?? null
                      : null;
                    const unitLabel = unit ? buildUnitLabel(unit) : movement.unitId ?? '';
                    const variantLabel = movement.variant
                      ? formatVariantLabel(
                          {
                            id: movement.variant.id,
                            name: movement.variant.name,
                            productName: movement.variant.product?.name ?? null,
                          },
                          t('variantFallback'),
                        )
                      : t('variantFallback');
                    return (
                      <tr key={movement.id} className="border-t border-gold-700/20">
                        <td className="px-3 py-2 font-semibold">{variantLabel}</td>
                        <td className="px-3 py-2">{movement.quantity}</td>
                        <td className="px-3 py-2">{unitLabel}</td>
                        <td className="px-3 py-2">
                          {movement.branch?.name ?? t('branchFallback')}
                        </td>
                        <td className="px-3 py-2">
                          {movement.reason ?? t('noReason')}
                        </td>
                        <td className="px-3 py-2">
                          {new Date(movement.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="space-y-2 text-sm text-gold-200">
            {recentCounts.map((movement) => {
              const unit = movement.unitId
                ? units.find((item) => item.id === movement.unitId) ?? null
                : null;
              const unitLabel = unit ? buildUnitLabel(unit) : movement.unitId ?? '';
              const variantLabel = movement.variant
                ? formatVariantLabel(
                    {
                      id: movement.variant.id,
                      name: movement.variant.name,
                      productName: movement.variant.product?.name ?? null,
                    },
                    t('variantFallback'),
                  )
                : t('variantFallback');
              return (
                <div
                  key={movement.id}
                  className="rounded border border-gold-700/40 bg-black/40 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-gold-100">{variantLabel}</p>
                      <p className="text-xs text-gold-400">
                        {t('quantityLabel', {
                          qty: movement.quantity,
                          unit: unitLabel,
                        })}
                      </p>
                      <p className="text-xs text-gold-400">
                        {movement.branch?.name ?? t('branchFallback')} •{' '}
                        {new Date(movement.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <p className="text-xs text-gold-300">
                      {movement.reason ?? t('noReason')}
                    </p>
                  </div>
                </div>
              );
            })}
            {!recentCounts.length ? (
              <StatusBanner message={t('noCounts')} />
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
