'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { DatePickerInput } from '@/components/DatePickerInput';
import { SmartSelect } from '@/components/SmartSelect';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { buildAuditNarrative } from '@/lib/auditNarrative';
import { formatEntityLabel } from '@/lib/display';
import { useBranchScope } from '@/lib/use-branch-scope';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';
import { useFormatDate } from '@/lib/business-context';

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

const formatEvidenceValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return 'n/a';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
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
  const resourceId = log.resourceId ?? '';
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
    .join(' › ');
};

export default function AuditLogsPage() {
  const t = useTranslations('auditLogsPage');
  const common = useTranslations('common');
  const locale = useLocale();
  const { formatDateTime } = useFormatDate();
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
  const [total, setTotal] = useState<number | null>(null);
  const [chainLogs, setChainLogs] = useState<AuditLog[] | null>(null);
  const [chainAnchor, setChainAnchor] = useState<AuditLog | null>(null);
  const [showGuardChecks, setShowGuardChecks] = useState(false);
  const [showDashboardReports, setShowDashboardReports] = useState(false);
  const [showAuthRefresh, setShowAuthRefresh] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activityFilter, setActivityFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const dashboardFilterInit = useRef(false);
  const branchFilterInit = useRef(false);
  const chainSectionRef = useRef<HTMLDivElement>(null);
  const [userQuery, setUserQuery] = useState('');
  const [resourceQuery, setResourceQuery] = useState('');
  const { activeBranch } = useBranchScope();
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
  const branchMap = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );

  useEffect(() => {
    if (branchFilterInit.current) {
      return;
    }
    if (!activeBranch?.id) {
      return;
    }
    branchFilterInit.current = true;
    setFilters((prev) =>
      prev.branchId ? prev : { ...prev, branchId: activeBranch.id },
    );
  }, [activeBranch?.id]);
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
        label: [user.name?.trim(), user.email?.trim()].filter(Boolean).join(' • ')
          || user.id,
      })),
    [users],
  );
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
  const renderTraceId = (value?: string | null) => {
    if (!value) {
      return t('notAvailable');
    }
    const short = value.length > 10 ? `${value.slice(0, 8)}…` : value;
    return (
      <span title={value} className="cursor-help">
        {short}
      </span>
    );
  };
  const renderHash = (value?: string | null) => {
    if (!value) {
      return t('notAvailable');
    }
    const short = value.length > 12 ? `${value.slice(0, 10)}…` : value;
    return (
      <span title={value} className="cursor-help">
        {short}
      </span>
    );
  };

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

  useEffect(() => {
    setIsLoading(true);
    loadReferenceData().then(() => {
      setPage(1);
      setPageCursors({ 1: null });
      setTotal(null);
      loadLogs(1);
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
    loadLogs(1).finally(() => setIsRefreshing(false));
  }, [showDashboardReports, showAuthRefresh, loadLogs]);

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
  const failureCount = useMemo(
    () => filteredLogs.filter((log) => log.outcome === 'FAILURE').length,
    [filteredLogs],
  );
  const activeFilterCount = useMemo(() => {
    const valueCount = Object.values(filters).filter((value) => Boolean(value)).length;
    const toggleCount =
      Number(showGuardChecks) + Number(showDashboardReports) + Number(showAuthRefresh);
    return valueCount + toggleCount;
  }, [filters, showAuthRefresh, showDashboardReports, showGuardChecks]);

  if (isLoading) {
    return <PageSkeleton />;
  }

  const exportBase = buildCursorQuery({
    ...filters,
    approvalStatus: filters.approvalStatus || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    showGuardChecks: showGuardChecks ? '1' : undefined,
    showAuthRefresh: showAuthRefresh ? '1' : undefined,
    showDashboardReports: showDashboardReports ? '1' : undefined,
  });

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
  const detailResolvedDiff = detailResolvedJson && typeof detailResolvedJson === 'object'
    ? ((detailResolvedJson as Record<string, unknown>).diff as Record<string, unknown> | null | undefined)
    : null;
  const detailDiffHighlights = collectDiffHighlights(detailResolvedDiff ?? null).slice(0, 8);

  return (
    <section className="nvi-page space-y-5 [overflow-x:clip]">
      <PremiumPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-badge">{t('badgeEvidenceLive')}</span>
            <span className="nvi-badge">{t('badgeChainReady')}</span>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiLoadedEvents')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{filteredLogs.length}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiSuccess')}</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-300">{successCount}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiFailure')}</p>
          <p className="mt-2 text-3xl font-semibold text-red-300">{failureCount}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiActiveFilters')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{activeFilterCount}</p>
        </article>
      </div>

      {message ? <StatusBanner message={message} /> : null}

      {/* Filter bar */}
      <div className="command-card nvi-panel p-4 space-y-3 nvi-reveal">
        {/* Primary filter row */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DatePickerInput
            value={filters.from}
            onChange={(value) => setFilters({ ...filters, from: value })}
            placeholder={t('fromDate')}
            className="rounded border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-[color:var(--foreground)]"
          />
          <DatePickerInput
            value={filters.to}
            onChange={(value) => setFilters({ ...filters, to: value })}
            placeholder={t('toDate')}
            className="rounded border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-[color:var(--foreground)]"
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
            className="inline-flex items-center gap-1.5 rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
          >
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
            className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:opacity-60"
          >
            {isRefreshing ? <Spinner size="xs" variant="orbit" /> : null}
            {isRefreshing ? t('refreshing') : t('refreshLogs')}
          </button>
          <a
            href={`/api/v1/audit-logs/export${exportBase}&format=csv`}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
          >
            {t('exportCsv')}
          </a>
          <a
            href={`/api/v1/audit-logs/export${exportBase}&format=pdf`}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
          >
            {t('exportPdf')}
          </a>
        </div>

        {/* Advanced filters (toggle) */}
        {showAdvancedFilters ? (
          <div className="rounded-xl border border-gold-700/20 bg-black/30 p-4 space-y-3">
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
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
              />
              <input
                value={filters.resourceType}
                onChange={(e) => setFilters({ ...filters, resourceType: e.target.value })}
                placeholder={t('resourceTypePlaceholder')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
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
                  className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
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
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
              />
              <input
                value={filters.requestId}
                onChange={(e) => setFilters({ ...filters, requestId: e.target.value })}
                placeholder={t('requestId')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
              />
              <input
                value={filters.sessionId}
                onChange={(e) => setFilters({ ...filters, sessionId: e.target.value })}
                placeholder={t('sessionId')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
              />
              <input
                value={filters.deviceId}
                onChange={(e) => setFilters({ ...filters, deviceId: e.target.value })}
                placeholder={t('deviceId')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs text-gold-300">
                <input type="checkbox" checked={showGuardChecks} onChange={(e) => setShowGuardChecks(e.target.checked)} className="h-3.5 w-3.5" />
                {t('showGuardChecks')}
              </label>
              <label className="flex items-center gap-2 text-xs text-gold-300">
                <input type="checkbox" checked={showAuthRefresh} onChange={(e) => setShowAuthRefresh(e.target.checked)} className="h-3.5 w-3.5" />
                {t('showAuthRefresh')}
              </label>
              <label className="flex items-center gap-2 text-xs text-gold-300">
                <input type="checkbox" checked={showDashboardReports} onChange={(e) => setShowDashboardReports(e.target.checked)} className="h-3.5 w-3.5" />
                {t('showDashboardReports')}
              </label>
            </div>
          </div>
        ) : null}
      </div>

      {/* List + detail panel */}
      <div className="min-w-0 flex gap-4 items-start nvi-reveal">

        {/* Log list */}
        <div className={selectedLog ? 'min-w-0 flex-1' : 'w-full'}>
          <div className="command-card nvi-panel overflow-hidden">
            {!filteredLogs.length ? (
              <div className="p-6"><StatusBanner message={t('noLogs')} /></div>
            ) : (
              filteredLogs.map((log) => {
                const narrative = summaryMap.get(log.id);
                const isSelected = selectedLog?.id === log.id;
                const actorName = log.userId
                  ? userMap.get(log.userId) ?? log.userId.slice(0, 8)
                  : common('unknown');
                return (
                  <button
                    key={log.id}
                    type="button"
                    onClick={() => setSelectedLog(isSelected ? null : log)}
                    className={`w-full flex items-center gap-3 border-b border-gold-700/10 px-4 py-3 text-left transition hover:bg-white/[0.025] ${isSelected ? 'bg-white/[0.04]' : ''}`}
                  >
                    <span
                      className={`h-2 w-2 flex-shrink-0 rounded-full ${log.outcome === 'SUCCESS' ? 'bg-emerald-400' : 'bg-red-400'}`}
                      aria-label={log.outcome}
                    />
                    <span className="min-w-0 flex-1 break-words text-sm text-gold-100">
                      {narrative?.primary ?? log.action}
                    </span>
                    <span className="hidden flex-shrink-0 rounded-full border border-gold-700/30 bg-gold-500/5 px-2 py-0.5 text-[10px] text-gold-500 sm:inline-block">
                      {log.resourceType}
                    </span>
                    <span className="hidden w-28 flex-shrink-0 truncate text-right text-xs text-gold-500 md:block">
                      {actorName}
                    </span>
                    <span className="w-32 flex-shrink-0 text-right text-xs text-gold-600">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
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
        </div>

        {/* Detail panel */}
        {selectedLog ? (
          <div className="w-full lg:w-[420px] xl:w-[480px] flex-shrink-0 command-card nvi-panel sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto p-5 space-y-4">

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      selectedLog.outcome === 'SUCCESS'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-red-500/40 bg-red-500/10 text-red-300'
                    }`}
                  >
                    {selectedLog.outcome}
                  </span>
                  <span className="rounded-full border border-gold-700/30 bg-gold-500/5 px-2 py-0.5 text-[10px] text-gold-500">
                    {selectedLog.resourceType}
                  </span>
                  {detailNarrative?.severity ? (
                    <span className="rounded-full border border-gold-700/30 px-2 py-0.5 text-[10px] text-gold-400">
                      {detailNarrative.severity}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm font-semibold leading-snug text-gold-100">
                  {detailNarrative?.primary ?? selectedLog.action}
                </p>
                <p className="text-xs text-gold-500">
                  {formatDateTime(selectedLog.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="flex-shrink-0 rounded border border-gold-700/40 px-2 py-1 text-xs text-gold-400 hover:text-gold-200"
                aria-label={t('closeDetail')}
              >
                ✕
              </button>
            </div>

            {/* Narrative extras */}
            {detailNarrative?.reason || detailNarrative?.details || detailNarrative?.failure ? (
              <div className="space-y-1 rounded-lg border border-gold-700/20 bg-black/20 p-3 text-xs">
                {detailNarrative.reason ? <p className="text-gold-300">{detailNarrative.reason}</p> : null}
                {detailNarrative.details ? <p className="text-gold-300">{detailNarrative.details}</p> : null}
                {detailNarrative.failure ? <p className="text-red-300">{detailNarrative.failure}</p> : null}
                {detailNarrative.offline ? <p className="text-gold-400">{detailNarrative.offline}</p> : null}
                {detailNarrative.diffSummary ? <p className="text-gold-400">{detailNarrative.diffSummary}</p> : null}
                {detailNarrative.impact ? <p className="text-gold-400">{detailNarrative.impact}</p> : null}
              </div>
            ) : null}

            {/* Who */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.28em] text-gold-500">{t('sectionWho')}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div>
                  <span className="text-gold-500">{t('userLabel')} </span>
                  <span className="text-gold-200">
                    {selectedLog.userId
                      ? formatEntityLabel({ name: userMap.get(selectedLog.userId) ?? null, id: selectedLog.userId }, common('unknown'))
                      : common('unknown')}
                  </span>
                </div>
                <div>
                  <span className="text-gold-500">{t('roleLabel')} </span>
                  <span className="text-gold-200">
                    {formatEntityLabel({ name: roleMap.get(selectedLog.roleId ?? '') ?? null, id: selectedLog.roleId ?? null }, common('unknown'))}
                  </span>
                </div>
                <div>
                  <span className="text-gold-500">{t('branchLabel')} </span>
                  <span className="text-gold-200">
                    {selectedLog.branchId
                      ? formatEntityLabel({ name: branchMap.get(selectedLog.branchId) ?? null, id: selectedLog.branchId }, common('unknown'))
                      : t('notAvailable')}
                  </span>
                </div>
                <div>
                  <span className="text-gold-500">{t('deviceLabel')} </span>
                  <span className="text-gold-200">
                    {formatEntityLabel(
                      { name: typeof selectedLog.metadata?.deviceName === 'string' ? selectedLog.metadata.deviceName : null, id: selectedLog.deviceId ?? null },
                      t('notAvailable'),
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Approval info */}
            {detailNarrative?.approval || detailNarrative?.approvalChain || detailNarrative?.approvalStatus ? (
              <div className="space-y-1 rounded-lg border border-gold-700/20 bg-black/20 p-3 text-xs">
                {detailNarrative.approval ? <p className="text-gold-300">{detailNarrative.approval}</p> : null}
                {detailNarrative.approvalChain ? <p className="text-gold-300">{detailNarrative.approvalChain}</p> : null}
                {detailNarrative.approvalStatus ? <p className="text-gold-300">{detailNarrative.approvalStatus}</p> : null}
              </div>
            ) : null}

            {/* What changed */}
            {detailDiffHighlights.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.28em] text-gold-500">{t('sectionWhatChanged')}</p>
                <ul className="space-y-1">
                  {detailDiffHighlights.map((entry) => (
                    <li key={entry.field} className="flex flex-wrap items-baseline gap-1 text-xs">
                      <span className="text-gold-500">{formatFieldLabel(entry.field, fieldLabels)}</span>
                      <span className="text-gold-600 line-through">{formatEvidenceValue(entry.from)}</span>
                      <span className="text-gold-300">→ {formatEvidenceValue(entry.to)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Actions: chain + related links */}
            <div className="flex flex-wrap gap-2 border-t border-gold-700/15 pt-3">
              <button
                type="button"
                onClick={() => loadChain(selectedLog)}
                disabled={isLoadingChain}
                className="inline-flex items-center gap-1.5 rounded border border-gold-700/50 px-3 py-1.5 text-xs text-gold-100 disabled:opacity-60"
              >
                {isLoadingChain ? <Spinner size="xs" variant="dots" /> : null}
                {t('viewChain')}
              </button>
              {detailRelatedLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded border border-gold-700/40 px-3 py-1.5 text-xs text-gold-300"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Technical trace */}
            <details className="rounded-lg border border-gold-700/20 bg-black/20">
              <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-gold-300">
                {t('technicalTrace')}
              </summary>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 pb-3 pt-1 text-xs">
                <div><span className="text-gold-500">{t('requestLabel')} </span><span className="text-gold-400">{renderTraceId(selectedLog.requestId)}</span></div>
                <div><span className="text-gold-500">{t('sessionLabel')} </span><span className="text-gold-400">{renderTraceId(selectedLog.sessionId)}</span></div>
                <div><span className="text-gold-500">{t('correlationLabel')} </span><span className="text-gold-400">{renderTraceId(selectedLog.correlationId)}</span></div>
                <div><span className="text-gold-500">{t('hashLabel')} </span><span className="text-gold-400">{renderHash(selectedLog.hash)}</span></div>
                <div className="col-span-2"><span className="text-gold-500">{t('previousHashLabel')} </span><span className="text-gold-400">{renderHash(selectedLog.previousHash)}</span></div>
              </div>
            </details>

            {/* Raw JSON */}
            <details className="rounded-lg border border-gold-700/20 bg-black/20">
              <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-gold-300">
                {t('rawEventJson')}
              </summary>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all px-3 pb-3 pt-1 text-[11px] text-gold-500">
                {JSON.stringify(selectedLog, null, 2)}
              </pre>
            </details>

          </div>
        ) : null}
      </div>

      {/* Chain playback timeline */}
      {chainAnchor ? (
        <div ref={chainSectionRef} className="command-card nvi-panel p-5 space-y-3 nvi-reveal">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-400">
                {t('playbackTitle')}
              </p>
              <p className="mt-0.5 text-xs text-gold-500">
                {t('chainAnchoredOn', { action: chainAnchor.action, resource: chainAnchor.resourceType })}
                {chainAnchor.correlationId || chainAnchor.requestId
                  ? ` — ${renderTraceId(chainAnchor.correlationId || chainAnchor.requestId)}`
                  : null}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setChainAnchor(null); setChainLogs(null); }}
              className="rounded border border-gold-700/40 px-2 py-1 text-xs text-gold-400"
            >
              ✕
            </button>
          </div>
          {isLoadingChain ? (
            <div className="flex items-center gap-2 text-xs text-gold-400">
              <Spinner size="xs" variant="pulse" /> {t('loadingChain')}
            </div>
          ) : null}
          {orderedChainLogs?.length ? (
            <ol className="space-y-2 border-l-2 border-gold-700/20 pl-4">
              {orderedChainLogs.map((log) => {
                const userName = log.userId ? userMap.get(log.userId) ?? null : null;
                const branchName = log.branchId ? branchMap.get(log.branchId) ?? null : null;
                const roleName = log.roleId ? roleMap.get(log.roleId) ?? null : null;
                const resourceLabel = resolveResourceLabel(log);
                const narrative = buildAuditNarrative(log, { userName, branchName, roleName, resourceLabel, locale });
                return (
                  <li key={log.id} className="relative">
                    <span
                      className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border-2 border-[color:var(--background)] ${log.outcome === 'SUCCESS' ? 'bg-emerald-400' : 'bg-red-400'}`}
                    />
                    <p className="text-sm text-gold-100">{narrative.primary}</p>
                    <p className="text-xs text-gold-500">
                      {formatDateTime(log.createdAt)} • {log.resourceType}
                    </p>
                    {log.reason ? (
                      <p className="text-xs text-gold-400">{t('reasonLabel', { reason: log.reason })}</p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : !isLoadingChain ? (
            <p className="text-sm text-gold-500">{t('noRelatedEvents')}</p>
          ) : null}
        </div>
      ) : null}

    </section>
  );
}
