'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState, messageText } from '@/lib/app-notifications';
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
import { ProgressBar } from '@/components/ui/ProgressBar';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { SmartSelect } from '@/components/SmartSelect';
import { TypeaheadInput } from '@/components/TypeaheadInput';
import { DatePickerInput } from '@/components/DatePickerInput';
import { Banner } from '@/components/notifications/Banner';
import { CurrencyInput } from '@/components/CurrencyInput';
import { Icon } from '@/components/ui/Icon';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { UnitHelpPanel } from '@/components/ui/UnitHelpPanel';
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
import { FlipCounter } from '@/components/analog';

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
  totalOutstanding?: number | null;
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

type PopularItem = {
  variantId: string;
  variant?: { name?: string | null } | null;
  count?: number;
};

type ParkedSale = {
  id: string;
  branchId: string;
  customerId: string;
  cart: CartItem[];
  cartDiscount: number;
  saleNotes: string;
  parkedAt: string;
};

const DEFAULT_VAT_RATE = 18;
const CART_KEY = 'nvi-pos-cart';
const PARKED_SALES_KEY = 'nvi-pos-parked';
const POS_MODE_KEY = 'nvi.pos.deviceMode';

// Quick-cash denomination presets (works well for TZS; universal round numbers)
const CASH_QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];

type PosMode = 'phone' | 'tablet' | 'desktop';

