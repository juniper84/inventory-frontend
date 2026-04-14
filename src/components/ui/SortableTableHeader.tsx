'use client';

export type SortDirection = 'asc' | 'desc' | null;

type SortableTableHeaderProps = {
  label: string;
  sortKey: string;
  currentSortKey: string | null;
  currentDirection: SortDirection;
  onSort: (key: string, direction: SortDirection) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
};

export function SortableTableHeader({
  label,
  sortKey,
  currentSortKey,
  currentDirection,
  onSort,
  align = 'left',
  className = '',
}: SortableTableHeaderProps) {
  const isActive = currentSortKey === sortKey;

  const handleClick = () => {
    if (!isActive) {
      onSort(sortKey, 'asc');
    } else if (currentDirection === 'asc') {
      onSort(sortKey, 'desc');
    } else {
      onSort(sortKey, null);
    }
  };

  const alignClass =
    align === 'right' ? 'text-right justify-end' : align === 'center' ? 'text-center justify-center' : 'text-left';

  return (
    <th className={`px-3 py-2 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[color:var(--muted)] hover:text-[color:var(--foreground)] transition-colors ${alignClass}`}
      >
        {label}
        <span className="inline-flex flex-col text-[8px] leading-none">
          <span className={isActive && currentDirection === 'asc' ? 'text-[color:var(--accent)]' : 'opacity-30'}>▲</span>
          <span className={isActive && currentDirection === 'desc' ? 'text-[color:var(--accent)]' : 'opacity-30'}>▼</span>
        </span>
      </button>
    </th>
  );
}
