type ViewMode = 'cards' | 'table' | 'timeline';

type ViewToggleProps = {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
  labels: { cards: string; table: string; timeline?: string };
};

export function ViewToggle({ value, onChange, labels }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-full border border-gold-700/40 bg-black/60 p-1 text-xs">
      <button
        type="button"
        onClick={() => onChange('cards')}
        className={`rounded-full px-3 py-1 font-semibold transition ${
          value === 'cards'
            ? 'bg-gold-500 text-black'
            : 'text-gold-200 hover:text-gold-100'
        }`}
      >
        {labels.cards}
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        className={`rounded-full px-3 py-1 font-semibold transition ${
          value === 'table'
            ? 'bg-gold-500 text-black'
            : 'text-gold-200 hover:text-gold-100'
        }`}
      >
        {labels.table}
      </button>
      {labels.timeline ? (
        <button
          type="button"
          onClick={() => onChange('timeline')}
          className={`rounded-full px-3 py-1 font-semibold transition ${
            value === 'timeline'
              ? 'bg-gold-500 text-black'
              : 'text-gold-200 hover:text-gold-100'
          }`}
        >
          {labels.timeline}
        </button>
      ) : null}
    </div>
  );
}

export type { ViewMode };
