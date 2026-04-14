'use client';

/**
 * RankedList — Numbered ranked items with medals for top 3.
 * Best for: Top Products, Top Customers, Staff Performance.
 */

export type RankedItem = {
  id: string;
  name: string;
  value: string;
  sub?: string;
};

export type RankedListProps = {
  title: string;
  badge?: string;
  items: RankedItem[];
  emptyMessage?: string;
  className?: string;
};

const MEDAL_COLORS = [
  { bg: 'rgba(246,211,122,0.15)', border: 'rgba(246,211,122,0.4)', text: '#f6d37a' }, // gold
  { bg: 'rgba(192,192,192,0.1)', border: 'rgba(192,192,192,0.3)', text: '#cbd5e1' }, // silver
  { bg: 'rgba(205,127,50,0.1)', border: 'rgba(205,127,50,0.3)', text: '#d97706' }, // bronze
];

export function RankedList({
  title,
  badge,
  items,
  emptyMessage = 'No data',
  className = '',
}: RankedListProps) {
  const titleId = `rpt-ranked-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section className={`rpt-ranked ${className}`} aria-labelledby={titleId}>
      <div className="rpt-ranked__header">
        <h3 id={titleId} className="rpt-ranked__title">{title}</h3>
        {badge && <span className="rpt-ranked__badge" aria-hidden="true">{badge}</span>}
      </div>
      {items.length === 0 ? (
        <p className="rpt-ranked__empty" role="status">{emptyMessage}</p>
      ) : (
        <ol className="rpt-ranked__items">
          {items.map((item, i) => {
            const medal = i < 3 ? MEDAL_COLORS[i] : null;
            return (
              <li
                key={item.id}
                className="rpt-ranked__row"
                style={{ animationDelay: `${i * 50}ms` }}
                aria-label={`Rank ${i + 1}: ${item.name}, ${item.value}${item.sub ? `, ${item.sub}` : ''}`}
              >
                <span
                  className="rpt-ranked__medal"
                  aria-hidden="true"
                  style={
                    medal
                      ? {
                          background: medal.bg,
                          borderColor: medal.border,
                          color: medal.text,
                        }
                      : undefined
                  }
                >
                  {i + 1}
                </span>
                <div className="rpt-ranked__body">
                  <span className="rpt-ranked__name">{item.name}</span>
                  {item.sub && <span className="rpt-ranked__sub">{item.sub}</span>}
                </div>
                <span className="rpt-ranked__value">{item.value}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
