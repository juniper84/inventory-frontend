'use client';

import { ReactNode } from 'react';

/**
 * NarrativeCard — Hero summary sentence at the top of each report section.
 * Turns raw numbers into a story: "You earned X, up Y%, driven by Z."
 */

export type NarrativeCardProps = {
  eyebrow?: string;
  headline: ReactNode;
  subline?: ReactNode;
  accent?: 'gold' | 'teal' | 'green' | 'red' | 'amber';
  badge?: string;
  className?: string;
};

export function NarrativeCard({
  eyebrow,
  headline,
  subline,
  accent = 'gold',
  badge,
  className = '',
}: NarrativeCardProps) {
  return (
    <div className={`rpt-narrative rpt-narrative--${accent} ${className}`}>
      <div className="rpt-narrative__body">
        {eyebrow && <div className="rpt-narrative__eyebrow">{eyebrow}</div>}
        <div className="rpt-narrative__headline">{headline}</div>
        {subline && <div className="rpt-narrative__subline">{subline}</div>}
      </div>
      {badge && <span className="rpt-narrative__badge">{badge}</span>}
    </div>
  );
}
