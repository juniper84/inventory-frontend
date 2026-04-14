'use client';

export type FontScale = 'small' | 'default' | 'large' | 'xl';

export const FONT_SCALE_VALUES: Record<FontScale, number> = {
  small: 0.9,
  default: 1,
  large: 1.1,
  xl: 1.25,
};

export const FONT_SCALE_LABELS: Record<FontScale, string> = {
  small: 'Small',
  default: 'Default',
  large: 'Large',
  xl: 'Extra Large',
};

const STORAGE_KEY = 'nvi.font-scale';

export function getStoredFontScale(): FontScale {
  if (typeof window === 'undefined') return 'default';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored in FONT_SCALE_VALUES) return stored as FontScale;
  return 'default';
}

export function setFontScale(scale: FontScale) {
  localStorage.setItem(STORAGE_KEY, scale);
  applyFontScale(scale);
}

export function applyFontScale(scale: FontScale) {
  const value = FONT_SCALE_VALUES[scale] ?? 1;
  document.documentElement.style.setProperty('--font-scale', String(value));
}

/** Call on app mount to apply saved preference */
export function initFontScale() {
  const scale = getStoredFontScale();
  applyFontScale(scale);
}
