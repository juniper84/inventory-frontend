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

const formatNumber = (value: number, locale?: string) => value.toLocaleString(locale);

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

const buildMetadataDetails = (metadata?: Record<string, unknown> | null, locale?: string) => {
  if (!metadata) {
    return null;
  }
  const l = getLabels(locale);
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
    details.push(`${l.item}: ${variantLabel}`);
  }
  const counted = parseNumber(metadata.countedQuantity);
  const expected = parseNumber(metadata.expectedQuantity);
  const currency = getText(metadata.currency);
  if (counted !== null && expected !== null) {
    details.push(
      `${l.countedVsExpected}: ${formatNumber(counted, locale)} / ${formatNumber(expected, locale)}${unit ? ` ${unit}` : ''}`,
    );
  } else {
    const quantity =
      parseNumber(metadata.quantity) ??
      (currency ? null : parseNumber(metadata.amount));
    if (quantity !== null) {
      details.push(
        `${l.quantity}: ${formatNumber(quantity, locale)}${unit ? ` ${unit}` : ''}`,
      );
    }
  }
  const total =
    parseNumber(metadata.total) ??
    parseNumber(metadata.subtotal) ??
    (currency ? parseNumber(metadata.amount) : null);
  if (total !== null) {
    details.push(
      `${l.amount}: ${formatNumber(total, locale)}${currency ? ` ${currency}` : ''}`,
    );
  }
  const lossReason = getText(metadata.lossReason);
  if (lossReason) {
    details.push(`${l.lossReason}: ${lossReason}`);
  }
  const stockBefore = parseNumber(metadata.stockBefore);
  const stockAfter = parseNumber(metadata.stockAfter);
  if (stockBefore !== null && stockAfter !== null) {
    const delta = stockAfter - stockBefore;
    const sign = delta >= 0 ? '+' : '';
    details.push(
      `${l.stockLevel}: ${formatNumber(stockBefore, locale)} → ${formatNumber(stockAfter, locale)} (${sign}${formatNumber(delta, locale)})`,
    );
  }
  const paymentMethod = getText(metadata.paymentMethod);
  if (paymentMethod) {
    details.push(`${l.payment}: ${paymentMethod}`);
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

const flattenDiff = (diff: Record<string, unknown>, prefix = '', changedLabel = 'changed'): string[] => {
  return Object.entries(diff).flatMap(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (!value || typeof value !== 'object') {
      return [`${nextKey} ${changedLabel}`];
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
  l?: { impact: string },
) => {
  const impactLabel = l?.impact ?? 'Impact';
  if (metadata?.impact) {
    return `${impactLabel}: ${metadata.impact}`;
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
      return `${impactLabel}: ${key} ${delta.from} → ${delta.to} (${sign}${delta.delta})`;
    }
  }
  return null;
};

const ACTION_VERBS_EN: Record<string, string> = {
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
  SHIFT_OPEN: 'opened a shift',
  SHIFT_CLOSE: 'closed a shift',
  NOTE_CREATE: 'created a note',
  NOTE_UPDATE: 'updated a note',
  INVITATION_CREATE: 'sent an invitation',
  INVITATION_ACCEPT: 'accepted an invitation',
  BRANCH_UPDATE: 'updated a branch',
  REORDER_POINT_UPSERT: 'set a reorder point',
  APPROVAL_POLICY_CREATE: 'created an approval policy',
  APPROVAL_POLICY_UPDATE: 'updated an approval policy',
  APPROVAL_POLICY_ARCHIVE: 'archived an approval policy',
  OFFLINE_DEVICE_REGISTER: 'registered an offline device',
  OFFLINE_DEVICE_REVOKE: 'revoked an offline device',
  OFFLINE_CONFLICT_RESOLVE: 'resolved an offline conflict',
  OFFLINE_ENTRY: 'went offline',
  OFFLINE_EXIT: 'came back online',
  OFFLINE_SYNC: 'synced offline data',
  OFFLINE_ACTION_INGESTED: 'ingested an offline action',
  OFFLINE_DURATION_EXCEEDED: 'exceeded offline duration limit',
  PRICE_LIST_ITEM_SET: 'set a price list item',
  CREDIT_OVERDUE_REMINDER: 'sent an overdue credit reminder',
  BUSINESS_STATUS_UPDATE: 'updated business status',
  BUSINESS_FORCE_LOGOUT: 'force-logged out a business',
  BUSINESS_PURGE: 'purged a business',
  BUSINESS_REVIEW_UPDATE: 'updated a business review',
  READ_ONLY_UPDATE: 'updated read-only mode',
  RATE_LIMIT_OVERRIDE: 'overrode rate limit',
  SUBSCRIPTION_UPDATE: 'updated a subscription',
  SUBSCRIPTION_REQUEST_APPROVE: 'approved a subscription request',
  SUBSCRIPTION_REQUEST_REJECT: 'rejected a subscription request',
  ACCESS_REQUEST: 'requested support access',
  EXPORT_ON_EXIT_REQUEST: 'requested an on-exit export',
  EXPORT_CANCEL: 'cancelled an export',
  EXPORT_RETRY: 'retried an export',
  EXPORT_REQUEUE: 'requeued an export',
  EXPORT_DELIVERED: 'delivered an export',
  PLATFORM_INCIDENT_CREATE: 'created a platform incident',
  PLATFORM_INCIDENT_UPDATE: 'updated a platform incident',
  PLATFORM_INCIDENT_TRANSITION: 'transitioned a platform incident',
  PLATFORM_INCIDENT_NOTE: 'added a note to a platform incident',
  PLATFORM_ANNOUNCEMENT_CREATE: 'created a platform announcement',
  PLATFORM_ANNOUNCEMENT_END: 'ended a platform announcement',
  PLATFORM_ADMIN_PASSWORD_CHANGE: 'changed platform admin password',
};

const ACTION_VERBS_SW: Record<string, string> = {
  STOCK_ADJUST: 'alirekebisha stoki',
  STOCK_COUNT: 'alihesabu stoki',
  STOCK_REORDER_POINT_CREATE: 'aliweka kiwango cha kuagiza tena',
  STOCK_REORDER_POINT_UPDATE: 'alisasisha kiwango cha kuagiza tena',
  STOCK_REORDER_POINT_DELETE: 'aliondoa kiwango cha kuagiza tena',
  STOCK_MOVEMENT_CREATE: 'alirekodi harakati ya stoki',
  STOCK_SNAPSHOT_UPDATE: 'alisasisha picha ya stoki',
  BATCH_CREATE: 'aliunda kundi',
  SALE_COMPLETE: 'alikamilisha uuzaji',
  SALE_DRAFT: 'aliunda rasimu ya uuzaji',
  SALE_VOID: 'alibatilisha uuzaji',
  SALE_REFUND: 'alitoa urudishaji',
  SALE_RETURN_WITHOUT_RECEIPT: 'alishughulikia urudishaji bila risiti',
  SALE_SETTLEMENT: 'alilipa deni la uuzaji',
  SALE_RECEIPT_REPRINT: 'alichapisha tena risiti',
  APPROVAL_REQUEST: 'aliomba idhini',
  APPROVAL_APPROVE: 'alikubali ombi',
  APPROVAL_REJECT: 'alikataa ombi',
  APPROVAL_SELF_APPROVE: 'alijikubalia ombi',
  TRANSFER_REQUEST: 'aliomba uhamisho',
  TRANSFER_APPROVE: 'alikubali uhamisho',
  TRANSFER_RECEIVE: 'alipokea uhamisho',
  TRANSFER_CANCEL: 'alighairi uhamisho',
  PURCHASE_CREATE: 'aliunda ununuzi',
  PURCHASE_UPDATE: 'alisasisha ununuzi',
  PURCHASE_ORDER_CREATE: 'aliunda amri ya ununuzi',
  PURCHASE_ORDER_UPDATE: 'alisasisha amri ya ununuzi',
  PURCHASE_ORDER_APPROVE: 'alikubali amri ya ununuzi',
  PURCHASE_PAYMENT_RECORD: 'alirekodi malipo ya ununuzi',
  SUPPLIER_RETURN_CREATE: 'aliunda urudishaji kwa msambazaji',
  RECEIVE_STOCK: 'alipokea stoki',
  ROLE_UPDATE: 'alisasisha jukumu',
  ROLE_CREATE: 'aliunda jukumu',
  ROLE_PERMISSIONS_UPDATE: 'alisasisha ruhusa za jukumu',
  USER_UPDATE: 'alisasisha mtumiaji',
  USER_CREATE: 'aliunda mtumiaji',
  USER_ROLE_ASSIGN: 'aligawa jukumu',
  USER_ROLE_REMOVE: 'aliondoa jukumu',
  USER_DEACTIVATE: 'alizima mtumiaji',
  BRANCH_CREATE: 'aliunda tawi',
  CATEGORY_CREATE: 'aliunda kategoria',
  CATEGORY_UPDATE: 'alisasisha kategoria',
  PRODUCT_CREATE: 'aliunda bidhaa',
  PRODUCT_UPDATE: 'alisasisha bidhaa',
  VARIANT_CREATE: 'aliunda varianti',
  VARIANT_UPDATE: 'alisasisha varianti',
  BARCODE_GENERATE: 'alitgeneza msimbo wa pau',
  BARCODE_CREATE: 'aliunda msimbo wa pau',
  BARCODE_REASSIGN: 'alihamisha msimbo wa pau',
  PRICE_LIST_CREATE: 'aliunda orodha ya bei',
  PRICE_LIST_UPDATE: 'alisasisha orodha ya bei',
  PRICE_LIST_ITEM_ADD: 'aliongeza bidhaa ya orodha ya bei',
  PRICE_LIST_ITEM_REMOVE: 'aliondoa bidhaa ya orodha ya bei',
  SUPPLIER_CREATE: 'aliunda msambazaji',
  SUPPLIER_UPDATE: 'alisasisha msambazaji',
  CUSTOMER_CREATE: 'aliunda mteja',
  CUSTOMER_UPDATE: 'alisasisha mteja',
  CUSTOMER_ARCHIVE: 'alihifadhi mteja',
  CUSTOMER_ANONYMIZE: 'alifuta utambulisho wa mteja',
  EXPENSE_CREATE: 'alirekodi matumizi',
  EXPENSE_UPDATE: 'alisasisha matumizi',
  EXPENSE_DELETE: 'alifuta matumizi',
  ATTACHMENT_UPLOAD: 'alipakia kiambatisho',
  ATTACHMENT_REMOVE: 'aliondoa kiambatisho',
  UNIT_CREATE: 'aliunda kipimo',
  SUBSCRIPTION_CREATE: 'aliunda usajili',
  AUTH_LOGIN: 'aliingia',
  AUTH_LOGOUT: 'alitoka',
  AUTH_REFRESH: 'alisasisha kipindi',
  AUTH_REFRESH_REUSE: 'aligundua matumizi tena ya kipindi',
  SHIFT_OPEN: 'alifungua zamu',
  SHIFT_CLOSE: 'alifunga zamu',
  NOTE_CREATE: 'aliunda maelezo',
  NOTE_UPDATE: 'alisasisha maelezo',
  INVITATION_CREATE: 'alituma mwaliko',
  INVITATION_ACCEPT: 'alikubali mwaliko',
  BRANCH_UPDATE: 'alisasisha tawi',
  REORDER_POINT_UPSERT: 'aliweka kiwango cha kuagiza tena',
  APPROVAL_POLICY_CREATE: 'aliunda sera ya idhini',
  APPROVAL_POLICY_UPDATE: 'alisasisha sera ya idhini',
  APPROVAL_POLICY_ARCHIVE: 'alihifadhi sera ya idhini',
  OFFLINE_DEVICE_REGISTER: 'alisajili kifaa cha nje ya mtandao',
  OFFLINE_DEVICE_REVOKE: 'alibatilisha kifaa cha nje ya mtandao',
  OFFLINE_CONFLICT_RESOLVE: 'alitatua mgogoro wa nje ya mtandao',
  OFFLINE_ENTRY: 'alienda nje ya mtandao',
  OFFLINE_EXIT: 'alirudi mtandaoni',
  OFFLINE_SYNC: 'alisawazisha data ya nje ya mtandao',
  OFFLINE_ACTION_INGESTED: 'alipokea kitendo cha nje ya mtandao',
  OFFLINE_DURATION_EXCEEDED: 'alizidi kikomo cha muda wa nje ya mtandao',
  PRICE_LIST_ITEM_SET: 'aliweka bidhaa ya orodha ya bei',
  CREDIT_OVERDUE_REMINDER: 'alituma ukumbusho wa deni lililochelewa',
  BUSINESS_STATUS_UPDATE: 'alisasisha hali ya biashara',
  BUSINESS_FORCE_LOGOUT: 'alitoa biashara kwa lazima',
  BUSINESS_PURGE: 'alifuta biashara',
  BUSINESS_REVIEW_UPDATE: 'alisasisha ukaguzi wa biashara',
  READ_ONLY_UPDATE: 'alisasisha hali ya kusoma tu',
  RATE_LIMIT_OVERRIDE: 'alibatilisha kikomo cha kasi',
  SUBSCRIPTION_UPDATE: 'alisasisha usajili',
  SUBSCRIPTION_REQUEST_APPROVE: 'alikubali ombi la usajili',
  SUBSCRIPTION_REQUEST_REJECT: 'alikataa ombi la usajili',
  ACCESS_REQUEST: 'aliomba ufikiaji wa msaada',
  EXPORT_ON_EXIT_REQUEST: 'aliomba usafirishaji wa kutoka',
  EXPORT_CANCEL: 'alighairi usafirishaji',
  EXPORT_RETRY: 'alirudia usafirishaji',
  EXPORT_REQUEUE: 'aliweka tena foleni ya usafirishaji',
  EXPORT_DELIVERED: 'alitoa usafirishaji',
  PLATFORM_INCIDENT_CREATE: 'aliunda tukio la jukwaa',
  PLATFORM_INCIDENT_UPDATE: 'alisasisha tukio la jukwaa',
  PLATFORM_INCIDENT_TRANSITION: 'alibadilisha hali ya tukio la jukwaa',
  PLATFORM_INCIDENT_NOTE: 'aliongeza maelezo kwenye tukio la jukwaa',
  PLATFORM_ANNOUNCEMENT_CREATE: 'aliunda tangazo la jukwaa',
  PLATFORM_ANNOUNCEMENT_END: 'alimaliza tangazo la jukwaa',
  PLATFORM_ADMIN_PASSWORD_CHANGE: 'alibadilisha nenosiri la msimamizi wa jukwaa',
};

const LABELS = {
  en: {
    at: 'at',
    success: 'success',
    failed: 'failed',
    actor: 'Actor',
    branch: 'Branch',
    reason: 'Reason',
    changes: 'Changes',
    impact: 'Impact',
    approval: 'Approval',
    approvalRequested: 'Approval requested by',
    approvedBy: 'Approved by',
    rejectedBy: 'Rejected by',
    selfApproved: 'Self-approved by',
    approvalStatus: 'Approval status',
    offline: 'Offline',
    offlineQueued: 'queued sync',
    offlineNo: 'no',
    failure: 'Failure',
    item: 'Item',
    quantity: 'Quantity',
    amount: 'Amount',
    countedVsExpected: 'Counted vs expected',
    stockLevel: 'Stock level',
    payment: 'Payment',
    lossReason: 'Loss reason',
    changed: 'changed',
    none: 'none',
    ranImport: 'ran an import',
    generatedExport: 'generated an export',
    generatedReport: 'generated a report',
  },
  sw: {
    at: 'katika',
    success: 'imefanikiwa',
    failed: 'imeshindwa',
    actor: 'Mhusika',
    branch: 'Tawi',
    reason: 'Sababu',
    changes: 'Mabadiliko',
    impact: 'Athari',
    approval: 'Idhini',
    approvalRequested: 'Idhini imeombwa na',
    approvedBy: 'Imekubaliwa na',
    rejectedBy: 'Imekataliwa na',
    selfApproved: 'Imejikubaliwa na',
    approvalStatus: 'Hali ya idhini',
    offline: 'Nje ya mtandao',
    offlineQueued: 'inasawazishwa',
    offlineNo: 'hapana',
    failure: 'Kushindwa',
    item: 'Bidhaa',
    quantity: 'Kiasi',
    amount: 'Jumla',
    countedVsExpected: 'Iliyohesabiwa vs inayotarajiwa',
    stockLevel: 'Kiwango cha stoki',
    payment: 'Malipo',
    lossReason: 'Sababu ya hasara',
    changed: 'imebadilika',
    none: 'hakuna',
    ranImport: 'alifanya uingizaji',
    generatedExport: 'alitoa usafirishaji',
    generatedReport: 'alitoa ripoti',
  },
};

type LocaleKey = keyof typeof LABELS;
const getLabels = (locale?: string) => LABELS[(locale === 'sw' ? 'sw' : 'en') as LocaleKey];
const getVerbs = (locale?: string) => locale === 'sw' ? ACTION_VERBS_SW : ACTION_VERBS_EN;

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
  locale?: string;
}) => {
  const locale = labels?.locale;
  const l = getLabels(locale);
  const verbs = getVerbs(locale);
  let verb = verbs[log.action];
  if (!verb && log.action.startsWith('IMPORT_')) {
    verb = l.ranImport;
  }
  if (!verb && log.action.startsWith('EXPORT_')) {
    verb = l.generatedExport;
  }
  if (!verb && log.action.startsWith('REPORT_')) {
    verb = l.generatedReport;
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
  const outcomeText = log.outcome === 'SUCCESS' ? l.success : l.failed;
  const resource = formatResourceLabel(
    log.resourceType,
    log.resourceId,
    log.metadata,
    labels?.resourceLabel ?? null,
  );
  const branchClause = branchName ? ` ${l.at} ${branchName}` : '';
  const primary = `${actorName} ${verb} ${resource}${branchClause} (${outcomeText}).`;
  const actor = `${l.actor} ${actorName}${roleName ? ` • ${roleName}` : ''}`;
  const context = branchName ? `${l.branch} ${branchName}` : null;
  const reason = log.reason ? `${l.reason}: ${log.reason}` : null;
  const diffLines = log.diff ? flattenDiff(log.diff, '', l.changed).slice(0, 4) : [];
  const diffSummary =
    diffLines.length > 0 ? `${l.changes}: ${diffLines.join('; ')}` : null;
  const impact = extractImpact(log.diff, log.metadata, l);
  const approval =
    log.action.includes('APPROVAL') && log.metadata?.['approvalId']
      ? `${l.approval}: ${formatShortId(log.metadata['approvalId'] as string)}`
      : null;
  const approvalChain =
    log.action === 'APPROVAL_REQUEST'
      ? `${l.approvalRequested} ${actorName}${log.metadata?.['actionType'] ? ` • ${log.metadata['actionType']}` : ''}`
      : log.action === 'APPROVAL_APPROVE'
        ? `${l.approvedBy} ${actorName}`
        : log.action === 'APPROVAL_REJECT'
          ? `${l.rejectedBy} ${actorName}`
          : log.action === 'APPROVAL_SELF_APPROVE'
            ? `${l.selfApproved} ${actorName}`
            : null;
  const approvalStatus = log.metadata?.['approvalStatus']
    ? `${l.approvalStatus}: ${log.metadata['approvalStatus']}`
    : null;
  const offline =
    log.metadata?.['offline'] === true
      ? `${l.offline}: ${l.offlineQueued}`
    : log.metadata?.['offline'] === false
        ? `${l.offline}: ${l.offlineNo}`
        : null;
  const failure =
    log.outcome === 'FAILURE' && log.metadata?.['error']
      ? `${l.failure}: ${log.metadata['error']}`
      : null;
  const details = buildMetadataDetails(log.metadata ?? null, locale);
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
