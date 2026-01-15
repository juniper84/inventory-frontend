import { formatVariantLabel, shortId } from './display';

type DiffEntry = {
  from?: unknown;
  to?: unknown;
};

const formatShortId = (id?: string | null, fallback = 'unknown') => {
  if (!id) {
    return fallback;
  }
  return `#${shortId(id)}`;
};

const formatResourceLabel = (
  resourceType: string,
  resourceId?: string | null,
  metadata?: Record<string, unknown> | null,
  override?: string | null,
) => {
  const label =
    override ||
    (typeof metadata?.resourceName === 'string'
      ? metadata.resourceName
      : typeof metadata?.name === 'string'
        ? metadata.name
        : typeof metadata?.title === 'string'
          ? metadata.title
          : null);
  if (label) {
    return `${resourceType} ${label}`;
  }
  if (resourceId) {
    return `${resourceType} ${formatShortId(resourceId)}`;
  }
  return resourceType;
};

const numericDelta = (entry: DiffEntry) => {
  const from = typeof entry.from === 'number' ? entry.from : null;
  const to = typeof entry.to === 'number' ? entry.to : null;
  if (from === null || to === null) {
    return null;
  }
  return { from, to, delta: to - from };
};

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const formatNumber = (value: number) => value.toLocaleString();

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return 'none';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `array (${value.length})`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return `object (${keys.length} keys)`;
  }
  return String(value);
};

const getText = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const buildMetadataDetails = (metadata?: Record<string, unknown> | null) => {
  if (!metadata) {
    return null;
  }
  const details: string[] = [];
  const unit = getText(metadata.unitName) ?? getText(metadata.unitId);
  const variantLabel = formatVariantLabel(
    {
      name: getText(metadata.variantName) ?? null,
      id: getText(metadata.variantId) ?? null,
      productName: getText(metadata.productName) ?? null,
    },
    '',
  );
  if (variantLabel) {
    details.push(`Item: ${variantLabel}`);
  }
  const counted = parseNumber(metadata.countedQuantity);
  const expected = parseNumber(metadata.expectedQuantity);
  const currency = getText(metadata.currency);
  if (counted !== null && expected !== null) {
    details.push(
      `Counted vs expected: ${formatNumber(counted)} / ${formatNumber(expected)}${unit ? ` ${unit}` : ''}`,
    );
  } else {
    const quantity =
      parseNumber(metadata.quantity) ??
      (currency ? null : parseNumber(metadata.amount));
    if (quantity !== null) {
      details.push(
        `Quantity: ${formatNumber(quantity)}${unit ? ` ${unit}` : ''}`,
      );
    }
  }
  const total =
    parseNumber(metadata.total) ??
    parseNumber(metadata.subtotal) ??
    (currency ? parseNumber(metadata.amount) : null);
  if (total !== null) {
    details.push(
      `Amount: ${formatNumber(total)}${currency ? ` ${currency}` : ''}`,
    );
  }
  const lossReason = getText(metadata.lossReason);
  if (lossReason) {
    details.push(`Loss reason: ${lossReason}`);
  }
  const stockBefore = parseNumber(metadata.stockBefore);
  const stockAfter = parseNumber(metadata.stockAfter);
  if (stockBefore !== null && stockAfter !== null) {
    const delta = stockAfter - stockBefore;
    const sign = delta >= 0 ? '+' : '';
    details.push(
      `Stock level: ${formatNumber(stockBefore)} → ${formatNumber(stockAfter)} (${sign}${formatNumber(delta)})`,
    );
  }
  const paymentMethod = getText(metadata.paymentMethod);
  if (paymentMethod) {
    details.push(`Payment: ${paymentMethod}`);
  }
  return details.length > 0 ? details.slice(0, 3).join(' • ') : null;
};

const classifySeverity = (log: {
  action: string;
  outcome: string;
  resourceType: string;
}) => {
  if (log.outcome === 'FAILURE') {
    return 'HIGH';
  }
  if (log.action.includes('APPROVAL') || log.action.includes('REFUND')) {
    return 'HIGH';
  }
  if (log.action.includes('STOCK') || log.action.includes('ROLE')) {
    return 'MEDIUM';
  }
  return 'LOW';
};

const buildTags = (log: { action: string; resourceType: string }) => {
  const tags = new Set<string>();
  if (log.action.includes('APPROVAL')) tags.add('approval');
  if (log.action.includes('STOCK')) tags.add('stock');
  if (log.action.includes('SALE') || log.resourceType === 'Sale') tags.add('sales');
  if (log.action.includes('REFUND')) tags.add('refund');
  if (log.action.includes('ROLE') || log.action.includes('USER')) tags.add('admin');
  if (log.action.includes('LOGIN')) tags.add('security');
  return Array.from(tags);
};