// Per-method color map for payment pills
const PAYMENT_METHOD_COLORS: Record<string, { pill: string; pillActive: string; icon: string }> = {
  CASH: {
    pill: 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10',
    pillActive: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 ring-2 ring-gold-500/30',
    icon: 'bg-emerald-500/10 text-emerald-400',
  },
  CARD: {
    pill: 'border-blue-500/20 text-blue-400 hover:bg-blue-500/10',
    pillActive: 'bg-blue-500/15 border-blue-500/40 text-blue-300 ring-2 ring-gold-500/30',
    icon: 'bg-blue-500/10 text-blue-400',
  },
  MOBILE_MONEY: {
    pill: 'border-purple-500/20 text-purple-400 hover:bg-purple-500/10',
    pillActive: 'bg-purple-500/15 border-purple-500/40 text-purple-300 ring-2 ring-gold-500/30',
    icon: 'bg-purple-500/10 text-purple-400',
  },
  BANK_TRANSFER: {
    pill: 'border-amber-500/20 text-amber-400 hover:bg-amber-500/10',
    pillActive: 'bg-amber-500/15 border-amber-500/40 text-amber-300 ring-2 ring-gold-500/30',
    icon: 'bg-amber-500/10 text-amber-400',
  },
  OTHER: {
    pill: 'border-white/10 text-white/50 hover:bg-white/[0.06]',
    pillActive: 'bg-white/[0.08] border-white/20 text-white/70 ring-2 ring-gold-500/30',
    icon: 'bg-white/[0.06] text-white/50',
  },
};

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
  const [saleNotes, setSaleNotes] = useState('');
  const [scanSoundEnabled, setScanSoundEnabled] = useState(() => typeof window !== 'undefined' && localStorage.getItem('nvi.scan.sound') !== 'false');
  const [popularItems, setPopularItems] = useState<PopularItem[]>([]);
  const [parkedSales, setParkedSales] = useState<ParkedSale[]>([]);
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

  const playScanSound = useCallback(() => {
    if (!scanSoundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.08;
      osc.frequency.value = 1200;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // AudioContext may not be available
    }
  }, [scanSoundEnabled]);

  // Load parked sales from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PARKED_SALES_KEY);
      if (stored) setParkedSales(JSON.parse(stored));
    } catch { /* ignore corrupt data */ }
  }, []);

  const parkSale = useCallback(() => {
    if (cart.length === 0) return;
    const parked: ParkedSale = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `park-${Date.now()}`,
      branchId,
      customerId,
      cart,
      cartDiscount,
      saleNotes,
      parkedAt: new Date().toISOString(),
    };
    try {
      const existing: ParkedSale[] = JSON.parse(localStorage.getItem(PARKED_SALES_KEY) || '[]');
      existing.push(parked);
      localStorage.setItem(PARKED_SALES_KEY, JSON.stringify(existing));
      setParkedSales(existing);
    } catch {
      // storage may be full
    }
    setCart([]);
    setCartDiscount(0);
    setSaleNotes('');
    setPayments([{ method: 'CASH', amount: 0 }]);
    setMessage({ action: 'save', outcome: 'success', message: t('saleParked') });
  }, [cart, branchId, customerId, cartDiscount, saleNotes, t]);

  const resumeParkedSale = useCallback((index: number) => {
    const parked = parkedSales[index];
    if (!parked) return;
    setCart(parked.cart);
    setCartDiscount(parked.cartDiscount ?? 0);
    setSaleNotes(parked.saleNotes ?? '');
    const updated = parkedSales.filter((_, i) => i !== index);
    setParkedSales(updated);
    localStorage.setItem(PARKED_SALES_KEY, JSON.stringify(updated));
    setMessage({ action: 'save', outcome: 'success', message: t('saleResumed') });
  }, [parkedSales, t]);

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
        // Fetch popular items for quick-add favorites
        apiFetch<PopularItem[]>('/search/popular?limit=5', { token })
          .then((items) => setPopularItems(Array.isArray(items) ? items : []))
          .catch(() => { /* non-critical */ });
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
    localStorage.setItem('nvi.scan.sound', scanSoundEnabled ? 'true' : 'false');
  }, [scanSoundEnabled]);

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
    if (method === 'CASH') return <Icon name="Banknote" size={18} />;
    if (method === 'CARD') return <Icon name="CreditCard" size={18} />;
    if (method === 'MOBILE_MONEY') return <Icon name="Smartphone" size={18} />;
    if (method === 'BANK_TRANSFER') return <Icon name="Building" size={18} />;
    return <Icon name="Wallet" size={18} />;
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
        playScanSound();
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
    [barcodeMap, setMessage, setTimedScanMessage, t, scanActive, playScanSound],
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

  const addToCartByVariantId = (variantId: string) => {
    const variant = variants.find((v) => v.id === variantId);
    if (variant) addToCart(variant);
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

  // Cleanup camera on unmount
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
            ...(saleNotes.trim() ? { notes: saleNotes.trim() } : {}),
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
      setSaleNotes('');
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
          ...(saleNotes.trim() ? { notes: saleNotes.trim() } : {}),
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
      setSaleNotes('');
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
  // SHARED: POS Top Bar — slim, organized MacOS-toolbar feel
  // ─────────────────────────────────────────────────────────────
  const cashierInitial = (storedUser?.name || storedUser?.email || 'C').charAt(0).toUpperCase();
  const cashierDisplayName = storedUser?.name || storedUser?.email || 'Cashier';

  const posTopBar = (
    <div className="relative flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gold-500/10 bg-[#0d0c10] px-3">
      {/* LEFT: Cashier identity + branch */}
      <div className="flex min-w-0 items-center gap-3">
        {/* Avatar circle */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-sm font-bold text-gold-400">
          {cashierInitial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{cashierDisplayName}</p>
          <div className="flex items-center gap-2 text-[10px] text-white/40">
            {/* Branch selector or label */}
            {availableBranches.length > 1 ? (
              <div className="relative">
                <button
                  type="button"
                  disabled={branchSelectDisabled}
                  onClick={() => setBranchDropdownOpen((o) => !o)}
                  onBlur={() => setTimeout(() => setBranchDropdownOpen(false), 160)}
                  title={branchSelectDisabled && cart.length > 0 ? 'Clear cart to change branch' : undefined}
                  className={`nvi-press flex items-center gap-1 transition ${
                    branchSelectDisabled
                      ? 'cursor-not-allowed text-white/20'
                      : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  <Icon name="Building2" size={10} className="shrink-0 text-gold-400/60" />
                  <span className="max-w-[100px] truncate">{branchId ? activeBranchName : t('selectBranch')}</span>
                  <Icon name="ChevronDown" size={8} className={`shrink-0 transition-transform ${branchDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {/* Floating branch list */}
                {branchDropdownOpen && !branchSelectDisabled ? (
                  <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-gold-500/[0.08] bg-[#0d0c10] shadow-2xl">
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
                                ? 'bg-gold-500/[0.06] text-white'
                                : 'text-white/50 hover:bg-gold-500/[0.04] hover:text-white/80'
                            }`}
                          >
                            {active ? (
                              <Icon name="Check" size={12} className="shrink-0 text-gold-400" />
                            ) : (
                              <span className="w-3 shrink-0" />
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
              <span className="flex items-center gap-1">
                <Icon name="Building2" size={10} className="text-gold-400/60" />
                {activeBranchName}
              </span>
            ) : null}
            {openShift ? (
              <span className="text-white/30">{clockTime}</span>
            ) : null}
          </div>
        </div>
        {/* Shift dot */}
        {shiftTrackingEnabled ? (
          openShift ? (
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" style={{ animation: 'nvi-ping-dot 2.5s ease-in-out infinite' }} title={t('shiftOpen')} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]" title={t('openShiftRequired')} />
          )
        ) : null}
        {pendingSyncCount > 0 ? (
          <span className="nvi-pulse-ring rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-300">{pendingSyncCount} {t('pendingSyncShort')}</span>
        ) : null}
      </div>

      {/* CENTER: Session stats in warm mini badges */}
      <div className="hidden items-center gap-2 sm:flex">
        {sessionSaleCount > 0 ? (
          <>
            <div className="flex items-center gap-1.5 rounded-lg bg-gold-500/[0.06] px-3 py-1.5">
              <Icon name="ShoppingCart" size={12} className="text-gold-400/60" />
              <FlipCounter value={sessionSaleCount} digits={3} size="sm" />
              <span className="text-[11px] text-white/50">{sessionSaleCount === 1 ? t('saleCountSingular') : t('saleCountPlural')}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-gold-500/[0.06] px-3 py-1.5">
              <span className="text-[11px] font-semibold tabular-nums text-emerald-400">{amountFormatter.format(sessionTotal)}</span>
            </div>
          </>
        ) : null}
      </div>

      {/* RIGHT: Compact action buttons */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Online/Offline — just a dot */}
        <span className={`h-2.5 w-2.5 rounded-full ${offline ? 'bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.4)]' : 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.4)]'}`} title={offline ? 'Offline' : 'Online'} />
        {/* Sound toggle */}
        <button
          type="button"
          onClick={() => setScanSoundEnabled((v) => !v)}
          className="nvi-press hidden rounded-lg bg-gold-500/[0.06] p-2 text-white/50 transition hover:bg-gold-500/[0.10] hover:text-white/80 sm:flex"
          title={t('scanSound')}
        >
          <Icon name={scanSoundEnabled ? 'Volume2' : 'VolumeX'} size={14} />
        </button>
        {/* Device mode toggle */}
        <div className="hidden items-center gap-0.5 rounded-lg bg-gold-500/[0.06] p-0.5 sm:flex">
          {(
            [
              { mode: 'phone' as const, icon: 'Smartphone' as const },
              { mode: 'tablet' as const, icon: 'Tablet' as const },
              { mode: 'desktop' as const, icon: 'Monitor' as const },
            ] as const
          ).map(({ mode, icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPosMode(mode)}
              className={`nvi-press rounded-md p-1.5 transition-colors ${
                posMode === mode
                  ? 'bg-gold-500/15 text-white'
                  : 'text-white/30 hover:text-white/60'
              }`}
              title={mode}
            >
              <Icon name={icon} size={13} />
            </button>
          ))}
        </div>
        {/* Open shift CTA */}
        {shiftTrackingEnabled && !openShift && canOpenShift ? (
          <button
            type="button"
            onClick={() => setShiftModalOpen(true)}
            className="nvi-press flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/15"
          >
            <Icon name="Clock" size={13} />
            {t('openShiftBtn')}
          </button>
        ) : null}
        {/* Exit */}
        <button
          type="button"
          onClick={() => router.push(`/${locale}`)}
          className="nvi-press flex items-center justify-center rounded-lg bg-gold-500/[0.06] p-2 text-white/50 transition hover:bg-red-500/10 hover:text-red-400"
          title={t('exitPos')}
        >
          <Icon name="LogOut" size={14} />
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
        <div className="shrink-0"><Banner message={messageText(message)} /></div>
      ) : null}
      {branchSelectionRequired ? (
        <div className="shrink-0"><Banner message={t('branchSelectRequired')} severity="warning" /></div>
      ) : null}
      {shiftTrackingEnabled && !openShift ? (
        <div className="flex shrink-0 items-center gap-2 bg-amber-500/[0.06] border-b border-gold-500/10 px-4 py-2 text-xs text-amber-300">
          <Icon name="TriangleAlert" size={13} className="shrink-0 text-amber-400" />
          <span>{t('openShiftRequired')}</span>
        </div>
      ) : null}
    </>
  );

  // Stats strip removed — info consolidated into top bar and cart/totals zones
  const statsStrip = null;

  const offlinePinStrip = offline && pinRequired && !pinVerified ? (
    <div className="shrink-0 border-b border-red-500/10 bg-red-500/[0.06] px-4 py-3">
      <p className="mb-2 text-xs font-semibold text-red-300">{t('pinRequiredTitle')}</p>
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
          className="rounded-xl border border-red-500/20 bg-[#13121a] px-3 py-1.5 text-xs text-white disabled:opacity-50"
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
          className="nvi-press rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 disabled:opacity-50"
        >
          {t('unlock')}
        </button>
      </div>
    </div>
  ) : null;

  // ─────────────────────────────────────────────────────────────
  // SHARED: Search / Scan bar — large, modern, soft borders
  // ─────────────────────────────────────────────────────────────
  const searchBar = (
    <div className="flex shrink-0 items-center gap-2 border-b border-gold-500/[0.06] px-4 py-3">
      <div className="nvi-focus-pulse relative flex-1">
        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
          <Icon name="Search" size={16} />
        </div>
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
          className="w-full rounded-2xl border border-gold-500/[0.08] bg-[#13121a] py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/30 focus:border-gold-500/25 focus:bg-[#16151e] focus:outline-none transition"
        />
      </div>
      <button
        type="button"
        onClick={scanActive ? stopScan : startScan}
        className={`nvi-press flex shrink-0 items-center gap-1.5 rounded-2xl px-4 py-3 text-xs font-medium transition ${
          scanActive
            ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
            : 'bg-[#13121a] border border-gold-500/[0.08] text-white/50 hover:bg-gold-500/[0.06] hover:text-white/80'
        }`}
      >
        <Icon name="ScanBarcode" size={15} />
        <span className="hidden sm:inline">{scanActive ? t('scanStop') : t('scanStart')}</span>
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // SHARED: Product tile grid — browsable catalog with real cards
  // ─────────────────────────────────────────────────────────────
  const buildProductGrid = (colClass: string) => (
    <div className="flex-1 overflow-y-auto">
      {/* Filter input */}
      <div className="px-4 py-3">
        <div className="nvi-focus-pulse relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25">
            <Icon name="Search" size={13} />
          </div>
          <input
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder={t('productSearchPlaceholder')}
            className="w-full rounded-xl border border-gold-500/[0.08] bg-[#13121a] py-2 pl-9 pr-3 text-xs text-white placeholder:text-white/30 focus:border-gold-500/25 focus:outline-none transition"
          />
        </div>
        {posMode === 'desktop' ? (
          <div className="mt-1.5 flex gap-3 text-[10px] text-white/25">
            <span>Esc: {t('shortcutClear')}</span>
            <span>Enter: {t('shortcutSearch')}</span>
          </div>
        ) : null}
      </div>
      {/* Popular / favorites */}
      {popularItems.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 px-4 mb-3">
          <span className="flex items-center gap-1.5 rounded-lg bg-gold-500/[0.06] p-1 text-gold-400">
            <Icon name="TrendingUp" size={13} />
          </span>
          <span className="text-xs font-medium text-white/50">{t('favorites')}</span>
          {popularItems.map((item) => (
            <button key={item.variantId} onClick={() => addToCartByVariantId(item.variantId)} className="nvi-press rounded-lg bg-gold-500/[0.04] border border-gold-500/[0.08] px-2.5 py-1 text-xs text-white/70 hover:bg-gold-500/[0.08] hover:border-gold-500/15 transition">
              {item.variant?.name ?? common('unknown')}
            </button>
          ))}
        </div>
      ) : null}
      {/* Scanner video */}
      <div className={`mx-4 mb-4 overflow-hidden rounded-xl border border-gold-500/[0.08] bg-black/80 ${scanActive ? '' : 'hidden'}`}>
        <video ref={videoRef} className="w-full" />
        {scanMessage ? (
          <p className="px-3 py-2 text-center text-xs text-white/50">{scanMessage}</p>
        ) : null}
      </div>
      {/* Empty state */}
      {filteredProductVariants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="mb-3 rounded-2xl bg-gold-500/[0.04] p-4">
            <Icon name="PackageSearch" size={36} className="text-white/20" />
          </div>
          <p className="text-sm text-white/30">{t('productNoResults')}</p>
        </div>
      ) : (
        <div className={`grid gap-2 px-4 pb-4 ${colClass}`}>
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
                className="nvi-card-hover group relative flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#13121a] text-left transition hover:border-gold-500/30 hover:shadow-[0_0_20px_rgba(227,178,51,0.06)]"
              >
                {/* Product image or icon placeholder */}
                <div className="nvi-img-zoom relative aspect-[4/3] w-full overflow-hidden rounded-t-xl bg-[#0e0d14]">
                  {variant.imageUrl ? (
                    <img
                      src={variant.imageUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500/[0.06]">
                        <Icon name="Package" size={22} className="text-white/20" />
                      </div>
                    </div>
                  )}
                  {inCart ? (
                    <div className="nvi-pop absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gold-500 text-[10px] font-bold text-black shadow-lg">
                      {inCart.quantity}
                    </div>
                  ) : (
                    <div className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-gold-500/20 text-gold-400 opacity-0 transition group-hover:opacity-100">
                      <Icon name="Plus" size={13} />
                    </div>
                  )}
                </div>
                {/* Card info */}
                <div className="flex flex-1 flex-col justify-between p-3">
                  <p className="line-clamp-1 text-sm font-bold leading-tight text-white">{variant.name}</p>
                  {variant.product?.name ? (
                    <p className="mt-0.5 truncate text-[10px] text-gold-400/40">
                      {variant.product.name}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm font-semibold tabular-nums text-emerald-400">
                      {price !== null ? amountFormatter.format(Number(price)) : '\u2014'}
                    </p>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-500/20 text-gold-400 opacity-0 transition group-hover:opacity-100">
                      <Icon name="Plus" size={12} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // SHARED: Cart item list — compact row design
  // ─────────────────────────────────────────────────────────────
  const cartItemList = (
    <div className="flex-1 overflow-y-auto">
      {/* Cart header with item count badge */}
      <div className="flex items-center justify-between border-b border-gold-500/[0.04] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Icon name="ShoppingCart" size={14} className="text-gold-400/50" />
          <span className="text-sm font-semibold text-white">{t('cartTitle')}</span>
          {cart.length > 0 ? (
            <span className="nvi-pop inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5 text-[10px] font-bold text-black">
              {cartUnits}
            </span>
          ) : null}
        </div>
      </div>

      {/* ZONE 5: Customer section — compact bar */}
      <div className="border-b border-gold-500/[0.04] px-4 py-2.5">
        {selectedCustomer ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-gold-500/[0.04] px-3 py-2">
            <span className="text-sm font-bold text-white">{selectedCustomer.name}</span>
            {selectedCustomer.totalOutstanding && selectedCustomer.totalOutstanding > 0 ? (
              <span className="text-xs font-medium text-amber-400">{amountFormatter.format(selectedCustomer.totalOutstanding)} due</span>
            ) : null}
            {selectedCustomer.tinNumber ? (
              <span className="text-[10px] text-white/30">TIN {selectedCustomer.tinNumber}</span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setCustomerId('');
                setSelectedCustomer(null);
                setCustomerQuery('');
              }}
              className="nvi-press ml-auto text-[11px] text-white/40 transition hover:text-white/70"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="relative">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25">
                <Icon name="Users" size={14} />
              </div>
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
                className="w-full rounded-xl bg-[#13121a] border border-gold-500/[0.08] py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-gold-500/25 focus:outline-none transition"
              />
            </div>
            {customerFocused && customerResults.length > 0 ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-gold-500/[0.08] bg-[#0d0c10] shadow-2xl">
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
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gold-500/[0.04]"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold-500/[0.08] text-[10px] font-bold text-gold-400/60">
                      {customer.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{customer.name}</p>
                      {customer.tinNumber ? (
                        <p className="text-[10px] text-white/30">TIN {customer.tinNumber}</p>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
        {activePriceList ? (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-white/40">
            <Icon name="Tag" size={11} />
            {t('priceListLabel', { name: activePriceList.name })}
          </p>
        ) : null}
      </div>

      {/* Empty cart state */}
      {cart.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="rounded-2xl bg-gold-500/[0.06] p-6 mb-3">
            <Icon name="ShoppingCart" size={48} className="text-gold-400/20" />
          </div>
          <p className="text-sm text-white/30">{t('cartEmpty')}</p>
        </div>
      ) : (
        <div>
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
                className="group border-b border-gold-500/[0.04] px-4 py-2.5"
              >
                {/* Row 1: name, qty stepper, total, remove */}
                <div className="flex items-center gap-3">
                  {/* Name + variant */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{displayName}</p>
                    {item.variant.minPrice && item.unitPrice < item.variant.minPrice ? (
                      <p className="text-[10px] text-red-400">{t('minPriceLabel', { value: item.variant.minPrice })}</p>
                    ) : null}
                  </div>
                  {/* Quantity stepper — compact */}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => updateCartItem(index, { quantity: Math.max(1, item.quantity - 1) })}
                      className="nvi-press flex h-7 w-7 items-center justify-center rounded-md bg-gold-500/[0.08] text-white/60 transition hover:bg-gold-500/15 hover:text-gold-400"
                    >
                      <Icon name="Minus" size={12} />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums text-white">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateCartItem(index, { quantity: item.quantity + 1 })}
                      className="nvi-press flex h-7 w-7 items-center justify-center rounded-md bg-gold-500/[0.08] text-white/60 transition hover:bg-gold-500/15 hover:text-gold-400"
                    >
                      <Icon name="Plus" size={12} />
                    </button>
                  </div>
                  {/* Line total */}
                  <span className="w-20 text-right text-sm font-bold tabular-nums text-white">
                    {amountFormatter.format(lineTotal)}
                  </span>
                  {/* Remove — appears on hover */}
                  <button
                    type="button"
                    onClick={() => removeCartItem(index)}
                    aria-label="Remove"
                    className="nvi-press flex h-6 w-6 items-center justify-center rounded-md text-white/20 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Icon name="Trash2" size={12} />
                  </button>
                </div>
                {/* Row 2: Unit, price, line discount (expandable detail) */}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <div className="min-w-[100px] flex-1">
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
                    <UnitHelpPanel
                      mode="hint"
                      baseUnitLabel={units.find((u) => u.id === item.variant.baseUnitId)?.label}
                      sellUnitLabel={units.find((u) => u.id === item.variant.sellUnitId)?.label}
                      conversionFactor={resolveUnitFactor(item.variant, item.unitId)}
                      quantity={item.quantity}
                    />
                  </div>
                  <CurrencyInput
                    value={String(item.unitPrice)}
                    readOnly={!priceEditEnabled}
                    onChange={(value) => {
                      if (priceEditEnabled) updateCartItem(index, { unitPrice: Number(value) || 0 });
                    }}
                    className={`w-24 rounded-lg border border-gold-500/[0.08] bg-[#13121a] px-2 py-1.5 text-xs tabular-nums text-white focus:outline-none transition ${priceEditEnabled ? 'focus:border-gold-500/25' : 'cursor-default opacity-50'}`}
                    placeholder={t('unitPrice')}
                  />
                  <CurrencyInput
                    value={item.lineDiscount ? String(item.lineDiscount) : ''}
                    onChange={(value) => updateCartItem(index, { lineDiscount: Number(value) || 0 })}
                    className="w-20 rounded-lg border border-gold-500/[0.08] bg-[#13121a] px-2 py-1.5 text-xs tabular-nums text-white/60 placeholder:text-white/20 focus:border-gold-500/25 focus:outline-none transition"
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
        <div className="flex items-center justify-between border-t border-gold-500/[0.04] px-4 py-2">
          <span className="text-xs text-white/40">{t('cartDiscount')}</span>
          <CurrencyInput
            value={cartDiscount ? String(cartDiscount) : ''}
            onChange={(value) => setCartDiscount(Number(value) || 0)}
            className="w-24 rounded-lg border border-gold-500/[0.08] bg-[#13121a] px-2 py-1.5 text-xs tabular-nums text-white focus:border-gold-500/25 focus:outline-none transition"
          />
        </div>
      ) : null}
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // SHARED: Totals + Payment + CTA — the action zone
  // ─────────────────────────────────────────────────────────────

  const totalsAndPayment = (
    <div className="nvi-slide-in-bottom shrink-0 border-t border-gold-500/[0.06] bg-[#0a0a10]">
      {/* TOTAL — hero number in warm container */}
      <div className="px-4 pt-4 pb-3">
        <div className="rounded-xl bg-gold-500/[0.06] p-4">
          {/* Breakdown rows above total */}
          {(totals.subtotal !== totals.total || totals.vatTotal > 0 || totals.lineDiscount + cartDiscount > 0) ? (
            <div className="mb-3 space-y-1">
              <div className="flex items-center justify-between text-sm text-white/50">
                <span>{t('subtotal')}</span>
                <span className="tabular-nums">{amountFormatter.format(totals.subtotal)}</span>
              </div>
              {totals.lineDiscount + cartDiscount > 0 ? (
                <div className="flex items-center justify-between text-sm text-white/50">
                  <span>{t('discounts')}</span>
                  <span className="tabular-nums">{'\u2212'}{amountFormatter.format(totals.lineDiscount + cartDiscount)}</span>
                </div>
              ) : null}
              {totals.vatTotal > 0 ? (
                <div className="flex items-center justify-between text-sm text-white/50">
                  <span>{t('vat')}</span>
                  <span className="tabular-nums">{amountFormatter.format(totals.vatTotal)}</span>
                </div>
              ) : null}
              <div className="border-t border-gold-500/10" />
            </div>
          ) : null}
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-widest text-white/40">{t('total')}</span>
            <span className="text-3xl font-bold tabular-nums text-white">
              {amountFormatter.format(totals.total)}
            </span>
          </div>
        </div>
      </div>

      {/* Payment progress bar */}
      {cart.length > 0 ? (() => {
        const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
        return (
          <div className="px-4 pb-2">
            <ProgressBar value={totalPaid} max={totals.total} height={6} color={totalPaid >= totals.total ? 'green' : 'accent'} />
          </div>
        );
      })() : null}

      {/* Change display — if overpaid */}
      {(() => {
        const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
        const change = totalPaid - totals.total;
        if (change <= 0 || cart.length === 0) return null;
        return (
          <div className="mx-4 mb-3 rounded-xl bg-emerald-500/10 p-3 text-center">
            <p className="text-xs font-medium text-emerald-400/70 uppercase tracking-wider mb-1">Change</p>
            <p className="nvi-bounce-in text-2xl font-bold text-emerald-400 tabular-nums">{amountFormatter.format(change)}</p>
          </div>
        );
      })()}

      {/* Payments */}
      <div className="space-y-4 px-4 pb-4 pt-2">
        {payments.map((payment, index) => (
          <div key={`payment-${index}`} className="space-y-3">
            {/* Section label + remove */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">
                {t('paymentMethodLabel')}
              </p>
              {index > 0 ? (
                <button
                  type="button"
                  onClick={() => setPayments((prev) => prev.filter((_, i) => i !== index))}
                  className="nvi-press flex items-center gap-1 text-[11px] text-red-400/70 hover:text-red-400"
                >
                  <Icon name="X" size={11} />
                  {t('removePaymentLabel')}
                </button>
              ) : null}
            </div>
            {/* Method pills — colored per type */}
            <div className="flex flex-wrap gap-2">
              {(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER'] as const).map((method) => {
                const selected = payment.method === method;
                const colors = PAYMENT_METHOD_COLORS[method];
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => updatePayment(index, { method })}
                    className={`nvi-press flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
                      selected ? colors.pillActive : colors.pill
                    }`}
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}>
                      {paymentMethodIcon(method)}
                    </div>
                    <span className="text-xs font-semibold">
                      {paymentMethodLabel(method)}
                    </span>
                  </button>
                );
              })}
            </div>
            {payment.method === 'OTHER' ? (
              <input
                value={payment.methodLabel || ''}
                onChange={(e) => updatePayment(index, { methodLabel: e.target.value })}
                placeholder={t('paymentLabel')}
                className="w-full rounded-lg border border-gold-500/[0.08] bg-[#13121a] px-3 py-2 text-xs text-white focus:border-gold-500/25 focus:outline-none transition"
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
                  const digitsBeforeCursor = el.value.slice(0, selStart).replace(/\D/g, '').length;
                  updatePayment(index, { amount: numericValue });
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
                className="flex-1 rounded-lg border border-gold-500/[0.08] bg-[#13121a] px-3 py-2.5 text-sm tabular-nums text-white focus:border-gold-500/25 focus:outline-none transition"
              />
              <input
                value={payment.reference || ''}
                onChange={(e) => updatePayment(index, { reference: e.target.value })}
                placeholder={t('referenceOptional')}
                className="w-28 rounded-lg border border-gold-500/[0.08] bg-[#13121a] px-3 py-2.5 text-xs text-white/50 focus:border-gold-500/25 focus:outline-none transition"
              />
            </div>
            {/* Quick-cash presets */}
            {payment.method === 'CASH' ? (() => {
              const otherPaid = payments.reduce((s, p, i) => i === index ? s : s + p.amount, 0);
              const remaining = Math.max(0, totals.total - otherPaid);
              const rounds = CASH_QUICK_AMOUNTS.filter((a) => a > remaining).slice(0, 4);
              return (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updatePayment(index, { amount: remaining })}
                    className="nvi-press rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500/15"
                  >
                    {t('exactAmount')}
                  </button>
                  {rounds.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => updatePayment(index, { amount: amt })}
                      className="nvi-press rounded-lg bg-gold-500/[0.06] border border-gold-500/15 px-3 py-1.5 text-[11px] text-gold-200 transition hover:bg-gold-500/[0.10] hover:text-gold-100"
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
          className="nvi-press flex items-center gap-1.5 rounded-lg border border-gold-500/[0.08] px-3 py-2 text-xs text-white/40 transition hover:bg-gold-500/[0.06] hover:text-white/60"
        >
          <Icon name="Plus" size={13} />
          {t('addPayment')}
        </button>

        {/* Sale notes */}
        <input
          value={saleNotes}
          onChange={(e) => setSaleNotes(e.target.value)}
          placeholder={t('saleNotes')}
          className="w-full rounded-xl border border-gold-500/[0.08] bg-[#13121a] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-gold-500/25 focus:outline-none transition"
        />

        {/* Credit sale */}
        {creditEnabled ? (
          <div className="rounded-xl border border-gold-500/[0.08] bg-[#13121a] p-3">
            <label className="flex items-center gap-2 text-xs text-white/50">
              <input
                type="checkbox"
                checked={creditSale}
                onChange={(e) => setCreditSale(e.target.checked)}
                className="accent-gold-400"
              />
              <Icon name="CalendarClock" size={13} />
              {t('creditSale')}
            </label>
            {creditSale ? (
              <div className="nvi-expand mt-2">
                <DatePickerInput
                  value={creditDueDate}
                  onChange={setCreditDueDate}
                  className="w-full rounded-xl border border-gold-500/[0.08] bg-[#13121a] px-3 py-2 text-xs text-white"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Complete Sale CTA */}
      <div className="px-4 pb-4">
        {/* Park + parked sales */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button onClick={parkSale} disabled={cart.length === 0} className="nvi-press flex items-center gap-1.5 rounded-lg border border-gold-500/[0.08] bg-[#13121a] px-3 py-2 text-xs text-white/60 disabled:opacity-30 transition hover:bg-gold-500/[0.06]">
            <Icon name="CircleParking" size={13} />
            {t('parkSale')}
          </button>
          {parkedSales.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-white/40">{t('parkedSales')} ({parkedSales.length}):</span>
              {parkedSales.map((ps, i) => (
                <button key={ps.id} type="button" onClick={() => resumeParkedSale(i)}
                  className="nvi-press rounded-lg bg-gold-500/[0.04] border border-gold-500/[0.08] px-2.5 py-1 text-xs text-white/60 hover:bg-gold-500/[0.08] transition">
                  {ps.cart.length} {t('parkedItems')} &middot; {new Date(ps.parkedAt).toLocaleTimeString()}
                </button>
              ))}
            </div>
          ) : null}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-white/40 sm:hidden">
            <input
              type="checkbox"
              checked={scanSoundEnabled}
              onChange={(e) => setScanSoundEnabled(e.target.checked)}
              className="accent-gold-400"
            />
            <Icon name={scanSoundEnabled ? 'Volume2' : 'VolumeX'} size={13} />
            {t('scanSound')}
          </label>
        </div>
        {/* Complete Sale — THE primary CTA with gradient */}
        {(() => {
          const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
          const paymentSufficient = cart.length > 0 && totalPaid >= totals.total;
          return (
        <button
          type="button"
          onClick={completeSale}
          disabled={isCompleting || cart.length === 0}
          className={`nvi-press flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-gold-500 to-gold-400 py-4 text-lg font-bold text-black transition disabled:opacity-40 disabled:shadow-none ${
            paymentSufficient
              ? 'shadow-[0_0_40px_rgba(246,211,122,0.35)] hover:shadow-[0_0_50px_rgba(246,211,122,0.45)]'
              : 'shadow-[0_8px_30px_rgba(246,211,122,0.2)] hover:shadow-[0_12px_40px_rgba(246,211,122,0.3)]'
          }`}
          style={paymentSufficient ? { animation: 'nvi-glow-pulse 2s ease-in-out infinite' } : undefined}
        >
          {isCompleting ? (
            <>
              <Spinner variant="orbit" size="xs" />
              <span>{t('completing')}</span>
            </>
          ) : (
            <>
              <Icon name="CircleCheck" size={20} />
              <span>{t('completeSale')}</span>
            </>
          )}
        </button>
          );
        })()}

        {/* Printer controls */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={connectPrinter}
            disabled={isConnectingPrinter}
            className="nvi-press flex items-center gap-1.5 rounded-lg border border-gold-500/[0.08] px-3 py-2 text-xs text-white/40 transition hover:bg-gold-500/[0.06] hover:text-white/60 disabled:opacity-40"
          >
            <Icon name="Printer" size={13} />
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
              className="nvi-press flex items-center gap-1.5 rounded-lg border border-gold-500/[0.08] px-3 py-2 text-xs text-white/40 transition hover:bg-gold-500/[0.06] hover:text-white/60"
            >
              <Icon name="FileText" size={13} />
              {t('previewAndPrint')}
            </button>
          ) : null}
          {printer && lastReceipt ? (
            <button
              type="button"
              onClick={() => printReceipt(lastReceipt)}
              className="nvi-press flex items-center gap-1.5 rounded-lg border border-gold-500/[0.08] px-3 py-2 text-xs text-white/40 transition hover:bg-gold-500/[0.06] hover:text-white/60"
            >
              <Icon name="Download" size={13} />
              {t('printLastReceipt')}
            </button>
          ) : null}
          {printer ? (
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gold-500/[0.08] px-3 py-2 text-xs text-white/40 transition hover:bg-gold-500/[0.06] hover:text-white/60">
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
  // DESKTOP LAYOUT (≥1024px) — product zone vs transaction zone
  // ─────────────────────────────────────────────────────────────
  const desktopLayout = (
    <div className="flex min-h-0 flex-1">
      {/* Left: product catalog zone */}
      <div className="flex w-[48%] shrink-0 flex-col border-r border-gold-500/[0.04]">
        {searchBar}
        {buildProductGrid('grid-cols-2 sm:grid-cols-3 lg:grid-cols-4')}
      </div>
      {/* Right: cart + payment zone */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#0a0a10]">
        {cartItemList}
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
      <div className="flex shrink-0 border-b border-gold-500/10 bg-[#0d0c10]">
        {(['products', 'cart', 'pay'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`nvi-press relative flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition ${
              mobileTab === tab
                ? 'border-b-2 border-gold-400 text-white'
                : 'text-white/30 hover:text-white/60'
            }`}
          >
            {tab === 'products' ? (
              <span className="inline-flex items-center justify-center gap-1.5">
                <Icon name="Package" size={14} />
                {t('productsTitle')}
              </span>
            ) : tab === 'cart' ? (
              <span className="inline-flex items-center justify-center gap-1.5">
                <Icon name="ShoppingCart" size={14} />
                {t('cartTitle')}
                {cart.length > 0 ? (
                  <span className="nvi-pop rounded-full bg-gold-500 px-1.5 py-0.5 text-[9px] font-bold text-black">
                    {cart.length}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="inline-flex items-center justify-center gap-1.5">
                <Icon name="CreditCard" size={14} />
                {t('totalsTitle')}
              </span>
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

      {/* Sticky bottom strip */}
      <div className="flex shrink-0 items-center justify-between border-t border-gold-500/10 bg-[#0d0c10]/95 px-4 py-3 backdrop-blur-sm">
        <div>
          <p className="text-[11px] text-white/40">
            {cart.length} {cart.length === 1 ? t('itemSingular') : t('itemPlural')}
          </p>
          <p className="text-base font-bold tabular-nums text-white">
            {amountFormatter.format(totals.total)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { if (cart.length > 0) setCartSheetOpen(true); }}
          disabled={cart.length === 0}
          className="nvi-press flex items-center gap-2 rounded-xl bg-gradient-to-r from-gold-500 to-gold-400 px-4 py-2.5 text-sm font-bold text-black shadow-[0_4px_16px_rgba(246,211,122,0.2)] disabled:opacity-30 disabled:shadow-none"
        >
          <Icon name="ShoppingCart" size={15} />
          {t('cartTitle')} ({cart.length})
        </button>
      </div>

      {/* Cart bottom sheet */}
      {cartSheetOpen ? (
        <>
          <div
            className="fixed inset-0 z-[210] bg-black/60 backdrop-blur-sm"
            onClick={() => setCartSheetOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[220] flex max-h-[88vh] flex-col rounded-t-3xl border-t border-gold-500/10 bg-[#0d0c10] shadow-2xl">
            {/* Sheet header */}
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-gold-500/15" />
            <div className="flex shrink-0 items-center justify-between border-b border-gold-500/[0.06] px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Icon name="ShoppingCart" size={15} />
                {t('cartTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setCartSheetOpen(false)}
                className="nvi-press flex h-6 w-6 items-center justify-center rounded-lg text-white/30 hover:text-white/60"
              >
                <Icon name="X" size={14} />
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
      className="absolute inset-0 z-[230] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onKeyDown={(e) => { if (e.key === 'Escape') setShiftModalOpen(false); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-gold-500/15 bg-[#0d0c10] p-6 text-white shadow-2xl">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/[0.08]">
            <Icon name="Clock" size={20} className="text-gold-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">{t('openShiftTitle')}</p>
            <h3 className="text-xl font-semibold">{t('openShiftTitle')}</h3>
          </div>
        </div>
        <p className="mt-2 text-sm text-white/50">{t('openShiftDesc')}</p>
        <form onSubmit={handleOpenShift} className="mt-4 space-y-4">
          <div className="space-y-1">
            <label htmlFor="pos-opening-cash" className="text-xs uppercase tracking-[0.2em] text-white/40">
              {t('openingCashLabel')}
            </label>
            <CurrencyInput
              id="pos-opening-cash"
              required
              value={openingCash}
              onChange={setOpeningCash}
              placeholder="0"
              autoComplete="off"
              className="w-full rounded-xl border border-gold-500/[0.08] bg-[#13121a] px-3 py-2 text-sm text-white focus:ring-1 focus:ring-gold-500/30 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="pos-shift-notes" className="text-xs uppercase tracking-[0.2em] text-white/40">
              {t('shiftNotesLabel')}
            </label>
            <input
              id="pos-shift-notes"
              type="text"
              value={shiftNotes}
              onChange={(e) => setShiftNotes(e.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border border-gold-500/[0.08] bg-[#13121a] px-3 py-2 text-sm text-white focus:ring-1 focus:ring-gold-500/30 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShiftModalOpen(false); setOpeningCash(''); setShiftNotes(''); }}
              className="nvi-press rounded-xl border border-gold-500/[0.08] px-3 py-2 text-xs text-white/60"
            >
              {common('cancel')}
            </button>
            <button
              type="submit"
              disabled={isOpeningShift || !openingCash}
              className="nvi-press flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-gold-400 px-4 py-2 text-xs font-semibold text-black disabled:opacity-60"
            >
              <Icon name="Play" size={13} />
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
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-xl space-y-4 rounded-2xl border border-gold-500/15 bg-[#0d0c10] p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Icon name="FileText" size={18} />
            {previewT('title')}
          </h3>
          <button
            type="button"
            onClick={() => setPreviewReceipt(null)}
            className="nvi-press rounded-xl border border-gold-500/[0.08] px-3 py-1 text-xs text-white/60"
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
              className={`nvi-press rounded-xl border px-3 py-1 ${previewMode === m ? 'border-gold-500/50 bg-gold-500/10 text-white' : 'border-gold-500/[0.08] text-white/50'}`}
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
            className="nvi-press rounded-xl border border-gold-500/[0.08] px-3 py-2 text-xs text-white/60"
          >
            {common('close')}
          </button>
          <button
            type="button"
            onClick={handlePreviewPrint}
            className="nvi-press flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-gold-400 px-3 py-2 text-xs font-semibold text-black"
          >
            <Icon name="Printer" size={13} />
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
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden text-white"
      style={{
        background: 'linear-gradient(180deg, #0a0a10, #08080d)',
      }}
    >
      {/* Subtle ambient glow — very faint, not gold-dominant */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: -1,
          background: [
            'radial-gradient(800px 600px at 10% 0%, rgba(246,211,122,.04), transparent 60%)',
            'radial-gradient(600px 500px at 90% 5%, rgba(100,217,209,.03), transparent 50%)',
          ].join(', '),
        }}
      />

      {/* Loading overlay */}
      {showLoadingOverlay ? (
        <div className="absolute inset-0 z-[230] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-gold-500/15 bg-[#0d0c10] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-gold-500/15">
              <Spinner size="sm" variant="ring" />
            </div>
            <p className="text-sm font-semibold text-white">{t('loadingPos')}</p>
            <p className="mt-2 text-xs text-white/40">{t('loadingPosHint')}</p>
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
        @keyframes nvi-glow-pulse {
          0%, 100% { box-shadow: 0 0 40px rgba(246,211,122,0.35); }
          50% { box-shadow: 0 0 55px rgba(246,211,122,0.50); }
        }
        @media print {
          body { background: white !important; }
          body * { visibility: hidden; }
          #pos-receipt-print, #pos-receipt-print * { visibility: visible; }
          #pos-receipt-print { position: absolute; left: 0; top: 0; width: 100%; background: white; padding: 16px; }
          #pos-receipt-print .receipt-paper { background: white !important; border-color: #ddd !important; }
          #pos-receipt-print .receipt-paper * { color: #111 !important; }
          #pos-receipt-print[data-template='THERMAL'] .receipt-paper { max-width: 320px; margin: 0 auto; }
        }
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
