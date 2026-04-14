'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState, messageText } from '@/lib/app-notifications';
import { notify } from '@/components/notifications/NotificationProvider';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { Banner } from '@/components/notifications/Banner';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import {
  ListPage,
  Card,
  Icon,
  ActionButtons,
  AvatarInitials,
  Timeline,
  SortableTableHeader,
} from '@/components/ui';
import { CustomerCreateModal } from '@/components/customers/CustomerCreateModal';
import { CustomerEditModal, type CustomerEditDraft } from '@/components/customers/CustomerEditModal';
import type { SortDirection } from '@/components/ui';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';

import { PaginationControls } from '@/components/PaginationControls';
import { useFormatDate } from '@/lib/business-context';
import { shortId } from '@/lib/display';

// ─── Types ──────────────────────────────────────────────────────────────────

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  tin?: string | null;
  notes?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  priceListId?: string | null;
};

type PriceList = {
  id: string;
  name: string;
};

type TimelineSale = { id: string; referenceNumber?: string | null; total?: number; createdAt: string };
type TimelineRefund = { id: string; referenceNumber?: string | null; amount?: number; createdAt: string };
type TimelineData = { sales: TimelineSale[]; refunds: TimelineRefund[] };

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}

function lastPurchaseLabel(data: TimelineData | null | undefined, t: (key: string, values?: Record<string, string>) => string): string {
  if (!data) return '';
  const allDates = [
    ...data.sales.map((s) => s.createdAt),
    ...data.refunds.map((r) => r.createdAt),
  ].filter(Boolean);
  if (allDates.length === 0) return t('noPurchasesYet');
  allDates.sort((a, b) => b.localeCompare(a));
  return t('lastPurchase', { time: relativeTime(allDates[0]) });
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const t = useTranslations('customersPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const { formatDateTime } = useFormatDate();
  const permissions = getPermissionSet();
  const canCreate = permissions.has('customers.create');
  const canEdit = permissions.has('customers.update');
  const canAnonymize = permissions.has('customers.anonymize');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [message, setMessage] = useToastState();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState<number | null>(null);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({ 1: null });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    tin: '',
    notes: '',
    priceListId: '',
  });
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingDraft, setEditingDraft] = useState<CustomerEditDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [timelineOpen, setTimelineOpen] = useState<string | null>(null);
  const [timelineData, setTimelineData] = useState<Record<string, TimelineData | null>>({});
  const [timelineLoading, setTimelineLoading] = useState<string | null>(null);
  const [notesExpanded, setNotesExpanded] = useState<string | null>(null);
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    balanceDue: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);


  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'ACTIVE', label: common('statusActive') },
      { value: 'INACTIVE', label: common('statusInactive') },
      { value: 'ARCHIVED', label: common('statusArchived') },
    ],
    [common],
  );

  const balanceOptions = useMemo(
    () => [
      { value: '', label: common('all') },
      { value: 'yes', label: common('balanceDue') },
      { value: 'no', label: common('balanceClear') },
    ],
    [common],
  );

  const activeCount = useMemo(
    () => customers.filter((customer) => (customer.status ?? 'ACTIVE') === 'ACTIVE').length,
    [customers],
  );
  const withPriceList = useMemo(
    () => customers.filter((customer) => Boolean(customer.priceListId)).length,
    [customers],
  );

  const handleSort = useCallback((key: string, dir: SortDirection) => {
    setSortKey(dir ? key : null);
    setSortDir(dir);
  }, []);

  const sortedCustomers = useMemo(() => {
    if (!sortKey || !sortDir) return customers;
    return [...customers].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey] ?? '';
      const bVal = (b as Record<string, unknown>)[sortKey] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [customers, sortKey, sortDir]);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);



  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const data = await apiFetch<PaginatedResponse<PriceList> | PriceList[]>(
        '/price-lists?limit=50',
        { token },
      );
      setPriceLists(normalizePaginated(data).items);
    } catch {
      setPriceLists([]);
    }
  }, []);

  const loadPriceListOptions = useCallback(async (inputValue: string) => {
    const token = getAccessToken();
    if (!token) return [];
    try {
      const data = await apiFetch<PaginatedResponse<PriceList> | PriceList[]>(
        `/price-lists?search=${encodeURIComponent(inputValue)}&limit=25`,
        { token },
      );
      return normalizePaginated(data).items.map((list) => ({ value: list.id, label: list.name }));
    } catch {
      return [];
    }
  }, []);

  const load = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) { setIsLoading(false); return; }
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor = targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
        balanceDue: filters.balanceDue || undefined,
      });
      const customerData = await apiFetch<PaginatedResponse<Customer> | Customer[]>(
        `/customers${query}`,
        { token },
      );
      const customerResult = normalizePaginated(customerData);
      setCustomers(customerResult.items);
      setNextCursor(customerResult.nextCursor);
      if (typeof customerResult.total === 'number') setTotal(customerResult.total);
      setPage(targetPage);
      setPageCursors(prev => {
        const next: Record<number, string | null> = targetPage === 1 ? { 1: null } : { ...prev };
        if (customerResult.nextCursor) next[targetPage + 1] = customerResult.nextCursor;
        return next;
      });
    } catch (err) {
      setMessage({ action: 'load', outcome: 'failure', message: getApiErrorMessage(err, t('loadFailed')) });
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, filters.search, filters.status, filters.balanceDue, t]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    load(1);
  }, [load]);

  const createCustomer = async () => {
    const token = getAccessToken();
    if (!token || !form.name.trim()) {
      return;
    }
    setMessage(null);
    setIsCreating(true);
    try {
      await apiFetch('/customers', {
        token,
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone || undefined,
          email: form.email || undefined,
          tin: form.tin || undefined,
          notes: form.notes || undefined,
          priceListId: form.priceListId || null,
        }),
      });
      setForm({
        name: '',
        phone: '',
        email: '',
        tin: '',
        notes: '',
        priceListId: '',
      });
      setFormOpen(false);
      setMessage({ action: 'create', outcome: 'success', message: t('created') });
      await load();
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

  const startEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditingDraft({
      name: customer.name ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      tin: customer.tin ?? '',
      notes: customer.notes ?? '',
      status: customer.status ?? 'ACTIVE',
      priceListId: customer.priceListId ?? '',
    });
  };

  const closeEdit = () => {
    setEditingCustomer(null);
    setEditingDraft(null);
  };

  const saveEdit = async () => {
    const token = getAccessToken();
    if (!token || !editingCustomer || !editingDraft) {
      return;
    }
    setMessage(null);
    setIsSaving(true);
    try {
      await apiFetch(`/customers/${editingCustomer.id}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          name: editingDraft.name || undefined,
          phone: editingDraft.phone || undefined,
          email: editingDraft.email || undefined,
          tin: editingDraft.tin || undefined,
          notes: editingDraft.notes || undefined,
          status: editingDraft.status ?? undefined,
          priceListId: editingDraft.priceListId || null,
        }),
      });
      closeEdit();
      setMessage({ action: 'update', outcome: 'success', message: t('updated') });
      await load();
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('updateFailed')),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const archiveCustomer = async (customerId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const ok = await notify.confirm({
      title: t('archiveConfirmTitle'),
      message: t('archiveConfirmMessage'),
      confirmText: t('archiveConfirmButton'),
    });
    if (!ok) return;
    setMessage(null);
    try {
      await apiFetch(`/customers/${customerId}/archive`, {
        token,
        method: 'POST',
      });
      setMessage({ action: 'delete', outcome: 'success', message: t('archived') });
      await load();
    } catch (err) {
      setMessage({
        action: 'delete',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('archiveFailed')),
      });
    }
  };

  const toggleTimeline = async (customerId: string) => {
    if (timelineOpen === customerId) {
      setTimelineOpen(null);
      return;
    }
    setTimelineOpen(customerId);
    if (timelineData[customerId]) return;
    const token = getAccessToken();
    if (!token) return;
    setTimelineLoading(customerId);
    try {
      const data = await apiFetch<TimelineData>(
        `/customers/${customerId}/timeline`,
        { token },
      );
      setTimelineData((prev) => ({ ...prev, [customerId]: data }));
    } catch {
      setTimelineData((prev) => ({ ...prev, [customerId]: { sales: [], refunds: [] } }));
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: t('timelineLoadFailed'),
      });
    } finally {
      setTimelineLoading(null);
    }
  };

  const buildTimelineItems = (data: TimelineData | null) => {
    if (!data) return [];
    const items = [
      ...data.sales.map((s) => ({
        id: `sale-${s.id}`,
        title: t('timelineSale', { id: s.referenceNumber || shortId(s.id) }),
        subtitle: s.total != null ? String(s.total) : undefined,
        timestamp: formatDateTime(s.createdAt),
        color: 'green' as const,
      })),
      ...data.refunds.map((r) => ({
        id: `refund-${r.id}`,
        title: t('timelineRefund', { id: r.referenceNumber || shortId(r.id) }),
        subtitle: r.amount != null ? String(r.amount) : undefined,
        timestamp: formatDateTime(r.createdAt),
        color: 'red' as const,
      })),
    ];
    items.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
    return items;
  };

  const resolvePriceListName = (priceListId?: string | null) => {
    if (!priceListId) return null;
    return priceLists.find((list) => list.id === priceListId)?.name ?? common('unknown');
  };

  const anonymizeCustomer = async (customerId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const confirmed = await notify.confirm({
      title: t('anonymizeTitle'),
      message: t('anonymizeConfirm'),
      confirmText: t('anonymizeAction'),
    });
    if (!confirmed) {
      return;
    }
    setMessage(null);
    try {
      await apiFetch(`/customers/${customerId}/anonymize`, {
        token,
        method: 'POST',
      });
      setMessage({ action: 'update', outcome: 'success', message: t('anonymized') });
      await load();
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('anonymizeFailed')),
      });
    }
  };

  // ─── Status dot helper ──────────────────────────────────────────────────
  const statusDotColor = (status: Customer['status']) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]';
      case 'INACTIVE': return 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]';
      case 'ARCHIVED': return 'bg-neutral-500';
      default: return 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]';
    }
  };

  // ─── Banner for message ─────────────────────────────────────────────────
  const bannerNode = message ? (
    <Banner
      message={messageText(message)}
      onDismiss={() => setMessage(null)}
    />
  ) : null;

  // ─── KPI strip ────────────────────────────────────────────────────────
  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      {(
        [
          { icon: 'Users' as const,      tone: 'blue' as const,    label: t('kpiCustomers'),      value: String(total ?? customers.length),      accent: 'text-blue-300',    size: '2xl' },
          { icon: 'UserCheck' as const,  tone: 'emerald' as const, label: t('kpiActive'),         value: String(activeCount),                    accent: 'text-emerald-300', size: '2xl' },
          { icon: 'Tag' as const,        tone: 'purple' as const,  label: t('kpiPriceListLinked'), value: String(withPriceList),                  accent: 'text-purple-300',  size: '2xl' },
          { icon: 'ListFilter' as const, tone: 'amber' as const,   label: t('kpiCurrentFilter'),  value: filters.status || common('allStatuses'), accent: 'text-amber-300',   size: 'lg'  },
        ]
      ).map((k) => (
        <Card key={k.label} as="article" padding="md">
          <div className="flex items-start gap-3">
            <div className={`nvi-kpi-icon nvi-kpi-icon--${k.tone}`}>
              <Icon name={k.icon} size={18} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--nvi-text-muted)]">{k.label}</p>
              <p className={`mt-1 font-semibold ${k.accent} ${k.size === '2xl' ? 'text-2xl' : 'text-lg'}`}>{k.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  // ─── Filters ──────────────────────────────────────────────────────────
  const filtersNode = (
    <Card padding="md">
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
          instanceId="customers-filter-status"
          value={filters.status}
          onChange={(value) => pushFilters({ status: value })}
          options={statusOptions}
          placeholder={common('status')}
          className="nvi-select-container"
        />
        <SmartSelect
          instanceId="customers-filter-balance-due"
          value={filters.balanceDue}
          onChange={(value) => pushFilters({ balanceDue: value })}
          options={balanceOptions}
          placeholder={common('balanceDue')}
          className="nvi-select-container"
        />
      </ListFilters>
    </Card>
  );


  // ─── Sensitive hint ───────────────────────────────────────────────────
  const sensitiveHint = (
    <p className="text-xs text-gold-400 mb-1">
      {t('sensitiveHint')}
    </p>
  );

  // ─── Card view ────────────────────────────────────────────────────────
  const cardsContent = (
    <div className="grid gap-4 md:grid-cols-2 nvi-stagger">
      {sortedCustomers.map((customer) => {
        const plName = resolvePriceListName(customer.priceListId);
        const tData = timelineData[customer.id];
        const isTimelineOpen = timelineOpen === customer.id;
        const isNotesOpen = notesExpanded === customer.id;

        return (
          <Card
            key={customer.id}
            padding="md"
            className="nvi-card-hover transition-all"
          >
              <div className="space-y-3">
                {/* Header: Avatar + name + status */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-0.5">
                      <AvatarInitials name={customer.name} size="lg" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-gold-100 truncate">{customer.name}</h3>
                        <span
                          className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotColor(customer.status)}`}
                          title={customer.status ?? 'ACTIVE'}
                        />
                      </div>
                    </div>
                  </div>
                  <ActionButtons
                    actions={[
                      { key: 'edit', icon: <Icon name="Pencil" size={14} className="text-blue-400" />, label: common('edit'), onClick: () => startEdit(customer), disabled: !canEdit },
                      { key: 'archive', icon: <Icon name="Archive" size={14} className="text-amber-400" />, label: t('archive'), onClick: () => archiveCustomer(customer.id), disabled: !canEdit },
                      { key: 'anonymize', icon: <Icon name="EyeOff" size={14} className="text-red-400" />, label: t('anonymizeAction'), onClick: () => anonymizeCustomer(customer.id), disabled: !canAnonymize, variant: 'danger' },
                    ]}
                    size="xs"
                  />
                </div>

                {/* Contact row */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gold-400">
                  {customer.phone ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10">
                        <Icon name="Phone" size={11} className="text-emerald-400" />
                      </span>
                      <span>{customer.phone}</span>
                      <a
                        href={`https://wa.me/${customer.phone.replace(/[^0-9+]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        title={t('sendWhatsApp')}
                      >
                        <Icon name="MessageCircle" size={10} className="text-emerald-400" />
                        WA
                      </a>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-gold-600">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/5">
                        <Icon name="Phone" size={11} className="text-gold-600" />
                      </span>
                      {t('noPhone')}
                    </span>
                  )}
                  {customer.email ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/10">
                        <Icon name="Mail" size={11} className="text-blue-400" />
                      </span>
                      <span className="truncate max-w-[140px]">{customer.email}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-gold-600">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/5">
                        <Icon name="Mail" size={11} className="text-gold-600" />
                      </span>
                      {t('noEmail')}
                    </span>
                  )}
                  {customer.tin ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/10">
                        <Icon name="Hash" size={11} className="text-amber-400" />
                      </span>
                      <span>{customer.tin}</span>
                    </span>
                  ) : null}
                </div>

                {/* Price list badge */}
                {plName ? (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[11px] font-medium text-purple-400">
                      <Icon name="Tag" size={10} className="text-purple-400" />
                      {plName}
                    </span>
                  </div>
                ) : null}

                {/* Activity snapshot */}
                {tData !== undefined ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-gold-500">
                    <Icon name="ShoppingCart" size={11} className="text-gold-600" />
                    {lastPurchaseLabel(tData, t)}
                  </p>
                ) : null}

                {/* Notes (expandable) */}
                {customer.notes ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => setNotesExpanded(isNotesOpen ? null : customer.id)}
                      className="flex items-center gap-1 text-[11px] text-gold-500 hover:text-gold-300 transition-colors"
                    >
                      <Icon name="StickyNote" size={11} />
                      {isNotesOpen ? t('hideNotes') : t('showNotes')}
                    </button>
                    {isNotesOpen ? (
                      <p className="mt-1 text-xs text-gold-400 nvi-expand">{customer.notes}</p>
                    ) : (
                      <p className="text-[11px] text-gold-600 truncate max-w-[200px]">{customer.notes}</p>
                    )}
                  </div>
                ) : null}

                {/* Timeline toggle */}
                <div className="border-t border-gold-700/20 pt-2">
                  <button
                    type="button"
                    onClick={() => toggleTimeline(customer.id)}
                    className="flex items-center gap-1.5 text-[11px] text-gold-500 hover:text-gold-300 transition-colors"
                  >
                    <Icon name="Clock" size={11} />
                    {isTimelineOpen ? t('hideActivity') : t('viewActivity')}
                    <span
                      className={`transition-transform duration-200 ${isTimelineOpen ? 'rotate-180' : ''}`}
                    >
                      ▾
                    </span>
                  </button>
                  {isTimelineOpen ? (
                    <div className="mt-2 nvi-expand">
                      {timelineLoading === customer.id ? (
                        <p className="text-xs text-gold-400 flex items-center gap-2">
                          <Spinner size="xs" variant="dots" />
                          {t('timelineLoading')}
                        </p>
                      ) : (
                        (() => {
                          const items = buildTimelineItems(timelineData[customer.id] ?? null);
                          return items.length > 0 ? (
                            <div className="nvi-stagger">
                              <Timeline items={items} />
                            </div>
                          ) : (
                            <p className="text-xs text-gold-500">{t('timelineEmpty')}</p>
                          );
                        })()
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
          </Card>
        );
      })}
    </div>
  );

  // ─── Table view ───────────────────────────────────────────────────────
  const tableContent = (
    <Card padding="lg">
      <h3 className="text-lg font-semibold text-gold-100 mb-3">{t('listTitle')}</h3>
      <div className="overflow-auto">
        <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
          <thead className="text-xs uppercase text-gold-400">
            <tr>
              <th className="w-10 px-3 py-2"></th>
              <SortableTableHeader label={t('name')} sortKey="name" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <SortableTableHeader label={t('phone')} sortKey="phone" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <SortableTableHeader label={t('email')} sortKey="email" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <SortableTableHeader label={t('status')} sortKey="status" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
              <th className="px-3 py-2">{t('defaultPriceList')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sortedCustomers.map((customer) => {
              const plName = resolvePriceListName(customer.priceListId);
              return (
                <tr key={customer.id} className="border-t border-gold-700/20 hover:bg-gold-900/20 transition-colors">
                  <td className="px-3 py-2">
                    <div className="rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-0.5">
                      <AvatarInitials name={customer.name} size="xs" />
                    </div>
                  </td>
                  <td className="px-3 py-2 font-semibold">{customer.name}</td>
                  <td className="px-3 py-2">
                    {customer.phone ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10">
                          <Icon name="Phone" size={11} className="text-emerald-400" />
                        </span>
                        <span>{customer.phone}</span>
                        <a
                          href={`https://wa.me/${customer.phone.replace(/[^0-9+]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          title={t('sendWhatsApp')}
                        >
                          <Icon name="MessageCircle" size={10} className="text-emerald-400" />
                          WA
                        </a>
                      </span>
                    ) : (
                      <span className="text-gold-600">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {customer.email ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/10">
                          <Icon name="Mail" size={11} className="text-blue-400" />
                        </span>
                        <span>{customer.email}</span>
                      </span>
                    ) : (
                      <span className="text-gold-600">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${statusDotColor(customer.status)}`}
                      />
                      <span className="text-xs">{customer.status ?? 'ACTIVE'}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {plName ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                        <Icon name="Tag" size={10} className="text-purple-400" />
                        {plName}
                      </span>
                    ) : (
                      <span className="text-gold-600">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ActionButtons
                      actions={[
                        { key: 'edit', icon: <Icon name="Pencil" size={14} className="text-blue-400" />, label: common('edit'), onClick: () => startEdit(customer), disabled: !canEdit, className: 'hover:bg-blue-500/10' },
                        { key: 'archive', icon: <Icon name="Archive" size={14} className="text-amber-400" />, label: t('archive'), onClick: () => archiveCustomer(customer.id), disabled: !canEdit, className: 'hover:bg-amber-500/10' },
                        { key: 'anonymize', icon: <Icon name="EyeOff" size={14} className="text-red-400" />, label: t('anonymizeAction'), onClick: () => anonymizeCustomer(customer.id), disabled: !canAnonymize, variant: 'danger', className: 'hover:bg-red-500/10' },
                      ]}
                      size="xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  // ─── Pagination ───────────────────────────────────────────────────────
  const paginationNode = (
    <PaginationControls
      page={page}
      pageSize={pageSize}
      total={total}
      itemCount={customers.length}
      availablePages={Object.keys(pageCursors).map(Number)}
      hasNext={Boolean(nextCursor)}
      hasPrev={page > 1}
      isLoading={isLoading}
      onPageChange={(p) => load(p)}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(1);
        setPageCursors({ 1: null });
        setTotal(null);
        load(1, size);
      }}
    />
  );

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <>
    <ListPage
      eyebrow={t('eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      badges={
        <>
          <span className="status-chip">{t('badgePeopleWorkflow')}</span>
          <span className="status-chip">{t('badgeLive')}</span>
        </>
      }
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          {canCreate ? (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="nvi-cta nvi-press inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-black"
            >
              <Icon name="UserPlus" size={14} />
              {t('createCustomer')}
            </button>
          ) : null}
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </div>
      }
      banner={
        <>
          {sensitiveHint}
          {bannerNode}
        </>
      }
      kpis={kpiStrip}
      filters={filtersNode}
      viewMode={viewMode}
      table={tableContent}
      cards={cardsContent}
      isEmpty={sortedCustomers.length === 0}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="Users" size={48} className="text-blue-500/40" />
        </div>
      }
      emptyTitle={t('empty')}
      emptyDescription={t('emptyDescription')}
      pagination={paginationNode}
      isLoading={isLoading}
    />

    <CustomerCreateModal
      open={formOpen}
      onClose={() => setFormOpen(false)}
      form={form}
      onFormChange={setForm}
      priceLists={priceLists}
      loadPriceListOptions={loadPriceListOptions}
      onSubmit={createCustomer}
      isCreating={isCreating}
      canCreate={canCreate}
    />

    <CustomerEditModal
      open={Boolean(editingCustomer)}
      onClose={closeEdit}
      customer={editingCustomer}
      draft={editingDraft}
      onDraftChange={setEditingDraft}
      priceLists={priceLists}
      loadPriceListOptions={loadPriceListOptions}
      onSubmit={saveEdit}
      isSaving={isSaving}
      canEdit={canEdit}
    />
    </>
  );
}
