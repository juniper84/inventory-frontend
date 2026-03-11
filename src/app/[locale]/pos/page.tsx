'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
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
  getDbOpenError,
  getOfflineCache,
  getOfflineFlag,
  getPendingCount,
  getPinLockStatus,
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
import { setStoredCurrency, formatCurrency, useCurrency, useTimezone, useDateFormat } from '@/lib/business-context';
import { ZERO_DECIMAL_CURRENCIES } from '@/lib/currencies';
import { getPermissionSet } from '@/lib/permissions';
import { NoAccessState } from '@/components/NoAccessState';
import { installBarcodeScanner } from '@/lib/barcode-scanner';
import { formatVariantLabel } from '@/lib/display';
import {
  connectEscPosPrinter,
  printEscPosLines,
  EscPosConnection,
} from '@/lib/escpos-printer';
import { buildReceiptLines, type ReceiptData, type ReceiptLabels } from '@/lib/receipt-print';
import { useVariantSearch } from '@/lib/use-variant-search';
import { ReceiptPreview } from '@/components/receipts/ReceiptPreview';

type Branch = { id: string; name: string };
type Barcode = { id: string; code: string; isActive: boolean };
type Variant = {
  id: string;
  name: string;
  product?: { name?: string | null };
  sku?: string | null;
  imageUrl?: string | null;
  defaultPrice?: number | null;
  minPrice?: number | null;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  conversionFactor?: number | null;
  vatMode: 'INCLUSIVE' | 'EXCLUSIVE' | 'EXEMPT';
  barcodes: Barcode[];
  hasStock?: boolean | null;
};

type Customer = {
  id: string;
  name: string;
  tinNumber?: string | null;
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
  currency?: string;
  vatRate?: number;
  posPolicies?: {
    receiptTemplate?: 'THERMAL' | 'A4';
    creditEnabled?: boolean;
    priceEditEnabled?: boolean;
    shiftTrackingEnabled?: boolean;
  };
};

const DEFAULT_VAT_RATE = 18;
const CART_KEY = 'nvi-pos-cart';
const POS_MODE_KEY = 'nvi.pos.deviceMode';

// Quick-cash denomination presets (works well for TZS; universal round numbers)
const CASH_QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];

type PosMode = 'phone' | 'tablet' | 'desktop';

