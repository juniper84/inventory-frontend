export type NotificationChannel = 'email' | 'sms' | 'whatsapp';

export type NotificationGroupKey =
  | 'security'
  | 'approvals'
  | 'inventory'
  | 'sales'
  | 'purchases'
  | 'transfers'
  | 'system';

export const NOTIFICATION_EVENTS = [
  'lowStock',
  'pendingApprovals',
  'offlineNearingLimit',
  'creditOverdue',
  'graceWarnings',
  'expiry',
  'noteReminder',
  'saleDrafted',
  'saleCompleted',
  'saleVoided',
  'saleRefunded',
  'transferCreated',
  'transferInTransit',
  'transferReceived',
  'transferCancelled',
  'stockAdjusted',
  'stockCountRecorded',
  'purchaseCreated',
  'purchaseOrderCreated',
  'purchaseOrderApproved',
  'receivingRecorded',
  'supplierReturnRecorded',
  'expenseRecorded',
  'approvalApproved',
  'approvalRejected',
  'accessRequest',
  'subscriptionRequestApproved',
  'subscriptionRequestRejected',
  'securityRefreshTokenReuse',
  'securityUnusualLogin',
] as const;

export type NotificationEventKey = (typeof NOTIFICATION_EVENTS)[number];

/**
 * Maps each notification event to the permission code required to access it.
 * `null` means the event is always visible (no specific permission needed).
 */
export const EVENT_PERMISSION_MAP: Record<NotificationEventKey, string | null> = {
  // Security — always visible
  securityRefreshTokenReuse: null,
  securityUnusualLogin: null,
  accessRequest: null,

  // Approvals
  pendingApprovals: 'approvals.read',
  approvalApproved: 'approvals.read',
  approvalRejected: 'approvals.read',
  subscriptionRequestApproved: null,
  subscriptionRequestRejected: null,

  // Inventory
  lowStock: 'stock.read',
  expiry: 'stock.read',
  stockAdjusted: 'stock.write',
  stockCountRecorded: 'stock.write',
  receivingRecorded: 'stock.write',
  supplierReturnRecorded: 'stock.write',

  // Sales
  saleDrafted: 'sales.read',
  saleCompleted: 'sales.read',
  saleVoided: 'sales.read',
  saleRefunded: 'sales.read',
  creditOverdue: 'sales.read',

  // Purchases
  purchaseCreated: 'purchases.read',
  purchaseOrderCreated: 'purchases.read',
  purchaseOrderApproved: 'purchases.read',
  expenseRecorded: 'expenses.read',

  // Transfers
  transferCreated: 'transfers.read',
  transferInTransit: 'transfers.read',
  transferReceived: 'transfers.read',
  transferCancelled: 'transfers.read',

  // System — always visible
  offlineNearingLimit: null,
  graceWarnings: null,
  noteReminder: null,
};

export type NotificationRecipientConfig = {
  roleIds: string[];
  userIds: string[];
  includeOwners: boolean;
  includeManagers: boolean;
  branchScoped: boolean;
};

export type NotificationEventSettings = {
  enabled: boolean;
  /** Per-event channel overrides. When present, overrides the group-level channel setting. */
  channels?: Partial<Record<NotificationChannel, boolean>>;
};

export type NotificationRecipientGroups = {
  global: NotificationRecipientConfig;
  email?: NotificationRecipientConfig | null;
  whatsapp?: NotificationRecipientConfig | null;
  sms?: NotificationRecipientConfig | null;
};

export type NotificationGroupSettings = {
  channels: Record<NotificationChannel, boolean>;
};

export type NotificationSettings = {
  channels: Record<NotificationChannel, boolean>;
  recipients: NotificationRecipientGroups;
  groups: Record<NotificationGroupKey, NotificationGroupSettings>;
  events: Record<NotificationEventKey, NotificationEventSettings>;
};

export const NOTIFICATION_GROUPS: Record<
  NotificationGroupKey,
  NotificationEventKey[]
> = {
  security: ['securityRefreshTokenReuse', 'securityUnusualLogin', 'accessRequest'],
  approvals: [
    'pendingApprovals',
    'approvalApproved',
    'approvalRejected',
    'subscriptionRequestApproved',
    'subscriptionRequestRejected',
  ],
  inventory: [
    'lowStock',
    'expiry',
    'stockAdjusted',
    'stockCountRecorded',
    'receivingRecorded',
    'supplierReturnRecorded',
  ],
  sales: ['saleDrafted', 'saleCompleted', 'saleVoided', 'saleRefunded', 'creditOverdue'],
  purchases: ['purchaseCreated', 'purchaseOrderCreated', 'purchaseOrderApproved', 'expenseRecorded'],
  transfers: [
    'transferCreated',
    'transferInTransit',
    'transferReceived',
    'transferCancelled',
  ],
  system: ['offlineNearingLimit', 'graceWarnings', 'noteReminder'],
};

