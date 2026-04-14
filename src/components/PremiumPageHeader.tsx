'use client';

import type { ReactNode } from 'react';

type PremiumPageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  actions?: ReactNode;
};

/**
 * Legacy page header — uses old `.nvi-page-header` CSS classes.
 * New pages should use `import { PageHeader } from '@/components/ui'` instead,
 * which uses token-based `.nvi-hero` classes (canonical radius, spacing, weights).
 * This file stays until all pages migrate during their redesign (Job 2).
 */
export function PremiumPageHeader({
  eyebrow,
  title,
  subtitle,
  badges,
  actions,
}: PremiumPageHeaderProps) {
  return (
    <header className="nvi-page-header nvi-reveal">
      <div className="nvi-page-header__copy">
        {eyebrow ? <p className="nvi-page-eyebrow">{eyebrow}</p> : null}
        <h2 className="nvi-page-title">{title}</h2>
        {subtitle ? <p className="nvi-page-subtitle">{subtitle}</p> : null}
      </div>
      <div className="nvi-page-header__side">
        {badges ? <div className="nvi-page-badges">{badges}</div> : null}
        {actions ? <div className="nvi-page-actions">{actions}</div> : null}
      </div>
    </header>
  );
}
