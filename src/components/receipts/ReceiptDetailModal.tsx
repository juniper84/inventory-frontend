'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { ReceiptPreview } from '@/components/receipts/ReceiptPreview';
import { Card, Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { Spinner } from '@/components/Spinner';
import { formatCurrency } from '@/lib/business-context';
import type { ReceiptData as ReceiptPrintData } from '@/lib/receipt-print';

type Receipt = {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  sale?: {
    id: string;
    total?: number | string;
    paidAmount?: number | string;
    outstandingAmount?: number | string;
    creditDueDate?: string | null;
  };
};

type SettlementState = {
  amount: string;
  method: string;
  reference: string;
  methodLabel: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  receipt: Receipt | null;
  previewMode: 'compact' | 'detailed';
  onPreviewModeChange: (mode: 'compact' | 'detailed') => void;
  previewData: ReceiptPrintData | null;

  isReprinting: boolean;
  onReprint: () => void;
  canRead: boolean;

  outstandingAmount: number;
  dueDateLabel: string | null;
  currency: string;

  settlement: SettlementState;
  onSettlementChange: (next: SettlementState) => void;
  onSubmitSettlement: () => void;
  isSettling: boolean;
  canSettleCredit: boolean;

  refundReason: string;
  onRefundReasonChange: (value: string) => void;
  refundReturnToStock: boolean;
  onRefundReturnToStockChange: (value: boolean) => void;
  onRefund: () => void;
  isRefunding: boolean;
  canRefund: boolean;
};

export function ReceiptDetailModal({
  open,
  onClose,
  receipt,
  previewMode,
  onPreviewModeChange,
  previewData,
  isReprinting,
  onReprint,
  canRead,
  outstandingAmount,
  dueDateLabel,
  currency,
  settlement,
  onSettlementChange,
  onSubmitSettlement,
  isSettling,
  canSettleCredit,
  refundReason,
  onRefundReasonChange,
  refundReturnToStock,
  onRefundReturnToStockChange,
  onRefund,
  isRefunding,
  canRefund,
}: Props) {
  const t = useTranslations('receiptsPage');
  const previewT = useTranslations('receiptPreview');
  const noAccess = useTranslations('noAccess');

  if (!receipt) return null;

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="receipt-detail-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              id="receipt-detail-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {previewT('title')}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[color:var(--muted)]">
              <Icon name="Hash" size={12} />
              <span className="font-mono">{receipt.receiptNumber}</span>
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

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onPreviewModeChange('compact')}
            className={`nvi-press rounded-xl border px-3 py-1.5 ${
              previewMode === 'compact'
                ? 'border-[color:var(--accent)] text-[color:var(--foreground)]'
                : 'border-[color:var(--border)] text-[color:var(--muted)]'
            }`}
          >
            {previewT('compact')}
          </button>
          <button
            type="button"
            onClick={() => onPreviewModeChange('detailed')}
            className={`nvi-press rounded-xl border px-3 py-1.5 ${
              previewMode === 'detailed'
                ? 'border-[color:var(--accent)] text-[color:var(--foreground)]'
                : 'border-[color:var(--border)] text-[color:var(--muted)]'
            }`}
          >
            {previewT('detailed')}
          </button>
          <button
            type="button"
            onClick={onReprint}
            disabled={!canRead || isReprinting}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--border)] px-3 py-1.5 text-[color:var(--foreground)] disabled:opacity-40"
          >
            <Icon name="Printer" size={14} />
            {isReprinting ? t('reprinting') : t('reprint')}
          </button>
        </div>
      </div>

      <div className="nvi-modal-panel__body space-y-4">
        <ReceiptPreview
          receiptNumber={receipt.receiptNumber}
          issuedAt={receipt.issuedAt}
          data={previewData ?? undefined}
          mode={previewMode}
        />

        {receipt.sale && outstandingAmount > 0 ? (
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Icon name="DollarSign" size={18} className="text-amber-400" />
              <h3 className="text-base font-semibold text-[color:var(--foreground)]">
                {t('settlementTitle')}
              </h3>
            </div>
            <p className="mb-3 text-xs text-[color:var(--muted)]">
              {t('outstandingLabel', {
                amount: formatCurrency(outstandingAmount, currency),
                due: dueDateLabel ?? '',
              })}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <SmartSelect
                instanceId="receipts-settlement-method"
                value={settlement.method}
                onChange={(value) =>
                  onSettlementChange({ ...settlement, method: value })
                }
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
                value={settlement.amount}
                onChange={(value) =>
                  onSettlementChange({ ...settlement, amount: value })
                }
                placeholder={t('amount')}
                className="rounded-xl border border-[color:var(--border)] bg-black px-3 py-2 text-xs text-[color:var(--foreground)]"
              />
              {settlement.method === 'OTHER' ? (
                <TextInput
                  value={settlement.methodLabel}
                  onChange={(event) =>
                    onSettlementChange({
                      ...settlement,
                      methodLabel: event.target.value,
                    })
                  }
                  label={t('paymentLabel')}
                  placeholder={t('paymentLabel')}
                />
              ) : null}
              <TextInput
                value={settlement.reference}
                onChange={(event) =>
                  onSettlementChange({
                    ...settlement,
                    reference: event.target.value,
                  })
                }
                label={t('referenceOptional')}
                placeholder={t('referenceOptional')}
              />
            </div>
            <button
              type="button"
              onClick={onSubmitSettlement}
              className="nvi-press mt-3 inline-flex items-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
              disabled={!canSettleCredit || isSettling}
              title={!canSettleCredit ? noAccess('title') : undefined}
            >
              {isSettling ? (
                <Spinner size="xs" variant="pulse" />
              ) : (
                <Icon name="DollarSign" size={14} />
              )}
              {isSettling ? t('recording') : t('recordSettlement')}
            </button>
          </Card>
        ) : null}

        {receipt.sale ? (
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Icon name="RotateCcw" size={18} className="text-red-400" />
              <h3 className="text-base font-semibold text-[color:var(--foreground)]">
                {t('refundTitle')}
              </h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <TextInput
                value={refundReason}
                onChange={(event) => onRefundReasonChange(event.target.value)}
                label={t('refundReasonOptional')}
                placeholder={t('refundReasonOptional')}
              />
              <label className="flex items-center gap-2 self-end pb-2 text-xs text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={refundReturnToStock}
                  onChange={(event) =>
                    onRefundReturnToStockChange(event.target.checked)
                  }
                  className="accent-[color:var(--accent)]"
                />
                {t('returnToStock')}
              </label>
            </div>
            <button
              type="button"
              onClick={onRefund}
              className="nvi-press nvi-danger-outline mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-70"
              disabled={!canRefund || isRefunding}
              title={!canRefund ? noAccess('title') : undefined}
            >
              {isRefunding ? (
                <Spinner size="xs" variant="pulse" />
              ) : (
                <Icon name="RotateCcw" size={14} />
              )}
              {isRefunding ? t('refunding') : t('refundSale')}
            </button>
          </Card>
        ) : null}
      </div>
    </ModalSurface>
  );
}
