'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage, refreshSessionToken } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
import { confirmAction, useToastState } from '@/lib/app-notifications';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatNotificationMessage } from '@/lib/notification-format';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

type Notification = {
  id: string;
  title: string;
  message: string;
  priority: string;
  status: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';

export default function NotificationsPage() {
  const t = useTranslations('notificationsPage');
  const [isLoading, setIsLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<Notification[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const [total, setTotal] = useState<number | null>(null);
  const [message, setMessage] = useToastState();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    priority: '',
    from: '',
    to: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('allStatuses') },
      { value: 'UNREAD', label: t('unread') },
      { value: 'READ', label: t('read') },
    ],
    [t],
  );

  const priorityOptions = useMemo(
    () => [
      { value: '', label: t('allPriorities') },
      { value: 'ACTION_REQUIRED', label: t('priority.ACTION_REQUIRED') },
      { value: 'WARNING', label: t('priority.WARNING') },
      { value: 'INFO', label: t('priority.INFO') },
      { value: 'SECURITY', label: t('priority.SECURITY') },
    ],
    [t],
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
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    const effectivePageSize = nextPageSize ?? pageSize;
    const cursor =
      targetPage === 1 ? null : pageCursors[targetPage] ?? null;
    try {
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const data = await apiFetch<PaginatedResponse<Notification> | Notification[]>(
        `/notifications${query}`,
        { token },
      );
      const result = normalizePaginated(data);
      setItems(result.items);
      setSelectedIds(new Set());
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
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [
    filters.search,
    filters.status,
    filters.priority,
    filters.from,
    filters.to,
  ]);

  useEffect(() => {
    let active = true;
    let source: EventSource | null = null;

    const matchesFilters = (incoming: Notification) => {
      if (filters.status && incoming.status !== filters.status) {
        return false;
      }
      if (filters.priority && incoming.priority !== filters.priority) {
        return false;
      }
      if (filters.search) {
        const term = filters.search.toLowerCase();
        const haystack = `${incoming.title} ${incoming.message}`.toLowerCase();
        if (!haystack.includes(term)) {
          return false;
        }
      }
      if (filters.from) {
        const fromDate = Date.parse(filters.from);
        if (!Number.isNaN(fromDate) && Date.parse(incoming.createdAt) < fromDate) {
          return false;
        }
      }
      if (filters.to) {
        const toDate = Date.parse(filters.to);
        if (!Number.isNaN(toDate) && Date.parse(incoming.createdAt) > toDate) {
          return false;
        }
      }
      return true;
    };

    const connect = async () => {
      if (!active) {
        return;
      }
      const token = getAccessToken();
      if (!token) {
        return;
      }
      const url = new URL(`${API_BASE_URL}/notifications/stream`);
      url.searchParams.set('token', token);
      source = new EventSource(url.toString());

      const handleNotification = (event: MessageEvent) => {
        try {
          const incoming = JSON.parse(event.data) as Notification;
          if (!incoming?.id) {
            return;
          }
          if (page !== 1 || !matchesFilters(incoming)) {
            return;
          }
          setItems((prev) => {
            if (prev.some((item) => item.id === incoming.id)) {
              return prev;
            }
            return [incoming, ...prev].slice(0, pageSize);
          });
          setTotal((prev) => (typeof prev === 'number' ? prev + 1 : prev));
        } catch (err) {
          console.warn('Failed to parse notification stream payload', err);
        }
      };

      const scheduleReconnect = async () => {
        if (!active) {
          return;
        }
        source?.close();
        retryRef.current += 1;
        const refreshed = await refreshSessionToken();
        if (refreshed) {
          retryRef.current = 0;
        }
        const delay = refreshed
          ? 1000
          : Math.min(30000, 1000 * 2 ** (retryRef.current - 1));
        if (retryTimerRef.current) {
          window.clearTimeout(retryTimerRef.current);
        }
        retryTimerRef.current = window.setTimeout(() => {
          void connect();
        }, delay);
      };

      source.addEventListener('notification', handleNotification as EventListener);
      source.addEventListener('ping', () => {
        retryRef.current = 0;
      });
      source.onerror = () => {
        void scheduleReconnect();
      };
    };

    void connect();
    return () => {
      active = false;
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
      }
      source?.close();
    };
  }, [
    filters.search,
    filters.status,
    filters.priority,
    filters.from,
    filters.to,
    page,
    pageSize,
  ]);

  const markRead = async (id: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await apiFetch(`/notifications/${id}/read`, { token, method: 'POST' });
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: 'READ' } : item,
        ),
      );
      setMessage({ action: 'update', outcome: 'success', message: t('markedRead') });
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('updateFailed')),
      });
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  const markAllRead = async () => {
    const confirmed = await confirmAction({
      title: t('markAllReadTitle'),
      message: t('markAllReadConfirm'),
      confirmText: t('markAllReadAction'),
    });
    if (!confirmed) {
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBulkBusy(true);
    try {
      await apiFetch('/notifications/read-all', { token, method: 'POST' });
      setItems((prev) => prev.map((item) => ({ ...item, status: 'READ' })));
      setSelectedIds(new Set());
      setMessage({ action: 'update', outcome: 'success', message: t('markedAllRead') });
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('updateFailed')),
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const markSelectedRead = async () => {
    if (!selectedIds.size) {
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBulkBusy(true);
    try {
      await apiFetch('/notifications/read-bulk', {
        token,
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      setItems((prev) =>
        prev.map((item) =>
          selectedIds.has(item.id) ? { ...item, status: 'READ' } : item,
        ),
      );
      setSelectedIds(new Set());
      setMessage({
        action: 'update',
        outcome: 'success',
        message: t('markedSelectedRead'),
      });
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('updateFailed')),
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const archiveSelected = async () => {
    if (!selectedIds.size) {
      return;
    }
    const confirmed = await confirmAction({
      title: t('archiveTitle'),
      message: t('archiveConfirm'),
      confirmText: t('archiveAction'),
    });
    if (!confirmed) {
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBulkBusy(true);
    try {
      await apiFetch('/notifications/archive-bulk', {
        token,
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
      setMessage({
        action: 'update',
        outcome: 'success',
        message: t('archivedSelected'),
      });
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('updateFailed')),
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const securityItems = items.filter((item) => item.priority === 'SECURITY');
  const regularItems = items.filter((item) => item.priority !== 'SECURITY');
  const unreadCount = items.filter((item) => item.status !== 'READ').length;
  const actionRequiredCount = items.filter((item) => item.priority === 'ACTION_REQUIRED').length;
  const selectedCount = selectedIds.size;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(items.map((item) => item.id)));
  };
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  const priorityLabel = (priority: string) =>
    t(`priority.${priority}`, {
      fallback: priority,
    });

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="nvi-page">
      <PremiumPageHeader
        eyebrow="Alert inbox"
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="status-chip">Stream</span>
            <span className="status-chip">Live</span>
          </>
        }
      />
      {message ? <StatusBanner message={message} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Inbox size</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{items.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Unread</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{unreadCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Action required</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{actionRequiredCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Selected</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{selectedCount}</p>
        </article>
      </div>
      <div className="command-card nvi-panel nvi-reveal p-4">
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
            placeholder={t('status')}
            className="nvi-select-container"
          />
          <SmartSelect
            value={filters.priority}
            onChange={(value) => pushFilters({ priority: value })}
            options={priorityOptions}
            placeholder={t('priorityLabel')}
            className="nvi-select-container"
          />
          <DatePickerInput
            value={filters.from}
            onChange={(value) => pushFilters({ from: value })}
            placeholder={t('fromDate')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <DatePickerInput
            value={filters.to}
            onChange={(value) => pushFilters({ to: value })}
            placeholder={t('toDate')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </ListFilters>
      </div>
      <div className="command-card nvi-panel px-3 py-2 text-xs text-gold-300 nvi-reveal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            <span>
              {t('selectAll')} {items.length ? `(${items.length})` : ''}
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span>{t('selectedCount', { count: selectedCount })}</span>
            <button
              type="button"
              onClick={markSelectedRead}
              disabled={!selectedCount || bulkBusy}
              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkBusy ? <Spinner size="xs" variant="dots" /> : null}
              {t('markSelectedRead')}
            </button>
            <button
              type="button"
              onClick={archiveSelected}
              disabled={!selectedCount || bulkBusy}
              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkBusy ? <Spinner size="xs" variant="dots" /> : null}
              {t('archiveSelected')}
            </button>
            <button
              type="button"
              onClick={markAllRead}
              disabled={bulkBusy || !items.length}
              className="nvi-cta inline-flex items-center gap-2 rounded px-3 py-1 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkBusy ? <Spinner size="xs" variant="dots" /> : null}
              {t('markAllReadAction')}
            </button>
          </div>
        </div>
      </div>
      {securityItems.length ? (
        <section className="rounded border border-red-500/40 bg-red-950/40 p-4 nvi-reveal">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-red-200">
              {t('securityAlerts')}
            </h3>
            <span className="text-xs text-red-300">
              {t('activeCount', { count: securityItems.length })}
            </span>
          </div>
          <div className="mt-3 space-y-3">
            {securityItems.map((item) => (
              <div
                key={item.id}
                className="rounded border border-red-500/40 bg-black/50 p-4"
              >
                <div className="flex items-center justify-between text-xs text-red-200">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                    />
                    <span>{priorityLabel(item.priority)}</span>
                  </label>
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                <h4 className="text-base font-semibold text-red-100">
                  {item.title}
                </h4>
                <p className="text-sm text-red-200">
                  {formatNotificationMessage(item)}
                </p>
                {item.status !== 'READ' ? (
                  <button
                    onClick={() => markRead(item.id)}
                    className="mt-3 inline-flex items-center gap-2 rounded border border-red-500/50 px-3 py-1 text-xs text-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={actionBusy[item.id]}
                  >
                    {actionBusy[item.id] ? (
                      <Spinner size="xs" variant="dots" />
                    ) : null}
                    {actionBusy[item.id] ? t('marking') : t('markRead')}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <div className="space-y-3 nvi-stagger">
        {regularItems.length === 0 ? (
          <StatusBanner message={t('empty')} />
        ) : (
          regularItems.map((item) => (
            <div
              key={item.id}
              className="command-card nvi-panel p-4 nvi-reveal"
            >
              <div className="flex items-center justify-between text-sm text-gold-300">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                  />
                  <span>{priorityLabel(item.priority)}</span>
                </label>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
              </div>
              <h3 className="text-lg font-semibold text-gold-100">{item.title}</h3>
              <p className="text-sm text-gold-200">
                {formatNotificationMessage(item)}
              </p>
              {item.status !== 'READ' ? (
                <button
                  onClick={() => markRead(item.id)}
                  className="mt-3 inline-flex items-center gap-2 rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={actionBusy[item.id]}
                >
                  {actionBusy[item.id] ? <Spinner size="xs" variant="grid" /> : null}
                  {actionBusy[item.id] ? t('marking') : t('markRead')}
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        itemCount={items.length}
        availablePages={Object.keys(pageCursors).map(Number)}
        hasNext={Boolean(nextCursor)}
        hasPrev={page > 1}
        isLoading={isLoading}
        onPageChange={(nextPage) => load(nextPage)}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
          setPageCursors({ 1: null });
          setTotal(null);
          load(1, size);
        }}
      />
    </section>
  );
}
