'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthGate } from '@/components/AuthGate';
import { PlatformAuthGate } from '@/components/PlatformAuthGate';
import { BusinessSwitcher } from '@/components/BusinessSwitcher';
import { NotificationSurface } from '@/components/NotificationSurface';
import { LocalToastSurface } from '@/components/LocalToastSurface';
import { NavIcon } from '@/components/icons';
import { SmartSelect } from '@/components/SmartSelect';
import { NoAccessState } from '@/components/NoAccessState';
import { apiFetch } from '@/lib/api';
import {
  clearPlatformSession,
  clearSession,
  decodeJwt,
  getAccessToken,
  getPlatformAccessToken,
  getPlatformRefreshToken,
  getRefreshToken,
  getStoredUser,
} from '@/lib/auth';
import {
  getActiveBranch,
  setActiveBranch,
} from '@/lib/branch-context';
import { setStoredCurrency, setStoredTimezone, setStoredDateFormat } from '@/lib/business-context';
import {
  isBranchSelectorVisible,
} from '@/lib/branch-policy';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { Spinner } from '@/components/Spinner';
import { SupportChatWidget } from '@/components/support-chat/SupportChatWidget';
import { dispatchHelpCenterOpen } from '@/lib/support-chat-handoff';
import {
  clearOfflineData,
  rotateOfflineKey,
  getOfflineFlag,
  getPendingCount,
  onQueueUpdated,
  setOfflineFlag,
} from '@/lib/offline-store';
import { recordOfflineStatus, syncOfflineQueue } from '@/lib/offline-sync';

const AUTH_PATHS = ['/login', '/signup', '/invite', '/verify-email', '/password-reset'];
type Branch = { id: string; name: string };
type AppViewMode = 'auto' | 'desktop' | 'compact';
type BellNotification = {
  id: string;
  title: string;
  message?: string | null;
  priority: string;
  status?: string;
  createdAt: string;
};
const APP_VIEW_MODE_KEY = 'nvi.app.viewMode';