const flattenDiff = (diff: Record<string, unknown>, prefix = ''): string[] => {
  return Object.entries(diff).flatMap(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (!value || typeof value !== 'object') {
      return [`${nextKey} changed`];
    }
    if ('from' in value || 'to' in value) {
      const entry = value as DiffEntry;
      return [
        `${nextKey}: ${formatValue(entry.from)} → ${formatValue(entry.to)}`,
      ];
    }
  return flattenDiff(value as Record<string, unknown>, nextKey);
  });
};

const extractImpact = (
  diff?: Record<string, unknown> | null,
  metadata?: Record<string, unknown> | null,
) => {
  if (metadata?.impact) {
    return `Impact: ${metadata.impact}`;
  }
  if (!diff) {
    return null;
  }
  const impactKeys = ['quantity', 'total', 'amount', 'vat', 'balance', 'stock'];
  for (const [key, value] of Object.entries(diff)) {
    if (!impactKeys.some((impactKey) => key.toLowerCase().includes(impactKey))) {
      continue;
    }
    if (value && typeof value === 'object' && ('from' in value || 'to' in value)) {
      const delta = numericDelta(value as DiffEntry);
      if (!delta) {
        continue;
      }
      const sign = delta.delta >= 0 ? '+' : '';
      return `Impact: ${key} ${delta.from} → ${delta.to} (${sign}${delta.delta})`;
    }
  }
  return null;
};

const ACTION_VERBS: Record<string, string> = {
  STOCK_ADJUST: 'adjusted stock',
  STOCK_COUNT: 'counted stock',
  STOCK_REORDER_POINT_CREATE: 'set a reorder point',
  STOCK_REORDER_POINT_UPDATE: 'updated a reorder point',
  STOCK_REORDER_POINT_DELETE: 'removed a reorder point',
  STOCK_MOVEMENT_CREATE: 'recorded a stock movement',
  STOCK_SNAPSHOT_UPDATE: 'updated a stock snapshot',
  BATCH_CREATE: 'created a batch',
  SALE_COMPLETE: 'completed a sale',
  SALE_DRAFT: 'created a sale draft',
  SALE_VOID: 'voided a sale',
  SALE_REFUND: 'issued a refund',
  SALE_RETURN_WITHOUT_RECEIPT: 'processed a return without receipt',
  SALE_SETTLEMENT: 'settled a sale',
  SALE_RECEIPT_REPRINT: 'reprinted a receipt',
  APPROVAL_REQUEST: 'requested approval',
  APPROVAL_APPROVE: 'approved a request',
  APPROVAL_REJECT: 'rejected a request',
  APPROVAL_SELF_APPROVE: 'auto-approved a request',
  TRANSFER_REQUEST: 'requested a transfer',
  TRANSFER_APPROVE: 'approved a transfer',
  TRANSFER_RECEIVE: 'received a transfer',
  TRANSFER_CANCEL: 'cancelled a transfer',
  PURCHASE_CREATE: 'created a purchase',
  PURCHASE_UPDATE: 'updated a purchase',
  PURCHASE_ORDER_CREATE: 'created a purchase order',
  PURCHASE_ORDER_UPDATE: 'updated a purchase order',
  PURCHASE_ORDER_APPROVE: 'approved a purchase order',
  PURCHASE_PAYMENT_RECORD: 'recorded a purchase payment',
  SUPPLIER_RETURN_CREATE: 'created a supplier return',
  RECEIVE_STOCK: 'received stock',
  ROLE_UPDATE: 'updated a role',
  ROLE_CREATE: 'created a role',
  ROLE_PERMISSIONS_UPDATE: 'updated role permissions',
  USER_UPDATE: 'updated a user',
  USER_CREATE: 'created a user',
  USER_ROLE_ASSIGN: 'assigned a role',
  USER_ROLE_REMOVE: 'removed a role',
  USER_DEACTIVATE: 'deactivated a user',
  BRANCH_CREATE: 'created a branch',
  CATEGORY_CREATE: 'created a category',
  CATEGORY_UPDATE: 'updated a category',
  PRODUCT_CREATE: 'created a product',
  PRODUCT_UPDATE: 'updated a product',
  VARIANT_CREATE: 'created a variant',
  VARIANT_UPDATE: 'updated a variant',
  BARCODE_GENERATE: 'generated a barcode',
  BARCODE_CREATE: 'created a barcode',
  BARCODE_REASSIGN: 'reassigned a barcode',
  PRICE_LIST_CREATE: 'created a price list',
  PRICE_LIST_UPDATE: 'updated a price list',
  PRICE_LIST_ITEM_ADD: 'added a price list item',
  PRICE_LIST_ITEM_REMOVE: 'removed a price list item',
  SUPPLIER_CREATE: 'created a supplier',
  SUPPLIER_UPDATE: 'updated a supplier',
  CUSTOMER_CREATE: 'created a customer',
  CUSTOMER_UPDATE: 'updated a customer',
  CUSTOMER_ARCHIVE: 'archived a customer',
  CUSTOMER_ANONYMIZE: 'anonymized a customer',
  EXPENSE_CREATE: 'recorded an expense',
  EXPENSE_UPDATE: 'updated an expense',
  EXPENSE_DELETE: 'deleted an expense',
  ATTACHMENT_UPLOAD: 'uploaded an attachment',
  ATTACHMENT_REMOVE: 'removed an attachment',
  UNIT_CREATE: 'created a unit',
  SUBSCRIPTION_CREATE: 'created a subscription',
  AUTH_LOGIN: 'signed in',
  AUTH_LOGOUT: 'signed out',
  AUTH_REFRESH: 'refreshed a session',
  AUTH_REFRESH_REUSE: 'detected refresh reuse',
};

