'use client';

import { useTranslations } from 'next-intl';
import { formatVariantLabel } from '@/lib/display';
import type { ReceiptData, ReceiptLine } from '@/lib/receipt-print';

type ReceiptPreviewMode = 'compact' | 'detailed';

type ReceiptPreviewProps = {
  receiptNumber: string;
  issuedAt: string;
  data?: ReceiptData | null;
  mode?: ReceiptPreviewMode;
  className?: string;
};

const toNumber = (value: number | string | undefined) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatMoney = (value: number | string | undefined) => {
  const numeric = toNumber(value);
  if (numeric === null) {
    return value ? String(value) : '';
  }
  return numeric.toFixed(2);
};

const resolveLineTotal = (line: ReceiptLine) => {
  if (line.lineTotal !== undefined && line.lineTotal !== null) {
    return formatMoney(line.lineTotal);
  }
  const qty = toNumber(line.quantity);
  const unit = toNumber(line.unitPrice);
  if (qty === null || unit === null) {
    return '';
  }
  return formatMoney(qty * unit);
};

export function ReceiptPreview({
  receiptNumber,
  issuedAt,
  data,
  mode = 'detailed',
  className,
}: ReceiptPreviewProps) {
  const t = useTranslations('receiptPreview');
  if (!data) {
    return (
      <div className={className}>
        <p className="text-sm text-gold-300">{t('noReceiptData')}</p>
      </div>
    );
  }

  const template = (data.receiptTemplate ?? 'THERMAL') as 'THERMAL' | 'A4';
  const isThermal = template === 'THERMAL';
  const showDetailed = mode === 'detailed';
  const totals = data.totals ?? {};
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const totalValue = totals.total ?? '';
  const totalNumber = toNumber(totalValue);
  const paymentTotal = payments.reduce((acc, payment) => {
    const next = toNumber(payment.amount);
    return next === null ? acc : acc + next;
  }, 0);
  const changeAmount =
    totalNumber !== null && paymentTotal > totalNumber
      ? paymentTotal - totalNumber
      : null;

  return (
    <div className={className} data-template={template}>
      <div
        className={`receipt-paper rounded border border-gold-700/30 bg-black/40 p-4 text-gold-100 ${
          isThermal ? 'font-mono text-[11px]' : 'text-sm'
        }`}
      >
        <div className="space-y-1 text-center">
          {data.businessName ? (
            <p className="text-sm font-semibold text-gold-100">
              {data.businessName}
            </p>
          ) : null}
          {data.branchName ? (
            <p className="text-xs text-gold-200">{data.branchName}</p>
          ) : null}
          {showDetailed && data.branchContact ? (
            <p className="text-[10px] text-gold-300">
              {[data.branchContact.address, data.branchContact.phone, data.branchContact.email]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
          {data.receiptHeader ? (
            <p className="text-[10px] text-gold-200">{data.receiptHeader}</p>
          ) : null}
        </div>

        <div className="mt-2 space-y-1 text-[10px] text-gold-300">
          <p>
            {t('receiptNumber', { value: receiptNumber })}
          </p>
          <p>
            {t('issuedAt', { value: new Date(issuedAt).toLocaleString() })}
          </p>
          {showDetailed && data.cashierId ? (
            <p>
              {t('cashier', { value: data.cashierId })}
            </p>
          ) : null}
          {showDetailed && data.customer ? (
            <p>
              {t('customer', {
                name: data.customer.name ?? '—',
                phone: data.customer.phone ?? '—',
                tin: data.customer.tin ?? '—',
              })}
            </p>
          ) : null}
        </div>

        <div className="my-2 border-t border-dashed border-gold-700/40" />

        <div className="space-y-2">
          {(data.lines ?? []).map((line, index) => {
            const label = formatVariantLabel(
              {
                id: line.variantId ?? null,
                name: line.variantName ?? null,
                productName: line.productName ?? null,
              },
              t('itemFallback'),
            );
            const total = resolveLineTotal(line);
            const qty = line.quantity ?? '';
            const unitPrice = formatMoney(line.unitPrice);
            return (
              <div key={`line-${index}`} className="space-y-1">
                <div className="flex items-start justify-between gap-2 text-[11px]">
                  <span className="flex-1 text-gold-100">{label}</span>
                  <span className="text-right text-gold-100">{total}</span>
                </div>
                <div className="flex justify-between text-[10px] text-gold-400">
                  <span>{t('lineDetail', { qty, price: unitPrice })}</span>
                  {showDetailed ? (
                    <span>{t('lineTotal', { value: total || '—' })}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="my-2 border-t border-dashed border-gold-700/40" />

        <div className="space-y-1 text-[11px] text-gold-200">
          {showDetailed && totals.subtotal !== undefined ? (
            <div className="flex justify-between">
              <span>{t('subtotal')}</span>
              <span>{formatMoney(totals.subtotal)}</span>
            </div>
          ) : null}
          {showDetailed && totals.discountTotal !== undefined ? (
            <div className="flex justify-between">
              <span>{t('discounts')}</span>
              <span>{formatMoney(totals.discountTotal)}</span>
            </div>
          ) : null}
          {showDetailed && totals.vatTotal !== undefined ? (
            <div className="flex justify-between">
              <span>{t('vat')}</span>
              <span>{formatMoney(totals.vatTotal)}</span>
            </div>
          ) : null}
          {totalValue !== undefined ? (
            <div className="flex justify-between text-sm font-semibold text-gold-100">
              <span>{t('total')}</span>
              <span>{formatMoney(totalValue)}</span>
            </div>
          ) : null}
        </div>

        {payments.length ? (
          <>
            <div className="my-2 border-t border-dashed border-gold-700/40" />
            <div className="space-y-1 text-[10px] text-gold-300">
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-400">
                {t('payments')}
              </p>
              {showDetailed ? (
                payments.map((payment, index) => (
                  <div key={`payment-${index}`} className="flex justify-between">
                    <span>{payment.methodLabel || payment.method || t('payment')}</span>
                    <span>{formatMoney(payment.amount)}</span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between text-[11px]">
                  <span>{t('payment')}</span>
                  <span>{formatMoney(paymentTotal)}</span>
                </div>
              )}
              {changeAmount !== null ? (
                <div className="flex justify-between text-[11px]">
                  <span>{t('change')}</span>
                  <span>{formatMoney(changeAmount)}</span>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {data.receiptFooter ? (
          <>
            <div className="my-2 border-t border-dashed border-gold-700/40" />
            <p className="text-center text-[10px] text-gold-300">
              {data.receiptFooter}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