const NAV_VISIBILITY_POLICY: Record<string, 'hide' | 'disabled'> = {
  'reports.read': 'disabled',
  'business.read': 'disabled',
  'settings.read': 'disabled',
  'users.read': 'disabled',
  'roles.read': 'disabled',
  'catalog.read': 'disabled',
  'customers.read': 'disabled',
  'price-lists.manage': 'disabled',
  'stock.read': 'disabled',
  'stock.write': 'disabled',
  'transfers.read': 'disabled',
  'sales.write': 'disabled',
  'sales.read': 'disabled',
  'shifts.open': 'disabled',
  'suppliers.read': 'disabled',
  'purchases.read': 'disabled',
  'purchases.write': 'disabled',
  'attachments.write': 'disabled',
  'expenses.read': 'disabled',
  'exports.write': 'disabled',
  'search.read': 'disabled',
  'audit.read': 'disabled',
  'notifications.read': 'disabled',
  'notes.read': 'disabled',
  'approvals.read': 'disabled',
  'offline.read': 'disabled',
};

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const IDLE_TIMEOUT_MINUTES = parsePositiveInt(
  process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES,
  30,
);
const IDLE_WARNING_SECONDS = parsePositiveInt(
  process.env.NEXT_PUBLIC_IDLE_WARNING_SECONDS,
  60,
);
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;
const IDLE_WARNING_MS = Math.min(
  IDLE_TIMEOUT_MS - 1000,
  Math.max(10000, IDLE_WARNING_SECONDS * 1000),
);

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('common');
  const authT = useTranslations('auth');
  const navT = useTranslations('nav');
  const sectionT = useTranslations('navSections');
  const shellT = useTranslations('appShell');
  const paletteT = useTranslations('palette');
  const actionsT = useTranslations('actions');
  const isAuthRoute = AUTH_PATHS.some((segment) => pathname.includes(segment));
  const isPlatformRoute = pathname.includes('/platform');
  const locale = pathname.split('/')[1] || 'en';
  const base = `/${locale}`;
  const showBranchSelector = !isPlatformRoute && isBranchSelectorVisible(pathname);
  const token = typeof window !== 'undefined' ? getAccessToken() : null;
  const platformToken =
    typeof window !== 'undefined' ? getPlatformAccessToken() : null;
  const payload = token
    ? decodeJwt<{ permissions?: string[]; scope?: string }>(token)
    : null;
  const permissions = new Set(payload?.permissions ?? []);
  const isSupportView = payload?.scope === 'support';
  const refreshToken = typeof window !== 'undefined' ? getRefreshToken() : null;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [viewMode, setViewMode] = useState<AppViewMode>('auto');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const storedUser = typeof window !== 'undefined' ? getStoredUser() : null;
  const userInitials = storedUser?.name
    ? storedUser.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState('');
  const [notificationCount, setNotificationCount] = useState(0);
  const [approvalCount, setApprovalCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [bellItems, setBellItems] = useState<BellNotification[]>([]);
  const bellRef = useRef<HTMLDivElement>(null);
  const [readOnlyState, setReadOnlyState] = useState<{
    enabled: boolean;
    reason: string | null;
  } | null>(null);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [offlineState, setOfflineState] = useState<{
    isOffline: boolean;
    offlineSince: string | null;
    pendingCount: number;
    syncBlocked: boolean;
  }>({
    isOffline: false,
    offlineSince: null,
    pendingCount: 0,
    syncBlocked: false,
  });
  const [ticker, setTicker] = useState(0);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const paletteInputRef = useRef<HTMLInputElement | null>(null);
  const lastActivityRef = useRef(0);
  const idleLogoutTriggeredRef = useRef(false);
  const isReadOnly = readOnlyState?.enabled ?? false;
  const canForceOnboarding = permissions.has('settings.write');
  const [idleCountdownSeconds, setIdleCountdownSeconds] = useState<
    number | null
  >(null);
  const isPlatformLoginRoute = pathname.includes('/platform/login');
  const idleTimerEnabled = isPlatformRoute
    ? Boolean(platformToken) && !isPlatformLoginRoute
    : Boolean(token) && !isAuthRoute;
  const forceDesktopShell = viewMode === 'desktop';
  const forceCompactShell = viewMode === 'compact';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(APP_VIEW_MODE_KEY);
    if (
      stored === 'auto' ||
      stored === 'desktop' ||
      stored === 'compact'
    ) {
      setViewMode(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(APP_VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    setIdleCountdownSeconds(null);
    if (isPlatformRoute) {
      const platformRefreshToken = getPlatformRefreshToken();
      if (platformToken && platformRefreshToken) {
        try {
          await apiFetch('/platform/auth/logout', {
            method: 'POST',
            token: platformToken,
            body: JSON.stringify({ refreshToken: platformRefreshToken }),
          });
        } catch (err) {
          console.warn('Platform server logout failed', err);
        }
      }
      clearPlatformSession();
      router.replace(`/${pathname.split('/')[1]}/platform/login`);
      return;
    }
    if (token && refreshToken) {
      try {
        await apiFetch('/auth/logout', {
          method: 'POST',
          token,
          body: JSON.stringify({ refreshToken }),
        });
      } catch (err) {
        console.warn('Server logout failed', err);
        // Best-effort logout on the server.
      }
    }
    await rotateOfflineKey();
    await clearOfflineData();
    clearSession();
    router.replace(`/${locale}/login`);
  }, [
    isLoggingOut,
    isPlatformRoute,
    locale,
    pathname,
    refreshToken,
    router,
    token,
  ]);

  const markActivity = useCallback(() => {
    if (!idleTimerEnabled || isLoggingOut) {
      return;
    }
    lastActivityRef.current = Date.now();
    idleLogoutTriggeredRef.current = false;
    setIdleCountdownSeconds((current) => (current === null ? current : null));
  }, [idleTimerEnabled, isLoggingOut]);

  useEffect(() => {
    if (!token || isPlatformRoute) {
      setTimeout(() => setReadOnlyState(null), 0);
      setTimeout(() => setOnboardingRequired(false), 0);
      return;
    }
    let active = true;
    apiFetch<{
      readOnlyEnabled?: boolean;
      readOnlyReason?: string | null;
      localeSettings?: { currency?: string; timezone?: string; dateFormat?: string };
      onboarding?: {
        enabled?: boolean;
        enforced?: boolean;
        businessProfileComplete?: boolean;
        branchSetupComplete?: boolean;
      };
    }>('/settings', { token })
      .then((settings) => {
        if (!active) {
          return;
        }
        if (settings.localeSettings?.currency) {
          setStoredCurrency(settings.localeSettings.currency);
        }
        if (settings.localeSettings?.timezone) {
          setStoredTimezone(settings.localeSettings.timezone);
        }
        if (settings.localeSettings?.dateFormat) {
          setStoredDateFormat(settings.localeSettings.dateFormat);
        }
        setReadOnlyState({
          enabled: Boolean(settings.readOnlyEnabled),
          reason: settings.readOnlyReason ?? null,
        });
        const required = Boolean(
          settings.onboarding?.enabled === true &&
            settings.onboarding?.enforced === true &&
            (!settings.onboarding.businessProfileComplete ||
              !settings.onboarding.branchSetupComplete),
        );
        setOnboardingRequired(required);
        if (
          required &&
          canForceOnboarding &&
          !pathname.startsWith(`${base}/onboarding`) &&
          !isAuthRoute
        ) {
          router.replace(`${base}/onboarding`);
        }
      })
      .catch(() => {
        if (active) {
          setReadOnlyState(null);
          setOnboardingRequired(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token, isPlatformRoute, pathname, base, isAuthRoute, router, canForceOnboarding]);

  useEffect(() => {
    if (!token || isPlatformRoute) {
      setTimeout(() => {
        setBranches([]);
        setActiveBranchId('');
      }, 0);
      return;
    }
    let active = true;
    apiFetch<{ items: Branch[] } | Branch[]>('/branches?limit=200', { token })
      .then((data) => {
        if (!active) {
          return;
        }
        const items = Array.isArray(data) ? data : data.items;
        setBranches(items);
        const stored = getActiveBranch();
        const selected =
          stored && items.some((branch) => branch.id === stored.id)
            ? stored.id
            : items[0]?.id ?? '';
        setActiveBranchId(selected);
        const selectedBranch = items.find((branch) => branch.id === selected);
        if (selectedBranch) {
          setActiveBranch({
            id: selectedBranch.id,
            name: selectedBranch.name,
          });
        }
      })
      .catch(() => {
        if (active) {
          setBranches([]);
          setActiveBranchId('');
        }
      });
    return () => {
      active = false;
    };
  }, [token, isPlatformRoute]);

  useEffect(() => {
    if (!idleTimerEnabled || isLoggingOut) {
      setIdleCountdownSeconds(null);
      return;
    }
    lastActivityRef.current = Date.now();
    idleLogoutTriggeredRef.current = false;
    let lastHandledAt = 0;
    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'touchstart',
      'scroll',
      'mousemove',
    ];
    const onActivity = () => {
      const now = Date.now();
      if (now - lastHandledAt < 1000) {
        return;
      }
      lastHandledAt = now;
      markActivity();
    };
    events.forEach((eventName) =>
      window.addEventListener(eventName, onActivity, { passive: true }),
    );
    return () => {
      events.forEach((eventName) =>
        window.removeEventListener(eventName, onActivity),
      );
    };
  }, [idleTimerEnabled, isLoggingOut, markActivity]);

  useEffect(() => {
    if (!idleTimerEnabled || isLoggingOut) {
      setIdleCountdownSeconds(null);
      return;
    }
    const tick = () => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = IDLE_TIMEOUT_MS - elapsed;
      if (remaining <= 0) {
        setIdleCountdownSeconds(0);
        if (!idleLogoutTriggeredRef.current) {
          idleLogoutTriggeredRef.current = true;
          void handleLogout();
        }
        return;
      }
      if (remaining <= IDLE_WARNING_MS) {
        setIdleCountdownSeconds(Math.ceil(remaining / 1000));
        return;
      }
      setIdleCountdownSeconds((current) => (current === null ? current : null));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [handleLogout, idleTimerEnabled, isLoggingOut]);

  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const scheduleRetry = (delayMs: number, attemptSync: () => void) => {
    clearRetryTimer();
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      attemptSync();
    }, delayMs);
  };

  useEffect(() => {
    const syncState = async () => {
      const isOffline = !navigator.onLine;
      const offlineSince = await getOfflineFlag('offlineSince');
      const syncBlocked = (await getOfflineFlag('syncBlocked')) === 'true';
      const pendingCount = await getPendingCount();
      setOfflineState({
        isOffline,
        offlineSince: isOffline ? offlineSince : null,
        pendingCount,
        syncBlocked,
      });
      if (!isOffline && pendingCount > 0) {
        attemptSync();
      }
    };
    const attemptSync = async () => {
      if (!navigator.onLine) {
        return;
      }
      const pendingCount = await getPendingCount();
      if (pendingCount === 0) {
        retryAttemptRef.current = 0;
        setOfflineState((prev) => ({ ...prev, pendingCount, syncBlocked: false }));
        return;
      }
      try {
        await syncOfflineQueue();
        const nextPending = await getPendingCount();
        retryAttemptRef.current = 0;
        await setOfflineFlag('syncBlocked', 'false');
        setOfflineState((prev) => ({ ...prev, pendingCount: nextPending, syncBlocked: false }));
      } catch (err) {
        console.warn('Offline sync failed', err);
        retryAttemptRef.current += 1;
        const delay = Math.min(300000, 1000 * 2 ** (retryAttemptRef.current - 1));
        await setOfflineFlag('syncBlocked', 'true');
        setOfflineState((prev) => ({ ...prev, syncBlocked: true }));
        scheduleRetry(delay, attemptSync);
      }
    };
    syncState();
    const handleOnline = async () => {
      await setOfflineFlag('offlineSince', '');
      setOfflineState((prev) => ({ ...prev, isOffline: false, offlineSince: null }));
      void recordOfflineStatus('ONLINE');
      attemptSync();
    };
    const handleOffline = async () => {
      const since = new Date().toISOString();
      await setOfflineFlag('offlineSince', since);
      setOfflineState((prev) => ({ ...prev, isOffline: true, offlineSince: since }));
      void recordOfflineStatus('OFFLINE', since);
      clearRetryTimer();
    };
    const unsubscribe = onQueueUpdated((count) => {
      setOfflineState((prev) => ({ ...prev, pendingCount: count }));
    });
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
      clearRetryTimer();
    };
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => setTicker(Date.now()), 0);
    const interval = window.setInterval(() => setTicker(Date.now()), 60000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setTicker(Date.now());
    window.addEventListener('nvi-session-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('nvi-session-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
        setTimeout(() => paletteInputRef.current?.focus(), 0);
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
    setMobileControlsOpen(false);
  }, [pathname]);

  const offlineDuration = useMemo(() => {
    if (!offlineState.isOffline || !offlineState.offlineSince) {
      return null;
    }
    const start = new Date(offlineState.offlineSince).getTime();
    const diffMinutes = Math.max(0, Math.floor((ticker - start) / 60000));
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
  }, [offlineState.isOffline, offlineState.offlineSince, ticker]);

  const handleManualSync = async () => {
    if (offlineState.isOffline) {
      return;
    }
    try {
      await syncOfflineQueue();
      const pendingCount = await getPendingCount();
      retryAttemptRef.current = 0;
      clearRetryTimer();
      setOfflineState((prev) => ({
        ...prev,
        pendingCount,
        syncBlocked: false,
      }));
    } catch (err) {
      console.warn('Manual sync failed', err);
      await setOfflineFlag('syncBlocked', 'true');
      setOfflineState((prev) => ({ ...prev, syncBlocked: true }));
    }
  };

  const navSections = useMemo(() => [
    {
      title: sectionT('command'),
      items: [
        {
          href: `${base}/`,
          label: navT('dashboard'),
          permission: 'reports.read',
          icon: 'dashboard' as const,
        },
      ],
    },
    {
      title: sectionT('core'),
      items: [
        {
          href: `${base}/settings/business`,
          label: navT('businessSettings'),
          permission: 'business.read',
          icon: 'settings' as const,
        },
        {
          href: `${base}/settings/branches`,
          label: navT('branches'),
          permission: 'settings.read',
          icon: 'building' as const,
        },
        {
          href: `${base}/settings/users`,
          label: navT('users'),
          permission: 'users.read',
          icon: 'users' as const,
        },
        {
          href: `${base}/settings/roles`,
          label: navT('roles'),
          permission: 'roles.read',
          icon: 'shield' as const,
        },
        {
          href: `${base}/settings/profile`,
          label: navT('profile'),
          permission: 'business.read',
          icon: 'users' as const,
        },
      ],
    },
    {
      title: sectionT('catalog'),
      items: [
        {
          href: `${base}/catalog/categories`,
          label: navT('categories'),
          permission: 'catalog.read',
          icon: 'tag' as const,
        },
        {
          href: `${base}/catalog/products`,
          label: navT('products'),
          permission: 'catalog.read',
          icon: 'cube' as const,
        },
        {
          href: `${base}/catalog/variants`,
          label: navT('variants'),
          permission: 'catalog.read',
          icon: 'layers' as const,
        },
        {
          href: `${base}/customers`,
          label: navT('customers'),
          permission: 'customers.read',
          icon: 'users' as const,
        },
        {
          href: `${base}/price-lists`,
          label: navT('priceLists'),
          permission: 'price-lists.manage',
          icon: 'tag' as const,
        },
      ],
    },
    {
      title: sectionT('stock'),
      items: [
        {
          href: `${base}/stock`,
          label: navT('stockOnHand'),
          permission: 'stock.read',
          icon: 'stock' as const,
        },
        {
          href: `${base}/stock/movements`,
          label: navT('stockMovements'),
          permission: 'stock.read',
          icon: 'move' as const,
        },
        {
          href: `${base}/stock/adjustments`,
          label: navT('stockAdjustments'),
          permission: 'stock.write',
          icon: 'stock' as const,
        },
        {
          href: `${base}/stock/counts`,
          label: navT('stockCounts'),
          permission: 'stock.write',
          icon: 'stock' as const,
        },
        {
          href: `${base}/transfers`,
          label: navT('transfers'),
          permission: 'transfers.read',
          icon: 'move' as const,
        },
      ],
    },
    {
      title: sectionT('sales'),
      items: [
        {
          href: `${base}/pos`,
          label: navT('pos'),
          permission: 'sales.write',
          icon: 'cart' as const,
        },
        {
          href: `${base}/receipts`,
          label: navT('receipts'),
          permission: 'sales.read',
          icon: 'receipt' as const,
        },
        {
          href: `${base}/shifts`,
          label: navT('shifts'),
          permission: 'shifts.open',
          icon: 'clock' as const,
        },
      ],
    },
    {
      title: sectionT('purchases'),
      items: [
        {
          href: `${base}/suppliers`,
          label: navT('suppliers'),
          permission: 'suppliers.read',
          icon: 'truck' as const,
        },
        {
          href: `${base}/purchases`,
          label: navT('purchases'),
          permission: 'purchases.read',
          icon: 'file' as const,
        },
        {
          href: `${base}/purchase-orders`,
          label: navT('purchaseOrders'),
          permission: 'purchases.read',
          icon: 'file' as const,
        },
        {
          href: `${base}/receiving`,
          label: navT('receiving'),
          permission: 'purchases.write',
          icon: 'truck' as const,
        },
        {
          href: `${base}/supplier-returns`,
          label: navT('supplierReturns'),
          permission: 'purchases.read',
          icon: 'truck' as const,
        },
        {
          href: `${base}/attachments`,
          label: navT('attachments'),
          permission: 'attachments.write',
          icon: 'file' as const,
        },
      ],
    },
    {
      title: sectionT('insights'),
      items: [
        {
          href: `${base}/reports`,
          label: navT('reports'),
          permission: 'reports.read',
          icon: 'chart' as const,
        },
        {
          href: `${base}/expenses`,
          label: navT('expenses'),
          permission: 'expenses.read',
          icon: 'receipt' as const,
        },
        {
          href: `${base}/exports`,
          label: navT('exports'),
          permission: 'exports.write',
          icon: 'file' as const,
        },
        {
          href: `${base}/search`,
          label: navT('search'),
          permission: 'search.read',
          icon: 'search' as const,
        },
      ],
    },
    {
      title: sectionT('system'),
      items: [
        {
          href: `${base}/audit-logs`,
          label: navT('auditLogs'),
          permission: 'audit.read',
          icon: 'shield' as const,
        },
        {
          href: `${base}/notifications`,
          label: navT('notifications'),
          permission: 'notifications.read',
          icon: 'bell' as const,
        },
        {
          href: `${base}/notes`,
          label: navT('notes'),
          permission: 'notes.read',
          icon: 'file' as const,
        },
        {
          href: `${base}/approvals`,
          label: navT('approvals'),
          permission: 'approvals.read',
          icon: 'check' as const,
        },
        {
          href: `${base}/offline`,
          label: navT('offline'),
          permission: 'offline.read',
          icon: 'offline' as const,
        },
      ],
    },
  ], [base, navT, sectionT]);

  const visibleNavSections = useMemo(
    () =>
      navSections
        .map((section) => {
          const items = section.items
            .map((item) => {
              const allowed = permissions.has(item.permission);
              const visibility = NAV_VISIBILITY_POLICY[item.permission] ?? 'hide';
              if (!allowed && visibility === 'hide') {
                return null;
              }
              return { ...item, disabled: !allowed };
            })
            .filter(Boolean) as Array<
            (typeof section.items)[number] & { disabled: boolean }
          >;
          return { ...section, items };
        })
        .filter((section) => section.items.length > 0),
    [navSections, permissions],
  );

  const navItems = useMemo(
    () =>
      visibleNavSections.flatMap((section) =>
        section.items
          .filter((item) => !item.disabled)
          .map((item) => ({ ...item, group: section.title })),
      ),
    [visibleNavSections],
  );

  const routePermissions = useMemo(() => {
    const extras = [
      {
        prefix: `${base}/catalog/products/wizard`,
        permission: 'catalog.write',
      },
    ];
    const navRoutes = navSections.flatMap((section) =>
      section.items.map((item) => ({
        prefix: item.href,
        permission: item.permission,
      })),
    );
    return [...extras, ...navRoutes];
  }, [base, navSections]);

  const activeRoutePermission = useMemo(() => {
    const match = routePermissions.find((item) => {
      if (pathname === item.prefix) {
        return true;
      }
      return pathname.startsWith(`${item.prefix}/`);
    });
    return match ?? null;
  }, [pathname, routePermissions]);

  const missingPermission =
    activeRoutePermission &&
    !permissions.has(activeRoutePermission.permission);

  const getBadgeForHref = useCallback(
    (href: string) => {
      if (href.endsWith('/notifications')) {
        return notificationCount;
      }
      if (href.endsWith('/approvals')) {
        return approvalCount;
      }
      if (href.endsWith('/offline')) {
        return offlineState.pendingCount;
      }
      return 0;
    },
    [approvalCount, notificationCount, offlineState.pendingCount],
  );

  const quickNavItems = useMemo(
    () =>
      [
        navItems.find((item) => item.href === `${base}/`),
        navItems.find((item) => item.href === `${base}/pos`),
        navItems.find((item) => item.href === `${base}/stock`),
        navItems.find((item) => item.href === `${base}/notifications`),
      ].filter(Boolean) as Array<(typeof navItems)[number]>,
    [base, navItems],
  );

  const paletteActions = useMemo(
    () => [
      {
        id: 'create-product',
        label: paletteT('createProductWizard'),
        group: paletteT('groupCreate'),
        href: `${base}/catalog/products/wizard`,
      },
      {
        id: 'create-variant',
        label: paletteT('createVariant'),
        group: paletteT('groupCreate'),
        href: `${base}/catalog/variants?create=1`,
      },
      {
        id: 'create-transfer',
        label: paletteT('createTransfer'),
        group: paletteT('groupCreate'),
        href: `${base}/transfers?create=1`,
      },
      {
        id: 'create-expense',
        label: paletteT('createExpense'),
        group: paletteT('groupCreate'),
        href: `${base}/expenses`,
      },
      {
        id: 'create-po',
        label: paletteT('createPurchaseOrder'),
        group: paletteT('groupCreate'),
        href: `${base}/purchase-orders?create=1`,
      },
      {
        id: 'create-receiving',
        label: paletteT('receiveStock'),
        group: paletteT('groupCreate'),
        href: `${base}/receiving`,
      },
      {
        id: 'create-sale',
        label: paletteT('newSale'),
        group: paletteT('groupCreate'),
        href: `${base}/pos`,
      },
      {
        id: 'jump-dashboard',
        label: paletteT('jumpDashboard'),
        group: paletteT('groupJump'),
        href: `${base}`,
      },
      {
        id: 'jump-reports',
        label: paletteT('jumpReports'),
        group: paletteT('groupJump'),
        href: `${base}/reports`,
      },
      {
        id: 'jump-audit',
        label: paletteT('jumpAuditLogs'),
        group: paletteT('groupJump'),
        href: `${base}/audit-logs`,
      },
    ],
    [base, paletteT],
  );

  const paletteItems = useMemo(() => {
    const query = paletteQuery.toLowerCase();
    const nav = navItems.map((item) => ({ ...item, kind: 'nav' as const }));
    const actions = paletteActions.map((item) => ({
      ...item,
      kind: 'action' as const,
    }));
    return [...nav, ...actions].filter((item) =>
      `${item.label} ${item.group}`.toLowerCase().includes(query),
    );
  }, [navItems, paletteActions, paletteQuery]);

  useEffect(() => {
    if (!token || isPlatformRoute) {
      setTimeout(() => {
        setNotificationCount(0);
        setApprovalCount(0);
      }, 0);
      return;
    }
    let active = true;
    const loadBadges = async () => {
      try {
        const [notifications, approvals] = await Promise.all([
          apiFetch<PaginatedResponse<{ status?: string }> | { status?: string }[]>(
            '/notifications?limit=30',
            { token },
          ),
          apiFetch<PaginatedResponse<{ status?: string }> | { status?: string }[]>(
            '/approvals?status=PENDING&limit=30',
            { token },
          ),
        ]);
        if (!active) {
          return;
        }
        const notifItems = normalizePaginated(notifications).items;
        const approvalItems = normalizePaginated(approvals).items;
        const unread = notifItems.filter((item) => item.status && item.status !== 'READ');
        setNotificationCount(unread.length);
        setBellItems((unread as BellNotification[]).slice(0, 5));
        setApprovalCount(approvalItems.length);
      } catch (err) {
        console.warn('Failed to load shell badge counts', err);
        if (active) {
          setNotificationCount(0);
          setApprovalCount(0);
        }
      }
    };
    loadBadges();
    const timer = window.setInterval(loadBadges, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token, isPlatformRoute]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const mainContent = missingPermission ? (
    <NoAccessState
      permission={activeRoutePermission?.permission ?? 'unknown'}
      path={pathname}
    />
  ) : (
    children
  );

  if (isPlatformRoute) {
    if (isPlatformLoginRoute) {
      return <>{children}</>;
    }
    return (
      <PlatformAuthGate>
        <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
          {!isLoggingOut && idleCountdownSeconds !== null ? (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
              <div className="w-full max-w-md space-y-3 rounded-2xl border border-gold-600/40 bg-black/90 p-6 text-gold-100 shadow-[0_30px_120px_rgba(0,0,0,0.6)]">
                <h3 className="text-lg font-semibold">
                  {shellT('sessionExpiringTitle')}
                </h3>
                <p className="text-sm text-gold-300">
                  {shellT('sessionExpiringDesc', { seconds: idleCountdownSeconds })}
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={markActivity}
                    className="rounded border border-gold-700/50 px-3 py-2 text-sm text-gold-100"
                  >
                    {shellT('staySignedIn')}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black"
                  >
                    {shellT('logoutNow')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <header className="flex items-center justify-between border-b border-gold-700/40 px-6 py-4">
            <h1 className="text-lg font-semibold text-gold-100">
              {t('brand')} {navT('platform')}
            </h1>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
            >
              {actionsT('logout')}
            </button>
          </header>
          <main className="px-6 py-6">{children}</main>
        </div>
      </PlatformAuthGate>
    );
  }

  if (isAuthRoute) {
    return (
      <div className="auth-lux-root">
        <div className="auth-lux-wrap">
          <section className="auth-lux-hero nvi-reveal">
            <div className="auth-lux-brand">
              <div className="auth-lux-logo" aria-hidden />
              <div>
                <h1>{t('brand')}</h1>
                <small>{authT('premiumInventoryControl')}</small>
              </div>
            </div>

            <h2>{authT('secureAccessTitle')}</h2>
            <p>{authT('secureAccessSubtitle')}</p>

            <div className="auth-lux-feature-grid">
              <article className="auth-lux-feature">
                <div className="auth-lux-feature-glyph">B</div>
                <h3>{authT('branchReadyTitle')}</h3>
                <p>{authT('branchReadySubtitle')}</p>
              </article>
              <article className="auth-lux-feature">
                <div className="auth-lux-feature-glyph">S</div>
                <h3>{authT('fastProductSetupTitle')}</h3>
                <p>{authT('fastProductSetupSubtitle')}</p>
              </article>
              <article className="auth-lux-feature">
                <div className="auth-lux-feature-glyph">$</div>
                <h3>{authT('financeSnapshotsTitle')}</h3>
                <p>{authT('financeSnapshotsSubtitle')}</p>
              </article>
              <article className="auth-lux-feature">
                <div className="auth-lux-feature-glyph">?</div>
                <h3>{authT('builtinHelpTitle')}</h3>
                <p>{authT('builtinHelpSubtitle')}</p>
              </article>
            </div>

            <div className="auth-lux-tags">
              <span className="auth-lux-tag">{authT('encryptedSessions')}</span>
              <span className="auth-lux-tag">{authT('roleBasedAccess')}</span>
              <span className="auth-lux-tag">{authT('auditFriendlyActions')}</span>
            </div>

            <div className="auth-lux-status">
              <span className="auth-lux-status-dot" aria-hidden />
              <span>{authT('systemStatusValue')}</span>
            </div>
          </section>

          <section className="auth-lux-card nvi-reveal">
            {children}
          </section>
        </div>
      </div>
    );
  }

  if (onboardingRequired && pathname.startsWith(`${base}/onboarding`)) {
    return (
      <AuthGate>
        <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
          <NotificationSurface locale={locale} />
          <LocalToastSurface />
          <main className="px-6 py-10">{children}</main>
          <SupportChatWidget />
        </div>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
        {isLoggingOut ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-gold-600/40 bg-black/80 px-8 py-10 text-center text-gold-100 shadow-[0_30px_120px_rgba(0,0,0,0.6)]">
              <Spinner variant="orbit" size="md" className="scale-150" />
              <div className="space-y-1">
                <p className="text-lg font-semibold">{shellT('loggingOut')}</p>
              </div>
            </div>
          </div>
        ) : null}
        {!isLoggingOut && idleCountdownSeconds !== null ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md space-y-3 rounded-2xl border border-gold-600/40 bg-black/90 p-6 text-gold-100 shadow-[0_30px_120px_rgba(0,0,0,0.6)]">
              <h3 className="text-lg font-semibold">
                {shellT('sessionExpiringTitle')}
              </h3>
              <p className="text-sm text-gold-300">
                {shellT('sessionExpiringDesc', { seconds: idleCountdownSeconds })}
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={markActivity}
                  className="rounded border border-gold-700/50 px-3 py-2 text-sm text-gold-100"
                >
                  {shellT('staySignedIn')}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black"
                >
                  {shellT('logoutNow')}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {offlineState.isOffline || offlineState.syncBlocked ? (
          <div className="border-b border-red-500/40 bg-red-950/70 px-6 py-2 text-xs text-red-100 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {shellT('offlineActive')}
                {offlineDuration ? ` (${offlineDuration})` : ''}
              </span>
              <div className="flex items-center gap-3">
                <span>
                  {shellT('pendingSync')}: {offlineState.pendingCount}
                </span>
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={offlineState.isOffline}
                  className="rounded border border-red-700/60 px-2 py-1 text-[10px] text-red-100 disabled:opacity-60"
                >
                  {shellT('syncNow')}
                </button>
                {offlineState.syncBlocked ? (
                  <span className="text-red-300">{shellT('syncBlocked')}</span>
                ) : (
                  <span className="text-red-200">{shellT('syncHint')}</span>
                )}
              </div>
            </div>
          </div>
        ) : null}
        {isReadOnly ? (
          <div className="readonly-banner px-6 py-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/70">
                  {shellT('readOnlyMode')}
                </p>
                <p className="text-sm text-white">
                  {shellT('readOnlyDesc')}{' '}
                  {readOnlyState?.reason
                    ? `${shellT('readOnlyReason')}: ${readOnlyState.reason}`
                    : null}
                </p>
              </div>
              <span className="rounded-full border border-white/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80">
                {shellT('viewOnly')}
              </span>
            </div>
          </div>
        ) : null}
        {isSupportView ? (
          <div className="support-banner px-6 py-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/70">
                  {shellT('supportView')}
                </p>
                <p className="text-sm text-white">
                  {shellT('supportDesc')}
                </p>
              </div>
              <span className="rounded-full border border-white/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80">
                {shellT('readOnlyBadge')}
              </span>
            </div>
          </div>
        ) : null}
        <NotificationSurface locale={locale} />
        <LocalToastSurface />
        <header className="topbar-header sticky top-0 z-30 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen((prev) => !prev)}
                className={`rounded border border-gold-800/40 bg-transparent px-2 py-1 text-xs text-gold-300 transition hover:border-gold-600/60 hover:text-gold-200 ${
                  forceDesktopShell
                    ? 'hidden'
                    : forceCompactShell
                      ? 'inline-flex'
                      : 'md:hidden'
                }`}
              >
                ☰
              </button>
              <h1 className="topbar-brand text-sm sm:text-base">
                {t('brand')}
              </h1>
              {isReadOnly ? (
                <span className="hidden items-center gap-2 rounded-full border border-red-500/40 bg-red-950/60 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-red-100 sm:inline-flex">
                  🔒 {shellT('readOnlyBadge')}
                </span>
              ) : null}
            </div>
            <div
              className={`flex items-center gap-2 ${
                forceDesktopShell
                  ? 'hidden'
                  : forceCompactShell
                    ? 'flex'
                    : 'md:hidden'
              }`}
            >
              <Link href={`${base}/pos`} className="topbar-pos-btn">
                POS
              </Link>
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="topbar-icon-btn"
              >
                ⌘K
              </button>
              <Link
                href={`${base}/notifications`}
                className="topbar-icon-btn relative"
                aria-label={shellT('notifications')}
              >
                🔔
                {notificationCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold-500 text-[9px] font-bold text-black">
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                ) : null}
              </Link>
              <button
                type="button"
                onClick={() => setMobileControlsOpen((prev) => !prev)}
                className="topbar-avatar-btn"
                title={storedUser?.name ?? 'Account'}
              >
                {userInitials}
              </button>
            </div>
            <div
              className={`items-center gap-2 text-sm ${
                forceCompactShell
                  ? 'hidden'
                  : forceDesktopShell
                    ? 'flex'
                    : 'hidden md:flex'
              }`}
            >
              <BusinessSwitcher />
              {showBranchSelector ? (
                <SmartSelect
                  instanceId="branch-select"
                  value={activeBranchId}
                  options={branches.map((branch) => ({
                    value: branch.id,
                    label: branch.name,
                  }))}
                  placeholder={shellT('selectBranch')}
                  onChange={(nextId) => {
                    setActiveBranchId(nextId);
                    const selected = branches.find((branch) => branch.id === nextId);
                    if (selected) {
                      setActiveBranch({ id: selected.id, name: selected.name });
                    }
                  }}
                  className="min-w-[140px] lg:min-w-[170px] text-xs"
                />
              ) : null}

              <Link href={`${base}/pos`} className="topbar-pos-btn">
                POS
              </Link>

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="topbar-icon-btn"
                title="Command palette"
              >
                ⌘K
              </button>

              <button
                type="button"
                onClick={() => dispatchHelpCenterOpen({ tab: 'manual' })}
                className="topbar-icon-btn"
                title="Help"
              >
                ?
              </button>

              <div className="relative" ref={bellRef}>
                <button
                  type="button"
                  onClick={() => setBellOpen((prev) => !prev)}
                  className="topbar-icon-btn relative"
                  title={shellT('notifications')}
                  aria-label={shellT('notifications')}
                >
                  🔔
                  {notificationCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold-500 text-[9px] font-bold text-black">
                      {notificationCount > 9 ? '9+' : notificationCount}
                    </span>
                  ) : null}
                </button>
                {bellOpen ? (
                  <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-gold-700/40 bg-black shadow-2xl">
                    <div className="flex items-center justify-between border-b border-gold-700/30 px-4 py-2">
                      <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">
                        {shellT('notifications')}
                      </p>
                      {notificationCount > 0 ? (
                        <span className="rounded-full bg-gold-500/20 px-2 py-0.5 text-[10px] font-semibold text-gold-300">
                          {notificationCount}
                        </span>
                      ) : null}
                    </div>
                    {bellItems.length === 0 ? (
                      <p className="px-4 py-5 text-center text-xs text-gold-500">
                        {shellT('noNotifications')}
                      </p>
                    ) : (
                      <ul>
                        {bellItems.map((item) => (
                          <li
                            key={item.id}
                            className="border-b border-gold-700/20 px-4 py-3 last:border-0"
                          >
                            <p className="text-[9px] uppercase tracking-[0.2em] text-gold-500">
                              {item.priority}
                            </p>
                            <p className="mt-0.5 text-xs font-semibold text-gold-100">
                              {item.title}
                            </p>
                            {item.message ? (
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-gold-400">
                                {item.message}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="border-t border-gold-700/30 px-4 py-2">
                      <Link
                        href={`${base}/notifications`}
                        onClick={() => setBellOpen(false)}
                        className="text-xs text-gold-400 hover:text-gold-200"
                      >
                        {shellT('viewAllNotifications')} →
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  className="topbar-avatar-btn"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  title={storedUser?.name ?? 'Account'}
                >
                  {userInitials}
                </button>
                {userMenuOpen && (
                  <div className="topbar-user-menu">
                    <div className="topbar-user-menu__header">
                      <div className="topbar-user-menu__header-avatar">
                        {userInitials}
                      </div>
                      <div className="topbar-user-menu__header-text">
                        <p className="topbar-user-menu__header-name">{storedUser?.name ?? 'User'}</p>
                        <p className="topbar-user-menu__header-email">{storedUser?.email ?? ''}</p>
                      </div>
                    </div>
                    <div className="topbar-user-menu__section">
                      <p className="topbar-user-menu__label">{shellT('viewMode')}</p>
                      <div className="topbar-user-menu__mode-toggle">
                        {(['auto', 'desktop', 'compact'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            data-active={viewMode === mode}
                            onClick={() => { setViewMode(mode); setUserMenuOpen(false); }}
                            className="topbar-user-menu__mode-btn"
                          >
                            {shellT(`viewMode${mode.charAt(0).toUpperCase()}${mode.slice(1)}` as 'viewModeAuto' | 'viewModeDesktop' | 'viewModeCompact')}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="topbar-user-menu__section">
                      <p className="topbar-user-menu__label">{shellT('lang')}</p>
                      <div className="topbar-user-menu__lang-row">
                        <Link
                          href="/en"
                          onClick={() => setUserMenuOpen(false)}
                          className="topbar-user-menu__lang-btn"
                        >
                          EN
                        </Link>
                        <Link
                          href="/sw"
                          onClick={() => setUserMenuOpen(false)}
                          className="topbar-user-menu__lang-btn"
                        >
                          SW
                        </Link>
                      </div>
                    </div>
                    <div className="topbar-user-menu__divider" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="topbar-user-menu__logout"
                    >
                      {isLoggingOut ? shellT('loggingOut') : actionsT('logout')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {mobileControlsOpen ? (
            <div
              className={`mt-3 grid gap-2 border-t border-[color:var(--border)] pt-3 ${
                forceDesktopShell
                  ? 'hidden'
                  : forceCompactShell
                    ? 'grid'
                    : 'md:hidden'
              }`}
            >
              <div className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[rgba(22,17,6,0.6)] px-3 py-2.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[rgba(246,211,122,0.35)] bg-[rgba(246,211,122,0.1)] text-sm font-bold text-[#f6d37a]">
                  {userInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">{storedUser?.name ?? 'User'}</p>
                  <p className="truncate text-[11px] text-[color:var(--muted)]">{storedUser?.email ?? ''}</p>
                </div>
              </div>
              <BusinessSwitcher />
              {showBranchSelector ? (
                <SmartSelect
                  instanceId="branch-select-mobile"
                  value={activeBranchId}
                  options={branches.map((branch) => ({
                    value: branch.id,
                    label: branch.name,
                  }))}
                  placeholder={shellT('selectBranch')}
                  onChange={(nextId) => {
                    setActiveBranchId(nextId);
                    const selected = branches.find(
                      (branch) => branch.id === nextId,
                    );
                    if (selected) {
                      setActiveBranch({ id: selected.id, name: selected.name });
                    }
                  }}
                  className="text-xs"
                />
              ) : null}
              <SmartSelect
                instanceId="jump-select-mobile"
                value=""
                options={visibleNavSections.map((section) => ({
                  label: section.title,
                  options: section.items
                    .filter((item) => !item.disabled)
                    .map((item) => ({ value: item.href, label: item.label })),
                }))}
                placeholder={shellT('select')}
                onChange={(value) => {
                  if (value) {
                    router.push(value);
                    setMobileControlsOpen(false);
                  }
                }}
                className="text-xs"
              />
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                <span>{shellT('lang')}</span>
                <Link href="/en" className="text-[color:var(--foreground)]">
                  EN
                </Link>
                <Link href="/sw" className="text-[color:var(--foreground)]">
                  SW
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  {shellT('viewMode')}
                </span>
                <button
                  type="button"
                  data-active={viewMode === 'auto'}
                  onClick={() => setViewMode('auto')}
                  className="rounded-full border border-[color:var(--border)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--foreground)] data-[active=true]:border-[color:var(--accent)] data-[active=true]:bg-[color:var(--accent-soft)]"
                >
                  {shellT('viewModeAuto')}
                </button>
                <button
                  type="button"
                  data-active={viewMode === 'desktop'}
                  onClick={() => setViewMode('desktop')}
                  className="rounded-full border border-[color:var(--border)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--foreground)] data-[active=true]:border-[color:var(--accent)] data-[active=true]:bg-[color:var(--accent-soft)]"
                >
                  {shellT('viewModeDesktop')}
                </button>
                <button
                  type="button"
                  data-active={viewMode === 'compact'}
                  onClick={() => setViewMode('compact')}
                  className="rounded-full border border-[color:var(--border)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--foreground)] data-[active=true]:border-[color:var(--accent)] data-[active=true]:bg-[color:var(--accent-soft)]"
                >
                  {shellT('viewModeCompact')}
                </button>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="mt-1 w-full rounded-xl border border-red-500/20 bg-red-950/30 px-3 py-2.5 text-left text-sm font-medium text-red-400 transition hover:border-red-500/40 hover:bg-red-950/50 disabled:opacity-60"
              >
                {isLoggingOut ? shellT('loggingOut') : actionsT('logout')}
              </button>
            </div>
          ) : null}
        </header>
        {mobileNavOpen ? (
          <div
            className={`fixed inset-0 z-40 bg-black/70 ${
              forceDesktopShell
                ? 'hidden'
                : forceCompactShell
                  ? 'block'
                  : 'md:hidden'
            }`}
            onClick={() => setMobileNavOpen(false)}
          >
            <div
              className="h-full w-[84vw] max-w-xs overflow-y-auto border-r border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-5"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--foreground)]">
                  {t('brand')}
                </p>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded border border-[color:var(--border)] px-2 py-1 text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-5 text-sm text-[color:var(--muted)]">
                {visibleNavSections.map((section) => (
                  <div key={section.title} className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--foreground)]">
                      {section.title}
                    </p>
                    <ul className="space-y-1">
                      {section.items.map((item) => {
                        const isActive = pathname === item.href;
                        const badge = getBadgeForHref(item.href);
                        if (item.disabled) {
                          return (
                            <li key={item.href}>
                              <div
                                className="nav-pill flex items-center justify-between rounded px-3 py-2 opacity-50"
                                aria-disabled="true"
                                title={shellT('noAccess')}
                              >
                                <span className="flex items-center gap-2">
                                  {item.icon ? (
                                    <NavIcon name={item.icon} className="h-4 w-4" />
                                  ) : null}
                                  {item.label}
                                </span>
                              </div>
                            </li>
                          );
                        }
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              data-active={isActive ? 'true' : 'false'}
                              className="nav-pill group flex items-center justify-between rounded px-3 py-2 transition hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--foreground)]"
                              onClick={() => setMobileNavOpen(false)}
                            >
                              <span className="flex items-center gap-2">
                                {item.icon ? (
                                  <NavIcon name={item.icon} className="h-4 w-4" />
                                ) : null}
                                {item.label}
                              </span>
                              {badge > 0 ? (
                                <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-2 py-0.5 text-[10px] text-[color:var(--foreground)]">
                                  {badge > 99 ? '99+' : badge}
                                </span>
                              ) : null}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex">
          <nav
            className={`w-20 border-r border-[color:var(--border)] px-2 py-6 xl:w-72 xl:px-6 ${
              forceCompactShell
                ? 'hidden'
                : forceDesktopShell
                  ? 'block'
                  : 'hidden md:block'
            }`}
          >
            <div className="space-y-6 text-sm text-[color:var(--muted)]">
              {visibleNavSections.map((section) => (
                <div key={section.title} className="space-y-2">
                  <p className="hidden text-[10px] uppercase tracking-[0.35em] text-[color:var(--foreground)] xl:block">
                    {section.title}
                  </p>
                  <ul className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = pathname === item.href;
                      const badge = getBadgeForHref(item.href);
                      if (item.disabled) {
                        return (
                          <li key={item.href}>
                            <div
                              className="nav-pill flex items-center justify-center rounded px-2 py-2 opacity-50 xl:justify-between xl:px-3"
                              aria-disabled="true"
                              title={shellT('noAccess')}
                            >
                              <span className="flex items-center gap-2">
                                {item.icon ? (
                                  <NavIcon name={item.icon} className="h-4 w-4" />
                                ) : null}
                                <span className="hidden xl:inline">{item.label}</span>
                              </span>
                            </div>
                          </li>
                        );
                      }
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            data-active={isActive ? 'true' : 'false'}
                            className="nav-pill group flex items-center justify-center rounded px-2 py-2 transition hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--foreground)] xl:justify-between xl:px-3"
                            title={item.label}
                          >
                            <span className="flex items-center gap-2">
                              {item.icon ? (
                                <NavIcon name={item.icon} className="h-4 w-4" />
                              ) : null}
                              <span className="hidden xl:inline">{item.label}</span>
                            </span>
                            <span className="hidden items-center gap-2 text-[10px] text-[color:var(--muted)] xl:flex">
                              {badge > 0 ? (
                                <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-2 py-0.5 text-[10px] text-[color:var(--foreground)]">
                                  {badge > 99 ? '99+' : badge}
                                </span>
                              ) : null}
                              <span className="opacity-0 transition group-hover:opacity-100">
                                ↗
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
          <main
            className="read-only-zone min-w-0 flex-1 px-4 py-6 pb-24 sm:px-6 md:py-8 md:pb-8"
            data-readonly={isReadOnly ? 'true' : 'false'}
          >
            {mainContent}
          </main>
        </div>
        <nav
          className={`fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--border)] bg-[color:var(--surface-soft)] px-2 py-2 backdrop-blur ${
            forceDesktopShell
              ? 'hidden'
              : forceCompactShell
                ? 'block'
                : 'md:hidden'
          }`}
        >
          <div className="grid grid-cols-5 gap-1 text-[10px] uppercase tracking-[0.15em] text-[color:var(--muted)]">
            {quickNavItems.map((item) => {
              const isActive = pathname === item.href;
              const badge = getBadgeForHref(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-1 rounded px-1 py-2 ${isActive ? 'bg-[color:var(--accent-soft)] text-[color:var(--foreground)]' : ''}`}
                >
                  {item.icon ? <NavIcon name={item.icon} className="h-4 w-4" /> : null}
                  <span className="truncate">{item.label}</span>
                  {badge > 0 ? (
                    <span className="rounded-full border border-[color:var(--border)] px-1.5 py-0.5 text-[9px] text-[color:var(--foreground)]">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex flex-col items-center gap-1 rounded px-1 py-2"
            >
              <span className="text-sm leading-none">☰</span>
              <span>{shellT('menu')}</span>
            </button>
          </div>
        </nav>
        {paletteOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-24"
            onClick={() => {
              setPaletteOpen(false);
              setPaletteQuery('');
            }}
          >
            <div
              className="w-full max-w-xl rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <input
                  ref={paletteInputRef}
                  value={paletteQuery}
                  onChange={(event) => setPaletteQuery(event.target.value)}
                  placeholder={shellT('searchPages')}
                  className="w-full rounded border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--foreground)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPaletteOpen(false);
                    setPaletteQuery('');
                  }}
                  className="rounded border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--foreground)]"
                >
                  Esc
                </button>
              </div>
              <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
                {paletteItems.length ? (
                  paletteItems.map((item) => (
                    <button
                      key={`${item.kind}-${item.href ?? item.label}`}
                      type="button"
                      onClick={() => {
                        if (item.href) {
                          router.push(item.href);
                        }
                        setPaletteOpen(false);
                        setPaletteQuery('');
                      }}
                      className="flex w-full items-center justify-between rounded border border-[color:var(--border)] px-3 py-2 text-left text-sm text-[color:var(--foreground)] transition hover:bg-[color:var(--accent-soft)]"
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                        {item.group}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-[color:var(--muted)]">
                    {shellT('noMatches')}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
        <SupportChatWidget />
      </div>
    </AuthGate>
  );
}
