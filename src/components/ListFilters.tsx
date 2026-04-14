'use client';

import { ReactNode, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/Spinner';

type ListFiltersProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit?: () => void;
  onReset?: () => void;
  isLoading?: boolean;
  showAdvanced?: boolean;
  onToggleAdvanced?: () => void;
  placeholder?: string;
  children?: ReactNode;
};

/**
 * Centralized search + filter bar for list pages.
 * Search triggers ONLY on Enter key or Search button click — not on every keystroke.
 * Advanced filters (children) apply immediately via their own onChange handlers.
 */
export function ListFilters({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  onReset,
  isLoading,
  showAdvanced,
  onToggleAdvanced,
  placeholder,
  children,
}: ListFiltersProps) {
  const t = useTranslations('actions');
  const hasAdvanced = Boolean(children);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && onSearchSubmit) {
        e.preventDefault();
        onSearchSubmit();
      }
    },
    [onSearchSubmit],
  );

  return (
    <div className="space-y-3 nvi-reveal">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input with icon */}
        <div className="relative min-w-[220px] flex-1">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Icon name="Search" size={16} className="text-white/30" />
          </div>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? t('search')}
            className="w-full rounded-xl border border-[var(--nvi-border)] bg-[#13121a] pl-9 pr-3 py-2.5 text-sm text-[var(--nvi-text)] placeholder:text-white/30 outline-none transition-colors focus:border-gold-500/30 focus:ring-1 focus:ring-gold-500/20 nvi-focus-pulse"
          />
        </div>

        {/* Search button */}
        <button
          type="button"
          onClick={onSearchSubmit}
          className="nvi-press inline-flex items-center gap-2 rounded-xl bg-gold-500 px-4 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={Boolean(isLoading)}
        >
          {isLoading ? <Spinner size="xs" variant="orbit" /> : <Icon name="Search" size={15} className="text-black" />}
          {t('search')}
        </button>

        {/* Reset button */}
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-2.5 text-sm text-white/60 transition-colors hover:border-white/20 hover:text-white/80"
            disabled={Boolean(isLoading)}
          >
            <Icon name="RotateCcw" size={14} />
            {t('reset')}
          </button>
        ) : null}

        {/* Filters toggle */}
        {hasAdvanced && onToggleAdvanced ? (
          <button
            type="button"
            onClick={onToggleAdvanced}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-2.5 text-sm text-white/60 transition-colors hover:border-white/20 hover:text-white/80"
          >
            <Icon name="SlidersHorizontal" size={14} />
            {showAdvanced ? t('hideFilters') : t('filters')}
          </button>
        ) : null}
      </div>

      {/* Advanced filters */}
      {hasAdvanced && showAdvanced ? (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 nvi-stagger">
          {children}
        </div>
      ) : null}
    </div>
  );
}
