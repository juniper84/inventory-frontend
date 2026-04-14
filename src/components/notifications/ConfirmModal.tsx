'use client';

import { useId } from 'react';
import { ModalSurface } from './ModalSurface';
import { SeverityIcon } from './icons';
import type { ConfirmOptions } from './types';

type Props = {
  open: boolean;
  options: ConfirmOptions;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  options,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const msgId = useId();
  const severity = options.severity ?? 'info';
  const isDanger = severity === 'danger';
  const iconSeverity = isDanger ? 'error' : severity;

  return (
    <ModalSurface
      open={open}
      onClose={onCancel}
      disableBackdropClose={isDanger}
      labelledBy={titleId}
      describedBy={msgId}
    >
      <div className={`nvi-modal nvi-modal--${severity}`}>
        <div className="nvi-modal__header">
          <div className={`nvi-modal__icon nvi-modal__icon--${iconSeverity}`}>
            <SeverityIcon severity={iconSeverity} className="nvi-modal__icon-svg" />
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
        <div className="nvi-modal__actions">
          <button
            type="button"
            className="nvi-modal__btn nvi-modal__btn--ghost"
            onClick={onCancel}
          >
            {options.cancelText ?? cancelLabel}
          </button>
          <button
            type="button"
            className={`nvi-modal__btn nvi-modal__btn--primary nvi-modal__btn--${severity}`}
            onClick={onConfirm}
          >
            {options.confirmText ?? confirmLabel}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
