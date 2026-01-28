'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  getRefreshToken,
} from '@/lib/auth';
import {
  getActiveBranch,
  setActiveBranch,
} from '@/lib/branch-context';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { Spinner } from '@/components/Spinner';
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('common');
  const navT = useTranslations('nav');
  const sectionT = useTranslations('navSections');
  const shellT = useTranslations('appShell');
  const paletteT = useTranslations('palette');
  const actionsT = useTranslations('actions');
  const isAuthRoute = AUTH_PATHS.some((segment) => pathname.includes(segment));
  const isPlatformRoute = pathname.includes('/platform');
  const locale = pathname.split('/')[1] || 'en';
  const base = `/${locale}`;
  const token = typeof window !== 'undefined' ? getAccessToken() : null;
  const payload = token
    ? decodeJwt<{ permissions?: string[]; scope?: string }>(token)
    : null;
  const permissions = new Set(payload?.permissions ?? []);
  const isSupportView = payload?.scope === 'support';
  const refreshToken = typeof window !== 'undefined' ? getRefreshToken() : null;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState('');
  const [notificationCount, setNotificationCount] = useState(0);
  const [approvalCount, setApprovalCount] = useState(0);
  const [readOnlyState, setReadOnlyState] = useState<{
    enabled: boolean;
    reason: string | null;
  } | null>(null);
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
  const isReadOnly = readOnlyState?.enabled ?? false;
  const canForceOnboarding = permissions.has('settings.write');

  useEffect(() => {
    if (!token || isPlatformRoute) {
      setTimeout(() => setReadOnlyState(null), 0);
      return;
    }
    let active = true;
    apiFetch<{
      readOnlyEnabled?: boolean;
      readOnlyReason?: string | null;
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

  const navSections = [
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
  ];

  const navItems = useMemo(
    () =>
      navSections.flatMap((section) =>
        section.items
          .filter((item) => permissions.has(item.permission))
          .map((item) => ({ ...item, group: section.title })),
      ),
    [navSections, permissions],
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
        setNotificationCount(
          notifItems.filter((item) => item.status && item.status !== 'READ').length,
        );
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

  const mainContent = missingPermission ? (
    <NoAccessState
      permission={activeRoutePermission?.permission ?? 'unknown'}
      path={pathname}
    />
  ) : (
    children
  );

  if (isPlatformRoute) {
    return (
      <PlatformAuthGate>
        <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
          <header className="flex items-center justify-between border-b border-gold-700/40 px-6 py-4">
            <h1 className="text-lg font-semibold text-gold-100">
              {t('brand')} {navT('platform')}
            </h1>
            <button
              onClick={() => {
                clearPlatformSession();
                router.replace(`/${pathname.split('/')[1]}/platform/login`);
              }}
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
      <div className="min-h-screen bg-[#0b0f14] text-gold-100">
        <div className="relative min-h-screen overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-[center_left]"
            style={{ backgroundImage: "url('/images/login-bg.jpg')" }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b0f14]/65 via-[#0b0f14]/30 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,transparent_0%,#0b0f14_60%)] opacity-20" />
          <div className="relative z-10 flex min-h-screen items-start justify-end px-3 pt-24 pb-10 sm:px-6 lg:px-8">
            <div className="flex min-h-[640px] w-full max-w-sm flex-col justify-between rounded-2xl border border-white/20 bg-[#5b6270]/80 px-10 py-12 shadow-[0_40px_120px_rgba(0,0,0,0.55)] backdrop-blur-xl">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
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
  };

  return (
    <AuthGate>
      <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
        {isLoggingOut ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-gold-600/40 bg-black/80 px-8 py-10 text-center text-gold-100 shadow-[0_30px_120px_rgba(0,0,0,0.6)]">
              <Spinner variant="orbit" size="md" className="scale-150" />
              <div className="space-y-1">
                <p className="text-lg font-semibold">{shellT('loggingOut')}</p>
                <p className="text-xs text-gold-300 animate-pulse">
                  {shellT('loggingOut')}
                </p>
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
        <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--surface-soft)] px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold tracking-[0.2em] text-[color:var(--foreground)]">
                {t('brand')}
              </h1>
              {isReadOnly ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-950/60 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-red-100">
                  🔒 {shellT('readOnlyBadge')}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--muted)]">
              <BusinessSwitcher />
              {!isPlatformRoute ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-[0.25em]">
                    {shellT('branch')}
                  </span>
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
                      const selected = branches.find(
                        (branch) => branch.id === nextId,
                      );
                      if (selected) {
                        setActiveBranch({ id: selected.id, name: selected.name });
                      }
                    }}
                    className="min-w-[180px] text-xs"
                  />
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-[0.25em]">
                  {shellT('jump')}
                </span>
                <SmartSelect
                  instanceId="jump-select"
                  value=""
                  options={navSections.map((section) => ({
                    label: section.title,
                    options: section.items
                      .filter((item) => permissions.has(item.permission))
                      .map((item) => ({ value: item.href, label: item.label })),
                  }))}
                  placeholder={shellT('select')}
                  onChange={(value) => {
                    if (value) {
                      router.push(value);
                    }
                  }}
                  className="min-w-[180px] text-xs"
                />
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  className="rounded border border-[color:var(--border)] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--foreground)]"
                >
                  ⌘K
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-[0.25em]">
                  {shellT('lang')}
                </span>
                <div className="flex gap-2">
                  <Link href="/en" className="hover:text-[color:var(--foreground)]">
                    EN
                  </Link>
                  <Link href="/sw" className="hover:text-[color:var(--foreground)]">
                    SW
                  </Link>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="rounded border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--foreground)]"
              >
                {isLoggingOut ? shellT('loggingOut') : actionsT('logout')}
              </button>
            </div>
          </div>
        </header>
        <div className="flex">
          <nav className="hidden w-72 border-r border-[color:var(--border)] px-6 py-6 lg:block">
            <div className="space-y-6 text-sm text-[color:var(--muted)]">
              {navSections.map((section) => {
                const visibleItems = section.items
                  .map((item) => {
                    const allowed = permissions.has(item.permission);
                    const visibility =
                      NAV_VISIBILITY_POLICY[item.permission] ?? 'hide';
                    if (!allowed && visibility === 'hide') {
                      return null;
                    }
                    return { ...item, disabled: !allowed };
                  })
                  .filter(Boolean) as Array<
                    (typeof section.items)[number] & { disabled?: boolean }
                  >;
                if (!visibleItems.length) {
                  return null;
                }
                return (
                  <div key={section.title} className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--foreground)]">
                      {section.title}
                    </p>
                    <ul className="space-y-1">
                      {visibleItems.map((item) => {
                        const isActive = pathname === item.href;
                        const badge =
                          item.href.endsWith('/notifications')
                            ? notificationCount
                          : item.href.endsWith('/approvals')
                            ? approvalCount
                            : item.href.endsWith('/offline')
                              ? offlineState.pendingCount
                              : 0;
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
                            >
                              <span className="flex items-center gap-2">
                                {item.icon ? (
                                  <NavIcon name={item.icon} className="h-4 w-4" />
                                ) : null}
                                {item.label}
                              </span>
                              <span className="flex items-center gap-2 text-[10px] text-[color:var(--muted)]">
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
                );
              })}
            </div>
          </nav>
          <main
            className="read-only-zone flex-1 px-6 py-8"
            data-readonly={isReadOnly ? 'true' : 'false'}
          >
            {mainContent}
          </main>
        </div>
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
      </div>
    </AuthGate>
  );
}