export const buildAuditNarrative = (log: {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: string;
  reason?: string | null;
  diff?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  userId?: string | null;
  roleId?: string | null;
  branchId?: string | null;
}, labels?: {
  userName?: string | null;
  branchName?: string | null;
  roleName?: string | null;
  resourceLabel?: string | null;
}) => {
  let verb = ACTION_VERBS[log.action];
  if (!verb && log.action.startsWith('IMPORT_')) {
    verb = 'ran an import';
  }
  if (!verb && log.action.startsWith('EXPORT_')) {
    verb = 'generated an export';
  }
  if (!verb && log.action.startsWith('REPORT_')) {
    verb = 'generated a report';
  }
  if (!verb) {
    verb = log.action.replaceAll('_', ' ').toLowerCase();
  }
  const actorName =
    labels?.userName ||
    (typeof log.metadata?.userName === 'string' ? log.metadata.userName : null) ||
    (log.userId ? formatShortId(log.userId) : 'System');
  const branchName =
    labels?.branchName ||
    (typeof log.metadata?.branchName === 'string' ? log.metadata.branchName : null);
  const roleName =
    labels?.roleName ||
    (typeof log.metadata?.roleName === 'string' ? log.metadata.roleName : null);
  const outcomeText = log.outcome === 'SUCCESS' ? 'success' : 'failed';
  const resource = formatResourceLabel(
    log.resourceType,
    log.resourceId,
    log.metadata,
    labels?.resourceLabel ?? null,
  );
  const branchClause = branchName ? ` at ${branchName}` : '';
  const primary = `${actorName} ${verb} ${resource}${branchClause} (${outcomeText}).`;
  const actor = `Actor ${actorName}${roleName ? ` • ${roleName}` : ''}`;
  const context = branchName ? `Branch ${branchName}` : null;
  const reason = log.reason ? `Reason: ${log.reason}` : null;
  const diffLines = log.diff ? flattenDiff(log.diff).slice(0, 4) : [];
  const diffSummary =
    diffLines.length > 0 ? `Changes: ${diffLines.join('; ')}` : null;
  const impact = extractImpact(log.diff, log.metadata);
  const approval =
    log.action.includes('APPROVAL') && log.metadata?.['approvalId']
      ? `Approval: ${formatShortId(log.metadata['approvalId'] as string)}`
      : null;
  const approvalChain =
    log.action === 'APPROVAL_REQUEST'
      ? `Approval requested by ${actorName}${log.metadata?.['actionType'] ? ` • ${log.metadata['actionType']}` : ''}`
      : log.action === 'APPROVAL_APPROVE'
        ? `Approved by ${actorName}`
        : log.action === 'APPROVAL_REJECT'
          ? `Rejected by ${actorName}`
          : log.action === 'APPROVAL_SELF_APPROVE'
            ? `Self-approved by ${actorName}`
            : null;
  const approvalStatus = log.metadata?.['approvalStatus']
    ? `Approval status: ${log.metadata['approvalStatus']}`
    : null;
  const offline =
    log.metadata?.['offline'] === true
      ? `Offline: queued sync`
    : log.metadata?.['offline'] === false
        ? 'Offline: no'
        : null;
  const failure =
    log.outcome === 'FAILURE' && log.metadata?.['error']
      ? `Failure: ${log.metadata['error']}`
      : null;
  const details = buildMetadataDetails(log.metadata ?? null);
  const severity = classifySeverity({
    action: log.action,
    outcome: log.outcome,
    resourceType: log.resourceType,
  });
  const tags = buildTags({ action: log.action, resourceType: log.resourceType });

  return {
    primary,
    resource,
    reason,
    diffSummary,
    impact,
    approval,
    approvalChain,
    approvalStatus,
    offline,
    failure,
    details,
    severity,
    tags,
    actor,
    context,
  };
};
