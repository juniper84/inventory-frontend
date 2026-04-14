'use client';

import { ReactNode } from 'react';

/**
 * PageHero — Compact page header for the reports page.
 * Replaces PremiumPageHeader's vertical bulk with a horizontal strip.
 */

export type PageHeroProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  actions?: ReactNode;
};

export function PageHero({ eyebrow, title, subtitle, badges, actions }: PageHeroProps) {
  return (
    <div className="rpt-hero">
      <div className="rpt-hero__body">
        {eyebrow && <div className="rpt-hero__eyebrow">{eyebrow}</div>}
        <h1 className="rpt-hero__title">{title}</h1>
        {subtitle && <p className="rpt-hero__subtitle">{subtitle}</p>}
      </div>
      {badges && <div className="rpt-hero__badges">{badges}</div>}
      {actions && <div className="rpt-hero__actions">{actions}</div>}
    </div>
  );
}
