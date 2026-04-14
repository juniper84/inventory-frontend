'use client';

import { icons } from 'lucide-react';

export type IconName = keyof typeof icons;

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
};

/**
 * Thin wrapper around Lucide icons.
 * Color via className (e.g. `text-gold-400`), default size 16px (h-4 w-4).
 */
export function Icon({ name, size = 16, className }: IconProps) {
  const LucideIcon = icons[name];
  if (!LucideIcon) return null;
  return <LucideIcon size={size} className={className} />;
}
