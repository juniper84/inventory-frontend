export type PlatformNavItem = {
  path: string;
  labelKey: string;
  shortLabelKey: string;
  descriptionKey: string;
};

export type PlatformShortcut = {
  key: string;
  labelKey: string;
  path: string;
};

export const PLATFORM_NAV_ITEMS: readonly PlatformNavItem[] = [
  {
    path: 'overview',
    labelKey: 'navOverviewLabel',
    shortLabelKey: 'navOverviewShort',
    descriptionKey: 'navOverviewDescription',
  },
  {
    path: 'health',
    labelKey: 'navHealthLabel',
    shortLabelKey: 'navHealthShort',
    descriptionKey: 'navHealthDescription',
  },
  {
    path: 'businesses',
    labelKey: 'navBusinessesLabel',
    shortLabelKey: 'navBusinessesShort',
    descriptionKey: 'navBusinessesDescription',
  },
  {
    path: 'support',
    labelKey: 'navSupportLabel',
    shortLabelKey: 'navSupportShort',
    descriptionKey: 'navSupportDescription',
  },
  {
    path: 'exports',
    labelKey: 'navExportsLabel',
    shortLabelKey: 'navExportsShort',
    descriptionKey: 'navExportsDescription',
  },
  {
    path: 'announcements',
    labelKey: 'navAnnouncementsLabel',
    shortLabelKey: 'navAnnouncementsShort',
    descriptionKey: 'navAnnouncementsDescription',
  },
  {
    path: 'audit',
    labelKey: 'navAuditLabel',
    shortLabelKey: 'navAuditShort',
    descriptionKey: 'navAuditDescription',
  },
  {
    path: 'incidents',
    labelKey: 'navIncidentsLabel',
    shortLabelKey: 'navIncidentsShort',
    descriptionKey: 'navIncidentsDescription',
  },
];

export const PLATFORM_SHORTCUTS: readonly PlatformShortcut[] = [
  { key: 'g o', labelKey: 'shortcutOverview', path: 'overview' },
  { key: 'g b', labelKey: 'shortcutBusinesses', path: 'businesses' },
  { key: 'g i', labelKey: 'shortcutIncidents', path: 'incidents' },
  { key: 'g a', labelKey: 'shortcutAudit', path: 'audit' },
];
