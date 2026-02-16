'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { PLATFORM_NAV_ITEMS, PLATFORM_SHORTCUTS } from '@/components/platform/shell/platform-nav';
import { resolvePlatformDockContent } from '@/components/platform/shell/platform-context';

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
  const [focusFilter, setFocusFilter] = useState<'all' | 'queues' | 'risk'>('all');
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const normalizedPath = pathname.startsWith(`${basePath}/`)
    ? pathname.slice(basePath.length + 1).split('/')[0]
    : 'overview';
  const dock = resolvePlatformDockContent(basePath, normalizedPath);
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
  const shortcuts = useMemo(
    () =>
      PLATFORM_SHORTCUTS.map((shortcut) => ({
        ...shortcut,
        label: t(shortcut.labelKey),
      })),
    [t],
  );

  const quickCommandMatches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return navItems.slice(0, 4);
    }
    return navItems.filter((item) => {
      return (
        item.label.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized)
      );
    }).slice(0, 5);
  }, [navItems, query]);

  const runCommand = () => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return;
    }
    const match = navItems.find((item) => {
      return (
        item.path.toLowerCase() === normalized ||
        item.label.toLowerCase() === normalized ||
        item.label.toLowerCase().includes(normalized)
      );
    });
    if (match) {
      router.push(`${basePath}/${match.path}`);
    }
  };

  return (
    <div
      className="platform-shell nvi-reveal"
      data-rail-collapsed={isRailCollapsed}
      data-dock-collapsed={isDockCollapsed}
    >
      <aside className="platform-rail">
        <div className="platform-brand">
          <p className="platform-brand__eyebrow">{t('brandEyebrow')}</p>
          <h2 className="platform-brand__title">{t('brandTitle')}</h2>
          <p className="platform-brand__subtitle">{t('brandSubtitle')}</p>
        </div>
        <nav className="platform-rail__nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={`${basePath}/${item.path}`}
              data-active={normalizedPath === item.path}
              className="platform-rail__link"
            >
              <span className="platform-rail__link-title">{item.shortLabel}</span>
              <span className="platform-rail__link-desc">{item.description}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main className="platform-main">
        <section className="platform-command">
          <div className="platform-command__row">
            <div className="platform-command__search">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    runCommand();
                  }
                }}
                placeholder={t('jumpPlaceholder')}
                className="platform-command__input"
              />
              <button
                type="button"
                onClick={runCommand}
                className="platform-command__button"
              >
                {t('go')}
              </button>
            </div>

            <div className="platform-command__filters">
              <button
                type="button"
                className="platform-command__toggle"
                onClick={() => setIsRailCollapsed((prev) => !prev)}
              >
                {isRailCollapsed ? t('showNav') : t('hideNav')}
              </button>
              <button
                type="button"
                className="platform-command__toggle"
                onClick={() => setIsDockCollapsed((prev) => !prev)}
              >
                {isDockCollapsed ? t('showDock') : t('hideDock')}
              </button>
              <button
                type="button"
                data-active={focusFilter === 'all'}
                onClick={() => setFocusFilter('all')}
                className="platform-command__chip"
              >
                {t('filterAll')}
              </button>
              <button
                type="button"
                data-active={focusFilter === 'queues'}
                onClick={() => setFocusFilter('queues')}
                className="platform-command__chip"
              >
                {t('filterQueues')}
              </button>
              <button
                type="button"
                data-active={focusFilter === 'risk'}
                onClick={() => setFocusFilter('risk')}
                className="platform-command__chip"
              >
                {t('filterRisk')}
              </button>
            </div>
          </div>

          <div className="platform-command__row">
            <div className="platform-command__suggestions">
              {quickCommandMatches.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => router.push(`${basePath}/${item.path}`)}
                  className="platform-command__suggestion"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="platform-command__shortcuts">
              {shortcuts.map((shortcut) => (
                <span key={shortcut.key} className="platform-shortcut">
                  <kbd>{shortcut.key}</kbd>
                  <span>{shortcut.label}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="platform-content">{children}</section>
      </main>

      <aside className="platform-dock">
        <div className="platform-dock__card">
          <p className="platform-dock__eyebrow">{t('contextDock')}</p>
          <h3 className="platform-dock__title">{t(dock.titleKey)}</h3>
          <p className="platform-dock__desc">{t(dock.descriptionKey)}</p>
          <div className="platform-dock__tags">
            {dock.tagKeys.map((tagKey) => (
              <span key={tagKey} className="platform-dock__tag">
                {t(tagKey)}
              </span>
            ))}
          </div>
        </div>
        <div className="platform-dock__card">
          <p className="platform-dock__eyebrow">{t('quickActions')}</p>
          <div className="platform-dock__actions">
            {dock.actions.map((action) => (
              <Link key={action.href} href={action.href} className="platform-dock__action">
                {t(action.labelKey)}
              </Link>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
