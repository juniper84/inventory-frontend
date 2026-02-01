'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import {
  decodeJwt,
  getAccessToken,
  getOrCreateDeviceId,
  getStoredUser,
} from '@/lib/auth';
import {
  enqueueOfflineAction,
  getOfflineCache,
  getOfflineFlag,
  getPendingCount,
  isOfflinePinRequired,
  onQueueUpdated,
  verifyOfflinePin,
} from '@/lib/offline-store';
import { Spinner } from '@/components/Spinner';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { SmartSelect } from '@/components/SmartSelect';
import { TypeaheadInput } from '@/components/TypeaheadInput';
import { DatePickerInput } from '@/components/DatePickerInput';
import { StatusBanner } from '@/components/StatusBanner';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { getActiveBranch, setActiveBranch } from '@/lib/branch-context';
import { getPermissionSet } from '@/lib/permissions';
import { NoAccessState } from '@/components/NoAccessState';
import { installBarcodeScanner } from '@/lib/barcode-scanner';
import { formatVariantLabel } from '@/lib/display';
import {
  connectEscPosPrinter,
  printEscPosLines,
  EscPosConnection,
} from '@/lib/escpos-printer';
import { buildReceiptLines, type ReceiptData } from '@/lib/receipt-print';
import { ReceiptPreview } from '@/components/receipts/ReceiptPreview';

type Branch = { id: string; name: string };
type Barcode = { id: string; code: string; isActive: boolean };
type Variant = {
  id: string;
  name: string;
  product?: { name?: string | null };
  defaultPrice?: number | null;
  minPrice?: number | null;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  conversionFactor?: number | null;
  vatMode: 'INCLUSIVE' | 'EXCLUSIVE' | 'EXEMPT';
  barcodes: Barcode[];
};

type Customer = {
  id: string;
  name: string;
  priceListId?: string | null;
};

type PriceListItem = {
  id: string;
  variantId: string;
  price: number | string;
};

type PriceList = {
  id: string;
  name: string;
  items?: PriceListItem[];
};

type Shift = {
  id: string;
  branchId: string;
  status: 'OPEN' | 'CLOSED';
};

type CartItem = {
  variant: Variant;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  barcode?: string;
  unitId?: string;
};

type Payment = {
  method: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'OTHER';
  amount: number;
  reference?: string;
  methodLabel?: string;
};

type ReceiptPayload = {
  receiptNumber: string;
  issuedAt: string;
  data?: ReceiptData;
};

type SaleDraftResponse = {
  approvalRequired?: boolean;
  id?: string | null;
  sale?: { id?: string | null } | null;
};

type SaleCompletionResponse = {
  approvalRequired?: boolean;
  receipt?: {
    receiptNumber?: string | null;
    issuedAt?: string | null;
    data?: ReceiptData | null;
  } | null;
};

type SettingsResponse = {
  posPolicies?: {
    receiptTemplate?: 'THERMAL' | 'A4';
    creditEnabled?: boolean;
    shiftTrackingEnabled?: boolean;
  };
};

type LayoutMode = 'flowline' | 'triage' | 'command';

const VAT_RATE = 18;
const CART_KEY = 'nvi-pos-cart';
const POS_LAYOUT_KEY = 'nvi-pos-layout';

const resolveUnitFactor = (variant: Variant, unitId?: string | null) => {
  if (!unitId) {
    return 1;
  }
  const baseUnitId = variant.baseUnitId ?? '';
  const sellUnitId = variant.sellUnitId ?? '';
  if (unitId === baseUnitId) {
    return 1;
  }
  if (unitId === sellUnitId) {
    const factor = Number(variant.conversionFactor ?? 1);
    return Number.isFinite(factor) && factor > 0 ? factor : 1;
  }
  return 1;
};

