'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { DatePickerInput } from '@/components/DatePickerInput';
import { SmartSelect } from '@/components/SmartSelect';
import { PaginationControls } from '@/components/PaginationControls';
import { Banner } from '@/components/notifications/Banner';
import { Card, AvatarInitials, EmptyState } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { ListPage, type ViewMode } from '@/components/ui/ListPage';
import { ViewToggle } from '@/components/ViewToggle';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { buildAuditNarrative } from '@/lib/auditNarrative';
import { formatEntityLabel } from '@/lib/display';
import { useBranchScope } from '@/lib/use-branch-scope';
import { useFormatDate } from '@/lib/business-context';

/* ─── Types ──────────────────────────────────────────────────────────────── */

type Branch = { id: string; name: string };
type Role = { id: string; name: string };
type User = { id: string; name?: string | null; email?: string | null };
type ResourceOption = { id: string; label: string };
type AuditLog = {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  diff?: Record<string, unknown> | null;
  userId?: string | null;
  roleId?: string | null;
  branchId?: string | null;
  deviceId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  correlationId?: string | null;
  previousHash?: string | null;
  hash?: string | null;
  createdAt: string;
  resolved?: Record<string, unknown> | null;
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const formatEvidenceValue = (
  value: unknown,
  field?: string,
  resolverMap?: Map<string, string>,
) => {
  if (value === null || value === undefined || value === '') {
    return 'n/a';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  // Handle nested objects (enriched snapshots) — extract name/label/code
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    // Try common name fields in order of preference
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.label === 'string') return obj.label;
    if (typeof obj.code === 'string') return obj.code;
    if (typeof obj.referenceNumber === 'string') return obj.referenceNumber;
    if (typeof obj.email === 'string') return obj.email;
    // If it has a name inside a nested object (e.g. variant.product.name)
    if (obj.product && typeof obj.product === 'object' && typeof (obj.product as Record<string, unknown>).name === 'string') {
      return `${obj.name ?? ''} (${(obj.product as Record<string, unknown>).name})`.trim();
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    // If field ends with Id and value looks like a UUID, try to resolve it
    if (field && field.endsWith('Id') && UUID_RE.test(value)) {
      const resolved = resolverMap?.get(value);
      if (resolved) return resolved;
      // Show shortened ID so it's clear it's an identifier
      return `#${value.slice(0, 8)}…`;
    }
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(value);
};

const collectDiffHighlights = (
  diff: Record<string, unknown> | null,
  prefix = '',
  entries: Array<{ field: string; from?: unknown; to?: unknown }> = [],
) => {
  if (!diff) {
    return entries;
  }
  Object.entries(diff).forEach(([key, value]) => {
    const field = prefix ? `${prefix}.${key}` : key;
    if (!value || typeof value !== 'object') {
      return;
    }
    if ('from' in value || 'to' in value) {
      const entry = value as { from?: unknown; to?: unknown };
      entries.push({ field, from: entry.from, to: entry.to });
      return;
    }
    collectDiffHighlights(value as Record<string, unknown>, field, entries);
  });
  return entries;
};

const buildRelatedLinks = (
  log: AuditLog,
  t: (key: string) => string,
  locale: string,
) => {
  const links: { label: string; href: string }[] = [];
  const addLink = (label: string, href: string) => links.push({ label, href: `/${locale}${href}` });
  switch (log.resourceType) {
    case 'Sale':
    case 'SaleRefund':
      addLink(t('relatedReceipts'), '/receipts');
      break;
    case 'Approval':
    case 'ApprovalPolicy':
      addLink(t('relatedApprovals'), '/approvals');
      break;
    case 'StockMovement':
      addLink(t('relatedStockMovements'), '/stock/movements');
      break;
    case 'Transfer':
      addLink(t('relatedTransfers'), '/transfers');
      break;
    case 'Purchase':
    case 'PurchaseOrder':
    case 'SupplierReturn':
      addLink(t('relatedPurchases'), '/purchases');
      break;
    case 'Receiving':
      addLink(t('relatedReceiving'), '/receiving');
      break;
    case 'Supplier':
      addLink(t('relatedSuppliers'), '/suppliers');
      break;
    case 'Customer':
      addLink(t('relatedCustomers'), '/customers');
      break;
    case 'PriceList':
      addLink(t('relatedPriceLists'), '/price-lists');
      break;
    case 'Branch':
      addLink(t('relatedBranches'), '/settings/branches');
      break;
    case 'User':
      addLink(t('relatedUsers'), '/settings/users');
      break;
    case 'Role':
      addLink(t('relatedRoles'), '/settings/roles');
      break;
    default:
      break;
  }
  return links;
};

const formatFieldLabel = (field: string, labels: Record<string, string>): string => {
  return field
    .split('.')
    .map((part) => labels[part] ?? part.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim())
    .join(' > ');
};

/** Classify action into colour groups */
const getActionColor = (action: string) => {
  if (action.includes('CREATE') || action.includes('COMPLETE') || action.includes('OPEN')) {
    return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' };
  }
  if (action.includes('UPDATE') || action.includes('ASSIGN') || action.includes('SET')) {
    return { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-400' };
  }
  if (action.includes('DELETE') || action.includes('REMOVE') || action.includes('VOID') || action.includes('PURGE') || action.includes('ARCHIVE') || action.includes('DEACTIVATE') || action.includes('ANONYMIZE')) {
    return { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-400' };
  }
  if (action.includes('LOGIN') || action.includes('LOGOUT') || action.includes('AUTH') || action.includes('REFRESH')) {
    return { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-400' };
  }
  if (action.includes('APPROVAL') || action.includes('APPROVE') || action.includes('REJECT')) {
    return { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-400' };
  }
  return { bg: 'bg-gold-500/15', text: 'text-gold-400', border: 'border-gold-500/30', dot: 'bg-gold-400' };
};

/** Relative time — e.g. "3 min ago", "2h ago", "Yesterday" */
const relativeTime = (isoDate: string) => {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return '';
};

/** Build before/after field rows from before/after/diff objects */
const buildBeforeAfterRows = (
  log: AuditLog,
  fieldLabels: Record<string, string>,
): Array<{ field: string; label: string; before?: unknown; after?: unknown; type: 'changed' | 'added' | 'removed' | 'unchanged' }> => {
  const rows: Array<{ field: string; label: string; before?: unknown; after?: unknown; type: 'changed' | 'added' | 'removed' | 'unchanged' }> = [];

  // Prefer diff object for changed fields
  if (log.diff) {
    const highlights = collectDiffHighlights(log.diff);
    for (const h of highlights) {
      rows.push({
        field: h.field,
        label: formatFieldLabel(h.field, fieldLabels),
        before: h.from,
        after: h.to,
        type: (h.from === null || h.from === undefined) ? 'added'
            : (h.to === null || h.to === undefined) ? 'removed'
            : 'changed',
      });
    }
    return rows;
  }

  // Fallback: build from before/after snapshots
  const beforeObj = log.before ?? {};
  const afterObj = log.after ?? {};
  const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const skipKeys = new Set([
    'id', 'createdAt', 'updatedAt', 'businessId',
    // Skip enriched relation objects (included for name resolution, not display)
    'variant', 'product', 'branch', 'unit', 'category', 'supplier', 'customer',
    'sourceBranch', 'destinationBranch', 'priceList', 'sale', 'purchase',
    'purchaseOrder', 'openedBy', 'closedBy', 'requestedBy', 'approvedBy',
    'user', 'device',
  ]);

  for (const key of allKeys) {
    if (skipKeys.has(key)) continue;
    const bVal = beforeObj[key];
    const aVal = afterObj[key];
    const bStr = JSON.stringify(bVal);
    const aStr = JSON.stringify(aVal);

    if (bStr === aStr) continue; // skip unchanged

    let type: 'changed' | 'added' | 'removed' | 'unchanged' = 'changed';
    if (bVal === null || bVal === undefined) type = 'added';
    else if (aVal === null || aVal === undefined) type = 'removed';

    rows.push({
      field: key,
      label: formatFieldLabel(key, fieldLabels),
      before: bVal,
      after: aVal,
      type,
    });
  }

  return rows;
};

/* ─── Resource type icon mapping ─────────────────────────────────────────── */
const RESOURCE_ICONS: Record<string, string> = {
  Sale: 'ShoppingCart',
  SaleRefund: 'RotateCcw',
  Product: 'Package',
  Variant: 'Layers',
  Category: 'FolderTree',
  Customer: 'User',
  Supplier: 'Truck',
  Transfer: 'ArrowLeftRight',
  StockMovement: 'TrendingUp',
  Purchase: 'Receipt',
  PurchaseOrder: 'ClipboardList',
  Receiving: 'PackageCheck',
  Approval: 'ShieldCheck',
  ApprovalPolicy: 'Shield',
  User: 'UserCog',
  Role: 'Key',
  Branch: 'Building2',
  PriceList: 'Tag',
  Expense: 'Wallet',
  Shift: 'Clock',
  Note: 'StickyNote',
  Invitation: 'Mail',
  Subscription: 'CreditCard',
  Attachment: 'Paperclip',
  Unit: 'Ruler',
  Barcode: 'Barcode',
  OfflineDevice: 'Wifi',
};

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function AuditLogsPage() {
  const t = useTranslations('auditLogsPage');
  const common = useTranslations('common');
  const locale = useLocale();
  const { formatDate, formatDateTime } = useFormatDate();

  /* ── Field labels ── */
  const fieldLabels = useMemo<Record<string, string>>(() => ({
    id: t('fieldLabelId'),
    businessId: t('fieldLabelBusinessId'),
    branchId: t('fieldLabelBranchId'),
    userId: t('fieldLabelUserId'),
    roleId: t('fieldLabelRoleId'),
    categoryId: t('fieldLabelCategoryId'),
    productId: t('fieldLabelProductId'),
    variantId: t('fieldLabelVariantId'),
    supplierId: t('fieldLabelSupplierId'),
    customerId: t('fieldLabelCustomerId'),
    unitId: t('fieldLabelUnitId'),
    priceListId: t('fieldLabelPriceListId'),
    transferId: t('fieldLabelTransferId'),
    purchaseOrderId: t('fieldLabelPurchaseOrderId'),
    saleId: t('fieldLabelSaleId'),
    approvedById: t('fieldLabelApprovedById'),
    rejectedById: t('fieldLabelRejectedById'),
    name: t('fieldLabelName'),
    email: t('fieldLabelEmail'),
    phone: t('fieldLabelPhone'),
    address: t('fieldLabelAddress'),
    city: t('fieldLabelCity'),
    country: t('fieldLabelCountry'),
    description: t('fieldLabelDescription'),
    notes: t('fieldLabelNotes'),
    content: t('fieldLabelContent'),
    title: t('fieldLabelTitle'),
    status: t('fieldLabelStatus'),
    reason: t('fieldLabelReason'),
    lossReason: t('fieldLabelLossReason'),
    isActive: t('fieldLabelIsActive'),
    isSystem: t('fieldLabelIsSystem'),
    isArchived: t('fieldLabelIsArchived'),
    isAnonymized: t('fieldLabelIsAnonymized'),
    isReadOnly: t('fieldLabelIsReadOnly'),
    isEnabled: t('fieldLabelIsEnabled'),
    sku: t('fieldLabelSku'),
    barcode: t('fieldLabelBarcode'),
    costPrice: t('fieldLabelCostPrice'),
    sellingPrice: t('fieldLabelSellingPrice'),
    quantity: t('fieldLabelQuantity'),
    reorderPoint: t('fieldLabelReorderPoint'),
    minStock: t('fieldLabelMinStock'),
    maxStock: t('fieldLabelMaxStock'),
    movementType: t('fieldLabelMovementType'),
    batchNumber: t('fieldLabelBatchNumber'),
    expiryDate: t('fieldLabelExpiryDate'),
    unitName: t('fieldLabelUnitName'),
    total: t('fieldLabelTotal'),
    subtotal: t('fieldLabelSubtotal'),
    vat: t('fieldLabelVat'),
    discount: t('fieldLabelDiscount'),
    paymentMethod: t('fieldLabelPaymentMethod'),
    currency: t('fieldLabelCurrency'),
    exchangeRate: t('fieldLabelExchangeRate'),
    receiptNumber: t('fieldLabelReceiptNumber'),
    approvalTier: t('fieldLabelApprovalTier'),
    approvalStatus: t('fieldLabelApprovalStatus'),
    openedAt: t('fieldLabelOpenedAt'),
    closedAt: t('fieldLabelClosedAt'),
    openingBalance: t('fieldLabelOpeningBalance'),
    closingBalance: t('fieldLabelClosingBalance'),
    plan: t('fieldLabelPlan'),
    expiresAt: t('fieldLabelExpiresAt'),
    trialEndsAt: t('fieldLabelTrialEndsAt'),
    deactivatedAt: t('fieldLabelDeactivatedAt'),
    taxId: t('fieldLabelTaxId'),
    website: t('fieldLabelWebsite'),
  }), [t]);

  /* ── State ── */
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaging, setIsPaging] = useState(false);
  const [isLoadingChain, setIsLoadingChain] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [resourceOptions, setResourceOptions] = useState<ResourceOption[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [message, setMessage] = useToastState();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const loadLogsRef = useRef<(targetPage?: number, nextPageSize?: number) => Promise<void>>(undefined);
  const [total, setTotal] = useState<number | null>(null);
  const [chainLogs, setChainLogs] = useState<AuditLog[] | null>(null);
  const [chainAnchor, setChainAnchor] = useState<AuditLog | null>(null);
  const [showGuardChecks, setShowGuardChecks] = useState(false);
  const [showDashboardReports, setShowDashboardReports] = useState(false);
  const [showAuthRefresh, setShowAuthRefresh] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [activityFilter, setActivityFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  // Scroll to top when a log is selected so the detail panel is visible
  useEffect(() => {
    if (selectedLog) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedLog]);
  const dashboardFilterInit = useRef(false);
  const branchFilterInit = useRef(false);
  const chainSectionRef = useRef<HTMLDivElement>(null);
  const [userQuery, setUserQuery] = useState('');
  const [resourceQuery, setResourceQuery] = useState('');
  type ActivityByUser = { userId: string; name: string; actionCount: number };
  const [activityByUser, setActivityByUser] = useState<ActivityByUser[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);

  /* ── Activity by user loader ── */
  const loadActivityByUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setIsLoadingActivity(true);
    try {
      const data = await apiFetch<ActivityByUser[]>(
        '/audit-logs/activity-by-user',
        { token },
      );
      setActivityByUser(data.slice(0, 10));
      setActivityLoaded(true);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('activityByUserFailed')),
      });
    } finally {
      setIsLoadingActivity(false);
    }
  }, [t, setMessage]);

  const { activeBranch } = useBranchScope();

  /* ── Filters ── */
  const [filters, setFilters] = useState({
    branchId: '',
    roleId: '',
    userId: '',
    action: '',
    outcome: '',
    resourceType: '',
    resourceId: '',
    correlationId: '',
    requestId: '',
    sessionId: '',
    deviceId: '',
    offline: '',
    approvalStatus: '',
    from: '',
    to: '',
  });

  /* ── Reference maps ── */
  const branchMap = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );
  const roleMap = useMemo(
    () => new Map(roles.map((role) => [role.id, role.name])),
    [roles],
  );
  const userMap = useMemo(() => {
    return new Map(
      users.map((user) => [
        user.id,
        user.name?.trim() || user.email?.trim() || user.id,
      ]),
    );
  }, [users]);
  const userLabelToId = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((user) => {
      const label = user.name?.trim() || user.email?.trim() || user.id;
      map.set(label.toLowerCase(), user.id);
    });
    return map;
  }, [users]);
  const resourceLookup = useMemo(() => {
    return new Map(resourceOptions.map((option) => [option.id, option.label]));
  }, [resourceOptions]);
  const resourceLabelToId = useMemo(() => {
    const map = new Map<string, string>();
    resourceOptions.forEach((option) => {
      map.set(option.label.toLowerCase(), option.id);
    });
    return map;
  }, [resourceOptions]);

  /* ── Activity options ── */
  type ActivityOption = {
    value: string;
    label: string;
    action?: string;
    resourceType?: string;
    approvalStatus?: string;
  };
  const activityOptions = useMemo(
    (): ActivityOption[] => [
      { value: '', label: t('activityAll') },
      { value: 'stockAdjust', label: t('activityStockAdjustments'), action: 'STOCK_ADJUST' },
      { value: 'stockCount', label: t('activityStockCounts'), action: 'STOCK_COUNT' },
      { value: 'stockMovements', label: t('activityStockMovements'), resourceType: 'StockMovement' },
      { value: 'productCreate', label: t('activityProductCreated'), action: 'PRODUCT_CREATE' },
      { value: 'productUpdate', label: t('activityProductUpdated'), action: 'PRODUCT_UPDATE' },
      { value: 'variantCreate', label: t('activityVariantCreated'), action: 'VARIANT_CREATE' },
      { value: 'variantUpdate', label: t('activityVariantUpdated'), action: 'VARIANT_UPDATE' },
      { value: 'categoryCreate', label: t('activityCategoryCreated'), action: 'CATEGORY_CREATE' },
      { value: 'sales', label: t('activitySales'), resourceType: 'Sale' },
      { value: 'refunds', label: t('activityRefunds'), resourceType: 'SaleRefund' },
      { value: 'purchaseOrders', label: t('activityPurchaseOrders'), resourceType: 'PurchaseOrder' },
      { value: 'purchases', label: t('activityPurchases'), resourceType: 'Purchase' },
      { value: 'receiving', label: t('activityReceiving'), resourceType: 'Receiving' },
      { value: 'transfers', label: t('activityTransfers'), resourceType: 'Transfer' },
      { value: 'approvals', label: t('activityApprovals'), resourceType: 'Approval' },
      { value: 'users', label: t('activityUsers'), resourceType: 'User' },
      { value: 'roles', label: t('activityRoles'), resourceType: 'Role' },
    ],
    [t],
  );
  const activityOptionMap = useMemo(
    () => new Map(activityOptions.map((option) => [option.value, option])),
    [activityOptions],
  );
  const userOptions = useMemo(
    () =>
      users.map((user) => ({
        value: user.id,
        label: [user.name?.trim(), user.email?.trim()].filter(Boolean).join(' -- ')
          || user.id,
      })),
    [users],
  );

  /* ── Resolve resource label ── */
  const resolveResourceLabel = useCallback((log: AuditLog) => {
    const metadataResourceName =
      log.metadata && typeof log.metadata['resourceName'] === 'string'
        ? log.metadata['resourceName'].trim()
        : null;
    const metadataName =
      log.metadata && typeof log.metadata['name'] === 'string'
        ? log.metadata['name'].trim()
        : null;
    const metadataTitle =
      log.metadata && typeof log.metadata['title'] === 'string'
        ? log.metadata['title'].trim()
        : null;
    return (
      metadataResourceName ||
      metadataName ||
      metadataTitle ||
      resourceLookup.get(log.resourceId ?? '') ||
      (log.resourceId
        ? formatEntityLabel({ id: log.resourceId }, t('resourceFallback'))
        : null)
    );
  }, [resourceLookup, t]);

  /* ── Trace/hash render helpers ── */
  const renderTraceId = (value?: string | null) => {
    if (!value) {
      return <span className="text-gold-600">{t('notAvailable')}</span>;
    }
    const short = value.length > 10 ? `${value.slice(0, 8)}...` : value;
    return (
      <span title={value} className="cursor-help font-mono text-gold-300 bg-gold-500/5 px-1.5 py-0.5 rounded text-[10px]">
        {short}
      </span>
    );
  };
  const renderHash = (value?: string | null) => {
    if (!value) {
      return <span className="text-gold-600">{t('notAvailable')}</span>;
    }
    const short = value.length > 12 ? `${value.slice(0, 10)}...` : value;
    return (
      <span title={value} className="cursor-help font-mono text-gold-300 bg-gold-500/5 px-1.5 py-0.5 rounded text-[10px]">
        {short}
      </span>
    );
  };

  /* ── Data loading ── */
  const loadReferenceData = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    try {
      const [branchData, roleData, userData] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<Role> | Role[]>('/roles?limit=200', { token }),
        apiFetch<PaginatedResponse<User> | User[]>('/users?limit=200', { token }),
      ]);
      setBranches(normalizePaginated(branchData).items);
      setRoles(normalizePaginated(roleData).items);
      setUsers(normalizePaginated(userData).items);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    }
  };

  const loadLogs = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    if (!isLoading && !isRefreshing) {
      setIsPaging(true);
    }
    const effectivePageSize = nextPageSize ?? pageSize;
    const cursor =
      targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
    const query = buildCursorQuery({
      limit: effectivePageSize,
      cursor: cursor ?? undefined,
      branchId: filters.branchId || undefined,
      roleId: filters.roleId || undefined,
      userId: filters.userId || undefined,
      action: filters.action || undefined,
      outcome: filters.outcome || undefined,
      resourceType: filters.resourceType || undefined,
      resourceId: filters.resourceId || undefined,
      correlationId: filters.correlationId || undefined,
      requestId: filters.requestId || undefined,
      sessionId: filters.sessionId || undefined,
      deviceId: filters.deviceId || undefined,
      offline: filters.offline || undefined,
      approvalStatus: filters.approvalStatus || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      showGuardChecks: showGuardChecks ? '1' : undefined,
      showDashboardReports: showDashboardReports ? '1' : undefined,
      showAuthRefresh: showAuthRefresh ? '1' : undefined,
      includeTotal: targetPage === 1 ? '1' : undefined,
    });
    try {
      const data = await apiFetch<PaginatedResponse<AuditLog> | AuditLog[]>(
        `/audit-logs${query}`,
        { token, cache: 'no-store' },
      );
      const result = normalizePaginated(data);
      setLogs(result.items);
      setNextCursor(result.nextCursor);
      if (typeof result.total === 'number') {
        setTotal(result.total);
      }
      setPage(targetPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (result.nextCursor) {
          nextState[targetPage + 1] = result.nextCursor;
        }
        return nextState;
      });
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      setIsPaging(false);
      setIsLoading(false);
    }
  }, [pageSize, filters, showGuardChecks, showDashboardReports, showAuthRefresh, t]);
  loadLogsRef.current = loadLogs;

  const loadChain = async (log: AuditLog) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setChainAnchor(log);
    setIsLoadingChain(true);
    try {
      const anchorCorrelation = log.correlationId || log.requestId;
      const query = buildCursorQuery({
        limit: 200,
        correlationId: anchorCorrelation || undefined,
        resourceId: anchorCorrelation ? undefined : log.resourceId || undefined,
      });
      const data = await apiFetch<PaginatedResponse<AuditLog> | AuditLog[]>(
        `/audit-logs${query}`,
        { token, cache: 'no-store' },
      );
      const result = normalizePaginated(data);
      setChainLogs(result.items);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('chainLoadFailed')),
      });
    } finally {
      setIsLoadingChain(false);
    }
  };

  useEffect(() => {
    if (!chainAnchor) return;
    chainSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [chainAnchor]);

  /* ── Initial load ── */
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    setIsLoading(true);
    loadReferenceData().then(() => {
      setPage(1);
      setPageCursors({ 1: null });
      setTotal(null);
      setTimeout(() => loadLogsRef.current?.(1), 0);
    });
  }, []);

  useEffect(() => {
    if (!dashboardFilterInit.current) {
      dashboardFilterInit.current = true;
      return;
    }
    setIsRefreshing(true);
    setNextCursor(null);
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    loadLogsRef.current?.(1).finally(() => setIsRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDashboardReports, showAuthRefresh]);

  const filterChangeInit = useRef(false);
  useEffect(() => {
    if (!initialLoadDone.current) return;
    if (!filterChangeInit.current) {
      filterChangeInit.current = true;
      return;
    }
    setNextCursor(null);
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    loadLogsRef.current?.(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    if (filters.userId) {
      const label = formatEntityLabel(
        { name: userMap.get(filters.userId) ?? null, id: filters.userId },
        common('unknown'),
      );
      setUserQuery(label);
    }
  }, [filters.userId, userMap]);

  useEffect(() => {
    if (filters.resourceId) {
      const label = formatEntityLabel(
        { name: resourceLookup.get(filters.resourceId) ?? null, id: filters.resourceId },
        common('unknown'),
      );
      setResourceQuery(label);
    }
  }, [filters.resourceId, resourceLookup]);

  const applyActivityFilter = useCallback(
    (value: string) => {
      const option = activityOptionMap.get(value);
      setActivityFilter(value);
      setFilters((prev) => ({
        ...prev,
        action: option?.action ?? '',
        resourceType: option?.resourceType ?? '',
        approvalStatus: option?.approvalStatus ?? '',
        resourceId: '',
      }));
    },
    [activityOptionMap],
  );

  /* ── Resource options loader ── */
  useEffect(() => {
    const token = getAccessToken();
    const type = filters.resourceType.trim();
    if (!token || !type) {
      setResourceOptions([]);
      return;
    }
    type ResourceItem = { id: string } & Record<string, unknown>;
    const fetchConfig: Record<
      string,
      { endpoint: string; labelKeys: string[] }
    > = {
      Product: { endpoint: '/catalog/products?limit=200', labelKeys: ['name'] },
      Variant: {
        endpoint: '/catalog/variants?limit=200',
        labelKeys: ['name', 'sku'],
      },
      Category: {
        endpoint: '/catalog/categories?limit=200',
        labelKeys: ['name'],
      },
      Customer: { endpoint: '/customers?limit=200', labelKeys: ['name'] },
      Supplier: { endpoint: '/suppliers?limit=200', labelKeys: ['name'] },
      PriceList: { endpoint: '/price-lists?limit=200', labelKeys: ['name'] },
      Branch: { endpoint: '/branches?limit=200', labelKeys: ['name'] },
      User: { endpoint: '/users?limit=200', labelKeys: ['name', 'email'] },
      Role: { endpoint: '/roles?limit=200', labelKeys: ['name'] },
    };
    const config = fetchConfig[type];
    if (!config) {
      setResourceOptions([]);
      return;
    }
    let isActive = true;
    setIsLoadingResources(true);
    apiFetch<PaginatedResponse<ResourceItem> | ResourceItem[]>(config.endpoint, { token })
      .then((data) => {
        if (!isActive) {
          return;
        }
        const items = normalizePaginated(data).items;
        const options = items.map((item) => {
          const labelValue = config.labelKeys
            .map((key) => item?.[key as keyof ResourceItem])
            .find(
              (value): value is string =>
                typeof value === 'string' && value.trim().length > 0,
            );
          const label = labelValue ? labelValue.trim() : item.id;
          return { id: item.id, label };
        });
        setResourceOptions(options);
      })
      .catch(() => {
        if (isActive) {
          setResourceOptions([]);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingResources(false);
        }
      });
    return () => {
      isActive = false;
    };
  }, [filters.resourceType]);

  /* ── Derived data ── */
  const summaries = useMemo(
    () =>
      logs.map((log) => {
        const userName = log.userId ? userMap.get(log.userId) ?? null : null;
        const branchName = log.branchId
          ? branchMap.get(log.branchId) ?? null
          : null;
        const roleName = log.roleId ? roleMap.get(log.roleId) ?? null : null;
        const resourceLabel = resolveResourceLabel(log);
        const resolvedLog =
          log.resolved && typeof log.resolved === 'object'
            ? (log.resolved as typeof log)
            : log;
        return {
          id: log.id,
          narrative: buildAuditNarrative(resolvedLog, {
            userName,
            branchName,
            roleName,
            resourceLabel,
            locale,
          }),
        };
      }),
    [branchMap, logs, resolveResourceLabel, roleMap, userMap],
  );
  const summaryMap = useMemo(
    () => new Map(summaries.map((item) => [item.id, item.narrative])),
    [summaries],
  );
  const guardActions = useMemo(
    () => new Set(['PERMISSION_CHECK', 'SUBSCRIPTION_CHECK']),
    [],
  );
  const filteredLogs = useMemo(() => {
    if (showGuardChecks) {
      return logs;
    }
    return logs.filter((log) => !guardActions.has(log.action));
  }, [guardActions, logs, showGuardChecks]);
  const orderedChainLogs = useMemo(() => {
    if (!chainLogs) {
      return null;
    }
    return [...chainLogs].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [chainLogs]);
  const successCount = useMemo(
    () => filteredLogs.filter((log) => log.outcome === 'SUCCESS').length,
    [filteredLogs],
  );
  const uniqueActors = useMemo(() => {
    const actors = new Set(filteredLogs.map((l) => l.userId).filter(Boolean));
    return actors.size;
  }, [filteredLogs]);
  const successRate = useMemo(() => {
    if (!filteredLogs.length) return 0;
    return Math.round((successCount / filteredLogs.length) * 100);
  }, [filteredLogs, successCount]);
  const activeFilterCount = useMemo(() => {
    const valueCount = Object.values(filters).filter((value) => Boolean(value)).length;
    const toggleCount =
      Number(showGuardChecks) + Number(showDashboardReports) + Number(showAuthRefresh);
    return valueCount + toggleCount;
  }, [filters, showAuthRefresh, showDashboardReports, showGuardChecks]);
  const timelineGroups = useMemo(() => {
    const groups: { date: string; logs: AuditLog[] }[] = [];
    const map = new Map<string, AuditLog[]>();
    for (const log of filteredLogs) {
      const day = log.createdAt.slice(0, 10);
      let list = map.get(day);
      if (!list) {
        list = [];
        map.set(day, list);
        groups.push({ date: day, logs: list });
      }
      list.push(log);
    }
    return groups;
  }, [filteredLogs]);

  /* ── Export query ── */
  const exportBase = buildCursorQuery({
    ...filters,
    approvalStatus: filters.approvalStatus || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    showGuardChecks: showGuardChecks ? '1' : undefined,
    showAuthRefresh: showAuthRefresh ? '1' : undefined,
    showDashboardReports: showDashboardReports ? '1' : undefined,
  });

  /* ── Detail panel derived ── */
  const detailNarrative = selectedLog ? summaryMap.get(selectedLog.id) : null;
  const detailRelatedLinks = selectedLog ? buildRelatedLinks(selectedLog, t, locale) : [];
  const detailResolvedLabel = selectedLog ? resolveResourceLabel(selectedLog) : null;
  const detailResolvedJson = selectedLog
    ? selectedLog.resolved ?? ({
        ...selectedLog,
        labels: {
          resource: detailResolvedLabel,
          user: selectedLog.userId ? userMap.get(selectedLog.userId) ?? selectedLog.userId : null,
          role: selectedLog.roleId ? roleMap.get(selectedLog.roleId) ?? selectedLog.roleId : null,
          branch: selectedLog.branchId ? branchMap.get(selectedLog.branchId) ?? selectedLog.branchId : null,
          device: typeof selectedLog.metadata?.deviceName === 'string'
            ? selectedLog.metadata.deviceName
            : selectedLog.deviceId ?? null,
        },
      } as Record<string, unknown>)
    : null;
  const detailBeforeAfterRows = selectedLog ? buildBeforeAfterRows(selectedLog, fieldLabels) : [];

  // Combined resolver map for resolving IDs → names in diff values
  const idResolverMap = useMemo(() => {
    const map = new Map<string, string>();
    // Merge all known entity maps
    for (const [id, name] of userMap) map.set(id, name);
    for (const [id, name] of roleMap) map.set(id, name);
    for (const [id, name] of branchMap) map.set(id, name);
    // Also try to extract names from the selected log's before/after snapshots
    if (selectedLog) {
      const extractNames = (obj: Record<string, unknown> | null | undefined) => {
        if (!obj) return;
        // Look for patterns like { variantId: "uuid", variant: { name: "Cheeks" } }
        for (const [key, val] of Object.entries(obj)) {
          if (key.endsWith('Id') && typeof val === 'string' && UUID_RE.test(val)) {
            const entityKey = key.slice(0, -2); // "variantId" → "variant"
            const entity = obj[entityKey];
            if (entity && typeof entity === 'object') {
              const e = entity as Record<string, unknown>;
              const label = e.name ?? e.label ?? e.code ?? e.referenceNumber ?? e.email ?? e.deviceName;
              if (typeof label === 'string') map.set(val, label);
            }
          }
        }
      };
      extractNames(selectedLog.before);
      extractNames(selectedLog.after);
    }
    return map;
  }, [userMap, roleMap, branchMap, selectedLog]);

  /* ─── Action badge component ─── */
  const ActionBadge = ({ action, size = 'sm' }: { action: string; size?: 'xs' | 'sm' }) => {
    const color = getActionColor(action);
    const sizeClass = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
    const label = action.replace(/_/g, ' ');
    return (
      <span className={`inline-flex items-center gap-1 rounded-full font-medium nvi-status-fade ${color.bg} ${color.text} ${sizeClass}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
        {label}
      </span>
    );
  };

  /* ─── Outcome dot ─── */
  const OutcomeDot = ({ outcome }: { outcome: string }) => (
    <span
      className={`inline-block h-2 w-2 rounded-full nvi-status-fade ${outcome === 'SUCCESS' ? 'bg-emerald-400' : 'bg-red-400'}`}
      title={outcome}
    />
  );

  /* ─── Resource type icon ─── */
  const ResourceIcon = ({ type }: { type: string }) => {
    const iconName = RESOURCE_ICONS[type] ?? 'FileText';
    return <Icon name={iconName as any} size={12} className="text-gold-500" />;
  };

  /* ───────────── KPI STRIP ───────────── */
  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      <Card as="article" padding="md">
        <div className="flex items-start gap-3">
          <span className="nvi-kpi-icon nvi-kpi-icon--accent shrink-0" style={{ width: 36, height: 36 }}>
            <Icon name="FileText" size={18} />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiLoadedEvents')}</p>
            <p className="mt-1 text-2xl font-semibold text-gold-100">{total ?? filteredLogs.length}</p>
          </div>
        </div>
      </Card>
      <Card as="article" padding="md">
        <div className="flex items-start gap-3">
          <span className="nvi-kpi-icon nvi-kpi-icon--emerald shrink-0" style={{ width: 36, height: 36 }}>
            <Icon name="CircleCheck" size={18} />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiSuccessRate')}</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-300">{successRate}%</p>
          </div>
        </div>
      </Card>
      <Card as="article" padding="md">
        <div className="flex items-start gap-3">
          <span className="nvi-kpi-icon nvi-kpi-icon--blue shrink-0" style={{ width: 36, height: 36 }}>
            <Icon name="Users" size={18} />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiUniqueActors')}</p>
            <p className="mt-1 text-2xl font-semibold text-blue-300">{uniqueActors}</p>
          </div>
        </div>
      </Card>
      <Card as="article" padding="md">
        <div className="flex items-start gap-3">
          <span className="nvi-kpi-icon nvi-kpi-icon--amber shrink-0" style={{ width: 36, height: 36 }}>
            <Icon name="ListFilter" size={18} />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiActiveFilters')}</p>
            <p className="mt-1 text-2xl font-semibold text-gold-100">{activeFilterCount}</p>
          </div>
        </div>
      </Card>
    </div>
  );

  /* ───────────── FILTER BAR ───────────── */
  const filtersSection = (
    <Card padding="md">
      <div className="space-y-3">
        {/* Primary filter row */}
        <div className="flex items-center gap-2 mb-2">
          <Icon name="ListFilter" size={14} className="text-gold-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">{t('filters')}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DatePickerInput
            value={filters.from}
            onChange={(value) => setFilters({ ...filters, from: value })}
            placeholder={t('fromDate')}
            className="rounded-lg border border-nvi-border bg-nvi-surface px-3 py-2 text-nvi-text-primary text-xs"
          />
          <DatePickerInput
            value={filters.to}
            onChange={(value) => setFilters({ ...filters, to: value })}
            placeholder={t('toDate')}
            className="rounded-lg border border-nvi-border bg-nvi-surface px-3 py-2 text-nvi-text-primary text-xs"
          />
          <SmartSelect
            instanceId="audit-filter-outcome"
            value={filters.outcome}
            onChange={(value) => setFilters({ ...filters, outcome: value })}
            options={[
              { value: 'SUCCESS', label: t('success') },
              { value: 'FAILURE', label: t('failure') },
            ]}
            placeholder={t('allOutcomes')}
            isClearable
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="audit-filter-activity"
            value={activityFilter}
            onChange={(value) => applyActivityFilter(value || '')}
            options={activityOptions}
            placeholder={t('activityType')}
            isClearable
            className="nvi-select-container"
          />
        </div>

        {/* Secondary row: actor, controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[200px] flex-1">
            <SmartSelect
              instanceId="audit-filter-user"
              value={filters.userId}
              onChange={(value) => setFilters({ ...filters, userId: value })}
              options={userOptions}
              placeholder={t('actorPlaceholder')}
              isClearable
              className="nvi-select-container"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setShowAdvancedFilters((prev) => {
                const next = !prev;
                if (!next) {
                  const activity = activityOptionMap.get(activityFilter);
                  setFilters((current) => ({
                    ...current,
                    roleId: '',
                    action: activity?.action ?? '',
                    resourceType: activity?.resourceType ?? '',
                    resourceId: '',
                    approvalStatus: activity?.approvalStatus ?? '',
                    correlationId: '',
                    requestId: '',
                    sessionId: '',
                    deviceId: '',
                  }));
                }
                return next;
              });
            }}
            className="nvi-btn-secondary inline-flex items-center gap-1.5 rounded-lg border border-nvi-border px-3 py-2 text-xs text-nvi-text-primary"
          >
            <Icon name="SlidersHorizontal" size={12} />
            {t('moreFilters')}
            {activeFilterCount > 0 ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gold-500 text-[10px] font-semibold text-black">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={async () => {
              setIsRefreshing(true);
              setNextCursor(null);
              setPage(1);
              setPageCursors({ 1: null });
              setTotal(null);
              await loadLogs(1);
              setIsRefreshing(false);
            }}
            disabled={isRefreshing}
            className="nvi-btn-secondary inline-flex items-center gap-2 rounded-lg border border-nvi-border px-3 py-2 text-xs text-nvi-text-primary disabled:opacity-60"
          >
            {isRefreshing ? <Spinner size="xs" variant="orbit" /> : <Icon name="RefreshCw" size={12} />}
            {isRefreshing ? t('refreshing') : t('refreshLogs')}
          </button>
          <a
            href={`/api/v1/audit-logs/export${exportBase}&format=csv`}
            className="nvi-btn-secondary inline-flex items-center gap-1.5 rounded-lg border border-nvi-border px-3 py-2 text-xs text-nvi-text-primary"
          >
            <Icon name="Download" size={12} />
            {t('exportCsv')}
          </a>
          <a
            href={`/api/v1/audit-logs/export${exportBase}&format=pdf`}
            className="nvi-btn-secondary inline-flex items-center gap-1.5 rounded-lg border border-nvi-border px-3 py-2 text-xs text-nvi-text-primary"
          >
            <Icon name="FileDown" size={12} />
            {t('exportPdf')}
          </a>
          <Link
            href={`/${locale}/exports`}
            className="nvi-btn-secondary inline-flex items-center gap-1.5 rounded-lg border border-nvi-border px-3 py-2 text-xs text-nvi-text-primary"
          >
            <Icon name="ExternalLink" size={12} />
            {t('exportLogs')}
          </Link>
        </div>

        {/* Advanced filters */}
        {showAdvancedFilters ? (
          <div className="rounded-xl border border-nvi-border bg-black/30 p-4 space-y-3 nvi-expand">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SmartSelect
                instanceId="audit-detail-1"
                value={filters.branchId}
                onChange={(value) => setFilters({ ...filters, branchId: value })}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
                placeholder={t('allBranches')}
                isClearable
                className="nvi-select-container"
              />
              <SmartSelect
                instanceId="audit-detail-2"
                value={filters.roleId}
                onChange={(value) => setFilters({ ...filters, roleId: value })}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
                placeholder={t('allRoles')}
                isClearable
                className="nvi-select-container"
              />
              <SmartSelect
                instanceId="audit-detail-3"
                value={filters.offline}
                onChange={(value) => setFilters({ ...filters, offline: value })}
                options={[
                  { value: 'true', label: t('offlineOnly') },
                  { value: 'false', label: t('onlineOnly') },
                ]}
                placeholder={t('onlineOffline')}
                isClearable
                className="nvi-select-container"
              />
              <input
                value={filters.action}
                onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                placeholder={t('actionPlaceholder')}
                className="rounded-lg border border-nvi-border bg-nvi-surface px-3 py-2 text-xs text-nvi-text-primary"
              />
              <input
                value={filters.resourceType}
                onChange={(e) => setFilters({ ...filters, resourceType: e.target.value })}
                placeholder={t('resourceTypePlaceholder')}
                className="rounded-lg border border-nvi-border bg-nvi-surface px-3 py-2 text-xs text-nvi-text-primary"
              />
              <div>
                <input
                  list="audit-resource-options"
                  value={resourceQuery}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const resolved = resourceLabelToId.get(raw.toLowerCase()) ?? (resourceLookup.has(raw) ? raw : raw);
                    setResourceQuery(raw);
                    setFilters({ ...filters, resourceId: resolved });
                  }}
                  placeholder={isLoadingResources ? t('loadingResources') : t('resourcePlaceholder')}
                  className="w-full rounded-lg border border-nvi-border bg-nvi-surface px-3 py-2 text-xs text-nvi-text-primary"
                />
                <datalist id="audit-resource-options">
                  {resourceOptions.map((o) => <option key={o.id} value={o.label} />)}
                </datalist>
              </div>
              <SmartSelect
                instanceId="audit-detail-4"
                value={filters.approvalStatus}
                onChange={(value) => setFilters({ ...filters, approvalStatus: value })}
                options={[
                  { value: 'REQUESTED', label: t('requested') },
                  { value: 'APPROVED', label: t('approved') },
                  { value: 'REJECTED', label: t('rejected') },
                ]}
                placeholder={t('approvalAll')}
                isClearable
                className="nvi-select-container"
              />
              <input
                value={filters.correlationId}
                onChange={(e) => setFilters({ ...filters, correlationId: e.target.value })}
                placeholder={t('correlationId')}
                className="rounded-lg border border-nvi-border bg-nvi-surface px-3 py-2 text-xs text-nvi-text-primary"
              />
              <input
                value={filters.requestId}
                onChange={(e) => setFilters({ ...filters, requestId: e.target.value })}
                placeholder={t('requestId')}
                className="rounded-lg border border-nvi-border bg-nvi-surface px-3 py-2 text-xs text-nvi-text-primary"
              />
              <input
                value={filters.sessionId}
                onChange={(e) => setFilters({ ...filters, sessionId: e.target.value })}
                placeholder={t('sessionId')}
                className="rounded-lg border border-nvi-border bg-nvi-surface px-3 py-2 text-xs text-nvi-text-primary"
              />
              <input
                value={filters.deviceId}
                onChange={(e) => setFilters({ ...filters, deviceId: e.target.value })}
                placeholder={t('deviceId')}
                className="rounded-lg border border-nvi-border bg-nvi-surface px-3 py-2 text-xs text-nvi-text-primary"
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs text-gold-300">
                <input type="checkbox" checked={showGuardChecks} onChange={(e) => setShowGuardChecks(e.target.checked)} className="h-3.5 w-3.5 rounded" />
                {t('showGuardChecks')}
              </label>
              <label className="flex items-center gap-2 text-xs text-gold-300">
                <input type="checkbox" checked={showAuthRefresh} onChange={(e) => setShowAuthRefresh(e.target.checked)} className="h-3.5 w-3.5 rounded" />
                {t('showAuthRefresh')}
              </label>
              <label className="flex items-center gap-2 text-xs text-gold-300">
                <input type="checkbox" checked={showDashboardReports} onChange={(e) => setShowDashboardReports(e.target.checked)} className="h-3.5 w-3.5 rounded" />
                {t('showDashboardReports')}
              </label>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );

  /* ───────────── ACTIVITY BY USER SECTION ───────────── */
  const activityByUserSection = (
    <Card padding="md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/15">
            <Icon name="Users" size={14} className="text-blue-400" />
          </span>
          <h3 className="text-sm font-semibold text-nvi-text-primary">{t('activityByUserTitle')}</h3>
        </div>
        {!activityLoaded ? (
          <button
            type="button"
            onClick={loadActivityByUser}
            disabled={isLoadingActivity}
            className="nvi-btn-secondary inline-flex items-center gap-1.5 rounded-lg border border-nvi-border px-3 py-1.5 text-xs text-nvi-text-secondary nvi-press"
          >
            {isLoadingActivity ? <Spinner size="xs" variant="orbit" /> : <Icon name="ChartColumn" size={12} />}
            {isLoadingActivity ? t('loadingActivity') : t('loadActivity')}
          </button>
        ) : null}
      </div>
      {isLoadingActivity ? (
        <div className="flex items-center gap-2 text-xs text-gold-400">
          <Spinner size="xs" variant="orbit" /> {t('loadingActivity')}
        </div>
      ) : activityByUser.length === 0 && activityLoaded ? (
        <p className="text-xs text-gold-400">{t('noActivityData')}</p>
      ) : activityByUser.length > 0 ? (
        <div className="space-y-2">
          {activityByUser.map((entry, index) => {
            const maxCount = activityByUser[0]?.actionCount ?? 1;
            const barWidth = Math.max(8, Math.round((entry.actionCount / maxCount) * 100));
            return (
              <div key={entry.userId} className="flex items-center gap-3">
                <span className="w-5 text-right text-xs font-medium text-gold-500">{index + 1}</span>
                <AvatarInitials name={entry.name || '?'} size="xs" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="truncate text-xs font-medium text-gold-100">{entry.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-gold-400">{entry.actionCount}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gold-500/10">
                    <div
                      className="h-full rounded-full bg-blue-500/60 transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );

  /* ───────────── FORENSIC DETAIL PANEL ───────────── */
  const renderDetailPanel = () => {
    if (!selectedLog) return null;
    const actionColor = getActionColor(selectedLog.action);
    const actorName = selectedLog.userId
      ? userMap.get(selectedLog.userId) ?? selectedLog.userId.slice(0, 8)
      : common('unknown');
    const roleName = selectedLog.roleId
      ? roleMap.get(selectedLog.roleId) ?? null
      : null;
    const isCreate = selectedLog.action.includes('CREATE') || selectedLog.action.includes('COMPLETE');
    const isDelete = selectedLog.action.includes('DELETE') || selectedLog.action.includes('VOID') || selectedLog.action.includes('PURGE') || selectedLog.action.includes('ARCHIVE') || selectedLog.action.includes('ANONYMIZE');
    const rel = relativeTime(selectedLog.createdAt);
    const resourceIconName = RESOURCE_ICONS[selectedLog.resourceType] ?? 'FileText';
    const resourceLabel = resolveResourceLabel(selectedLog) ?? selectedLog.resourceId?.slice(0, 8) ?? '';

    return (
      <div className="w-full lg:w-[460px] xl:w-[520px] flex-shrink-0 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto nvi-slide-in-bottom">
        <Card padding="lg">
          <div className="space-y-5">

            {/* ─── Header ─── */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                {/* Action badge + outcome badge */}
                <div className="flex flex-wrap items-center gap-2">
                  <ActionBadge action={selectedLog.action} size="sm" />
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium nvi-status-fade ${
                      selectedLog.outcome === 'SUCCESS'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    <Icon name={selectedLog.outcome === 'SUCCESS' ? 'CircleCheck' : 'CircleX'} size={11} />
                    {selectedLog.outcome}
                  </span>
                  {detailNarrative?.severity === 'HIGH' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
                      <Icon name="TriangleAlert" size={10} />
                      {t('severityHigh')}
                    </span>
                  ) : null}
                </div>

                {/* Resource breadcrumb */}
                <div className="flex items-center gap-1.5 text-xs text-gold-300">
                  <Icon name={resourceIconName as any} size={13} className="text-gold-500" />
                  <span className="font-medium">{selectedLog.resourceType}</span>
                  {resourceLabel ? (
                    <>
                      <Icon name="ChevronRight" size={10} className="text-gold-600" />
                      <span className="font-mono text-gold-400">{resourceLabel}</span>
                    </>
                  ) : null}
                </div>

                {/* Narrative */}
                <p className="text-sm font-semibold leading-snug text-gold-100">
                  {detailNarrative?.primary ?? selectedLog.action}
                </p>

                {/* Timestamp */}
                <div className="flex items-center gap-2 text-xs text-gold-500">
                  <Icon name="Clock" size={11} />
                  <span>{formatDateTime(selectedLog.createdAt)}</span>
                  {rel ? <span className="text-gold-600">({rel})</span> : null}
                </div>

                {/* Actor */}
                <div className="flex items-center gap-2">
                  <AvatarInitials name={actorName} size="xs" />
                  <span className="text-xs font-medium text-gold-200">{actorName}</span>
                  {roleName ? (
                    <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-400">{roleName}</span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="flex-shrink-0 rounded-lg border border-nvi-border p-1.5 text-gold-400 hover:text-gold-200 hover:bg-gold-500/5 transition nvi-press"
                aria-label={t('closeDetail')}
              >
                <Icon name="X" size={14} />
              </button>
            </div>

            {/* ─── Narrative extras ─── */}
            {detailNarrative?.reason || detailNarrative?.details || detailNarrative?.failure ? (
              <div className="space-y-1.5 rounded-xl border border-nvi-border bg-black/20 p-3 text-xs">
                {detailNarrative.reason ? <p className="text-gold-300"><Icon name="Info" size={11} className="inline mr-1 text-gold-500" />{detailNarrative.reason}</p> : null}
                {detailNarrative.details ? <p className="text-gold-300">{detailNarrative.details}</p> : null}
                {detailNarrative.failure ? <p className="text-red-300"><Icon name="TriangleAlert" size={11} className="inline mr-1" />{detailNarrative.failure}</p> : null}
                {detailNarrative.offline ? <p className="text-gold-400"><Icon name="WifiOff" size={11} className="inline mr-1" />{detailNarrative.offline}</p> : null}
                {detailNarrative.impact ? <p className="text-gold-400"><Icon name="TrendingUp" size={11} className="inline mr-1" />{detailNarrative.impact}</p> : null}
              </div>
            ) : null}

            {/* ─── Approval info ─── */}
            {detailNarrative?.approval || detailNarrative?.approvalChain || detailNarrative?.approvalStatus ? (
              <div className="space-y-1 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 text-xs">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon name="ShieldCheck" size={12} className="text-purple-400" />
                  <span className="font-medium text-purple-300">{t('approvalInfoTitle')}</span>
                </div>
                {detailNarrative.approval ? <p className="text-gold-300">{detailNarrative.approval}</p> : null}
                {detailNarrative.approvalChain ? <p className="text-gold-300">{detailNarrative.approvalChain}</p> : null}
                {detailNarrative.approvalStatus ? <p className="text-gold-300">{detailNarrative.approvalStatus}</p> : null}
              </div>
            ) : null}

            {/* ─── BEFORE / AFTER DIFF — the hero ─── */}
            {detailBeforeAfterRows.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon name="GitCompare" size={13} className="text-gold-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gold-400">{t('sectionWhatChanged')}</p>
                </div>

                {isCreate ? (
                  /* CREATE — single column "created values" */
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
                    <div className="px-3 py-2 border-b border-emerald-500/15">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">{t('diffCreatedValues')}</span>
                    </div>
                    <div className="divide-y divide-emerald-500/10">
                      {detailBeforeAfterRows.map((row) => (
                        <div key={row.field} className="flex items-baseline gap-2 px-3 py-1.5">
                          <span className="text-[11px] text-gold-400 min-w-[100px] shrink-0">{row.label}</span>
                          <span className="text-xs font-medium text-emerald-300">{formatEvidenceValue(row.after, row.field, idResolverMap)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : isDelete ? (
                  /* DELETE — single column "deleted values" */
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 overflow-hidden">
                    <div className="px-3 py-2 border-b border-red-500/15">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-400">{t('diffDeletedValues')}</span>
                    </div>
                    <div className="divide-y divide-red-500/10">
                      {detailBeforeAfterRows.map((row) => (
                        <div key={row.field} className="flex items-baseline gap-2 px-3 py-1.5">
                          <span className="text-[11px] text-gold-400 min-w-[100px] shrink-0">{row.label}</span>
                          <span className="text-xs text-red-300 line-through">{formatEvidenceValue(row.before, row.field, idResolverMap)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* UPDATE — two-column before/after */
                  <div className="rounded-xl border border-nvi-border overflow-hidden">
                    {/* Column headers */}
                    <div className="grid grid-cols-[minmax(90px,1fr)_1fr_1fr] gap-0 border-b border-nvi-border bg-black/30">
                      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500">{t('diffFieldLabel')}</div>
                      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500 border-l border-nvi-border">{t('diffBefore')}</div>
                      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500 border-l border-nvi-border">{t('diffAfter')}</div>
                    </div>
                    {/* Rows */}
                    <div className="divide-y divide-nvi-border/50">
                      {detailBeforeAfterRows.map((row) => (
                        <div
                          key={row.field}
                          className={`grid grid-cols-[minmax(90px,1fr)_1fr_1fr] gap-0 ${
                            row.type === 'added' ? 'bg-emerald-500/5' : row.type === 'removed' ? 'bg-red-500/5' : ''
                          }`}
                        >
                          <div className="px-3 py-1.5 flex items-center gap-1">
                            {row.type === 'added' ? (
                              <Icon name="Plus" size={10} className="text-emerald-400 shrink-0" />
                            ) : row.type === 'removed' ? (
                              <Icon name="Minus" size={10} className="text-red-400 shrink-0" />
                            ) : (
                              <Icon name="Pencil" size={10} className="text-blue-400 shrink-0" />
                            )}
                            <span className="text-[11px] text-gold-300 truncate">{row.label}</span>
                          </div>
                          <div className="px-3 py-1.5 border-l border-nvi-border/50">
                            {row.type === 'added' ? (
                              <span className="text-xs text-gold-600">--</span>
                            ) : (
                              <span className={`text-xs ${row.type === 'changed' ? 'text-red-400 line-through' : 'text-red-300'}`}>
                                {formatEvidenceValue(row.before, row.field, idResolverMap)}
                              </span>
                            )}
                          </div>
                          <div className="px-3 py-1.5 border-l border-nvi-border/50">
                            {row.type === 'removed' ? (
                              <span className="text-xs text-gold-600">--</span>
                            ) : (
                              <span className={`text-xs ${row.type === 'changed' ? 'font-medium text-emerald-400' : 'text-emerald-300'}`}>
                                {formatEvidenceValue(row.after, row.field, idResolverMap)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* ─── Who section ─── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Icon name="UserCog" size={13} className="text-gold-400" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gold-400">{t('sectionWho')}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <Icon name="User" size={11} className="text-gold-500" />
                  <span className="text-gold-500">{t('userLabel')}</span>
                  <span className="text-gold-200 truncate">
                    {selectedLog.userId
                      ? formatEntityLabel({ name: userMap.get(selectedLog.userId) ?? null, id: selectedLog.userId }, common('unknown'))
                      : common('unknown')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon name="Key" size={11} className="text-gold-500" />
                  <span className="text-gold-500">{t('roleLabel')}</span>
                  <span className="text-gold-200 truncate">
                    {formatEntityLabel({ name: roleMap.get(selectedLog.roleId ?? '') ?? null, id: selectedLog.roleId ?? null }, common('unknown'))}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon name="Building2" size={11} className="text-gold-500" />
                  <span className="text-gold-500">{t('branchLabel')}</span>
                  <span className="text-gold-200 truncate">
                    {selectedLog.branchId
                      ? formatEntityLabel({ name: branchMap.get(selectedLog.branchId) ?? null, id: selectedLog.branchId }, common('unknown'))
                      : t('notAvailable')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon name="Monitor" size={11} className="text-gold-500" />
                  <span className="text-gold-500">{t('deviceLabel')}</span>
                  <span className="text-gold-200 truncate">
                    {formatEntityLabel(
                      { name: typeof selectedLog.metadata?.deviceName === 'string' ? selectedLog.metadata.deviceName : null, id: selectedLog.deviceId ?? null },
                      t('notAvailable'),
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* ─── Actions: chain + related links ─── */}
            <div className="flex flex-wrap gap-2 border-t border-nvi-border pt-3">
              <button
                type="button"
                onClick={() => loadChain(selectedLog)}
                disabled={isLoadingChain}
                className="nvi-btn-secondary inline-flex items-center gap-1.5 rounded-lg border border-nvi-border px-3 py-1.5 text-xs text-nvi-text-primary nvi-press disabled:opacity-60"
              >
                {isLoadingChain ? <Spinner size="xs" variant="dots" /> : <Icon name="Eye" size={12} />}
                {t('viewChain')}
              </button>
              {detailRelatedLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="nvi-btn-secondary inline-flex items-center gap-1.5 rounded-lg border border-nvi-border px-3 py-1.5 text-xs text-gold-300 nvi-press"
                >
                  <Icon name="ExternalLink" size={11} />
                  {link.label}
                </a>
              ))}
            </div>

            {/* ─── Technical trace (collapsible) ─── */}
            <details className="rounded-xl border border-nvi-border bg-black/20 nvi-expand">
              <summary className="cursor-pointer flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-gold-300">
                <Icon name="Terminal" size={12} className="text-gold-500" />
                {t('technicalTrace')}
              </summary>
              <div className="px-3 pb-3 pt-1 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gold-500">{t('requestLabel')}</span>
                    {renderTraceId(selectedLog.requestId)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gold-500">{t('sessionLabel')}</span>
                    {renderTraceId(selectedLog.sessionId)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gold-500">{t('correlationLabel')}</span>
                    {renderTraceId(selectedLog.correlationId)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Icon name="Link" size={10} className="text-gold-500" />
                    <span className="text-[10px] text-gold-500">{t('hashLabel')}</span>
                    {renderHash(selectedLog.hash)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gold-500">{t('previousHashLabel')}</span>
                    {renderHash(selectedLog.previousHash)}
                  </div>
                </div>
              </div>
            </details>

            {/* ─── Raw JSON ─── */}
            <details className="rounded-xl border border-nvi-border bg-black/20">
              <summary className="cursor-pointer flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-gold-300">
                <Icon name="Code" size={12} className="text-gold-500" />
                {t('rawEventJson')}
              </summary>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all px-3 pb-3 pt-1 text-[11px] text-gold-500 font-mono">
                {JSON.stringify(selectedLog, null, 2)}
              </pre>
            </details>

          </div>
        </Card>
      </div>
    );
  };

  /* ───────────── TABLE VIEW ───────────── */
  const tableView = (
    <div className="min-w-0 flex gap-4 items-start">
      <div className={selectedLog ? 'min-w-0 flex-1' : 'w-full'}>
        <Card padding="sm">
          <div className="overflow-hidden rounded-xl">
            {filteredLogs.map((log) => {
              const narrative = summaryMap.get(log.id);
              const isSelected = selectedLog?.id === log.id;
              const actorName = log.userId
                ? userMap.get(log.userId) ?? log.userId.slice(0, 8)
                : common('unknown');
              const actionColor = getActionColor(log.action);
              const rel = relativeTime(log.createdAt);
              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedLog(isSelected ? null : log)}
                  className={`w-full flex items-center gap-3 border-b border-nvi-border/30 px-4 py-3 text-left transition-colors nvi-press ${
                    isSelected ? 'bg-gold-500/5' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <OutcomeDot outcome={log.outcome} />
                  <ActionBadge action={log.action} size="xs" />
                  <span className="min-w-0 flex-1 break-words text-sm text-gold-100 leading-snug">
                    {narrative?.primary ?? log.action}
                  </span>
                  <span className="hidden items-center gap-1 flex-shrink-0 rounded-full border border-nvi-border bg-gold-500/5 px-2 py-0.5 text-[10px] text-gold-500 sm:inline-flex">
                    <ResourceIcon type={log.resourceType} />
                    {log.resourceType}
                  </span>
                  <span className="hidden w-28 flex-shrink-0 items-center gap-1.5 justify-end md:inline-flex">
                    <AvatarInitials name={actorName} size="xs" />
                    <span className="truncate text-xs text-gold-400">{actorName}</span>
                  </span>
                  <span className="w-24 flex-shrink-0 text-right text-[11px] text-gold-600">
                    {rel || formatDateTime(log.createdAt)}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
      {renderDetailPanel()}
    </div>
  );

  /* ───────────── CARD VIEW ───────────── */
  const cardView = (
    <div className="min-w-0 flex gap-4 items-start">
      <div className={selectedLog ? 'min-w-0 flex-1' : 'w-full'}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 nvi-stagger">
          {filteredLogs.map((log) => {
            const narrative = summaryMap.get(log.id);
            const isSelected = selectedLog?.id === log.id;
            const actorName = log.userId
              ? userMap.get(log.userId) ?? log.userId.slice(0, 8)
              : common('unknown');
            const actionColor = getActionColor(log.action);
            const rel = relativeTime(log.createdAt);
            return (
              <button
                key={log.id}
                type="button"
                onClick={() => setSelectedLog(isSelected ? null : log)}
                className={`nvi-card nvi-card--glow nvi-card-hover nvi-press p-4 text-left space-y-2.5 ${
                  isSelected ? 'ring-1 ring-gold-500/40' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ActionBadge action={log.action} size="xs" />
                    <span className="inline-flex items-center gap-1 rounded-full border border-nvi-border bg-gold-500/5 px-2 py-0.5 text-[10px] text-gold-500">
                      <ResourceIcon type={log.resourceType} />
                      {log.resourceType}
                    </span>
                  </div>
                  <OutcomeDot outcome={log.outcome} />
                </div>
                <p className="text-sm font-semibold text-gold-100 leading-snug">
                  {narrative?.primary ?? log.action}
                </p>
                {narrative?.reason ? (
                  <p className="text-xs text-gold-400 line-clamp-1">{narrative.reason}</p>
                ) : null}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <AvatarInitials name={actorName} size="xs" />
                    <span className="text-gold-400">{actorName}</span>
                  </div>
                  <span className="text-gold-600">{rel || formatDateTime(log.createdAt)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {renderDetailPanel()}
    </div>
  );

  /* ───────────── TIMELINE VIEW ───────────── */
  const timelineView = (
    <div className="min-w-0 flex gap-4 items-start">
      <div className={selectedLog ? 'min-w-0 flex-1' : 'w-full'}>
        <div className="nvi-timeline">
          <div className="nvi-timeline__line" />
          {timelineGroups.map((group) => (
            <div key={group.date} className="nvi-timeline__day">
              <div className="nvi-timeline__date-header">
                <Icon name="Calendar" size={11} />
                {formatDate(group.date)}
              </div>
              {group.logs.map((log) => {
                const narrative = summaryMap.get(log.id);
                const isSelected = selectedLog?.id === log.id;
                const actorName = log.userId
                  ? userMap.get(log.userId) ?? log.userId.slice(0, 8)
                  : common('unknown');
                const actionColor = getActionColor(log.action);
                const time = new Date(log.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={log.id} className="nvi-timeline__node nvi-stagger">
                    <div className="nvi-timeline__time">{time}</div>
                    <div className={`nvi-timeline__dot ${actionColor.dot}`} />
                    <button
                      type="button"
                      onClick={() => setSelectedLog(isSelected ? null : log)}
                      className={`flex-1 min-w-0 nvi-card nvi-card--glow nvi-card-hover nvi-press p-3 text-left space-y-1.5 ${
                        isSelected ? 'ring-1 ring-gold-500/40' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <ActionBadge action={log.action} size="xs" />
                        <span className="inline-flex items-center gap-1 rounded-full border border-nvi-border bg-gold-500/5 px-2 py-0.5 text-[10px] text-gold-500">
                          <ResourceIcon type={log.resourceType} />
                          {log.resourceType}
                        </span>
                        <OutcomeDot outcome={log.outcome} />
                      </div>
                      <p className="text-sm text-gold-100 leading-snug">{narrative?.primary ?? log.action}</p>
                      <div className="flex items-center gap-2 text-xs text-gold-500">
                        <AvatarInitials name={actorName} size="xs" />
                        <span>{actorName}</span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {renderDetailPanel()}
    </div>
  );

  /* ───────────── CHAIN PLAYBACK ───────────── */
  const chainPlayback = chainAnchor ? (
    <div ref={chainSectionRef}>
      <Card padding="md">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-500/15">
                <Icon name="Link" size={14} className="text-gold-400" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-400">
                  {t('playbackTitle')}
                </p>
                <p className="mt-0.5 text-xs text-gold-500">
                  {t('chainAnchoredOn', { action: chainAnchor.action, resource: chainAnchor.resourceType })}
                  {chainAnchor.correlationId || chainAnchor.requestId
                    ? <> -- {renderTraceId(chainAnchor.correlationId || chainAnchor.requestId)}</>
                    : null}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setChainAnchor(null); setChainLogs(null); }}
              className="rounded-lg border border-nvi-border p-1.5 text-gold-400 hover:text-gold-200 nvi-press"
            >
              <Icon name="X" size={14} />
            </button>
          </div>
          {isLoadingChain ? (
            <div className="flex items-center gap-2 text-xs text-gold-400">
              <Spinner size="xs" variant="pulse" /> {t('loadingChain')}
            </div>
          ) : null}
          {orderedChainLogs?.length ? (
            <div className="nvi-timeline">
              <div className="nvi-timeline__line" />
              {orderedChainLogs.map((log, idx) => {
                const userName = log.userId ? userMap.get(log.userId) ?? null : null;
                const branchName = log.branchId ? branchMap.get(log.branchId) ?? null : null;
                const roleName = log.roleId ? roleMap.get(log.roleId) ?? null : null;
                const resourceLabel = resolveResourceLabel(log);
                const narrative = buildAuditNarrative(log, { userName, branchName, roleName, resourceLabel, locale });
                const actionColor = getActionColor(log.action);
                const time = new Date(log.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return (
                  <div key={log.id} className="nvi-timeline__node nvi-bounce-in" style={{ animationDelay: `${idx * 60}ms` }}>
                    <div className="nvi-timeline__time">{time}</div>
                    <div className={`nvi-timeline__dot ${actionColor.dot}`} />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <ActionBadge action={log.action} size="xs" />
                        <span className="text-[10px] text-gold-500">{log.resourceType}</span>
                      </div>
                      <p className="text-sm text-gold-100">{narrative.primary}</p>
                      {log.reason ? (
                        <p className="text-xs text-gold-400">{t('reasonLabel', { reason: log.reason })}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !isLoadingChain ? (
            <p className="text-sm text-gold-500">{t('noRelatedEvents')}</p>
          ) : null}
        </div>
      </Card>
    </div>
  ) : null;

  /* ───────────── PAGINATION ───────────── */
  const paginationSection = (
    <>
      {isPaging ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-gold-400">
          <Spinner size="xs" variant="orbit" /> {t('loadingPage')}
        </div>
      ) : null}
      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        itemCount={filteredLogs.length}
        availablePages={Object.keys(pageCursors).map(Number)}
        hasNext={Boolean(nextCursor)}
        hasPrev={page > 1}
        isLoading={isLoading}
        onPageChange={(nextPage) => loadLogs(nextPage)}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
          setPageCursors({ 1: null });
          setTotal(null);
          loadLogs(1, size);
        }}
      />
    </>
  );

  /* ───────────── RENDER ───────────── */
  return (
    <ListPage
      eyebrow={t('eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      badges={
        <>
          <span className="nvi-badge">{t('badgeEvidenceLive')}</span>
          <span className="nvi-badge">{t('badgeChainReady')}</span>
        </>
      }
      headerActions={
        <ViewToggle
          value={viewMode}
          onChange={setViewMode}
          labels={{ cards: t('viewCards'), table: t('viewTable'), timeline: t('viewTimeline') }}
        />
      }
      banner={message ? <Banner message={message} /> : null}
      kpis={kpiStrip}
      filters={filtersSection}
      beforeContent={activityByUserSection}
      viewMode={viewMode}
      table={
        <>
          {tableView}
          {chainPlayback}
        </>
      }
      cards={
        <>
          {cardView}
          {chainPlayback}
        </>
      }
      timeline={
        <>
          {timelineView}
          {chainPlayback}
        </>
      }
      isEmpty={!filteredLogs.length}
      emptyIcon={<Icon name="FileText" size={40} className="text-gold-500/40 nvi-float" />}
      emptyTitle={t('noLogs')}
      emptyDescription={t('emptyDescription')}
      pagination={paginationSection}
      isLoading={isLoading}
      loadingTitle={t('title')}
    />
  );
}
