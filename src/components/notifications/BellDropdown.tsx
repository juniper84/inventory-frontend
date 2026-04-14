'use client';

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  BellOff,
  CheckCheck,
  Megaphone,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Spinner } from '@/components/Spinner';
import { useFormatDate } from '@/lib/business-context';
import {
  NotificationPriorityIcon,
  type NotificationPriority,
} from './NotificationPriorityIcon';
import { NotificationSseIndicator } from './NotificationSseIndicator';

export type BellItem = {
  id: string;
  title: string;
  message?: string | null;
  priority: string;
  status?: string;
  createdAt: string;
};

type Props = {
  items: BellItem[];
  unreadCount: number;
  announcementCount: number;
  viewAllHref: string;
  onClose: () => void;
  onMarkAllRead: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onItemClick: (item: BellItem) => void;
  onOpenAnnouncements: () => void;
};

// localStorage key for the "new since last open" divider cutoff
const LAST_OPENED_KEY = 'nvi.bell.lastOpenedAt';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

function normalizePriority(raw: string): NotificationPriority {
  const upper = raw?.toUpperCase();
  if (upper === 'SECURITY' || upper === 'ACTION_REQUIRED' || upper === 'WARNING' || upper === 'INFO') {
    return upper;
  }
  return 'INFO';
}

/**
 * Redesigned bell dropdown with:
 *  - Priority-colored left borders + icons (no more uniform gold-on-black)
 *  - Read/unread dot on each item
 *  - "Mark all as read" + manual refresh buttons in the header
 *  - "New since last open" divider — tracks last open time in localStorage
 *  - Empty state with icon + hint
 *  - Keyboard nav (↑/↓ + Enter to open, Escape to close)
 *  - Announcements section preserved (from Phase 6)
 *  - SSE connection dot in footer
 */
