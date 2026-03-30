export type PlatformNavItem = {
  path: string;
  labelKey: string;
  shortLabelKey: string;
  descriptionKey: string;
};

export const PLATFORM_NAV_ITEMS: readonly PlatformNavItem[] = [
  {
    path: 'overview',
    labelKey: 'navOverviewLabel',
    shortLabelKey: 'navOverviewShort',
    descriptionKey: 'navOverviewDescription',
  },
  {
    path: 'businesses',
    labelKey: 'navBusinessesLabel',
    shortLabelKey: 'navBusinessesShort',
    descriptionKey: 'navBusinessesDescription',
  },
  {
    path: 'operations',
    labelKey: 'navOperationsLabel',
    shortLabelKey: 'navOperationsShort',
    descriptionKey: 'navOperationsDescription',
  },
  {
    path: 'access',
    labelKey: 'navAccessLabel',
    shortLabelKey: 'navAccessShort',
    descriptionKey: 'navAccessDescription',
  },
  {
    path: 'announcements',
    labelKey: 'navAnnouncementsLabel',
    shortLabelKey: 'navAnnouncementsShort',
    descriptionKey: 'navAnnouncementsDescription',
  },
  {
    path: 'analytics',
    labelKey: 'navAnalyticsLabel',
    shortLabelKey: 'navAnalyticsShort',
    descriptionKey: 'navAnalyticsDescription',
  },
  {
    path: 'intelligence',
    labelKey: 'navIntelligenceLabel',
    shortLabelKey: 'navIntelligenceShort',
    descriptionKey: 'navIntelligenceDescription',
  },
];
