'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DayPicker } from 'react-day-picker';
import { createPortal } from 'react-dom';

type DatePickerInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

const formatDate = (date: Date) =>
  date.toISOString().slice(0, 10);

export function DatePickerInput({
  value,
  onChange,
  placeholder,
  className,
}: DatePickerInputProps) {
  const common = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties | null>(
    null,
  );
  const anchorRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(
    () => (value ? new Date(`${value}T00:00:00`) : undefined),
    [value],
  );

  const updatePortalStyle = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) {
      setPortalStyle(null);
      return;
    }
    setPortalStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      left: rect.left,
      zIndex: 140,
    });
  };

  return (
    <div className="relative" ref={anchorRef}>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={className}
        />
        <button
          type="button"
          onClick={() =>
            setOpen((prev) => {
              const next = !prev;
              if (next) {
                updatePortalStyle();
              } else {
                setPortalStyle(null);
              }
              return next;
            })
          }
          className="rounded border border-[color:var(--border)] px-2 py-2 text-xs text-[color:var(--foreground)]"
          aria-label={common('openCalendar')}
        >
          📅
        </button>
      </div>
      {open && portalStyle
        ? createPortal(
            <div
              style={portalStyle}
              className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 shadow-xl"
            >
              <DayPicker
                mode="single"
                selected={selected}
                onSelect={(date) => {
                  if (date) {
                    onChange(formatDate(date));
                  }
                  setOpen(false);
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
