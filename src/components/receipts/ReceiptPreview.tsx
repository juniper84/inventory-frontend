'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatVariantLabel } from '@/lib/display';
import type { ReceiptData, ReceiptLine } from '@/lib/receipt-print';
import { useCurrency, useFormatDate } from '@/lib/business-context';
import { ZERO_DECIMAL_CURRENCIES } from '@/lib/currencies';

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

const formatMoney = (value: number | string | undefined, fractionDigits: number, locale = 'en'): string => {
  const numeric = toNumber(value);
  if (numeric === null) {
    return '';
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numeric);
};

const resolveLineTotal = (line: ReceiptLine, fractionDigits: number, locale = 'en'): string => {
  if (line.lineTotal !== undefined && line.lineTotal !== null) {
    return formatMoney(line.lineTotal, fractionDigits, locale);
  }
  const qty = toNumber(line.quantity);
  const unit = toNumber(line.unitPrice);
  if (qty === null || unit === null) {
    return '';
  }
  return formatMoney(qty * unit, fractionDigits, locale);
};

export function ReceiptPreview({
  receiptNumber,
  issuedAt,
  data,
  mode = 'detailed',
  className,
}: ReceiptPreviewProps) {
  const t = useTranslations('receiptPreview');
  const locale = useLocale();
  const { formatDateTime } = useFormatDate();
  const currency = useCurrency();
  const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
  const fmt = (v: number | string | undefined) => formatMoney(v, fractionDigits, locale);
  const resolveTotal = (line: ReceiptLine) => resolveLineTotal(line, fractionDigits, locale);
  if (!data) {
    return (
      <div className={className}>
        <p className="text-sm text-gold-300">{t('noReceiptData')}</p>
      </div>
    );
  }

  const rawTemplate = data.receiptTemplate ?? 'THERMAL';
  const template = (rawTemplate === 'A4' ? 'A4' : 'THERMAL') as 'THERMAL' | 'A4';
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
            {t('issuedAt', { value: formatDateTime(issuedAt) })}
          </p>
          {showDetailed && data.cashierId ? (
            <p>
              {t('cashier', {
                value: /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(data.cashierId)
                  ? `${data.cashierId.slice(0, 8)}…`
                  : data.cashierId,
              })}
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
            const total = resolveTotal(line);
            const qty = line.quantity ?? '';
            const unitPrice = fmt(line.unitPrice);
            return (
              <div key={line.variantId ?? `line-${index}`} className="space-y-1">
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
              <span>{fmt(totals.subtotal)}</span>
            </div>
          ) : null}
          {showDetailed && totals.discountTotal !== undefined ? (
            <div className="flex justify-between">
              <span>{t('discounts')}</span>
              <span>{fmt(totals.discountTotal)}</span>
            </div>
          ) : null}
          {showDetailed && totals.vatTotal !== undefined ? (
            <div className="flex justify-between">
              <span>{t('vat')}</span>
              <span>{fmt(totals.vatTotal)}</span>
            </div>
          ) : null}
          {totals.total !== undefined ? (
            <div className="flex justify-between text-sm font-semibold text-gold-100">
              <span>{t('total')}</span>
              <span>{fmt(totalValue)}</span>
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
                  <div key={`${payment.method}-${index}`} className="flex justify-between">
                    <span>{payment.methodLabel || payment.method || t('payment')}</span>
                    <span>{fmt(payment.amount)}</span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between text-[11px]">
                  <span>{t('payment')}</span>
                  <span>{fmt(paymentTotal)}</span>
                </div>
              )}
              {changeAmount !== null ? (
                <div className="flex justify-between text-[11px]">
                  <span>{t('change')}</span>
                  <span>{fmt(changeAmount)}</span>
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
