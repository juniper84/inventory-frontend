'use client';

import { useId } from 'react';
import { ModalSurface } from './ModalSurface';
import { SeverityIcon } from './icons';
import type { AlertOptions } from './types';

type Props = {
  open: boolean;
  options: AlertOptions;
  okLabel: string;
  onClose: () => void;
};

export function AlertModal({ open, options, okLabel, onClose }: Props) {
  const titleId = useId();
  const msgId = useId();
  const severity = options.severity ?? 'info';

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={msgId}
    >
      <div className={`nvi-modal nvi-modal--${severity}`}>
        <div className="nvi-modal__header">
          <div className={`nvi-modal__icon nvi-modal__icon--${severity}`}>
            <SeverityIcon severity={severity} className="nvi-modal__icon-svg" />
          </div>
          <div className="nvi-modal__header-text">
            <h3 id={titleId} className="nvi-modal__title">
              {options.title ?? okLabel}
            </h3>
            <p id={msgId} className="nvi-modal__message">
              {options.message}
            </p>
          </div>
        </div>
        <div className="nvi-modal__actions">
          <button
            type="button"
            className={`nvi-modal__btn nvi-modal__btn--primary nvi-modal__btn--${severity}`}
            onClick={onClose}
          >
            {options.confirmText ?? okLabel}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
