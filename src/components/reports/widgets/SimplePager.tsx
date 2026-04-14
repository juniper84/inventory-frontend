'use client';

export type SimplePagerProps = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
};

export function SimplePager({ page, totalPages, onChange }: SimplePagerProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="rpt-pager">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rpt-pager__btn"
        aria-label="Previous page"
      >
        ‹
      </button>
      <span className="rpt-pager__label">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="rpt-pager__btn"
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}
