'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DayPicker } from 'react-day-picker';
import { createPortal } from 'react-dom';

type DatePickerInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');
const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function DatePickerInput({
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: DatePickerInputProps) {
  const common = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties | null>(
    null,
  );
  const anchorRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
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

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        anchorRef.current?.contains(target) ||
        portalRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setPortalStyle(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reposition on scroll or resize
  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePortalStyle();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  return (
    <div className="relative" ref={anchorRef}>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => {
            const v = event.target.value;
            if (v && !DATE_REGEX.test(v)) {
              onChange('');
            }
          }}
          placeholder={placeholder}
          className={className}
          disabled={disabled}
        />
        <button
          type="button"
          disabled={disabled}
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
              ref={portalRef}
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
                  setPortalStyle(null);
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
