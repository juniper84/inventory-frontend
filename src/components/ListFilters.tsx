'use client';

import { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { TypeaheadInput } from '@/components/TypeaheadInput';
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
  return (
    <div className="space-y-3 nvi-reveal">
      <div className="flex flex-wrap items-center gap-2">
        <TypeaheadInput
          value={searchValue}
          onChange={onSearchChange}
          onSelect={(option) => onSearchChange(option.label)}
          onEnter={onSearchSubmit}
          options={[]}
          placeholder={placeholder ?? t('search')}
          className="min-w-[220px] flex-1 rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <button
          type="button"
          onClick={onSearchSubmit}
          className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={Boolean(isLoading)}
        >
          {isLoading ? <Spinner size="xs" variant="orbit" /> : null}
          {t('search')}
        </button>
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="rounded border border-gold-700/50 px-3 py-2 text-sm text-gold-100"
            disabled={Boolean(isLoading)}
          >
            {t('reset')}
          </button>
        ) : null}
        {hasAdvanced && onToggleAdvanced ? (
          <button
            type="button"
            onClick={onToggleAdvanced}
            className="rounded border border-gold-700/50 px-3 py-2 text-sm text-gold-100"
          >
            {showAdvanced ? t('hideFilters') : t('filters')}
          </button>
        ) : null}
      </div>
      {hasAdvanced && showAdvanced ? (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 nvi-stagger">
          {children}
        </div>
      ) : null}
    </div>
  );
}
