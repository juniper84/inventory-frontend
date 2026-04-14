'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  Bell,
  ShieldAlert,
  AlertTriangle,
  Eye,
  Archive,
  Volume2,
  VolumeX,
  Inbox,
  Clock,
  Wifi,
  WifiOff,
  CheckCheck,
  ShoppingCart,
  Package,
  Truck,
  User,
  Key,
  CreditCard,
  Settings,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { apiFetch, getApiErrorMessage, refreshSessionToken } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PaginationControls } from '@/components/PaginationControls';
import { notify } from '@/components/notifications/NotificationProvider';
import { confirmAction } from '@/lib/app-notifications';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { formatNotificationMessage } from '@/lib/notification-format';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';

import { useFormatDate } from '@/lib/business-context';
import { PageHeader, Card, EmptyState, Tabs, StatusBadge } from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { Banner } from '@/components/notifications/Banner';
import type { NotifySeverity } from '@/components/notifications/types';
import { PageSkeleton } from '@/components/PageSkeleton';

/* ─── Types ───────────────────────────────────────────────────────────────── */

type Notification = {
  id: string;
  title: string;
  message: string;
  priority: string;
  status: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';

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
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}

function dateGroupLabel(dateStr: string, t: (key: string) => string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor(
    (today.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return t('groupToday');
  if (diffDays === 1) return t('groupYesterday');
  if (diffDays <= 7) return t('groupThisWeek');
  return t('groupOlder');
}

function groupByDate(
  items: Notification[],
  t: (key: string) => string,
): { label: string; items: Notification[] }[] {
  const groups: { label: string; items: Notification[] }[] = [];
  const groupMap = new Map<string, Notification[]>();
  const groupOrder: string[] = [];
  for (const item of items) {
    const label = dateGroupLabel(item.createdAt, t);
    if (!groupMap.has(label)) {
      groupMap.set(label, []);
      groupOrder.push(label);
    }
    groupMap.get(label)!.push(item);
  }
  for (const label of groupOrder) {
    groups.push({ label, items: groupMap.get(label)! });
  }
  return groups;
}

/** Pick an icon based on notification title/message keywords */
function notificationIcon(item: Notification) {
  const hay = `${item.title} ${item.message}`.toLowerCase();
  if (hay.includes('sale') || hay.includes('receipt') || hay.includes('pos'))
    return ShoppingCart;
  if (hay.includes('stock') || hay.includes('inventory') || hay.includes('batch'))
    return Package;
  if (hay.includes('transfer'))
    return Truck;
  if (hay.includes('customer') || hay.includes('user') || hay.includes('invite'))
    return User;
  if (hay.includes('login') || hay.includes('password') || hay.includes('token') || hay.includes('auth'))
    return Key;
  if (hay.includes('subscription') || hay.includes('payment') || hay.includes('credit'))
    return CreditCard;
  if (hay.includes('approval') || hay.includes('approve'))
    return FileText;
  if (hay.includes('refund') || hay.includes('return'))
    return RotateCcw;
  if (hay.includes('setting') || hay.includes('config'))
    return Settings;
  return Bell;
}

function priorityBorderColor(priority: string): string {
  switch (priority) {
    case 'ACTION_REQUIRED':
      return 'border-l-red-400';
    case 'WARNING':
      return 'border-l-amber-400';
    case 'INFO':
      return 'border-l-blue-400';
    case 'SECURITY':
      return 'border-l-red-500';
    default:
      return 'border-l-[var(--nvi-border)]';
  }
}

/* ─── Page component ──────────────────────────────────────────────────────── */

export default function NotificationsPage() {
  const t = useTranslations('notificationsPage');
  const locale = useLocale();
  const { formatDateTime } = useFormatDate();
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
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [total, setTotal] = useState<number | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{ text: string; severity: NotifySeverity } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  /* ─── Sound toggle ──────────────────────────────────────────────────────── */

  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('nvi.notification.sound') !== 'false';
  });
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('nvi.notification.sound', String(next));
      return next;
    });
  };
  const playNotificationSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // AudioContext may be unavailable
    }
  }, []);

  /* ─── Filters ───────────────────────────────────────────────────────────── */

  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    priority: '',
    from: '',
    to: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);


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

  const securityUnreadCount = useMemo(
    () => items.filter((i) => i.priority === 'SECURITY' && i.status !== 'READ').length,
    [items],
  );

  const streamTabs: TabItem[] = useMemo(
    () => [
      { id: 'all', label: t('tabAll') },
      {
        id: 'security',
        label: (
          <span className="flex items-center gap-1.5">
            {t('tabSecurity')}
            {securityUnreadCount > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white nvi-pulse-ring">
                {securityUnreadCount}
              </span>
            )}
          </span>
        ),
      },
      { id: 'unread', label: t('tabUnread') },
      { id: 'action', label: t('tabAction') },
      { id: 'read', label: t('tabRead') },
    ],
    [t, securityUnreadCount],
  );

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);



  /* ─── Data loading ──────────────────────────────────────────────────────── */

  const load = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    const effectivePageSize = nextPageSize ?? pageSize;
    const cursor =
      targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
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
      setBannerMsg({
        text: getApiErrorMessage(err, t('loadFailed')),
        severity: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, filters.search, filters.status, filters.priority, filters.from, filters.to, t]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [load]);

  /* ─── SSE stream ────────────────────────────────────────────────────────── */

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
      const mainToken = getAccessToken();
      if (!mainToken) {
        return;
      }
      let sseToken: string;
      try {
        const res = await apiFetch<{ token: string }>(
          '/notifications/stream-token',
          { method: 'POST', token: mainToken },
        );
        sseToken = res.token;
      } catch {
        return;
      }
      const url = new URL(`${API_BASE_URL}/notifications/stream`);
      url.searchParams.set('token', sseToken);
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
          let isNew = false;
          setItems((prev) => {
            if (prev.some((item) => item.id === incoming.id)) {
              return prev;
            }
            isNew = true;
            return [incoming, ...prev].slice(0, pageSize);
          });
          if (isNew) {
            playNotificationSound();
          }
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
        setSseConnected(false);
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
      source.onopen = () => {
        if (active) setSseConnected(true);
      };
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
    playNotificationSound,
  ]);

  /* ─── Actions ───────────────────────────────────────────────────────────── */

  const dispatchRefresh = () => {
    window.dispatchEvent(new CustomEvent('nvi:notifications:refresh'));
  };

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
      dispatchRefresh();
      notify.success(t('markedRead'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('updateFailed')));
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
      dispatchRefresh();
      notify.success(t('markedAllRead'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('updateFailed')));
    } finally {
      setBulkBusy(false);
    }
  };

  const markSecurityRead = async () => {
    const secIds = securityItems.filter((i) => i.status !== 'READ').map((i) => i.id);
    if (!secIds.length) return;
    const token = getAccessToken();
    if (!token) return;
    setBulkBusy(true);
    try {
      await apiFetch('/notifications/read-bulk', {
        token,
        method: 'POST',
        body: JSON.stringify({ ids: secIds }),
      });
      setItems((prev) =>
        prev.map((item) =>
          secIds.includes(item.id) ? { ...item, status: 'READ' } : item,
        ),
      );
      dispatchRefresh();
      notify.success(t('markedSecurityRead'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('updateFailed')));
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
      dispatchRefresh();
      notify.success(t('markedSelectedRead'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('updateFailed')));
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
      notify.success(t('archivedSelected'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('updateFailed')));
    } finally {
      setBulkBusy(false);
    }
  };

  /* ─── Derived data ──────────────────────────────────────────────────────── */

  const securityItems = items.filter((item) => item.priority === 'SECURITY');
  const unreadCount = items.filter((item) => item.status !== 'READ').length;
  const actionRequiredCount = items.filter((item) => item.priority === 'ACTION_REQUIRED').length;
  const selectedCount = selectedIds.size;

  // Tab-filtered items (security is now a tab, not a separate zone)
  const filteredItems = useMemo(() => {
    switch (activeTab) {
      case 'security':
        return items.filter((i) => i.priority === 'SECURITY');
      case 'unread':
        return items.filter((i) => i.status !== 'READ');
      case 'read':
        return items.filter((i) => i.status === 'READ');
      case 'action':
        return items.filter((i) => i.priority === 'ACTION_REQUIRED');
      default:
        return items;
    }
  }, [items, activeTab]);

  const dateGroups = useMemo(() => groupByDate(filteredItems, t), [filteredItems, t]);

  const allItemsSelected =
    filteredItems.length > 0 &&
    filteredItems.every((i) => selectedIds.has(i.id));
  const toggleSelectAll = () => {
    if (allItemsSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredItems.map((item) => item.id)));
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

  /* ─── Loading state ─────────────────────────────────────────────────────── */

  if (isLoading) {
    return <PageSkeleton />;
  }

  /* ─── Render ────────────────────────────────────────────────────────────── */

  return (
    <section className="nvi-page">
      {/* ─── Page header ─────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <div className="flex items-center gap-2">
            {sseConnected ? (
              <span className="nvi-badge inline-flex items-center gap-1.5 text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <Wifi size={12} />
                {t('badgeLive')}
              </span>
            ) : (
              <span className="nvi-badge inline-flex items-center gap-1.5 text-amber-400">
                <WifiOff size={12} />
                {t('badgeReconnecting')}
              </span>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/${locale}/settings/business`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text-secondary)] hover:text-[var(--nvi-text-primary)] nvi-press"
            >
              <Settings size={14} />
              {t('notificationPrefs')}
            </Link>
            <button
              type="button"
              onClick={toggleSound}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text-secondary)] hover:text-[var(--nvi-text-primary)] nvi-press"
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {soundEnabled ? t('soundEnabled') : t('soundDisabled')}
            </button>
          </div>
        }
      />

      {/* ─── Banner ──────────────────────────────────────────────────────── */}
      {bannerMsg ? (
        <Banner
          message={bannerMsg.text}
          severity={bannerMsg.severity}
          onDismiss={() => setBannerMsg(null)}
        />
      ) : null}

      {/* ─── KPI strip ───────────────────────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <Card padding="md" as="article">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">
                {t('kpiUnread')}
              </p>
              <p className="mt-2 text-3xl font-semibold text-[var(--nvi-text-primary)]">
                {unreadCount}
              </p>
            </div>
            <div className="nvi-kpi-icon nvi-kpi-icon--amber">
              <Bell size={18} />
            </div>
          </div>
        </Card>
        <Card padding="md" as="article">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">
                {t('kpiSecurity')}
              </p>
              <p className="mt-2 text-3xl font-semibold text-[var(--nvi-text-primary)]">
                {securityItems.length}
              </p>
            </div>
            <div className="nvi-kpi-icon nvi-kpi-icon--red">
              <ShieldAlert size={18} />
            </div>
          </div>
        </Card>
        <Card padding="md" as="article">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">
                {t('kpiActionRequired')}
              </p>
              <p className="mt-2 text-3xl font-semibold text-[var(--nvi-text-primary)]">
                {actionRequiredCount}
              </p>
            </div>
            <div className="nvi-kpi-icon nvi-kpi-icon--accent">
              <AlertTriangle size={18} />
            </div>
          </div>
        </Card>
        <Card padding="md" as="article">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">
                {t('kpiTotal')}
              </p>
              <p className="mt-2 text-3xl font-semibold text-[var(--nvi-text-primary)]">
                {total ?? items.length}
              </p>
            </div>
            <div className="nvi-kpi-icon nvi-kpi-icon--blue">
              <Inbox size={18} />
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Filters ───────────────────────────────────────────────────── */}
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
            instanceId="notifications-filter-status"
            value={filters.status}
            onChange={(value) => pushFilters({ status: value })}
            options={statusOptions}
            placeholder={t('status')}
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="notifications-filter-priority"
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
            className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-text-primary)]"
          />
          <DatePickerInput
            value={filters.to}
            onChange={(value) => pushFilters({ to: value })}
            placeholder={t('toDate')}
            className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-text-primary)]"
          />
        </ListFilters>
      </Card>

      {/* Tabs */}
      <Tabs
        tabs={streamTabs}
        activeId={activeTab}
        onSelect={(tab) => setActiveTab(tab.id)}
      />

      {/* Bulk actions bar */}
      {selectedCount > 0 ? (
        <Card padding="sm" className="nvi-pop">
          <div className="flex flex-wrap items-center justify-between gap-3 px-2">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-[var(--nvi-text-secondary)]">
                <input
                  type="checkbox"
                  checked={allItemsSelected}
                  onChange={toggleSelectAll}
                  className="accent-[var(--nvi-accent)]"
                />
                <span>{t('selectAll')}</span>
              </label>
              <span className="text-sm font-semibold text-[var(--nvi-text-primary)] nvi-pop">
                {t('selectedCount', { count: selectedCount })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={markSelectedRead}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text-primary)] disabled:cursor-not-allowed disabled:opacity-60 nvi-press"
              >
                {bulkBusy ? <Spinner size="xs" variant="dots" /> : <Eye size={14} />}
                {t('markSelectedRead')}
              </button>
              <button
                type="button"
                onClick={archiveSelected}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text-primary)] disabled:cursor-not-allowed disabled:opacity-60 nvi-press"
              >
                {bulkBusy ? <Spinner size="xs" variant="dots" /> : <Archive size={14} />}
                {t('archiveSelected')}
              </button>
              {activeTab === 'security' && securityUnreadCount > 0 ? (
                <button
                  type="button"
                  onClick={markSecurityRead}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 px-3 py-1.5 text-xs text-red-200 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60 nvi-press"
                >
                  {bulkBusy ? <Spinner size="xs" variant="dots" /> : <ShieldAlert size={14} />}
                  {t('markSecurityReadBtn')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={markAllRead}
                disabled={bulkBusy || !items.length}
                className="nvi-cta inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60 nvi-press"
              >
                {bulkBusy ? <Spinner size="xs" variant="dots" /> : <CheckCheck size={14} />}
                {t('markAllReadAction')}
              </button>
            </div>
          </div>
        </Card>
      ) : (
        /* Minimal select-all + mark-all bar when nothing selected */
        unreadCount > 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-[var(--nvi-border)] bg-black/20 px-4 py-2.5 nvi-reveal">
            <label className="flex items-center gap-2 text-xs text-[var(--nvi-text-secondary)]">
              <input
                type="checkbox"
                checked={allItemsSelected}
                onChange={toggleSelectAll}
                className="accent-[var(--nvi-accent)]"
              />
              <span>{t('selectAll')} {filteredItems.length ? `(${filteredItems.length})` : ''}</span>
            </label>
            <div className="flex items-center gap-2">
              {activeTab === 'security' && securityUnreadCount > 0 ? (
                <button
                  type="button"
                  onClick={markSecurityRead}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 px-3 py-1.5 text-xs text-red-200 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60 nvi-press"
                >
                  {bulkBusy ? <Spinner size="xs" variant="dots" /> : <ShieldAlert size={14} />}
                  {t('markSecurityReadBtn')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={markAllRead}
                disabled={bulkBusy || !items.length}
                className="nvi-cta inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60 nvi-press"
              >
                {bulkBusy ? <Spinner size="xs" variant="dots" /> : <CheckCheck size={14} />}
                {t('markAllReadAction')}
              </button>
            </div>
          </div>
        ) : null
      )}

      {/* Notification stream grouped by date */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={
            <div className="nvi-float">
              <Bell size={32} className="text-[var(--nvi-text-muted)]" />
            </div>
          }
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      ) : (
        <div className="space-y-6">
          {dateGroups.map((group) => (
            <div key={group.label}>
              <div className="mb-2 flex items-center gap-2">
                <Clock size={12} className="text-[var(--nvi-text-muted)]" />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
                  {group.label}
                </h4>
                <div className="flex-1 border-t border-[var(--nvi-border)]" />
              </div>
              <div className="space-y-2 nvi-stagger">
                {group.items.map((item) => {
                  const ItemIcon = notificationIcon(item);
                  return (
                    <Card
                      key={item.id}
                      padding="sm"
                      className={`nvi-card-hover border-l-2 ${priorityBorderColor(item.priority)} ${
                        item.status !== 'READ' ? '' : 'opacity-75'
                      }`}
                    >
                      <div className="flex items-start gap-3 px-1">
                        <label className="mt-1 flex shrink-0 items-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelected(item.id)}
                            className="accent-[var(--nvi-accent)]"
                          />
                        </label>
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--nvi-surface-alt,rgba(255,255,255,0.03))]">
                          <ItemIcon size={15} className="text-[var(--nvi-text-secondary)]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3
                              className={`truncate text-sm ${
                                item.status !== 'READ'
                                  ? 'font-bold text-[var(--nvi-text-primary)]'
                                  : 'font-medium text-[var(--nvi-text-secondary)]'
                              }`}
                            >
                              {item.title}
                            </h3>
                            {item.status !== 'READ' ? (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--nvi-accent)]" />
                            ) : null}
                            <StatusBadge
                              status={item.priority}
                              size="xs"
                              label={priorityLabel(item.priority)}
                            />
                          </div>
                          <p
                            className={`mt-0.5 text-xs ${
                              item.status !== 'READ'
                                ? 'text-[var(--nvi-text-primary)]'
                                : 'text-[var(--nvi-text-secondary)]'
                            }`}
                          >
                            {formatNotificationMessage(item)}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--nvi-text-muted)]">
                            <Clock size={10} />
                            <span>{relativeTime(item.createdAt)}</span>
                            <span className="text-[var(--nvi-border)]">|</span>
                            <span>{formatDateTime(item.createdAt)}</span>
                          </div>
                        </div>
                        {item.status !== 'READ' ? (
                          <button
                            type="button"
                            onClick={() => markRead(item.id)}
                            disabled={actionBusy[item.id]}
                            className="mt-1 shrink-0 rounded-xl border border-[var(--nvi-border)] p-1.5 text-[var(--nvi-text-secondary)] hover:text-[var(--nvi-text-primary)] disabled:cursor-not-allowed disabled:opacity-60 nvi-press"
                            title={t('markRead')}
                          >
                            {actionBusy[item.id] ? (
                              <Spinner size="xs" variant="dots" />
                            ) : (
                              <Eye size={14} />
                            )}
                          </button>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Pagination ──────────────────────────────────────────────────── */}
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
