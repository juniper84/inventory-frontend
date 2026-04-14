'use client';

/**
 * BreakdownBars — Horizontal list of labeled bars with values.
 * Best for: Top Products, Sales by Branch, Expense Categories.
 */

export type BreakdownBarItem = {
  label: string;
  value: number;
  display: string;
  color?: string;
};

export type BreakdownBarsProps = {
  title: string;
  badge?: string;
  items: BreakdownBarItem[];
  emptyMessage?: string;
  className?: string;
};

export function BreakdownBars({
  title,
  badge,
  items,
  emptyMessage = 'No data',
  className = '',
}: BreakdownBarsProps) {
  const max = Math.max(1, ...items.map((i) => i.value));

  const titleId = `rpt-breakdown-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section className={`rpt-breakdown ${className}`} aria-labelledby={titleId}>
      <div className="rpt-breakdown__header">
        <h3 id={titleId} className="rpt-breakdown__title">{title}</h3>
        {badge && <span className="rpt-breakdown__badge" aria-hidden="true">{badge}</span>}
      </div>
      {items.length === 0 ? (
        <p className="rpt-breakdown__empty" role="status">{emptyMessage}</p>
      ) : (
        <ul className="rpt-breakdown__items">
          {items.map((item, i) => {
            const pct = (item.value / max) * 100;
            return (
              <li
                key={`${item.label}-${i}`}
                className="rpt-breakdown__row"
                aria-label={`${item.label}: ${item.display}`}
              >
                <div className="rpt-breakdown__row-top">
                  <span className="rpt-breakdown__label">{item.label}</span>
                  <span className="rpt-breakdown__value">{item.display}</span>
                </div>
                <div
                  className="rpt-breakdown__track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pct)}
                  aria-label={`${item.label} share`}
                >
                  <div
                    className="rpt-breakdown__fill"
                    style={{
                      width: `${pct}%`,
                      background: item.color
                        ? `linear-gradient(90deg, ${item.color}, ${item.color}88)`
                        : undefined,
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
