import { EscPosLine } from '@/lib/escpos-printer';
import { formatVariantLabel } from '@/lib/display';

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

const padLine = (left: string, right: string, width: number) => {
  const raw = `${left} ${right}`;
  if (raw.length >= width) {
    return `${left} ${right}`;
  }
  const spaceCount = Math.max(1, width - left.length - right.length);
  return `${left}${' '.repeat(spaceCount)}${right}`;
};

const formatMoney = (value: number | string | undefined) => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  return String(value);
};

export function buildReceiptLines(
  receipt: ReceiptRecord,
  width = 32,
): EscPosLine[] {
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
  if (header) {
    lines.push({ text: header, align: 'center' });
  }

  lines.push({ text: `Receipt ${receipt.receiptNumber}`, align: 'center' });
  lines.push({ text: new Date(receipt.issuedAt).toLocaleString(), align: 'center' });
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
    const price = formatMoney(item.unitPrice);
    const total = formatMoney(item.lineTotal);
    const right = total ? total : price;
    lines.push({
      text: padLine(`${qty} x ${price}`, right, width),
    });
  });

  lines.push({ text: '-'.repeat(width) });
  if (data.totals) {
    if (data.totals.subtotal !== undefined) {
      lines.push({
        text: padLine('Subtotal', formatMoney(data.totals.subtotal), width),
      });
    }
    if (data.totals.discountTotal !== undefined) {
      lines.push({
        text: padLine('Discounts', formatMoney(data.totals.discountTotal), width),
      });
    }
    if (data.totals.vatTotal !== undefined) {
      lines.push({
        text: padLine('VAT', formatMoney(data.totals.vatTotal), width),
      });
    }
    if (data.totals.total !== undefined) {
      lines.push({
        text: padLine('Total', formatMoney(data.totals.total), width),
        bold: true,
      });
    }
  }

  const payments = Array.isArray(data.payments) ? data.payments : [];
  if (payments.length) {
    lines.push({ text: '-'.repeat(width) });
    payments.forEach((payment) => {
      const label = payment.method ?? 'Payment';
      lines.push({
        text: padLine(label, formatMoney(payment.amount), width),
      });
    });
  }

  if (footer) {
    lines.push({ text: '-'.repeat(width) });
    lines.push({ text: footer, align: 'center' });
  }

  return lines;
}

export function buildReceiptText(receipt: ReceiptRecord, width = 32) {
  return buildReceiptLines(receipt, width)
    .map((line) => line.text)
    .join('\n');
}
