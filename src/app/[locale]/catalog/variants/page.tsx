'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { promptAction, useToastState } from '@/lib/app-notifications';
import JsBarcode from 'jsbarcode';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { PageSkeleton } from '@/components/PageSkeleton';
import { SmartSelect } from '@/components/SmartSelect';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { installBarcodeScanner } from '@/lib/barcode-scanner';
import { formatVariantLabel } from '@/lib/display';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type Product = { id: string; name: string };
type Branch = { id: string; name: string };
type Barcode = { id: string; code: string; isActive: boolean };
type Availability = { branchId: string; isActive: boolean };
type Variant = {
  id: string;
  name: string;
  sku?: string | null;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  conversionFactor?: number | null;
  defaultPrice?: number | null;
  minPrice?: number | null;
  vatMode: string;
  status: string;
  trackStock: boolean;
  imageUrl?: string | null;
  product?: { name: string } | null;
  baseUnit?: Unit | null;
  sellUnit?: Unit | null;
  barcodes: Barcode[];
  availability: Availability[];
};

type BarcodeLabel = {
  variantId: string;
  productName: string;
  variantName: string;
  sku?: string | null;
  barcode?: string | null;
  price?: number | string | null;
};

type BarcodeLookupResponse = {
  variantId: string;
  code: string;
  variant?: {
    name?: string | null;
    sku?: string | null;
    defaultPrice?: number | string | null;
    product?: { name?: string | null } | null;
  } | null;
};

function BarcodeCanvas({ value, height }: { value: string; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    JsBarcode(canvasRef.current, value, {
      format: 'CODE128',
      displayValue: false,
      margin: 0,
      height,
    });
  }, [value, height]);

  return <canvas ref={canvasRef} className="w-full" />;
}