export default function PosPage() {
  const t = useTranslations('posPage');
  const previewT = useTranslations('receiptPreview');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const status = useTranslations('status');
  const pathname = usePathname();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('sales.write');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [branchScope, setBranchScope] = useState<string[]>([]);
  const [branchId, setBranchId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useToastState();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [payments, setPayments] = useState<Payment[]>([
    { method: 'CASH', amount: 0 },
  ]);
  const [offline, setOffline] = useState(false);
  const [receiptTemplate, setReceiptTemplate] = useState<'THERMAL' | 'A4'>(
    'THERMAL',
  );
  const [creditEnabled, setCreditEnabled] = useState(false);
  const [shiftTrackingEnabled, setShiftTrackingEnabled] = useState(false);
  const [creditSale, setCreditSale] = useState(false);
  const [creditDueDate, setCreditDueDate] = useState('');
  const [openShift, setOpenShift] = useState<Shift | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncBlocked, setSyncBlocked] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [coreLoaded, setCoreLoaded] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('flowline');
  const [layoutReady, setLayoutReady] = useState(false);
  const [printer, setPrinter] = useState<EscPosConnection | null>(null);
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [useHardwarePrint, setUseHardwarePrint] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<ReceiptPayload | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptPayload | null>(null);
  const [previewMode, setPreviewMode] = useState<'compact' | 'detailed'>('detailed');
  const storedUser = useMemo(() => getStoredUser(), []);
  const scanMessageTimer = useRef<number | null>(null);
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

  const variantOptions = useMemo(
    () =>
      variants.map((variant) => ({
        id: variant.id,
        label: formatVariantLabel({
          id: variant.id,
          name: variant.name,
          productName: variant.product?.name ?? null,
        }),
      })),
    [variants],
  );

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const payload = decodeJwt<{ branchScope?: string[] }>(token);
    const scope = Array.isArray(payload?.branchScope) ? payload?.branchScope : [];
    setBranchScope(scope ?? []);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(POS_LAYOUT_KEY) as LayoutMode | null;
    const allowed: LayoutMode[] = ['flowline', 'triage', 'command'];
    if (stored && allowed.includes(stored)) {
      setLayoutMode(stored);
      setLayoutReady(true);
      return;
    }
    const width = window.innerWidth;
    const defaultLayout =
      width < 768 ? 'flowline' : width < 1200 ? 'triage' : 'command';
    setLayoutMode(defaultLayout);
    setLayoutReady(true);
  }, []);

  useEffect(() => {
    if (!layoutReady || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(POS_LAYOUT_KEY, layoutMode);
  }, [layoutMode, layoutReady]);

  useEffect(() => {
    return () => {
      if (scanMessageTimer.current) {
        window.clearTimeout(scanMessageTimer.current);
      }
    };
  }, []);

  const connectPrinter = async () => {
    if (isConnectingPrinter) {
      return;
    }
    setIsConnectingPrinter(true);
    setMessage(null);
    try {
      const connection = await connectEscPosPrinter();
      setPrinter(connection);
      setUseHardwarePrint(true);
      setMessage({ action: 'save', outcome: 'success', message: t('printerConnected') });
    } catch (err) {
      console.warn('Failed to connect printer', err);
      setMessage({ action: 'save', outcome: 'failure', message: t('printerConnectFailed') });
    } finally {
      setIsConnectingPrinter(false);
    }
  };

  const printReceipt = async (receipt: ReceiptPayload | null) => {
    if (!receipt || !printer) {
      setMessage({ action: 'save', outcome: 'warning', message: t('noReceiptToPrint') });
      return;
    }
    if (!receipt.data) {
      setMessage({ action: 'save', outcome: 'warning', message: t('noReceiptData') });
      return;
    }
    const lines = buildReceiptLines(
      {
        receiptNumber: receipt.receiptNumber,
        issuedAt: receipt.issuedAt,
        data: receipt.data,
      },
      32,
    );
    try {
      await printEscPosLines(printer, lines);
    } catch (err) {
      console.warn('Failed to print receipt', err);
      setMessage({ action: 'save', outcome: 'failure', message: t('printerConnectFailed') });
    }
  };

  const handlePreviewPrint = async () => {
    if (!previewReceipt) {
      return;
    }
    if (useHardwarePrint && printer) {
      await printReceipt(previewReceipt);
      return;
    }
    setTimeout(() => window.print(), 100);
  };

  const previewReceiptData = useMemo(() => {
    if (!previewReceipt?.data) {
      return previewReceipt?.data ?? undefined;
    }
    if (!storedUser?.id || previewReceipt.data.cashierId !== storedUser.id) {
      return previewReceipt.data;
    }
    return {
      ...previewReceipt.data,
      cashierId: storedUser.name || storedUser.email || previewReceipt.data.cashierId,
    };
  }, [previewReceipt, storedUser]);

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
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const loadOnline = async () => {
      try {
        const [branchData, variantData, unitList, settings] = await Promise.all([
          apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
            token,
          }),
          apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=200', {
            token,
          }),
          loadUnits(token),
          apiFetch<SettingsResponse>('/settings', { token }),
        ]);
        setBranches(normalizePaginated(branchData).items);
        setVariants(normalizePaginated(variantData).items);
        setUnits(unitList);
        setReceiptTemplate(settings.posPolicies?.receiptTemplate || 'THERMAL');
        setCreditEnabled(settings.posPolicies?.creditEnabled ?? false);
        setShiftTrackingEnabled(settings.posPolicies?.shiftTrackingEnabled ?? false);
        const [customerResult, listResult] = await Promise.allSettled([
          apiFetch<PaginatedResponse<Customer> | Customer[]>('/customers?limit=200', {
            token,
          }),
          apiFetch<PaginatedResponse<PriceList> | PriceList[]>(
            '/price-lists?limit=200',
            { token },
          ),
        ]);
        if (customerResult.status === 'fulfilled') {
          setCustomers(normalizePaginated(customerResult.value).items);
        }
        if (listResult.status === 'fulfilled') {
          setPriceLists(normalizePaginated(listResult.value).items);
        }
        setCoreLoaded(true);
      } catch (err) {
        console.warn('Failed to load POS data from API', err);
        await loadOfflineCache();
      }
    };
    const loadOfflineCache = async () => {
      const cache = await getOfflineCache<{
        branches?: Branch[];
        variants?: Variant[];
        units?: Unit[];
        barcodes?: { id: string; variantId: string; code: string; isActive?: boolean }[];
        customers?: Customer[];
        priceLists?: PriceList[];
        settings?: SettingsResponse;
      }>('snapshot');
      if (!cache) {
        setMessage({ action: 'sync', outcome: 'info', message: t('offlineCacheUnavailable') });
        setCoreLoaded(true);
        return;
      }
      setBranches(cache.branches ?? []);
      const barcodeGroups = new Map<string, Barcode[]>();
      (cache.barcodes ?? []).forEach((barcode) => {
        const list = barcodeGroups.get(barcode.variantId) ?? [];
        list.push({
          id: barcode.id,
          code: barcode.code,
          isActive: barcode.isActive ?? true,
        });
        barcodeGroups.set(barcode.variantId, list);
      });
      const mergedVariants = (cache.variants ?? []).map((variant) => ({
        ...variant,
        barcodes: barcodeGroups.get(variant.id) ?? [],
      }));
      setVariants(mergedVariants);
      setUnits(cache.units ?? []);
      setCustomers(cache.customers ?? []);
      setPriceLists(cache.priceLists ?? []);
      if (cache.settings?.posPolicies) {
        setReceiptTemplate(cache.settings.posPolicies.receiptTemplate || 'THERMAL');
        setCreditEnabled(cache.settings.posPolicies.creditEnabled ?? false);
        setShiftTrackingEnabled(cache.settings.posPolicies.shiftTrackingEnabled ?? false);
      }
      setCoreLoaded(true);
    };

    if (navigator.onLine) {
      loadOnline();
    } else {
      loadOfflineCache();
    }
  }, [offline]);

  const getVariantUnitOptions = (variant: Variant) => {
    const ids = new Set<string>();
    if (variant.baseUnitId) {
      ids.add(variant.baseUnitId);
    }
    if (variant.sellUnitId) {
      ids.add(variant.sellUnitId);
    }
    const filtered = units.filter((unit) => ids.has(unit.id));
    return filtered.length ? filtered : units;
  };

  useEffect(() => {
    getPendingCount().then(setPendingSyncCount);
    const unsubscribe = onQueueUpdated((count) => setPendingSyncCount(count));
    return () => unsubscribe();
  }, []);

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
    localStorage.setItem(
      CART_KEY,
      JSON.stringify({ branchId, customerId, cart, cartDiscount }),
    );
  }, [branchId, customerId, cart, cartDiscount]);

  useEffect(() => {
    if (!units.length) {
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.unitId
          ? item
          : {
              ...item,
              unitId:
                item.variant.sellUnitId ??
                item.variant.baseUnitId ??
                units[0]?.id ??
                '',
            },
      ),
    );
  }, [units]);

  useEffect(() => {
    const stored = localStorage.getItem(CART_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as {
          branchId: string;
          customerId?: string;
          cart: CartItem[];
          cartDiscount: number;
        };
        if (parsed.branchId) {
          setBranchId(parsed.branchId);
          setCustomerId(parsed.customerId ?? '');
          setCart(parsed.cart || []);
          setCartDiscount(parsed.cartDiscount || 0);
        }
      } catch (err) {
        console.warn('Failed to parse POS cached cart', err);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      resetScanner(scannerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!creditEnabled) {
      setCreditSale(false);
    }
  }, [creditEnabled]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !shiftTrackingEnabled || !branchId) {
      setOpenShift(null);
      return;
    }
    apiFetch<Shift | null>(`/shifts/open?branchId=${branchId}`, { token })
      .then((shift) => setOpenShift(shift))
      .catch(() => setOpenShift(null));
  }, [shiftTrackingEnabled, branchId]);

  const barcodeMap = useMemo(() => {
    const map = new Map<string, Variant[]>();
    variants.forEach((variant) => {
      variant.barcodes
        .filter((barcode) => barcode.isActive)
        .forEach((barcode) => {
          const list = map.get(barcode.code) ?? [];
          list.push(variant);
          map.set(barcode.code, list);
        });
    });
    return map;
  }, [variants]);

  const handleBarcodeScan = useCallback(
    (code: string) => {
      const normalized = code.trim();
      if (!normalized) {
        return;
      }
      const match = barcodeMap.get(normalized);
      if (match && match.length === 1) {
        addToCart(match[0], normalized);
        setSearch('');
        setTimedScanMessage(t('scanned', { value: normalized }));
        setMessage({
          action: 'save',
          outcome: 'success',
          message: t('scanAddedToCart', { value: normalized }),
        });
        if (scanActive) {
          stopScan();
        }
        return;
      }
      if (match && match.length > 1) {
        setMessage({ action: 'save', outcome: 'info', message: t('multipleBarcodeMatches') });
        setTimedScanMessage(t('multipleBarcodeMatches'));
        return;
      }
      setMessage({ action: 'save', outcome: 'info', message: t('noMatch') });
      setTimedScanMessage(t('noMatch'));
    },
    [barcodeMap, setMessage, setTimedScanMessage, t, scanActive],
  );

  useEffect(() => {
    if (!variants.length) {
      return;
    }
    return installBarcodeScanner({
      onScan: handleBarcodeScan,
      enabled: true,
      minLength: 6,
    });
  }, [variants.length, handleBarcodeScan]);

  const availableBranches = useMemo(() => {
    if (!branchScope.length) {
      return branches;
    }
    const allowed = new Set(branchScope);
    return branches.filter((branch) => allowed.has(branch.id));
  }, [branches, branchScope]);

  useEffect(() => {
    if (!availableBranches.length) {
      if (branchId) {
        setBranchId('');
      }
      return;
    }
    const allowed = new Set(availableBranches.map((branch) => branch.id));
    if (branchId && !allowed.has(branchId)) {
      setBranchId('');
      return;
    }
    if (!branchId) {
      if (branchScope.length === 1) {
        setBranchId(availableBranches[0].id);
        return;
      }
      const stored = getActiveBranch();
      if (stored?.id && allowed.has(stored.id)) {
        setBranchId(stored.id);
      }
    }
  }, [availableBranches, branchScope, branchId]);

  useEffect(() => {
    if (!branchId) {
      return;
    }
    const branch = availableBranches.find((item) => item.id === branchId);
    if (branch) {
      setActiveBranch({ id: branch.id, name: branch.name });
    }
  }, [branchId, availableBranches]);

  const activePriceList = useMemo(() => {
    const customer = customers.find((entry) => entry.id === customerId);
    const priceListId = customer?.priceListId ?? null;
    return priceListId ? priceLists.find((list) => list.id === priceListId) ?? null : null;
  }, [customerId, customers, priceLists]);

  const priceListMap = useMemo(() => {
    const map = new Map<string, number>();
    (activePriceList?.items ?? []).forEach((item) => {
      map.set(item.variantId, Number(item.price));
    });
    return map;
  }, [activePriceList]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const lineDiscount = cart.reduce((sum, item) => sum + item.lineDiscount, 0);
    const vatTotal = cart.reduce((sum, item) => {
      if (item.variant.vatMode === 'EXEMPT') {
        return sum;
      }
      if (item.variant.vatMode === 'INCLUSIVE') {
        const vatPerUnit = (item.unitPrice * VAT_RATE) / (VAT_RATE + 100);
        return sum + vatPerUnit * item.quantity;
      }
      const vatPerUnit = (item.unitPrice * VAT_RATE) / 100;
      return sum + vatPerUnit * item.quantity;
    }, 0);
    const totalBeforeCart = cart.reduce((sum, item) => {
      const lineTotal =
        item.variant.vatMode === 'EXCLUSIVE'
          ? (item.unitPrice * (1 + VAT_RATE / 100)) * item.quantity
          : item.unitPrice * item.quantity;
      return sum + lineTotal - item.lineDiscount;
    }, 0);
    const total = totalBeforeCart - cartDiscount;
    return { subtotal, lineDiscount, vatTotal, total };
  }, [cart, cartDiscount]);

  const addToCart = (variant: Variant, barcode?: string) => {
    if (!branchId) {
      setMessage({ action: 'save', outcome: 'warning', message: t('branchRequired') });
      return;
    }
    const listPrice = priceListMap.get(variant.id);
    const basePrice = listPrice ?? variant.defaultPrice ?? null;
    if (!basePrice) {
      setMessage({ action: 'save', outcome: 'warning', message: t('missingPrice') });
      return;
    }
    setMessage(null);
    setCart((prev) => {
      const existing = prev.find((item) => item.variant.id === variant.id);
      if (existing) {
        return prev.map((item) =>
          item.variant.id === variant.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          variant,
          quantity: 1,
          unitPrice: basePrice,
          lineDiscount: 0,
          barcode,
          unitId: variant.sellUnitId ?? variant.baseUnitId ?? units[0]?.id ?? '',
        },
      ];
    });
  };

  const handleSearchSubmit = () => {
    if (!search) {
      return;
    }
    const match = barcodeMap.get(search.trim());
    if (match && match.length === 1) {
      addToCart(match[0], search.trim());
      setSearch('');
      return;
    }
    if (match && match.length > 1) {
      setMessage({ action: 'save', outcome: 'info', message: t('multipleBarcodeMatches') });
      return;
    }
    const normalizedSearch = search.toLowerCase();
    const byName = variants.find((variant) => {
      const productName = variant.product?.name?.toLowerCase() ?? '';
      return (
        variant.name.toLowerCase().includes(normalizedSearch) ||
        productName.includes(normalizedSearch)
      );
    });
    if (byName) {
      addToCart(byName);
      setSearch('');
      return;
    }
    setMessage({ action: 'save', outcome: 'info', message: t('noMatch') });
  };

  const startScan = async () => {
    if (!videoRef.current) {
      return;
    }
    if (scannerRef.current) {
      resetScanner(scannerRef.current);
    }
    setScanMessage(null);
    const reader = new BrowserMultiFormatReader();
    scannerRef.current = reader;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      const deviceId = videoDevices[0]?.deviceId;
      await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result) => {
        if (result) {
          const code = result.getText();
          handleBarcodeScan(code);
        }
      });
      setScanActive(true);
    } catch (err) {
      console.warn('Failed to start barcode scanner', err);
      setScanMessage(t('cameraUnavailable'));
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

  const updateCartItem = (index: number, data: Partial<CartItem>) => {
    setCart((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...data };
      return next;
    });
  };

  const removeCartItem = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updatePayment = (index: number, data: Partial<Payment>) => {
    setPayments((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...data } as Payment;
      return next;
    });
  };

  const addPayment = () => {
    setPayments((prev) => [...prev, { method: 'CASH', amount: 0 }]);
  };

  const completeSale = async () => {
    if (isCompleting) {
      return;
    }
    if (!canWrite) {
      return;
    }
    const token = getAccessToken();
    if (!token || !branchId || cart.length === 0) {
      return;
    }
    setIsCompleting(true);
    const total = totals.total;
    const cleanedPayments = payments.filter((payment) => payment.amount > 0);
    const paymentTotal = cleanedPayments.reduce(
      (sum, pay) => sum + (pay.amount || 0),
      0,
    );
    const hasCash = cleanedPayments.some((payment) => payment.method === 'CASH');
    if (!creditSale && paymentTotal + 0.01 < total) {
      setMessage({ action: 'save', outcome: 'info', message: t('paymentsMustMatch') });
      setIsCompleting(false);
      return;
    }
    if (creditSale && paymentTotal > total) {
      setMessage({ action: 'save', outcome: 'info', message: t('creditExceedsTotal') });
      setIsCompleting(false);
      return;
    }
    if (!creditSale && paymentTotal > total + 0.01 && !hasCash) {
      setMessage({ action: 'save', outcome: 'info', message: t('paymentsMustMatch') });
      setIsCompleting(false);
      return;
    }
    if (shiftTrackingEnabled && !openShift) {
      setMessage({ action: 'save', outcome: 'warning', message: t('openShiftRequired') });
      setIsCompleting(false);
      return;
    }
    if (offline) {
      if (syncBlocked) {
        setMessage({ action: 'sync', outcome: 'warning', message: t('offlineSyncBlocked') });
        setIsCompleting(false);
        return;
      }
      if (pinRequired && !pinVerified) {
        setMessage({ action: 'sync', outcome: 'warning', message: t('offlinePinRequired') });
        setIsCompleting(false);
        return;
      }
      const localReceiptNumber = `OFFLINE-${new Date()
        .toISOString()
        .replace(/[-:TZ.]/g, '')
        .slice(0, 14)}`;
      const actionId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `offline-${Date.now()}`;
      try {
        await enqueueOfflineAction({
          id: actionId,
          actionType: 'SALE_COMPLETE',
          payload: {
            deviceId: getOrCreateDeviceId(),
            branchId,
            customerId: customerId || undefined,
            cartDiscount,
            payments: cleanedPayments,
            creditDueDate: creditSale && creditDueDate ? creditDueDate : undefined,
            total,
            localReceiptNumber,
            lines: cart.map((item) => ({
              variantId: item.variant.id,
              quantity: item.quantity,
              unitId: item.unitId || undefined,
              unitPrice: item.unitPrice,
              vatMode: item.variant.vatMode,
              vatRate: VAT_RATE,
              lineDiscount: item.lineDiscount,
              barcode: item.barcode,
            })),
            idempotencyKey: actionId,
          },
          provisionalAt: new Date().toISOString(),
          localAuditId: actionId,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('offlineQueueFailed');
        setMessage(message);
        setIsCompleting(false);
        return;
      }
      setCart([]);
      setCartDiscount(0);
      setPayments([{ method: 'CASH', amount: 0 }]);
      setMessage(
        t('offlineQueued', { receiptNumber: localReceiptNumber }),
      );
      setIsCompleting(false);
      return;
    }
    try {
      const idempotencyKey = crypto.randomUUID();
      const draft = await apiFetch<SaleDraftResponse>('/sales/draft', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId,
          customerId: customerId || undefined,
          cartDiscount,
          isOffline: offline,
          lines: cart.map((item) => ({
            variantId: item.variant.id,
            quantity: item.quantity,
            unitId: item.unitId || undefined,
            unitPrice: item.unitPrice,
            vatMode: item.variant.vatMode,
            vatRate: VAT_RATE,
            lineDiscount: item.lineDiscount,
            barcode: item.barcode,
          })),
        }),
      });
      if (draft?.approvalRequired) {
        setMessage({ action: 'save', outcome: 'warning', message: t('discountNeedsApproval') });
        setCart([]);
        return;
      }
      const saleId = draft.sale?.id ?? draft.id;
      const completion = await apiFetch<SaleCompletionResponse>('/sales/complete', {
        token,
        method: 'POST',
        body: JSON.stringify({
          saleId,
          payments: cleanedPayments,
          idempotencyKey,
          creditDueDate: creditSale && creditDueDate ? creditDueDate : undefined,
        }),
      });
      if (completion?.approvalRequired) {
        setMessage({ action: 'save', outcome: 'warning', message: t('completionNeedsApproval') });
        return;
      }
      if (completion?.receipt) {
        setLastReceipt({
          receiptNumber: completion.receipt.receiptNumber ?? '',
          issuedAt: completion.receipt.issuedAt ?? new Date().toISOString(),
          data: completion.receipt.data ?? undefined,
        });
        if (useHardwarePrint && printer) {
          await printReceipt({
            receiptNumber: completion.receipt.receiptNumber ?? '',
            issuedAt: completion.receipt.issuedAt ?? new Date().toISOString(),
            data: completion.receipt.data ?? undefined,
          });
        }
      }
      setCart([]);
      setCartDiscount(0);
      setPayments([{ method: 'CASH', amount: 0 }]);
      setCreditSale(false);
      setCreditDueDate('');
      setMessage(
        t('saleCompleted', {
          receiptNumber: completion.receipt?.receiptNumber ?? '',
        }),
      );
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('completeFailed')),
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const branchSelectDisabled =
    cart.length > 0 || availableBranches.length <= 1;
  const branchSelectionRequired =
    !branchId && availableBranches.length > 0;
  const showLoadingOverlay = !coreLoaded;

  const layoutOptions: { value: LayoutMode; label: string }[] = [
    { value: 'flowline', label: t('layoutFlowline') },
    { value: 'triage', label: t('layoutTriage') },
    { value: 'command', label: t('layoutCommand') },
  ];

  const scanPanel = (
    <div className="command-card p-4 space-y-3 nvi-reveal">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gold-100">
          {t('scanSearchTitle')}
        </h3>
        <span className="text-[10px] uppercase tracking-[0.25em] text-gold-500">
          {t('scanTag')}
        </span>
      </div>
      <SmartSelect
        instanceId="pos-branch"
        value={branchId}
        onChange={setBranchId}
        isDisabled={branchSelectDisabled}
        placeholder={t('selectBranch')}
        options={availableBranches.map((branch) => ({
          value: branch.id,
          label: branch.name,
        }))}
      />
      <SmartSelect
        instanceId="pos-customer"
        value={customerId}
        onChange={setCustomerId}
        isDisabled={cart.length > 0}
        placeholder={t('customerOptional')}
        options={customers.map((customer) => ({
          value: customer.id,
          label: customer.name,
        }))}
      />
      {activePriceList ? (
        <p className="text-xs text-gold-400">
          {t('priceListLabel', { name: activePriceList.name })}
        </p>
      ) : null}
      <div className="flex gap-2">
        <TypeaheadInput
          value={search}
          onChange={setSearch}
          options={variantOptions}
          onSelect={(option) => {
            const variant = variants.find((item) => item.id === option.id);
            if (variant) {
              addToCart(variant);
              setSearch('');
            }
          }}
          onEnter={handleSearchSubmit}
          placeholder={t('scanOrSearch')}
          className="flex-1 rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <button
          onClick={handleSearchSubmit}
          className="rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black"
        >
          {actions('add')}
        </button>
      </div>
      <div className="space-y-2">
        <button
          onClick={startScan}
          className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
        >
          {scanActive ? t('scanRestart') : t('scanStart')}
        </button>
        {scanActive ? (
          <button
            onClick={stopScan}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
          >
            {t('scanStop')}
          </button>
        ) : null}
        {scanMessage ? <p className="text-xs text-gold-400">{scanMessage}</p> : null}
        <div className="overflow-hidden rounded border border-gold-700/40 bg-black/80">
          <video ref={videoRef} className="w-full" />
        </div>
      </div>
    </div>
  );

  const cartPanel = (
    <div className="command-card p-4 space-y-3 nvi-reveal">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gold-100">{t('cartTitle')}</h3>
        <span className="text-[10px] uppercase tracking-[0.25em] text-gold-500">
          {t('cartTag')}
        </span>
      </div>
      <p className="text-xs text-gold-400">{t('unitPriceAutoAdjustHint')}</p>
      {cart.length === 0 ? (
        <p className="text-sm text-gold-300">{t('cartEmpty')}</p>
      ) : (
        <div className="space-y-3">
          {cart.map((item, index) => (
            <div
              key={`${item.variant.id}-${index}`}
              className="rounded border border-gold-700/40 bg-black/60 p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gold-100">
                    {formatVariantLabel({
                      id: item.variant.id,
                      name: item.variant.name,
                      productName: item.variant.product?.name ?? null,
                    })}
                  </p>
                  <p className="text-xs text-gold-400">
                    {item.barcode
                      ? t('barcodeLabel', { value: item.barcode })
                      : ''}
                  </p>
                  {item.variant.minPrice ? (
                    <p
                      className={
                        item.unitPrice < item.variant.minPrice
                          ? 'text-xs text-red-400'
                          : 'text-xs text-gold-500'
                      }
                    >
                      {t('minPriceLabel', { value: item.variant.minPrice })}
                    </p>
                  ) : null}
                </div>
                <button
                  onClick={() => removeCartItem(index)}
                  className="text-xs text-gold-400"
                >
                  {actions('remove')}
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(event) =>
                    updateCartItem(index, {
                      quantity: Number(event.target.value),
                    })
                  }
                  className="rounded border border-gold-700/50 bg-black px-2 py-1 text-xs text-gold-100"
                  placeholder={t('quantityShort')}
                />
                <SmartSelect
                  instanceId={`pos-unit-${index}`}
                  value={item.unitId || ''}
                  onChange={(value) => {
                    const nextUnitId = value;
                    const currentUnitId = item.unitId;
                    if (nextUnitId && currentUnitId && nextUnitId !== currentUnitId) {
                      const currentFactor = resolveUnitFactor(
                        item.variant,
                        currentUnitId,
                      );
                      const nextFactor = resolveUnitFactor(item.variant, nextUnitId);
                      const nextPrice = Number(
                        (item.unitPrice * (nextFactor / currentFactor)).toFixed(2),
                      );
                      updateCartItem(index, { unitId: nextUnitId, unitPrice: nextPrice });
                      return;
                    }
                    updateCartItem(index, { unitId: nextUnitId });
                  }}
                  options={getVariantUnitOptions(item.variant).map((unit) => ({
                    value: unit.id,
                    label: buildUnitLabel(unit),
                  }))}
                  placeholder={t('unit')}
                />
                <input
                  type="number"
                  value={item.unitPrice}
                  onChange={(event) =>
                    updateCartItem(index, {
                      unitPrice: Number(event.target.value),
                    })
                  }
                  className="rounded border border-gold-700/50 bg-black px-2 py-1 text-xs text-gold-100"
                  placeholder={t('unitPrice')}
                />
                <input
                  type="number"
                  value={item.lineDiscount}
                  onChange={(event) =>
                    updateCartItem(index, {
                      lineDiscount: Number(event.target.value),
                    })
                  }
                  className="rounded border border-gold-700/50 bg-black px-2 py-1 text-xs text-gold-100"
                  placeholder={t('discount')}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-gold-300">
        <span>{t('cartDiscount')}</span>
        <input
          type="number"
          value={cartDiscount}
          onChange={(event) => setCartDiscount(Number(event.target.value))}
          className="w-24 rounded border border-gold-700/50 bg-black px-2 py-1 text-xs text-gold-100"
        />
      </div>
    </div>
  );

  const totalsPanel = (
    <div className="command-card p-4 space-y-3 nvi-reveal">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gold-100">{t('totalsTitle')}</h3>
        <span className="text-[10px] uppercase tracking-[0.25em] text-gold-500">
          {t('payTag')}
        </span>
      </div>
      <div className="space-y-1 text-sm text-gold-200">
        <div className="flex justify-between">
          <span>{t('subtotal')}</span>
          <span>{totals.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t('discounts')}</span>
          <span>{(totals.lineDiscount + cartDiscount).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t('vat')}</span>
          <span>{totals.vatTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-base text-gold-100">
          <span>{t('total')}</span>
          <span>{totals.total.toFixed(2)}</span>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-gold-300">{t('paymentsHint')}</p>
        {payments.map((payment, index) => (
          <div key={`payment-${index}`} className="grid gap-2">
            <SmartSelect
              instanceId={`payment-${index}`}
              value={payment.method}
              onChange={(value) =>
                updatePayment(index, {
                  method: value as Payment['method'],
                })
              }
              options={[
                { value: 'CASH', label: t('paymentCash') },
                { value: 'CARD', label: t('paymentCard') },
                { value: 'MOBILE_MONEY', label: t('paymentMobileMoney') },
                { value: 'BANK_TRANSFER', label: t('paymentBankTransfer') },
                { value: 'OTHER', label: t('paymentOther') },
              ]}
            />
            {payment.method === 'OTHER' ? (
              <input
                value={payment.methodLabel || ''}
                onChange={(event) =>
                  updatePayment(index, { methodLabel: event.target.value })
                }
                placeholder={t('paymentLabel')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
              />
            ) : null}
            <input
              type="number"
              value={payment.amount}
              onChange={(event) =>
                updatePayment(index, { amount: Number(event.target.value) })
              }
              placeholder={t('amount')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
            />
            <input
              value={payment.reference || ''}
              onChange={(event) =>
                updatePayment(index, { reference: event.target.value })
              }
              placeholder={t('referenceOptional')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
            />
          </div>
        ))}
        <button
          onClick={addPayment}
          className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
        >
          {t('addPayment')}
        </button>
        {creditEnabled ? (
          <div className="space-y-2 rounded border border-gold-700/30 bg-black/40 p-2">
            <label className="flex items-center gap-2 text-xs text-gold-300">
              <input
                type="checkbox"
                checked={creditSale}
                onChange={(event) => setCreditSale(event.target.checked)}
              />
              {t('creditSale')}
            </label>
            {creditSale ? (
              <DatePickerInput
                value={creditDueDate}
                onChange={setCreditDueDate}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        onClick={completeSale}
        disabled={isCompleting}
        className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-70"
      >
        <span className="inline-flex items-center gap-2">
          {isCompleting ? <Spinner variant="orbit" size="xs" /> : null}
          {isCompleting ? t('completing') : t('completeSale')}
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={connectPrinter}
          className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:opacity-70"
          disabled={isConnectingPrinter}
        >
          {isConnectingPrinter ? t('printerConnecting') : t('connectPrinter')}
        </button>
        <label className="flex items-center gap-2 text-xs text-gold-300">
          <input
            type="checkbox"
            checked={useHardwarePrint}
            onChange={(event) => setUseHardwarePrint(event.target.checked)}
            disabled={!printer}
          />
          {t('hardwarePrint')}
        </label>
        <button
          type="button"
          onClick={() => printReceipt(lastReceipt)}
          className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:opacity-70"
          disabled={!printer || !lastReceipt}
        >
          {t('printLastReceipt')}
        </button>
        <button
          type="button"
          onClick={() => setPreviewReceipt(lastReceipt)}
          className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:opacity-70"
          disabled={!lastReceipt}
        >
          {t('previewAndPrint')}
        </button>
      </div>
      <p className="text-xs text-gold-400">
        {t('receiptTemplate', { template: receiptTemplate })}
      </p>
    </div>
  );

  if (!canWrite) {
    return (
      <div className="min-h-screen bg-black px-6 py-8">
        <NoAccessState permission="sales.write" path={pathname || '/pos'} />
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {showLoadingOverlay ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-gold-700/40 bg-black/80 p-6 text-center text-gold-100 shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-gold-700/50">
              <Spinner size="sm" variant="ring" />
            </div>
            <p className="text-sm font-semibold">{t('loadingPos')}</p>
            <p className="mt-2 text-xs text-gold-400">{t('loadingPosHint')}</p>
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
          <p className="text-sm text-gold-400">{t('subtitle')}</p>
        </div>
        <div className="flex flex-col gap-2 text-xs text-gold-300 sm:items-end">
          <span>
            {t('branchLabel', {
              value: branchId
                ? availableBranches.find((b) => b.id === branchId)?.name ??
                  t('selectBranch')
                : t('selectBranch'),
            })}
          </span>
          <div className="flex items-center gap-3">
            <span className={offline ? 'text-red-400' : 'text-green-400'}>
              {offline ? status('offline') : status('online')}
            </span>
            <span className="text-xs text-gold-400">
              {t('pendingSync', { count: pendingSyncCount })}
            </span>
          </div>
        </div>
      </div>

      <div className="command-card px-3 py-2 nvi-reveal">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gold-200">
          <span className="uppercase tracking-[0.3em] text-gold-500">
            {t('layoutLabel')}
          </span>
          {layoutOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setLayoutMode(option.value)}
              className={`rounded-full border px-3 py-1 text-[11px] ${
                layoutMode === option.value
                  ? 'border-gold-400 text-gold-100'
                  : 'border-gold-700/60 text-gold-300'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gold-400">{t('layoutHint')}</p>
      </div>

      {shiftTrackingEnabled ? (
        <p className="text-xs text-gold-400">
          {t('shiftTracking', {
            status: openShift ? t('shiftOpen') : t('shiftClosed'),
          })}
        </p>
      ) : null}
      {branchSelectionRequired ? (
        <StatusBanner message={t('branchSelectRequired')} variant="warning" />
      ) : null}
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

      {layoutMode === 'flowline' ? (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1.5fr_1fr]">
          {scanPanel}
          {cartPanel}
          {totalsPanel}
        </div>
      ) : null}

      {layoutMode === 'triage' ? (
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          {scanPanel}
          <div className="space-y-4">
            {cartPanel}
            {totalsPanel}
          </div>
        </div>
      ) : null}

      {layoutMode === 'command' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr_1fr]">
          {totalsPanel}
          {cartPanel}
          {scanPanel}
        </div>
      ) : null}

      {previewReceipt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={common('close')}
            onClick={() => setPreviewReceipt(null)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="relative z-10 w-full max-w-xl space-y-4 rounded border border-gold-700/40 bg-black p-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-gold-100">
                {previewT('title')}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
              >
                {common('close')}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPreviewMode('compact')}
                className={`rounded border px-3 py-1 ${
                  previewMode === 'compact'
                    ? 'border-gold-500 text-gold-100'
                    : 'border-gold-700/50 text-gold-400'
                }`}
              >
                {previewT('compact')}
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('detailed')}
                className={`rounded border px-3 py-1 ${
                  previewMode === 'detailed'
                    ? 'border-gold-500 text-gold-100'
                    : 'border-gold-700/50 text-gold-400'
                }`}
              >
                {previewT('detailed')}
              </button>
            </div>
            <ReceiptPreview
              receiptNumber={previewReceipt.receiptNumber}
              issuedAt={previewReceipt.issuedAt}
              data={previewReceiptData ?? undefined}
              mode={previewMode}
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
              >
                {common('close')}
              </button>
              <button
                type="button"
                onClick={handlePreviewPrint}
                className="rounded bg-gold-500 px-3 py-2 text-xs font-semibold text-black"
              >
                {previewT('printReceipt')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        id="pos-receipt-print"
        className="hidden print:block"
        data-template={previewReceipt?.data?.receiptTemplate ?? 'THERMAL'}
      >
        {previewReceipt ? (
          <ReceiptPreview
            receiptNumber={previewReceipt.receiptNumber}
            issuedAt={previewReceipt.issuedAt}
            data={previewReceiptData ?? undefined}
            mode={previewMode}
          />
        ) : null}
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          body * {
            visibility: hidden;
          }
          #pos-receipt-print,
          #pos-receipt-print * {
            visibility: visible;
          }
          #pos-receipt-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            padding: 16px;
          }
          #pos-receipt-print .receipt-paper {
            background: white !important;
            border-color: #ddd !important;
          }
          #pos-receipt-print .receipt-paper * {
            color: #111 !important;
          }
          #pos-receipt-print[data-template='THERMAL'] .receipt-paper {
            max-width: 320px;
            margin: 0 auto;
          }
        }
      `}</style>
    </section>
  );
}
