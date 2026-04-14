'use client';

import type { ReactNode } from 'react';

const paddingMap = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
} as const;

export type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: keyof typeof paddingMap;
  glow?: boolean;
  animate?: boolean;
  as?: 'div' | 'article' | 'section';
  onClick?: (e: React.MouseEvent) => void;
};

/**
 * Standard card container. Replaces the `command-card nvi-panel` CSS combo.
 * Uses the `.nvi-card` CSS class (rounded-2xl, token-based border/shadow).
 */
export function Card({
  children,
  className = '',
  padding = 'md',
  glow = true,
  animate = true,
  as: Tag = 'div',
  onClick,
}: CardProps) {
  const classes = [
    'nvi-card',
    glow ? 'nvi-card--glow' : '',
    paddingMap[padding],
    animate ? 'nvi-reveal' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <Tag className={classes} onClick={onClick}>{children}</Tag>;
}
