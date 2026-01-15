'use client';

import { useEffect, useMemo, useState } from 'react';

type TypeaheadOption = {
  id: string;
  label: string;
};

type TypeaheadInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (option: TypeaheadOption) => void;
  options: TypeaheadOption[];
  placeholder?: string;
  className?: string;
  onEnter?: () => void;
};

export function TypeaheadInput({
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  className,
  onEnter,
}: TypeaheadInputProps) {
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), 200);
    return () => window.clearTimeout(timer);
  }, [value]);

  const filtered = useMemo(() => {
    const query = debounced.trim().toLowerCase();
    if (!query) {
      return options.slice(0, 8);
    }
    return options
      .filter((option) => option.label.toLowerCase().includes(query))
      .slice(0, 8);
  }, [options, debounced]);

  const highlight = (label: string) => {
    const query = debounced.trim().toLowerCase();
    if (!query) {
      return label;
    }
    const index = label.toLowerCase().indexOf(query);
    if (index < 0) {
      return label;
    }
    return (
      <>
        {label.slice(0, index)}
        <span className="text-[color:var(--accent)]">
          {label.slice(index, index + query.length)}
        </span>
        {label.slice(index + query.length)}
      </>
    );
  };

  const topOption = filtered[0];

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && topOption) {
            event.preventDefault();
            onSelect(topOption);
            setOpen(false);
            return;
          }
          if (event.key === 'Enter' && onEnter) {
            event.preventDefault();
            onEnter();
          }
        }}
        placeholder={placeholder}
        className={className}
      />
      {open && filtered.length ? (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-2 shadow-xl">
          {filtered.map((option) => (
            <button
              key={option.id}
              type="button"
              onMouseDown={() => onSelect(option)}
              className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-[color:var(--foreground)] hover:bg-[color:var(--accent-soft)]"
            >
              <span>{highlight(option.label)}</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                ⏎
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
