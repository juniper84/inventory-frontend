'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { CSSProperties, ReactNode } from 'react';
import { PLATFORM_NAV_ITEMS } from '@/components/platform/shell/platform-nav';
import { clearPlatformSession, getPlatformAccessToken } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

type SearchResult = {
  type: 'business' | 'incident' | 'announcement';
  id: string;
  label: string;
  meta: string;
  businessId?: string;
  businessName?: string;
};

type SearchResultsPayload = {
  businesses: SearchResult[];
  incidents: SearchResult[];
  announcements: SearchResult[];
  query: string;
};

type PlatformTheme = 'obsidian' | 'neon' | 'midnight' | 'forest' | 'crimson' | 'violet' | 'charcoal';
const PLATFORM_THEME_KEY = 'nvi.platform.theme';
const VALID_THEMES: PlatformTheme[] = ['obsidian', 'neon', 'midnight', 'forest', 'crimson', 'violet', 'charcoal'];

const THEMES: { key: PlatformTheme; label: string; swatch: string }[] = [
  { key: 'obsidian', label: 'Obsidian', swatch: '#c9a84c' },
  { key: 'neon',     label: 'Neon',     swatch: '#ffe566' },
  { key: 'midnight', label: 'Midnight', swatch: '#4f8ef7' },
  { key: 'forest',   label: 'Forest',   swatch: '#3dba6a' },
  { key: 'crimson',  label: 'Crimson',  swatch: '#e05272' },
  { key: 'violet',   label: 'Violet',   swatch: '#9b6ef0' },
  { key: 'charcoal', label: 'Charcoal', swatch: '#78a8c8' },
];

const NAV_ICONS: Record<string, ReactNode> = {
  overview: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="p-nav-icon">
      <rect x="1" y="1" width="5" height="5" rx="1.2" />
      <rect x="8" y="1" width="5" height="5" rx="1.2" />
      <rect x="1" y="8" width="5" height="5" rx="1.2" />
      <rect x="8" y="8" width="5" height="5" rx="1.2" />
    </svg>
  ),
  businesses: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="p-nav-icon">
      <path d="M2 13V6l5-4 5 4v7" />
      <rect x="5" y="8" width="4" height="5" rx="0.8" />
    </svg>
  ),
  operations: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="p-nav-icon">
      <path d="M1 4h12M1 7h8M1 10h10" strokeLinecap="round" />
      <circle cx="11" cy="10" r="2" />
    </svg>
  ),
  access: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="p-nav-icon">
      <circle cx="7" cy="5" r="2.5" />
      <path d="M2 13c0-2.8 2.2-5 5-5s5 2.2 5 5" strokeLinecap="round" />
    </svg>
  ),
  announcements: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="p-nav-icon">
      <path d="M1 4.5h12v6a1 1 0 01-1 1H2a1 1 0 01-1-1v-6z" />
      <path d="M5 4.5V3a2 2 0 014 0v1.5" />
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="p-nav-icon">
      <path d="M1 11l3.5-4 3 2.5L11 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  intelligence: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="p-nav-icon">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 4v3.5l2 1.5" strokeLinecap="round" />
    </svg>
  ),
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
  const [searchResults, setSearchResults] = useState<SearchResultsPayload | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedPath = pathname.startsWith(`${basePath}/`)
    ? pathname.slice(basePath.length + 1).split('/')[0]
    : 'overview';

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PLATFORM_THEME_KEY, theme);
  }, [theme]);

  const runSearch = useCallback(
    async (q: string) => {
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
        // silent — search failures shouldn't interrupt navigation
      } finally {
        setIsSearching(false);
      }
    },
    [],
  );

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

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearchOpen(false);
      setSearchResults(null);
      return;
    }
    if (e.key !== 'Enter') return;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return;
    // Try nav match first
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

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const totalResults = searchResults
    ? searchResults.businesses.length +
      searchResults.incidents.length +
      searchResults.announcements.length
    : 0;

  const currentSection = navItems.find((i) => i.path === normalizedPath);

  return (
    <div className="p-shell nvi-reveal" data-theme={theme} suppressHydrationWarning>
      {/* Left nav rail */}
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
          <div className="p-theme-row">
            <span className="p-theme-label">Theme</span>
            <div className="p-theme-swatches">
              {THEMES.map((th) => (
                <button
                  key={th.key}
                  type="button"
                  onClick={() => setTheme(th.key)}
                  data-active={theme === th.key}
                  className="p-theme-dot"
                  title={th.label}
                  style={{ '--swatch': th.swatch } as CSSProperties}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              clearPlatformSession();
              router.push(`${basePath}/login`);
            }}
            className="p-nav-item"
          >
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="p-nav-icon">
              <path d="M5 7h7M9 4.5l2.5 2.5L9 9.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 2H2.5A1.5 1.5 0 001 3.5v7A1.5 1.5 0 002.5 12H8" />
            </svg>
            <span className="p-nav-label">{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="p-main">
        <div className="p-topbar">
          <div className="p-search" ref={searchRef} style={{ position: 'relative' }}>
            <input
              value={query}
              onChange={handleSearchChange}
              onKeyDown={handleSearch}
              onFocus={() => {
                if (searchResults && totalResults > 0) setSearchOpen(true);
              }}
              placeholder={isSearching ? t('searchingPlaceholder') : t('jumpPlaceholder')}
              className="p-search-input"
            />
            {searchOpen && searchResults && totalResults > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  background: 'var(--pt-surface)',
                  border: '1px solid var(--pt-border)',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  maxHeight: '320px',
                  overflowY: 'auto',
                }}
              >
                {searchResults.businesses.length > 0 && (
                  <div>
                    <p style={{ padding: '6px 10px 4px', fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--pt-text-muted)' }}>
                      {t('searchGroupBusinesses')}
                    </p>
                    {searchResults.businesses.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => navigateToResult(r)}
                        style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pt-text)', textAlign: 'left' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--pt-border)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <span>{r.label}</span>
                        <span style={{ fontSize: '10px', color: 'var(--pt-text-muted)', textTransform: 'uppercase' }}>{r.meta}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.incidents.length > 0 && (
                  <div>
                    <p style={{ padding: '6px 10px 4px', fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--pt-text-muted)' }}>
                      {t('searchGroupIncidents')}
                    </p>
                    {searchResults.incidents.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => navigateToResult(r)}
                        style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pt-text)', textAlign: 'left' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--pt-border)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{r.label}</span>
                        <span style={{ fontSize: '10px', color: 'var(--pt-text-muted)', flexShrink: 0 }}>{r.meta}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.announcements.length > 0 && (
                  <div>
                    <p style={{ padding: '6px 10px 4px', fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--pt-text-muted)' }}>
                      {t('searchGroupAnnouncements')}
                    </p>
                    {searchResults.announcements.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => navigateToResult(r)}
                        style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pt-text)', textAlign: 'left' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--pt-border)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <span>{r.label}</span>
                        <span style={{ fontSize: '10px', color: 'var(--pt-text-muted)' }}>{r.meta}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="p-topbar-right">
            {currentSection && (
              <span className="p-topbar-section">{currentSection.shortLabel}</span>
            )}
          </div>
        </div>

        <div className="p-content">{children}</div>
      </main>

    </div>
  );
}
