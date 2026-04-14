'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { CSSProperties, ReactNode } from 'react';
import {
  LayoutDashboard,
  Building2,
  Settings2,
  UserCog,
  Megaphone,
  BarChart3,
  Brain,
  Menu,
  Settings,
  LogOut,
} from 'lucide-react';
import { PLATFORM_NAV_ITEMS } from '@/components/platform/shell/platform-nav';
import {
  clearPlatformSession,
  getPlatformAccessToken,
  getPlatformRefreshToken,
  decodeJwt,
} from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { PlatformSearchResults } from './PlatformSearchResults';
import { PlatformSseIndicator } from './PlatformSseIndicator';
import { PlatformSettingsPanel } from './PlatformSettingsPanel';
import { PlatformMobileDrawer } from './PlatformMobileDrawer';

export type SearchResult = {
  type: 'business' | 'incident' | 'announcement';
  id: string;
  label: string;
  meta: string;
  businessId?: string;
  businessName?: string;
};

export type SearchResultsPayload = {
  businesses: SearchResult[];
  incidents: SearchResult[];
  announcements: SearchResult[];
  query: string;
};

export type PlatformTheme =
  | 'obsidian'
  | 'aurora'
  | 'midnight'
  | 'cyber'
  | 'rose'
  | 'violet'
  | 'forest'
  | 'ember'
  | 'mono';

export type ThemeOption = {
  key: PlatformTheme;
  label: string;
  swatch: string;
};

const PLATFORM_THEME_KEY = 'nvi.platform.theme';

const VALID_THEMES: PlatformTheme[] = [
  'obsidian',
  'aurora',
  'midnight',
  'cyber',
  'rose',
  'violet',
  'forest',
  'ember',
  'mono',
];

// Phase 8 curated theme set. Each swatch matches the `--pt-accent` defined in
// globals.css. Labels are surfaced via t('themeName_*') for localization.
const THEMES_META: { key: PlatformTheme; swatch: string }[] = [
  { key: 'obsidian', swatch: '#c9a84c' },
  { key: 'aurora', swatch: '#2dd4a3' },
  { key: 'midnight', swatch: '#5a9bff' },
  { key: 'cyber', swatch: '#22d3ee' },
  { key: 'rose', swatch: '#f472a6' },
  { key: 'violet', swatch: '#a47cf0' },
  { key: 'forest', swatch: '#22c55e' },
  { key: 'ember', swatch: '#f97316' },
  { key: 'mono', swatch: '#e5e7eb' },
];

const NAV_ICONS: Record<string, ReactNode> = {
  overview: <LayoutDashboard size={16} className="p-nav-icon" />,
  businesses: <Building2 size={16} className="p-nav-icon" />,
  operations: <Settings2 size={16} className="p-nav-icon" />,
  access: <UserCog size={16} className="p-nav-icon" />,
  announcements: <Megaphone size={16} className="p-nav-icon" />,
  analytics: <BarChart3 size={16} className="p-nav-icon" />,
  intelligence: <Brain size={16} className="p-nav-icon" />,
};

