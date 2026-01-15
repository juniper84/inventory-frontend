'use client';

import { useTranslations } from 'next-intl';
import { Spinner } from '@/components/Spinner';

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total?: number | null;
  itemCount: number;
  availablePages: number[];
  hasNext: boolean;
  hasPrev: boolean;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
};

export function PaginationControls({
  page,
  pageSize,
  total,
  itemCount,
  availablePages,
  hasNext,
  hasPrev,
  isLoading = false,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationControlsProps) {
  const t = useTranslations('pagination');
  const start = itemCount ? (page - 1) * pageSize + 1 : 0;
  const end = itemCount ? (page - 1) * pageSize + itemCount : 0;
  const totalPages =
    typeof total === 'number' && total >= 0
      ? Math.max(1, Math.ceil(total / pageSize))
      : null;

  const pageSet = new Set(availablePages.filter((value) => value > 0));
  if (hasNext) {
    pageSet.add(page + 1);
  }
  pageSet.add(page);
  const pages = Array.from(pageSet).sort((a, b) => a - b);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gold-300">
      <div className="flex items-center gap-3">
        <span>
          {typeof total === 'number'
            ? t('showingRangeTotal', { start, end, total })
            : t('showingRange', { start, end })}
        </span>
        {totalPages ? (
          <span>{t('pageLabel', { page, pages: totalPages })}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span>{t('perPage')}</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded border border-gold-700/60 bg-black px-2 py-1 text-xs text-gold-100"
            disabled={isLoading}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          {isLoading ? <Spinner size="xs" variant="orbit" /> : null}
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            className="rounded border border-gold-700/50 px-2 py-1 text-xs text-gold-100 disabled:opacity-60"
            disabled={!hasPrev || isLoading}
          >
            {t('prev')}
          </button>
          {pages.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onPageChange(value)}
              className={`rounded px-2 py-1 text-xs ${
                value === page
                  ? 'bg-gold-500 text-black'
                  : 'border border-gold-700/50 text-gold-100'
              }`}
              disabled={value === page || isLoading}
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            className="rounded border border-gold-700/50 px-2 py-1 text-xs text-gold-100 disabled:opacity-60"
            disabled={!hasNext || isLoading}
          >
            {t('next')}
          </button>
        </div>
      </div>
    </div>
  );
}
