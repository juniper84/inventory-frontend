'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { Spinner } from '@/components/Spinner';

export type PaymentFormState = {
  purchaseId: string;
  method: string;
  amount: string;
  reference: string;
  methodLabel: string;
};

type Props = {
  open: boolean;
  onClose: () => void;

  form: PaymentFormState;
  onFormChange: (next: PaymentFormState) => void;

  /** Remaining amount to collect (for the header). */
  remaining: number;
  /** Human-readable identifier for the purchase being paid (for the header). */
  purchaseLabel?: string | null;

  onSubmit: () => void;
  isRecording: boolean;
};

function fmtNum(n: number | string): string {
  const val = Number(n);
  if (Number.isNaN(val)) return String(n);
  return val.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function PurchasePaymentModal({
  open,
  onClose,
  form,
  onFormChange,
  remaining,
  purchaseLabel,
  onSubmit,
  isRecording,
}: Props) {
  const t = useTranslations('purchasesPage');
  const actions = useTranslations('actions');

  return (
    <ModalSurface open={open} onClose={onClose} labelledBy="purchase-pay-title">
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              id="purchase-pay-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('paymentTitle')}
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--muted)]">
              {purchaseLabel ? `${purchaseLabel} · ` : ''}
              <span className="text-red-400 tabular-nums">
                {fmtNum(remaining)}
              </span>{' '}
              {t('remaining') || 'remaining'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="nvi-press rounded-xl border border-[color:var(--border)] px-2.5 py-1.5 text-[color:var(--muted)]"
            aria-label="Close"
          >
            <Icon name="X" size={14} />
          </button>
        </div>
      </div>

      <div className="nvi-modal-panel__body space-y-3">
        <SmartSelect
          instanceId={`pay-method-${form.purchaseId}`}
          value={form.method}
          onChange={(value) => onFormChange({ ...form, method: value })}
          options={[
            { value: 'CASH', label: t('paymentCash') },
            { value: 'CARD', label: t('paymentCard') },
            { value: 'MOBILE_MONEY', label: t('paymentMobileMoney') },
            { value: 'BANK_TRANSFER', label: t('paymentBankTransfer') },
            { value: 'OTHER', label: t('paymentOther') },
          ]}
          className="nvi-select-container"
        />
        <CurrencyInput
          value={form.amount}
          onChange={(value) => onFormChange({ ...form, amount: value })}
          placeholder={t('amount')}
          className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-text)]"
        />
        {form.method === 'BANK_TRANSFER' || form.method === 'MOBILE_MONEY' ? (
          <TextInput
            value={form.reference}
            onChange={(e) => onFormChange({ ...form, reference: e.target.value })}
            placeholder={t('referenceOptional')}
          />
        ) : null}
        {form.method === 'OTHER' ? (
          <TextInput
            value={form.methodLabel}
            onChange={(e) =>
              onFormChange({ ...form, methodLabel: e.target.value })
            }
            placeholder={t('methodLabelOptional')}
          />
        ) : null}
      </div>

      <div className="nvi-modal-panel__footer">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="nvi-press rounded-xl border border-[var(--nvi-border)] px-4 py-2 text-xs text-[color:var(--muted)]"
          >
            {actions('cancel') || 'Cancel'}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isRecording || !form.amount}
            className="nvi-cta nvi-press rounded-xl px-4 py-2 text-xs font-semibold text-black disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-1.5">
              {isRecording ? (
                <Spinner size="xs" variant="pulse" />
              ) : (
                <Icon name="Check" size={12} />
              )}
              {isRecording ? t('recording') : t('recordPayment')}
            </span>
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
