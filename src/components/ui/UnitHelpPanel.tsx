'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type UnitHelpPanelProps = {
  /** 'full' shows the complete explanation panel; 'hint' shows a one-line dynamic hint */
  mode?: 'full' | 'hint';
  /** For hint mode: the resolved base unit label */
  baseUnitLabel?: string;
  /** For hint mode: the resolved sell unit label */
  sellUnitLabel?: string;
  /** For hint mode: the conversion factor */
  conversionFactor?: number;
  /** For hint mode: the quantity entered */
  quantity?: number;
  className?: string;
};

export function UnitHelpPanel({
  mode = 'full',
  baseUnitLabel,
  sellUnitLabel,
  conversionFactor,
  quantity,
  className = '',
}: UnitHelpPanelProps) {
  const t = useTranslations('unitHelp');
  const [open, setOpen] = useState(false);

  if (mode === 'hint') {
    if (
      !baseUnitLabel ||
      !sellUnitLabel ||
      !conversionFactor ||
      conversionFactor === 1
    ) {
      return null;
    }
    const baseQty =
      quantity && quantity > 0 ? quantity * conversionFactor : conversionFactor;
    const sellQty = quantity && quantity > 0 ? quantity : 1;
    return (
      <p className={`text-[10px] text-gold-400 ${className}`}>
        {t('dynamicHint', {
          sellQty,
          sellUnit: sellUnitLabel,
          baseQty,
          baseUnit: baseUnitLabel,
        })}
      </p>
    );
  }

  return (
    <div className={`rounded border border-gold-700/30 bg-black/30 text-xs ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-gold-300 hover:text-gold-100"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-sm">💡</span>
          {t('title')}
        </span>
        <span
          className={`text-gold-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-gold-700/20 px-3 py-3 text-gold-300">
          <p className="font-medium text-gold-100">{t('tip')}</p>

          <div className="space-y-1.5">
            <p>
              <span className="font-medium text-gold-200">{t('baseUnitLabel')}:</span>{' '}
              {t('baseUnitDesc')}
            </p>
            <p>
              <span className="font-medium text-gold-200">{t('sellUnitLabel')}:</span>{' '}
              {t('sellUnitDesc')}
            </p>
            <p>
              <span className="font-medium text-gold-200">{t('factorLabel')}:</span>{' '}
              {t('factorDesc')}
            </p>
          </div>

          <div className="rounded border border-gold-700/20 bg-black/40 p-2.5 space-y-1">
            <p className="font-medium text-gold-200">{t('exampleTitle')}</p>
            <p>{t('exampleScenario')}</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>{t('exampleBase')}</li>
              <li>{t('exampleSell')}</li>
              <li>{t('exampleFactor')}</li>
            </ul>
            <p className="text-gold-200">{t('exampleResult')}</p>
            <p className="text-gold-200">{t('examplePrice')}</p>
          </div>

          <div className="rounded border border-amber-700/30 bg-amber-500/5 p-2.5">
            <p className="font-medium text-gold-200">{t('simpleTitle')}</p>
            <p>{t('simpleDesc')}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
