import { EscPosLine } from '@/lib/escpos-printer';
import { formatVariantLabel } from '@/lib/display';
import { ZERO_DECIMAL_CURRENCIES } from '@/lib/currencies';
import { formatDateTimeWithTz } from '@/lib/date-format';

export type ReceiptLine = {
  productName?: string;
  variantName?: string;
  variantId?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  lineTotal?: number | string;
};

export type ReceiptData = {
  businessName?: string;
  branchName?: string;
  branchContact?: { address?: string; phone?: string; email?: string };
  cashierId?: string | null;
  cashierName?: string | null;
  customer?: { name?: string; phone?: string; tin?: string };
  receiptHeader?: string;
  receiptFooter?: string;
  receiptTemplate?: 'THERMAL' | 'A4' | string;
  lines?: ReceiptLine[];
  totals?: {
    subtotal?: number | string;
    discountTotal?: number | string;
    vatTotal?: number | string;
    total?: number | string;
  };
  payments?: Array<{ method?: string; methodLabel?: string; amount?: number | string }>;
};

export type ReceiptRecord = {
  receiptNumber: string;
  issuedAt: string;
  data?: ReceiptData;
};

export type ReceiptLabels = {
  receipt?: string;
  cashier?: string;
  customer?: string;
  tin?: string;
  subtotal?: string;
  discounts?: string;
  vat?: string;
  total?: string;
  payment?: string;
};

const padLine = (left: string, right: string, width: number) => {
  if (left.length + right.length + 1 >= width) {
    const truncated = left.slice(0, width - right.length - 1);
    return `${truncated}${right}`;
  }
  const spaceCount = width - left.length - right.length;
  return `${left}${' '.repeat(spaceCount)}${right}`;
};

const formatMoney = (value: number | string | undefined, fractionDigits = 2, locale = 'en'): string => {
  if (value === undefined || value === null) {
    return '';
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(parsed);
};

const getCurrencyFractionDigits = (currency: string): number => {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
};

export function buildReceiptLines(
  receipt: ReceiptRecord,
  width = 32,
  currency = 'TZS',
  locale = 'en',
  labels: ReceiptLabels = {},
  timezone = 'Africa/Dar_es_Salaam',
  dateFormat = 'DD/MM/YYYY',
): EscPosLine[] {
  const lbl = {
    receipt: labels.receipt ?? 'Receipt',
    cashier: labels.cashier ?? 'Cashier',
    customer: labels.customer ?? 'Customer',
    tin: labels.tin ?? 'TIN',
    subtotal: labels.subtotal ?? 'Subtotal',
    discounts: labels.discounts ?? 'Discounts',
    vat: labels.vat ?? 'VAT',
    total: labels.total ?? 'Total',
    payment: labels.payment ?? 'Payment',
  };
  const fd = getCurrencyFractionDigits(currency);
  const fmt = (v: number | string | undefined) => formatMoney(v, fd, locale);
  const lines: EscPosLine[] = [];
  const data = receipt.data ?? {};
  const header = data.receiptHeader?.trim();
  const footer = data.receiptFooter?.trim();

  if (data.businessName) {
    lines.push({ text: String(data.businessName), align: 'center', bold: true });
  }
  if (data.branchName) {
    lines.push({ text: String(data.branchName), align: 'center' });
  }
  if (data.branchContact?.address) {
    lines.push({ text: String(data.branchContact.address), align: 'center' });
  }
  if (data.branchContact?.phone) {
    lines.push({ text: String(data.branchContact.phone), align: 'center' });
  }
  if (data.branchContact?.email) {
    lines.push({ text: String(data.branchContact.email), align: 'center' });
  }
  if (header) {
    lines.push({ text: header, align: 'center' });
  }

  lines.push({ text: `${lbl.receipt} ${receipt.receiptNumber}`, align: 'center' });
  lines.push({ text: formatDateTimeWithTz(receipt.issuedAt, timezone, dateFormat), align: 'center' });
  if (data.cashierName ?? data.cashierId) {
    lines.push({ text: `${lbl.cashier}: ${data.cashierName ?? data.cashierId}`, align: 'left' });
  }
  if (data.customer?.name || data.customer?.phone) {
    const customerLine = [data.customer.name, data.customer.phone]
      .filter(Boolean)
      .join(' | ');
    lines.push({ text: `${lbl.customer}: ${customerLine}`, align: 'left' });
  }
  if (data.customer?.tin) {
    lines.push({ text: `${lbl.tin}: ${data.customer.tin}`, align: 'left' });
  }
  lines.push({ text: '-'.repeat(width) });

  const itemLines = Array.isArray(data.lines) ? data.lines : [];
  itemLines.forEach((item) => {
    const name = formatVariantLabel(
      {
        id: item.variantId ?? null,
        name: item.variantName ?? null,
        productName: item.productName ?? null,
      },
      'Item',
    );
    lines.push({ text: String(name) });
    const qty = item.quantity ?? '';
    const price = fmt(item.unitPrice);
    const total = fmt(item.lineTotal);
    let right: string;
    if (total) {
      right = total;
    } else if (price && qty !== '') {
      const computed = Number(qty) * Number(item.unitPrice);
      right = Number.isFinite(computed) ? fmt(computed) : price;
    } else {
      right = price;
    }
    lines.push({
      text: padLine(`${qty} x ${price}`, right, width),
    });
  });

  lines.push({ text: '-'.repeat(width) });
  if (data.totals) {
    if (data.totals.subtotal !== undefined) {
      lines.push({
        text: padLine(lbl.subtotal, fmt(data.totals.subtotal), width),
      });
    }
    if (data.totals.discountTotal !== undefined) {
      lines.push({
        text: padLine(lbl.discounts, fmt(data.totals.discountTotal), width),
      });
    }
    if (data.totals.vatTotal !== undefined) {
      lines.push({
        text: padLine(lbl.vat, fmt(data.totals.vatTotal), width),
      });
    }
    if (data.totals.total !== undefined) {
      lines.push({
        text: padLine(lbl.total, fmt(data.totals.total), width),
        bold: true,
      });
    }
  }

  const payments = Array.isArray(data.payments) ? data.payments : [];
  if (payments.length) {
    lines.push({ text: '-'.repeat(width) });
    payments.forEach((payment) => {
      const label = payment.methodLabel ?? payment.method ?? lbl.payment;
      lines.push({
        text: padLine(label, fmt(payment.amount), width),
      });
    });
  }

  if (footer) {
    lines.push({ text: '-'.repeat(width) });
    lines.push({ text: footer, align: 'center' });
  }

  return lines;
}

/**
 * Builds a plain-text receipt by joining each line's text with newlines.
 * Column alignment is lost in non-monospace contexts; use buildReceiptLines
 * with an ESC/POS printer for properly formatted thermal output.
 */
export function buildReceiptText(
  receipt: ReceiptRecord,
  width = 32,
  currency = 'TZS',
  locale = 'en',
  labels: ReceiptLabels = {},
  timezone = 'Africa/Dar_es_Salaam',
  dateFormat = 'DD/MM/YYYY',
) {
  return buildReceiptLines(receipt, width, currency, locale, labels, timezone, dateFormat)
    .map((line) => line.text)
    .join('\n');
}
