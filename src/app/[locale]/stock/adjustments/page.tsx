'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch } from '@/lib/api';
import { getAccessToken, getOrCreateDeviceId } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import {
  enqueueOfflineAction,
  getOfflineCache,
  getOfflineFlag,
  isOfflinePinRequired,
  verifyOfflinePin,
} from '@/lib/offline-store';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { StatusBanner } from '@/components/StatusBanner';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { getPermissionSet } from '@/lib/permissions';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { formatVariantLabel } from '@/lib/display';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type Branch = { id: string; name: string };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name: string } | null;
};
type Batch = {
  id: string;
  code: string;
  expiryDate?: string | null;
  branchId?: string;
  variantId?: string;
};
type StockMovement = {
  id: string;
  movementType: string;
  quantity: string;
  unitId?: string | null;
  reason?: string | null;
  createdAt: string;
  branch?: { id: string; name: string } | null;
  variant?: {
    id: string;
    name: string;
    imageUrl?: string | null;
    product?: { name?: string | null } | null;
  } | null;
};

export default function StockAdjustmentsPage() {
  const t = useTranslations('stockAdjustmentsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('stock.write');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [message, setMessage] = useToastState();
  const [offline, setOffline] = useState(false);
  const [syncBlocked, setSyncBlocked] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [recentAdjustments, setRecentAdjustments] = useState<StockMovement[]>([]);
  const [isLoadingAdjustments, setIsLoadingAdjustments] = useState(false);
  const [showAdjustmentFilters, setShowAdjustmentFilters] = useState(false);
  const {
    filters: adjustmentFilters,
    pushFilters: pushAdjustmentFilters,
    resetFilters: resetAdjustmentFilters,
  } = useListFilters({
    search: '',
    branchId: '',
    type: '',
    reason: '',
    from: '',
    to: '',
  });
  const [adjustmentSearch, setAdjustmentSearch] = useState(
    adjustmentFilters.search,
  );
  const debouncedAdjustmentSearch = useDebouncedValue(
    adjustmentSearch,
    350,
  );
  const [form, setForm] = useState({
    branchId: '',
    variantId: '',
    quantity: '',
    unitId: '',
    type: 'POSITIVE' as 'POSITIVE' | 'NEGATIVE',
    reason: '',
    batchId: '',
    lossReason: '',
  });
  const [batchForm, setBatchForm] = useState({
    branchId: '',
    variantId: '',
    code: '',
    expiryDate: '',
  });
  const activeBranch = useActiveBranch();
  const lossReasons = [
    { value: 'DAMAGED', label: t('lossDamaged') },
    { value: 'LOST', label: t('lossLost') },
    { value: 'STOLEN', label: t('lossStolen') },
    { value: 'EXPIRED', label: t('lossExpired') },
    { value: 'SHRINKAGE', label: t('lossShrinkage') },
    { value: 'OTHER', label: t('lossOther') },
  ];

  const adjustmentBranchOptions = useMemo(
    () => [
      { value: '', label: common('allBranches') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );

  const adjustmentTypeOptions = useMemo(
    () => [
      { value: '', label: common('allTypes') },
      { value: 'ADJUSTMENT_POSITIVE', label: t('positiveAdjustments') },
      { value: 'ADJUSTMENT_NEGATIVE', label: t('negativeAdjustments') },
    ],
    [common, t],
  );

  useEffect(() => {
    const handleOnline = () => setOffline(!navigator.onLine);
    handleOnline();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!activeBranch?.id) {
      return;
    }
    setForm((prev) =>
      prev.branchId ? prev : { ...prev, branchId: activeBranch.id },
    );
    setBatchForm((prev) =>
      prev.branchId ? prev : { ...prev, branchId: activeBranch.id },
    );
    if (!adjustmentFilters.branchId) {
      pushAdjustmentFilters({ branchId: activeBranch.id });
    }
  }, [activeBranch?.id, adjustmentFilters.branchId, pushAdjustmentFilters]);

  useEffect(() => {
    setAdjustmentSearch(adjustmentFilters.search);
  }, [adjustmentFilters.search]);

  useEffect(() => {
    if (debouncedAdjustmentSearch !== adjustmentFilters.search) {
      pushAdjustmentFilters({ search: debouncedAdjustmentSearch });
    }
  }, [debouncedAdjustmentSearch, adjustmentFilters.search, pushAdjustmentFilters]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const token = getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      if (!navigator.onLine) {
        const cache = await getOfflineCache<{
          branches?: Branch[];
          variants?: Variant[];
          batches?: Batch[];
          units?: Unit[];
        }>('snapshot');
        if (!cache) {
          setMessage({ action: 'sync', outcome: 'info', message: t('offlineCacheUnavailable') });
          setIsLoading(false);
          return;
        }
        setBranches(cache.branches ?? []);
        setVariants(cache.variants ?? []);
        setUnits(cache.units ?? []);
        setIsLoading(false);
        return;
      }
      try {
        const [branchData, variantData, unitList] = await Promise.all([
          apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
            token,
          }),
          apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
            token,
          }),
          loadUnits(token),
        ]);
        setBranches(normalizePaginated(branchData).items);
        setVariants(normalizePaginated(variantData).items);
        setUnits(unitList);
      } catch {
        setMessage({ action: 'load', outcome: 'failure', message: t('loadFailed') });
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [offline]);

  useEffect(() => {
    const loadAdjustments = async () => {
      if (offline) {
        setRecentAdjustments([]);
        return;
      }
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setIsLoadingAdjustments(true);
      try {
        const query = buildCursorQuery({
          limit: 50,
          branchId: adjustmentFilters.branchId || undefined,
          type: adjustmentFilters.type || undefined,
          search: adjustmentFilters.search || undefined,
          reason: adjustmentFilters.reason || undefined,
          from: adjustmentFilters.from || undefined,
          to: adjustmentFilters.to || undefined,
        });
        const data = await apiFetch<
          PaginatedResponse<StockMovement> | StockMovement[]
        >(`/stock/movements${query}`, { token });
        const items = normalizePaginated(data).items.filter((movement) =>
          movement.movementType === 'ADJUSTMENT_POSITIVE' ||
          movement.movementType === 'ADJUSTMENT_NEGATIVE',
        );
        setRecentAdjustments(items);
      } catch {
        setRecentAdjustments([]);
      } finally {
        setIsLoadingAdjustments(false);
      }
    };
    loadAdjustments();
  }, [
    adjustmentFilters.branchId,
    adjustmentFilters.type,
    adjustmentFilters.search,
    adjustmentFilters.reason,
    adjustmentFilters.from,
    adjustmentFilters.to,
    offline,
  ]);

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

  useEffect(() => {
    const loadFlags = async () => {
      const blocked = (await getOfflineFlag('syncBlocked')) === 'true';
      const required = await isOfflinePinRequired();
      setSyncBlocked(blocked);
      setPinRequired(required);
    };
    loadFlags();
  }, []);

  useEffect(() => {
    const loadBatches = async () => {
      const token = getAccessToken();
      if (!form.branchId || !form.variantId) {
        setBatches([]);
        return;
      }
      if (!token || !navigator.onLine) {
        const cache = await getOfflineCache<{ batches?: Batch[] }>('snapshot');
        const cached = (cache?.batches ?? []).filter(
          (batch) =>
            batch.branchId === form.branchId && batch.variantId === form.variantId,
        );
        setBatches(cached);
        return;
      }
      const data = await apiFetch<PaginatedResponse<Batch> | Batch[]>(
        `/stock/batches?branchId=${form.branchId}&variantId=${form.variantId}`,
        { token },
      );
      setBatches(normalizePaginated(data).items);
    };
    loadBatches().catch(() => setBatches([]));
  }, [form.branchId, form.variantId]);

  const submit = async () => {
    const token = getAccessToken();
    if (!token || !form.branchId || !form.variantId || !form.quantity) {
      return;
    }
    if (form.type === 'NEGATIVE' && !form.lossReason) {
      setMessage({ action: 'save', outcome: 'warning', message: t('lossReasonRequired') });
      return;
    }
    setMessage(null);
    setIsSubmitting(true);
    if (offline) {
      if (syncBlocked) {
        setMessage({ action: 'sync', outcome: 'warning', message: t('offlineSyncBlocked') });
        setIsSubmitting(false);
        return;
      }
      if (pinRequired && !pinVerified) {
        setMessage({ action: 'sync', outcome: 'warning', message: t('offlinePinRequired') });
        setIsSubmitting(false);
        return;
      }
      const actionId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `offline-${Date.now()}`;
      try {
        await enqueueOfflineAction({
          id: actionId,
          actionType: 'STOCK_ADJUSTMENT',
          payload: {
            deviceId: getOrCreateDeviceId(),
            branchId: form.branchId,
            variantId: form.variantId,
            quantity: Number(form.quantity),
            unitId: form.unitId || undefined,
            type: form.type,
            reason: form.reason || undefined,
            batchId: form.batchId || undefined,
            lossReason: form.lossReason || undefined,
            idempotencyKey: actionId,
          },
          provisionalAt: new Date().toISOString(),
          localAuditId: actionId,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('offlineQueueFailed');
        setMessage(message);
        setIsSubmitting(false);
        return;
      }
      setForm({
        branchId: '',
        variantId: '',
        quantity: '',
        unitId: '',
        type: 'POSITIVE',
        reason: '',
        batchId: '',
        lossReason: '',
      });
      setMessage({ action: 'sync', outcome: 'success', message: t('offlineQueued') });
      setIsSubmitting(false);
      return;
    }
    try {
      await apiFetch('/stock/adjustments', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: form.branchId,
          variantId: form.variantId,
          quantity: Number(form.quantity),
          unitId: form.unitId || undefined,
          type: form.type,
          reason: form.reason || undefined,
          batchId: form.batchId || undefined,
          lossReason: form.lossReason || undefined,
        }),
      });
      setForm({
        branchId: '',
        variantId: '',
        quantity: '',
        unitId: '',
        type: 'POSITIVE',
        reason: '',
        batchId: '',
        lossReason: '',
      });
      setMessage({ action: 'save', outcome: 'success', message: t('submitted') });
    } catch (err) {
      setMessage({ action: 'save', outcome: 'failure', message: t('submitFailed') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const createBatch = async () => {
    const token = getAccessToken();
    if (!token || !batchForm.branchId || !batchForm.variantId || !batchForm.code) {
      return;
    }
    setMessage(null);
    setIsCreatingBatch(true);
    try {
      await apiFetch('/stock/batches', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: batchForm.branchId,
          variantId: batchForm.variantId,
          code: batchForm.code,
          expiryDate: batchForm.expiryDate || undefined,
        }),
      });
      setBatchForm({ branchId: '', variantId: '', code: '', expiryDate: '' });
      setMessage({ action: 'create', outcome: 'success', message: t('batchCreated') });
    } catch (err) {
      setMessage({ action: 'create', outcome: 'failure', message: t('batchCreateFailed') });
    } finally {
      setIsCreatingBatch(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
      <p className="text-sm text-gold-300">{t('subtitle')}</p>
      {message ? <StatusBanner message={message} /> : null}
      {offline && pinRequired && !pinVerified ? (
        <div className="rounded border border-red-600/40 bg-red-950/50 p-3 text-xs text-red-200">
          <p className="font-semibold">{t('pinRequiredTitle')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              placeholder={t('pinPlaceholder')}
              className="rounded border border-red-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <button
              type="button"
              onClick={async () => {
                const ok = await verifyOfflinePin(pinInput);
                if (ok) {
                  setPinVerified(true);
                  setMessage({ action: 'sync', outcome: 'success', message: t('pinVerified') });
                } else {
                  setMessage({ action: 'sync', outcome: 'failure', message: t('pinInvalid') });
                }
                setPinInput('');
              }}
              className="rounded border border-red-700/50 px-3 py-2 text-xs text-red-100"
            >
              {t('unlock')}
            </button>
          </div>
        </div>
      ) : null}
      <div className="command-card p-6 space-y-3 nvi-reveal">
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            value={form.branchId}
            onChange={(value) => setForm({ ...form, branchId: value })}
            placeholder={t('selectBranch')}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
          />
          <SmartSelect
            value={form.variantId}
            onChange={(value) => setForm({ ...form, variantId: value })}
            placeholder={t('selectVariant')}
            options={variants.map((variant) => ({
              value: variant.id,
              label: formatVariantLabel({
                id: variant.id,
                name: variant.name,
                productName: variant.product?.name ?? null,
              }),
            }))}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={form.quantity}
            onChange={(event) =>
              setForm({ ...form, quantity: event.target.value })
            }
            placeholder={t('quantity')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <SmartSelect
            value={form.unitId}
            onChange={(value) => setForm({ ...form, unitId: value })}
            placeholder={t('unit')}
            options={units.map((unit) => ({
              value: unit.id,
              label: buildUnitLabel(unit),
            }))}
          />
          <SmartSelect
            value={form.type}
            onChange={(value) =>
              setForm({
                ...form,
                type: (value || 'POSITIVE') as 'POSITIVE' | 'NEGATIVE',
                lossReason:
                  (value || 'POSITIVE') === 'NEGATIVE' ? form.lossReason : '',
              })
            }
            options={[
              { value: 'POSITIVE', label: t('positive') },
              { value: 'NEGATIVE', label: t('negative') },
            ]}
          />
          <SmartSelect
            value={form.batchId}
            onChange={(value) => setForm({ ...form, batchId: value })}
            placeholder={t('noBatch')}
            options={[
              { value: '', label: t('noBatch') },
              ...batches.map((batch) => ({
                value: batch.id,
                label: `${batch.code}${
                  batch.expiryDate
                    ? ` (${t('expiresShort', { date: batch.expiryDate.slice(0, 10) })})`
                    : ''
                }`,
              })),
            ]}
          />
        </div>
        {form.type === 'NEGATIVE' ? (
          <SmartSelect
            value={form.lossReason}
            onChange={(value) =>
              setForm({ ...form, lossReason: value || '' })
            }
            placeholder={t('lossReason')}
            options={lossReasons}
          />
        ) : null}
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
          {isSubmitting ? t('submitting') : t('submitAdjustment')}
        </button>
      </div>
      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('createBatch')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            value={batchForm.branchId}
            onChange={(value) => setBatchForm({ ...batchForm, branchId: value })}
            placeholder={t('selectBranch')}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
          />
          <SmartSelect
            value={batchForm.variantId}
            onChange={(value) => setBatchForm({ ...batchForm, variantId: value })}
            placeholder={t('selectVariant')}
            options={variants.map((variant) => ({
              value: variant.id,
              label: formatVariantLabel({
                id: variant.id,
                name: variant.name,
                productName: variant.product?.name ?? null,
              }),
            }))}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={batchForm.code}
            onChange={(event) =>
              setBatchForm({ ...batchForm, code: event.target.value })
            }
            placeholder={t('batchCode')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <DatePickerInput
            value={batchForm.expiryDate}
            onChange={(value) =>
              setBatchForm({ ...batchForm, expiryDate: value })
            }
            placeholder={t('expiryDate')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        <button
          onClick={createBatch}
          className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-4 py-2 text-sm text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isCreatingBatch || !canWrite}
          title={!canWrite ? noAccess('title') : undefined}
        >
          {isCreatingBatch ? <Spinner size="xs" variant="grid" /> : null}
          {isCreatingBatch ? t('creating') : t('createBatchAction')}
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
        <ListFilters
          searchValue={adjustmentSearch}
          onSearchChange={setAdjustmentSearch}
          onSearchSubmit={() =>
            pushAdjustmentFilters({ search: adjustmentSearch })
          }
          onReset={() => resetAdjustmentFilters()}
          isLoading={isLoadingAdjustments}
          showAdvanced={showAdjustmentFilters}
          onToggleAdvanced={() =>
            setShowAdjustmentFilters((prev) => !prev)
          }
        >
          <SmartSelect
            value={adjustmentFilters.branchId}
            onChange={(value) => pushAdjustmentFilters({ branchId: value })}
            options={adjustmentBranchOptions}
            placeholder={common('branch')}
            className="nvi-select-container"
          />
          <SmartSelect
            value={adjustmentFilters.type}
            onChange={(value) => pushAdjustmentFilters({ type: value })}
            options={adjustmentTypeOptions}
            placeholder={t('type')}
            className="nvi-select-container"
          />
          <input
            value={adjustmentFilters.reason}
            onChange={(event) =>
              pushAdjustmentFilters({ reason: event.target.value })
            }
            placeholder={t('reason')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <DatePickerInput
            value={adjustmentFilters.from}
            onChange={(value) => pushAdjustmentFilters({ from: value })}
            placeholder={common('fromDate')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <DatePickerInput
            value={adjustmentFilters.to}
            onChange={(value) => pushAdjustmentFilters({ to: value })}
            placeholder={common('toDate')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </ListFilters>
        {isLoadingAdjustments ? (
          <div className="flex items-center gap-2 text-xs text-gold-300">
            <Spinner size="xs" variant="orbit" /> {t('loadingAdjustments')}
          </div>
        ) : viewMode === 'table' ? (
          !recentAdjustments.length ? (
            <StatusBanner message={t('noAdjustments')} />
          ) : (
            <div className="overflow-auto text-sm text-gold-200">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{common('images')}</th>
                    <th className="px-3 py-2">{t('variant')}</th>
                    <th className="px-3 py-2">{t('type')}</th>
                    <th className="px-3 py-2">{t('quantity')}</th>
                    <th className="px-3 py-2">{t('unit')}</th>
                    <th className="px-3 py-2">{t('branch')}</th>
                    <th className="px-3 py-2">{t('reason')}</th>
                    <th className="px-3 py-2">{t('createdAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAdjustments.map((movement) => {
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
                        <td className="px-3 py-2">
                          <div className="h-8 w-8 overflow-hidden rounded border border-gold-700/40 bg-black">
                            {movement.variant?.imageUrl ? (
                              <img
                                src={movement.variant.imageUrl}
                                alt={movement.variant.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-gold-500">
                                —
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-semibold">{variantLabel}</td>
                        <td className="px-3 py-2">{movement.movementType}</td>
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
            {recentAdjustments.map((movement) => {
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
                      <p className="text-gold-100">
                        {variantLabel} • {movement.movementType}
                      </p>
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
            {!recentAdjustments.length ? (
              <StatusBanner message={t('noAdjustments')} />
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