export const BellDropdown = forwardRef<HTMLDivElement, Props>(function BellDropdown(
  {
    items,
    unreadCount,
    announcementCount,
    viewAllHref,
    onClose,
    onMarkAllRead,
    onRefresh,
    onItemClick,
    onOpenAnnouncements,
  },
  ref,
) {
  const t = useTranslations('notifications');
  const shellT = useTranslations('platformShell'); // reuse SSE labels
  const { formatDateTime } = useFormatDate();

  const [focusIndex, setFocusIndex] = useState(-1);
  const [isMarking, setIsMarking] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Read the previous open timestamp (for the "new since last open" divider)
  const lastOpenedAtRef = useRef<number>(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(LAST_OPENED_KEY);
    lastOpenedAtRef.current = stored ? Number(stored) : 0;
    // Persist the new "last opened" = now when the dropdown is mounted
    window.localStorage.setItem(LAST_OPENED_KEY, String(Date.now()));
  }, []);

  // Split into "new since last open" vs "earlier"
  const { newItems, earlierItems } = useMemo(() => {
    const threshold = lastOpenedAtRef.current;
    const fresh: BellItem[] = [];
    const old: BellItem[] = [];
    for (const item of items) {
      const createdMs = new Date(item.createdAt).getTime();
      if (createdMs > threshold) {
        fresh.push(item);
      } else {
        old.push(item);
      }
    }
    return { newItems: fresh, earlierItems: old };
  }, [items]);

  // Flat indexed list for keyboard nav
  const flat = useMemo(() => [...newItems, ...earlierItems], [newItems, earlierItems]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (flat.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((i) => (i + 1) % flat.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((i) => (i <= 0 ? flat.length - 1 : i - 1));
      } else if (e.key === 'Enter' && focusIndex >= 0) {
        e.preventDefault();
        onItemClick(flat[focusIndex]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flat, focusIndex, onItemClick, onClose]);

  const handleMarkAll = async () => {
    if (unreadCount === 0 || isMarking) return;
    setIsMarking(true);
    try {
      await onMarkAllRead();
    } finally {
      setIsMarking(false);
    }
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderItem = (item: BellItem, index: number) => {
    const priority = normalizePriority(item.priority);
    const isUnread = item.status !== 'READ';
    const isFocused = focusIndex === index;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onItemClick(item)}
        onMouseEnter={() => setFocusIndex(index)}
        data-focus={isFocused}
        className={`nvi-bell-item nvi-notif-priority-${priority}`}
      >
        <NotificationPriorityIcon
          priority={priority}
          size={14}
          className="nvi-bell-item-icon"
        />
        <div className="nvi-bell-item-body">
          <div className="nvi-bell-item-row">
            <span className="nvi-bell-item-priority">{priority}</span>
            <span className="nvi-bell-item-time" title={formatDateTime(item.createdAt)}>
              {relativeTime(item.createdAt)}
            </span>
          </div>
          <div className="nvi-bell-item-title">{item.title}</div>
          {item.message && <div className="nvi-bell-item-message">{item.message}</div>}
        </div>
        {isUnread && <span className="nvi-bell-item-dot" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <div
      ref={ref}
      className="nvi-bell"
      role="menu"
      aria-label={t('bellDropdownLabel')}
    >
      {/* Header */}
      <div className="nvi-bell-header">
        <div className="nvi-bell-header-left">
          <span className="nvi-bell-title">{t('notificationsTitle')}</span>
          {unreadCount > 0 && <span className="nvi-bell-count">{unreadCount}</span>}
        </div>
        <div className="nvi-bell-header-actions">
          <button
            type="button"
            onClick={handleRefresh}
            className="nvi-bell-action-btn"
            aria-label={t('refreshAria')}
            title={t('refreshAria')}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Spinner size="xs" variant="dots" />
            ) : (
              <RefreshCw size={10} />
            )}
          </button>
          <button
            type="button"
            onClick={handleMarkAll}
            className="nvi-bell-action-btn"
            disabled={unreadCount === 0 || isMarking}
            title={t('markAllReadAria')}
          >
            {isMarking ? <Spinner size="xs" variant="dots" /> : <CheckCheck size={10} />}
            <span>{t('markAllRead')}</span>
          </button>
        </div>
      </div>

      {/* Announcements row (Phase 6 — preserved) */}
      {announcementCount > 0 && (
        <button
          type="button"
          onClick={() => {
            onOpenAnnouncements();
            onClose();
          }}
          className="nvi-bell-announce"
        >
          <span className="inline-flex items-center gap-2">
            <Megaphone size={13} />
            {t('bellAnnouncementsActive', { count: announcementCount })}
          </span>
          <span className="nvi-bell-announce-badge">{announcementCount}</span>
        </button>
      )}

      {/* List */}
      <div className="nvi-bell-list">
        {flat.length === 0 ? (
          <div className="nvi-bell-empty">
            <BellOff className="nvi-bell-empty-icon" />
            <p className="nvi-bell-empty-title">{t('bellEmptyTitle')}</p>
            <p className="nvi-bell-empty-hint">{t('bellEmptyHint')}</p>
          </div>
        ) : (
          <>
            {newItems.length > 0 && (
              <div className="nvi-bell-divider">
                <span>{t('bellNewSection')}</span>
              </div>
            )}
            {newItems.map((item, i) => renderItem(item, i))}
            {earlierItems.length > 0 && newItems.length > 0 && (
              <div className="nvi-bell-divider">
                <span>{t('bellEarlierSection')}</span>
              </div>
            )}
            {earlierItems.map((item, i) => renderItem(item, newItems.length + i))}
          </>
        )}
      </div>

      {/* Footer — SSE indicator + View all */}
      <div className="nvi-bell-footer">
        <NotificationSseIndicator
          labels={{
            connected: shellT('sseConnected'),
            reconnecting: shellT('sseReconnecting'),
            disconnected: shellT('sseDisconnected'),
          }}
        />
        <Link
          href={viewAllHref}
          onClick={onClose}
          className="nvi-bell-view-all inline-flex items-center gap-1"
        >
          {t('viewAll')}
          <ExternalLink size={10} />
        </Link>
      </div>
    </div>
  );
});