const defaultRecipients: NotificationRecipientConfig = {
  roleIds: [],
  userIds: [],
  includeOwners: true,
  includeManagers: false,
  branchScoped: true,
};

export const buildDefaultNotificationSettings = (): NotificationSettings => ({
  channels: {
    email: false,
    sms: false,
    whatsapp: false,
  },
  recipients: {
    global: {
      roleIds: [...defaultRecipients.roleIds],
      userIds: [...defaultRecipients.userIds],
      includeOwners: defaultRecipients.includeOwners,
      includeManagers: defaultRecipients.includeManagers,
      branchScoped: defaultRecipients.branchScoped,
    },
    email: null,
    whatsapp: null,
    sms: null,
  },
  groups: (Object.keys(NOTIFICATION_GROUPS) as NotificationGroupKey[]).reduce(
    (acc, key) => {
      acc[key] = {
        channels: {
          email: false,
          sms: false,
          whatsapp: false,
        },
      };
      return acc;
    },
    {} as Record<NotificationGroupKey, NotificationGroupSettings>,
  ),
  events: NOTIFICATION_EVENTS.reduce((acc, key) => {
    acc[key] = {
      enabled: false,
    };
    return acc;
  }, {} as Record<NotificationEventKey, NotificationEventSettings>),
});

const toBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

const normalizeRecipients = (
  raw: Record<string, unknown> | null | undefined,
  fallback: NotificationRecipientConfig,
): NotificationRecipientConfig => {
  const source = raw ?? {};
  return {
    roleIds: Array.isArray(source.roleIds)
      ? source.roleIds.filter((id) => typeof id === 'string')
      : [...fallback.roleIds],
    userIds: Array.isArray(source.userIds)
      ? source.userIds.filter((id) => typeof id === 'string')
      : [...fallback.userIds],
    includeOwners: toBoolean(source.includeOwners, fallback.includeOwners),
    includeManagers: toBoolean(source.includeManagers, fallback.includeManagers),
    branchScoped: toBoolean(source.branchScoped, fallback.branchScoped),
  };
};

const mergeRecipients = (
  base: NotificationRecipientConfig,
  next: NotificationRecipientConfig,
) => ({
  roleIds: Array.from(new Set([...base.roleIds, ...next.roleIds])),
  userIds: Array.from(new Set([...base.userIds, ...next.userIds])),
  includeOwners: base.includeOwners || next.includeOwners,
  includeManagers: base.includeManagers || next.includeManagers,
  branchScoped: base.branchScoped || next.branchScoped,
});

/**
 * Returns the group key that a given notification event belongs to, or null
 * if not found in any group.
 */
export const getEventGroupKey = (
  eventKey: NotificationEventKey,
): NotificationGroupKey | null => {
  for (const groupKey of Object.keys(NOTIFICATION_GROUPS) as NotificationGroupKey[]) {
    if ((NOTIFICATION_GROUPS[groupKey] as readonly string[]).includes(eventKey)) {
      return groupKey;
    }
  }
  return null;
};

/**
 * Checks whether a notification event is effectively disabled at the business
 * level. An event is considered disabled when:
 * 1. All global channels (email, sms, whatsapp) are OFF, OR
 * 2. The event's own `enabled` flag is false, OR
 * 3. All channels on the event's group are OFF.
 */
export const isEventDisabledByBusiness = (
  eventKey: NotificationEventKey,
  settings: NotificationSettings,
): boolean => {
  // 1. All global channels off → everything is disabled
  const { channels } = settings;
  const anyGlobalChannel = channels.email || channels.sms || channels.whatsapp;
  if (!anyGlobalChannel) return true;

  // 2. Event explicitly disabled
  const eventSetting = settings.events[eventKey];
  if (eventSetting && !eventSetting.enabled) return true;

  // 3. All channels on the event's group are off
  const groupKey = getEventGroupKey(eventKey);
  if (groupKey) {
    const groupChannels = settings.groups[groupKey]?.channels;
    if (groupChannels) {
      const anyGroupChannel =
        groupChannels.email || groupChannels.sms || groupChannels.whatsapp;
      if (!anyGroupChannel) return true;
    }
  }

  return false;
};

