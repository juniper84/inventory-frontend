'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { DatePickerInput } from '@/components/DatePickerInput';
import { SmartSelect } from '@/components/SmartSelect';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { buildAuditNarrative } from '@/lib/auditNarrative';
import { formatEntityLabel } from '@/lib/display';

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
) => {
  const links: { label: string; href: string }[] = [];
  const resourceId = log.resourceId ?? '';
  const addLink = (label: string, href: string) => links.push({ label, href });
  switch (log.resourceType) {
    case 'Sale':
    case 'SaleRefund':
      addLink(t('relatedReceipts'), '/receipts');
      if (resourceId) addLink(t('relatedSaleApi'), `/api/v1/sales/${resourceId}`);
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

export default function AuditLogsPage() {
  const t = useTranslations('auditLogsPage');
  const common = useTranslations('common');
  const actions = useTranslations('actions');
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
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const [total, setTotal] = useState<number | null>(null);
  const [chainLogs, setChainLogs] = useState<AuditLog[] | null>(null);
  const [chainAnchor, setChainAnchor] = useState<AuditLog | null>(null);
  const [showGuardChecks, setShowGuardChecks] = useState(false);
  const [showDashboardReports, setShowDashboardReports] = useState(false);
  const [showAuthRefresh, setShowAuthRefresh] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activityFilter, setActivityFilter] = useState('');
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>(
    {},
  );
  const dashboardFilterInit = useRef(false);
  const [userQuery, setUserQuery] = useState('');
  const [resourceQuery, setResourceQuery] = useState('');
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

  const loadLogs = async (targetPage = 1, nextPageSize?: number) => {
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
      targetPage === 1 ? null : pageCursors[targetPage] ?? null;
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
  };

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
    setIsLoading(true);
    loadReferenceData()
      .then(() => {
        setPage(1);
        setPageCursors({ 1: null });
        setTotal(null);
        return loadLogs(1);
      })
      .catch((err) => setMessage(getApiErrorMessage(err, t('loadFailed'))));
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
  }, [showDashboardReports, showAuthRefresh]);

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

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
          {t('title')}
        </h2>
        <p className="text-sm text-[color:var(--muted)]">{t('subtitle')}</p>
      </div>
      {message ? <StatusBanner message={message} /> : null}

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-gold-100">{t('filters')}</h3>
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
            className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
          >
            {showAdvancedFilters ? t('hideAdvanced') : t('showAdvanced')}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SmartSelect
            value={filters.branchId}
            onChange={(value) => setFilters({ ...filters, branchId: value })}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            placeholder={t('allBranches')}
            isClearable
            className="nvi-select-container"
          />
          <SmartSelect
            value={filters.userId}
            onChange={(value) => setFilters({ ...filters, userId: value })}
            options={userOptions}
            placeholder={t('actorPlaceholder')}
            isClearable
            className="nvi-select-container"
          />
          <SmartSelect
            value={activityFilter}
            onChange={(value) => applyActivityFilter(value || '')}
            options={activityOptions}
            placeholder={t('activityType')}
            isClearable
            className="nvi-select-container"
          />
          <SmartSelect
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
        </div>
        {showAdvancedFilters ? (
          <div className="rounded border border-gold-700/30 bg-black/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SmartSelect
                value={filters.roleId}
                onChange={(value) => setFilters({ ...filters, roleId: value })}
                options={roles.map((role) => ({
                  value: role.id,
                  label: role.name,
                }))}
                placeholder={t('allRoles')}
                isClearable
                className="nvi-select-container"
              />
              <div className="flex flex-col gap-1">
                <input
                  list="audit-user-options"
                  value={userQuery}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const resolved =
                      userLabelToId.get(raw.toLowerCase()) ??
                      (userMap.has(raw) ? raw : raw);
                    setUserQuery(raw);
                    setFilters({ ...filters, userId: resolved });
                  }}
                  placeholder={t('actorPlaceholder')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                <datalist id="audit-user-options">
                  {users.map((user) => (
                    <option
                      key={user.id}
                      value={user.name?.trim() || user.email?.trim() || user.id}
                    />
                  ))}
                </datalist>
              </div>
              <input
                value={filters.action}
                onChange={(event) =>
                  setFilters({ ...filters, action: event.target.value })
                }
                placeholder={t('actionPlaceholder')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <input
                value={filters.resourceType}
                onChange={(event) =>
                  setFilters({ ...filters, resourceType: event.target.value })
                }
                placeholder={t('resourceTypePlaceholder')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <div className="flex flex-col gap-1">
                <input
                  list="audit-resource-options"
                  value={resourceQuery}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const resolved =
                      resourceLabelToId.get(raw.toLowerCase()) ??
                      (resourceLookup.has(raw) ? raw : raw);
                    setResourceQuery(raw);
                    setFilters({ ...filters, resourceId: resolved });
                  }}
                  placeholder={
                    isLoadingResources ? t('loadingResources') : t('resourcePlaceholder')
                  }
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                <datalist id="audit-resource-options">
                  {resourceOptions.map((option) => (
                    <option key={option.id} value={option.label} />
                  ))}
                </datalist>
              </div>
              <SmartSelect
                value={filters.approvalStatus}
                onChange={(value) =>
                  setFilters({ ...filters, approvalStatus: value })
                }
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
                onChange={(event) =>
                  setFilters({ ...filters, correlationId: event.target.value })
                }
                placeholder={t('correlationId')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <input
                value={filters.requestId}
                onChange={(event) =>
                  setFilters({ ...filters, requestId: event.target.value })
                }
                placeholder={t('requestId')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <input
                value={filters.sessionId}
                onChange={(event) =>
                  setFilters({ ...filters, sessionId: event.target.value })
                }
                placeholder={t('sessionId')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <input
                value={filters.deviceId}
                onChange={(event) =>
                  setFilters({ ...filters, deviceId: event.target.value })
                }
                placeholder={t('deviceId')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
            </div>
          </div>
        ) : null}
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
          className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isRefreshing}
        >
          {isRefreshing ? <Spinner size="xs" variant="orbit" /> : null}
          {isRefreshing ? t('refreshing') : t('refreshLogs')}
        </button>
        <label className="flex items-center gap-2 text-xs text-gold-200">
          <input
            type="checkbox"
            checked={showGuardChecks}
            onChange={(event) => setShowGuardChecks(event.target.checked)}
            className="h-4 w-4"
          />
          {t('showGuardChecks')}
        </label>
        <label className="flex items-center gap-2 text-xs text-gold-200">
          <input
            type="checkbox"
            checked={showAuthRefresh}
            onChange={(event) => setShowAuthRefresh(event.target.checked)}
            className="h-4 w-4"
          />
          {t('showAuthRefresh')}
        </label>
        <label className="flex items-center gap-2 text-xs text-gold-200">
          <input
            type="checkbox"
            checked={showDashboardReports}
            onChange={(event) => setShowDashboardReports(event.target.checked)}
            className="h-4 w-4"
          />
          {t('showDashboardReports')}
        </label>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/v1/audit-logs/export${buildCursorQuery({
              ...filters,
              approvalStatus: filters.approvalStatus || undefined,
              from: filters.from || undefined,
              to: filters.to || undefined,
              showGuardChecks: showGuardChecks ? '1' : undefined,
              showAuthRefresh: showAuthRefresh ? '1' : undefined,
              showDashboardReports: showDashboardReports ? '1' : undefined,
              format: 'csv',
            })}`}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
          >
            {t('exportCsv')}
          </a>
          <a
            href={`/api/v1/audit-logs/export${buildCursorQuery({
              ...filters,
              approvalStatus: filters.approvalStatus || undefined,
              from: filters.from || undefined,
              to: filters.to || undefined,
              showGuardChecks: showGuardChecks ? '1' : undefined,
              showAuthRefresh: showAuthRefresh ? '1' : undefined,
              showDashboardReports: showDashboardReports ? '1' : undefined,
              format: 'pdf',
            })}`}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
          >
            {t('exportPdf')}
          </a>
        </div>
      </div>

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-gold-100">{t('recentEvents')}</h3>
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </div>
        {viewMode === 'table' ? (
          !filteredLogs.length ? (
            <StatusBanner message={t('noLogs')} />
          ) : (
            <div className="overflow-auto text-sm text-gold-200">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('eventLabel')}</th>
                    <th className="px-3 py-2">{t('resourceColumn')}</th>
                    <th className="px-3 py-2">{t('actorColumn')}</th>
                    <th className="px-3 py-2">{t('outcomeColumn')}</th>
                    <th className="px-3 py-2">{t('createdAt')}</th>
                    <th className="px-3 py-2">{t('actionsLabel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => {
                    const narrative = summaryMap.get(log.id);
                    const resolvedLabel = resolveResourceLabel(log);
                    const resourceLabel = resolvedLabel
                      ? `${log.resourceType} "${resolvedLabel}"`
                      : narrative?.resource ?? log.resourceType;
                    return (
                      <tr key={log.id} className="border-t border-gold-700/20">
                        <td className="px-3 py-2 font-semibold">
                          {narrative?.primary ?? log.action}
                        </td>
                        <td className="px-3 py-2">{resourceLabel}</td>
                        <td className="px-3 py-2">
                          {log.userId
                            ? formatEntityLabel(
                                {
                                  name: userMap.get(log.userId) ?? null,
                                  id: log.userId,
                                },
                                common('unknown'),
                              )
                            : common('unknown')}
                        </td>
                        <td className="px-3 py-2">{log.outcome}</td>
                        <td className="px-3 py-2">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => loadChain(log)}
                            className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
                          >
                            {t('viewChain')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : !filteredLogs.length ? (
          <StatusBanner message={t('noLogs')} />
        ) : (
          <div className="space-y-3 text-sm text-gold-200 nvi-stagger">
            {filteredLogs.map((log) => {
              const narrative = summaryMap.get(log.id);
              const relatedLinks = buildRelatedLinks(log, t);
              const resolvedLabel = resolveResourceLabel(log);
              const resourceLabel = resolvedLabel
                ? `${log.resourceType} "${resolvedLabel}"`
                : narrative?.resource ?? log.resourceType;
              const resolvedJson =
                log.resolved ??
                ({
                  ...log,
                  labels: {
                    resource: resolvedLabel,
                    user: log.userId ? userMap.get(log.userId) ?? log.userId : null,
                    role: log.roleId ? roleMap.get(log.roleId) ?? log.roleId : null,
                    branch: log.branchId
                      ? branchMap.get(log.branchId) ?? log.branchId
                      : null,
                    device:
                      typeof log.metadata?.deviceName === 'string'
                        ? log.metadata.deviceName
                        : log.deviceId ?? null,
                    },
                  } as Record<string, unknown>);
              const resolvedDiff =
                resolvedJson && typeof resolvedJson === 'object'
                  ? ((resolvedJson as Record<string, unknown>).diff as
                      | Record<string, unknown>
                      | null
                      | undefined)
                  : null;
              const diffHighlights = collectDiffHighlights(
                resolvedDiff ?? null,
              ).slice(0, 6);
              return (
                <div
                  key={log.id}
                  className="rounded border border-gold-700/40 bg-black/40 p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-gold-100">{narrative?.primary}</p>
                      <p className="text-xs text-gold-400">
                        {resourceLabel} •{' '}
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-gold-300">
                        {narrative?.severity ? (
                          <span className="rounded-full border border-gold-700/50 px-2 py-0.5">
                            {narrative.severity}
                          </span>
                        ) : null}
                        {narrative?.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-gold-700/30 px-2 py-0.5"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadChain(log)}
                      className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
                    >
                      {t('viewChain')}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDetails((prev) => ({
                          ...prev,
                          [log.id]: !prev[log.id],
                        }))
                      }
                      className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
                    >
                      {expandedDetails[log.id]
                        ? t('hideDetails')
                        : t('showDetails')}
                    </button>
                  </div>
                  <div className="grid gap-1 text-xs text-gold-400 md:grid-cols-2">
                    <p>
                      {t('actorLabel')}{' '}
                      {log.userId
                        ? formatEntityLabel(
                            {
                              name: userMap.get(log.userId) ?? null,
                              id: log.userId,
                            },
                            common('unknown'),
                          )
                        : common('unknown')}{' '}
                      {log.roleId
                        ? `(${formatEntityLabel(
                            {
                              name: roleMap.get(log.roleId) ?? null,
                              id: log.roleId,
                            },
                            common('unknown'),
                          )})`
                        : ''}
                    </p>
                    <p>
                      {log.branchId
                        ? `${t('branchLabel')} ${formatEntityLabel(
                            {
                              name: branchMap.get(log.branchId) ?? null,
                              id: log.branchId,
                            },
                            common('unknown'),
                          )}`
                        : `${t('branchLabel')} ${t('notAvailable')}`}
                    </p>
                  </div>
                  {narrative?.reason ? (
                    <p className="text-xs text-gold-300">{narrative.reason}</p>
                  ) : null}
                  {narrative?.details ? (
                    <p className="text-xs text-gold-300">{narrative.details}</p>
                  ) : null}
                  {narrative?.approval ? (
                    <p className="text-xs text-gold-300">{narrative.approval}</p>
                  ) : null}
                  {narrative?.approvalChain ? (
                    <p className="text-xs text-gold-300">
                      {narrative.approvalChain}
                    </p>
                  ) : null}
                  {narrative?.approvalStatus ? (
                    <p className="text-xs text-gold-300">
                      {narrative.approvalStatus}
                    </p>
                  ) : null}
                  {narrative?.offline ? (
                    <p className="text-xs text-gold-300">{narrative.offline}</p>
                  ) : null}
                  {narrative?.failure ? (
                    <p className="text-xs text-red-300">{narrative.failure}</p>
                  ) : null}
                  {narrative?.diffSummary ? (
                    <p className="text-xs text-gold-300">
                      {narrative.diffSummary}
                    </p>
                  ) : null}
                  {narrative?.impact ? (
                    <p className="text-xs text-gold-300">{narrative.impact}</p>
                  ) : null}
                  {expandedDetails[log.id] ? (
                    <>
                      <div className="grid gap-2 text-xs text-gold-400 md:grid-cols-3">
                        <p>
                          {t('userLabel')}{' '}
                          {log.userId
                            ? formatEntityLabel(
                                {
                                  name: userMap.get(log.userId) ?? null,
                                  id: log.userId,
                                },
                                common('unknown'),
                              )
                            : common('unknown')}
                        </p>
                        <p>
                          {t('roleLabel')}{' '}
                          {formatEntityLabel(
                            {
                              name: roleMap.get(log.roleId ?? '') ?? null,
                              id: log.roleId ?? null,
                            },
                            common('unknown'),
                          )}
                        </p>
                        <p>
                          {t('deviceLabel')}{' '}
                          {formatEntityLabel(
                            {
                              name:
                                typeof log.metadata?.deviceName === 'string'
                                  ? log.metadata.deviceName
                                  : null,
                              id: log.deviceId ?? null,
                            },
                            t('notAvailable'),
                          )}
                        </p>
                        <p>{t('outcomeLabel')} {log.outcome}</p>
                        <p>
                          {t('requestLabel')} {renderTraceId(log.requestId)}
                        </p>
                        <p>
                          {t('sessionLabel')} {renderTraceId(log.sessionId)}
                        </p>
                        <p>
                          {t('correlationLabel')} {renderTraceId(log.correlationId)}
                        </p>
                        <p>
                          {t('hashLabel')} {renderHash(log.hash)}
                        </p>
                        <p>
                          {t('previousHashLabel')} {renderHash(log.previousHash)}
                        </p>
                      </div>
                      {relatedLinks.length ? (
                        <div className="flex flex-wrap gap-2 text-xs text-gold-200">
                          {relatedLinks.map((link) => (
                            <a
                              key={`${log.id}-${link.href}`}
                              href={link.href}
                              className="rounded border border-gold-700/40 px-2 py-1 text-gold-100"
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                      ) : null}
                      {resolvedDiff ? (
                        <details className="rounded border border-gold-700/30 bg-black/30 p-3 text-xs text-gold-300">
                          <summary className="cursor-pointer text-gold-100">
                            {t('viewStructuredDiff')}
                          </summary>
                          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-gold-400">
                            {JSON.stringify(resolvedDiff, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                      <div className="rounded border border-gold-700/30 bg-black/30 p-3 text-xs text-gold-300 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gold-100">
                          {t('evidenceSummary')}
                        </p>
                        <div className="grid gap-2 text-xs text-gold-300 md:grid-cols-2">
                          <p>
                            {t('actorLabel')}{' '}
                            {narrative?.actor ?? common('unknown')}
                          </p>
                          <p>
                            {t('branchLabel')}{' '}
                            {narrative?.context ?? common('unknown')}
                          </p>
                          <p>
                            {t('outcomeLabel')} {log.outcome}
                          </p>
                          <p>
                            {t('reasonLabel', {
                              reason: log.reason ?? common('unknown'),
                            })}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-gold-100">
                            {t('evidenceDiffHighlights')}
                          </p>
                          {diffHighlights.length ? (
                            <ul className="space-y-1 text-xs text-gold-300">
                              {diffHighlights.map((entry) => (
                                <li key={entry.field}>
                                  {entry.field}:{' '}
                                  {formatEvidenceValue(entry.from)} →{' '}
                                  {formatEvidenceValue(entry.to)}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-gold-400">
                              {t('evidenceNoDiff')}
                            </p>
                          )}
                        </div>
                      </div>
                      <details className="rounded border border-gold-700/30 bg-black/30 p-3 text-xs text-gold-300">
                        <summary className="cursor-pointer text-gold-100">
                          {t('rawEventJson')}
                        </summary>
                        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-gold-400">
                          {JSON.stringify(log, null, 2)}
                        </pre>
                      </details>
                      <details className="rounded border border-gold-700/30 bg-black/30 p-3 text-xs text-gold-300">
                        <summary className="cursor-pointer text-gold-100">
                          {t('resolvedEventJson')}
                        </summary>
                        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-gold-400">
                          {JSON.stringify(resolvedJson, null, 2)}
                        </pre>
                      </details>
                    </>
                  ) : null}
                </div>
              );
            })}
            {!filteredLogs.length ? (
              <StatusBanner message={t('noLogs')} />
            ) : null}
          </div>
        )}
        {isPaging ? (
          <div className="flex items-center gap-2 text-xs text-gold-300">
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

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">
          {t('playbackTitle')}
        </h3>
        {!chainAnchor ? (
          <p className="text-sm text-gold-400">
            {t('playbackHint')}
          </p>
        ) : (
          <div className="space-y-2 text-sm text-gold-200">
            <p className="text-xs text-gold-400">
              {t('chainAnchoredOn', {
                action: chainAnchor.action,
                resource: chainAnchor.resourceType,
              })}
            </p>
            {chainAnchor.correlationId || chainAnchor.requestId ? (
              <p className="text-xs text-gold-400">
                {t('chainCorrelation')}{' '}
                {renderTraceId(chainAnchor.correlationId || chainAnchor.requestId)}
              </p>
            ) : null}
            {isLoadingChain ? (
              <div className="flex items-center gap-2 text-gold-300">
                <Spinner size="xs" variant="pulse" /> {t('loadingChain')}
              </div>
            ) : null}
            {orderedChainLogs?.length ? (
              <ol className="space-y-2">
                {orderedChainLogs.map((log) => {
                  const userName = log.userId ? userMap.get(log.userId) ?? null : null;
                  const branchName = log.branchId
                    ? branchMap.get(log.branchId) ?? null
                    : null;
                  const roleName = log.roleId ? roleMap.get(log.roleId) ?? null : null;
                  const resourceLabel = resolveResourceLabel(log);
                  const narrative = buildAuditNarrative(log, {
                    userName,
                    branchName,
                    roleName,
                    resourceLabel,
                  });
                  return (
                    <li
                      key={log.id}
                      className="rounded border border-gold-700/40 bg-black/40 p-3"
                    >
                      <p className="text-gold-100">
                        {narrative.primary}
                      </p>
                      <p className="text-xs text-gold-400">
                        {new Date(log.createdAt).toLocaleString()} •{' '}
                        {log.resourceType}
                      </p>
                      {log.reason ? (
                        <p className="text-xs text-gold-300">
                          {t('reasonLabel', { reason: log.reason })}
                        </p>
                      ) : null}
                      <div className="mt-2 grid gap-1 text-[10px] text-gold-400 md:grid-cols-2">
                        <p>
                          {t('requestLabel')} {renderTraceId(log.requestId)}
                        </p>
                        <p>
                          {t('correlationLabel')} {renderTraceId(log.correlationId)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : chainAnchor && !isLoadingChain ? (
              <p className="text-sm text-gold-400">
                {t('noRelatedEvents')}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
