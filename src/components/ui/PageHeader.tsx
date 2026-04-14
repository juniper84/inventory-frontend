'use client';

import type { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  actions?: ReactNode;
};

/**
 * Unified page hero component.
 * Replaces both PremiumPageHeader (business pages) and PageHero (reports).
 * Uses `.nvi-hero` CSS class — token-based, canonical radius.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  badges,
  actions,
}: PageHeaderProps) {
  return (
    <header className="nvi-hero nvi-reveal">
      <div className="nvi-hero__copy">
        {eyebrow && <p className="nvi-hero__eyebrow">{eyebrow}</p>}
        <h1 className="nvi-hero__title">{title}</h1>
        {subtitle && <p className="nvi-hero__subtitle">{subtitle}</p>}
      </div>
      {(badges || actions) && (
        <div className="nvi-hero__side">
          {badges && <div className="nvi-hero__badges">{badges}</div>}
          {actions && <div className="nvi-hero__actions">{actions}</div>}
        </div>
      )}
    </header>
  );
}
