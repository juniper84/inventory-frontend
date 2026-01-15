'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DayPicker } from 'react-day-picker';
import { createPortal } from 'react-dom';

type DateTimePickerInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const hourOptions = Array.from({ length: 24 }, (_, index) => pad2(index));
const minuteOptions = Array.from({ length: 12 }, (_, index) =>
  pad2(index * 5),
);

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const parseValue = (value: string) => {
  if (!value) {
    return { datePart: '', hours: '09', minutes: '00' };
  }
  const [datePart, timePart] = value.split('T');
  if (!datePart) {
    return { datePart: '', hours: '09', minutes: '00' };
  }
  if (timePart) {
    const [hours, minutes] = timePart.split(':');
    return {
      datePart,
      hours: hours?.slice(0, 2) ?? '09',
      minutes: minutes?.slice(0, 2) ?? '00',
    };
  }
  return { datePart, hours: '09', minutes: '00' };
};

export function DateTimePickerInput({
  value,
  onChange,
  placeholder,
  className,
}: DateTimePickerInputProps) {
  const common = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties | null>(
    null,
  );
  const anchorRef = useRef<HTMLDivElement>(null);
  const parsed = useMemo(() => parseValue(value), [value]);
  const selected = useMemo(
    () =>
      parsed.datePart
        ? new Date(`${parsed.datePart}T${parsed.hours}:${parsed.minutes}:00`)
        : undefined,
    [parsed.datePart, parsed.hours, parsed.minutes],
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

  const setDatePart = (date: Date) => {
    onChange(`${formatDate(date)}T${parsed.hours}:${parsed.minutes}`);
  };

  const setTimePart = (hours: string, minutes: string) => {
    if (!parsed.datePart) {
      return;
    }
    onChange(`${parsed.datePart}T${hours}:${minutes}`);
  };

  return (
    <div className="relative" ref={anchorRef}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={parsed.datePart}
          readOnly
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
        <select
          value={parsed.hours}
          onChange={(event) => setTimePart(event.target.value, parsed.minutes)}
          disabled={!parsed.datePart}
          className="rounded border border-[color:var(--border)] bg-black px-2 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {hourOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span className="text-xs text-gold-400">:</span>
        <select
          value={parsed.minutes}
          onChange={(event) => setTimePart(parsed.hours, event.target.value)}
          disabled={!parsed.datePart}
          className="rounded border border-[color:var(--border)] bg-black px-2 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {minuteOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
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
                    setDatePart(date);
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