function detectPosMode(): PosMode {
  if (typeof window === 'undefined') return 'desktop';
  const stored = localStorage.getItem(POS_MODE_KEY);
  if (stored === 'phone' || stored === 'tablet' || stored === 'desktop') return stored as PosMode;
  const w = window.innerWidth;
  if (w < 640) return 'phone';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

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
  const locale = useLocale();
  const pathname = usePathname();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('sales.write');
  const canOpenShift = permissions.has('shifts.open');
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
  const [priceEditEnabled, setPriceEditEnabled] = useState(false);
  const [shiftTrackingEnabled, setShiftTrackingEnabled] = useState(false);
  const [creditSale, setCreditSale] = useState(false);
  const [creditDueDate, setCreditDueDate] = useState('');
  const [openShift, setOpenShift] = useState<Shift | null>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [isOpeningShift, setIsOpeningShift] = useState(false);
  const [scanActive, setScanActive] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncBlocked, setSyncBlocked] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinLocked, setPinLocked] = useState(false);
  const [pinLockedUntil, setPinLockedUntil] = useState<string | null>(null);
  const [pinAttempts, setPinAttempts] = useState(0);
  const [coreLoaded, setCoreLoaded] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [printer, setPrinter] = useState<EscPosConnection | null>(null);
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [useHardwarePrint, setUseHardwarePrint] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<ReceiptPayload | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptPayload | null>(null);
  const [previewMode, setPreviewMode] = useState<'compact' | 'detailed'>('detailed');
  const [productQuery, setProductQuery] = useState('');
  const [posMode, setPosMode] = useState<PosMode>(() => detectPosMode());
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'products' | 'cart' | 'pay'>('products');
  const [clockTime, setClockTime] = useState('');
  const [sessionSaleCount, setSessionSaleCount] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [focusedPaymentIndex, setFocusedPaymentIndex] = useState<number | null>(null);
  const [lastAddedVariantId, setLastAddedVariantId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerFocused, setCustomerFocused] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const router = useRouter();
  const currency = useCurrency();
  const timezone = useTimezone();
  const dateFormat = useDateFormat();
  const [vatRate, setVatRate] = useState(DEFAULT_VAT_RATE);
  const amountFormatter = useMemo(() => {
    const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }, [currency, locale]);
  const storedUser = useMemo(() => getStoredUser(), []);
  const { seedCache: seedVariantCache } = useVariantSearch();

  // Live clock — ticks every second
  useEffect(() => {
    const tick = () =>
      setClockTime(
        new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [locale]);

  // Customer typeahead: filter local list immediately, then debounce-search API
  useEffect(() => {
    if (customerSearchTimer.current) clearTimeout(customerSearchTimer.current);
    const query = customerQuery.trim().toLowerCase();
    if (!query) {
      setCustomerResults(customers.slice(0, 8));
      return;
    }
    // Immediate local filter
    const local = customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          (c.tinNumber ?? '').toLowerCase().includes(query),
      )
      .slice(0, 8);
    setCustomerResults(local);
    // Debounced API search (online only)
    customerSearchTimer.current = setTimeout(async () => {
      const token = getAccessToken();
      if (!token || offline) return;
      try {
        const data = await apiFetch<PaginatedResponse<Customer> | Customer[]>(
          `/customers?search=${encodeURIComponent(customerQuery)}&limit=10`,
          { token },
        );
        setCustomerResults(normalizePaginated(data).items);
      } catch {
        // keep local results
      }
    }, 300);
    return () => {
      if (customerSearchTimer.current) clearTimeout(customerSearchTimer.current);
    };
  }, [customerQuery, customers, offline]);

  // Sync selectedCustomer when customerId is restored from localStorage
  useEffect(() => {
    if (!customerId || selectedCustomer?.id === customerId) return;
    const found = customers.find((c) => c.id === customerId);
    if (found) setSelectedCustomer(found);
  }, [customerId, customers]);

  // Compact label for quick-cash buttons (e.g. 50000 → "50K")
  const formatQuickAmount = useCallback(
    (n: number) => {
      if (n >= 1_000_000) return `${n / 1_000_000}M`;
      if (n >= 1_000) return `${n / 1_000}K`;
      return String(n);
    },
    [],
  );

  const customerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanMessageTimer = useRef<number | null>(null);
  const printTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<BrowserMultiFormatReader | null>(null);
  const cartRestoredRef = useRef(false);
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
    const resolvedData =
      receipt.data && storedUser?.id && receipt.data.cashierId === storedUser.id
        ? { ...receipt.data, cashierId: storedUser.name || storedUser.email || receipt.data.cashierId }
        : receipt.data;
    const labels: ReceiptLabels = {
      receipt: common('receiptLabelReceipt'),
      cashier: common('receiptLabelCashier'),
      customer: common('receiptLabelCustomer'),
      tin: common('receiptLabelTin'),
      subtotal: common('receiptLabelSubtotal'),
      discounts: common('receiptLabelDiscounts'),
      vat: common('receiptLabelVat'),
      total: common('receiptLabelTotal'),
      payment: common('receiptLabelPayment'),
    };
    const lines = buildReceiptLines(
      {
        receiptNumber: receipt.receiptNumber,
        issuedAt: receipt.issuedAt,
        data: resolvedData,
      },
      32,
      currency,
      locale,
      labels,
      timezone,
      dateFormat,
    );
    try {
      await printEscPosLines(printer, lines);
    } catch (err) {
      console.warn('Failed to print receipt', err);
      setMessage({ action: 'save', outcome: 'failure', message: getApiErrorMessage(err, t('printerConnectFailed')) });
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
    printTimerRef.current = setTimeout(() => window.print(), 100);
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
        const variantList = normalizePaginated(variantData).items;
        setVariants(variantList);
        seedVariantCache(variantList);
        setUnits(unitList);
        setReceiptTemplate(settings.posPolicies?.receiptTemplate || 'THERMAL');
        setCreditEnabled(settings.posPolicies?.creditEnabled ?? false);
        setPriceEditEnabled(settings.posPolicies?.priceEditEnabled ?? false);
        setShiftTrackingEnabled(settings.posPolicies?.shiftTrackingEnabled ?? false);
        const resolvedCurrency = settings.currency ?? 'TZS';
        setStoredCurrency(resolvedCurrency);
        setVatRate(settings.vatRate ?? DEFAULT_VAT_RATE);
        const [customerResult, listResult] = await Promise.allSettled([
          apiFetch<PaginatedResponse<Customer> | Customer[]>('/customers?limit=50', {
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
        meta?: { truncated?: boolean; cacheBuiltAt?: string };
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
      seedVariantCache(mergedVariants);
      setUnits(cache.units ?? []);
      setCustomers(cache.customers ?? []);
      setPriceLists(cache.priceLists ?? []);
      if (cache.settings?.posPolicies) {
        setReceiptTemplate(cache.settings.posPolicies.receiptTemplate || 'THERMAL');
        setCreditEnabled(cache.settings.posPolicies.creditEnabled ?? false);
        setPriceEditEnabled(cache.settings.posPolicies.priceEditEnabled ?? false);
        setShiftTrackingEnabled(cache.settings.posPolicies.shiftTrackingEnabled ?? false);
      }
      if (cache.settings?.currency) {
        setStoredCurrency(cache.settings.currency);
      }
      if (cache.settings?.vatRate !== undefined) {
        setVatRate(cache.settings.vatRate);
      }
      if (cache.meta?.cacheBuiltAt) {
        const ageMs = Date.now() - new Date(cache.meta.cacheBuiltAt).getTime();
        const fourHoursMs = 4 * 60 * 60 * 1000;
        if (ageMs > fourHoursMs) {
          setMessage({ action: 'sync', outcome: 'warning', message: t('staleCacheWarning') });
        }
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
      const dbErr = getDbOpenError();
      if (dbErr) {
        setMessage({ action: 'load', outcome: 'failure', message: t('indexedDbError') });
      }
      const blocked = (await getOfflineFlag('syncBlocked')) === 'true';
      const required = await isOfflinePinRequired();
      setSyncBlocked(blocked);
      setPinRequired(required);
      const lockStatus = await getPinLockStatus();
      setPinLocked(lockStatus.locked);
      setPinLockedUntil(lockStatus.lockedUntil);
      setPinAttempts(lockStatus.attempts);
    };
    loadFlags();
  }, []);

  useEffect(() => {
    if (!cartRestoredRef.current) {
      return;
    }
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
    cartRestoredRef.current = true;
  }, []);

  useEffect(() => {
    return () => {
      resetScanner(scannerRef.current);
      if (printTimerRef.current) clearTimeout(printTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      printer?.close().catch(console.warn);
    };
  }, [printer]);

  useEffect(() => {
    if (!creditEnabled) {
      setCreditSale(false);
    }
  }, [creditEnabled]);

  useEffect(() => {
    if (!coreLoaded || !branchId) return;
    const token = getAccessToken();
    if (!token) return;
    apiFetch<PaginatedResponse<Variant> | Variant[]>(
      `/variants?hasStockBranchId=${encodeURIComponent(branchId)}&limit=500`,
      { token },
    )
      .then((res) => {
        const updated = normalizePaginated(res).items;
        setVariants(updated);
        seedVariantCache(updated);
      })
      .catch(() => {
        // Silently keep existing variants if re-fetch fails
      });
  }, [branchId, coreLoaded]);

  useEffect(() => {
    localStorage.setItem(POS_MODE_KEY, posMode);
  }, [posMode]);

  useEffect(() => {
    if (cart.length === 0) setCartSheetOpen(false);
  }, [cart.length]);

  const paymentMethodLabel = useCallback((method: Payment['method']) => {
    if (method === 'CASH') return t('paymentCash');
    if (method === 'CARD') return t('paymentCard');
    if (method === 'MOBILE_MONEY') return t('paymentMobileMoney');
    if (method === 'BANK_TRANSFER') return t('paymentBankTransfer');
    return t('paymentOther');
  }, [t]);

  const paymentMethodDesc = useCallback((method: Payment['method']): string => {
    if (method === 'CASH') return 'Notes & coins';
    if (method === 'CARD') return 'Bank POS / terminal';
    if (method === 'MOBILE_MONEY') return 'M-Pesa · Airtel · Tigo';
    if (method === 'BANK_TRANSFER') return 'Direct bank deposit';
    return 'Custom method';
  }, []);

  const paymentMethodIcon = useCallback((method: Payment['method']) => {
    if (method === 'CASH') return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="1" y="4" width="16" height="10" rx="2" />
        <circle cx="9" cy="9" r="2.5" />
        <path d="M5 9h.01M13 9h.01" strokeLinecap="round" />
      </svg>
    );
    if (method === 'CARD') return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="1" y="4" width="16" height="10" rx="2" />
        <path d="M1 7.5h16M5 11.5h3" strokeLinecap="round" />
      </svg>
    );
    if (method === 'MOBILE_MONEY') return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="4" y="1" width="10" height="16" rx="2" />
        <circle cx="9" cy="13.5" r="0.8" fill="currentColor" stroke="none" />
        <path d="M7 4.5h4" strokeLinecap="round" />
      </svg>
    );
    if (method === 'BANK_TRANSFER') return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M2 7h14M4 7V15M8 7V15M12 7V15M14 7V15M1 15h16M9 2l8 5H1l8-5z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="9" cy="9" r="7" />
        <path d="M9 6v3.5l2 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }, []);

  const cartInItem = useCallback(
    (variantId: string) => cart.find((i) => i.variant.id === variantId),
    [cart],
  );

  const filteredProductVariants = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    return variants.filter((variant) => {
      // hasStock === false means the backend confirmed zero stock for this branch
      // hasStock === null/undefined means no snapshot exists (untracked) — show it
      if (variant.hasStock === false) {
        return false;
      }
      if (!query) return true;
      const productName = variant.product?.name?.toLowerCase() ?? '';
      const sku = variant.sku?.toLowerCase() ?? '';
      const hasBarcode = variant.barcodes.some((barcode) =>
        barcode.code.toLowerCase().includes(query),
      );
      return (
        variant.name.toLowerCase().includes(query) ||
        productName.includes(query) ||
        sku.includes(query) ||
        hasBarcode
      );
    });
  }, [productQuery, variants]);

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

  const handleOpenShift = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = getAccessToken();
    if (!token || !branchId) return;
    const cashValue = parseFloat(openingCash);
    if (!Number.isFinite(cashValue) || cashValue < 0) return;
    setIsOpeningShift(true);
    try {
      const shift = await apiFetch<Shift>('/shifts/open', {
        method: 'POST',
        token,
        body: JSON.stringify({
          branchId,
          openingCash: cashValue,
          ...(shiftNotes.trim() ? { notes: shiftNotes.trim() } : {}),
        }),
      });
      setOpenShift(shift);
      setShiftModalOpen(false);
      setOpeningCash('');
      setShiftNotes('');
      setMessage({ action: 'save', outcome: 'success', message: t('openShiftSuccess') });
    } catch (err) {
      setMessage({ action: 'save', outcome: 'failure', message: getApiErrorMessage(err, t('openShiftFailed')) });
    } finally {
      setIsOpeningShift(false);
    }
  };

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
  }, [handleBarcodeScan]);

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
    const priceListId = selectedCustomer?.priceListId ?? null;
    return priceListId ? priceLists.find((list) => list.id === priceListId) ?? null : null;
  }, [selectedCustomer, priceLists]);

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
        const vatPerUnit = (item.unitPrice * vatRate) / (vatRate + 100);
        return sum + vatPerUnit * item.quantity;
      }
      const vatPerUnit = (item.unitPrice * vatRate) / 100;
      return sum + vatPerUnit * item.quantity;
    }, 0);
    const totalBeforeCart = cart.reduce((sum, item) => {
      const lineTotal =
        item.variant.vatMode === 'EXCLUSIVE'
          ? (item.unitPrice * (1 + vatRate / 100)) * item.quantity
          : item.unitPrice * item.quantity;
      return sum + lineTotal - item.lineDiscount;
    }, 0);
    const total = totalBeforeCart - cartDiscount;
    return { subtotal, lineDiscount, vatTotal, total };
  }, [cart, cartDiscount, vatRate]);

  const addToCart = (variant: Variant, barcode?: string) => {
    if (!branchId) {
      setMessage({ action: 'save', outcome: 'warning', message: t('branchRequired') });
      return;
    }
    if (variant.hasStock === false) {
      setMessage({ action: 'save', outcome: 'warning', message: t('outOfStock') });
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
            ? { ...item, quantity: item.quantity + 1, ...(barcode ? { barcode } : {}) }
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
    // Trigger card flash
    setLastAddedVariantId(variant.id);
    setTimeout(
      () => setLastAddedVariantId((prev) => (prev === variant.id ? null : prev)),
      700,
    );
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
      const rearCamera = videoDevices.find((d) => /back|rear|environment/i.test(d.label));
      const deviceId = (rearCamera ?? videoDevices[0])?.deviceId;
      await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result) => {
        if (result) {
          const code = result.getText();
          handleBarcodeScan(code);
        }
      });
      setScanActive(true);
    } catch (err) {
      console.warn('Failed to start barcode scanner', err);
      const isPermissionDenied = err instanceof Error && err.name === 'NotAllowedError';
      setScanMessage(isPermissionDenied ? t('cameraPermissionDenied') : t('cameraUnavailable'));
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
    if (creditSale && paymentTotal > total + 0.01) {
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
              vatRate,
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
        setMessage({ action: 'sync', outcome: 'failure', message });
        setIsCompleting(false);
        return;
      }
      setCart([]);
      setCartDiscount(0);
      setPayments([{ method: 'CASH', amount: 0 }]);
      setMessage({
        action: 'save',
        outcome: 'success',
        message: t('offlineQueued', { receiptNumber: localReceiptNumber }),
      });
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
            vatRate,
            lineDiscount: item.lineDiscount,
            barcode: item.barcode,
          })),
        }),
      });
      if (draft?.approvalRequired) {
        setMessage({ action: 'save', outcome: 'warning', message: t('discountNeedsApproval') });
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
      setSessionSaleCount((c) => c + 1);
      setSessionTotal((s) => s + totals.total);
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
    cart.length > 0 || availableBranches.length === 0;
  const branchSelectionRequired =
    !branchId && availableBranches.length > 0;
  const showLoadingOverlay = !coreLoaded;
  const cartUnits = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );
  const activeBranchName = branchId
    ? availableBranches.find((branch) => branch.id === branchId)?.name ?? t('selectBranch')
    : t('selectBranch');

  // ─────────────────────────────────────────────────────────────
  // NO ACCESS guard
  // ─────────────────────────────────────────────────────────────
  if (!canWrite) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black">
        <NoAccessState permission="sales.write" path={pathname || '/pos'} />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // SHARED: POS Top Bar
  // ─────────────────────────────────────────────────────────────
  const posTopBar = (
    <div className="relative flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gold-800/40 bg-[#060609] px-4">
      {/* Thin gold gradient accent line at the very bottom of the bar */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-500/50 to-transparent" />
      {/* Left: brand + context */}
      <div className="flex min-w-0 items-center gap-3">
        {/* Logo mark */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gold-400 to-amber-600 text-xs font-black text-black shadow">
          N
        </div>
        <span className="shrink-0 text-base font-bold tracking-[0.18em] text-gold-200">POS</span>
        <div className="hidden h-5 w-px shrink-0 bg-gold-700/40 sm:block" />
        {storedUser?.name ? (
          <span className="hidden shrink-0 text-sm font-semibold text-gold-300 sm:block">{storedUser.name}</span>
        ) : null}
        {/* Branch selector — custom styled dropdown */}
        {availableBranches.length > 1 ? (
          <div className="relative hidden sm:block">
            <button
              type="button"
              disabled={branchSelectDisabled}
              onClick={() => setBranchDropdownOpen((o) => !o)}
              onBlur={() => setTimeout(() => setBranchDropdownOpen(false), 160)}
              title={branchSelectDisabled && cart.length > 0 ? 'Clear cart to change branch' : undefined}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                branchSelectDisabled
                  ? 'cursor-not-allowed border-gold-800/30 text-gold-700 opacity-60'
                  : branchDropdownOpen
                    ? 'border-gold-500/50 bg-gold-400/[0.07] text-gold-200'
                    : 'border-gold-700/30 bg-black/60 text-gold-300 hover:border-gold-600/50 hover:bg-black/80 hover:text-gold-100'
              }`}
            >
              {/* Branch / store icon */}
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="shrink-0">
                <path d="M1 10V4.5L5.5 1 10 4.5V10" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="3.5" y="6.5" width="4" height="3.5" rx="0.5" />
              </svg>
              <span className="max-w-[130px] truncate">{branchId ? activeBranchName : t('selectBranch')}</span>
              {/* Chevron — flips when open */}
              <svg
                width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"
                className={`shrink-0 transition-transform ${branchDropdownOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              >
                <path d="M1.5 2.5l2.5 3 2.5-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Floating branch list */}
            {branchDropdownOpen && !branchSelectDisabled ? (
              <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-gold-700/30 bg-[#11131b] shadow-2xl">
                {/* Thin gold top accent */}
                <div className="h-px w-full bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
                <div className="py-1">
                  {availableBranches.map((b) => {
                    const active = b.id === branchId;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onMouseDown={() => { setBranchId(b.id); setBranchDropdownOpen(false); }}
                        className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition ${
                          active
                            ? 'bg-gold-400/[0.08] text-gold-100'
                            : 'text-gold-400 hover:bg-gold-400/[0.05] hover:text-gold-200'
                        }`}
                      >
                        {/* Checkmark for active, indent spacer for others */}
                        {active ? (
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-gold-400" aria-hidden="true">
                            <path d="M1.5 5.5l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <span className="w-[11px] shrink-0" />
                        )}
                        <span className="truncate font-medium">{b.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : branchId ? (
          <span className="hidden truncate text-xs text-gold-500 lg:block">· {activeBranchName}</span>
        ) : null}
        {shiftTrackingEnabled && openShift ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" style={{ animation: 'nvi-ping-dot 2.5s ease-in-out infinite' }} />
            <span className="hidden sm:inline">{t('shiftOpen')}</span>
          </span>
        ) : null}
        {offline ? (
          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">OFFLINE</span>
        ) : null}
        {pendingSyncCount > 0 ? (
          <span className="hidden rounded bg-blue-500/15 px-2 py-0.5 text-xs text-blue-300 sm:inline">{pendingSyncCount} pending</span>
        ) : null}
      </div>

      {/* Center: device mode switcher */}
      <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-gold-700/30 bg-black/70 p-1">
        {(
          [
            {
              mode: 'phone' as const,
              label: 'Phone',
              icon: (
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                  <rect x="3.5" y="1" width="8" height="13" rx="1.5" />
                  <circle cx="7.5" cy="11.5" r="0.7" fill="currentColor" stroke="none" />
                </svg>
              ),
            },
            {
              mode: 'tablet' as const,
              label: 'Tablet',
              icon: (
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                  <rect x="1" y="2.5" width="13" height="10" rx="1.5" />
                  <circle cx="12" cy="7.5" r="0.7" fill="currentColor" stroke="none" />
                </svg>
              ),
            },
            {
              mode: 'desktop' as const,
              label: 'Desktop',
              icon: (
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                  <rect x="1" y="1.5" width="13" height="8.5" rx="1.2" />
                  <path d="M5 13h5M7.5 10V13" strokeLinecap="round" />
                </svg>
              ),
            },
          ] as const
        ).map(({ mode, label, icon }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setPosMode(mode)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              posMode === mode
                ? 'bg-gold-400/20 text-gold-200'
                : 'text-gold-1000 hover:text-gold-400'
            }`}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Right: clock + session stats + shift CTA + exit */}
      <div className="flex shrink-0 items-center gap-3">
        {/* Live clock with pulsing dot */}
        {clockTime ? (
          <span className="hidden items-center gap-1.5 sm:flex">
            <span
              className="h-2 w-2 rounded-full bg-gold-400"
              style={{ animation: 'nvi-ping-dot 2s ease-in-out infinite' }}
            />
            <span className="font-mono text-sm font-semibold tabular-nums text-gold-200">{clockTime}</span>
          </span>
        ) : null}
        {/* Session totals */}
        {sessionSaleCount > 0 ? (
          <span className="hidden rounded-lg bg-gold-400/10 px-2.5 py-1 text-xs font-medium text-gold-400 lg:block">
            {sessionSaleCount} {sessionSaleCount === 1 ? 'sale' : 'sales'} · {amountFormatter.format(sessionTotal)}
          </span>
        ) : null}
        {shiftTrackingEnabled && !openShift && canOpenShift ? (
          <button
            type="button"
            onClick={() => setShiftModalOpen(true)}
            className="rounded-lg border border-amber-400/50 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10"
          >
            {t('openShiftBtn')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => router.push(`/${locale}`)}
          className="flex items-center gap-1.5 rounded-lg border border-gold-700/40 px-3 py-1.5 text-xs font-medium text-gold-300 transition hover:border-gold-600 hover:text-gold-100"
        >
          <span>Exit POS</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M4 2H2a1 1 0 00-1 1v4a1 1 0 001 1h2M7 3l2 2-2 2M9 5H4" />
          </svg>
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // SHARED: Status strips
  // ─────────────────────────────────────────────────────────────
  const statusStrip = (
    <>
      {message ? (
        <div className="shrink-0"><StatusBanner message={message} /></div>
      ) : null}
      {branchSelectionRequired ? (
        <div className="shrink-0"><StatusBanner message={t('branchSelectRequired')} variant="warning" /></div>
      ) : null}
      {shiftTrackingEnabled && !openShift ? (
        <div className="flex shrink-0 items-center gap-2 bg-amber-950/60 px-4 py-2 text-xs text-amber-200">
          <span>⚠</span><span>{t('openShiftRequired')}</span>
        </div>
      ) : null}
    </>
  );

  // ─────────────────────────────────────────────────────────────
  // SHARED: Stats strip — always-visible situational snapshot
  // ─────────────────────────────────────────────────────────────
  const statsStrip = coreLoaded ? (
    <div className="flex shrink-0 items-stretch border-b border-gold-900/30 bg-[#0d0f16]/70">
      {/* Items in cart */}
      <div className="flex flex-col justify-center gap-0.5 border-r border-gold-900/20 px-4 py-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-gold-700">Items</p>
        <p className="text-sm font-bold tabular-nums text-gold-300">{cartUnits}</p>
      </div>
      {/* Running total */}
      <div className="flex flex-col justify-center gap-0.5 border-r border-gold-900/20 px-4 py-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-gold-700">Total</p>
        <p className="text-sm font-bold tabular-nums text-gold-200">{amountFormatter.format(totals.total)}</p>
      </div>
      {/* Connection status */}
      <div className="flex flex-col justify-center gap-0.5 px-4 py-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-gold-700">Status</p>
        <span className={`flex items-center gap-1.5 text-xs font-semibold ${offline ? 'text-amber-400' : 'text-emerald-400'}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${offline ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          {offline ? 'Offline' : 'Online'}
        </span>
      </div>
      {/* Branch on larger screens */}
      {branchId ? (
        <div className="ml-auto hidden flex-col justify-center gap-0.5 border-l border-gold-900/20 px-4 py-2 lg:flex">
          <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-gold-700">Branch</p>
          <p className="max-w-[140px] truncate text-xs font-semibold text-gold-400">{activeBranchName}</p>
        </div>
      ) : null}
    </div>
  ) : null;

  const offlinePinStrip = offline && pinRequired && !pinVerified ? (
    <div className="shrink-0 border-b border-red-800/40 bg-red-950/60 px-4 py-3">
      <p className="mb-2 text-xs font-semibold text-red-200">{t('pinRequiredTitle')}</p>
      {pinLocked ? (
        <p className="mb-2 text-[11px] text-amber-300">
          {t('pinLocked', { until: pinLockedUntil ? new Date(pinLockedUntil).toLocaleTimeString() : '' })}
        </p>
      ) : pinAttempts > 0 ? (
        <p className="mb-2 text-[11px] text-amber-400">
          {t('pinInvalid', { remaining: Math.max(0, 5 - pinAttempts) })}
        </p>
      ) : null}
      <div className="flex gap-2">
        <input
          type="password"
          value={pinInput}
          disabled={pinLocked}
          onChange={(e) => setPinInput(e.target.value)}
          placeholder={t('pinPlaceholder')}
          className="rounded border border-red-700/50 bg-black px-3 py-1.5 text-xs text-gold-100 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={pinLocked}
          onClick={async () => {
            const result = await verifyOfflinePin(pinInput);
            setPinAttempts(result.attempts);
            setPinLocked(result.locked);
            setPinLockedUntil(result.lockedUntil);
            if (result.success) {
              setPinVerified(true);
              setMessage({ action: 'sync', outcome: 'success', message: t('pinVerified') });
            } else if (result.locked) {
              setMessage({ action: 'sync', outcome: 'failure', message: t('pinLocked', { until: result.lockedUntil ? new Date(result.lockedUntil).toLocaleTimeString() : '' }) });
            } else {
              setMessage({ action: 'sync', outcome: 'failure', message: t('pinInvalid', { remaining: Math.max(0, 5 - result.attempts) }) });
            }
            setPinInput('');
          }}
          className="rounded border border-red-700/50 px-3 py-1.5 text-xs text-red-100 disabled:opacity-50"
        >
          {t('unlock')}
        </button>
      </div>
    </div>
  ) : null;

  // ─────────────────────────────────────────────────────────────
  // SHARED: Search / Scan bar
  // ─────────────────────────────────────────────────────────────
  const searchBar = (
    <div className="flex shrink-0 items-center gap-2 border-b border-gold-700/20 px-4 py-3">
      <div className="relative flex-1">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gold-1000" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="6" cy="6" r="4.5" />
          <path d="M9.5 9.5l3 3" strokeLinecap="round" />
        </svg>
        <TypeaheadInput
          value={search}
          onChange={setSearch}
          options={variantOptions}
          onSelect={(option) => {
            const variant = variants.find((v) => v.id === option.id);
            if (variant) { addToCart(variant); setSearch(''); }
          }}
          onEnter={handleSearchSubmit}
          placeholder={t('scanOrSearch')}
          className="w-full rounded-xl border border-gold-700/40 bg-black/70 py-2.5 pl-9 pr-3 text-sm text-gold-100 placeholder:text-gold-1000 focus:border-gold-500 focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={scanActive ? stopScan : startScan}
        className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition ${
          scanActive
            ? 'border-rose-500/60 bg-rose-500/10 text-rose-300'
            : 'border-gold-700/40 text-gold-400 hover:border-gold-600 hover:text-gold-200'
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M1 4V2a1 1 0 011-1h2M9 1h2a1 1 0 011 1v2M12 9v2a1 1 0 01-1 1H9M4 12H2a1 1 0 01-1-1V9" />
          <rect x="4" y="4" width="5" height="5" rx="0.5" />
        </svg>
        <span className="hidden sm:inline">{scanActive ? t('scanStop') : t('scanStart')}</span>
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // SHARED: Product tile grid  (colClass e.g. 'grid-cols-2' or 'grid-cols-3')
  // ─────────────────────────────────────────────────────────────
  const buildProductGrid = (colClass: string) => (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-3">
        <input
          value={productQuery}
          onChange={(e) => setProductQuery(e.target.value)}
          placeholder={t('productSearchPlaceholder')}
          className="w-full rounded-xl border border-gold-700/30 bg-black/50 px-3 py-2 text-xs text-gold-100 placeholder:text-gold-1000 focus:border-gold-500 focus:outline-none"
        />
      </div>
      <div className={`mx-4 mb-4 overflow-hidden rounded-xl border border-gold-700/40 bg-black/80 ${scanActive ? '' : 'hidden'}`}>
        <video ref={videoRef} className="w-full" />
        {scanMessage ? (
          <p className="px-3 py-2 text-center text-xs text-gold-400">{scanMessage}</p>
        ) : null}
      </div>
      {filteredProductVariants.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-gold-1000">{t('productNoResults')}</p>
      ) : (
        <div className={`grid gap-3 px-4 pb-4 ${colClass}`}>
          {filteredProductVariants.map((variant) => {
            const displayName = formatVariantLabel({
              id: variant.id,
              name: variant.name,
              productName: variant.product?.name ?? null,
            });
            const price = priceListMap.get(variant.id) ?? variant.defaultPrice ?? null;
            const inCart = cartInItem(variant.id);
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => addToCart(variant)}
                style={lastAddedVariantId === variant.id ? { animation: 'nvi-card-flash 700ms ease forwards' } : undefined}
                className="pos-product-card pos-hoverable group relative flex flex-col overflow-hidden rounded-2xl border border-gold-900/40 text-left active:scale-[0.97]"
              >
                <div className="pos-shine" aria-hidden="true" />
                <div className="relative aspect-square w-full overflow-hidden bg-[#0d0f16]">
                  {variant.imageUrl ? (
                    <img
                      src={variant.imageUrl}
                      alt={displayName}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl font-bold text-gold-700">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  {inCart ? (
                    <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold-400 text-[10px] font-bold text-black shadow">
                      {inCart.quantity}
                    </div>
                  ) : (
                    <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-gold-700/40 bg-black/60 text-[10px] text-gold-1000 opacity-0 transition group-hover:opacity-100">
                      +
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between p-2.5">
                  {/* Category badge — product name as context */}
                  {variant.product?.name ? (
                    <p className="mb-1 truncate text-[9px] font-semibold uppercase tracking-[0.15em] text-gold-1000">
                      {variant.product.name}
                    </p>
                  ) : null}
                  <p className="line-clamp-2 text-xs font-semibold leading-tight text-gold-100">{variant.name}</p>
                  <p className="mt-1.5 text-sm font-bold tabular-nums text-gold-300">
                    {price !== null ? amountFormatter.format(Number(price)) : '—'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // SHARED: Cart item list
  // ─────────────────────────────────────────────────────────────
  const cartItemList = (
    <div className="flex-1 overflow-y-auto">
      {/* Customer — typeahead search + badge */}
      <div className="border-b border-gold-700/20 px-4 py-3">
        {selectedCustomer ? (
          /* ── Selected customer badge ── */
          <div className="flex items-center gap-3 rounded-xl border border-gold-700/30 bg-[#11131b] px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-400/10 text-sm font-bold text-gold-400">
              {selectedCustomer.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gold-100">{selectedCustomer.name}</p>
              {selectedCustomer.tinNumber ? (
                <p className="mt-0.5 text-[10px] font-medium tracking-wide text-gold-500">
                  TIN · {selectedCustomer.tinNumber}
                </p>
              ) : (
                <p className="mt-0.5 text-[10px] text-gold-700">{t('customerOptional')}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setCustomerId('');
                setSelectedCustomer(null);
                setCustomerQuery('');
              }}
              aria-label="Remove customer"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-gold-1000 transition hover:bg-red-500/10 hover:text-red-400"
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M1.5 1.5l6 6M7.5 1.5l-6 6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : (
          /* ── Customer search input + dropdown ── */
          <div className="relative">
            <div className="relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gold-1000" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="5.5" cy="5" r="3.5" />
                <path d="M8.5 8.5l3 3" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                onFocus={() => {
                  setCustomerFocused(true);
                  if (!customerQuery) setCustomerResults(customers.slice(0, 8));
                }}
                onBlur={() => setTimeout(() => setCustomerFocused(false), 150)}
                placeholder={t('customerOptional')}
                className="w-full rounded-xl border border-gold-700/30 bg-[#0d0f16] py-2.5 pl-9 pr-3 text-sm text-gold-100 placeholder:text-gold-1000 focus:border-gold-500 focus:outline-none"
              />
            </div>
            {/* Dropdown */}
            {customerFocused && customerResults.length > 0 ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-gold-700/30 bg-[#11131b] shadow-2xl">
                {customerResults.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onMouseDown={() => {
                      setCustomerId(customer.id);
                      setSelectedCustomer(customer);
                      setCustomerQuery('');
                      setCustomerFocused(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gold-400/[0.08]"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-400/10 text-[11px] font-bold text-gold-400">
                      {customer.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gold-100">{customer.name}</p>
                      {customer.tinNumber ? (
                        <p className="text-[10px] text-gold-1000">TIN · {customer.tinNumber}</p>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
        {activePriceList ? (
          <p className="mt-2 text-[11px] text-gold-500">{t('priceListLabel', { name: activePriceList.name })}</p>
        ) : null}
      </div>

      {/* Empty state */}
      {cart.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <svg className="mb-3 text-gold-700" width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <path d="M5 5h4l5 18h14l5-12H12" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="17" cy="30" r="1.8" />
            <circle cx="26" cy="30" r="1.8" />
          </svg>
          <p className="text-sm text-gold-1000">{t('cartEmpty')}</p>
        </div>
      ) : (
        <div className="divide-y divide-gold-700/20">
          {cart.map((item, index) => {
            const displayName = formatVariantLabel({
              id: item.variant.id,
              name: item.variant.name,
              productName: item.variant.product?.name ?? null,
            });
            const lineTotal = item.unitPrice * item.quantity - item.lineDiscount;
            return (
              <div
                key={`${item.variant.id}-${index}`}
                style={{ animation: 'nvi-cart-slide-in 220ms ease forwards' }}
                className="px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gold-100">{displayName}</p>
                    {item.variant.minPrice && item.unitPrice < item.variant.minPrice ? (
                      <p className="text-[10px] text-red-400">{t('minPriceLabel', { value: item.variant.minPrice })}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-gold-200">
                      {amountFormatter.format(lineTotal)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCartItem(index)}
                      aria-label="Remove"
                      className="flex h-5 w-5 items-center justify-center rounded text-gold-1000 hover:text-red-400"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path d="M2 2l6 6M8 2L2 8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {/* Qty stepper */}
                  <div className="flex items-center rounded-lg border border-gold-900/40 bg-[#0d0f16]">
                    <button
                      type="button"
                      onClick={() => updateCartItem(index, { quantity: Math.max(1, item.quantity - 1) })}
                      className="flex h-8 w-8 items-center justify-center rounded-l-lg text-lg text-gold-400 hover:bg-gold-700/20 hover:text-gold-200"
                    >
                      −
                    </button>
                    <span className="w-9 text-center text-sm tabular-nums text-gold-100">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateCartItem(index, { quantity: item.quantity + 1 })}
                      className="flex h-8 w-8 items-center justify-center rounded-r-lg text-lg text-gold-400 hover:bg-gold-700/20 hover:text-gold-200"
                    >
                      +
                    </button>
                  </div>
                  {/* Unit */}
                  <div className="min-w-[110px] flex-1">
                    <SmartSelect
                      instanceId={`pos-unit-${index}`}
                      value={item.unitId || ''}
                      onChange={(value) => {
                        const nextUnitId = value;
                        const currentUnitId = item.unitId;
                        if (nextUnitId && currentUnitId && nextUnitId !== currentUnitId) {
                          const currentFactor = resolveUnitFactor(item.variant, currentUnitId);
                          const nextFactor = resolveUnitFactor(item.variant, nextUnitId);
                          const nextPrice = Number((item.unitPrice * (nextFactor / currentFactor)).toFixed(2));
                          updateCartItem(index, { unitId: nextUnitId, unitPrice: nextPrice });
                          return;
                        }
                        updateCartItem(index, { unitId: nextUnitId });
                      }}
                      options={getVariantUnitOptions(item.variant).map((u) => ({ value: u.id, label: buildUnitLabel(u) }))}
                      placeholder={t('unit')}
                    />
                  </div>
                  {/* Unit price */}
                  <input
                    type="number"
                    value={item.unitPrice}
                    readOnly={!priceEditEnabled}
                    onChange={(e) => {
                      if (priceEditEnabled) updateCartItem(index, { unitPrice: Number(e.target.value) });
                    }}
                    className={`w-24 rounded-lg border border-gold-700/40 bg-[#0d0f16] px-2 py-1.5 text-xs tabular-nums text-gold-100 focus:outline-none ${priceEditEnabled ? 'focus:border-gold-500' : 'cursor-default opacity-60'}`}
                    placeholder={t('unitPrice')}
                  />
                  {/* Line discount */}
                  <input
                    type="number"
                    value={item.lineDiscount || ''}
                    onChange={(e) => updateCartItem(index, { lineDiscount: Number(e.target.value) || 0 })}
                    className="w-20 rounded-lg border border-gold-700/40 bg-black/60 px-2 py-1.5 text-xs tabular-nums text-gold-500 placeholder:text-gold-700 focus:border-gold-500 focus:outline-none"
                    placeholder={t('discount')}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cart-level discount */}
      {cart.length > 0 ? (
        <div className="flex items-center justify-between border-t border-gold-700/20 px-4 py-2">
          <span className="text-xs text-gold-500">{t('cartDiscount')}</span>
          <input
            type="number"
            value={cartDiscount || ''}
            onChange={(e) => setCartDiscount(Number(e.target.value) || 0)}
            className="w-24 rounded-lg border border-gold-700/40 bg-black/60 px-2 py-1.5 text-xs tabular-nums text-gold-100 focus:border-gold-500 focus:outline-none"
          />
        </div>
      ) : null}
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // SHARED: Totals + Payment + CTA
  // ─────────────────────────────────────────────────────────────
  const totalsAndPayment = (
    <div className="shrink-0 border-t border-gold-800/30 bg-[#060609]">
      {/* Amount Due — large prominent display */}
      <div className="border-b border-gold-900/30 pos-amount-zone px-4 pb-4 pt-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-gold-1000">
          {t('total')}
        </p>
        <p className="mt-1 text-5xl font-extrabold tabular-nums tracking-tight text-gold-100">
          {amountFormatter.format(totals.total)}
        </p>
        {/* Breakdown row */}
        {(totals.subtotal !== totals.total || totals.vatTotal > 0 || totals.lineDiscount + cartDiscount > 0) ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-gold-1000">
            <span>{t('subtotal')} <span className="tabular-nums text-gold-500">{amountFormatter.format(totals.subtotal)}</span></span>
            {totals.lineDiscount + cartDiscount > 0 ? (
              <span>{t('discounts')} <span className="tabular-nums text-red-400">−{amountFormatter.format(totals.lineDiscount + cartDiscount)}</span></span>
            ) : null}
            {totals.vatTotal > 0 ? (
              <span>{t('vat')} <span className="tabular-nums text-gold-500">{amountFormatter.format(totals.vatTotal)}</span></span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Payments */}
      <div className="space-y-4 px-4 pb-4 pt-3">
        {payments.map((payment, index) => (
          <div key={`payment-${index}`} className="space-y-3">
            {/* Section label + remove */}
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-gold-700">
                Payment Method
              </p>
              {index > 0 ? (
                <button
                  type="button"
                  onClick={() => setPayments((prev) => prev.filter((_, i) => i !== index))}
                  className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-400"
                >
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M1.5 1.5l6 6M7.5 1.5l-6 6" strokeLinecap="round" /></svg>
                  Remove
                </button>
              ) : null}
            </div>
            {/* Method cards — 2-col grid */}
            <div className="grid grid-cols-2 gap-2">
              {(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER'] as const).map((method) => {
                const selected = payment.method === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => updatePayment(index, { method })}
                    className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition ${
                      method === 'OTHER' ? 'col-span-2' : ''
                    } ${
                      selected
                        ? 'border-gold-500/50 bg-gold-400/[0.08]'
                        : 'border-gold-900/30 bg-[#11141d] hover:border-gold-700/40 hover:bg-[#151824]'
                    }`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-gold-400/20 text-gold-300' : 'bg-[#13161f] text-gold-1000'}`}>
                      {paymentMethodIcon(method)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold leading-tight ${selected ? 'text-gold-100' : 'text-gold-400'}`}>
                        {paymentMethodLabel(method)}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-tight text-gold-700">
                        {paymentMethodDesc(method)}
                      </p>
                    </div>
                    {selected ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-gold-400" aria-hidden="true">
                        <path d="M2 7l4 4 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {payment.method === 'OTHER' ? (
              <input
                value={payment.methodLabel || ''}
                onChange={(e) => updatePayment(index, { methodLabel: e.target.value })}
                placeholder={t('paymentLabel')}
                className="w-full rounded-lg border border-gold-700/40 bg-[#0d0f16] px-3 py-2 text-xs text-gold-100 focus:border-gold-500 focus:outline-none"
              />
            ) : null}
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={
                  payment.amount === 0
                    ? ''
                    : new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(payment.amount)
                }
                onChange={(e) => {
                  const el = e.target;
                  const selStart = el.selectionStart ?? el.value.length;
                  const raw = el.value.replace(/\D/g, '');
                  const numericValue = Number(raw) || 0;
                  const formatted = raw
                    ? new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(numericValue)
                    : '';
                  // Count digits before the cursor position in the old value
                  const digitsBeforeCursor = el.value.slice(0, selStart).replace(/\D/g, '').length;
                  updatePayment(index, { amount: numericValue });
                  // Restore cursor after React re-renders with the formatted value
                  requestAnimationFrame(() => {
                    if (document.activeElement !== el) return;
                    let digits = 0;
                    let newPos = formatted.length;
                    if (digitsBeforeCursor === 0) {
                      newPos = 0;
                    } else {
                      for (let i = 0; i < formatted.length; i++) {
                        if (/\d/.test(formatted[i])) {
                          digits++;
                          if (digits === digitsBeforeCursor) { newPos = i + 1; break; }
                        }
                      }
                    }
                    try { el.setSelectionRange(newPos, newPos); } catch { /* read-only */ }
                  });
                }}
                placeholder={t('amount')}
                className="flex-1 rounded-lg border border-gold-700/40 bg-[#0d0f16] px-3 py-2.5 text-sm tabular-nums text-gold-100 focus:border-gold-500 focus:outline-none"
              />
              <input
                value={payment.reference || ''}
                onChange={(e) => updatePayment(index, { reference: e.target.value })}
                placeholder={t('referenceOptional')}
                className="w-28 rounded-lg border border-gold-700/40 bg-[#0d0f16] px-3 py-2.5 text-xs text-gold-500 focus:border-gold-500 focus:outline-none"
              />
            </div>
            {/* Quick-cash presets — shown for CASH payment only */}
            {payment.method === 'CASH' ? (() => {
              const otherPaid = payments.reduce((s, p, i) => i === index ? s : s + p.amount, 0);
              const remaining = Math.max(0, totals.total - otherPaid);
              const rounds = CASH_QUICK_AMOUNTS.filter((a) => a > remaining).slice(0, 4);
              return (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updatePayment(index, { amount: remaining })}
                    className="rounded-lg border border-gold-600/40 bg-gold-400/10 px-2.5 py-1 text-[11px] font-semibold text-gold-300 transition hover:bg-gold-400/20"
                  >
                    Exact
                  </button>
                  {rounds.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => updatePayment(index, { amount: amt })}
                      className="rounded-lg border border-gold-700/30 px-2.5 py-1 text-[11px] text-gold-500 transition hover:border-gold-600 hover:text-gold-300"
                    >
                      {formatQuickAmount(amt)}
                    </button>
                  ))}
                </div>
              );
            })() : null}
          </div>
        ))}
        <button
          type="button"
          onClick={addPayment}
          className="flex items-center gap-1.5 rounded-lg border border-gold-700/30 px-3 py-2 text-xs text-gold-500 transition hover:border-gold-600 hover:text-gold-300"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M5.5 1v9M1 5.5h9" strokeLinecap="round" />
          </svg>
          {t('addPayment')}
        </button>

        {/* Credit sale */}
        {creditEnabled ? (
          <div className="rounded-xl border border-gold-700/20 bg-black/40 p-3">
            <label className="flex items-center gap-2 text-xs text-gold-400">
              <input
                type="checkbox"
                checked={creditSale}
                onChange={(e) => setCreditSale(e.target.checked)}
                className="accent-gold-400"
              />
              {t('creditSale')}
            </label>
            {creditSale ? (
              <div className="mt-2">
                <DatePickerInput
                  value={creditDueDate}
                  onChange={setCreditDueDate}
                  className="w-full rounded-lg border border-gold-700/40 bg-black px-3 py-2 text-xs text-gold-100"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Complete Sale CTA */}
      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={completeSale}
          disabled={isCompleting || cart.length === 0}
          className="nvi-cta pos-cta flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-black disabled:opacity-50"
        >
          {isCompleting ? (
            <>
              <Spinner variant="orbit" size="xs" />
              <span>{t('completing')}</span>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 8l4 4 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{t('completeSale')}</span>
            </>
          )}
        </button>

        {/* Printer controls */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={connectPrinter}
            disabled={isConnectingPrinter}
            className="flex items-center gap-1.5 rounded-lg border border-gold-700/40 px-3 py-2 text-xs text-gold-400 transition hover:border-gold-500 hover:text-gold-200 disabled:opacity-50"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="2" y="4" width="8" height="5" rx="1" />
              <path d="M4 4V2h4v2M4 7h4" strokeLinecap="round" />
            </svg>
            {isConnectingPrinter
              ? t('printerConnecting')
              : printer
                ? <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" /> {t('connectPrinter')}</>
                : t('connectPrinter')}
          </button>
          {lastReceipt ? (
            <button
              type="button"
              onClick={() => setPreviewReceipt(lastReceipt)}
              className="flex items-center gap-1.5 rounded-lg border border-gold-700/40 px-3 py-2 text-xs text-gold-400 transition hover:border-gold-500 hover:text-gold-200"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <rect x="2" y="1" width="8" height="10" rx="1" />
                <path d="M4 4h4M4 6.5h4M4 9h2" strokeLinecap="round" />
              </svg>
              {t('previewAndPrint')}
            </button>
          ) : null}
          {printer && lastReceipt ? (
            <button
              type="button"
              onClick={() => printReceipt(lastReceipt)}
              className="flex items-center gap-1.5 rounded-lg border border-gold-700/40 px-3 py-2 text-xs text-gold-400 transition hover:border-gold-500 hover:text-gold-200"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M6 2v6M3.5 5.5 6 8l2.5-2.5M2 10h8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t('printLastReceipt')}
            </button>
          ) : null}
          {printer ? (
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gold-700/30 px-3 py-2 text-xs text-gold-500 transition hover:border-gold-600 hover:text-gold-300">
              <input
                type="checkbox"
                checked={useHardwarePrint}
                onChange={(e) => setUseHardwarePrint(e.target.checked)}
                className="accent-gold-400"
              />
              {t('hardwarePrint')}
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // DESKTOP LAYOUT (≥1024px)
  // ─────────────────────────────────────────────────────────────
  const desktopLayout = (
    <div className="flex min-h-0 flex-1">
      {/* Left 45%: search bar + product grid */}
      <div className="flex w-[45%] shrink-0 flex-col border-r border-gold-800/30">
        {searchBar}
        {buildProductGrid('grid-cols-3')}
      </div>
      {/* Right 55%: cart (flex-1) + payment panel (capped, scrollable) */}
      <div className="flex min-w-0 flex-1 flex-col">
        {cartItemList}
        {/*
          Payment panel is bounded to 60% of the column so the cart above is
          always visible. Overflowing content scrolls within the panel.
        */}
        <div className="max-h-[60%] shrink-0 overflow-y-auto">
          {totalsAndPayment}
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // TABLET LAYOUT (640px–1023px) — 3-tab interface
  // ─────────────────────────────────────────────────────────────
  const tabletLayout = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-gold-700/20 bg-black/80">
        {(['products', 'cart', 'pay'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`relative flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition ${
              mobileTab === tab
                ? 'border-b-2 border-gold-400 text-gold-200'
                : 'text-gold-1000 hover:text-gold-400'
            }`}
          >
            {tab === 'products' ? (
              t('productsTitle')
            ) : tab === 'cart' ? (
              <span className="inline-flex items-center justify-center gap-1.5">
                {t('cartTitle')}
                {cart.length > 0 ? (
                  <span className="rounded-full bg-gold-400 px-1.5 py-0.5 text-[9px] font-bold text-black">
                    {cart.length}
                  </span>
                ) : null}
              </span>
            ) : (
              t('totalsTitle')
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {mobileTab === 'products' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {searchBar}
          {buildProductGrid('grid-cols-3')}
        </div>
      ) : mobileTab === 'cart' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {cartItemList}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {totalsAndPayment}
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // PHONE LAYOUT (<640px) — product grid + bottom strip + cart sheet
  // ─────────────────────────────────────────────────────────────
  const phoneLayout = (
    <div className="flex min-h-0 flex-1 flex-col">
      {searchBar}
      {buildProductGrid('grid-cols-2')}

      {/* Sticky bottom strip: cart summary + open-sheet button */}
      <div className="flex shrink-0 items-center justify-between border-t border-gold-700/20 bg-black/90 px-4 py-3">
        <div>
          <p className="text-[11px] text-gold-500">
            {cart.length} {cart.length === 1 ? 'item' : 'items'}
          </p>
          <p className="text-base font-bold tabular-nums text-gold-100">
            {amountFormatter.format(totals.total)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { if (cart.length > 0) setCartSheetOpen(true); }}
          disabled={cart.length === 0}
          className="nvi-cta pos-cta flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-black disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M2 2h2l2.5 7.5h5L13 4H5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="7" cy="11.5" r="0.9" fill="currentColor" />
            <circle cx="10.5" cy="11.5" r="0.9" fill="currentColor" />
          </svg>
          Cart ({cart.length})
        </button>
      </div>

      {/* Cart bottom sheet */}
      {cartSheetOpen ? (
        <>
          <div
            className="fixed inset-0 z-[210] bg-black/60 backdrop-blur-sm"
            onClick={() => setCartSheetOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[220] flex max-h-[88vh] flex-col rounded-t-3xl border-t border-gold-700/30 bg-[#11131b] shadow-2xl">
            {/* Sheet header */}
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-gold-700/40" />
            <div className="flex shrink-0 items-center justify-between border-b border-gold-700/20 px-4 py-3">
              <h3 className="text-sm font-semibold text-gold-200">{t('cartTitle')}</h3>
              <button
                type="button"
                onClick={() => setCartSheetOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded text-gold-1000 hover:text-gold-300"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M2 2l7 7M9 2L2 9" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {/* Sheet body */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {cartItemList}
              {totalsAndPayment}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // MODALS (shift open, receipt preview) — shared across all modes
  // ─────────────────────────────────────────────────────────────
  const shiftModal = shiftModalOpen ? (
    <div
      role="dialog"
      aria-modal="true"
      className="absolute inset-0 z-[230] flex items-center justify-center bg-black/70 px-4"
      onKeyDown={(e) => { if (e.key === 'Escape') setShiftModalOpen(false); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-gold-700/40 bg-black p-6 text-gold-100 shadow-2xl">
        <p className="text-[10px] uppercase tracking-[0.35em] text-gold-400">{t('openShiftTitle')}</p>
        <h3 className="mt-2 text-xl font-semibold">{t('openShiftTitle')}</h3>
        <p className="mt-1 text-sm text-gold-400">{t('openShiftDesc')}</p>
        <form onSubmit={handleOpenShift} className="mt-4 space-y-4">
          <div className="space-y-1">
            <label htmlFor="pos-opening-cash" className="text-xs uppercase tracking-[0.2em] text-gold-400">
              {t('openingCashLabel')}
            </label>
            <input
              id="pos-opening-cash"
              type="number"
              min="0"
              step="any"
              required
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="0"
              autoComplete="off"
              className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="pos-shift-notes" className="text-xs uppercase tracking-[0.2em] text-gold-400">
              {t('shiftNotesLabel')}
            </label>
            <input
              id="pos-shift-notes"
              type="text"
              value={shiftNotes}
              onChange={(e) => setShiftNotes(e.target.value)}
              autoComplete="off"
              className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShiftModalOpen(false); setOpeningCash(''); setShiftNotes(''); }}
              className="rounded border border-gold-700/60 px-3 py-2 text-xs text-gold-200"
            >
              {common('cancel')}
            </button>
            <button
              type="submit"
              disabled={isOpeningShift || !openingCash}
              className="nvi-cta pos-cta rounded px-4 py-2 text-xs font-semibold text-black disabled:opacity-60"
            >
              {isOpeningShift ? actions('saving') : t('openShiftBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  const receiptModal = previewReceipt ? (
    <div className="absolute inset-0 z-[230] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={common('close')}
        onClick={() => setPreviewReceipt(null)}
        className="absolute inset-0 bg-black/70"
      />
      <div className="relative z-10 w-full max-w-xl space-y-4 rounded border border-gold-700/40 bg-black p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gold-100">{previewT('title')}</h3>
          <button
            type="button"
            onClick={() => setPreviewReceipt(null)}
            className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
          >
            {common('close')}
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {(['compact', 'detailed'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPreviewMode(m)}
              className={`rounded border px-3 py-1 ${previewMode === m ? 'border-gold-500 text-gold-100' : 'border-gold-700/50 text-gold-400'}`}
            >
              {m === 'compact' ? previewT('compact') : previewT('detailed')}
            </button>
          ))}
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
            className="nvi-cta pos-cta rounded px-3 py-2 text-xs font-semibold text-black"
          >
            {previewT('printReceipt')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // ─────────────────────────────────────────────────────────────
  // ROOT RENDER — full-screen fixed overlay over AppShell
  // ─────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden text-gold-100"
      style={{
        background: [
          'radial-gradient(1200px 900px at 14% 0%, rgba(246,211,122,.12), transparent 58%)',
          'radial-gradient(900px 700px at 92% 8%, rgba(100,217,209,.08), transparent 52%)',
          'radial-gradient(1200px 900px at 50% 120%, rgba(246,211,122,.08), transparent 55%)',
          'linear-gradient(180deg, #060609, #0b0b10)',
        ].join(', '),
      }}
    >
      {/* Noise grain texture overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: -1,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.14'/%3E%3C/svg%3E\")",
          mixBlendMode: 'overlay',
          opacity: 0.22,
        }}
      />

      {/* Loading overlay */}
      {showLoadingOverlay ? (
        <div className="absolute inset-0 z-[230] flex items-center justify-center bg-black/80">
          <div className="w-full max-w-sm rounded-2xl border border-gold-700/40 bg-[#11131b] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-gold-700/50">
              <Spinner size="sm" variant="ring" />
            </div>
            <p className="text-sm font-semibold text-gold-100">{t('loadingPos')}</p>
            <p className="mt-2 text-xs text-gold-500">{t('loadingPosHint')}</p>
          </div>
        </div>
      ) : null}

      {shiftModal}
      {receiptModal}

      {/* Print-only hidden div */}
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
          body { background: white !important; }
          body * { visibility: hidden; }
          #pos-receipt-print, #pos-receipt-print * { visibility: visible; }
          #pos-receipt-print { position: absolute; left: 0; top: 0; width: 100%; background: white; padding: 16px; }
          #pos-receipt-print .receipt-paper { background: white !important; border-color: #ddd !important; }
          #pos-receipt-print .receipt-paper * { color: #111 !important; }
          #pos-receipt-print[data-template='THERMAL'] .receipt-paper { max-width: 320px; margin: 0 auto; }
        }
      /* ── POS Signature Effects ────────────────────────── */

      /* Product card — multi-layer gold glow gradient */
      .pos-product-card {
        background:
          radial-gradient(420px 140px at 18% 0%, rgba(246,211,122,.08), transparent 60%),
          linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015)),
          linear-gradient(180deg, #12151d, #171b25);
        box-shadow: 0 16px 34px rgba(0,0,0,.34);
        transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
      }
      .pos-product-card:hover {
        background:
          radial-gradient(420px 140px at 18% 0%, rgba(246,211,122,.14), transparent 60%),
          linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02)),
          linear-gradient(180deg, #161926, #1e2232);
        box-shadow: 0 22px 40px rgba(0,0,0,.48);
        transform: translateY(-2px);
        border-color: rgba(246,211,122,.30);
      }

      /* Amount-due zone */
      .pos-amount-zone {
        background:
          radial-gradient(700px 160px at 18% 0%, rgba(246,211,122,.12), transparent 60%),
          linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01)),
          linear-gradient(180deg, #13161f, #171b26);
      }

      /* Shine sweep element — place inside any .pos-hoverable card */
      .pos-shine {
        position: absolute;
        inset: -40%;
        background: linear-gradient(120deg, transparent 45%, rgba(255,255,255,.10), transparent 62%);
        transform: rotate(10deg) translateX(-78%);
        opacity: 0;
        pointer-events: none;
        z-index: 1;
      }
      .pos-hoverable:hover .pos-shine {
        opacity: 1;
        animation: pos-shine-sweep .9s ease forwards;
      }
      @keyframes pos-shine-sweep {
        from { transform: rotate(10deg) translateX(-78%); }
        to   { transform: rotate(10deg) translateX(78%); }
      }

      /* Primary CTA override — radial highlight dot + gold gradient */
      .pos-cta {
        background:
          radial-gradient(20px 18px at 30% 30%, rgba(255,255,255,.18), transparent 55%),
          linear-gradient(135deg, rgba(246,211,122,.96), rgba(201,153,62,.62)) !important;
        box-shadow: 0 20px 34px rgba(0,0,0,.50) !important;
        transition: transform .16s ease, box-shadow .16s ease !important;
      }
      .pos-cta:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 24px 44px rgba(0,0,0,.58) !important;
      }
      .pos-cta:disabled { transform: none !important; }

      `}</style>

      {/* POS chrome */}
      {posTopBar}
      {statsStrip}
      {statusStrip}
      {offlinePinStrip}

      {/* Device-specific layout */}
      {posMode === 'desktop' && desktopLayout}
      {posMode === 'tablet' && tabletLayout}
      {posMode === 'phone' && phoneLayout}
    </div>
  );
}
