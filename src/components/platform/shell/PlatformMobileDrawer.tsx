'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { X, LogOut, Settings } from 'lucide-react';

type NavItem = {
  path: string;
  label: string;
  shortLabel: string;
  description: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  basePath: string;
  navItems: NavItem[];
  normalizedPath: string;
  navIcons: Record<string, ReactNode>;
  onLogout: () => void;
  onOpenSettings: () => void;
  brandEyebrow: string;
  brandTitle: string;
  settingsLabel: string;
  logoutLabel: string;
};

/**
 * Mobile nav drawer — slides in from the left on screens < 840px.
 * Closes on: backdrop click, nav item click, Settings click, logout click, Escape key.
 * Search stays in the topbar on mobile (not duplicated here).
 */
export function PlatformMobileDrawer({
  open,
  onClose,
  basePath,
  navItems,
  normalizedPath,
  navIcons,
  onLogout,
  onOpenSettings,
  brandEyebrow,
  brandTitle,
  settingsLabel,
  logoutLabel,
}: Props) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="p-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="p-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={brandTitle}
      >
        <button
          type="button"
          onClick={onClose}
          className="p-drawer-close"
          aria-label={logoutLabel}
        >
          <X size={14} />
        </button>

        <div className="p-rail-brand">
          <span className="p-rail-brand-eye">{brandEyebrow}</span>
          <span className="p-rail-brand-name">{brandTitle}</span>
        </div>

        <nav className="p-rail-nav" aria-label={brandEyebrow}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={`${basePath}/${item.path}`}
              onClick={onClose}
              data-active={normalizedPath === item.path}
              className="p-nav-item"
            >
              {navIcons[item.path] ?? null}
              <span className="p-nav-label">{item.shortLabel}</span>
            </Link>
          ))}
        </nav>

        <div className="p-rail-footer">
          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="p-nav-item"
          >
            <Settings size={14} className="p-nav-icon" />
            <span className="p-nav-label">{settingsLabel}</span>
          </button>
          <button type="button" onClick={onLogout} className="p-nav-item">
            <LogOut size={14} className="p-nav-icon" />
            <span className="p-nav-label">{logoutLabel}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
