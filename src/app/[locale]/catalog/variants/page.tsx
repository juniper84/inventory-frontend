'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { promptAction, useToastState } from '@/lib/app-notifications';
import JsBarcode from 'jsbarcode';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { PaginationControls } from '@/components/PaginationControls';
import { CurrencyInput } from '@/components/CurrencyInput';
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

import { useBranchScope } from '@/lib/use-branch-scope';
import { Banner } from '@/components/notifications/Banner';
import { Checkbox } from '@/components/Checkbox';
import { PageHeader, Card, Icon, TextInput, EmptyState, ListPage, StatusBadge, ActionButtons, SortableTableHeader, SortDirection } from '@/components/ui';
import { VariantCreateModal } from '@/components/catalog/VariantCreateModal';
import { VariantEditModal } from '@/components/catalog/VariantEditModal';

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
  defaultCost?: number | null;
  minPrice?: number | null;
  vatMode: string;
  status: string;
  trackStock: boolean;
  imageUrl?: string | null;
  product?: { name: string } | null;
  baseUnit?: Unit | null;
  sellUnit?: Unit | null;
  totalStock?: number;
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
type ScanMode = 'lookup' | 'assignExisting' | 'assignNew';

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
    barcode: '',
    defaultPrice: '',
    minPrice: '',
    defaultCost: '',
    vatMode: 'INCLUSIVE',
    baseUnitId: '',
    sellUnitId: '',
    conversionFactor: '1',
    trackStock: true,
  });
  const [newVariantBranchIds, setNewVariantBranchIds] = useState<string[]>([]);
  const [barcodeReassign, setBarcodeReassign] = useState({
    barcodeId: '',
    variantId: '',
    reason: '',
  });
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [labelData, setLabelData] = useState<BarcodeLabel[]>([]);
  const [printMode, setPrintMode] = useState<'A4' | 'THERMAL'>('A4');
  const [scanActive, setScanActive] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('lookup');
  const [scanTargetVariantId, setScanTargetVariantId] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanLookup, setScanLookup] = useState<BarcodeLabel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [formOpen, setFormOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [expandedBarcodes, setExpandedBarcodes] = useState<Set<string>>(new Set());
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const toggleBarcodes = useCallback((id: string) => {
    setExpandedBarcodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const toggleBranches = useCallback((id: string) => {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
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
  const scanResultRef = useRef<HTMLDivElement | null>(null);
  const scanMessageTimer = useRef<number | null>(null);
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

  const setTimedScanMessage = useCallback((message: string | null) => {
    if (scanMessageTimer.current) {
      window.clearTimeout(scanMessageTimer.current);
      scanMessageTimer.current = null;
    }
    setScanMessage(message);
    if (message) {
      scanMessageTimer.current = window.setTimeout(() => {
        setScanMessage(null);
        scanMessageTimer.current = null;
      }, 2000);
    }
  }, []);
  const loadProductOptions = useCallback(async (inputValue: string) => {
    const token = getAccessToken();
    if (!token) return [];
    try {
      const data = await apiFetch<PaginatedResponse<Product> | Product[]>(
        `/products?search=${encodeURIComponent(inputValue)}&limit=25`,
        { token },
      );
      return normalizePaginated(data).items.map((p) => ({ value: p.id, label: p.name }));
    } catch {
      return [];
    }
  }, []);
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    branchId: '',
    availability: '',
  });
  const { activeBranch } = useBranchScope();
  const [searchDraft, setSearchDraft] = useState(filters.search);


  const handleSort = (key: string, dir: SortDirection) => {
    setSortKey(dir ? key : null);
    setSortDir(dir);
  };

  const sortedVariants = useMemo(() => {
    if (!sortKey || !sortDir) return variants;
    return [...variants].sort((a, b) => {
      const va = (a as Record<string, unknown>)[sortKey] ?? '';
      const vb = (b as Record<string, unknown>)[sortKey] ?? '';
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb), undefined, { numeric: true })
        : String(vb).localeCompare(String(va), undefined, { numeric: true });
    });
  }, [variants, sortKey, sortDir]);

  const vatModeLabels = useMemo<Record<string, string>>(
    () => ({
      INCLUSIVE: common('vatModeInclusive'),
      EXCLUSIVE: common('vatModeExclusive'),
      EXEMPT: common('vatModeExempt'),
    }),
    [common],
  );

  const variantStatusLabels = useMemo<Record<string, string>>(
    () => ({
      ACTIVE: common('statusActive'),
      INACTIVE: common('statusInactive'),
      ARCHIVED: common('statusArchived'),
    }),
    [common],
  );

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
  const activeVariants = useMemo(
    () => variants.filter((variant) => variant.status === 'ACTIVE').length,
    [variants],
  );
  const barcodeCoverage = useMemo(
    () => variants.filter((variant) => variant.barcodes.some((barcode) => barcode.isActive)).length,
    [variants],
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



  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const [prod, br, unitList] = await Promise.all([
        apiFetch<PaginatedResponse<Product> | Product[]>('/products?limit=50', { token }),
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', { token }),
        loadUnits(token),
      ]);
      setProducts(normalizePaginated(prod).items);
      const loadedBranches = normalizePaginated(br).items;
      setBranches(loadedBranches);
      setNewVariantBranchIds((prev) =>
        prev.length === 0 ? loadedBranches.map((b) => b.id) : prev,
      );
      setUnits(unitList ?? []);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    }
  }, [setMessage, t]);

  const load = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsLoading(true);
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor =
        targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
        branchId: filters.branchId || undefined,
        availability: filters.availability || undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const items = await apiFetch<PaginatedResponse<Variant> | Variant[]>(
        `/variants${query}`,
        { token },
      );
      const variantResult = normalizePaginated(items);
      setVariants(variantResult.items);
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
    } catch (err) {
      setMessage({ action: 'load', outcome: 'failure', message: getApiErrorMessage(err, t('loadFailed')) });
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, filters.search, filters.status, filters.branchId, filters.availability, t]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [load]);

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
      const created = await apiFetch<{ id: string }>('/variants', {
        token,
        method: 'POST',
        body: JSON.stringify({
          productId: form.productId,
          name: form.name,
          sku: form.sku || undefined,
          barcode: undefined,
          baseUnitId: form.baseUnitId || undefined,
          sellUnitId: form.sellUnitId || undefined,
          conversionFactor: form.conversionFactor
            ? Number(form.conversionFactor)
            : undefined,
          defaultPrice: form.defaultPrice ? Number(form.defaultPrice) : undefined,
          minPrice: form.minPrice ? Number(form.minPrice) : undefined,
          defaultCost: form.defaultCost ? Number(form.defaultCost) : undefined,
          vatMode: form.vatMode,
          trackStock: form.trackStock,
        }),
      });
      const trimmedBarcode = form.barcode.trim();
      if (trimmedBarcode) {
        try {
          await addBarcode(created.id, trimmedBarcode);
        } catch (err) {
          setMessage({
            action: 'save',
            outcome: 'warning',
            message: getApiErrorMessage(err, t('addBarcodeFailed')),
          });
        }
      }
      const disabledBranchIds = branches
        .map((b) => b.id)
        .filter((id) => !newVariantBranchIds.includes(id));
      if (disabledBranchIds.length > 0) {
        await Promise.all(
          disabledBranchIds.map((branchId) =>
            apiFetch(`/variants/${created.id}/availability`, {
              token,
              method: 'POST',
              body: JSON.stringify({ branchId, isActive: false }),
            }),
          ),
        );
      }
      setForm({
        productId: '',
        name: '',
        sku: '',
        barcode: '',
        defaultPrice: '',
        minPrice: '',
        defaultCost: '',
        vatMode: 'INCLUSIVE',
        baseUnitId: form.baseUnitId,
        sellUnitId: form.sellUnitId,
        conversionFactor: '1',
        trackStock: true,
      });
      setNewVariantBranchIds(branches.map((b) => b.id));
      setFormOpen(false);
      await load(1);
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
    try {
      const presign = await apiFetch<{
        url: string;
        publicUrl: string;
        key: string;
      }>(`/variants/${variantId}/image/presign`, {
        token,
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });

      const uploadResponse = await fetch(presign.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error(t('variantImageFailed'));
      }

      await apiFetch(`/variants/${variantId}/image`, {
        token,
        method: 'POST',
        body: JSON.stringify({ imageUrl: presign.publicUrl }),
      });
      await load(page);
    } catch (err) {
      setMessage({ action: 'save', outcome: 'failure', message: getApiErrorMessage(err, t('uploadFailed')) });
    } finally {
      setUploadingVariantId(null);
    }
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

  const startScan = async (mode: ScanMode = 'lookup', targetVariantId?: string) => {
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
    setScanMode(mode);
    setScanTargetVariantId(targetVariantId ?? null);
    setScanMessage(null);
    setScanLookup(null);
    try {
      const reader = new BrowserMultiFormatReader();
      scannerRef.current = reader;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      const rearCamera = videoDevices.find((d) => /back|rear|environment/i.test(d.label));
      const deviceId = (rearCamera ?? videoDevices[0])?.deviceId;
      let handled = false;
      await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        async (result, error) => {
          if (result) {
            if (handled) {
              return;
            }
            handled = true;
            const normalized = result.getText().trim();
            if (!normalized) {
              handled = false;
              return;
            }
            await handleScannedCode(normalized, mode, targetVariantId);
            stopScan();
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
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setScanActive(false);
  };

  // Cleanup camera on unmount or navigation
  useEffect(() => {
    return () => {
      resetScanner(scannerRef.current);
      scannerRef.current = null;
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

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
  const scanTargetVariant =
    scanTargetVariantId ? variants.find((variant) => variant.id === scanTargetVariantId) : null;
  const scanTargetLabel = scanTargetVariant
    ? formatVariantLabel(
        {
          id: scanTargetVariant.id,
          name: scanTargetVariant.name,
          productName: scanTargetVariant.product?.name ?? null,
        },
        common('unknown'),
      )
    : common('unknown');

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
      setTimedScanMessage(t('scanResult', { code: normalized }));
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
        setMessage({
          action: 'save',
          outcome: 'success',
          message: t('scanResult', { code: normalized }),
        });
      } catch (err) {
        const errorMessage = getApiErrorMessage(err, t('scanNotFound'));
        setTimedScanMessage(errorMessage);
        setMessage({ action: 'save', outcome: 'warning', message: errorMessage });
      }
    },
    [common, setMessage, setTimedScanMessage, t],
  );

  const handleScannedCode = useCallback(
    async (code: string, mode: ScanMode, targetVariantId?: string | null) => {
      const normalized = code.trim();
      if (!normalized) {
        return;
      }
      if (mode === 'lookup') {
        await lookupBarcode(normalized);
        return;
      }
      if (mode === 'assignExisting') {
        if (!targetVariantId) {
          setTimedScanMessage(t('scanAssignFailed'));
          return;
        }
        setTimedScanMessage(t('scanAssigning', { code: normalized }));
        try {
          await addBarcode(targetVariantId, normalized);
          setMessage({
            action: 'save',
            outcome: 'success',
            message: t('scanAssignSuccess', { code: normalized }),
          });
          setTimedScanMessage(t('scanAssignSuccess', { code: normalized }));
        } catch (err) {
          setTimedScanMessage(getApiErrorMessage(err, t('scanAssignFailed')));
        }
        setScanMode('lookup');
        setScanTargetVariantId(null);
        return;
      }
      setForm((prev) => ({ ...prev, barcode: normalized }));
      setMessage({
        action: 'save',
        outcome: 'success',
        message: t('scanAssignNewSuccess', { code: normalized }),
      });
      setTimedScanMessage(t('scanAssignNewSuccess', { code: normalized }));
      setScanMode('lookup');
      setScanTargetVariantId(null);
    },
    [
      addBarcode,
      lookupBarcode,
      setForm,
      setMessage,
      setScanMode,
      setScanTargetVariantId,
      setTimedScanMessage,
      t,
    ],
  );

  useEffect(() => {
    return installBarcodeScanner({
      onScan: (code) => handleScannedCode(code, scanMode, scanTargetVariantId),
      enabled: true,
      minLength: 6,
    });
  }, [handleScannedCode, scanMode, scanTargetVariantId]);

  useEffect(() => {
    if (!scanLookup || !scanResultRef.current) {
      return;
    }
    scanResultRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scanLookup]);

  useEffect(() => {
    return () => {
      if (scanMessageTimer.current) {
        window.clearTimeout(scanMessageTimer.current);
      }
    };
  }, []);

  return (
    <>
      <ListPage
        title={t('title')}
        subtitle={t('subtitle')}
        eyebrow={t('eyebrow')}
        badges={
          <>
            <span className="status-chip">{t('badgeBarcodeReady')}</span>
            <span className="status-chip">{t('badgeMultiBranch')}</span>
          </>
        }
        headerActions={
          <div className="flex flex-wrap items-center gap-2">
            {canWrite ? (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="nvi-cta nvi-press inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-black"
              >
                <Icon name="Plus" size={14} />
                {t('createVariant')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setReassignOpen(true)}
              className="nvi-press inline-flex items-center gap-1.5 rounded-lg border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-gold-200 hover:border-gold-500 transition-colors"
            >
              <Icon name="ArrowRightLeft" size={14} className="text-amber-400" />
              {t('barcodeReassignTitle')}
            </button>
            <button
              type="button"
              onClick={() => { setScanMode('lookup'); setScanTargetVariantId(null); setScannerOpen(true); }}
              className="nvi-press inline-flex items-center gap-1.5 rounded-lg border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-gold-200 hover:border-gold-500 transition-colors"
            >
              <Icon name="ScanBarcode" size={14} className="text-purple-400" />
              {t('scanTitle')}
            </button>
            {selectedLabels.length > 0 && (
              <button
                type="button"
                onClick={() => setPrintOpen(true)}
                className="nvi-press inline-flex items-center gap-1.5 rounded-lg border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-gold-200 hover:border-gold-500 transition-colors"
              >
                <Icon name="Printer" size={14} className="text-blue-400" />
                {t('labelsTitle')}
                <span className="ml-1 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">{selectedLabels.length}</span>
              </button>
            )}
            <ViewToggle
              value={viewMode}
              onChange={setViewMode}
              labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
            />
          </div>
        }
        isLoading={isLoading}
        banner={message ? <Banner message={message} /> : null}
        kpis={
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
            {(
              [
                { icon: 'Layers' as const,      tone: 'blue' as const,    label: t('kpiVariants'),    value: total ?? variants.length },
                { icon: 'CircleCheck' as const, tone: 'emerald' as const, label: t('kpiActive'),      value: activeVariants },
                { icon: 'ScanBarcode' as const, tone: 'purple' as const,  label: t('kpiWithBarcode'), value: barcodeCoverage },
                { icon: 'Building2' as const,   tone: 'amber' as const,   label: t('kpiBranches'),    value: branches.length },
              ]
            ).map((k) => (
              <Card key={k.label} padding="md" as="article">
                <div className="flex items-center gap-3">
                  <div className={`nvi-kpi-icon nvi-kpi-icon--${k.tone}`}>
                    <Icon name={k.icon} size={18} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{k.label}</p>
                    <p className="text-2xl font-bold text-[var(--nvi-text)]">{k.value}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        }
        filters={
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
              instanceId="variants-filter-status"
              value={filters.status}
              onChange={(value) => pushFilters({ status: value })}
              options={statusOptions}
              placeholder={common('status')}
              className="nvi-select-container"
            />
            <SmartSelect
              instanceId="variants-filter-branch"
              value={filters.branchId}
              onChange={(value) => pushFilters({ branchId: value })}
              options={branchOptions}
              placeholder={common('branch')}
              className="nvi-select-container"
            />
            <SmartSelect
              instanceId="variants-filter-availability"
              value={filters.availability}
              onChange={(value) => pushFilters({ availability: value })}
              options={availabilityOptions}
              placeholder={t('availability')}
              className="nvi-select-container"
            />
          </ListFilters>
        }
        viewMode={viewMode}
        isEmpty={!sortedVariants.length}
        emptyIcon={<div className="nvi-float"><Icon name="Layers" size={32} className="text-gold-500/40" /></div>}
        emptyTitle={t('noVariants')}
        table={
          <Card padding="md">
            <div className="overflow-auto">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2 w-12" aria-label={t('variantImage')} />
                    <SortableTableHeader label={t('product')} sortKey="product" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
                    <SortableTableHeader label={t('variantName')} sortKey="name" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
                    <SortableTableHeader label={t('sku')} sortKey="sku" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
                    <th className="px-3 py-2">{t('barcode')}</th>
                    <SortableTableHeader label={t('price')} sortKey="defaultPrice" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} className="text-right" />
                    <SortableTableHeader label={t('defaultCost')} sortKey="defaultCost" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} className="text-right" />
                    <th className="px-3 py-2 text-right">{t('margin')}</th>
                    <th className="px-3 py-2">{t('vat')}</th>
                    <th className="px-3 py-2">{t('baseUnit')}</th>
                    <SortableTableHeader label={common('status')} sortKey="status" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
                    <th className="px-3 py-2">{t('trackStock')}</th>
                    <SortableTableHeader label={t('stockLevel')} sortKey="totalStock" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} className="text-right" />
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sortedVariants.map((variant) => (
                    <tr key={variant.id} className="border-t border-[var(--nvi-border)]">
                      <td className="px-3 py-2">
                        <div className="nvi-img-zoom h-8 w-8 overflow-hidden rounded-lg border border-[var(--nvi-border)] bg-black">
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
                      <td className="px-3 py-2 font-mono text-xs">{variant.barcodes?.[0]?.code ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-400">{variant.defaultPrice != null ? Number(variant.defaultPrice).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gold-300">{variant.defaultCost != null ? Number(variant.defaultCost).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {variant.defaultPrice != null && variant.defaultCost != null && Number(variant.defaultPrice) > 0
                          ? (
                            <span className={
                              ((Number(variant.defaultPrice) - Number(variant.defaultCost)) / Number(variant.defaultPrice)) * 100 < 0
                                ? 'text-red-400'
                                : 'text-emerald-400'
                            }>
                              {Math.round(((Number(variant.defaultPrice) - Number(variant.defaultCost)) / Number(variant.defaultPrice)) * 100)}%
                            </span>
                          )
                          : '—'}
                      </td>
                      <td className="px-3 py-2">{vatModeLabels[variant.vatMode] ?? variant.vatMode}</td>
                      <td className="px-3 py-2">{variant.baseUnit?.label ?? variant.baseUnit?.code ?? '—'}</td>
                      <td className="px-3 py-2"><StatusBadge status={variant.status} size="xs" /></td>
                      <td className="px-3 py-2">
                        {variant.trackStock ? common('yes') : common('no')}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={Number(variant.totalStock ?? 0) <= 5 ? 'text-red-400' : ''}>
                          {variant.totalStock ?? 0}
                        </span>
                        {Number(variant.totalStock ?? 0) <= 5 && variant.trackStock ? (
                          <span className="ml-1 inline-flex" title={t('lowStockWarning')}>
                            <Icon name="TriangleAlert" size={12} className="text-red-400" />
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <ActionButtons
                          actions={[
                            {
                              key: 'edit',
                              icon: <Icon name="Pencil" size={14} className="text-blue-400" />,
                              label: actions('edit'),
                              onClick: () => setEditingVariant(variant),
                              disabled: !canWrite,
                            },
                          ]}
                          size="xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        }
        cards={
          <div className="grid gap-4 md:grid-cols-2 nvi-stagger">
            {sortedVariants.map((variant) => {
              const barcodesExpanded = expandedBarcodes.has(variant.id);
              const branchesExpanded = expandedBranches.has(variant.id);
              const margin =
                variant.defaultPrice != null &&
                variant.defaultCost != null &&
                variant.defaultPrice > 0
                  ? (((variant.defaultPrice - variant.defaultCost) / variant.defaultPrice) * 100).toFixed(1)
                  : null;
              const activeBarcodeCount = variant.barcodes.filter((b) => b.isActive).length;
              const activeBranchCount = variant.availability.filter((a) => a.isActive).length;
              return (
                <Card key={variant.id} padding="md" className="space-y-2 nvi-card-hover overflow-hidden">
                  {/* -- Compact header -- */}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedLabels.includes(variant.id)}
                      onChange={() => toggleLabelSelection(variant.id)}
                    />
                    {variant.imageUrl ? (
                      <div className="nvi-img-zoom shrink-0">
                        <img
                          src={variant.imageUrl}
                          alt={variant.name}
                          className="h-10 w-10 shrink-0 rounded-lg border border-[var(--nvi-border)] object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold-800/40 bg-gold-950/30 text-gold-700">
                        <Icon name="Package" size={16} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-sm font-semibold text-gold-100">
                          {variant.name}
                        </h4>
                        <StatusBadge status={variant.status} size="xs" />
                      </div>
                      <p className="truncate text-xs text-gold-500">
                        {variant.product?.name ?? common('unknown')}
                        {variant.sku ? <span className="ml-2 text-gold-600">SKU: {variant.sku}</span> : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <p className="text-lg font-bold text-emerald-400">
                        {variant.defaultPrice != null
                          ? Number(variant.defaultPrice).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                          : '—'}
                      </p>
                      {margin !== null ? (
                        <span className={`text-xs font-medium ${Number(margin) < 0 ? 'text-red-400' : 'text-emerald-400/70'}`}>
                          {Number(margin) > 0 ? '+' : ''}{margin}% {t('margin').toLowerCase()}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* -- Compact info row -- */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {variant.defaultCost != null ? (
                      <span className="text-gold-400">
                        {t('defaultCost')}: {Number(variant.defaultCost).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </span>
                    ) : null}
                    <span className="text-gold-600">{vatModeLabels[variant.vatMode] ?? variant.vatMode}</span>
                    <span className={`inline-flex items-center gap-1 ${Number(variant.totalStock ?? 0) <= 5 && variant.trackStock ? 'text-red-400 font-semibold' : 'text-gold-400'}`}>
                      {Number(variant.totalStock ?? 0) <= 5 && variant.trackStock ? (
                        <Icon name="TriangleAlert" size={11} className="text-red-400" />
                      ) : null}
                      {t('stockLevel')}: {variant.totalStock ?? 0}
                    </span>
                  </div>

                  {/* -- Compact pill row with expandable sections -- */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-gold-800/40 pt-2">
                    <button
                      type="button"
                      onClick={() => toggleBarcodes(variant.id)}
                      className={`nvi-press inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${barcodesExpanded ? 'border-purple-500/40 bg-purple-500/10 text-purple-300' : 'border-gold-800/40 text-gold-400 hover:border-gold-600'}`}
                    >
                      <Icon name="ScanBarcode" size={11} />
                      {activeBarcodeCount} {t('barcodes').toLowerCase()}
                      <Icon name="ChevronDown" size={10} className={barcodesExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    </button>
                    {branches.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => toggleBranches(variant.id)}
                        className={`nvi-press inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${branchesExpanded ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-gold-800/40 text-gold-400 hover:border-gold-600'}`}
                      >
                        <Icon name="Building2" size={11} />
                        {activeBranchCount} / {branches.length}
                        <Icon name="ChevronDown" size={10} className={branchesExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
                      </button>
                    ) : null}
                    <SmartSelect
                      instanceId={`variant-status-${variant.id}`}
                      value={variant.status}
                      onChange={(value) =>
                        updateVariant(variant.id, {
                          status: value as Variant['status'],
                        }).catch((err) =>
                          setMessage({ action: 'update', outcome: 'failure', message: getApiErrorMessage(err, t('updateFailed')) }),
                        )
                      }
                      options={[
                        { value: 'ACTIVE', label: t('statusActive') },
                        { value: 'INACTIVE', label: t('statusInactive') },
                        { value: 'ARCHIVED', label: t('statusArchived') },
                      ]}
                      className="nvi-select-container w-28"
                    />
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-gold-400 ml-auto">
                      <Checkbox
                        checked={variant.trackStock}
                        onChange={(checked) =>
                          updateVariant(variant.id, {
                            trackStock: checked,
                          }).catch((err) =>
                            setMessage({ action: 'update', outcome: 'failure', message: getApiErrorMessage(err, t('updateFailed')) }),
                          )
                        }
                      />
                      {t('trackStock')}
                    </label>
                  </div>

                  {/* -- Expandable: Barcodes -- */}
                  {barcodesExpanded ? (
                    <div className="space-y-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-2.5">
                      {variant.barcodes.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {variant.barcodes.map((barcode) => (
                            <span
                              key={barcode.id}
                              className={`rounded-lg border px-2 py-0.5 font-mono text-[11px] ${
                                barcode.isActive
                                  ? 'border-purple-500/30 text-gold-100'
                                  : 'border-gold-900/40 text-gold-600 line-through'
                              }`}
                            >
                              {barcode.code}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-1.5">
                        <input
                          placeholder={t('addBarcode')}
                          className="rounded-lg border border-[var(--nvi-border)] bg-black px-2.5 py-1 text-[11px] text-gold-100"
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              addBarcode(variant.id, event.currentTarget.value).catch(
                                (err) =>
                                  setMessage(
                                    getApiErrorMessage(err, t('addBarcodeFailed')),
                                  ),
                              );
                              event.currentTarget.value = '';
                            }
                          }}
                          disabled={!canWrite}
                        />
                        <button
                          type="button"
                          onClick={() => { setScanMode('assignExisting'); setScanTargetVariantId(variant.id); setScannerOpen(true); }}
                          disabled={!canWrite}
                          title={!canWrite ? noAccess('title') : undefined}
                          className="nvi-press rounded-lg border border-[var(--nvi-border)] px-2 py-1 text-[11px] text-gold-200 disabled:opacity-70"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Icon name="Scan" size={10} className="text-purple-400" />
                            {t('scanAssign')}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => generateBarcode(variant.id)}
                          disabled={!canWrite || barcodeAction?.variantId === variant.id}
                          title={!canWrite ? noAccess('title') : undefined}
                          className="nvi-press rounded-lg border border-[var(--nvi-border)] px-2 py-1 text-[11px] text-gold-200 disabled:opacity-70"
                        >
                          <span className="inline-flex items-center gap-1">
                            {barcodeAction?.variantId === variant.id ? (
                              <Spinner variant="pulse" size="xs" />
                            ) : (
                              <Icon name="Sparkles" size={10} className="text-amber-400" />
                            )}
                            {barcodeAction?.variantId === variant.id
                              ? t('generating')
                              : t('generate')}
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* -- Expandable: Branches -- */}
                  {branchesExpanded && branches.length > 1 ? (
                    <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
                      <div className="flex flex-wrap gap-2.5 text-[11px] text-gold-200">
                        {branches.map((branch) => {
                          const current =
                            variant.availability.find(
                              (item) => item.branchId === branch.id,
                            )?.isActive ?? true;
                          return (
                            <label key={branch.id} className="flex items-center gap-1.5">
                              <Checkbox
                                checked={current}
                                onChange={(checked) =>
                                  updateAvailability(
                                    variant.id,
                                    branch.id,
                                    checked,
                                  ).catch((err) =>
                                    setMessage(
                                      getApiErrorMessage(err, t('availabilityFailed')),
                                    ),
                                  )
                                }
                                disabled={!canWrite}
                              />
                              {branch.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {/* -- Edit action (opens VariantEditModal) -- */}
                  <div className="flex items-center justify-end border-t border-gold-800/40 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingVariant(variant)}
                      disabled={!canWrite}
                      title={!canWrite ? noAccess('title') : undefined}
                      className="nvi-press inline-flex items-center gap-1.5 rounded-lg border border-[var(--nvi-border)] px-3 py-1 text-[11px] text-gold-200 hover:border-gold-500 transition-colors disabled:opacity-70"
                    >
                      <Icon name="Pencil" size={11} />
                      {t('advanced')}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        }
        pagination={
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
        }
      />

      {/* Print area — must remain OUTSIDE ListPage */}
      <div
        id="print-area"
        data-print-mode={printMode}
        className="hidden print:block"
      >
        <div className="label-grid grid gap-4">
          {labelData.map((label, index) => (
            <div
              key={`${label.variantId}-${index}`}
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

      {/* ── Barcode Reassign Modal ── */}
      {reassignOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setReassignOpen(false)}>
          <Card padding="lg" className="w-full max-w-lg mx-4 space-y-4 nvi-slide-in-bottom" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-gold-100">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <Icon name="ArrowRightLeft" size={16} className="text-amber-400" />
                </div>
                {t('barcodeReassignTitle')}
              </h3>
              <button type="button" onClick={() => setReassignOpen(false)} className="nvi-press rounded-lg p-1.5 text-gold-400 hover:text-gold-100 transition-colors">
                <Icon name="X" size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <SmartSelect
                instanceId="variant-barcode-reassign-barcode"
                value={barcodeReassign.barcodeId}
                onChange={(value) =>
                  setBarcodeReassign({
                    ...barcodeReassign,
                    barcodeId: value,
                  })
                }
                options={barcodeOptions.map((barcode) => ({
                  value: barcode.id,
                  label: `${barcode.code} -- ${formatVariantLabel(
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
                instanceId="variant-barcode-reassign-target"
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
              <TextInput
                value={barcodeReassign.reason}
                onChange={(event) =>
                  setBarcodeReassign({
                    ...barcodeReassign,
                    reason: event.target.value,
                  })
                }
                placeholder={t('reason')}
                label={t('reason')}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  reassignBarcode()
                    .then(() => setReassignOpen(false))
                    .catch((err) =>
                      setMessage({ action: 'update', outcome: 'failure', message: getApiErrorMessage(err, t('barcodeReassignFailed')) }),
                    );
                }}
                disabled={!canWrite || isReassigning}
                title={!canWrite ? noAccess('title') : undefined}
                className="nvi-cta nvi-press rounded-xl px-4 py-2 font-semibold text-black disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  {isReassigning ? <Spinner variant="dots" size="xs" /> : <Icon name="Check" size={14} />}
                  {isReassigning ? t('submitting') : t('submitReassignment')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setReassignOpen(false)}
                className="nvi-press rounded-xl border border-[var(--nvi-border)] px-4 py-2 text-sm text-gold-300"
              >
                {actions('cancel')}
              </button>
            </div>
          </Card>
        </div>
      ) : null}

      {/* ── Scanner Modal ── */}
      {scannerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { stopScan(); setScannerOpen(false); }}>
          <Card padding="lg" className="w-full max-w-md mx-4 space-y-4 nvi-slide-in-bottom" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-gold-100">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                  <Icon name="ScanBarcode" size={16} className="text-purple-400" />
                </div>
                {t('scanTitle')}
              </h3>
              <button type="button" onClick={() => { stopScan(); setScannerOpen(false); }} className="nvi-press rounded-lg p-1.5 text-gold-400 hover:text-gold-100 transition-colors">
                <Icon name="X" size={16} />
              </button>
            </div>
            <p className="text-xs text-gold-300">
              {scanMode === 'lookup'
                ? t('scanSubtitle')
                : scanMode === 'assignExisting'
                  ? t('scanAssignExistingSubtitle', { variant: scanTargetLabel })
                  : t('scanAssignNewSubtitle')}
            </p>
            {scanMessage ? (
              <p className="text-xs text-gold-300 nvi-bounce-in">{scanMessage}</p>
            ) : null}
            {scanLookup ? (
              <div
                ref={scanResultRef}
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-gold-100 nvi-bounce-in"
              >
                <p>{t('scanProduct', { value: scanLookup.productName })}</p>
                <p>{t('scanVariant', { value: scanLookup.variantName })}</p>
                <p>{t('scanSku', { value: scanLookup.sku || '\u2014' })}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  startScan(
                    scanMode,
                    scanMode === 'assignExisting' ? scanTargetVariantId ?? undefined : undefined,
                  )
                }
                className="nvi-cta nvi-press rounded-xl px-4 py-2 text-sm font-semibold text-black"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="Play" size={14} />
                  {scanActive ? t('scanRestart') : t('scanStart')}
                </span>
              </button>
              {scanActive ? (
                <button
                  type="button"
                  onClick={stopScan}
                  className="nvi-press rounded-xl border border-[var(--nvi-border)] px-4 py-2 text-sm text-gold-100"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="Square" size={14} />
                    {t('scanStop')}
                  </span>
                </button>
              ) : null}
            </div>
            <div className="overflow-hidden rounded-xl border border-[var(--nvi-border)] bg-black/80">
              <video ref={videoRef} className="w-full rounded-xl" />
            </div>
          </Card>
        </div>
      ) : null}

      {/* ── Print Labels Modal ── */}
      {printOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPrintOpen(false)}>
          <Card padding="lg" className="w-full max-w-sm mx-4 space-y-4 nvi-slide-in-bottom" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-gold-100">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                  <Icon name="Printer" size={16} className="text-blue-400" />
                </div>
                {t('labelsTitle')}
              </h3>
              <button type="button" onClick={() => setPrintOpen(false)} className="nvi-press rounded-lg p-1.5 text-gold-400 hover:text-gold-100 transition-colors">
                <Icon name="X" size={16} />
              </button>
            </div>
            <p className="text-xs text-gold-300">
              {t('labelsSubtitle')} <span className="font-semibold text-gold-100">{selectedLabels.length} selected</span>
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() =>
                  printLabels('A4')
                    .then(() => setPrintOpen(false))
                    .catch((err) =>
                      setMessage({ action: 'export', outcome: 'failure', message: getApiErrorMessage(err, t('labelsPrintFailed')) }),
                    )
                }
                disabled={isPrinting}
                className="nvi-cta nvi-press rounded-xl px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  {isPrinting ? <Spinner variant="ring" size="xs" /> : <Icon name="Printer" size={14} />}
                  {isPrinting ? t('preparing') : t('printA4')}
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  printLabels('THERMAL')
                    .then(() => setPrintOpen(false))
                    .catch((err) =>
                      setMessage({ action: 'export', outcome: 'failure', message: getApiErrorMessage(err, t('labelsPrintFailed')) }),
                    )
                }
                disabled={isPrinting}
                className="nvi-press rounded-xl border border-[var(--nvi-border)] px-4 py-2.5 text-sm text-gold-100 disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  {isPrinting ? <Spinner variant="ring" size="xs" /> : <Icon name="Printer" size={14} />}
                  {isPrinting ? t('preparing') : t('printThermal')}
                </span>
              </button>
            </div>
            {labelData.length > 0 ? (
              <div className="text-xs text-gold-300">
                {t('labelsReady', { count: labelData.length })}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

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

      <VariantCreateModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        form={form}
        onFormChange={setForm}
        products={products}
        branches={branches}
        units={units}
        newVariantBranchIds={newVariantBranchIds}
        onNewVariantBranchIdsChange={setNewVariantBranchIds}
        loadProductOptions={loadProductOptions}
        onSubmit={createVariant}
        isCreating={isCreating}
        canWrite={canWrite}
        onOpenScanner={() => {
          setScanMode('assignNew');
          setScannerOpen(true);
        }}
      />

      <VariantEditModal
        open={Boolean(editingVariant)}
        onClose={() => setEditingVariant(null)}
        variant={editingVariant}
        units={units}
        canWrite={canWrite}
        onUpdate={(id, data) =>
          updateVariant(id, data as Partial<Variant>)
        }
        onReassignSku={reassignSku}
        onUploadImage={uploadVariantImage}
        uploadingVariantId={uploadingVariantId}
        onError={(m) =>
          setMessage({ action: 'update', outcome: 'failure', message: m })
        }
        onWarn={(m) =>
          setMessage({ action: 'save', outcome: 'warning', message: m })
        }
      />
    </>
  );
}
