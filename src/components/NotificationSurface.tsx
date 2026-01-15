'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { formatNotificationMessage } from '@/lib/notification-format';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';

type Notification = {
  id: string;
  title: string;
  message: string;
  priority: 'ACTION_REQUIRED' | 'WARNING' | 'INFO' | 'SECURITY';
  status: 'UNREAD' | 'READ';
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

type Announcement = {
  id: string;
  title: string;
  message: string;
  severity: string;
  startsAt: string;
  endsAt?: string | null;
};

const PRIORITY_ORDER: Notification['priority'][] = [
  'SECURITY',
  'ACTION_REQUIRED',
  'WARNING',
  'INFO',
];

export function NotificationSurface({ locale }: { locale: string }) {
  const t = useTranslations('notifications');
  const [items, setItems] = useState<Notification[]>([]);
  const [dismissedAnnouncementId, setDismissedAnnouncementId] = useState<
    string | null
  >(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.sessionStorage.getItem('nvi.dismissedAnnouncementId');
  });
  const [showAnnouncementDetails, setShowAnnouncementDetails] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  const loadAnnouncement = async (token: string) => {
    try {
      const announcementData = await apiFetch<Announcement | null>(
        '/notifications/announcement',
        { token },
      );
      setAnnouncement(announcementData);
    } catch {
      // Ignore announcement load failures.
    }
  };

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    let active = true;
    const load = async () => {
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      try {
        const [data, announcementData] = await Promise.all([
          apiFetch<PaginatedResponse<Notification> | Notification[]>(
            '/notifications',
            { token },
          ),
          apiFetch<Announcement | null>('/notifications/announcement', { token }),
        ]);
        const result = normalizePaginated(data);
        if (active) {
          setItems(result.items);
          setAnnouncement(announcementData);
        }
      } catch {
        // Keep surface quiet if notifications fail to load.
      }
    };
    load();
    const interval = window.setInterval(load, 120000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const url = new URL(`${API_BASE_URL}/notifications/stream`);
    url.searchParams.set('token', token);
    const source = new EventSource(url.toString());

    const handleNotification = (event: MessageEvent) => {
      try {
        const incoming = JSON.parse(event.data) as Notification;
        if (!incoming?.id) {
          return;
        }
        setItems((prev) => {
          if (prev.some((item) => item.id === incoming.id)) {
            return prev;
          }
          const next = [incoming, ...prev];
          return next.slice(0, 50);
        });
      } catch {
        // Ignore malformed SSE payloads.
      }
    };

    const handleAnnouncement = () => {
      loadAnnouncement(token);
    };

    source.addEventListener('notification', handleNotification as EventListener);
    source.addEventListener('announcement', handleAnnouncement as EventListener);

    return () => {
      source.close();
    };
  }, []);

  const safeItems = Array.isArray(items) ? items : [];
  const unread = useMemo(
    () =>
      safeItems.filter(
        (item) => item.status !== 'READ' && !dismissedIds.has(item.id),
      ),
    [safeItems, dismissedIds],
  );

  const highest = useMemo(() => {
    for (const priority of PRIORITY_ORDER) {
      const match = unread.find((item) => item.priority === priority);
      if (match) {
        return match;
      }
    }
    return null;
  }, [unread]);

  const toastItems = unread
    .filter((item) => item.priority === 'WARNING' || item.priority === 'INFO')
    .slice(0, 2);

  const shouldShowModal = Boolean(
    highest &&
      highest.priority === 'ACTION_REQUIRED' &&
      !dismissedIds.has(highest.id),
  );

  const dismiss = (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  };

  return (
    <>
      {announcement && announcement.id !== dismissedAnnouncementId ? (
        <div className="sticky top-0 z-50 w-full border-b border-[color:var(--border)] bg-[color:var(--surface-soft)] px-6 py-3 text-sm text-[color:var(--foreground)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                {t('announcement')} • {announcement.severity}
              </p>
              <p className="font-semibold">{announcement.title}</p>
              <p className="text-[color:var(--muted)]">{announcement.message}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded border border-[color:var(--border)] px-3 py-1 text-xs text-[color:var(--muted)]">
                {new Date(announcement.startsAt).toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setShowAnnouncementDetails(true)}
                className="rounded border border-[color:var(--border)] px-3 py-1 text-xs text-[color:var(--foreground)]"
              >
                {t('viewMore')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.sessionStorage.setItem(
                      'nvi.dismissedAnnouncementId',
                      announcement.id,
                    );
                  }
                  setDismissedAnnouncementId(announcement.id);
                  setShowAnnouncementDetails(false);
                }}
                className="rounded border border-[color:var(--border)] px-3 py-1 text-xs text-[color:var(--muted)]"
              >
                {t('dismiss')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {highest ? (
        <div className="sticky top-0 z-40 w-full border-b border-[color:var(--border)] bg-[color:var(--surface-soft)] px-6 py-3 text-sm text-[color:var(--foreground)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                {highest.priority}
              </p>
              <p className="font-semibold">{highest.title}</p>
              <p className="text-[color:var(--muted)]">
                {formatNotificationMessage(highest)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`/${locale}/notifications`}
                className="rounded border border-[color:var(--border)] px-3 py-1 text-xs text-[color:var(--foreground)]"
              >
                {t('viewInbox')}
              </Link>
              <button
                type="button"
                onClick={() => dismiss(highest.id)}
                className="rounded border border-[color:var(--border)] px-3 py-1 text-xs text-[color:var(--muted)]"
              >
                {t('dismiss')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastItems.length ? (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3">
          {toastItems.map((item) => (
            <div
              key={item.id}
              className="w-72 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-4 text-xs text-[color:var(--muted)] shadow-xl transition"
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-[color:var(--muted)]">
                <span>{item.priority}</span>
                <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-[color:var(--foreground)]">
                {item.title}
              </p>
              <p className="mt-1 text-xs text-[color:var(--muted)]">
                {formatNotificationMessage(item)}
              </p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="mt-3 text-[11px] text-[color:var(--muted)] underline underline-offset-4"
              >
                {t('dismiss')}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {highest && shouldShowModal && highest.priority === 'ACTION_REQUIRED' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 text-[color:var(--foreground)] shadow-2xl">
            <p className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--muted)]">
              {t('actionRequired')}
            </p>
            <h3 className="mt-2 text-xl font-semibold">{highest.title}</h3>
            <p className="mt-3 text-sm text-[color:var(--muted)]">
              {formatNotificationMessage(highest)}
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  dismiss(highest.id);
                }}
                className="rounded border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--muted)]"
              >
                {t('dismiss')}
              </button>
              <Link
                href={`/${locale}/notifications`}
                className="rounded bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-black"
              >
                {t('reviewNow')}
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {announcement &&
      announcement.id !== dismissedAnnouncementId &&
      showAnnouncementDetails ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 text-[color:var(--foreground)] shadow-2xl">
            <p className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--muted)]">
              {t('announcementDetails')}
            </p>
            <h3 className="mt-2 text-xl font-semibold">{announcement.title}</h3>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              {announcement.message}
            </p>
            <p className="mt-4 text-xs text-[color:var(--muted)]">
              {announcement.severity} •{' '}
              {new Date(announcement.startsAt).toLocaleString()}
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAnnouncementDetails(false)}
                className="rounded border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--muted)]"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