export const normalizeNotificationSettings = (
  raw?: Record<string, unknown> | null,
): NotificationSettings => {
  const fallback = buildDefaultNotificationSettings();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const input = raw as Record<string, unknown>;
  const hasEvents = typeof input.events === 'object' && input.events !== null;
  const hasRecipients =
    typeof input.recipients === 'object' && input.recipients !== null;
  const hasGroups = typeof input.groups === 'object' && input.groups !== null;
  const channelsSource = (hasEvents ? input.channels : input) as
    | Record<string, unknown>
    | null
    | undefined;
  const channels = {
    email: toBoolean(channelsSource?.email, fallback.channels.email),
    sms: toBoolean(channelsSource?.sms, fallback.channels.sms),
    whatsapp: toBoolean(channelsSource?.whatsapp, fallback.channels.whatsapp),
  };

  const eventsSource = hasEvents
    ? (input.events as Record<string, unknown>)
    : null;

  const events = NOTIFICATION_EVENTS.reduce(
    (acc, key) => {
      const eventInput =
        eventsSource && typeof eventsSource[key] === 'object'
          ? (eventsSource[key] as Record<string, unknown>)
          : null;
      const eventChannels = eventInput?.channels as Record<string, unknown> | null | undefined;
      acc[key] = {
        enabled: toBoolean(eventInput?.enabled, fallback.events[key].enabled),
        ...(eventChannels && typeof eventChannels === 'object'
          ? {
              channels: {
                ...(typeof eventChannels.email === 'boolean' ? { email: eventChannels.email } : {}),
                ...(typeof eventChannels.sms === 'boolean' ? { sms: eventChannels.sms } : {}),
                ...(typeof eventChannels.whatsapp === 'boolean' ? { whatsapp: eventChannels.whatsapp } : {}),
              },
            }
          : {}),
      };
      return acc;
    },
    {} as Record<NotificationEventKey, NotificationEventSettings>,
  );

  if (hasRecipients || hasGroups) {
    const recipientsSource = input.recipients as
      | Record<string, unknown>
      | null
      | undefined;
    const globalRecipients = normalizeRecipients(
      (recipientsSource?.global as Record<string, unknown>) ?? null,
      fallback.recipients.global,
    );
    const emailRecipients = recipientsSource?.email
      ? normalizeRecipients(
          recipientsSource.email as Record<string, unknown>,
          fallback.recipients.global,
        )
      : null;
    const whatsappRecipients = recipientsSource?.whatsapp
      ? normalizeRecipients(
          recipientsSource.whatsapp as Record<string, unknown>,
          fallback.recipients.global,
        )
      : null;
    const smsRecipients = recipientsSource?.sms
      ? normalizeRecipients(
          recipientsSource.sms as Record<string, unknown>,
          fallback.recipients.global,
        )
      : null;
    const groupsSource = hasGroups
      ? (input.groups as Record<string, unknown>)
      : {};
    const groups = (Object.keys(NOTIFICATION_GROUPS) as NotificationGroupKey[]).reduce(
      (acc, groupKey) => {
        const groupInput =
          groupsSource && typeof groupsSource[groupKey] === 'object'
            ? (groupsSource[groupKey] as Record<string, unknown>)
            : null;
        const groupChannels = groupInput?.channels as
          | Record<string, unknown>
          | null
          | undefined;
        acc[groupKey] = {
          channels: {
            email: toBoolean(groupChannels?.email, channels.email),
            sms: toBoolean(groupChannels?.sms, channels.sms),
            whatsapp: toBoolean(groupChannels?.whatsapp, channels.whatsapp),
          },
        };
        return acc;
      },
      {} as Record<NotificationGroupKey, NotificationGroupSettings>,
    );
    return {
      channels,
      recipients: {
        global: globalRecipients,
        email: emailRecipients,
        whatsapp: whatsappRecipients,
        sms: smsRecipients,
      },
      groups,
      events,
    };
  }

  let mergedRecipients = fallback.recipients.global;
  const legacyEventsSource = eventsSource ?? {};
  for (const key of Object.keys(legacyEventsSource)) {
    if (typeof legacyEventsSource[key] !== 'object') {
      continue;
    }
    const recipients = normalizeRecipients(
      (legacyEventsSource[key] as Record<string, unknown>)
        ?.recipients as Record<string, unknown>,
      fallback.recipients.global,
    );
    mergedRecipients = mergeRecipients(mergedRecipients, recipients);
  }

  const groups = (Object.keys(NOTIFICATION_GROUPS) as NotificationGroupKey[]).reduce(
    (acc, groupKey) => {
      const groupEvents = NOTIFICATION_GROUPS[groupKey];
      const channelAggregate = {
        email: false,
        sms: false,
        whatsapp: false,
      };
      for (const eventKey of groupEvents) {
        const eventInput =
          eventsSource && typeof eventsSource[eventKey] === 'object'
            ? (eventsSource[eventKey] as Record<string, unknown>)
            : null;
        const channelsInput = eventInput?.channels as
          | Record<string, unknown>
          | null
          | undefined;
        channelAggregate.email ||= toBoolean(channelsInput?.email, channels.email);
        channelAggregate.sms ||= toBoolean(channelsInput?.sms, channels.sms);
        channelAggregate.whatsapp ||= toBoolean(
          channelsInput?.whatsapp,
          channels.whatsapp,
        );
      }
      acc[groupKey] = { channels: channelAggregate };
      return acc;
    },
    {} as Record<NotificationGroupKey, NotificationGroupSettings>,
  );

  return {
    channels,
    recipients: {
      global: mergedRecipients,
      email: null,
      whatsapp: null,
      sms: null,
    },
    groups,
    events,
  };
};
