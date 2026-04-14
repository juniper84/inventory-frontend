'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, refreshSessionToken } from '@/lib/api';
import { clearSession, getAccessToken } from '@/lib/auth';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { formatNotificationMessage } from '@/lib/notification-format';
import { pushToast } from '@/lib/app-notifications';
import {
  AnnouncementOverlay,
  pruneDismissedAnnouncementIds,
  type BusinessAnnouncement,
} from '@/components/notifications/AnnouncementOverlay';
import { Banner } from '@/components/notifications/Banner';
import { notify } from '@/components/notifications/NotificationProvider';
import {
  priorityToSeverity,
  type NotificationPriority,
} from '@/components/notifications/NotificationPriorityIcon';
import type { SseState } from '@/components/notifications/NotificationSseIndicator';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';

type Notification = {
  id: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  status: 'UNREAD' | 'READ';
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

type Announcement = BusinessAnnouncement;

// SECURITY first so the sticky banner always picks the most-urgent unread item.
const PRIORITY_ORDER: NotificationPriority[] = [
  'SECURITY',
  'ACTION_REQUIRED',
  'WARNING',
  'INFO',
];

function broadcastSseState(state: SseState) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('nvi:business:sse', { detail: { state } }),
  );
}

export function NotificationSurface({ locale }: { locale: string }) {
  const t = useTranslations('notifications');
  const [items, setItems] = useState<Notification[]>([]);
  const [streamToken, setStreamToken] = useState<string | null>(null);
  const debugStream = process.env.NODE_ENV !== 'production';
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [overlayMode, setOverlayMode] = useState<'unseen' | 'all' | null>(null);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  // Tracks which notification IDs we've already toasted during this session —
  // prevents re-toasting the same notification on reconnect / tab refocus.
  const toastedIdsRef = useRef<Set<string>>(new Set());
  // Tracks whether the initial payload has been received. We do NOT toast
  // the initial backlog; only live SSE arrivals.
  const initialLoadDoneRef = useRef(false);

  // ── Token sync (unchanged) ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    let lastToken = getAccessToken();
    setStreamToken(lastToken);

    const handleStorage = (_event: StorageEvent) => {
      const nextToken = getAccessToken();
      if (nextToken !== lastToken) {
        lastToken = nextToken;
        setStreamToken(nextToken);
      }
    };

    const interval = window.setInterval(() => {
      const nextToken = getAccessToken();
      if (nextToken !== lastToken) {
        lastToken = nextToken;
        setStreamToken(nextToken);
      }
    }, 5000);

    window.addEventListener('storage', handleStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // ── Announcement loader ────────────────────────────────────────────────
  const loadAnnouncements = useCallback(async (token: string) => {
    try {
      const list = await apiFetch<Announcement[]>(
        '/notifications/announcements',
        { token },
      );
      const safe = Array.isArray(list) ? list : [];
      setAnnouncements(safe);
      pruneDismissedAnnouncementIds(safe.map((a) => a.id));
      if (safe.length > 0) {
        setOverlayMode((current) => current ?? 'unseen');
      }
    } catch (err) {
      console.warn('Failed to load announcements', err);
    }
  }, []);

  // ── Initial + periodic polling load ────────────────────────────────────
  useEffect(() => {
    if (!streamToken) {
      return;
    }
    let active = true;
    const load = async () => {
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      try {
        const [data, announcementList] = await Promise.all([
          apiFetch<PaginatedResponse<Notification> | Notification[]>(
            '/notifications',
            { token: streamToken },
          ),
          apiFetch<Announcement[]>('/notifications/announcements', {
            token: streamToken,
          }),
        ]);
        const result = normalizePaginated(data);
        const safe = Array.isArray(announcementList) ? announcementList : [];
        if (active) {
          setItems(result.items);
          setAnnouncements(safe);
          pruneDismissedAnnouncementIds(safe.map((a) => a.id));
          if (safe.length > 0) {
            setOverlayMode((current) => current ?? 'unseen');
          }
          // Mark every existing item as "already seen" so we don't toast the
          // backlog on page load. Only genuinely new SSE arrivals will toast.
          if (!initialLoadDoneRef.current) {
            for (const item of result.items) {
              toastedIdsRef.current.add(item.id);
            }
            initialLoadDoneRef.current = true;
          }
        }
      } catch (err) {
        console.warn('Failed to load notifications', err);
      }
    };
    load();
    const interval = window.setInterval(load, 120000);
    const handleRefresh = () => { void load(); };
    window.addEventListener('nvi:notifications:refresh', handleRefresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('nvi:notifications:refresh', handleRefresh);
    };
  }, [streamToken]);

  // ── SSE stream lifecycle ───────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const handleReviewAnnouncements = () => {
      setOverlayMode('all');
    };
    window.addEventListener('nvi:announcements:review', handleReviewAnnouncements);

    const connect = async () => {
      if (!active) return;
      if (!streamToken) return;
      broadcastSseState('reconnecting');
      let sseToken: string;
      try {
        const res = await apiFetch<{ token: string }>(
          '/notifications/stream-token',
          { method: 'POST', token: streamToken },
        );
        sseToken = res.token;
      } catch {
        broadcastSseState('disconnected');
        return;
      }
      const url = new URL(`${API_BASE_URL}/notifications/stream`);
      url.searchParams.set('token', sseToken);
      const source = new EventSource(url.toString());
      sourceRef.current = source;

      const handleNotification = (event: MessageEvent) => {
        try {
          const incoming = JSON.parse(event.data) as Notification;
          if (!incoming?.id) return;
          setItems((prev) => {
            if (prev.some((item) => item.id === incoming.id)) {
              return prev;
            }
            const next = [incoming, ...prev];
            return next.slice(0, 50);
          });
          // Only toast NEW arrivals (not things we already had on load).
          if (
            !toastedIdsRef.current.has(incoming.id) &&
            initialLoadDoneRef.current
          ) {
            toastedIdsRef.current.add(incoming.id);
            const severity = priorityToSeverity(incoming.priority);
            // For SECURITY / ACTION_REQUIRED we keep the Banner + modal path —
            // don't also fire a toast (would be duplicate). For WARNING/INFO
            // fire a toast; user dismissal is independent of read-state.
            if (incoming.priority === 'WARNING' || incoming.priority === 'INFO') {
              notify[severity](formatNotificationMessage(incoming), {
                title: incoming.title,
              });
            }
          }
        } catch (err) {
          console.warn('Failed to parse notification stream payload', err);
        }
      };

      const handleAnnouncement = () => {
        if (streamToken) {
          loadAnnouncements(streamToken);
        }
      };

      const scheduleReconnect = async () => {
        if (!active) return;
        broadcastSseState('reconnecting');
        source.close();
        retryRef.current += 1;
        const refreshed = await refreshSessionToken();
        if (refreshed) retryRef.current = 0;
        const delay = refreshed ? 1000 : Math.min(30_000, 1000 * 2 ** (retryRef.current - 1));
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => {
          if (retryRef.current >= 5) broadcastSseState('disconnected');
          void connect();
        }, delay);
      };

      const handleForceLogout = (event: MessageEvent) => {
        source.close();
        clearSession();
        let reason: string | undefined;
        try {
          const data = JSON.parse(event.data) as { reason?: string };
          reason = data.reason;
        } catch {
          // ignore parse errors
        }
        const message =
          reason === 'deactivated' ? t('accountDeactivated') : t('sessionRevoked');
        pushToast({ message, variant: 'warning', durationMs: 4000 });
        setTimeout(() => {
          window.location.href = `/${locale}/login`;
        }, 3500);
      };

      source.addEventListener('notification', handleNotification as EventListener);
      source.addEventListener('announcement', handleAnnouncement as EventListener);
      source.addEventListener('force-logout', handleForceLogout as EventListener);
      source.addEventListener('ping', () => {
        retryRef.current = 0;
        broadcastSseState('connected');
      });
      source.onerror = () => {
        void scheduleReconnect();
      };
      source.onopen = () => {
        broadcastSseState('connected');
      };
    };

    void connect();
    return () => {
      active = false;
      window.removeEventListener('nvi:announcements:review', handleReviewAnnouncements);
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
      }
      sourceRef.current?.close();
    };
  }, [streamToken, loadAnnouncements, locale, t]);

  // Broadcast active announcement count to AppShell so the bell shows a badge
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('nvi:announcements:count', {
        detail: { count: announcements.length },
      }),
    );
  }, [announcements.length]);

  const safeItems = Array.isArray(items) ? items : [];
  const unread = useMemo(
    () =>
      safeItems.filter(
        (item) => item.status !== 'READ' && !dismissedIds.has(item.id),
      ),
    [safeItems, dismissedIds],
  );

  // Highest-priority unread notification — drives the sticky banner + modal.
  const highest = useMemo(() => {
    for (const priority of PRIORITY_ORDER) {
      const match = unread.find((item) => item.priority === priority);
      if (match) return match;
    }
    return null;
  }, [unread]);

  const resolveReviewLink = useCallback(
    (notification: Notification) => {
      const meta = notification.metadata ?? {};
      const directUrl =
        typeof meta.url === 'string'
          ? meta.url
          : typeof meta.link === 'string'
            ? meta.link
            : null;
      if (directUrl) return directUrl;
      const path = typeof meta.path === 'string' ? meta.path : null;
      if (path) {
        const normalized = path.startsWith('/') ? path : `/${path}`;
        return `/${locale}${normalized}`;
      }
      const actionType =
        typeof meta.actionType === 'string' ? meta.actionType : null;
      const targetId =
        typeof meta.variantId === 'string'
          ? meta.variantId
          : typeof meta.targetId === 'string'
            ? meta.targetId
            : typeof meta.resourceId === 'string'
              ? meta.resourceId
              : null;
      if (actionType) {
        const params = new URLSearchParams();
        params.set('status', 'PENDING');
        params.set('actionType', actionType);
        if (targetId) params.set('search', targetId);
        return `/${locale}/approvals?${params.toString()}`;
      }
      return `/${locale}/notifications`;
    },
    [locale],
  );

  const dismiss = (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  };

  const markRead = async (id: string) => {
    const token = streamToken ?? getAccessToken();
    if (!token) return;
    try {
      await apiFetch(`/notifications/${id}/read`, { token, method: 'POST' });
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: 'READ' } : item)),
      );
      window.dispatchEvent(new CustomEvent('nvi:notifications:refresh'));
    } catch (err) {
      console.warn('Failed to mark notification read', err);
    }
  };

  // ── ACTION_REQUIRED modal (replaces the old inline Piece 4) ────────────
  // When an ACTION_REQUIRED notification is highest priority, show a single
  // confirm modal via the new notify system. Confirm → navigate to the review
  // link; Cancel → dismiss locally. Uses severity='warning' so the confirm
  // button is amber (matches severity-aware modal family).
  useEffect(() => {
    if (!highest) return;
    if (highest.priority !== 'ACTION_REQUIRED') return;
    if (dismissedIds.has(highest.id)) return;

    let cancelled = false;
    (async () => {
      const ok = await notify.confirm({
        title: highest.title,
        message: formatNotificationMessage(highest),
        severity: 'warning',
        confirmText: t('reviewNow'),
        cancelText: t('dismiss'),
      });
      if (cancelled) return;
      if (ok) {
        const href = resolveReviewLink(highest);
        if (typeof window !== 'undefined') {
          window.location.href = href;
        }
      } else {
        dismiss(highest.id);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentional: we fire once per (highest.id + dismissed set).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highest?.id]);

  // ── Sticky top banner — only for non-ACTION_REQUIRED highest items ─────
  // ACTION_REQUIRED pops a modal instead; showing both was redundant.
  const bannerItem =
    highest && highest.priority !== 'ACTION_REQUIRED' ? highest : null;

  const bannerSeverity = bannerItem
    ? priorityToSeverity(bannerItem.priority)
    : 'info';

  return (
    <>
      {overlayMode && announcements.length > 0 ? (
        <AnnouncementOverlay
          announcements={announcements}
          mode={overlayMode}
          onClose={() => setOverlayMode(null)}
        />
      ) : null}

      {bannerItem ? (
        <Banner
          severity={bannerSeverity}
          title={bannerItem.title}
          message={formatNotificationMessage(bannerItem)}
          sticky
          onDismiss={() => dismiss(bannerItem.id)}
          action={{
            label: t('markRead'),
            onClick: () => void markRead(bannerItem.id),
          }}
        />
      ) : null}
    </>
  );
}
