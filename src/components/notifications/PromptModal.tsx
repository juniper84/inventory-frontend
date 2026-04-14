'use client';

import { useEffect, useId, useState } from 'react';
import { ModalSurface } from './ModalSurface';
import { SeverityIcon } from './icons';
import type { PromptOptions } from './types';

type Props = {
  open: boolean;
  options: PromptOptions;
  confirmLabel: string;
  cancelLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

export function PromptModal({
  open,
  options,
  confirmLabel,
  cancelLabel,
  onSubmit,
  onCancel,
}: Props) {
  const titleId = useId();
  const msgId = useId();
  const inputId = useId();
  const [value, setValue] = useState(options.defaultValue ?? '');
  const severity = options.severity ?? 'info';

  useEffect(() => {
    if (open) setValue(options.defaultValue ?? '');
  }, [open, options.defaultValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };

  return (
    <ModalSurface
      open={open}
      onClose={onCancel}
      labelledBy={titleId}
      describedBy={msgId}
    >
      <form onSubmit={handleSubmit} className={`nvi-modal nvi-modal--${severity}`}>
        <div className="nvi-modal__header">
          <div className={`nvi-modal__icon nvi-modal__icon--${severity}`}>
            <SeverityIcon severity={severity} className="nvi-modal__icon-svg" />
          </div>
          <div className="nvi-modal__header-text">
            <h3 id={titleId} className="nvi-modal__title">
              {options.title ?? confirmLabel}
            </h3>
            <p id={msgId} className="nvi-modal__message">
              {options.message}
            </p>
          </div>
        </div>
        <div className="nvi-modal__body">
          <label htmlFor={inputId} className="nvi-modal__label">
            {options.placeholder ?? ''}
          </label>
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={options.placeholder}
            className="nvi-modal__input"
            autoFocus
          />
        </div>
        <div className="nvi-modal__actions">
          <button
            type="button"
            className="nvi-modal__btn nvi-modal__btn--ghost"
            onClick={onCancel}
          >
            {options.cancelText ?? cancelLabel}
          </button>
          <button
            type="submit"
            className={`nvi-modal__btn nvi-modal__btn--primary nvi-modal__btn--${severity}`}
          >
            {options.confirmText ?? confirmLabel}
          </button>
        </div>
      </form>
    </ModalSurface>
  );
}