export default function VariantsPage() {
  const t = useTranslations('variantsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('catalog.write');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [message, setMessage] = useToastState();
  const [form, setForm] = useState({
    productId: '',
    name: '',
    sku: '',
    defaultPrice: '',
    minPrice: '',
    vatMode: 'INCLUSIVE',
    baseUnitId: '',
    sellUnitId: '',
    conversionFactor: '1',
  });
  const [barcodeReassign, setBarcodeReassign] = useState({
    barcodeId: '',
    variantId: '',
    reason: '',
  });
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [labelData, setLabelData] = useState<BarcodeLabel[]>([]);
  const [printMode, setPrintMode] = useState<'A4' | 'THERMAL'>('A4');
  const [scanActive, setScanActive] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanLookup, setScanLookup] = useState<BarcodeLabel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const [total, setTotal] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [barcodeAction, setBarcodeAction] = useState<{ variantId: string; type: 'generate' } | null>(
    null,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<BrowserMultiFormatReader | null>(null);
  const resetScanner = (reader: BrowserMultiFormatReader | null) => {
    if (!reader) {
      return;
    }
    const scanner = reader as unknown as {
      reset?: () => void;
      stopContinuousDecode?: () => void;
      stopStreams?: () => void;
    };
    scanner.reset?.();
    scanner.stopContinuousDecode?.();
    scanner.stopStreams?.();
  };
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    branchId: '',
    availability: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'ACTIVE', label: common('statusActive') },
      { value: 'INACTIVE', label: common('statusInactive') },
      { value: 'ARCHIVED', label: common('statusArchived') },
    ],
    [common],
  );

  const availabilityOptions = useMemo(
    () => [
      { value: '', label: common('all') },
      { value: 'ACTIVE', label: common('available') },
      { value: 'INACTIVE', label: common('unavailable') },
    ],
    [common],
  );

  const branchOptions = useMemo(
    () => [
      { value: '', label: common('allBranches') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, common],
  );

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

  const load = async (targetPage = 1, nextPageSize?: number) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsLoading(true);
    const effectivePageSize = nextPageSize ?? pageSize;
    const cursor =
      targetPage === 1 ? null : pageCursors[targetPage] ?? null;
    const query = buildCursorQuery({
      limit: effectivePageSize,
      cursor: cursor ?? undefined,
      search: filters.search || undefined,
      status: filters.status || undefined,
      branchId: filters.branchId || undefined,
      availability: filters.availability || undefined,
      includeTotal: targetPage === 1 ? '1' : undefined,
    });
    const [items, prod, br, unitList] = await Promise.all([
      apiFetch<PaginatedResponse<Variant> | Variant[]>(`/variants${query}`, {
        token,
      }),
      apiFetch<PaginatedResponse<Product> | Product[]>('/products?limit=200', {
        token,
      }),
      apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
        token,
      }),
      loadUnits(token),
    ]);
    const variantResult = normalizePaginated(items);
    const productResult = normalizePaginated(prod);
    const branchResult = normalizePaginated(br);
    setVariants(variantResult.items);
    setProducts(productResult.items);
    setBranches(branchResult.items);
    setUnits(unitList);
    setNextCursor(variantResult.nextCursor);
    if (typeof variantResult.total === 'number') {
      setTotal(variantResult.total);
    }
    setPage(targetPage);
    setPageCursors((prev) => {
      const nextState: Record<number, string | null> =
        targetPage === 1 ? { 1: null } : { ...prev };
      if (variantResult.nextCursor) {
        nextState[targetPage + 1] = variantResult.nextCursor;
      }
      return nextState;
    });
    setIsLoading(false);
  };

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1).catch(() => setMessage(t('loadFailed')));
  }, [filters.search, filters.status, filters.branchId, filters.availability]);

  useEffect(() => {
    if (!units.length) {
      return;
    }
    setForm((prev) => {
      if (prev.baseUnitId) {
        return prev;
      }
      const defaultUnitId =
        units.find((unit) => unit.code === 'piece')?.id ?? units[0]?.id ?? '';
      if (!defaultUnitId) {
        return prev;
      }
      return {
        ...prev,
        baseUnitId: defaultUnitId,
        sellUnitId: prev.sellUnitId || defaultUnitId,
        conversionFactor: prev.conversionFactor || '1',
      };
    });
  }, [units]);

  useEffect(() => {
    return () => {
      resetScanner(scannerRef.current);
    };
  }, []);

  const createVariant = async () => {
    const token = getAccessToken();
    if (!token || !form.productId || !form.name) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      await apiFetch('/variants', {
        token,
        method: 'POST',
        body: JSON.stringify({
          productId: form.productId,
          name: form.name,
          sku: form.sku || undefined,
          baseUnitId: form.baseUnitId || undefined,
          sellUnitId: form.sellUnitId || undefined,
          conversionFactor: form.conversionFactor
            ? Number(form.conversionFactor)
            : undefined,
          defaultPrice: form.defaultPrice ? Number(form.defaultPrice) : undefined,
          minPrice: form.minPrice ? Number(form.minPrice) : undefined,
          vatMode: form.vatMode,
        }),
      });
      setForm({
        productId: '',
        name: '',
        sku: '',
        defaultPrice: '',
        minPrice: '',
        vatMode: 'INCLUSIVE',
        baseUnitId: form.baseUnitId,
        sellUnitId: form.sellUnitId,
        conversionFactor: '1',
      });
      await load(1);
      setMessage({ action: 'create', outcome: 'success', message: t('created') });
    } catch (err) {
      setMessage({ action: 'create', outcome: 'failure', message: t('createFailed') });
    } finally {
      setIsCreating(false);
    }
  };

  const updateVariant = async (variantId: string, data: Partial<Variant>) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    await apiFetch(`/variants/${variantId}`, {
      token,
      method: 'PUT',
      body: JSON.stringify(data),
    });
    await load(page);
  };

  const addBarcode = async (variantId: string, code: string) => {
    const token = getAccessToken();
    if (!token || !code) {
      return;
    }
    await apiFetch('/barcodes', {
      token,
      method: 'POST',
      body: JSON.stringify({ variantId, code }),
    });
    await load(page);
  };

  const generateBarcode = async (variantId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBarcodeAction({ variantId, type: 'generate' });
    await apiFetch('/barcodes/generate', {
      token,
      method: 'POST',
      body: JSON.stringify({ variantId }),
    });
    await load(page);
    setBarcodeAction(null);
  };

  const reassignBarcode = async () => {
    const token = getAccessToken();
    if (!token || !barcodeReassign.barcodeId || !barcodeReassign.variantId) {
      return;
    }
    if (!barcodeReassign.reason.trim()) {
      setMessage({ action: 'save', outcome: 'warning', message: t('barcodeReasonRequired') });
      return;
    }
    setIsReassigning(true);
    const result = await apiFetch<{ approvalRequired?: boolean }>(
      `/barcodes/${barcodeReassign.barcodeId}/reassign`,
      {
        token,
        method: 'POST',
        body: JSON.stringify({
          newVariantId: barcodeReassign.variantId,
          reason: barcodeReassign.reason,
        }),
      },
    );
    if (result?.approvalRequired) {
      setMessage({ action: 'save', outcome: 'warning', message: t('barcodeApprovalRequired') });
    } else {
      setMessage({ action: 'save', outcome: 'info', message: t('barcodeReassigned') });
    }
    setBarcodeReassign({ barcodeId: '', variantId: '', reason: '' });
    await load(page);
    setIsReassigning(false);
  };

  const reassignSku = async (
    variantId: string,
    sku: string,
    reason: string,
  ) => {
    const token = getAccessToken();
    if (!token || !sku) {
      return;
    }
    if (!reason.trim()) {
      setMessage({ action: 'save', outcome: 'warning', message: t('skuReasonRequired') });
      return;
    }
    const result = await apiFetch<{ approvalRequired?: boolean }>(
      `/variants/${variantId}/sku`,
      {
        token,
        method: 'POST',
        body: JSON.stringify({ sku, reason }),
      },
    );
    if (result?.approvalRequired) {
      setMessage({ action: 'save', outcome: 'warning', message: t('skuApprovalRequired') });
    }
    await load(page);
  };

  const updateAvailability = async (
    variantId: string,
    branchId: string,
    isActive: boolean,
  ) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    await apiFetch(`/variants/${variantId}/availability`, {
      token,
      method: 'POST',
      body: JSON.stringify({ branchId, isActive }),
    });
    await load(page);
  };

  const uploadVariantImage = async (variantId: string, file: File) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setUploadingVariantId(variantId);
    const presign = await apiFetch<{
      url: string;
      publicUrl: string;
      key: string;
    }>(`/variants/${variantId}/image/presign`, {
      token,
      method: 'POST',
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    });

    await fetch(presign.url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });

    await apiFetch(`/variants/${variantId}/image`, {
      token,
      method: 'POST',
      body: JSON.stringify({ imageUrl: presign.publicUrl }),
    });
    await load(page);
    setUploadingVariantId(null);
  };

  const toggleLabelSelection = (variantId: string) => {
    setSelectedLabels((prev) =>
      prev.includes(variantId)
        ? prev.filter((id) => id !== variantId)
        : [...prev, variantId],
    );
  };

  const buildLabels = async () => {
    const token = getAccessToken();
    if (!token || selectedLabels.length === 0) {
      setMessage({ action: 'save', outcome: 'warning', message: t('labelsSelectRequired') });
      return [] as BarcodeLabel[];
    }
    const data = await apiFetch<BarcodeLabel[]>('/barcodes/labels', {
      token,
      method: 'POST',
      body: JSON.stringify({ variantIds: selectedLabels }),
    });
    setLabelData(data);
    return data;
  };

  const printLabels = async (mode: 'A4' | 'THERMAL') => {
    setIsPrinting(true);
    const data = await buildLabels();
    if (data.length === 0) {
      setIsPrinting(false);
      return;
    }
    setPrintMode(mode);
    setTimeout(() => window.print(), 100);
    setIsPrinting(false);
  };

  const startScan = async () => {
    if (!videoRef.current) {
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    if (scannerRef.current) {
      resetScanner(scannerRef.current);
    }
    setScanMessage(null);
    setScanLookup(null);
    try {
      const reader = new BrowserMultiFormatReader();
      scannerRef.current = reader;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      const deviceId = videoDevices[0]?.deviceId;
      await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        async (result, error) => {
          if (result) {
            await lookupBarcode(result.getText());
          }
        },
      );
      setScanActive(true);
    } catch (err) {
      setScanMessage(t('scanCameraFailed'));
    }
  };

  const stopScan = () => {
    resetScanner(scannerRef.current);
    scannerRef.current = null;
    setScanActive(false);
  };

  const unitOptions = units.map((unit) => ({
    value: unit.id,
    label: buildUnitLabel(unit),
  }));
  const barcodeOptions = variants.flatMap((variant) =>
    variant.barcodes.map((barcode) => ({
      id: barcode.id,
      code: barcode.code,
      variantName: variant.name,
      productName: variant.product?.name ?? null,
      variantId: variant.id,
    })),
  );

  const lookupBarcode = useCallback(
    async (code: string) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      const normalized = code.trim();
      if (!normalized) {
        return;
      }
      setScanMessage(t('scanResult', { code: normalized }));
      setScanLookup(null);
      try {
        const data = await apiFetch<BarcodeLookupResponse>(
          `/barcodes/lookup?code=${encodeURIComponent(normalized)}`,
          { token },
        );
        setScanLookup({
          variantId: data.variantId,
          productName: data.variant?.product?.name ?? common('unknown'),
          variantName: data.variant?.name ?? common('unknown'),
          sku: data.variant?.sku ?? null,
          barcode: data.code,
          price: data.variant?.defaultPrice ?? null,
        });
      } catch {
        setScanMessage(t('scanNotFound'));
      }
    },
    [common, t],
  );

  useEffect(() => {
    return installBarcodeScanner({
      onScan: lookupBarcode,
      enabled: true,
      minLength: 6,
    });
  }, [lookupBarcode]);

  if (isLoading) {
    return <PageSkeleton title={t('title')} lines={4} blocks={3} />;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
          <p className="text-sm text-gold-300">{t('subtitle')}</p>
        </div>
        <ViewToggle
          value={viewMode}
          onChange={setViewMode}
          labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
        />
      </div>
      {message ? <StatusBanner message={message} /> : null}

      <div className="command-card p-4 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('newVariant')}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <SmartSelect
            value={form.productId}
            onChange={(value) => setForm({ ...form, productId: value })}
            options={products.map((product) => ({
              value: product.id,
              label: product.name,
            }))}
            placeholder={t('selectProduct')}
            isClearable
            className="nvi-select-container"
          />
          <input
            value={form.name}
            onChange={(event) =>
              setForm({ ...form, name: event.target.value })
            }
            placeholder={t('variantName')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.sku}
            onChange={(event) => setForm({ ...form, sku: event.target.value })}
            placeholder={t('skuOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.defaultPrice}
            onChange={(event) =>
              setForm({ ...form, defaultPrice: event.target.value })
            }
            placeholder={t('defaultPrice')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.minPrice}
            onChange={(event) =>
              setForm({ ...form, minPrice: event.target.value })
            }
            placeholder={t('minPrice')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <SmartSelect
            value={form.vatMode}
            onChange={(value) => setForm({ ...form, vatMode: value })}
            options={[
              { value: 'INCLUSIVE', label: t('vatInclusive') },
              { value: 'EXCLUSIVE', label: t('vatExclusive') },
              { value: 'EXEMPT', label: t('vatExempt') },
            ]}
            className="nvi-select-container"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs text-gold-300">
            <span className="text-gold-400">{t('baseUnit')}</span>
            <SmartSelect
              value={form.baseUnitId}
              onChange={(value) =>
                setForm((prev) => {
                  const sellUnitId = prev.sellUnitId || value;
                  const conversionFactor =
                    sellUnitId === value ? '1' : prev.conversionFactor;
                  return {
                    ...prev,
                    baseUnitId: value,
                    sellUnitId,
                    conversionFactor,
                  };
                })
              }
              options={unitOptions}
              placeholder={t('baseUnit')}
              className="nvi-select-container"
            />
          </label>
          <label className="space-y-1 text-xs text-gold-300">
            <span className="text-gold-400">{t('sellUnit')}</span>
            <SmartSelect
              value={form.sellUnitId}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  sellUnitId: value,
                  conversionFactor:
                    value === prev.baseUnitId ? '1' : prev.conversionFactor,
                }))
              }
              options={unitOptions}
              placeholder={t('sellUnit')}
              className="nvi-select-container"
            />
          </label>
          <label className="space-y-1 text-xs text-gold-300">
            <span className="text-gold-400">{t('sellToBaseFactor')}</span>
            <input
              value={form.conversionFactor}
              onChange={(event) =>
                setForm({ ...form, conversionFactor: event.target.value })
              }
              placeholder={t('sellToBaseFactor')}
              disabled={form.sellUnitId === form.baseUnitId}
              className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 disabled:opacity-70"
            />
            <p className="text-[10px] text-gold-400">{t('conversionHint')}</p>
          </label>
        </div>
        <button
          onClick={createVariant}
          disabled={!canWrite || isCreating}
          title={!canWrite ? noAccess('title') : undefined}
          className="rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:opacity-70"
        >
          <span className="inline-flex items-center gap-2">
            {isCreating ? <Spinner variant="orbit" size="xs" /> : null}
            {isCreating ? t('creating') : t('createVariant')}
          </span>
        </button>
      </div>

      <div className="command-card p-4 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">
          {t('barcodeReassignTitle')}
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          <SmartSelect
            value={barcodeReassign.barcodeId}
            onChange={(value) =>
              setBarcodeReassign({
                ...barcodeReassign,
                barcodeId: value,
              })
            }
            options={barcodeOptions.map((barcode) => ({
              value: barcode.id,
              label: `${barcode.code} · ${formatVariantLabel(
                {
                  id: barcode.variantId,
                  name: barcode.variantName,
                  productName: barcode.productName,
                },
                common('unknown'),
              )}`,
            }))}
            placeholder={t('selectBarcode')}
            isClearable
            className="nvi-select-container"
          />
          <SmartSelect
            value={barcodeReassign.variantId}
            onChange={(value) =>
              setBarcodeReassign({
                ...barcodeReassign,
                variantId: value,
              })
            }
            options={variants.map((variant) => ({
              value: variant.id,
              label: formatVariantLabel({
                id: variant.id,
                name: variant.name,
                productName: variant.product?.name ?? null,
              }),
            }))}
            placeholder={t('selectNewVariant')}
            isClearable
            className="nvi-select-container"
          />
          <input
            value={barcodeReassign.reason}
            onChange={(event) =>
              setBarcodeReassign({
                ...barcodeReassign,
                reason: event.target.value,
              })
            }
            placeholder={t('reason')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        <button
          onClick={() =>
            reassignBarcode().catch(() => setMessage(t('barcodeReassignFailed')))
          }
          disabled={!canWrite || isReassigning}
          title={!canWrite ? noAccess('title') : undefined}
          className="rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:opacity-70"
        >
          <span className="inline-flex items-center gap-2">
            {isReassigning ? <Spinner variant="dots" size="xs" /> : null}
            {isReassigning ? t('submitting') : t('submitReassignment')}
          </span>
        </button>
      </div>

      <div className="command-card p-4 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('scanTitle')}</h3>
        <p className="text-xs text-gold-300">
          {t('scanSubtitle')}
        </p>
        {scanMessage ? (
          <p className="text-xs text-gold-300">{scanMessage}</p>
        ) : null}
        {scanLookup ? (
          <div className="rounded border border-gold-700/40 bg-black/70 p-3 text-xs text-gold-100">
            <p>{t('scanProduct', { value: scanLookup.productName })}</p>
            <p>{t('scanVariant', { value: scanLookup.variantName })}</p>
            <p>{t('scanSku', { value: scanLookup.sku || '—' })}</p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => startScan()}
            className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black"
          >
            {scanActive ? t('scanRestart') : t('scanStart')}
          </button>
          {scanActive ? (
            <button
              onClick={stopScan}
              className="rounded border border-gold-700/50 px-4 py-2 text-sm text-gold-100"
            >
              {t('scanStop')}
            </button>
          ) : null}
        </div>
        <div className="overflow-hidden rounded border border-gold-700/40 bg-black/80">
          <video ref={videoRef} className="w-full" />
        </div>
      </div>

      <div className="command-card p-4 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">
          {t('labelsTitle')}
        </h3>
        <p className="text-xs text-gold-300">
          {t('labelsSubtitle')}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              printLabels('A4').catch(() => setMessage(t('labelsPrintFailed')))
            }
            disabled={isPrinting}
            className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              {isPrinting ? <Spinner variant="ring" size="xs" /> : null}
              {isPrinting ? t('preparing') : t('printA4')}
            </span>
          </button>
          <button
            onClick={() =>
              printLabels('THERMAL').catch(() => setMessage(t('labelsPrintFailed')))
            }
            disabled={isPrinting}
            className="rounded border border-gold-700/60 px-4 py-2 text-sm text-gold-100 disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              {isPrinting ? <Spinner variant="ring" size="xs" /> : null}
              {isPrinting ? t('preparing') : t('printThermal')}
            </span>
          </button>
        </div>
        {labelData.length > 0 ? (
          <div className="text-xs text-gold-300">
            {t('labelsReady', { count: labelData.length })}
          </div>
        ) : null}
      </div>

      <ListFilters
        searchValue={searchDraft}
        onSearchChange={setSearchDraft}
        onSearchSubmit={() => pushFilters({ search: searchDraft })}
        onReset={() => resetFilters()}
        isLoading={isLoading}
        showAdvanced={showAdvanced}
        onToggleAdvanced={() => setShowAdvanced((prev) => !prev)}
      >
        <SmartSelect
          value={filters.status}
          onChange={(value) => pushFilters({ status: value })}
          options={statusOptions}
          placeholder={common('status')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.branchId}
          onChange={(value) => pushFilters({ branchId: value })}
          options={branchOptions}
          placeholder={common('branch')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.availability}
          onChange={(value) => pushFilters({ availability: value })}
          options={availabilityOptions}
          placeholder={t('availability')}
          className="nvi-select-container"
        />
      </ListFilters>

      {viewMode === 'table' ? (
        <div className="command-card p-4 nvi-reveal">
          {variants.length === 0 ? (
            <StatusBanner message={t('noVariants')} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2 w-12" aria-label={t('variantImage')} />
                    <th className="px-3 py-2">{t('product')}</th>
                    <th className="px-3 py-2">{t('variantName')}</th>
                    <th className="px-3 py-2">{t('sku')}</th>
                    <th className="px-3 py-2">{t('price')}</th>
                    <th className="px-3 py-2">{t('vat')}</th>
                    <th className="px-3 py-2">{common('status')}</th>
                    <th className="px-3 py-2">{t('trackStock')}</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((variant) => (
                    <tr key={variant.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2">
                        <div className="h-8 w-8 overflow-hidden rounded border border-gold-700/40 bg-black">
                          {variant.imageUrl ? (
                            <img
                              src={variant.imageUrl}
                              alt={variant.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-gold-500">
                              —
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {variant.product?.name ?? common('unknown')}
                      </td>
                      <td className="px-3 py-2 font-semibold">{variant.name}</td>
                      <td className="px-3 py-2">{variant.sku ?? '—'}</td>
                      <td className="px-3 py-2">{variant.defaultPrice ?? '—'}</td>
                      <td className="px-3 py-2">{variant.vatMode}</td>
                      <td className="px-3 py-2">{variant.status}</td>
                      <td className="px-3 py-2">
                        {variant.trackStock ? common('yes') : common('no')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {viewMode === 'cards' ? (
      <div className="space-y-4">
        {variants.length === 0 ? (
          <StatusBanner message={t('noVariants')} />
        ) : (
          variants.map((variant) => (
          <div
            key={variant.id}
            className="command-card p-4 space-y-3 nvi-reveal"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedLabels.includes(variant.id)}
                  onChange={() => toggleLabelSelection(variant.id)}
                />
                <div>
                  <h4 className="text-lg font-semibold text-gold-100">
                    {variant.name}
                  </h4>
                  <p className="text-xs text-gold-500">
                    {variant.product?.name ?? common('unknown')}
                  </p>
                  <p className="text-xs text-gold-400">
                    {t('skuLabel', { value: variant.sku || '—' })} ·{' '}
                    {t('vatLabel', { value: variant.vatMode })}
                  </p>
                  <p className="text-xs text-gold-500">
                    {t('minPriceLabel', { value: variant.minPrice ?? '—' })}
                  </p>
                </div>
                {variant.imageUrl ? (
                  <img
                    src={variant.imageUrl}
                    alt={variant.name}
                    className="h-10 w-10 rounded border border-gold-700/40 object-cover"
                  />
                ) : null}
              </div>
              <label className="text-xs text-gold-300">
                {t('variantImage')}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="mt-2 block text-xs text-gold-100"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      uploadVariantImage(variant.id, file).catch(() =>
                        setMessage(t('variantImageFailed')),
                      );
                    }
                  }}
                  disabled={!canWrite}
                />
              </label>
              {uploadingVariantId === variant.id ? (
                <p className="text-xs text-gold-400">
                  <span className="inline-flex items-center gap-2">
                    <Spinner variant="dots" size="xs" />
                    {t('uploadingImage')}
                  </span>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-gold-200">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={variant.trackStock}
                  onChange={(event) =>
                    updateVariant(variant.id, {
                      trackStock: event.target.checked,
                    }).catch(() => setMessage(t('updateFailed')))
                  }
                />
                {t('trackStock')}
              </label>
              <label className="flex items-center gap-2">
                {t('status')}
                <SmartSelect
                  value={variant.status}
                  onChange={(value) =>
                    updateVariant(variant.id, {
                      status: value as Variant['status'],
                    }).catch(() => setMessage(t('updateFailed')))
                  }
                  options={[
                    { value: 'ACTIVE', label: t('statusActive') },
                    { value: 'INACTIVE', label: t('statusInactive') },
                    { value: 'ARCHIVED', label: t('statusArchived') },
                  ]}
                  className="nvi-select-container"
                />
              </label>
            </div>
            <div className="grid gap-3 text-xs text-gold-200 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-gold-400">{t('baseUnit')}</span>
                <SmartSelect
                  value={variant.baseUnitId ?? ''}
                  onChange={(value) =>
                    updateVariant(variant.id, {
                      baseUnitId: value,
                      sellUnitId:
                        variant.sellUnitId && variant.sellUnitId !== value
                          ? variant.sellUnitId
                          : value,
                      conversionFactor:
                        variant.sellUnitId === value ? 1 : variant.conversionFactor ?? 1,
                    }).catch(() => setMessage(t('updateFailed')))
                  }
                  options={unitOptions}
                  placeholder={t('baseUnit')}
                  className="nvi-select-container"
                />
              </label>
              <label className="space-y-1">
                <span className="text-gold-400">{t('sellUnit')}</span>
                <SmartSelect
                  value={variant.sellUnitId ?? variant.baseUnitId ?? ''}
                  onChange={(value) =>
                    updateVariant(variant.id, {
                      sellUnitId: value,
                      conversionFactor:
                        value === variant.baseUnitId ? 1 : variant.conversionFactor ?? 1,
                    }).catch(() => setMessage(t('updateFailed')))
                  }
                  options={unitOptions}
                  placeholder={t('sellUnit')}
                  className="nvi-select-container"
                />
              </label>
              <label className="space-y-1">
                <span className="text-gold-400">{t('sellToBaseFactor')}</span>
                <input
                  value={variant.conversionFactor ?? 1}
                  onChange={(event) =>
                    updateVariant(variant.id, {
                      conversionFactor: Number(event.target.value || 1),
                    }).catch(() => setMessage(t('updateFailed')))
                  }
                  disabled={(variant.sellUnitId ?? variant.baseUnitId) === variant.baseUnitId}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100 disabled:opacity-70"
                />
                <p className="text-[10px] text-gold-400">{t('conversionHint')}</p>
              </label>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gold-300">{t('barcodes')}</p>
              <div className="flex flex-wrap gap-2">
                {variant.barcodes.map((barcode) => (
                  <span
                    key={barcode.id}
                    className={`rounded border px-2 py-1 text-xs ${
                      barcode.isActive
                        ? 'border-gold-600/60 text-gold-100'
                        : 'border-gold-900/60 text-gold-500'
                    }`}
                  >
                    {barcode.code}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  placeholder={t('addBarcode')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-1 text-xs text-gold-100"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      addBarcode(variant.id, event.currentTarget.value).catch(
                        () => setMessage(t('addBarcodeFailed')),
                      );
                      event.currentTarget.value = '';
                    }
                  }}
                  disabled={!canWrite}
                />
                <button
                  onClick={() => generateBarcode(variant.id)}
                  disabled={!canWrite || barcodeAction?.variantId === variant.id}
                  title={!canWrite ? noAccess('title') : undefined}
                  className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:opacity-70"
                >
                  <span className="inline-flex items-center gap-2">
                    {barcodeAction?.variantId === variant.id ? (
                      <Spinner variant="pulse" size="xs" />
                    ) : null}
                    {barcodeAction?.variantId === variant.id
                      ? t('generating')
                      : t('generate')}
                  </span>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gold-300">{t('skuReassignTitle')}</p>
              <div className="flex flex-wrap gap-2">
                <input
                  placeholder={t('newSku')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-1 text-xs text-gold-100"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      const sku = event.currentTarget.value.trim();
                      if (!sku) {
                        return;
                      }
                      promptAction({
                        message: t('skuReassignPrompt'),
                        placeholder: t('requiredPlaceholder'),
                      }).then((reason) => {
                        if (!reason) {
                          setMessage({ action: 'save', outcome: 'warning', message: t('skuReasonRequired') });
                          return;
                        }
                        reassignSku(variant.id, sku, reason).catch(() =>
                          setMessage(t('skuReassignFailed')),
                        );
                      });
                      event.currentTarget.value = '';
                    }
                  }}
                  disabled={!canWrite}
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gold-300">{t('branchAvailability')}</p>
              <div className="flex flex-wrap gap-3 text-xs text-gold-200">
                {branches.map((branch) => {
                  const current =
                    variant.availability.find(
                      (item) => item.branchId === branch.id,
                    )?.isActive ?? true;
                  return (
                    <label key={branch.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={current}
                        onChange={(event) =>
                          updateAvailability(
                            variant.id,
                            branch.id,
                            event.target.checked,
                          ).catch(() => setMessage(t('availabilityFailed')))
                        }
                        disabled={!canWrite}
                      />
                      {branch.name}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          ))
        )}
      </div>
      ) : null}
      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        itemCount={variants.length}
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

      <div
        id="print-area"
        data-print-mode={printMode}
        className="hidden print:block"
      >
        <div className="label-grid grid gap-4">
          {labelData.map((label) => (
            <div
              key={label.variantId}
              className="label-card rounded border border-neutral-200 bg-white p-3 text-black"
            >
              <div className="text-xs font-semibold">
                {label.productName}
              </div>
              <div className="text-xs">{label.variantName}</div>
              {label.barcode ? (
                <BarcodeCanvas value={label.barcode} height={60} />
              ) : (
                <div className="text-xs text-neutral-500">{t('noBarcode')}</div>
              )}
              <div className="flex justify-between text-xs">
                <span>{label.sku || '—'}</span>
                <span>
                  {label.price !== null && label.price !== undefined
                    ? label.price
                    : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area,
          #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            padding: 16px;
          }
          #print-area[data-print-mode='A4'] .label-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          #print-area[data-print-mode='THERMAL'] .label-grid {
            grid-template-columns: 1fr;
          }
          #print-area[data-print-mode='THERMAL'] .label-card {
            width: 260px;
          }
        }
      `}</style>
    </section>
  );
}