export function PlatformShell({
  basePath,
  children,
}: {
  basePath: string;
  children: ReactNode;
}) {
  const t = useTranslations('platformShell');
  const pathname = usePathname();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState<PlatformTheme>(() => {
    if (typeof window === 'undefined') return 'obsidian';
    const stored = window.localStorage.getItem(PLATFORM_THEME_KEY);
    if (stored && (VALID_THEMES as string[]).includes(stored)) {
      return stored as PlatformTheme;
    }
    return 'obsidian';
  });
  const [searchResults, setSearchResults] =
    useState<SearchResultsPayload | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedPath = pathname.startsWith(`${basePath}/`)
    ? pathname.slice(basePath.length + 1).split('/')[0]
    : 'overview';

  // Decode admin email from JWT for the settings panel profile row
  useEffect(() => {
    const token = getPlatformAccessToken();
    if (!token) return;
    const payload = decodeJwt<{ email?: string; sub?: string }>(token);
    if (payload?.email) setAdminEmail(payload.email);
  }, []);

  const navItems = useMemo(
    () =>
      PLATFORM_NAV_ITEMS.map((item) => ({
        ...item,
        label: t(item.labelKey),
        shortLabel: t(item.shortLabelKey),
        description: t(item.descriptionKey),
      })),
    [t],
  );

  const themes: ThemeOption[] = useMemo(
    () =>
      THEMES_META.map((th) => ({
        key: th.key,
        swatch: th.swatch,
        label: t(`themeName_${th.key}`),
      })),
    [t],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PLATFORM_THEME_KEY, theme);
  }, [theme]);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults(null);
      setSearchOpen(false);
      return;
    }
    const token = getPlatformAccessToken();
    if (!token) return;
    setIsSearching(true);
    try {
      const data = await apiFetch<SearchResultsPayload>(
        `/platform/search?q=${encodeURIComponent(q.trim())}`,
        { token },
      );
      setSearchResults(data);
      setSearchOpen(true);
    } catch {
      // silent — don't interrupt navigation
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSearchResults(null);
      setSearchOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => void runSearch(value), 350);
  };

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearchOpen(false);
      setSearchResults(null);
      return;
    }
    if (e.key !== 'Enter') return;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return;
    const match = navItems.find(
      (item) =>
        item.label.toLowerCase().includes(normalized) ||
        item.path.toLowerCase() === normalized,
    );
    if (match) {
      router.push(`${basePath}/${match.path}`);
      setSearchOpen(false);
    } else {
      void runSearch(query);
    }
  };

  const navigateToResult = (result: SearchResult) => {
    setSearchOpen(false);
    setQuery('');
    setSearchResults(null);
    if (result.type === 'business') {
      router.push(`${basePath}/businesses/${result.id}`);
    } else if (result.type === 'incident') {
      router.push(`${basePath}/operations`);
    } else if (result.type === 'announcement') {
      router.push(`${basePath}/announcements`);
    }
  };

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentSection = navItems.find((i) => i.path === normalizedPath);

  /**
   * Logout handler — BUG FIX (Phase 8 #6): calls backend before clearing local
   * session so the refresh token is actually revoked. Previously `clearPlatformSession()`
   * only wiped localStorage and never hit the server, leaving refresh tokens
   * valid until expiry.
   */
  const handleLogout = async () => {
    const refreshToken = getPlatformRefreshToken();
    try {
      if (refreshToken) {
        await apiFetch('/platform/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // If logout fails (network, 500, etc.) still clear local session so the
      // user isn't stuck signed in. Server-side tokens remain valid in that
      // edge case but frontend won't send them.
    } finally {
      clearPlatformSession();
      router.push(`${basePath}/login`);
    }
  };

  const handleThemeChange = (next: PlatformTheme) => {
    setTheme(next);
  };

  return (
    <div
      className="p-shell nvi-reveal"
      data-theme={theme}
      suppressHydrationWarning
    >
      {/* Left nav rail (desktop) */}
      <aside className="p-rail">
        <div className="p-rail-brand">
          <span className="p-rail-brand-eye">{t('brandEyebrow')}</span>
          <span className="p-rail-brand-name">{t('brandTitle')}</span>
        </div>

        <nav className="p-rail-nav" aria-label={t('brandEyebrow')}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={`${basePath}/${item.path}`}
              data-active={normalizedPath === item.path}
              className="p-nav-item"
            >
              {NAV_ICONS[item.path] ?? null}
              <span className="p-nav-label">{item.shortLabel}</span>
            </Link>
          ))}
        </nav>

        <div className="p-rail-footer">
          {/* SSE connection indicator */}
          <PlatformSseIndicator
            labels={{
              connected: t('sseConnected'),
              reconnecting: t('sseReconnecting'),
              disconnected: t('sseDisconnected'),
            }}
          />

          {/* Settings button (opens slide-in panel with profile + password + theme) */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-nav-item"
          >
            <Settings size={14} className="p-nav-icon" />
            <span className="p-nav-label">{t('settings')}</span>
          </button>

          {/* Logout */}
          <button type="button" onClick={handleLogout} className="p-nav-item">
            <LogOut size={14} className="p-nav-icon" />
            <span className="p-nav-label">{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="p-main">
        <div className="p-topbar">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="p-hamburger"
            aria-label={t('openNav')}
          >
            <Menu size={16} />
          </button>

          <div
            className="p-search"
            ref={searchRef}
            style={{ position: 'relative' }}
          >
            <input
              value={query}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKey}
              onFocus={() => {
                if (searchResults && query.trim().length >= 2) setSearchOpen(true);
              }}
              placeholder={
                isSearching ? t('searchingPlaceholder') : t('jumpPlaceholder')
              }
              className="p-search-input"
            />
            {searchOpen && searchResults && query.trim().length >= 2 && (
              <PlatformSearchResults
                results={searchResults}
                query={query}
                onNavigate={navigateToResult}
                t={(key) => t(key)}
              />
            )}
          </div>
          <div className="p-topbar-right">
            {currentSection && (
              <span className="p-topbar-section">
                {currentSection.shortLabel}
              </span>
            )}
          </div>
        </div>

        <div className="p-content">{children}</div>
      </main>

      {/* Mobile drawer (hamburger-triggered) */}
      <PlatformMobileDrawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        basePath={basePath}
        navItems={navItems}
        normalizedPath={normalizedPath}
        navIcons={NAV_ICONS}
        onLogout={() => {
          setMobileDrawerOpen(false);
          void handleLogout();
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        brandEyebrow={t('brandEyebrow')}
        brandTitle={t('brandTitle')}
        settingsLabel={t('settings')}
        logoutLabel={t('logout')}
      />

      {/* Settings panel (right slide-in) */}
      <PlatformSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={handleThemeChange}
        themes={themes}
        adminEmail={adminEmail}
        t={(key) => t(key)}
      />
    </div>
  );
}
